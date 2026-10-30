import { writeFileSync } from 'node:fs';
import { runCoreAnalysis } from '../services/analysis';
import type { AnalysisConfig, AnalysisResult, ParticipantInput } from '../types';

const origin = process.env.SIMULATION_ORIGIN || 'http://127.0.0.1:5173';
const inputs: ParticipantInput[] = [
  ['P001', 'I support AI summaries if they reduce the backlog and every summary links to the original comments.'],
  ['P002', 'Student feedback often gets ignored because there is too much to read; AI could help staff notice recurring problems sooner.'],
  ['P003', 'I oppose using AI for complaints about discrimination. A model may flatten details that make a pattern visible.'],
  ['P004', 'Use AI only to sort comments into themes. A staff member should write the final summary and check the source comments.'],
  ['P005', 'Students who write in languages other than English need equal treatment; translation errors could erase their meaning.'],
  ['P006', 'I want an opt-out route where my comment is read by a person and is not sent to an AI provider.'],
  ['P007', 'Faster feedback analysis could help fix broken course registration before the next term.'],
  ['P008', 'A single summary can make a small but urgent group look unimportant. Show how many comments support each theme.'],
  ['P009', 'I am cautiously supportive, but the university must publish the tool, limits, and examples of mistakes before using it.'],
  ['P010', 'Do not use sentiment scores to label students as angry or unreasonable. Let us challenge a summary that misrepresents us.'],
  ['P011', 'AI can help identify repeated issues, but it must not decide which issues deserve action or funding.'],
  ['P012', 'I oppose uploading student comments to a commercial service unless the university explains retention and prevents model training on them.'],
  ['P013', 'Accessibility matters: students using speech-to-text or assistive technology should not be penalized for unusual wording.'],
  ['P014', 'Let a student panel review draft themes and flag missing or distorted points before administrators see the final report.'],
  ['P015', 'We need results back. If students contribute and never learn what changed, the process is not meaningful.'],
  ['P016', 'I support a limited pilot for routine course feedback, with a human audit and a clear stop rule if errors appear.'],
  ['P017', 'Some comments describe one-off emergencies. They may not recur often, but still need a direct escalation path.'],
  ['P018', 'Publish anonymized comments and the summary together so readers can judge whether the synthesis is fair.'],
  ['P019', 'Keep names, student numbers, and identifying details out of prompts and exports; small departments can make people identifiable anyway.'],
  ['P020', 'I would rather wait longer for a human review than receive a fast summary that hides disagreement or uncertainty.'],
].map(([id, text]) => ({ id, text }));

const request = async <T>(path: string, init: RequestInit = {}): Promise<T> => {
  const response = await fetch(`${origin}${path}`, init);
  const text = await response.text();
  const body = text ? JSON.parse(text) : {};
  if (!response.ok) throw new Error(`${path}: ${body.error || response.status}`);
  return body as T;
};
const json = { 'Content-Type': 'application/json' };
const analysisConfig: AnalysisConfig = {
  datasetName: 'Synthetic university AI feedback consultation', strategy: 'balanced',
  aiProvider: 'openai', model: 'gpt-4o-mini', embeddingProvider: 'tfidf', embeddingModel: 'tfidf',
  runLOO: true, summaryMethod: 'ai', wordLimit: 230,
};

function publicationPayload(result: AnalysisResult, sourceRevision: number, revisionNote?: string) {
  const valid = result.participants.filter(p => !p.embeddingFailed && !p.alignmentUnavailableReason && Number.isFinite(p.representationScore));
  const scores = Object.fromEntries(result.participants.map(p => [p.id, valid.includes(p) ? p.representationScore : null]));
  const matches = Object.fromEntries(result.participants.map(p => [p.id,
    !p.embeddingFailed && !p.alignmentUnavailableReason ? result.summarySentences[p.topSentenceMatchIndex] || null : null]));
  const usable = result.clusteringDiagnostics?.usableForDownstream === true;
  const sizes = new Map<number, number>(); result.participants.forEach(p => sizes.set(p.clusterId, (sizes.get(p.clusterId) || 0) + 1));
  const themes = usable ? result.clusters.map(c => ({ clusterId: c.id, label: c.label, size: sizes.get(c.id) || 0 })).filter(t => t.size) : [];
  const participantThemes = usable ? Object.fromEntries(result.participants.map(p => [p.id, themes.find(t => t.clusterId === p.clusterId)])) : undefined;
  return {
    summary: result.summary,
    method: `${result.runManifest?.actualSummaryMethod || result.config.summaryMethod} summary · ${result.embeddingTierUsed || result.config.embeddingProvider} alignment`,
    averageAlignment: valid.length ? valid.reduce((sum, p) => sum + p.representationScore, 0) / valid.length : null,
    gini: valid.length ? result.metrics.giniCoefficient : null,
    validCount: valid.length, scores, matches, themes, participantThemes, sourceRevision, revisionNote,
    analysisMetadata: {
      runId: result.runManifest?.runId, softwareVersion: result.runManifest?.softwareVersion,
      summaryOrigin: result.config.summaryProvenance?.origin || 'generated-in-run',
      requestedSummaryMethod: result.runManifest?.requestedSummaryMethod || result.config.summaryMethod,
      actualSummaryMethod: result.runManifest?.actualSummaryMethod || result.config.summaryMethod,
      strategy: result.config.strategy, requestedGenerator: result.runManifest?.requestedGenerator,
      actualGenerator: result.runManifest?.actualGenerator,
      requestedEmbedding: result.runManifest?.requestedEmbedding || { provider: 'tfidf', model: 'tfidf' },
      actualEmbedding: result.runManifest?.actualEmbedding || { provider: 'tfidf', model: 'tfidf' },
      thresholds: result.config.thresholds,
    },
    analysisRecord: result,
  };
}

const created = await request<any>('/api/live/sessions', { method: 'POST', headers: json, body: JSON.stringify({
  title: 'Synthetic AI feedback consultation', prompt: 'Should the university use AI to summarize student feedback, and under what conditions?',
}) });
const code = created.code as string;
const hostHeaders = { ...json, Authorization: `Bearer ${created.hostToken}` };
await request(`/api/live/sessions/${code}/status`, { method: 'POST', headers: hostHeaders, body: JSON.stringify({ status: 'open' }) });
const tokens: string[] = [];
for (const input of inputs) {
  const joined = await request<any>(`/api/live/sessions/${code}/join`, { method: 'POST' });
  tokens.push(joined.participantToken);
  await request(`/api/live/sessions/${code}/submission`, { method: 'PUT', headers: { ...json, 'X-Participant-Token': joined.participantToken }, body: JSON.stringify({ text: input.text }) });
}
await request(`/api/live/sessions/${code}/submission`, { method: 'PUT', headers: { ...json, 'X-Participant-Token': tokens[19] }, body: JSON.stringify({ text: `${inputs[19].text} Any publication should explicitly preserve that disagreement.` }) });
await request(`/api/live/sessions/${code}/status`, { method: 'POST', headers: hostHeaders, body: JSON.stringify({ status: 'closed' }) });
let hostView = await request<any>(`/api/live/sessions/${code}`, { headers: hostHeaders });
const initial = await runCoreAnalysis(inputs.map((input, index) => index === 19 ? ({ ...input, text: `${input.text} Any publication should explicitly preserve that disagreement.` }) : input), analysisConfig, message => console.log(`[analysis] ${message}`));
await request(`/api/live/sessions/${code}/publish`, { method: 'POST', headers: hostHeaders, body: JSON.stringify(publicationPayload(initial, hostView.revision)) });

const publicBeforeSurvey = await request<any>(`/api/live/sessions/${code}`);
if (publicBeforeSurvey.result?.survey?.enabled) throw new Error('Survey was visible before facilitator activation.');
const customItems = [
  ...hostView.survey.definition.items,
  { id: 'trust_next_round', prompt: 'How comfortable would you be taking part in another session using this process?', anchors: ['Not at all', 'Slightly', 'Somewhat', 'Very', 'Completely'], origin: 'custom', construct: 'facilitator-defined-unspecified' },
];
await request(`/api/live/sessions/${code}/survey`, { method: 'PUT', headers: hostHeaders, body: JSON.stringify({ enabled: true, items: customItems }) });
for (let index = 0; index < 15; index++) {
  const low = [2, 5, 7, 11, 16, 19].includes(index);
  const responses = { coverage: low ? 2 : 4 + (index % 2), meaning: low ? 2 : 4, emphasis: low ? 2 : 4, voice: 4, fairness: low ? 2 : 4, understanding: 3 + (index % 3), trust_next_round: low ? 2 : 4 };
  await request(`/api/live/sessions/${code}/feedback`, { method: 'PUT', headers: { ...json, 'X-Participant-Token': tokens[index] }, body: JSON.stringify({ responses, comment: low ? 'The summary needs a clearer statement of opposition and urgent exceptions.' : '', auditExposureBeforeResponse: 'summary_only' }) });
}

const revisionSentence = 'Several participants explicitly opposed AI use for discrimination complaints or commercial-provider uploads and preferred slower human review, while rare emergencies were said to require a direct escalation path even when they do not form a recurring theme.';
const revisedText = initial.summary.includes('discrimination complaints') && initial.summary.includes('direct escalation') ? `${initial.summary}\n\nThe facilitator retained these disagreements as explicit decision constraints.` : `${initial.summary}\n\n${revisionSentence}`;
hostView = await request<any>(`/api/live/sessions/${code}`, { headers: hostHeaders });
const revised = await runCoreAnalysis(inputs.map((input, index) => index === 19 ? ({ ...input, text: `${input.text} Any publication should explicitly preserve that disagreement.` }) : input), {
  ...analysisConfig, summaryMethod: 'manual', manualSummaryText: revisedText,
  summaryProvenance: { origin: 'human-authored', notes: 'Facilitator revision after reviewing low-coverage feedback.' },
}, message => console.log(`[revision] ${message}`));
await request(`/api/live/sessions/${code}/publish`, { method: 'POST', headers: hostHeaders, body: JSON.stringify(publicationPayload(revised, hostView.revision, 'Made explicit the opposed uses, slower-human-review preference, and direct escalation for rare emergencies.')) });

for (let index = 0; index < 15; index++) {
  const responses = { coverage: index % 5 === 0 ? 4 : 5, meaning: 4, emphasis: 4, voice: 4, fairness: 4, understanding: 4, trust_next_round: 4 };
  await request(`/api/live/sessions/${code}/feedback`, { method: 'PUT', headers: { ...json, 'X-Participant-Token': tokens[index] }, body: JSON.stringify({ responses, comment: index === 2 ? 'The explicit opposition is now visible.' : '', auditExposureBeforeResponse: 'summary_only' }) });
}

const exported = await request<any>(`/api/live/sessions/${code}/export`, { headers: hostHeaders });
const ownView = await request<any>(`/api/live/sessions/${code}`, { headers: { 'X-Participant-Token': tokens[2] } });
const otherView = await request<any>(`/api/live/sessions/${code}`, { headers: { 'X-Participant-Token': tokens[3] } });
const serialized = JSON.stringify(exported);
const checks = {
  participantCount: exported.participants.length === 20,
  stableIds: exported.participants.every((p: any, i: number) => p.submissionId === `P${String(i + 1).padStart(3, '0')}`),
  publicationVersions: exported.publications.length === 2,
  fullAnalysisRecords: exported.publications.every((p: any) => p.analysisRecord?.participants?.length === 20),
  revisionLineage: exported.publications[1].parentVersionId === exported.publications[0].versionId,
  customizedSurvey: exported.survey.definitions.at(-1).items.some((item: any) => item.id === 'trust_next_round'),
  feedbackBoundToVersions: new Set(exported.participantFeedback.map((item: any) => item.summaryVersionId)).size === 2,
  finalFeedbackCount: exported.participantFeedback.filter((item: any) => item.summaryVersionId === exported.currentPublication.versionId).length === 15,
  noSecrets: !serialized.includes('tokenHash') && !serialized.includes(created.hostToken) && !tokens.some(token => serialized.includes(token)) && !serialized.includes(process.env.OPENAI_API_KEY || '__missing__'),
  publicPrivacy: !publicBeforeSurvey.submissions && publicBeforeSurvey.result?.ownAlignment === undefined,
  participantPrivacy: ownView.own.id === 'P003' && !ownView.submissions && ownView.result.ownFeedback.submissionId === 'P003' && otherView.result.ownFeedback.submissionId === 'P004',
  modelUsed: exported.publications[0].analysisMetadata.actualGenerator?.model?.includes('gpt-4o-mini') || exported.publications[0].analysisMetadata.requestedGenerator?.model === 'gpt-4o-mini',
};
if (Object.values(checks).some(value => !value)) throw new Error(`Simulation checks failed: ${JSON.stringify(checks)}`);
const output = { code, hostToken: created.hostToken, participantToken: tokens[2], initialSummary: initial.summary, revisedSummary: revised.summary, checks, export: exported };
const outputPath = `.live-data/simulation-${code}-report.json`;
writeFileSync(outputPath, JSON.stringify(output, null, 2), { mode: 0o600 });
console.log(JSON.stringify({ code, outputPath, initialAverageAlignment: exported.publications[0].averageAlignment, revisedAverageAlignment: exported.publications[1].averageAlignment, checks }, null, 2));
