/**
 * Regression tests: Newman modularity diagonal + production retrieval score.
 * Run: node --experimental-strip-types tests/core-math.test.ts
 */
import { maxSentenceCosineScore, cosineSimilarity } from '../tests/.modules/services/mathUtils.ts';

let pass = 0, fail = 0;
const check = (n: string, c: boolean, d = '') => {
  if (c) { pass++; console.log(`  PASS  ${n}`); } else { fail++; console.log(`  FAIL  ${n} ${d}`); }
};
const approx = (a: number, b: number, eps = 1e-9) => Math.abs(a - b) < eps;

// ── 1. Newman modularity ────────────────────────────────────────────────────
console.log('\n[1] Newman modularity (diagonal term)');
type E = [number, number];
const modularity = (n: number, edges: E[], comm: number[], withDiagonal: boolean) => {
  const adj = new Set(edges.map(([a, b]) => `${Math.min(a,b)}-${Math.max(a,b)}`));
  const deg = new Array(n).fill(0);
  edges.forEach(([a, b]) => { deg[a]++; deg[b]++; });
  const m = edges.length, m2 = 2 * m;
  let Q = 0;
  for (let i = 0; i < n; i++) for (let j = i + 1; j < n; j++) {
    if (comm[i] !== comm[j]) continue;
    Q += 2 * ((adj.has(`${i}-${j}`) ? 1 : 0) - (deg[i] * deg[j]) / m2);
  }
  if (withDiagonal) for (let i = 0; i < n; i++) Q -= (deg[i] * deg[i]) / m2;
  return Q / m2;
};
// Reference: two triangles joined by one edge.
const edges: E[] = [[0,1],[1,2],[0,2],[3,4],[4,5],[3,5],[2,3]];
const comm = [0,0,0,1,1,1];
const withDiag = modularity(6, edges, comm, true);
const noDiag   = modularity(6, edges, comm, false);
console.log(`   correct Q = ${withDiag.toFixed(4)} | old (no diagonal) Q = ${noDiag.toFixed(4)}`);
check('matches hand-computed Newman Q = 0.35714…', approx(withDiag, 0.3571428571428571, 1e-12), `got ${withDiag}`);
check('old implementation over-reported Q (bug reproduced)', noDiag > withDiag);
// Every node in one community => Q must be exactly 0 (classic identity).
check('single community gives Q = 0 (Newman identity)',
      approx(modularity(6, edges, [0,0,0,0,0,0], true), 0, 1e-12),
      `got ${modularity(6, edges, [0,0,0,0,0,0], true)}`);
check('old implementation FAILS the single-community identity',
      !approx(modularity(6, edges, [0,0,0,0,0,0], false), 0, 1e-12));
check('Q stays within [-1, 1]', withDiag <= 1 && withDiag >= -1);

// ── 2. Production source-to-summary retrieval indicator ─────────────────────
console.log('\n[2] Maximum source-to-summary sentence cosine');
check('returns the strongest sentence match', approx(maxSentenceCosineScore([0.62, 0.55, 0.5]), 0.62));
check('extra correlated matches do not inflate the score',
  approx(maxSentenceCosineScore([0.62, 0.55, 0.5]), maxSentenceCosineScore([0.62])));
check('negative similarities floor at zero', maxSentenceCosineScore([-0.8, -0.2]) === 0);
check('non-finite similarities are ignored', maxSentenceCosineScore([Number.NaN, 0.4]) === 0.4);
check('empty evidence is zero', maxSentenceCosineScore([]) === 0);
check('dimension mismatch cannot yield NaN', cosineSimilarity([1, 0], [1]) === 0);

console.log(`\n${fail === 0 ? 'ALL CHECKS PASSED' : 'FAILURES'} — passed ${pass}, failed ${fail}`);
process.exit(fail === 0 ? 0 : 1);
