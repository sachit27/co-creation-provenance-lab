import assert from 'node:assert/strict';
import { writeFileSync } from 'node:fs';
import { runCoreAnalysis } from '../services/analysis';
import { buildReviewQueue } from '../services/auditReview';
import { verifyOpenAIConnection } from '../services/openai';
import type { AnalysisConfig, AnalysisResult, ParticipantInput } from '../types';

const origin = process.env.SIMULATION_ORIGIN || 'http://127.0.0.1:5173';

console.log('=== [Step 0] Environment & OpenAI Connectivity Verification ===');
if (!process.env.OPENAI_API_KEY) {
  throw new Error('OPENAI_API_KEY is not defined in environment. Cannot proceed with gpt-4o-mini.');
}
console.log('  [PASS] OPENAI_API_KEY detected in environment.');

const isConnected = await verifyOpenAIConnection();
if (!isConnected) {
  throw new Error('Failed to verify connection to OpenAI API with the provided key.');
}
console.log('  [PASS] OpenAI API connectivity verified successfully.');

// Define 20 diverse realistic stakeholder contributions for a university AI policy consultation
const rawInputs: ParticipantInput[] = [
  { id: 'P001', text: 'I support AI summaries if they reduce administrative backlog and every summary links directly to the original student comments.' },
  { id: 'P002', text: 'Student feedback often gets ignored because department chairs have too much to read; AI could help staff notice recurring problems sooner.' },
  { id: 'P003', text: 'I strongly oppose using AI for complaints regarding discrimination or harassment. An automated model will flatten nuance and hide systemic patterns.' },
  { id: 'P004', text: 'Use AI only to sort comments into broad thematic buckets. A human staff member must write the final summary and read source comments.' },
  { id: 'P005', text: 'International students who write in English as a second language need equitable treatment; translation errors or stylistic bias must not erase their meaning.' },
  { id: 'P006', text: 'Students must have an explicit opt-out choice where their feedback is read exclusively by humans and never sent to third-party AI APIs.' },
  { id: 'P007', text: 'Faster feedback turnaround could help fix broken course registration or lab equipment before the next academic term starts.' },
  { id: 'P008', text: 'A single summary can make minority viewpoints look negligible. Every theme must show the exact comment count and support level.' },
  { id: 'P009', text: 'I am cautiously open to this, but the university must publish the full methodology, model limits, and past error audits before deploying it.' },
  { id: 'P010', text: 'Do not use automated sentiment analysis to categorize students as hostile or unreasonable. We must have a formal appeal route for mischaracterization.' },
  { id: 'P011', text: 'AI can assist in finding duplicates, but it must have zero authority over resource allocation, course cancelations, or faculty evaluations.' },
  { id: 'P012', text: 'I oppose uploading student feedback to commercial cloud services unless the university enforces data retention limits and prohibits model training.' },
  { id: 'P013', text: 'Accessibility accommodations: students using speech-to-text or assistive technologies should not be penalized or downweighted for atypical phrasing.' },
  { id: 'P014', text: 'Establish an independent student oversight committee to audit draft AI summaries and flag missing perspectives before leadership sees them.' },
  { id: 'P015', text: 'Closing the feedback loop is essential. If students contribute feedback and never hear what concrete policy changed, the entire exercise is performative.' },
  { id: 'P016', text: 'Support a bounded one-semester pilot for routine course evaluation, accompanied by strict human verification and predefined stop triggers.' },
  { id: 'P017', text: 'One-off safety emergencies must have an immediate escalation channel; they must not get buried as low-frequency outliers in a cluster map.' },
  { id: 'P018', text: 'Transparency is vital: publish raw anonymized submissions alongside the synthesis so the campus community can verify summary accuracy.' },
  { id: 'P019', text: 'Protect anonymity rigorously: remove student IDs, course numbers, and demographic clues from prompts so small cohorts cannot be de-anonymized.' },
  { id: 'P020', text: 'I prefer slower, manual human analysis over automated speed if AI synthesis dilutes genuine dissent or manufactured false consensus.' },
];

assert.equal(rawInputs.length, 20, 'Must have exactly 20 participants');

const request = async <T>(path: string, init: RequestInit = {}): Promise<T> => {
  const response = await fetch(`${origin}${path}`, init);
  const text = await response.text();
  const body = text ? JSON.parse(text) : {};
  if (!response.ok) throw new Error(`${path} failed (${response.status}): ${body.error || text}`);
  return body as T;
};
const jsonHeaders = { 'Content-Type': 'application/json' };

console.log('\n=== [Step 1] Creating Live Session ===');
const created = await request<any>('/api/live/sessions', {
  method: 'POST',
  headers: jsonHeaders,
  body: JSON.stringify({
    title: 'University Policy Deliberation: AI in Student Feedback',
    prompt: 'Should the university deploy AI tools to synthesize student feedback, and what guardrails must govern the process?',
  }),
});
const code = created.code as string;
const hostToken = created.hostToken as string;
assert(code && typeof code === 'string', 'Session code must be returned');
assert(hostToken && typeof hostToken === 'string', 'Host token must be returned');
const hostHeaders = { ...jsonHeaders, Authorization: `Bearer ${hostToken}` };

console.log(`  [PASS] Session created with code: ${code}`);

console.log('\n=== [Step 2] Session Status: Opening Input ===');
await request(`/api/live/sessions/${code}/status`, {
  method: 'POST',
  headers: hostHeaders,
  body: JSON.stringify({ status: 'open' }),
});
console.log('  [PASS] Session status set to open.');

console.log('\n=== [Step 3] 20 Scripted Participant Clients Joining & Submitting Input ===');
const participantTokens: string[] = [];
for (let i = 0; i < rawInputs.length; i++) {
  const joinRes = await request<any>(`/api/live/sessions/${code}/join`, { method: 'POST' });
  const pToken = joinRes.participantToken as string;
  assert(pToken, `Participant ${i + 1} must receive a join token`);
  participantTokens.push(pToken);

  await request(`/api/live/sessions/${code}/submission`, {
    method: 'PUT',
    headers: { ...jsonHeaders, 'X-Participant-Token': pToken },
    body: JSON.stringify({ text: rawInputs[i].text }),
  });
}
assert.equal(participantTokens.length, 20);
console.log(`  [PASS] All 20 scripted clients joined and submitted distinct responses.`);

console.log('\n=== [Step 4] Participant Edit & Deduplication Test ===');
// Participant 20 updates their response before closing
const updatedTextP20 = `${rawInputs[19].text} Any final policy report must document unresolved tensions explicitly.`;
await request(`/api/live/sessions/${code}/submission`, {
  method: 'PUT',
  headers: { ...jsonHeaders, 'X-Participant-Token': participantTokens[19] },
  body: JSON.stringify({ text: updatedTextP20 }),
});

let hostView = await request<any>(`/api/live/sessions/${code}`, { headers: hostHeaders });
assert.equal(hostView.count, 20, 'Updating a submission must not create duplicate submissions');
const storedP20 = hostView.submissions.find((s: any) => s.id === 'P020');
assert.equal(storedP20.text, updatedTextP20, 'Participant 20 submission text must be updated');
console.log('  [PASS] Participant edit successfully updated text without duplicating count.');

console.log('\n=== [Step 5] Closing Input & Boundary Rejection Checks ===');
await request(`/api/live/sessions/${code}/status`, {
  method: 'POST',
  headers: hostHeaders,
  body: JSON.stringify({ status: 'closed' }),
});

// Verify rejection of post-close submissions
let postCloseRejected = false;
try {
  await request(`/api/live/sessions/${code}/submission`, {
    method: 'PUT',
    headers: { ...jsonHeaders, 'X-Participant-Token': participantTokens[0] },
    body: JSON.stringify({ text: 'Attempting late submission after close' }),
  });
} catch {
  postCloseRejected = true;
}
assert(postCloseRejected, 'Submissions after close must be rejected');

// Verify rejection of unissued tokens
let unissuedRejected = false;
try {
  await request(`/api/live/sessions/${code}/submission`, {
    method: 'PUT',
    headers: { ...jsonHeaders, 'X-Participant-Token': 'unissued-fraudulent-token-12345' },
    body: JSON.stringify({ text: 'Unissued token spam' }),
  });
} catch {
  unissuedRejected = true;
}
assert(unissuedRejected, 'Unissued token submission must be rejected');
console.log('  [PASS] Closed-state and unissued-token rejection guards confirmed.');

console.log('\n=== [Step 6] Privacy Checks: Public & Participant View Isolation ===');
const publicView = await request<any>(`/api/live/sessions/${code}`);
assert(!publicView.submissions, 'Public view must NEVER leak raw submissions roster');
assert(publicView.status === 'closed', 'Public status must be closed');

const ownP3View = await request<any>(`/api/live/sessions/${code}`, {
  headers: { 'X-Participant-Token': participantTokens[2] },
});
assert.equal(ownP3View.own.id, 'P003', 'Participant 3 must see their own submission');
assert(!ownP3View.submissions, 'Participant 3 must NOT see submissions of other participants');
console.log('  [PASS] Privacy verified: public and participant views isolated.');

console.log('\n=== [Step 7] Generating AI Summary with gpt-4o-mini ===');
const analysisConfig: AnalysisConfig = {
  datasetName: 'University Policy Deliberation: AI in Student Feedback',
  strategy: 'balanced',
  aiProvider: 'openai',
  model: 'gpt-4o-mini',
  embeddingProvider: 'tfidf',
  embeddingModel: 'tfidf',
  runLOO: true,
  summaryMethod: 'ai',
  wordLimit: 250,
};

const finalInputs: ParticipantInput[] = rawInputs.map((item, idx) =>
  idx === 19 ? { ...item, text: updatedTextP20 } : item
);

const initialAnalysis = await runCoreAnalysis(finalInputs, analysisConfig, msg => {
  console.log(`    [analysis-progress] ${msg}`);
});

assert(initialAnalysis.summary && initialAnalysis.summary.length > 50, 'AI summary must be substantive');
assert(initialAnalysis.summarySentences.length >= 3, 'Must have multiple summary sentences');
assert.equal(initialAnalysis.runManifest?.actualGenerator?.provider, 'openai', 'Generator must be OpenAI');
assert(initialAnalysis.runManifest?.actualGenerator?.model?.includes('gpt-4o-mini'), 'Model must be gpt-4o-mini');
console.log(`  [PASS] AI summary generated successfully with gpt-4o-mini:`);
console.log(`    Summary length: ${initialAnalysis.summary.split(/\s+/).length} words, ${initialAnalysis.summarySentences.length} sentences`);
console.log(`    Summary excerpt: "${initialAnalysis.summary.slice(0, 140)}..."`);

console.log('\n=== [Step 8] Core Audit Analysis & Constellation Generation ===');
assert(Number.isFinite(initialAnalysis.metrics.giniCoefficient), 'Gini coefficient must be finite');
assert(Number.isFinite(initialAnalysis.metrics.distinctRepresentationGap), 'Distinct-record gap must be finite');
assert.equal(initialAnalysis.participants.length, 20, 'All 20 participants must be analyzed');

function buildPublicationPayload(result: AnalysisResult, sourceRevision: number, revisionNote?: string) {
  const valid = result.participants.filter(p => !p.embeddingFailed && !p.alignmentUnavailableReason && Number.isFinite(p.representationScore));
  const scores = Object.fromEntries(result.participants.map(p => [p.id, valid.includes(p) ? p.representationScore : null]));
  const matches = Object.fromEntries(result.participants.map(p => [
    p.id,
    !p.embeddingFailed && !p.alignmentUnavailableReason ? result.summarySentences[p.topSentenceMatchIndex] || null : null,
  ]));
  const usable = result.clusteringDiagnostics?.usableForDownstream === true;
  const sizes = new Map<number, number>();
  result.participants.forEach(p => sizes.set(p.clusterId, (sizes.get(p.clusterId) || 0) + 1));
  const themes = usable ? result.clusters.map(c => ({ clusterId: c.id, label: c.label, size: sizes.get(c.id) || 0 })).filter(t => t.size) : [];
  const participantThemes = usable ? Object.fromEntries(result.participants.map(p => [p.id, themes.find(t => t.clusterId === p.clusterId)])) : undefined;

  const constellation = {
    projection: 'pca-2d' as const,
    nodes: result.participants.map(p => ({
      submissionId: p.id,
      x: p.semanticCoords.x,
      y: p.semanticCoords.y,
      alignment: Number.isFinite(p.representationScore) ? p.representationScore : null,
      comparable: true,
      clusterId: usable ? p.clusterId : null,
      matchSentenceIndex: p.topSentenceMatchIndex,
    })),
    similarityLinks: (result.networkGraph?.edges || []).map(e => ({
      sourceId: e.source, targetId: e.target, similarity: e.weight,
    })),
    summarySentences: result.summarySentences,
    groupingUsable: usable,
  };

  return {
    summary: result.summary,
    method: `${result.runManifest?.actualSummaryMethod || result.config.summaryMethod} summary · ${result.embeddingTierUsed || result.config.embeddingProvider} alignment`,
    averageAlignment: valid.length ? valid.reduce((sum, p) => sum + p.representationScore, 0) / valid.length : null,
    gini: valid.length ? result.metrics.giniCoefficient : null,
    validCount: valid.length,
    scores,
    matches,
    themes,
    participantThemes,
    constellation,
    sourceRevision,
    revisionNote,
    analysisMetadata: {
      runId: result.runManifest?.runId,
      softwareVersion: result.runManifest?.softwareVersion,
      summaryOrigin: result.config.summaryProvenance?.origin || 'generated-in-run',
      requestedSummaryMethod: result.runManifest?.requestedSummaryMethod || result.config.summaryMethod,
      actualSummaryMethod: result.runManifest?.actualSummaryMethod || result.config.summaryMethod,
      strategy: result.config.strategy,
      requestedGenerator: result.runManifest?.requestedGenerator,
      actualGenerator: result.runManifest?.actualGenerator,
      requestedEmbedding: result.runManifest?.requestedEmbedding || { provider: 'tfidf', model: 'tfidf' },
      actualEmbedding: result.runManifest?.actualEmbedding || { provider: 'tfidf', model: 'tfidf' },
      thresholds: result.config.thresholds,
    },
    analysisRecord: result,
  };
}

console.log('\n=== [Step 9] Facilitator Publishing Initial Summary (Publication 1) ===');
hostView = await request<any>(`/api/live/sessions/${code}`, { headers: hostHeaders });
const pub1Payload = buildPublicationPayload(initialAnalysis, hostView.revision);

// Verify stale audit rejection:
let staleRejected = false;
try {
  await request(`/api/live/sessions/${code}/publish`, {
    method: 'POST',
    headers: hostHeaders,
    body: JSON.stringify({ ...pub1Payload, sourceRevision: hostView.revision - 1 }),
  });
} catch {
  staleRejected = true;
}
assert(staleRejected, 'Publishing with outdated sourceRevision must be rejected');

const pub1 = await request<any>(`/api/live/sessions/${code}/publish`, {
  method: 'POST',
  headers: hostHeaders,
  body: JSON.stringify(pub1Payload),
});
assert.equal(pub1.status, 'published');
assert(pub1.result.versionId, 'Publication must issue a versionId');
console.log(`  [PASS] Publication 1 issued (Version: ${pub1.result.versionId})`);

console.log('\n=== [Step 10] Checking Participant View on Published Summary ===');
const p1View = await request<any>(`/api/live/sessions/${code}`, {
  headers: { 'X-Participant-Token': participantTokens[0] },
});
assert(p1View.result.summary, 'Participant must see summary');
assert(p1View.result.ownAlignment !== undefined, 'Participant 1 must see own alignment');
assert(p1View.result.ownMatch !== undefined, 'Participant 1 must see own top sentence match');

// Check constellation masking on participant side
const pConstellation = p1View.result.constellation;
assert(pConstellation, 'Participant constellation must be present');
assert.equal(pConstellation.nodes[0].id, 'V001', 'Participant constellation must mask IDs as V001..');
assert(pConstellation.nodes[0].isOwn === true, 'Node 0 must be marked isOwn: true');
assert(pConstellation.nodes[1].isOwn === false, 'Other nodes must be marked isOwn: false');
assert(!JSON.stringify(pConstellation).includes('P001'), 'Participant constellation must NOT contain raw IDs');
console.log('  [PASS] Participant view and constellation privacy masking verified.');

console.log('\n=== [Step 11] Customizing & Opening Survey ===');
// Verify survey closed before facilitator opens it
let feedbackBeforeSurveyRejected = false;
try {
  await request(`/api/live/sessions/${code}/feedback`, {
    method: 'PUT',
    headers: { ...jsonHeaders, 'X-Participant-Token': participantTokens[0] },
    body: JSON.stringify({ responses: { coverage: 4 } }),
  });
} catch {
  feedbackBeforeSurveyRejected = true;
}
assert(feedbackBeforeSurveyRejected, 'Feedback before survey activation must be rejected');

// Add custom question to survey
const customSurveyItems = [
  ...hostView.survey.definition.items,
  {
    id: 'ai_oversight_trust',
    prompt: 'How confident are you that student concerns will be protected under this policy?',
    anchors: ['Not at all', 'Slightly', 'Somewhat', 'Very', 'Completely'],
    origin: 'custom',
    construct: 'facilitator-defined-unspecified',
  },
];
await request(`/api/live/sessions/${code}/survey`, {
  method: 'PUT',
  headers: hostHeaders,
  body: JSON.stringify({ enabled: true, items: customSurveyItems }),
});
console.log('  [PASS] Survey customized and enabled.');

console.log('\n=== [Step 12] Submitting 20 Predetermined Synthetic Survey Responses ===');
for (let i = 0; i < 20; i++) {
  // Simulate diverse responses: students with dissenting views on discrimination (P003, P006, P012, P020) rate coverage lower
  const isDissatisfied = [2, 5, 11, 19].includes(i);
  const coverageScore = isDissatisfied ? 1 : (i % 2 === 0 ? 4 : 5);
  const responses: Record<string, any> = {
    coverage: coverageScore,
    meaning: coverageScore === 1 ? 5 : 4, // Skip logic: if coverage=1 ('None'), meaning should be coerced to 'not_shown' by server
    emphasis: coverageScore === 1 ? 4 : 4,
    voice: isDissatisfied ? 3 : 5,
    fairness: isDissatisfied ? 2 : 4,
    understanding: 4,
    ai_oversight_trust: isDissatisfied ? 2 : 4,
  };
  const comment = isDissatisfied ? 'Summary failed to foreground explicit bans on discrimination complaints.' : '';

  await request(`/api/live/sessions/${code}/feedback`, {
    method: 'PUT',
    headers: { ...jsonHeaders, 'X-Participant-Token': participantTokens[i] },
    body: JSON.stringify({
      responses,
      comment,
      auditExposureBeforeResponse: i % 2 === 0 ? 'with_provenance' : 'summary_only',
    }),
  });
}

// Verify skip logic on P003 (who answered coverage=1)
const p3UpdatedView = await request<any>(`/api/live/sessions/${code}`, {
  headers: { 'X-Participant-Token': participantTokens[2] },
});
assert.equal(
  p3UpdatedView.result.ownFeedback.responses.meaning,
  'not_shown',
  'Meaning rating must be converted to not_shown when coverage is 1 (None)'
);
assert.equal(
  p3UpdatedView.result.ownFeedback.responses.emphasis,
  'not_shown',
  'Emphasis rating must be converted to not_shown when coverage is 1 (None)'
);
console.log('  [PASS] 20 survey responses collected; skip logic validated (meaning/emphasis -> not_shown).');

console.log('\n=== [Step 13] Facilitator Logging Audit Review Queue Decisions ===');
hostView = await request<any>(`/api/live/sessions/${code}`, { headers: hostHeaders });
assert.equal(hostView.feedbackCount, 20, 'Facilitator should see 20 feedback submissions');

const triageIssues = buildReviewQueue(initialAnalysis);
assert(triageIssues.length > 0, 'Analysis should identify issues for review in queue');
const targetIssue = triageIssues[0];
console.log(`  Identified triage issue in queue: "${targetIssue.id}" (${targetIssue.title})`);

await request(`/api/live/sessions/${code}/review`, {
  method: 'PUT',
  headers: hostHeaders,
  body: JSON.stringify({
    versionId: pub1.result.versionId,
    publishedAt: pub1.result.publishedAt,
    reviewRevision: 0,
    decisions: [
      {
        issueId: targetIssue.id,
        status: 'unresolved',
        note: `Review note: Flagged for facilitator inspection regarding "${targetIssue.title}".`,
      },
    ],
  }),
});
console.log('  [PASS] Facilitator review decision logged with valid triage issue.');

console.log('\n=== [Step 14] Facilitator Summary Revision & Re-publication (Publication 2) ===');
// P003 opposes this sensitive use; P017 separately asks for emergency escalation.
// The earlier test wording incorrectly turned P003's single view into a plural claim.
const revisionAddendum = 'One participant opposed AI use for discrimination and harassment complaints. A separate participant called for immediate escalation of one-off safety emergencies so they are not buried among low-frequency themes.';
const revisedSummaryText = `${initialAnalysis.summary.replace(
  /There is a consensus on the necessity of human oversight in the summarization process\./i,
  'Several contributions proposed distinct forms of human oversight, including a human-written final summary, student review of drafts, and an appeal route for mischaracterization.',
)}\n\n${revisionAddendum}`;

const revisedAnalysis = await runCoreAnalysis(finalInputs, {
  ...analysisConfig,
  summaryMethod: 'manual',
  manualSummaryText: revisedSummaryText,
  summaryProvenance: {
    origin: 'ai-assisted',
    notes: 'Scripted revision of an AI draft, correcting unsupported consensus wording and attributing P003/P017 positions separately.',
  },
}, msg => console.log(`    [revision-progress] ${msg}`));

hostView = await request<any>(`/api/live/sessions/${code}`, { headers: hostHeaders });
const pub2Payload = buildPublicationPayload(
  revisedAnalysis,
  hostView.revision,
  'Corrected unsupported agreement wording and stated P003/P017 positions separately.'
);

const pub2 = await request<any>(`/api/live/sessions/${code}/publish`, {
  method: 'POST',
  headers: hostHeaders,
  body: JSON.stringify(pub2Payload),
});
assert.equal(pub2.status, 'published');
assert(pub2.result.versionId !== pub1.result.versionId, 'Publication 2 must have distinct versionId');
console.log(`  [PASS] Publication 2 issued (Version: ${pub2.result.versionId})`);

console.log('\n=== [Step 15] Collecting Follow-Up Feedback on Revision ===');
// Participants submit feedback on the revised publication
for (let i = 0; i < 20; i++) {
  const responses: Record<string, any> = {
    coverage: [2, 5, 11, 19].includes(i) ? 4 : 5,
    meaning: 4,
    emphasis: 4,
    voice: 4,
    fairness: 4,
    understanding: 4,
    ai_oversight_trust: 4,
  };
  await request(`/api/live/sessions/${code}/feedback`, {
    method: 'PUT',
    headers: { ...jsonHeaders, 'X-Participant-Token': participantTokens[i] },
    body: JSON.stringify({
      responses,
      comment: i === 2 ? 'Scripted test response: the revised wording is more explicit.' : '',
      auditExposureBeforeResponse: 'summary_only',
    }),
  });
}
console.log('  [PASS] Post-revision feedback collected.');

console.log('\n=== [Step 16] Session Export & Zero-Leak Security Audit ===');
const exported = await request<any>(`/api/live/sessions/${code}/export`, { headers: hostHeaders });
const serializedExport = JSON.stringify(exported);

// Rigorous Verification Checks
assert.equal(exported.participants.length, 20, 'Export must include 20 participants');
assert.equal(exported.publications.length, 2, 'Export must document both publication versions');
assert.equal(
  exported.publications[1].parentVersionId,
  exported.publications[0].versionId,
  'Publication 2 parentVersionId must point to Publication 1 versionId'
);
assert.equal(
  new Set(exported.participantFeedback.map((f: any) => f.summaryVersionId)).size,
  2,
  'Feedback must be bound to distinct summaryVersionIds'
);

// Zero-Leak checks
assert(!serializedExport.includes('tokenHash'), 'Export must not leak tokenHash');
assert(!serializedExport.includes(hostToken), 'Export must not leak hostToken');
for (const token of participantTokens) {
  assert(!serializedExport.includes(token), `Export must not leak participant token: ${token}`);
}
assert(
  !serializedExport.includes(process.env.OPENAI_API_KEY!),
  'Export must never contain OPENAI_API_KEY'
);

const reportPath = `.live-data/live-test-20-agents-${code}.json`;
writeFileSync(reportPath, JSON.stringify({
  code,
  timestamp: new Date().toISOString(),
  generator: initialAnalysis.runManifest?.actualGenerator,
  publication1: {
    versionId: pub1.result.versionId,
    averageAlignment: exported.publications[0].averageAlignment,
    gini: exported.publications[0].gini,
  },
  publication2: {
    versionId: pub2.result.versionId,
    averageAlignment: exported.publications[1].averageAlignment,
    gini: exported.publications[1].gini,
  },
  feedbackCountTotal: exported.participantFeedback.length,
  verificationSummary: {
    twentyScriptedClientsSubmitted: true,
    openaiGpt4oMiniSummaryGenerated: true,
    publicAndOwnViewIsolationChecked: true,
    surveySkipLogicEnforced: true,
    revisionLineageDocumented: true,
    knownCredentialsAbsentFromExport: true,
  },
  testScope: {
    clients: 'One sequential script using 20 synthetic contribution records; no independent human agents or concurrent load.',
    analysis: 'Core scoring only. Later claim, language, tension, and knowledge-graph enrichment was not run.',
    feedback: 'Both waves use predetermined synthetic ratings. They are not evidence of participant satisfaction or improvement.',
    publication: 'The server checks publication structure and source revision, not truth of the summary.',
    comparison: 'The revised summary changes length. Alignment differences do not isolate the effect of the edit or prove meaning preservation.',
    privacy: 'The export scan checked known credentials. Pseudonymous IDs and published wording can still reveal information.',
  },
}, null, 2), { mode: 0o600 });

console.log(`\n======================================================`);
console.log(`ALL 16 SCRIPTED HTTP STEPS PASSED. Published wording still needs human evidence review.`);
console.log(`Audit report written to: ${reportPath}`);
console.log(`Session Code: ${code}`);
console.log(`Publication 1 (AI gpt-4o-mini) Alignment: ${exported.publications[0].averageAlignment.toFixed(3)}, Gini: ${exported.publications[0].gini.toFixed(3)}`);
console.log(`Publication 2 (Revised) Alignment: ${exported.publications[1].averageAlignment.toFixed(3)}, Gini: ${exported.publications[1].gini.toFixed(3)}`);
console.log(`======================================================\n`);
