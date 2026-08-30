import { readdirSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, '..');

const prepare = spawnSync(process.execPath, ['tests/prepare-modules.mjs'], {
  cwd: root,
  stdio: 'inherit',
});
if (prepare.status !== 0) process.exit(prepare.status ?? 1);

const tests = readdirSync(here)
  .filter(name => name.endsWith('.test.ts'))
  .sort();

for (const test of tests) {
  console.log(`\n=== ${test} ===`);
  const run = spawnSync(process.execPath, ['--experimental-strip-types', join('tests', test)], {
    cwd: root,
    stdio: 'inherit',
  });
  if (run.status !== 0) process.exit(run.status ?? 1);
}

console.log(`\nAll ${tests.length} test files passed.`);
