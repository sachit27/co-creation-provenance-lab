/**
 * Reproduce the bundled application demo with the same production analysis
 * pipeline used by the browser UI.
 *
 * The Ollama host and model choices are explicit environment inputs so a demo
 * artifact never depends on hidden browser state:
 *
 *   OLLAMA_HOST=http://127.0.0.1:11434 npm run demo:generate
 */

import { writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';

class MemoryStorage implements Storage {
  private readonly values = new Map<string, string>();

  get length(): number { return this.values.size; }
  clear(): void { this.values.clear(); }
  getItem(key: string): string | null { return this.values.get(key) ?? null; }
  key(index: number): string | null { return [...this.values.keys()][index] ?? null; }
  removeItem(key: string): void { this.values.delete(key); }
  setItem(key: string, value: string): void { this.values.set(key, String(value)); }
}

const installStorage = (name: 'localStorage' | 'sessionStorage'): Storage => {
  const existing = globalThis[name];
  if (existing) return existing;
  const storage = new MemoryStorage();
  Object.defineProperty(globalThis, name, { configurable: true, value: storage });
  return storage;
};

const session = installStorage('sessionStorage');
installStorage('localStorage');

const ollamaHost = (process.env.OLLAMA_HOST ?? 'http://127.0.0.1:11434').replace(/\/$/, '');
const generatorModel = process.env.DEMO_GENERATOR_MODEL ?? 'qwen2.5:14b';
const evaluatorModel = process.env.DEMO_EVALUATOR_MODEL ?? 'phi4:14b';
const embeddingModel = process.env.DEMO_EMBEDDING_MODEL ?? 'qwen3-embedding:8b';
const outputPath = resolve(process.env.DEMO_OUTPUT ?? 'public/demo-result.json');

session.setItem('cprov_ollama_host', ollamaHost);

const [{ SAMPLE_DATA, ANALYSIS_CONFIG }, { runAnalysis }] = await Promise.all([
  import('../constants.ts'),
  import('../services/analysis.ts'),
]);

const result = await runAnalysis(
  SAMPLE_DATA,
  {
    datasetName: 'Synthetic Citizen Science Deliberation',
    strategy: 'balanced',
    aiProvider: 'ollama',
    model: generatorModel,
    evaluatorModel,
    embeddingProvider: 'ollama',
    embeddingModel,
    runLOO: true,
    summaryMethod: 'ai',
    summaryProvenance: { origin: 'generated-in-run' },
    thresholds: { ...ANALYSIS_CONFIG.thresholds },
    wordLimit: 300,
    domainContext: 'Citizen feedback about the design and governance of a community science project.',
  },
  message => process.stdout.write(`[demo] ${message}\n`),
);

const failedStages = Object.entries(result.enrichmentStages ?? {})
  .filter(([, stage]) => stage?.status === 'failed')
  .map(([name]) => name);

process.stdout.write(JSON.stringify({
  outputPath,
  runId: result.runManifest?.runId,
  participantCount: result.participants.length,
  summarySentenceCount: result.summarySentences.length,
  embedding: result.runManifest?.actualEmbedding,
  generator: result.runManifest?.actualGenerator,
  evaluator: result.runManifest?.actualEvaluator,
  enrichmentStatus: result.enrichmentStatus,
  failedStages,
}, null, 2));
process.stdout.write('\n');

if (result.config.summaryMethod !== 'ai') {
  throw new Error(`Demo generation fell back to ${result.config.summaryMethod}; refusing to keep the artifact.`);
}
if (result.embeddingTierUsed !== 'ollama') {
  throw new Error(`Demo embeddings fell back to ${result.embeddingTierUsed}; refusing to keep the artifact.`);
}
if (result.clusteringDiagnostics?.usableForDownstream !== true) {
  throw new Error(`Demo has no validated semantic partition: ${result.clusteringDiagnostics?.reason ?? 'missing diagnostics'}`);
}
if ((result.networkGraph?.analysis.bridgeNodes.length ?? 0) === 0) {
  throw new Error('Demo has no cross-group connector in the participant similarity network.');
}
if (result.enrichmentStatus !== 'complete' || failedStages.length > 0) {
  throw new Error(`Demo enrichment was ${result.enrichmentStatus}; failed stages: ${failedStages.join(', ') || 'none'}.`);
}

const { inputEmbeddings: _privateEmbeddings, ...portableResult } = result;
await writeFile(outputPath, `${JSON.stringify(portableResult, null, 2)}\n`, 'utf8');
