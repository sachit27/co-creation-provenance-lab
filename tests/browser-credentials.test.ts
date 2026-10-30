import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { resolveConfig } from 'vite';
import { scanBrowserCredentials } from '../scripts/check-browser-credentials.mjs';

const names = ['API_KEY', 'GEMINI_API_KEY', 'GROQ_API_KEY', 'OPENAI_API_KEY', 'ANTHROPIC_API_KEY', 'PUBLICAI_API_KEY'];
const previous = Object.fromEntries(names.map(name => [name, process.env[name]]));
for (const name of names) process.env[name] = `credential-check-sentinel-${name}`;
try {
  for (const [command, mode] of [['build', 'production'], ['build', 'staging'], ['serve', 'development']] as const) {
    const config = await resolveConfig({ mode, logLevel: 'silent' }, command);
    for (const name of names) assert.equal(config.define[`process.env.${name}`], '""', `${mode} must exclude ${name}`);
  }
} finally {
  for (const name of names) {
    if (previous[name] === undefined) delete process.env[name];
    else process.env[name] = previous[name];
  }
}

const folder = mkdtempSync(join(tmpdir(), 'browser-credential-check-'));
try {
  mkdirSync(join(folder, 'assets'));
  writeFileSync(join(folder, 'assets', 'app.js'), 'public application code');
  const environment = { OPENAI_API_KEY: 'private-sentinel-credential-value' };
  assert.deepEqual(scanBrowserCredentials(folder, environment), []);
  writeFileSync(join(folder, 'assets', 'app.js'), environment.OPENAI_API_KEY);
  const findings = scanBrowserCredentials(folder, environment);
  assert.equal(findings.length, 1);
  assert.deepEqual(findings[0].types, ['OPENAI_API_KEY']);
  assert.ok(!JSON.stringify(findings).includes(environment.OPENAI_API_KEY), 'findings must never disclose credential values');
  writeFileSync(join(folder, 'assets', 'app.js'), `sk-proj-${'x'.repeat(40)}`);
  assert.equal(scanBrowserCredentials(folder, {}).length, 1, 'unknown provider credentials must also be detected');
} finally { rmSync(folder, { recursive: true, force: true }); }
console.log('Browser environment credential isolation and artifact scanner passed.');
