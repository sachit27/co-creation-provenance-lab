import { createHash, randomBytes } from 'node:crypto';
import { mkdirSync, readFileSync, readdirSync, renameSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { DEFAULT_SURVEY_ITEMS, newSurveyDefinition, validateSurveyItems } from './survey.ts';
import type { SurveyAnswer, SurveyDefinition, SurveyItem } from './survey.ts';
import type { AnalysisResult, AuditReviewDecision } from '../types';
import { buildReviewQueue } from '../services/auditReview.ts';

export type LiveStatus = 'waiting' | 'open' | 'closed' | 'published';
export interface LiveSubmission {
  id: string;
  tokenHash: string;
  text: string;
  submittedAt: string;
}
export interface PublishedAudit {
  versionId?: string;
  summaryDigest?: string;
  parentVersionId?: string | null;
  revisionNote?: string;
  summary: string;
  method: string;
  averageAlignment: number | null;
  gini: number | null;
  validCount: number;
  scores: Record<string, number | null>;
  matches?: Record<string, string | null>;
  participantThemes?: Record<string, { clusterId: number; label: string; size: number }>;
  themes?: Array<{ clusterId: number; label: string; size: number }>;
  /** Text-free display geometry for the participant-facing constellation. */
  constellation?: {
    projection: 'pca-2d';
    nodes: Array<{
      submissionId: string;
      x: number;
      y: number;
      alignment: number | null;
      comparable: boolean;
      clusterId: number | null;
      matchSentenceIndex: number | null;
    }>;
    similarityLinks: Array<{ sourceId: string; targetId: string; similarity: number }>;
    summarySentences: string[];
    groupingUsable: boolean;
  };
  analysisMetadata?: {
    runId?: string;
    softwareVersion?: string;
    summaryOrigin: string;
    requestedSummaryMethod: string;
    actualSummaryMethod: string;
    strategy: string;
    requestedGenerator?: { provider: string; model: string };
    actualGenerator?: { provider: string; model: string };
    requestedEmbedding: { provider: string; model: string };
    actualEmbedding: { provider: string; model: string };
    thresholds?: Record<string, number>;
  };
  /** Complete JSON-safe analysis output used for this publication version. */
  analysisRecord?: Record<string, unknown>;
  /** Facilitator-only, append-only snapshots of human review decisions. */
  reviewHistory?: Array<{ revision: number; savedAt: string; decisions: AuditReviewDecision[] }>;
  reviewRevision?: number;
  sourceRevision: number;
  publishedAt: string;
}
export interface LiveFeedback {
  submissionId: string;
  instrumentVersion: number;
  instrumentDigest: string;
  summaryVersionId: string;
  responses: Record<string, SurveyAnswer>;
  auditExposureBeforeResponse: 'summary_only' | 'metrics_shown';
  comment?: string;
  submittedAt: string;
}
export interface LiveEvent {
  sequence: number;
  type: 'session_created' | 'input_opened' | 'input_closed' | 'input_reopened' | 'submission_created' | 'submission_edited' | 'results_published' | 'results_revised' | 'survey_configured' | 'survey_opened' | 'survey_closed' | 'feedback_submitted' | 'feedback_updated';
  at: string;
  revision: number;
  submissionId?: string;
  contentDigest?: string;
}
export interface LiveSession {
  code: string;
  hostTokenHash: string;
  title: string;
  prompt: string;
  status: LiveStatus;
  revision: number;
  createdAt: string;
  submissions: LiveSubmission[];
  joinedTokenHashes: string[];
  events: LiveEvent[];
  feedback: LiveFeedback[];
  surveyEnabled: boolean;
  surveyDefinitions: SurveyDefinition[];
  publications: PublishedAudit[];
  published?: PublishedAudit;
}

const hash = (token: string) => createHash('sha256').update(token).digest('hex');
const token = () => randomBytes(32).toString('base64url');
const directory = path.resolve(process.env.LIVE_DATA_DIR || '.live-data');
const fileFor = (code: string) => path.join(directory, `${code}.json`);
const validCode = (code: string) => /^[A-Z2-9]{10}$/.test(code);

export class LiveError extends Error {
  status: number;
  constructor(message: string, status: number) { super(message); this.status = status; }
}

function save(session: LiveSession) {
  mkdirSync(directory, { recursive: true, mode: 0o700 });
  const destination = fileFor(session.code);
  const temporary = `${destination}.${process.pid}.tmp`;
  writeFileSync(temporary, JSON.stringify(session), { mode: 0o600 });
  renameSync(temporary, destination);
}

function addEvent(session: LiveSession, event: Omit<LiveEvent, 'sequence' | 'at' | 'revision'>) {
  session.events ||= [];
  session.events.push({ sequence: session.events.length + 1, at: new Date().toISOString(), revision: session.revision, ...event });
}

export function getSession(code: string): LiveSession {
  if (!validCode(code)) throw new LiveError('Session not found.', 404);
  try {
    const session = JSON.parse(readFileSync(fileFor(code), 'utf8')) as LiveSession;
    if (session.code !== code) throw new Error('Invalid session file');
    session.events ||= [];
    session.feedback ||= [];
    session.surveyEnabled ??= false;
    session.surveyDefinitions ||= [newSurveyDefinition(DEFAULT_SURVEY_ITEMS)];
    session.publications ||= session.published ? [session.published] : [];
    return session;
  } catch {
    throw new LiveError('Session not found.', 404);
  }
}

export function createSession(title: string, prompt: string) {
  const cleanTitle = title.trim();
  const cleanPrompt = prompt.trim();
  if (!cleanTitle || cleanTitle.length > 120 || !cleanPrompt || cleanPrompt.length > 500) {
    throw new LiveError('Add a title (up to 120 characters) and prompt (up to 500 characters).', 400);
  }
  const hostToken = token();
  let code: string;
  do { code = randomBytes(8).toString('base64url').toUpperCase().replace(/[^A-Z2-9]/g, '').slice(0, 10); }
  while (!validCode(code) || readdirSyncSafe().includes(`${code}.json`));
  const session: LiveSession = {
    code, hostTokenHash: hash(hostToken), title: cleanTitle, prompt: cleanPrompt,
    status: 'waiting', revision: 0, createdAt: new Date().toISOString(), submissions: [], joinedTokenHashes: [], events: [], feedback: [],
    surveyEnabled: false, surveyDefinitions: [newSurveyDefinition(DEFAULT_SURVEY_ITEMS)], publications: [],
  };
  addEvent(session, { type: 'session_created' });
  save(session);
  return { session, hostToken };
}

function readdirSyncSafe() {
  try { return readdirSync(directory); } catch { return []; }
}

export function isHost(session: LiveSession, supplied?: string) {
  return Boolean(supplied && hash(supplied) === session.hostTokenHash);
}

export function ownSubmission(session: LiveSession, supplied?: string) {
  return supplied ? session.submissions.find(s => s.tokenHash === hash(supplied)) : undefined;
}

export function joinSession(session: LiveSession) {
  if (session.status === 'published') throw new LiveError('This session has ended.', 409);
  if (session.joinedTokenHashes.length >= 250) throw new LiveError('This session is full.', 409);
  const participantToken = token();
  session.joinedTokenHashes.push(hash(participantToken));
  save(session);
  return { participantToken };
}

export function submit(session: LiveSession, supplied: string | undefined, text: string) {
  if (session.status !== 'open') throw new LiveError('Input is currently closed.', 409);
  if (!supplied || !session.joinedTokenHashes.includes(hash(supplied))) throw new LiveError('Join the session before submitting.', 401);
  const cleanText = text.trim();
  if (!cleanText || cleanText.length > 4000) throw new LiveError('Enter 1–4,000 characters.', 400);
  const existing = ownSubmission(session, supplied);
  if (!existing && session.submissions.length >= 200) throw new LiveError('This session has reached its 200 contribution limit.', 409);
  const submittedAt = new Date().toISOString();
  if (existing) { existing.text = cleanText; existing.submittedAt = submittedAt; }
  else session.submissions.push({ id: `P${String(session.submissions.length + 1).padStart(3, '0')}`, tokenHash: hash(supplied), text: cleanText, submittedAt });
  session.revision++;
  const saved = ownSubmission(session, supplied)!;
  addEvent(session, { type: existing ? 'submission_edited' : 'submission_created', submissionId: saved.id, contentDigest: hash(cleanText) });
  save(session);
  return saved;
}

export function changeStatus(session: LiveSession, hostToken: string | undefined, status: 'open' | 'closed') {
  if (!isHost(session, hostToken)) throw new LiveError('Facilitator access required.', 403);
  if (session.status === 'published') throw new LiveError('Published sessions cannot be reopened.', 409);
  if (status === 'closed' && session.status !== 'open') throw new LiveError('Open input before closing it.', 409);
  const previous = session.status;
  session.status = status;
  session.revision++;
  addEvent(session, { type: status === 'closed' ? 'input_closed' : previous === 'closed' ? 'input_reopened' : 'input_opened' });
  save(session);
}

export function publish(session: LiveSession, hostToken: string | undefined, input: Omit<PublishedAudit, 'publishedAt' | 'reviewHistory' | 'reviewRevision'>) {
  if (!isHost(session, hostToken)) throw new LiveError('Facilitator access required.', 403);
  if (session.status !== 'closed' && session.status !== 'published') throw new LiveError('Close input before publishing.', 409);
  if (input.sourceRevision !== session.revision) throw new LiveError('New input or a state change occurred. Run the audit again.', 409);
  if (!input.summary?.trim() || input.summary.length > 20000 || !input.method || input.method.length > 100) throw new LiveError('Invalid audit summary.', 400);
  if (Object.keys(input.scores || {}).length !== session.submissions.length ||
      session.submissions.some(s => !Object.hasOwn(input.scores, s.id))) throw new LiveError('Audit scores do not match the closed input snapshot.', 400);
  for (const score of Object.values(input.scores)) {
    if (score !== null && (typeof score !== 'number' || !Number.isFinite(score) || score < 0 || score > 1)) throw new LiveError('Invalid alignment score.', 400);
  }
  if (input.matches && (Object.keys(input.matches).length !== session.submissions.length ||
      session.submissions.some(s => !Object.hasOwn(input.matches!, s.id)) ||
      Object.values(input.matches).some(value => value !== null &&
        (typeof value !== 'string' || value.length > 1000 || !input.summary.includes(value))))) {
    throw new LiveError('Matched sentences do not match the closed input snapshot and summary.', 400);
  }
  if (input.participantThemes && (Object.keys(input.participantThemes).length !== session.submissions.length ||
      session.submissions.some(s => !Object.hasOwn(input.participantThemes!, s.id)))) {
    throw new LiveError('Theme assignments do not match the closed input snapshot.', 400);
  }
  for (const theme of input.themes || []) {
    if (!Number.isInteger(theme.clusterId) || !Number.isInteger(theme.size) || theme.size < 1 ||
        typeof theme.label !== 'string' || !theme.label.trim() || theme.label.length > 120) {
      throw new LiveError('Invalid theme overview.', 400);
    }
  }
  for (const value of [input.averageAlignment, input.gini]) {
    if (value !== null && (typeof value !== 'number' || !Number.isFinite(value) || value < 0 || value > 1)) throw new LiveError('Invalid aggregate measure.', 400);
  }
  if (!Number.isInteger(input.validCount) || input.validCount < 0 || input.validCount > session.submissions.length) throw new LiveError('Invalid valid-record count.', 400);
  if (input.analysisRecord !== undefined && (!input.analysisRecord || typeof input.analysisRecord !== 'object' || Array.isArray(input.analysisRecord))) {
    throw new LiveError('Invalid full analysis record.', 400);
  }
  if (input.constellation) {
    const ids = new Set(session.submissions.map(submission => submission.id));
    if (input.constellation.projection !== 'pca-2d' || input.constellation.nodes.length !== ids.size ||
        input.constellation.nodes.some(node => !ids.has(node.submissionId) || !Number.isFinite(node.x) || !Number.isFinite(node.y) ||
          (node.alignment !== null && (!Number.isFinite(node.alignment) || node.alignment < 0 || node.alignment > 1)) ||
          typeof node.comparable !== 'boolean' || (node.clusterId !== null && !Number.isInteger(node.clusterId)) ||
          (node.matchSentenceIndex !== null && (!Number.isInteger(node.matchSentenceIndex) || node.matchSentenceIndex < 0 || node.matchSentenceIndex >= input.constellation!.summarySentences.length))) ||
        new Set(input.constellation.nodes.map(node => node.submissionId)).size !== ids.size ||
        input.constellation.summarySentences.some(sentence => typeof sentence !== 'string' || !sentence.trim() || sentence.length > 2000) ||
        input.constellation.similarityLinks.some(link => !ids.has(link.sourceId) || !ids.has(link.targetId) || link.sourceId === link.targetId ||
          !Number.isFinite(link.similarity) || link.similarity < 0 || link.similarity > 1)) {
      throw new LiveError('Invalid constellation data.', 400);
    }
  }
  const prior = session.published;
  const summary = input.summary.trim();
  const summaryDigest = hash(summary);
  const versionId = `summary-v${(session.publications || []).length + 1}`;
  const publishedAt = new Date().toISOString();
  const decisions = validateReviewDecisions(input.analysisRecord?.reviewDecisions || [], publishedAt);
  if (decisions.length) validateReviewIssueIds(input.analysisRecord!, decisions);
  session.published = {
    ...input, summary, summaryDigest, versionId, parentVersionId: prior?.versionId || null, publishedAt,
    ...(input.analysisRecord ? { analysisRecord: { ...input.analysisRecord, reviewDecisions: decisions } } : {}),
    reviewRevision: 0, reviewHistory: [{ revision: 0, savedAt: publishedAt, decisions }],
  };
  session.publications ||= [];
  session.publications.push(session.published);
  session.status = 'published';
  session.revision++;
  addEvent(session, { type: prior ? 'results_revised' : 'results_published', contentDigest: summaryDigest });
  save(session);
}

function validateReviewDecisions(input: unknown, updatedAt: string, previous: AuditReviewDecision[] = []): AuditReviewDecision[] {
  if (!Array.isArray(input) || input.length > 2000) throw new LiveError('Invalid review decisions.', 400);
  const ids = new Set<string>();
  return input.map(value => {
    if (!value || typeof value !== 'object' || typeof value.issueId !== 'string' ||
        !value.issueId.trim() || value.issueId.length > 500 || ids.has(value.issueId) ||
        !['unresolved', 'confirmed', 'dismissed'].includes(value.status) ||
        typeof value.note !== 'string' || value.note.length > 4000) {
      throw new LiveError('Invalid review decision. Use a unique issue, valid status, and a note up to 4,000 characters.', 400);
    }
    ids.add(value.issueId);
    const old = previous.find(decision => decision.issueId === value.issueId);
    return { issueId: value.issueId, status: value.status, note: value.note,
      updatedAt: old?.status === value.status && old.note === value.note ? old.updatedAt : updatedAt };
  });
}

function validateReviewIssueIds(record: Record<string, unknown>, decisions: AuditReviewDecision[]) {
  let allowed: Set<string>;
  try {
    if (!record.config || !Array.isArray(record.participants) || !Array.isArray(record.summarySentences)) throw new Error('Missing full audit');
    allowed = new Set(buildReviewQueue(record as unknown as AnalysisResult).map(issue => issue.id));
  } catch { throw new LiveError('The published full audit cannot be reviewed.', 400); }
  if (decisions.some(decision => !allowed.has(decision.issueId))) throw new LiveError('Review decisions must refer to issues in this published audit.', 400);
}

export function saveReviewDecisions(session: LiveSession, hostToken: string | undefined, input: {
  versionId?: unknown; publishedAt?: unknown; reviewRevision?: unknown; decisions?: unknown;
}) {
  if (!isHost(session, hostToken)) throw new LiveError('Facilitator access required.', 403);
  const publication = session.published;
  if (session.status !== 'published' || !publication?.analysisRecord) throw new LiveError('A published full audit is required before saving review notes.', 409);
  if (input.versionId !== publication.versionId || input.publishedAt !== publication.publishedAt) {
    throw new LiveError('A newer summary has been published. Review the current version before saving.', 409);
  }
  const revision = publication.reviewRevision || 0;
  if (input.reviewRevision !== revision) throw new LiveError('Review notes changed in another tab. Reload the current notes before saving.', 409);
  const savedAt = new Date().toISOString();
  const previous = (publication.analysisRecord.reviewDecisions || []) as AuditReviewDecision[];
  const decisions = validateReviewDecisions(input.decisions, savedAt, previous);
  validateReviewIssueIds(publication.analysisRecord, decisions);
  const index = session.publications.findIndex(item => item.versionId === publication.versionId && item.publishedAt === publication.publishedAt);
  if (index < 0) throw new LiveError('Published audit history is unavailable.', 409);
  // Update only human annotations; the audited summary and computed measures remain intact.
  publication.analysisRecord = { ...publication.analysisRecord, reviewDecisions: decisions };
  publication.reviewRevision = revision + 1;
  publication.reviewHistory ||= [{ revision: 0, savedAt: publication.publishedAt, decisions: previous }];
  publication.reviewHistory.push({ revision: publication.reviewRevision, savedAt, decisions });
  session.publications[index] = publication;
  save(session);
  return decisions;
}

const specialAnswers = new Set<SurveyAnswer>(['cannot_judge', 'not_applicable', 'prefer_not_to_answer']);

export function configureSurvey(session: LiveSession, hostToken: string | undefined, input: { enabled?: unknown; items?: unknown }) {
  if (!isHost(session, hostToken)) throw new LiveError('Facilitator access required.', 403);
  const enabled = input.enabled === true;
  const current = session.surveyDefinitions.at(-1) || newSurveyDefinition(DEFAULT_SURVEY_ITEMS);
  let definition = current;
  if (input.items !== undefined) {
    let items: SurveyItem[];
    try { items = validateSurveyItems(input.items); }
    catch (error) { throw new LiveError(error instanceof Error ? error.message : 'Invalid survey.', 400); }
    const candidate = newSurveyDefinition(items, current.version + 1);
    if (candidate.digest !== current.digest) {
      session.surveyDefinitions.push(candidate);
      definition = candidate;
      addEvent(session, { type: 'survey_configured', contentDigest: candidate.digest });
    }
  }
  if (enabled !== session.surveyEnabled) addEvent(session, { type: enabled ? 'survey_opened' : 'survey_closed', contentDigest: definition.digest });
  session.surveyEnabled = enabled;
  save(session);
  return definition;
}

export function submitFeedback(session: LiveSession, supplied: string | undefined, input: { responses?: unknown; comment?: unknown; auditExposureBeforeResponse?: unknown }) {
  if (session.status !== 'published') throw new LiveError('Feedback opens after results are published.', 409);
  if (!session.surveyEnabled) throw new LiveError('The facilitator has not opened the survey.', 409);
  const own = ownSubmission(session, supplied);
  if (!own) throw new LiveError('A submitted contribution is required before giving feedback.', 401);
  if (!input.responses || typeof input.responses !== 'object' || Array.isArray(input.responses)) throw new LiveError('Invalid feedback responses.', 400);
  const definition = session.surveyDefinitions.at(-1)!;
  const allowed = new Set(definition.items.map(item => item.id));
  const responses: Record<string, SurveyAnswer> = {};
  for (const [key, value] of Object.entries(input.responses as Record<string, unknown>)) {
    if (!allowed.has(key)) throw new LiveError('Unknown feedback item.', 400);
    if (!(Number.isInteger(value) && Number(value) >= 1 && Number(value) <= 5) && !specialAnswers.has(value as SurveyAnswer)) {
      throw new LiveError('Feedback answers must use the displayed scale.', 400);
    }
    responses[key] = value as SurveyAnswer;
  }
  const comment = typeof input.comment === 'string' ? input.comment.trim() : '';
  if (comment.length > 2000) throw new LiveError('Feedback comment must be 2,000 characters or fewer.', 400);
  if (!Object.keys(responses).length && !comment) throw new LiveError('Answer at least one item or add a comment.', 400);
  const unchangedCoverage = definition.items.some(item => item.id === 'coverage' && item.origin === 'built-in');
  if (unchangedCoverage && responses.coverage === 1) {
    responses.meaning = 'not_shown';
    responses.emphasis = 'not_shown';
  }
  const exposure = input.auditExposureBeforeResponse === 'metrics_shown'
    ? 'metrics_shown' : 'summary_only';
  session.feedback ||= [];
  const existingIndex = session.feedback.findIndex(item => item.submissionId === own.id && item.summaryVersionId === session.published!.versionId);
  const feedback: LiveFeedback = {
    submissionId: own.id, instrumentVersion: definition.version, instrumentDigest: definition.digest,
    summaryVersionId: session.published!.versionId!, responses, auditExposureBeforeResponse: exposure,
    ...(comment ? { comment } : {}), submittedAt: new Date().toISOString(),
  };
  if (existingIndex >= 0) session.feedback[existingIndex] = feedback;
  else session.feedback.push(feedback);
  addEvent(session, { type: existingIndex >= 0 ? 'feedback_updated' : 'feedback_submitted', submissionId: own.id });
  save(session);
  return feedback;
}

export function exportSession(session: LiveSession, hostToken: string | undefined) {
  if (!isHost(session, hostToken)) throw new LiveError('Facilitator access required.', 403);
  const events = session.events || [];
  const feedback = session.feedback || [];
  return {
    schemaVersion: 'live-session-export-v1',
    exportedAt: new Date().toISOString(),
    session: {
      code: session.code, title: session.title, prompt: session.prompt, createdAt: session.createdAt,
      finalStatus: session.status, revision: session.revision,
    },
    events,
    participants: session.submissions.map(submission => ({
      submissionId: submission.id,
      text: submission.text,
      submittedAt: submission.submittedAt,
      editCount: events.filter(event => event.submissionId === submission.id && event.type === 'submission_edited').length,
      alignmentScore: session.published?.scores[submission.id] ?? null,
      closestSummarySentence: session.published?.matches?.[submission.id] ?? null,
      theme: session.published?.participantThemes?.[submission.id] ?? null,
    })),
    publications: session.publications || [],
    currentPublication: session.published || null,
    participantFeedback: feedback,
    survey: {
      enabled: session.surveyEnabled,
      definitions: session.surveyDefinitions,
      scale: [1, 2, 3, 4, 5],
      nonNumericOptions: ['cannot_judge', 'not_applicable', 'prefer_not_to_answer', 'not_shown'],
      skipRule: 'When coverage is 1 (None), meaning and emphasis are stored as not_shown.',
      note: 'Built-in items are a pilot instrument. Facilitator-authored items have an unspecified construct. Items are reported separately.',
    },
    limitations: [
      'Submission IDs identify browser-tab contributions, not verified people.',
      'Similarity indicates semantic association and cannot establish agreement, authorship, satisfaction, or causal influence.',
      'Feedback is optional self-report and missing responses must not be treated as zero.',
      'This record is an unsigned export from the session server.',
    ],
  };
}

export function publicView(session: LiveSession, participantToken?: string, hostToken?: string) {
  const host = isHost(session, hostToken);
  const own = ownSubmission(session, participantToken);
  return {
    code: session.code, title: session.title, prompt: session.prompt, status: session.status,
    revision: session.revision, count: session.submissions.length, createdAt: session.createdAt,
    ...(host ? {
      submissions: session.submissions.map(({ id, text, submittedAt }) => ({ id, text, submittedAt })),
      feedbackCount: (session.feedback || []).filter(item => item.summaryVersionId === session.published?.versionId && item.instrumentDigest === session.surveyDefinitions.at(-1)?.digest).length,
      feedbackSummary: summarizeFeedback(session.feedback || [], session.surveyDefinitions.at(-1)!, session.published?.versionId),
      survey: { enabled: session.surveyEnabled, definition: session.surveyDefinitions.at(-1)! },
      publicationCount: (session.publications || []).length,
    } : {}),
    ...(own ? { own: { id: own.id, text: own.text, submittedAt: own.submittedAt } } : {}),
    ...(session.status === 'published' && session.published ? {
      result: {
        summary: session.published.summary, method: session.published.method,
        averageAlignment: session.published.averageAlignment, gini: session.published.gini,
        validCount: session.published.validCount, publishedAt: session.published.publishedAt,
        themes: (session.published.themes || []).filter(theme => theme.size >= 3),
        constellation: publicConstellation(session, own?.id, host),
        versionId: session.published.versionId,
        ...(host ? {
          analysisRecord: session.published.analysisRecord,
          reviewRevision: session.published.reviewRevision || 0,
          previousAnalysisRecord: session.publications.at(-2)?.analysisRecord,
        } : {}),
        survey: session.surveyEnabled ? { enabled: true, definition: session.surveyDefinitions.at(-1)! } : { enabled: false },
        ...(own ? { ownAlignment: session.published.scores[own.id] ?? null,
          ownMatch: session.published.matches?.[own.id] ?? null,
          ownTheme: (session.published.participantThemes?.[own.id]?.size || 0) >= 3
            ? session.published.participantThemes?.[own.id] : null,
          ownFeedback: (session.feedback || []).find(item => item.submissionId === own.id && item.summaryVersionId === session.published!.versionId && item.instrumentDigest === session.surveyDefinitions.at(-1)?.digest) || null } : {}),
      },
    } : {}),
  };
}

/**
 * Removes source text and internal submission identifiers from the shared map.
 * Groups smaller than three are suppressed to reduce singling-out risk.
 */
function publicConstellation(session: LiveSession, ownId?: string, revealInternalIds = false) {
  const constellation = session.published?.constellation;
  if (!constellation) return undefined;
  const publicId = new Map(session.submissions.map((submission, index) => [submission.id, `V${String(index + 1).padStart(3, '0')}`]));
  const clusterSizes = new Map<number, number>();
  constellation.nodes.forEach(node => {
    if (node.clusterId !== null) clusterSizes.set(node.clusterId, (clusterSizes.get(node.clusterId) || 0) + 1);
  });
  const prior = session.publications.length > 1 ? session.publications.at(-2)?.constellation : undefined;
  const priorAlignment = new Map((prior?.nodes || []).map(node => [node.submissionId, node.alignment]));
  return {
    projection: constellation.projection,
    projectionNote: 'Two-dimensional PCA is a display projection. Apparent distance can distort the original embedding space and does not establish agreement.',
    groupingUsable: constellation.groupingUsable,
    groupingNote: constellation.groupingUsable
      ? 'Colors show exploratory groups that passed the run’s internal stability checks; they are not social categories or ground truth.'
      : 'No grouping passed the run’s internal checks; points are shown as one continuous field.',
    summarySentences: constellation.summarySentences,
    nodes: constellation.nodes.map(node => ({
      id: revealInternalIds ? node.submissionId : publicId.get(node.submissionId),
      x: node.x, y: node.y, alignment: node.alignment, comparable: node.comparable,
      clusterId: constellation.groupingUsable && node.clusterId !== null && (clusterSizes.get(node.clusterId) || 0) >= 3 ? node.clusterId : null,
      matchSentenceIndex: node.matchSentenceIndex,
      isOwn: node.submissionId === ownId,
      previousAlignment: priorAlignment.get(node.submissionId) ?? null,
    })),
    similarityLinks: constellation.similarityLinks.map(link => ({
      sourceId: revealInternalIds ? link.sourceId : publicId.get(link.sourceId), targetId: revealInternalIds ? link.targetId : publicId.get(link.targetId), similarity: link.similarity,
    })),
    privacyNote: 'Contribution text and groups with fewer than three contributions are not shown in the shared map.',
  };
}

function summarizeFeedback(feedback: LiveFeedback[], definition: SurveyDefinition, summaryVersionId?: string) {
  return Object.fromEntries(definition.items.map(item => {
    const answers = feedback.filter(entry => entry.instrumentDigest === definition.digest && entry.summaryVersionId === summaryVersionId).map(entry => entry.responses[item.id]).filter(value => value !== undefined);
    const numeric = answers.filter((value): value is 1 | 2 | 3 | 4 | 5 => typeof value === 'number');
    const distribution = Object.fromEntries([1, 2, 3, 4, 5].map(value => [value, numeric.filter(answer => answer === value).length]));
    const missing = Object.fromEntries(['cannot_judge', 'not_applicable', 'prefer_not_to_answer', 'not_shown']
      .map(value => [value, answers.filter(answer => answer === value).length]));
    return [item.id, { validN: numeric.length, mean: numeric.length ? numeric.reduce((sum, value) => sum + value, 0) / numeric.length : null, distribution, missing }];
  }));
}
