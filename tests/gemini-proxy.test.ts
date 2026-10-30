import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';

// tsx resolves the serverless handlers' extensionless TypeScript imports.
const result = spawnSync(process.execPath, ['--import', 'tsx', '--input-type=module', '-'], {
  encoding: 'utf8',
  input: `
import assert from 'node:assert/strict';
import complete from './api/gemini-complete.ts';
import embed from './api/gemini-embed.ts';
import models from './api/gemini-models.ts';
const credential = 'private-gemini-proxy-test-sentinel';
process.env.GEMINI_API_KEY = credential;
process.env.GEMINI_PROXY_ENABLED = 'true';
const invoke = async (handler, method, body) => {
  const response = { code: 200, body: null, status(code) { this.code = code; return this; }, json(body) { this.body = body; return this; }, setHeader() {}, end() {} };
  await handler({ method, headers: { host: 'localhost' }, body }, response);
  return response;
};
for (const [handler, method, body] of [[complete, 'POST', { prompt: 'Hello' }], [embed, 'POST', { text: 'Hello' }], [models, 'GET', undefined]]) {
  globalThis.fetch = async () => ({ ok: false, status: 401, text: async () => 'Invalid key: ' + credential });
  const denied = await invoke(handler, method, body);
  assert.equal(denied.code, 401);
  assert.ok(!JSON.stringify(denied.body).includes(credential));
  globalThis.fetch = async () => { throw new Error('Request URL ?key=' + credential); };
  const failed = await invoke(handler, method, body);
  assert.equal(failed.code, 500);
  assert.ok(!JSON.stringify(failed.body).includes(credential));
}
globalThis.fetch = async () => ({ ok: true, json: async () => ({ candidates: [{ content: { parts: [{ thought: true, text: 'private reasoning' }, { text: 'Hello ' }, { inlineData: {} }, { text: 'world' }] }, finishReason: 'STOP' }] }) });
const completed = await invoke(complete, 'POST', { prompt: 'Hello' });
assert.equal(completed.body.text, 'Hello world');
let calls = 0;
globalThis.fetch = async (url) => {
  const query = new URL(url).searchParams;
  assert.equal(query.get('key'), credential);
  assert.equal(query.get('pageSize'), '1000');
  calls++;
  if (calls === 1) return { ok: true, json: async () => ({ models: [{ name: 'models/chat-test', supportedGenerationMethods: ['generateContent'] }], nextPageToken: 'second-page' }) };
  assert.equal(query.get('pageToken'), 'second-page');
  return { ok: true, json: async () => ({ models: [{ name: 'models/embed-test', supportedGenerationMethods: ['embedContent'] }] }) };
};
const catalog = await invoke(models, 'GET');
assert.equal(calls, 2);
assert.deepEqual(catalog.body, { generation: ['chat-test'], embedding: ['embed-test'] });
`,
});
assert.equal(result.status, 0, 'Mocked Gemini proxy credential, response-part, or pagination regression failed.');
console.log('Gemini proxy hides upstream credentials, joins visible response parts, and follows catalog pages.');
