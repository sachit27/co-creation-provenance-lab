import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

const folder = mkdtempSync(path.join(tmpdir(), 'provenance-live-test-'));
process.env.LIVE_DATA_DIR = folder;
const { configureSurvey, createSession, exportSession, getSession, publicView, joinSession, submit, submitFeedback, changeStatus, publish } = await import('../live/sessionStore.ts');

try {
  const { session, hostToken } = createSession('Workshop', 'What matters?');
  const code = session.code;
  const first = joinSession(session).participantToken;
  const second = joinSession(session).participantToken;
  changeStatus(session, hostToken, 'open');
  submit(session, first, 'Keep the shade trees.');
  submit(session, second, 'Keep the public square open.');
  submit(session, first, 'Keep the mature shade trees.');
  if (session.submissions.length !== 2) throw new Error('An edited response created a duplicate.');
  if (publicView(session).submissions || publicView(session).own) throw new Error('Public view exposed raw input.');
  if (publicView(session, first).own?.text !== 'Keep the mature shade trees.') throw new Error('Own response not restored.');
  if (publicView(session, first).submissions) throw new Error('Participant saw the facilitator roster.');
  if (publicView(session, undefined, hostToken).submissions?.length !== 2) throw new Error('Facilitator roster missing.');
  let rejected = false;
  try { submit(session, 'unissued-token-which-is-not-authorized', 'Spam'); } catch { rejected = true; }
  if (!rejected) throw new Error('Unissued token was accepted.');
  changeStatus(session, hostToken, 'closed');
  rejected = false;
  try { submit(session, first, 'Too late'); } catch { rejected = true; }
  if (!rejected) throw new Error('Submission after close was accepted.');
  const revision = session.revision;
  const scores = Object.fromEntries(session.submissions.map(s => [s.id, .5]));
  const matches = Object.fromEntries(session.submissions.map(s => [s.id, 'Both views matter.']));
  rejected = false;
  try { publish(session, hostToken, { summary: 'Both views matter.', method: 'manual · tfidf', averageAlignment: .5, gini: 0, validCount: 2, scores, sourceRevision: revision - 1 }); } catch { rejected = true; }
  if (!rejected) throw new Error('Stale audit was published.');
  const firstConstellation = {
    projection: 'pca-2d' as const,
    nodes: session.submissions.map((s, index) => ({ submissionId: s.id, x: index, y: -index, alignment: .5, comparable: true, clusterId: 0, matchSentenceIndex: 0 })),
    similarityLinks: [{ sourceId: 'P001', targetId: 'P002', similarity: .6 }],
    summarySentences: ['Both views matter.'], groupingUsable: true,
  };
  publish(session, hostToken, { summary: 'Both views matter.', method: 'manual · tfidf', averageAlignment: .5, gini: 0, validCount: 2, scores, matches, constellation: firstConstellation, sourceRevision: revision });
  if (publicView(session, first).result?.ownMatch !== 'Both views matter.' || publicView(session).result?.ownAlignment !== undefined || publicView(session).result?.ownMatch !== undefined) throw new Error('Published result privacy failed.');
  const participantConstellation = publicView(session, first).result?.constellation;
  const hostConstellation = publicView(session, undefined, hostToken).result?.constellation;
  if (participantConstellation?.nodes[0].id !== 'V001' || !participantConstellation.nodes[0].isOwn || participantConstellation.nodes[0].clusterId !== null) throw new Error('Participant constellation masking, ownership, or small-group suppression failed.');
  if (hostConstellation?.nodes[0].id !== 'P001' || JSON.stringify(participantConstellation).includes('submissionId')) throw new Error('Facilitator constellation labels or participant constellation privacy failed.');
  let surveyClosed = false;
  try { submitFeedback(session, first, { responses: { coverage: 5 } }); } catch { surveyClosed = true; }
  if (!surveyClosed) throw new Error('Feedback was accepted before the facilitator opened the survey.');
  configureSurvey(session, hostToken, { enabled: true });
  submitFeedback(session, first, { responses: { coverage: 1, meaning: 5, fairness: 4 }, comment: 'Add more detail.', auditExposureBeforeResponse: 'summary_only' });
  const feedback = publicView(session, first).result?.ownFeedback;
  if (feedback?.responses.meaning !== 'not_shown' || feedback.responses.fairness !== 4) throw new Error('Feedback skip logic failed.');
  if (publicView(session, second).result?.ownFeedback) throw new Error('Participant saw another participant feedback record.');
  if (publicView(session, undefined, hostToken).feedbackSummary?.fairness.validN !== 1) throw new Error('Facilitator feedback aggregate missing.');
  const previousSurveyDigest = publicView(session, undefined, hostToken).survey?.definition.digest;
  const editedItems = publicView(session, undefined, hostToken).survey!.definition.items.map((item: any) => item.id === 'fairness' ? { ...item, prompt: 'How fair was this process overall?' } : item);
  configureSurvey(session, hostToken, { enabled: false, items: editedItems });
  if (publicView(session, undefined, hostToken).survey?.definition.digest === previousSurveyDigest || publicView(session, first).result?.survey.enabled) throw new Error('Survey versioning or facilitator toggle failed.');
  const revisionSource = session.revision;
  const revisedConstellation = { ...firstConstellation, nodes: firstConstellation.nodes.map((node, index) => ({ ...node, alignment: index === 0 ? .7 : .5 })), summarySentences: ['Both views matter, and the public square must remain open.'] };
  publish(session, hostToken, { summary: 'Both views matter, and the public square must remain open.', method: 'manual · tfidf', averageAlignment: .6, gini: .1, validCount: 2, scores: { P001: .7, P002: .5 }, matches: { P001: 'Both views matter, and the public square must remain open.', P002: 'Both views matter, and the public square must remain open.' }, constellation: revisedConstellation, sourceRevision: revisionSource, revisionNote: 'Added the public-square constraint.', analysisRecord: { participants: [{ id: 'P001' }, { id: 'P002' }] } });
  if (session.publications.length !== 2 || session.publications[1].parentVersionId !== session.publications[0].versionId) throw new Error('Publication revision lineage failed.');
  if (publicView(session, first).result?.constellation?.nodes[0].previousAlignment !== .5) throw new Error('Constellation revision comparison failed.');
  let unauthorizedExport = false;
  try { exportSession(session, 'wrong-token'); } catch { unauthorizedExport = true; }
  if (!unauthorizedExport) throw new Error('Unauthorized session export succeeded.');
  const exported = exportSession(session, hostToken);
  if (JSON.stringify(exported).includes('tokenHash') || exported.participantFeedback.length !== 1 || exported.publications.length !== 2 || exported.survey.definitions.length !== 2) throw new Error('Session export privacy, revision, survey, or feedback failed.');
  if (getSession(code).status !== 'published') throw new Error('Published session was not persisted.');
  console.log('Live session state, authorization, privacy, snapshot and persistence checks passed.');
} finally {
  rmSync(folder, { recursive: true, force: true });
}
