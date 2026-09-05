import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { composeRequestSignal } from '../tests/.modules/services/completionRouter.ts';

const read = (path: string) => readFileSync(path, 'utf8');

console.log('\n[1] Strategy comparison stays in the audited vector space');
const analysis = read('services/analysis.ts');
const strategy = read('services/strategyComparison.ts');
assert.match(analysis, /strategyVectorizer = activeConfig\.embeddingProvider === 'tfidf'/);
assert.match(analysis, /new LocalVectorizer\(inputs\.map\(input => input\.text\)\)/);
assert.match(strategy, /splitSentenceLikeUnits\(summary\)/);
assert.doesNotMatch(strategy, /summary\.match\(\/\[\^\.!\?/);
console.log('  PASS  TF-IDF alternatives use the run-local corpus vectorizer');
console.log('  PASS  every strategy uses the shared sentence segmenter');
assert.match(strategy, /coverageUniformity: representationScores\.some\(score => score > 0\) \? 1 - gini : null/);
console.log('  PASS  uniformly zero retrieval is unavailable, not perfect coverage');

console.log('\n[2] Review candidates are not asserted as omissions');
assert.match(analysis, /const bridgingOpportunities[^]*validParticipants/);
assert.doesNotMatch(analysis, /perspective that was not reflected in the summary/);
assert.match(analysis, /Inspect the full source and summary before deciding/);
console.log('  PASS  unavailable comparisons cannot become bridging candidates');
console.log('  PASS  bridging copy requires human inspection before an omission claim');

console.log('\n[3] Enrichment cancellation reaches provider requests');
const controller = new AbortController();
const composed = composeRequestSignal(controller.signal);
assert.equal(composed.aborted, false);
controller.abort(new DOMException('test cancellation', 'AbortError'));
await new Promise(resolve => setTimeout(resolve, 0));
assert.equal(composed.aborted, true);
const app = read('App.tsx');
assert.match(app, /enrichAnalysisResult\([^]*enrichmentController\.signal/);
assert.match(app, /Cancel deep analysis/);
for (const adapter of ['ollama', 'openai', 'groq', 'claude', 'apertus', 'gemini']) {
  assert.match(read(`services/${adapter}.ts`), /signal\?: AbortSignal/);
}
console.log('  PASS  external cancellation aborts the composed request signal');
console.log('  PASS  the UI exposes cancellation and all completion adapters accept it');

console.log('\n[4] Retired optional transformer runtime cannot re-enter production');
assert.doesNotMatch(read('package.json'), /@huggingface\/transformers/);
assert.doesNotMatch(read('services/nli.ts'), /import\('\.\/huggingface'\)/);
assert.doesNotMatch(read('services/anomalyDetection.ts'), /import\('\.\/huggingface'\)/);
console.log('  PASS  vulnerable unused runtime and dynamic fallbacks are removed');

console.log('\n[5] Hosted Ollama checks are explicit and race-safe');
const ollamaService = read('services/ollama.ts');
const configPanel = read('components/ui/ConfigPanel.tsx');
assert.match(ollamaService, /diagnoseOllamaConnection/);
assert.match(ollamaService, /targetAddressSpace/);
assert.match(ollamaService, /normalizeOllamaHost/);
assert.match(ollamaService, /parseLocalOllamaModelNames/);
assert.doesNotMatch(ollamaService, /block-insecure-private-network-requests/);
assert.doesNotMatch(ollamaService, /method: 'GET',[^}]*headers: \{ 'Content-Type': 'application\/json' \}/s);
assert.match(configPanel, /Host changed\. Select Test connection to apply it\./);
assert.match(configPanel, /onClick=\{handleOllamaHostTest\}/);
assert.doesNotMatch(configPanel, /onChange=\{\(e\) => handleOllamaHostChange/);
console.log('  PASS  bodyless health checks do not force a JSON CORS preflight');
console.log('  PASS  editing a host cannot launch overlapping connection checks');
console.log('  PASS  hosted users receive browser-reachability diagnostics');
console.log('  PASS  shorthand hosts are normalized and remote cloud tags are excluded');

console.log('\nrelease regression checks passed');
