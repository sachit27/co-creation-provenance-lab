/**
 * Reproduce the bundled application demo with the same production analysis
 * pipeline used by the browser UI.
 *
 * Provider and model choices are explicit environment inputs so a demo
 * artifact never depends on hidden browser state. For example:
 *
 *   OLLAMA_HOST=http://127.0.0.1:11434 npm run demo:generate
 *   DEMO_PROVIDER=openai DEMO_EVALUATOR_PROVIDER=openai \
 *     DEMO_EMBEDDING_PROVIDER=openai npm run demo:generate
 */

import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';

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
const provider = process.env.DEMO_PROVIDER === 'openai' ? 'openai' : 'ollama';
const evaluatorProvider = process.env.DEMO_EVALUATOR_PROVIDER === 'openai' ? 'openai' : provider;
const embeddingProvider = process.env.DEMO_EMBEDDING_PROVIDER === 'openai' ? 'openai' : provider;
const generatorModel = process.env.DEMO_GENERATOR_MODEL ?? (provider === 'openai' ? 'gpt-4o-mini' : 'qwen2.5:14b');
const evaluatorModel = process.env.DEMO_EVALUATOR_MODEL ?? (evaluatorProvider === 'openai' ? 'gpt-4o-mini' : 'phi4:14b');
const embeddingModel = process.env.DEMO_EMBEDDING_MODEL ?? (embeddingProvider === 'openai' ? 'text-embedding-3-small' : 'qwen3-embedding:8b');
// Generate a review candidate; replacing the published fixture is a separate,
// explicit step after validation.
const outputPath = resolve(process.env.DEMO_OUTPUT ?? 'tmp/demo-result.candidate.json');
if (outputPath === resolve('public/demo-result.json')) {
  throw new Error('DEMO_OUTPUT must be a candidate path; validate it before replacing public/demo-result.json.');
}

session.setItem('cprov_ollama_host', ollamaHost);

const [{ SAMPLE_DATA, ANALYSIS_CONFIG }, { runAnalysis }, ollama, openai] = await Promise.all([
  import('../constants.ts'),
  import('../services/analysis.ts'),
  import('../services/ollama.ts'),
  import('../services/openai.ts'),
]);

const usesOpenAI = [provider, evaluatorProvider, embeddingProvider].includes('openai');
if (usesOpenAI) {
  const key = process.env.OPENAI_API_KEY ?? '';
  if (!key) throw new Error('OPENAI_API_KEY is required for the selected demo providers.');
  openai.setOpenAIApiKey(key);
  if (!await openai.verifyOpenAIConnection()) {
    throw new Error('OpenAI rejected the configured key or the API is unreachable.');
  }
}

const ollamaModels = [
  ...(provider === 'ollama' ? [generatorModel] : []),
  ...(evaluatorProvider === 'ollama' ? [evaluatorModel] : []),
  ...(embeddingProvider === 'ollama' ? [embeddingModel] : []),
];
if (ollamaModels.length > 0) {
  if (!await ollama.checkOllamaConnection()) {
    throw new Error(`Ollama is unreachable at ${ollamaHost}; refusing to enter the fallback pipeline.`);
  }
  const installedModels = new Set(await ollama.getOllamaModels());
  for (const requiredModel of ollamaModels) {
    if (!installedModels.has(requiredModel)) {
      throw new Error(`Required demo model ${requiredModel} is not installed at ${ollamaHost}.`);
    }
  }
}

const result = await runAnalysis(
  SAMPLE_DATA,
  {
    datasetName: 'Synthetic Nature-Based Solutions Consultation',
    strategy: 'balanced',
    aiProvider: provider,
    model: generatorModel,
    evaluatorProvider,
    evaluatorModel,
    embeddingProvider,
    embeddingModel,
    runLOO: true,
    summaryMethod: 'ai',
    summaryProvenance: { origin: 'generated-in-run' },
    thresholds: { ...ANALYSIS_CONFIG.thresholds },
    wordLimit: 300,
    domainContext: 'Municipal consultation on urban nature-based solutions for heat, stormwater, biodiversity, and equitable stewardship.',
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

// Preserve the actual run for diagnosis even when tutorial acceptance gates fail.
// Rejected artifacts are never loaded by the application.
const { inputEmbeddings: _checkpointEmbeddings, ...checkpoint } = result;
await mkdir(dirname(outputPath), { recursive: true });
await writeFile(`${outputPath}.review.json`, `${JSON.stringify(checkpoint, null, 2)}\n`, 'utf8');

if (result.config.summaryMethod !== 'ai') {
  throw new Error(`Demo generation fell back to ${result.config.summaryMethod}; refusing to keep the artifact.`);
}
if (result.embeddingTierUsed !== embeddingProvider) {
  throw new Error(`Demo embeddings fell back to ${result.embeddingTierUsed}; refusing to keep the artifact.`);
}
if (result.clusteringDiagnostics?.usableForDownstream !== true) {
  throw new Error(`Demo has no partition that passed the configured robustness checks: ${result.clusteringDiagnostics?.reason ?? 'missing diagnostics'}`);
}
if (result.clusteringDiagnostics.selectedK !== 4 || result.clusters.length !== 4) {
  throw new Error(`Demo did not recover the four planted semantic groups (selected k=${result.clusteringDiagnostics.selectedK}).`);
}
if ((result.networkGraph?.analysis.bridgeNodes.length ?? 0) === 0) {
  throw new Error('Demo has no cross-group connector in the participant similarity network.');
}
if (result.tensionAnalysis?.methodVersion !== 'conservative-exact-span-v4' ||
    result.tensionAnalysis.basis !== 'stable-semantic-groups' ||
    result.tensionAnalysis.pairs.length === 0) {
  throw new Error('Demo has no verified exact-span tension candidate from the conservative v4 method.');
}
if (result.enrichmentStatus !== 'complete' || failedStages.length > 0) {
  throw new Error(`Demo enrichment was ${result.enrichmentStatus}; failed stages: ${failedStages.join(', ') || 'none'}.`);
}

const { inputEmbeddings: _privateEmbeddings, ...portableResult } = result;
await mkdir(dirname(outputPath), { recursive: true });
await writeFile(outputPath, `${JSON.stringify(portableResult, null, 2)}\n`, 'utf8');
