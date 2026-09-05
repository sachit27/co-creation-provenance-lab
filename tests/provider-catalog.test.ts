import { isOpenAIChatModelId } from '../tests/.modules/services/openai.ts';
import { parseClaudeModelCatalog } from '../tests/.modules/services/claude.ts';
import { parsePublicAIModelCatalog } from '../tests/.modules/services/apertus.ts';
import { filterOllamaCompletionModels, filterOllamaEmbeddingModels, parseLocalOllamaModelNames, rankOllamaCompletionModels } from '../tests/.modules/services/ollama.ts';

let pass = 0, fail = 0;
const check = (name: string, condition: boolean, detail = '') => {
  if (condition) { pass++; console.log(`  PASS  ${name}`); }
  else { fail++; console.log(`  FAIL  ${name} ${detail}`); }
};

console.log('\n[1] OpenAI picker excludes incompatible specialized endpoints');
for (const id of ['gpt-5.6-sol', 'gpt-5.6-terra', 'gpt-5.6-luna', 'gpt-4.1-mini', 'o3']) {
  check(`accepts text Chat Completions model ${id}`, isOpenAIChatModelId(id));
}
for (const id of ['gpt-realtime-2.1', 'gpt-audio-1.5', 'gpt-image-2', 'gpt-5.3-codex', 'gpt-4o-search-preview', 'text-embedding-3-small']) {
  check(`rejects specialized model ${id}`, !isOpenAIChatModelId(id));
}

console.log('\n[2] Claude live catalog parser is strict and preserves API order');
const claude = parseClaudeModelCatalog({ data: [
  { id: 'claude-opus-4-8' },
  { id: 'not-claude' },
  null,
  { id: 'claude-sonnet-4-6' },
] });
check('keeps only Claude IDs', claude.join(',') === 'claude-opus-4-8,claude-sonnet-4-6', claude.join(','));
check('malformed Claude payload returns empty', parseClaudeModelCatalog({ data: 'bad' }).length === 0);

console.log('\n[3] PublicAI parser retains Apertus context and catalog prices');
const publicAI = parsePublicAIModelCatalog({ data: [
  { id: 'swiss-ai/apertus-v1.5-8b', context_length: 128000, pricing: { input: 0.1, output: 0.2 } },
  { id: 'another/model', context_length: 32000 },
] });
check('keeps only hosted Apertus models', publicAI.length === 1 && publicAI[0].id === 'swiss-ai/apertus-v1.5-8b');
check('retains context limit', publicAI[0].contextLength === 128000);
check('retains provider catalog prices', publicAI[0].inputPrice === 0.1 && publicAI[0].outputPrice === 0.2);

console.log('\n[4] Ollama catalogs are capability- and destination-aware');
const ollama = [
  'qwen3-embedding:8b',
  'qwen2.5:14b',
  'deepseek-v4-flash:cloud',
  'qwen3.5:397b-cloud',
  'all-minilm:latest',
  'gemma3:12b',
  'qwen3.6:35b-a3b',
];
const completion = filterOllamaCompletionModels(ollama);
const embeddings = filterOllamaEmbeddingModels(ollama);
check('embedding-only models cannot become generators', !completion.includes('qwen3-embedding:8b') && !completion.includes('all-minilm:latest'));
check('cloud-tagged models are excluded from local-only completion', !completion.includes('deepseek-v4-flash:cloud') && !completion.includes('qwen3.5:397b-cloud'));
check('local text-generation models remain available', completion.includes('qwen2.5:14b') && completion.includes('gemma3:12b'));
check('embedding picker contains only local embedding candidates', embeddings.join(',') === 'qwen3-embedding:8b,all-minilm:latest', embeddings.join(','));
check('strong installed generator is the safe default', rankOllamaCompletionModels(ollama)[0] === 'qwen3.6:35b-a3b');
const localCatalog = parseLocalOllamaModelNames({ models: [
  { name: 'qwen2.5:7b', capabilities: ['completion'] },
  { name: 'renamed-remote-model', remote_host: 'https://ollama.com:443' },
  { name: 'qwen3.5:397b-cloud' },
  { name: 'qwen3-embedding:latest', capabilities: ['embedding'] },
] });
check('remote_host is authoritative and cloud-name fallback is retained', localCatalog.join(',') === 'qwen2.5:7b,qwen3-embedding:latest', localCatalog.join(','));

console.log(`\n${fail === 0 ? 'ALL CHECKS PASSED' : 'FAILURES'} — passed ${pass}, failed ${fail}`);
process.exit(fail === 0 ? 0 : 1);
