import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { buildReviewQueue, compareSourceScores, saveReviewDecision, changedWords, wordDiffSegments, restoreReviewDecisions } from './.modules/services/auditReview.ts';
import { generateProvenanceRecord, verifyProvenanceRecordIntegrity } from './.modules/services/provenanceExport.ts';
import { generateReportData, generateReportHTML } from './.modules/services/reportExport.ts';

const fixture = JSON.parse(readFileSync('public/demo-result.json', 'utf8'));
const data = structuredClone(fixture);
data.config.thresholds = { matchingThreshold: 0.5 };
data.participants[0].representationScore = 0.1;
data.participants[1].representationScore = 0.1;
data.participants[1].embeddingFailed = true;
let issues = buildReviewQueue(data);
assert(issues.some(i => i.id === `alignment:${data.participants[0].id}`));
assert(!issues.some(i => i.id === `alignment:${data.participants[1].id}`), 'failed embeddings cannot become low-score findings');
data.languageFidelity = { methodVersion: 'language-transformation-v2-source-census', sourceMappings: [
 { participantId: data.participants[0].id, rawPhrase: data.participants[0].originalText, type: 'dropped', alignmentAssessed: false },
 { participantId: data.participants[0].id, rawPhrase: 'invented passage', type: 'dropped', alignmentAssessed: true },
] };
assert(!buildReviewQueue(data).some(i => i.kind === 'language'), 'unassessed or fabricated spans must not create omission suggestions');
data.languageFidelity.sourceMappings[0].alignmentAssessed = true;
assert(buildReviewQueue(data).some(i => i.kind === 'language'));
const revised = structuredClone(data);
revised.participants[0].representationScore = 0.4;
assert(compareSourceScores(data,revised).changes.some(p => Math.abs(p.change - 0.3) < 1e-8));
assert(!compareSourceScores(data,revised).changes.some(p => p.id === data.participants[1].id));
revised.runManifest.actualEmbedding.model = 'different-model';
assert.equal(compareSourceScores(data,revised).changes.length, 0);
revised.runManifest = structuredClone(data.runManifest);
revised.participants[0].originalText += ' changed source';
assert.equal(compareSourceScores(data,revised).comparable, false);
const note = { issueId: issues[0].id, status: 'confirmed' as const, note: '<script>alert(1)</script>', updatedAt: '2026-10-30T12:00:00Z' };
data.reviewDecisions = saveReviewDecision([],note);
data.reviewDecisions = saveReviewDecision(data.reviewDecisions, { ...note, status: 'unresolved' });
assert.equal(data.reviewDecisions.length,1);
assert.equal(restoreReviewDecisions(data, data).length, 1);
assert.throws(() => restoreReviewDecisions(data, { ...data, summary: 'different summary' }));
assert.throws(() => restoreReviewDecisions(data, { ...data, reviewDecisions: [{ ...note, issueId: 'fabricated' }] }));
const record = await generateProvenanceRecord(data);
assert.equal((record['cprov:humanReviewDecisions'] as unknown[]).length,1);
assert.equal((await verifyProvenanceRecordIntegrity(record)).valid,true);
record['cprov:humanReviewDecisions'] = [{ ...data.reviewDecisions[0], note: 'changed' }];
assert.equal((await verifyProvenanceRecordIntegrity(record)).valid,false,'review notes must be covered by integrity digest');
// Use intact fixture for report methods that require full assessment metadata.
fixture.reviewDecisions = data.reviewDecisions;
const html = generateReportHTML(generateReportData(fixture));
assert(html.includes('&lt;script&gt;') && !html.includes('<script>alert(1)</script>'));
for (const [a,b] of [['same','same'],['','new'],['old',''],['a b c','a x c']]) {
 const diff = changedWords(a,b);
 assert.equal(diff.before.start+diff.before.changed+diff.before.end,a);
 assert.equal(diff.after.start+diff.after.changed+diff.after.end,b);
}
const precise = wordDiffSegments('a x b y c', 'a X b Y c');
assert.equal(precise.detailed,true);
assert.equal(precise.before.map(s=>s.text).join(''),'a x b y c');
assert.equal(precise.after.map(s=>s.text).join(''),'a X b Y c');
assert(precise.before.some(s=>!s.changed&&s.text.includes('b')),'shared words between edits remain unhighlighted');
const bounded = wordDiffSegments('word '.repeat(2000),'different '.repeat(2000));
assert.equal(bounded.detailed,false);
assert.equal(bounded.before.map(s=>s.text).join(''),'word '.repeat(2000));
console.log('Audit review: evidence eligibility, paired comparisons, note integrity, escaped exports, wording reconstruction passed.');
