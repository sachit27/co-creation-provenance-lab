import { existsSync, readFileSync } from 'node:fs';

let pass = 0, fail = 0;
const check = (name: string, condition: boolean, detail = '') => {
  if (condition) { pass++; console.log(`  PASS  ${name}`); }
  else { fail++; console.log(`  FAIL  ${name} ${detail}`); }
};
const read = (path: string) => readFileSync(new URL(path, import.meta.url), 'utf8');

console.log('\n[1] Model-coded knowledge-graph extraction uses opaque, validated source IDs');
const graph = read('../services/graphRAG.ts');
check('source records are explicitly marked untrusted', graph.includes('UNTRUSTED SOURCE RECORDS (JSON Lines)'));
check('real IDs are mapped to per-batch opaque IDs', graph.includes('opaqueToParticipant.set(sourceId, inp.id)'));
check('returned IDs are allowlisted', graph.includes('opaqueToParticipant.has(e.sourceId)') && graph.includes('opaqueToParticipant.has(r.sourceId)'));
check('unknown outputs are not assigned to the first source', !graph.includes("e.participantId || inputs[0]") && !graph.includes("r.participantId || inputs[0]"));

console.log('\n[2] Unsupported causal-diagnosis UI is retired');
const root = new URL('../', import.meta.url);
check('bias-attribution service removed', !existsSync(new URL('services/biasAttribution.ts', root)));
check('bias-attribution badge removed', !existsSync(new URL('components/ui/BiasAttributionBadge.tsx', root)));
check('application no longer renders the retired feature', !read('../App.tsx').includes('BiasAttributionBadge'));

console.log('\n[3] Rhetoric screen uses one deterministic instrument');
const rhetoric = read('../services/rhetoricalAnalysis.ts');
check('no self-judging completion call remains', !rhetoric.includes('generateCompletion'));
check('arbitrary LLM/lexicon blend is gone', !rhetoric.includes('mergeRhetoricalProfiles') && !rhetoric.includes('70% LLM'));

console.log(`\n${fail === 0 ? 'ALL CHECKS PASSED' : 'FAILURES'} — passed ${pass}, failed ${fail}`);
process.exit(fail === 0 ? 0 : 1);
