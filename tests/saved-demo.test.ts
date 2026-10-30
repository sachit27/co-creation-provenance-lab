/** Saved demo must remain self-contained and its comparison must be real. */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { SAMPLE_DATA } from './.modules/constants.ts';
import { buildReviewQueue, compareSourceScores } from './.modules/services/auditReview.ts';
const baseline=JSON.parse(readFileSync('public/demo-result.json','utf8'));
const revised=JSON.parse(readFileSync('public/demo-revision.json','utf8'));
for(const result of [baseline,revised]) {
 assert.equal(result.participants.length,40);
 assert(SAMPLE_DATA.every(p=>result.participants.some(q=>q.id===p.id&&q.originalText===p.text)));
 assert.equal(result.config.model,'gpt-4o-mini');
 assert.equal(result.config.evaluatorModel,'gpt-4o-mini');
 assert.equal(result.enrichmentStatus,'complete');
 assert(Object.values(result.enrichmentStages).every((s:any)=>s.status==='complete'));
 assert.equal(result.runManifest.actualEmbedding.provider,'openai');
 assert.equal(result.runManifest.actualEmbedding.model,'text-embedding-3-small');
 assert.equal(result.inputEmbeddings,undefined);
 assert.equal((result.reviewDecisions??[]).length,0,'demo must not invent human decisions');
 assert.equal(result.languageFidelity.sourceMappings.length,result.languageFidelity.totalSourceUnitCount);
}
assert.equal(revised.revisionOfRunId,baseline.runManifest.runId);
assert.notEqual(revised.runManifest.runId,baseline.runManifest.runId);
assert.notEqual(revised.summary,baseline.summary);
assert.equal(revised.config.summaryProvenance.origin,'ai-assisted');
assert.equal(compareSourceScores(baseline,revised).changes.length,40);
assert(revised.revisionDraftCompletionCalls.length>0,'saved revision needs recorded drafting call');
if(baseline.tensionAnalysis.pairs.some(p=>p.summaryHandling==='unassessed')) assert(buildReviewQueue(baseline).some(issue=>issue.title==='Tension candidate needs verification'),'unassessed tensions must remain available for human verification');
console.log('Saved demo: exact source census, current methods, independent scored revision, source/model comparability, and honest review state passed.');
