import { generateOpenAICompletionResult, setOpenAIApiKey } from '../tests/.modules/services/openai.ts';
import { generateOllamaCompletionResult } from '../tests/.modules/services/ollama.ts';
import { generateCompletion } from '../tests/.modules/services/completionRouter.ts';

let pass = 0, fail = 0;
const check = (name: string, condition: boolean, detail = '') => {
  if (condition) { pass++; console.log(`  PASS  ${name}`); }
  else { fail++; console.log(`  FAIL  ${name} ${detail}`); }
};

const values = new Map<string, string>();
(globalThis as any).sessionStorage = {
  getItem: (key: string) => values.get(key) ?? null,
  setItem: (key: string, value: string) => values.set(key, value),
  removeItem: (key: string) => values.delete(key),
};
setOpenAIApiKey('test-key');

console.log('\n[1] Requested and provider-returned execution facts remain distinct');
(globalThis as any).fetch = async () => new Response(JSON.stringify({
  id: 'chatcmpl-returned-id',
  model: 'gpt-5.6-luna-2026-08-01',
  created: 1785542400,
  choices: [{ finish_reason: 'stop', message: { content: 'audited text' } }],
  usage: { prompt_tokens: 12, completion_tokens: 4, total_tokens: 16 },
}), { status: 200, headers: { 'content-type': 'application/json', 'x-request-id': 'req_abc' } });

const result = await generateOpenAICompletionResult('prompt', 'system', 'gpt-5.6-luna', 0);
check('text is preserved', result.text === 'audited text');
check('requested model is not relabelled as actual', result.metadata.requestedModel === 'gpt-5.6-luna');
check('provider-returned model is captured separately', result.metadata.returnedModel === 'gpt-5.6-luna-2026-08-01');
check('response and request IDs are captured', result.metadata.responseId === 'chatcmpl-returned-id' && result.metadata.requestId === 'req_abc');
check('usage and finish reason are captured', result.metadata.usage?.totalTokens === 16 && result.metadata.finishReason === 'stop');
check('unsupported requested temperature is recorded as null', result.metadata.effectiveParameters.temperature === null);

console.log('\n[2] Router observer receives metadata without changing text-only callers');
const seen: any[] = [];
const config: any = {
  datasetName: 'test', strategy: 'balanced', aiProvider: 'openai', model: 'gpt-5.6-luna',
  embeddingProvider: 'tfidf', embeddingModel: 'tfidf', runLOO: false, summaryMethod: 'ai',
  completionMetadataSink: (metadata: any) => seen.push(metadata),
};
const text = await generateCompletion('prompt', 'system', config, { temperature: 0 });
check('legacy router still returns plain text', text === 'audited text');
check('run observer receives one metadata envelope', seen.length === 1 && seen[0].responseId === 'chatcmpl-returned-id');

console.log('\n[3] Provider refusal remains an error and carries auditable metadata');
(globalThis as any).fetch = async () => new Response(JSON.stringify({
  id: 'chatcmpl-refused', model: 'gpt-5.6-luna-2026-08-01', created: 1785542400,
  choices: [{ finish_reason: 'stop', message: { refusal: 'policy refusal', content: '' } }],
}), { status: 200, headers: { 'x-request-id': 'req_refused' } });
try {
  await generateOpenAICompletionResult('prompt', 'system', 'gpt-5.6-luna', 0);
  check('refusal throws', false);
} catch (error) {
  const metadata = (error as any).completionMetadata;
  check('refusal throws', String(error).includes('[REFUSAL]'));
  check('refusal metadata is attached', metadata?.refusal === 'policy refusal' && metadata?.requestId === 'req_refused');
}

console.log('\n[4] Thinking-capable Ollama models return through the audited response channel');
let ollamaRequest: any = null;
(globalThis as any).fetch = async (_url: string, init: RequestInit) => {
  ollamaRequest = JSON.parse(String(init.body));
  return new Response(JSON.stringify({
    model: 'qwen3.6:35b-a3b', created_at: '2026-08-22T00:00:00Z',
    response: '{"summary":"ok"}', done: true, done_reason: 'stop',
    prompt_eval_count: 8, eval_count: 4,
  }), { status: 200, headers: { 'content-type': 'application/json' } });
};
const ollamaResult = await generateOllamaCompletionResult('prompt', 'system', 'qwen3.6:35b-a3b', 0);
check('Ollama thinking is explicitly disabled', ollamaRequest?.think === false);
check('effective thinking mode is recorded', ollamaResult.metadata.effectiveParameters.thinking === false);
check('Ollama response remains available to callers', ollamaResult.text === '{"summary":"ok"}');

console.log(`\n${fail === 0 ? 'ALL CHECKS PASSED' : 'FAILURES'} — passed ${pass}, failed ${fail}`);
process.exit(fail === 0 ? 0 : 1);
