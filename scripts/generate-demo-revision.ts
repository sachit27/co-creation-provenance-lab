/** Generate and fully audit a separately scored synthetic demo revision. */
import { readFile, writeFile } from 'node:fs/promises';
import type { AnalysisResult, CompletionMetadata } from '../types.ts';
class MemoryStorage {
  values = new Map<string,string>();
  getItem(key:string) { return this.values.get(key) ?? null; }
  setItem(key:string,value:string) { this.values.set(key,String(value)); }
  removeItem(key:string) { this.values.delete(key); }
  clear() { this.values.clear(); }
}
for(const name of ['sessionStorage','localStorage']) Object.defineProperty(globalThis,name,{value:new MemoryStorage(),configurable:true});
const baseline: AnalysisResult = JSON.parse(await readFile('tmp/demo-result.candidate.json','utf8'));
const [{generateRevisedSummary},{runAnalysis}] = await Promise.all([import('../services/summaryRevision.ts'),import('../services/analysis.ts')]);
const draftCalls: CompletionMetadata[] = [];
const draft = await generateRevisedSummary(baseline, { ...baseline.config, completionMetadataSink: call => draftCalls.push(call) }, {
 mode:'lowest-ranked', threshold:0.5, maxCandidates:40,
 instruction:'Preserve the original supported points while explicitly retaining the two competing proposals for community-garden land versus flood storage, and wildlife-location transparency versus sensitive-species protection. Avoid claiming consensus or general agreement where individual proposals are all the evidence available. Keep qualifiers, access needs, maintenance and accountability conditions. This is a synthetic demonstration; do not claim participants approved the revision.',
});
await writeFile('tmp/demo-revision-draft.json', JSON.stringify({ text:draft.text, candidateIds:draft.candidateIds, targetingNote:draft.targetingNote, completionCalls:draftCalls },null,2));
const result = await runAnalysis(baseline.participants.map(p=>({id:p.id,text:p.originalText,group:p.group})), {
 ...baseline.config, summaryMethod:'manual', manualSummaryText:draft.text,
 summaryProvenance:{origin:'ai-assisted',provider:'openai',model:draftCalls[0]?.returnedModel ?? 'gpt-4o-mini',generatedAt:new Date().toISOString(),notes:`Synthetic AI-assisted revision example; not participant-approved. ${draft.targetingNote}`},
 runStrategyComparison:false,
}, message=>console.log(`[revision] ${message}`));
const {inputEmbeddings: omitted,...portable} = result;
const revision = {...portable, revisionOfRunId:baseline.runManifest?.runId, revisionCandidateIds:draft.candidateIds, revisionDraftCompletionCalls:draftCalls};
await writeFile('tmp/demo-revision.candidate.json',JSON.stringify(revision,null,2)+'\n');
console.log(JSON.stringify({runId:result.runManifest?.runId,parentRunId:baseline.runManifest?.runId,enrichmentStatus:result.enrichmentStatus,summarySentences:result.summarySentences.length}));
