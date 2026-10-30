/**
 * Validates the Shapley estimator against games whose values are known
 * analytically, plus exact-vs-Monte-Carlo agreement.
 * Run: node --experimental-strip-types tests/shapley.test.ts
 */
import { computeShapleyValues, computeExactShapley, computeClusterShapley, computeEquivalenceTiers }
  from '../services/shapleyAttribution.ts';

let pass = 0, fail = 0;
const check = (n: string, c: boolean, d = '') => {
  if (c) { pass++; console.log(`  PASS  ${n}`); } else { fail++; console.log(`  FAIL  ${n} ${d}`); }
};
const close = (a: number, b: number, eps: number) => Math.abs(a - b) < eps;

const run = async () => {
  // ── 1. Additive game: v(S) = Σ w_i. Shapley must equal each player's own weight.
  console.log('\n[1] Additive game (φ_i must equal w_i exactly)');
  const w = [0.5, 0.3, 0.15, 0.05];
  const additive = (S: number[]) => S.reduce((a, i) => a + w[i], 0);
  const exactAdd = await computeExactShapley(w.length, additive);
  check('exact Shapley recovers the weights', exactAdd.every((v, i) => close(v, w[i], 1e-12)),
        `got ${exactAdd.map(v => v.toFixed(4))}`);
  const mcAdd = await computeShapleyValues(w.length, additive, { samples: 400, seed: 7 });
  check('Monte Carlo matches within 1e-9', mcAdd.values.every((v, i) => close(v, w[i], 1e-9)));
  check('efficiency axiom holds (Σφ = v(N) − v(∅))', close(mcAdd.efficiencyGap, 0, 1e-9),
        `gap ${mcAdd.efficiencyGap}`);

  // ── 2. Unanimity game: v(S) = 1 iff S = N. Shapley must be 1/n for everyone.
  console.log('\n[2] Unanimity game (φ_i must equal 1/n)');
  const n2 = 5;
  const unanimity = (S: number[]) => (S.length === n2 ? 1 : 0);
  const exactUna = await computeExactShapley(n2, unanimity);
  check('exact Shapley gives 1/n to each player', exactUna.every(v => close(v, 1 / n2, 1e-12)),
        `got ${exactUna.map(v => v.toFixed(4))}`);

  // ── 3. Null player: a contribution that never changes v must get φ = 0.
  console.log('\n[3] Null-player axiom');
  const wNull = [0.6, 0.4, 0.0];
  const withNull = (S: number[]) => S.reduce((a, i) => a + wNull[i], 0);
  const exactNull = await computeExactShapley(3, withNull);
  check('null player receives exactly zero', close(exactNull[2], 0, 1e-12), `got ${exactNull[2]}`);

  // ── 4. Symmetry: identical players receive identical value.
  console.log('\n[4] Symmetry axiom');
  const sym = (S: number[]) => Math.min(S.length, 2) / 2; // depends only on size
  const exactSym = await computeExactShapley(4, sym);
  check('interchangeable players get equal φ',
        exactSym.every(v => close(v, exactSym[0], 1e-12)), `got ${exactSym.map(v => v.toFixed(4))}`);

  // ── 5. Non-additive (submodular) game: MC must approximate exact.
  console.log('\n[5] Submodular coverage game (MC vs exact)');
  const topics = [[0,1],[1,2],[2,3],[0,3],[4]];           // each player covers topics
  const coverage = (S: number[]) => new Set(S.flatMap(i => topics[i])).size / 5;
  const exactCov = await computeExactShapley(topics.length, coverage);
  const mcCov = await computeShapleyValues(topics.length, coverage, { samples: 3000, seed: 11, truncationTolerance: 0 });
  const maxErr = Math.max(...exactCov.map((v, i) => Math.abs(v - mcCov.values[i])));
  console.log(`   exact : ${exactCov.map(v => v.toFixed(4)).join(', ')}`);
  console.log(`   MC    : ${mcCov.values.map(v => v.toFixed(4)).join(', ')}   max err ${maxErr.toFixed(5)}`);
  check('MC within 0.01 of exact on every player', maxErr < 0.01, `max err ${maxErr}`);
  check('efficiency holds on submodular game', close(mcCov.efficiencyGap, 0, 0.02),
        `gap ${mcCov.efficiencyGap}`);
  check('standard errors reported for every player', mcCov.standardErrors.every(se => se >= 0));
  // Redundancy: two players covering the SAME topic must split its value,
  // while a player covering a unique topic keeps all of it.
  const redundant = [[0], [0], [1]];                       // players 0,1 duplicate; 2 unique
  const redCov = (S: number[]) => new Set(S.flatMap(i => redundant[i])).size / 2;
  const exactRed = await computeExactShapley(3, redCov);
  console.log(`   redundancy game exact: ${exactRed.map(v => v.toFixed(4)).join(', ')}`);
  check('duplicated contributions split their value (0.25 each)',
        close(exactRed[0], 0.25, 1e-12) && close(exactRed[1], 0.25, 1e-12), `got ${exactRed}`);
  check('unique contribution keeps full value (0.5) and outranks duplicates',
        close(exactRed[2], 0.5, 1e-12) && exactRed[2] > exactRed[0]);

  // ── 5b. Additivity / linearity axiom: phi(v + w) = phi(v) + phi(w) ─────────
  // NOTE: this is distinct from the "additive game" in [1]. That test checked a
  // game whose value happens to be a sum of weights; this checks the axiom that
  // Shapley attribution is linear in the characteristic function itself.
  console.log('\n[5b] Additivity (linearity) axiom');
  const topics2 = [[1, 2], [2, 3], [0], [3, 4]];
  const covB = (S: number[]) => new Set(S.flatMap(i => topics2[i])).size / 5;
  const covA = (S: number[]) => new Set(S.flatMap(i => topics[i])).size / 5;
  const sum = (S: number[]) => covA(S) + covB(S);
  const phiA = await computeExactShapley(4, (S) => covA(S.filter(i => i < topics.length)));
  const phiB = await computeExactShapley(4, covB);
  const phiSum = await computeExactShapley(4, (S) => covA(S.filter(i => i < topics.length)) + covB(S));
  const maxLinErr = Math.max(...phiSum.map((v, i) => Math.abs(v - (phiA[i] + phiB[i]))));
  console.log(`   phi(v)+phi(w) : ${phiA.map((v, i) => (v + phiB[i]).toFixed(4)).join(', ')}`);
  console.log(`   phi(v+w)      : ${phiSum.map(v => v.toFixed(4)).join(', ')}   max err ${maxLinErr.toExponential(2)}`);
  check('phi(v+w) equals phi(v) + phi(w) exactly', maxLinErr < 1e-12, `max err ${maxLinErr}`);
  void sum;

  // ── 6. Memoisation must cut evaluation count well below the naive bound.
  console.log('\n[6] Cost control');
  let calls = 0;
  const counted = (S: number[]) => { calls++; return coverage(S); };
  const r = await computeShapleyValues(5, counted, { samples: 200, seed: 3, truncationTolerance: 0 });
  const naive = 200 * 5;
  console.log(`   evaluations ${r.evaluations} vs naive ${naive} (memoised, ${(100 * (1 - r.evaluations / naive)).toFixed(1)}% saved)`);
  check('memoisation reduces evaluations below naive bound', r.evaluations < naive);
  const capped = await computeShapleyValues(5, coverage, { samples: 500, maxEvaluations: 20, seed: 5 });
  console.log(`   cap 20 -> evaluations ${capped.evaluations}, permutations completed ${capped.samplesUsed}`);
  check('hard maxEvaluations cap is never exceeded', capped.evaluations <= 20, `got ${capped.evaluations}`);

  // ── 7. Cluster-level Shapley preserves total value.
  console.log('\n[7] Cluster-level Shapley');
  const assign = [0, 0, 1, 1, 2];
  const cl = await computeClusterShapley(assign, coverage, { samples: 500, seed: 9, truncationTolerance: 0 });
  const clSum = cl.values.reduce((a, b) => a + b, 0);
  console.log(`   Σφ (cluster-distributed) = ${clSum.toFixed(4)}  |  v(N) − v(∅) = ${(cl.vFull - cl.vEmpty).toFixed(4)}`);
  check('distributed cluster values preserve the total', close(clSum, cl.vFull - cl.vEmpty, 0.02));
  check('every participant receives a value', cl.values.length === assign.length);

  // ── 8. Convergence must improve with more samples (was inverted) ───────────
  console.log('\n[8] Convergence & rank stability');
  const nC = 30;
  const tp = Array.from({ length: nC }, (_, i) => [i % 7, (i * 3) % 11]);
  const gameC = (S: number[]) => new Set(S.flatMap(i => tp[i])).size / 18;
  const runs = [] as { s: number; frac: number; rs: number }[];
  for (const smp of [10, 30, 100]) {
    const r = await computeShapleyValues(nC, gameC, { samples: smp, seed: 5 });
    runs.push({ s: smp, frac: r.convergedFraction, rs: r.rankStability });
    console.log(`   ${String(smp).padStart(3)} perms: resolved ${(100 * r.convergedFraction).toFixed(0)}%  rankStability ${r.rankStability.toFixed(3)}`);
  }
  check('convergedFraction does not DECREASE with more samples (old bug inverted this)',
    runs[2].frac >= runs[0].frac, `${runs[0].frac} -> ${runs[2].frac}`);
  check('rank stability increases with more samples', runs[2].rs > runs[0].rs);
  check('rank stability is a correlation in [-1, 1]', runs.every(r => r.rs >= -1 && r.rs <= 1));

  // A game with genuinely DISTINCT player values must produce a stable ranking.
  const wDistinct = [0.50, 0.30, 0.15, 0.08, 0.04, 0.01];
  const distinctGame = (S: number[]) => S.reduce((a, i) => a + wDistinct[i], 0);
  const stable = await computeShapleyValues(6, distinctGame, { samples: 200, seed: 1, truncationTolerance: 0 });
  check('a game with distinct values reports high rank stability', stable.rankStability > 0.9,
    `got ${stable.rankStability}`);

  // A fully symmetric game has NO true ordering — every player's phi is equal.
  //
  // Rank stability alone does NOT catch this: with antithetic pairing the two
  // half-samples agree almost exactly (rho ~ 1.0) because pi and its reverse
  // cancel, even though the values they agree on are numerically identical and
  // the ordering is therefore meaningless. Reproducible is not the same as
  // meaningful. Equivalence tiers are the diagnostic that catches it, which is
  // why the UI reports both.
  const symGame = (S: number[]) => new Set(S.flatMap(i => [i % 3])).size / 3;
  const symmetric = await computeShapleyValues(6, symGame, { samples: 400, seed: 1 });
  const spread = Math.max(...symmetric.values) - Math.min(...symmetric.values);
  console.log(`   symmetric game: rankStability ${symmetric.rankStability.toFixed(3)}, value spread ${spread.toExponential(2)}`);
  check('symmetric game yields a negligible spread (no real ordering to find)', spread < 1e-3,
    `spread ${spread}`);
  const symTiers = computeEquivalenceTiers(
    symmetric.values.map((_, i) => `P${i}`), symmetric.values, symmetric.standardErrors);
  check('equivalence tiers collapse the symmetric game to one group', symTiers.length === 1,
    `got ${symTiers.length} tiers`);

  // ── 9. Pre-flight ceiling must cover measurement ───────────────────────────
  console.log('\n[9] Pre-flight ceiling vs measured evaluations');
  for (const smp of [10, 30]) {
    let calls = 0;
    const counted = (S: number[]) => { calls++; return gameC(S); };
    const r = await computeShapleyValues(nC, counted, { samples: smp, seed: 5 });
    const predicted = Math.min(2 ** nC, smp * nC + 2);
    const ratio = r.evaluations / predicted;
    console.log(`   ${String(smp).padStart(3)} perms: measured ${r.evaluations}, ceiling ${predicted} (ratio ${ratio.toFixed(2)})`);
    check(`ceiling is never below measured cost at ${smp} permutations`, r.evaluations <= predicted,
      `measured ${r.evaluations}, ceiling ${predicted}`);
  }

  // ── 10. Antithetic sampling reduces error at equal cost ───────────────────
  console.log('\n[10] Antithetic variance reduction');
  const nA = 20;
  const tpA = Array.from({ length: nA }, (_, i) => [i % 5, (i * 3) % 7, (i * 7) % 11]);
  const gameA = (S: number[]) => new Set(S.flatMap(i => tpA[i])).size / 13;
  const refA = await computeShapleyValues(nA, gameA, { samples: 2000, seed: 99, antithetic: false, truncationTolerance: 0 });
  const rmseA = (a: number[]) => Math.sqrt(a.reduce((s2, v, i) => s2 + (v - refA.values[i]) ** 2, 0) / a.length);
  const iid = await computeShapleyValues(nA, gameA, { samples: 30, seed: 7, antithetic: false, truncationTolerance: 0 });
  const anti = await computeShapleyValues(nA, gameA, { samples: 30, seed: 7, antithetic: true, truncationTolerance: 0 });
  console.log(`   i.i.d.     : ${iid.evaluations} evals, RMSE ${rmseA(iid.values).toExponential(2)}`);
  console.log(`   antithetic : ${anti.evaluations} evals, RMSE ${rmseA(anti.values).toExponential(2)}`);
  check('antithetic is more accurate at comparable cost', rmseA(anti.values) < rmseA(iid.values));
  check('antithetic does not materially increase evaluations', anti.evaluations <= iid.evaluations * 1.1);
  const orGame = (S: number[]) => S.length > 0 ? 1 : 0;
  const pairedOr = await computeShapleyValues(2, orGame, { samples: 10, seed: 2, antithetic: true, truncationTolerance: 0 });
  check('antithetic SE uses independent pair means', pairedOr.standardErrors.every(se => close(se, 0, 1e-12)), `SE ${pairedOr.standardErrors}`);

  // ── 11. Equivalence tiers ─────────────────────────────────────────────────
  console.log('\n[11] Statistical equivalence tiers');
  const ids6 = ['A', 'B', 'C', 'D', 'E', 'F'];
  const sep = computeEquivalenceTiers(ids6, [0.50, 0.48, 0.20, 0.19, 0.02, 0.01], [0.01, 0.01, 0.01, 0.01, 0.02, 0.02]);
  check('separable levels form distinct tiers', sep.length === 3, `got ${sep.length}`);
  check('near-tied members share a tier', sep[0].participantIds.length === 2);
  check('near-zero tier is flagged', sep[sep.length - 1].indistinguishableFromZero);
  const flat = computeEquivalenceTiers(ids6, [0.31, 0.30, 0.30, 0.29, 0.29, 0.28], ids6.map(() => 0.05));
  check('a flat landscape collapses to ONE tier (no invented hierarchy)', flat.length === 1, `got ${flat.length}`);
  const chained = computeEquivalenceTiers(['A', 'B', 'C'], [.3, .2, .1], [.05, .05, .05]);
  check('unresolved adjacent differences stay in one tier', chained.length === 1);
  const unresolved = computeEquivalenceTiers(['A', 'B'], [.3, .1], [Number.NaN, .01]);
  check('missing standard error does not create a tier boundary', unresolved.length === 1);

  // ── 12. Cluster-level attribution is cheaper AND more stable at scale ─────
  console.log('\n[12] Cluster vs individual attribution');
  const nC2 = 30;
  const th = (i: number) => i % 5;
  const themeTopics = [[0, 1, 2, 3], [4, 5, 6], [7, 8], [9], [10]];
  const gameC2 = (S: number[]) => new Set(S.flatMap(i => themeTopics[th(i)])).size / 11;
  const assign2 = Array.from({ length: nC2 }, (_, i) => th(i));
  const indiv = await computeShapleyValues(nC2, gameC2, { samples: 20, seed: 3 });
  const clus = await computeClusterShapley(assign2, gameC2, { samples: 20, seed: 3 });
  console.log(`   individual: ${indiv.evaluations} evals, rankStability ${indiv.rankStability.toFixed(3)}`);
  console.log(`   cluster   : ${clus.evaluations} evals, rankStability ${clus.rankStability.toFixed(3)}`);
  check('cluster attribution costs far less', clus.evaluations < indiv.evaluations / 3);
  check('cluster attribution ranks more stably on themed data', clus.rankStability > indiv.rankStability);

  console.log(`\n${fail === 0 ? 'ALL CHECKS PASSED' : 'FAILURES'} — passed ${pass}, failed ${fail}`);
  process.exit(fail === 0 ? 0 : 1);
};
run();
