/**
 * Prepares application services for the plain-Node regression-test runner.
 * Node type stripping requires explicit extensions and type-only imports.
 * This script copies the production sources into an ignored compatibility
 * directory and performs only those two mechanical rewrites.
 */
import { readdirSync, readFileSync, writeFileSync, mkdirSync, rmSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, '..');
const OUT = join(HERE, '.modules');

rmSync(OUT, { recursive: true, force: true });
mkdirSync(join(OUT, 'services'), { recursive: true });

const rewrite = (source) => {
  let rewritten = source;
  rewritten = rewritten.replace(/from\s+'(\.\.?\/[^']*)'/g, (match, path) =>
    /\.(ts|tsx|js|mjs|json|css)$/.test(path) ? match : `from '${path}.ts'`);
  rewritten = rewritten.replace(
    /(?<!type\s)import\s+\{([^}]*?)\}\s+from\s+'([^']*types\.ts)'/gs,
    (_match, names, path) => `import type {${names}} from '${path}'`,
  );
  return rewritten;
};

let count = 0;
for (const filename of ['constants.ts', 'types.ts']) {
  writeFileSync(join(OUT, filename), rewrite(readFileSync(join(ROOT, filename), 'utf8')));
  count++;
}
for (const filename of readdirSync(join(ROOT, 'services')).filter(name => name.endsWith('.ts'))) {
  writeFileSync(join(OUT, 'services', filename), rewrite(readFileSync(join(ROOT, 'services', filename), 'utf8')));
  count++;
}

console.log(`prepared ${count} module(s) in tests/.modules/ (logic unchanged)`);
