import assert from 'node:assert/strict';
import {
  diagnoseOllamaConnection,
  getOllamaHostUrl,
  setOllamaHost,
} from '../tests/.modules/services/ollama.ts';

const stored = new Map<string, string>();
Object.defineProperty(globalThis, 'sessionStorage', {
  configurable: true,
  value: {
    getItem: (key: string) => stored.get(key) ?? null,
    setItem: (key: string, value: string) => stored.set(key, value),
    removeItem: (key: string) => stored.delete(key),
  },
});
Object.defineProperty(globalThis, 'window', {
  configurable: true,
  value: { location: { origin: 'https://sachit27.github.io' } },
});
Object.defineProperty(globalThis, 'navigator', {
  configurable: true,
  value: {
    permissions: {
      query: async () => ({ state: 'prompt' }),
    },
  },
});

console.log('\n[Hosted Ollama browser compatibility]');

setOllamaHost('localhost:11434');
assert.equal(getOllamaHostUrl(), 'http://localhost:11434');
console.log('  PASS  shorthand loopback host is normalized');

let calls = 0;
globalThis.fetch = (async (_input: string | URL | Request, init?: RequestInit & { targetAddressSpace?: string }) => {
  calls++;
  if (calls === 1) {
    assert.equal(init?.targetAddressSpace, 'loopback');
    throw new TypeError('Safari rejected targetAddressSpace');
  }
  assert.equal(init?.targetAddressSpace, undefined);
  return new Response(JSON.stringify({ models: [
    { name: 'qwen2.5:7b' },
    { name: 'qwen3-embedding:latest' },
    { name: 'remote-without-cloud-suffix', remote_host: 'https://ollama.com:443' },
    { name: 'qwen3.5:397b-cloud' },
  ] }), { status: 200, headers: { 'Content-Type': 'application/json' } });
}) as typeof fetch;

const diagnostic = await diagnoseOllamaConnection();
assert.equal(calls, 2);
assert.equal(diagnostic.connected, true);
assert.deepEqual(diagnostic.models, ['qwen2.5:7b', 'qwen3-embedding:latest']);
console.log('  PASS  Safari-style LNA failure retries once without the hint');
console.log('  PASS  successful fallback still excludes remote cloud models');

calls = 0;
globalThis.fetch = (async () => {
  calls++;
  throw new DOMException('Timed out', 'TimeoutError');
}) as typeof fetch;
const timeout = await diagnoseOllamaConnection();
assert.equal(calls, 1);
assert.equal(timeout.connected, false);
assert.equal(timeout.code, 'timeout');
console.log('  PASS  a genuine timeout is not doubled by the compatibility retry');

calls = 0;
Object.defineProperty(globalThis, 'navigator', {
  configurable: true,
  value: {
    permissions: {
      query: async ({ name }: { name: string }) => {
        assert.equal(name, 'loopback-network');
        return { state: 'denied' };
      },
    },
  },
});
globalThis.fetch = (async () => {
  calls++;
  throw new TypeError('Permission was denied for loopback access');
}) as typeof fetch;
const denied = await diagnoseOllamaConnection();
assert.equal(calls, 1);
assert.equal(denied.connected, false);
assert.equal(denied.code, 'browser-permission-denied');
assert.match(denied.message, /Site settings/);
assert.match(denied.message, /Reset permissions/);
console.log('  PASS  denied Chrome loopback permission is diagnosed without a futile retry');

calls = 0;
Object.defineProperty(globalThis, 'navigator', {
  configurable: true,
  value: {
    userAgent: 'Mozilla/5.0 Chrome/152.0.0.0 Safari/537.36',
    permissions: {
      // Chrome can report "prompt" while its automatic prompt embargo rejects
      // the request after the user dismisses the prompt repeatedly.
      query: async () => ({ state: 'prompt' }),
    },
  },
});
globalThis.fetch = (async () => {
  calls++;
  throw new TypeError('Failed to fetch');
}) as typeof fetch;
const embargoed = await diagnoseOllamaConnection();
assert.equal(calls, 1);
assert.equal(embargoed.code, 'browser-permission-denied');
assert.match(embargoed.message, /Reset permissions/);
console.log('  PASS  Chromium prompt embargo is diagnosed without a Safari fallback retry');
