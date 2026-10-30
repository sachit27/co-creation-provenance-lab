import assert from 'node:assert/strict';
import { generateOpenAICompletionResult, generateOpenAIEmbedding, setOpenAIApiKey } from './.modules/services/openai.ts';
import { generateClaudeCompletionResult, setClaudeApiKey } from './.modules/services/claude.ts';
import { generateGroqCompletionResult, setGroqApiKey } from './.modules/services/groq.ts';
import { generateApertusCompletionResult, setApertusApiKey, setApertusApiBase } from './.modules/services/apertus.ts';
import { getGeminiModels, generateCompletionResult, setRuntimeGeminiKey } from './.modules/services/gemini.ts';
import { diagnoseOllamaConnection, setOllamaHost } from './.modules/services/ollama.ts';

const stored = new Map<string, string>();
Object.defineProperty(globalThis, 'sessionStorage', { configurable: true, value: {
  getItem: (key: string) => stored.get(key) ?? null,
  setItem: (key: string, value: string) => stored.set(key, value),
  removeItem: (key: string) => stored.delete(key),
} });
Object.defineProperty(globalThis, 'window', { configurable: true, value: { location: { origin: 'http://localhost:5173' } } });
const fixtureKey = 'fixture-credential-for-redaction';
setOpenAIApiKey(fixtureKey);
setClaudeApiKey(fixtureKey);
setGroqApiKey(fixtureKey);
setApertusApiKey(fixtureKey);
setRuntimeGeminiKey(fixtureKey);
let requestUrl = '';
let requestBody: any;
let requestHeaders: Headers;
const respond = (payload: any, status = 200) => {
  globalThis.fetch = (async (input: any, init: RequestInit = {}) => {
    requestUrl = String(input instanceof Request ? input.url : input);
    requestBody = init.body ? JSON.parse(String(init.body)) : undefined;
    requestHeaders = new Headers(init.headers);
    return Response.json(payload, { status });
  }) as typeof fetch;
};
const chat = { choices: [{ message: { content: 'ok' }, finish_reason: 'stop' }] };
for (const model of ['gpt-6-luna', 'gpt-6.1-sol', 'o3']) {
  respond(chat);
  const result = await generateOpenAICompletionResult('prompt', 'system', model);
  assert.equal(requestUrl, 'https://api.openai.com/v1/chat/completions');
  assert.equal(requestBody.reasoning_effort, 'low');
  assert.equal(requestBody.max_completion_tokens, 4096);
  assert.equal(requestBody.temperature, undefined);
  assert.equal(requestBody.max_tokens, undefined);
  assert.equal(result.metadata.effectiveParameters.temperature, null);
}
respond(chat);
await generateOpenAICompletionResult('prompt', 'system', 'gpt-4o-mini', 0.2);
assert.equal(requestBody.temperature, 0.2);
respond({ data: [{ embedding: [0.1, 0.2] }] });
assert.deepEqual(await generateOpenAIEmbedding('text'), [0.1, 0.2]);
assert.equal(requestUrl, 'https://api.openai.com/v1/embeddings');
console.log('  PASS  OpenAI completion and embedding endpoints preserve legacy and current reasoning compatibility');

for (const model of ['claude-sonnet-5-5', 'claude-opus-4-8', 'claude-fable-5-1', 'claude-haiku-5-5']) {
  respond({ content: [{ type: 'text', text: 'ok' }], stop_reason: 'end_turn' });
  const result = await generateClaudeCompletionResult('prompt', 'system', model, 0.2);
  assert.equal(requestUrl, 'https://api.anthropic.com/v1/messages');
  assert.equal(requestBody.temperature, undefined);
  assert.equal(requestHeaders!.get('anthropic-dangerous-direct-browser-access'), 'true');
  assert.equal(result.metadata.effectiveParameters.temperature, null);
}
respond({ content: [{ type: 'text', text: 'ok' }], stop_reason: 'end_turn' });
await generateClaudeCompletionResult('prompt', 'system', 'claude-sonnet-4-6', 0.2);
assert.equal(requestBody.temperature, 0.2);
console.log('  PASS  Claude keeps older sampling while omitting parameters rejected by newer models');

respond({ models: [
  { name: 'models/legacy-compatible-generator', supportedGenerationMethods: ['generateContent'] },
  { name: 'models/gemini-realtime-only', supportedGenerationMethods: ['bidiGenerateContent'] },
  { name: 'models/gemini-embedding-001', supportedGenerationMethods: ['embedContent'] },
] });
const catalog = await getGeminiModels();
assert.deepEqual(catalog.generation, ['legacy-compatible-generator']);
assert.deepEqual(catalog.embedding, ['gemini-embedding-001']);
assert.match(requestUrl, /^https:\/\/generativelanguage.googleapis.com\/v1beta\/models/);
console.log('  PASS  Gemini SDK supportedActions determine endpoint compatibility instead of model-name guesses');

setOllamaHost('');
respond({ models: [{ name: 'local-model' }] });
const local = await diagnoseOllamaConnection(true);
assert.equal(local.connected, true);
assert.equal(requestUrl, '/api/ollama/api/tags');
assert.deepEqual(local.models, ['local-model']);
assert.equal((await diagnoseOllamaConnection(false)).code, 'static-proxy-unavailable');
console.log('  PASS  Ollama development proxy is valid and remains unavailable on static hosts');

setApertusApiBase('https://api.publicai.co/v1');
for (const generate of [
  () => generateOpenAICompletionResult('prompt', 'system', 'gpt-4o-mini'),
  () => generateOpenAIEmbedding('text'),
  () => generateClaudeCompletionResult('prompt', 'system', 'claude-sonnet-4-6'),
  () => generateGroqCompletionResult('prompt', 'system', 'openai/gpt-oss-20b'),
  () => generateApertusCompletionResult('prompt', 'system', 'swiss-ai/apertus-v1.5-8b'),
  () => generateCompletionResult('prompt', 'system', 'gemini-3.8-flash'),
]) {
  respond({ error: { message: `upstream echo ${fixtureKey}` } }, 400);
  await assert.rejects(generate, (error: Error) => !error.message.includes(fixtureKey));
}
respond({ choices: [{ message: { refusal: `Bearer ${fixtureKey}`, content: '' } }] });
await assert.rejects(() => generateOpenAICompletionResult('prompt', 'system', 'gpt-4o-mini'), (error: any) => {
  assert.equal(error.message.includes(fixtureKey), false);
  assert.equal(error.completionMetadata.refusal.includes(fixtureKey), false);
  return error.message.startsWith('[REFUSAL]');
});
console.log('  PASS  provider errors and structured refusal metadata do not expose upstream credential echoes');
