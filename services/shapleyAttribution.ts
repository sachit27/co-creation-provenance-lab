/**
 * Counterfactual Shapley Attribution for Collective Synthesis
 * ===========================================================
 *
 * Every other measure in Provenance Lab is *correlational*: it infers that a
 * contribution shaped the summary because their embeddings are close. Proximity
 * is not provenance. A contribution can sit near a summary sentence the model
 * never used, and an outlier can be quietly paraphrased without any strong
 * similarity signal.
 *
 * This module estimates a counterfactual game-theoretic utility quantity: how much the summary
 * actually change when a contribution is withheld from the synthesis? The
 * Shapley value is the unique attribution satisfying efficiency, symmetry,
 * nullity and additivity (Shapley 1953), and has been used for data valuation
 * (Data Shapley, Ghorbani & Zou 2019; Beta Shapley, Kwon & Zou 2022). Here the
 * "players" are contributions and the characteristic function measures how well
 * a summary generated from a subset represents the whole input set.
 *
 *   φ_i = Σ_{S ⊆ C\{i}}  |S|!(n-|S|-1)!/n!  · [ v(S ∪ {i}) − v(S) ]
 *
 * Exact computation is exponential, so subsets are sampled via random
 * permutations — an unbiased estimator whose standard error is reported so the
 * caller can see whether the estimate has converged.
 *
 * COST. Each distinct subset evaluation normally requires regenerating a
 * summary, i.e. one model call. Budget accordingly: `samples` permutations of
 * n contributions cost at most samples × n evaluations, reduced substantially
 * by memoisation and by truncation (below). Use `clusterShapley` for large
 * consultations: attributing at cluster level costs O(samples × k) instead.
 *
 * INTERPRETATION. φ_i is *influence on the produced summary*, not entitlement.
 * A contribution can have low influence for legitimate reasons (it duplicates
 * others, or is out of scope). As with every other signal in this tool, it is
 * evidence for human review, not a verdict.
 */

/** Evaluates how well a summary generated from `subset` represents the whole input set. */
export type CharacteristicFn = (subsetIndices: number[]) => Promise<number> | number;

export interface ShapleyOptions {
  /** Number of random permutations. Higher = lower variance, linearly more cost. */
  samples?: number;
  /** Stop scanning a permutation once the marginal gain stays below this for
   *  `truncationPatience` consecutive players (truncated Monte Carlo Shapley). */
  truncationTolerance?: number;
  truncationPatience?: number;
  /** Hard cap on characteristic-function evaluations (cost ceiling). */
  maxEvaluations?: number;
  /** Deterministic seed. */
  seed?: number;
  /**
   * Antithetic permutation pairing (Castro et al. 2009). Each sampled
   * permutation is paired with its exact reverse: a player appearing early in
   * one appears late in the other, so their marginal contributions are
   * negatively correlated and the pair mean has lower variance than two
   * independent draws at the same cost.
   */
  antithetic?: boolean;
  onProgress?: (done: number, total: number) => void;
}

export interface ShapleyResult {
  /** φ_i per contribution, index-aligned with the input. */
  values: number[];
  /** Standard error of each estimate (across permutations). */
  standardErrors: number[];
  /** Permutations actually completed. */
  samplesUsed: number;
  /** Characteristic-function evaluations actually performed. */
  evaluations: number;
  /** v(∅) and v(N). */
  vEmpty: number;
  vFull: number;
  /** |Σφ_i − (v(N) − v(∅))| — should be ≈ 0 (efficiency axiom). */
  efficiencyGap: number;
  /**
   * Fraction of players whose standard error is small relative to the SPREAD of
   * the estimates (max φ − min φ).
   *
   * v3: the previous flag compared each SE against 5% of max|φ|. That is
   * pathologically scale-dependent — as sampling refines the estimates max|φ|
   * shrinks, so the bar tightens faster than the errors fall and measured
   * convergence went *down* with more samples (17% at 10 permutations, 3% at
   * 100). Spread is stable under refinement.
   */
  convergedFraction: number;
  /** True when most players are individually resolved AND the ranking is stable. */
  converged: boolean;
  /**
   * Split-half rank agreement (Spearman) between estimates from odd- and
   * even-numbered permutations. This is what a reader actually consumes — the
   * ordering of the table — and it costs nothing extra to compute. Per-player
   * error bars can look acceptable while the ranking is still churning.
   */
  rankStability: number;
  /** Share of the top-5 that is common to both halves (0–1). */
  topKAgreement: number;
}

// ── Deterministic PRNG ──────────────────────────────────────────────────────
const mulberry32 = (seed: number) => () => {
  seed |= 0; seed = (seed + 0x6D2B79F5) | 0;
  let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
};

const shuffled = (n: number, rand: () => number): number[] => {
  const a = Array.from({ length: n }, (_, i) => i);
  for (let i = n - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
};

/** Memoises v(S) on the sorted subset, so repeated coalitions cost nothing. */
const memoise = (v: CharacteristicFn) => {
  const cache = new Map<string, number>();
  let evaluations = 0;
  const call = async (subset: number[]): Promise<number> => {
    const key = [...subset].sort((a, b) => a - b).join(',');
    const hit = cache.get(key);
    if (hit !== undefined) return hit;
    const canonicalSubset = key ? key.split(',').map(Number) : [];
    const val = await v(canonicalSubset);
    cache.set(key, val);
    evaluations++;
    return val;
  };
  return { call, stats: () => evaluations };
};

/**
 * Truncated Monte Carlo Shapley over contributions.
 *
 * Walks random permutations, adding one contribution at a time and recording
 * each marginal gain. Truncation skips the tail of a permutation once marginal
 * gains have become negligible, which is where most of the cost sits.
 */
export const computeShapleyValues = async (
  n: number,
  v: CharacteristicFn,
  options: ShapleyOptions = {}
): Promise<ShapleyResult> => {
  const {
    samples = 50,
    truncationTolerance = 1e-4,
    truncationPatience = Number.POSITIVE_INFINITY,
    maxEvaluations = Number.POSITIVE_INFINITY,
    seed = 42,
    antithetic = true,
    onProgress,
  } = options;

  const rand = mulberry32(seed);
  const { call, stats } = memoise(v);

  const vEmpty = await call([]);
  const vFull = await call(Array.from({ length: n }, (_, i) => i));

  // Per-player running mean/variance (Welford).
  const mean = new Array(n).fill(0);
  const m2 = new Array(n).fill(0);
  const count = new Array(n).fill(0);
  const pairMean = new Array(n).fill(0);
  const pairM2 = new Array(n).fill(0);
  let pairCount = 0;
  let firstInPair: number[] | null = null;
  // Split-half accumulators: odd/even permutations give two independent
  // estimates, so rank stability comes free (no additional evaluations).
  const halfSum = [new Array(n).fill(0), new Array(n).fill(0)];
  const halfCount = [0, 0];

  let samplesUsed = 0;
  let budgetExhausted = false;

  let pendingReverse: number[] | null = null;

  for (let s = 0; s < samples && !budgetExhausted; s++) {
    // Antithetic pairing: draw a fresh permutation, then use its reverse next.
    let perm: number[];
    if (antithetic && pendingReverse) {
      perm = pendingReverse;
      pendingReverse = null;
    } else {
      perm = shuffled(n, rand);
      if (antithetic) pendingReverse = [...perm].reverse();
    }
    const coalition: number[] = [];
    const marginals = new Array(n).fill(0);
    let prev = vEmpty;
    let negligible = 0;
    let complete = true;

    for (const player of perm) {
      if (negligible >= truncationPatience) {
        // Truncation: remaining marginals assumed ~0 rather than paying to check.
        marginals[player] = 0;
        continue;
      }
      // Hard cost ceiling, enforced before each *new* evaluation. A permutation
      // that cannot be finished within budget is discarded rather than partially
      // recorded, which would bias the estimator toward early-position players.
      const wouldEvaluate = stats() >= maxEvaluations;
      if (wouldEvaluate) { complete = false; break; }

      coalition.push(player);
      const current = await call(coalition);
      const marginal = current - prev;
      prev = current;
      negligible = Math.abs(marginal) < truncationTolerance ? negligible + 1 : 0;
      marginals[player] = marginal;
    }

    if (!complete) { budgetExhausted = true; break; }

    // Commit the completed permutation (Welford update).
    //
    // Split-half assignment must be by antithetic PAIR, not by alternating
    // permutation. With pairing enabled, alternating would place every forward
    // permutation in one half and every reverse in the other — the two halves
    // would then be negatively correlated by construction and rank stability
    // would be understated (measured 0.66 instead of 0.89 at 100 permutations).
    const half = antithetic ? Math.floor(samplesUsed / 2) % 2 : samplesUsed % 2;
    for (let p = 0; p < n; p++) {
      count[p]++;
      const delta = marginals[p] - mean[p];
      mean[p] += delta / count[p];
      m2[p] += delta * (marginals[p] - mean[p]);
      halfSum[half][p] += marginals[p];
    }
    if (antithetic) {
      if (firstInPair) {
        pairCount++;
        for (let p = 0; p < n; p++) {
          const pairValue = (firstInPair[p] + marginals[p]) / 2;
          const delta = pairValue - pairMean[p];
          pairMean[p] += delta / pairCount;
          pairM2[p] += delta * (pairValue - pairMean[p]);
        }
        firstInPair = null;
      } else {
        firstInPair = marginals;
      }
    }
    halfCount[half]++;

    samplesUsed++;
    onProgress?.(s + 1, samples);
  }

  // Reverse permutations share the same random draw. Estimate Monte Carlo
  // variation across independent PAIR means, never across the two dependent
  // members. An unmatched forward draw cannot support a pair-based SE.
  const standardErrors = antithetic
    ? pairM2.map(v2 => pairCount > 1 && !firstInPair ? Math.sqrt(v2 / (pairCount - 1) / pairCount) : Number.NaN)
    : m2.map((v2, i) => count[i] > 1 ? Math.sqrt(v2 / (count[i] - 1) / count[i]) : Number.NaN);

  const total = mean.reduce((a, b) => a + b, 0);
  const efficiencyGap = Math.abs(total - (vFull - vEmpty));

  // Spread-relative convergence (stable under refinement, unlike max|φ|).
  const spread = Math.max(...mean) - Math.min(...mean);
  const ref = spread > 1e-12 ? spread : Math.max(...mean.map(Math.abs), 1e-12);
  const resolved = standardErrors.filter(se => !Number.isNaN(se) && se < 0.15 * ref).length;
  const convergedFraction = n > 0 ? resolved / n : 0;

  // Split-half rank agreement.
  const rankOf = (xs: number[]) => {
    const order = xs.map((v, i) => ({ v, i })).sort((a, b) => a.v - b.v);
    const r = new Array(xs.length).fill(0);
    for (let i = 0; i < order.length;) {
      let end = i + 1;
      while (end < order.length && order[end].v === order[i].v) end++;
      const midrank = ((i + 1) + end) / 2;
      for (let j = i; j < end; j++) r[order[j].i] = midrank;
      i = end;
    }
    return r;
  };
  const spearman = (a: number[], b: number[]) => {
    const ra = rankOf(a), rb = rankOf(b), m = a.length;
    if (m < 3) return Number.NaN;
    const ma = ra.reduce((x, y) => x + y, 0) / m, mb = rb.reduce((x, y) => x + y, 0) / m;
    let num = 0, da = 0, db = 0;
    for (let i = 0; i < m; i++) {
      num += (ra[i] - ma) * (rb[i] - mb); da += (ra[i] - ma) ** 2; db += (rb[i] - mb) ** 2;
    }
    return da === 0 || db === 0 ? Number.NaN : num / Math.sqrt(da * db);
  };

  let rankStability = Number.NaN;
  let topKAgreement = Number.NaN;
  if (halfCount[0] > 0 && halfCount[1] > 0) {
    const a = halfSum[0].map(v => v / halfCount[0]);
    const b = halfSum[1].map(v => v / halfCount[1]);
    rankStability = spearman(a, b);
    const topK = (xs: number[], k: number) =>
      new Set(xs.map((v, i) => ({ v, i })).sort((x, y) => y.v - x.v).slice(0, k).map(o => o.i));
    const k = Math.min(5, n);
    const ta = topK(a, k), tb = topK(b, k);
    topKAgreement = [...ta].filter(i => tb.has(i)).length / k;
  }

  // Headline flag requires BOTH individual resolution and a stable ordering:
  // error bars can look fine while the ranking users read is still moving.
  const converged =
    convergedFraction >= 0.8 && !Number.isNaN(rankStability) && rankStability >= 0.9;

  return {
    values: mean,
    standardErrors,
    samplesUsed,
    evaluations: stats(),
    vEmpty,
    vFull,
    efficiencyGap,
    convergedFraction,
    converged,
    rankStability,
    topKAgreement,
  };
};

/**
 * Exact Shapley by enumeration. Only for n ≤ ~12 — used to validate the
 * Monte Carlo estimator and for small workshops where exactness is affordable.
 */
export const computeExactShapley = async (
  n: number,
  v: CharacteristicFn
): Promise<number[]> => {
  if (n > 16) throw new Error(`Exact Shapley is exponential; n=${n} is too large. Use computeShapleyValues.`);
  const { call } = memoise(v);
  const factorial = (k: number): number => (k <= 1 ? 1 : k * factorial(k - 1));
  const phi = new Array(n).fill(0);

  for (let mask = 0; mask < (1 << n); mask++) {
    const subset: number[] = [];
    for (let i = 0; i < n; i++) if (mask & (1 << i)) subset.push(i);
    const vS = await call(subset);
    for (let i = 0; i < n; i++) {
      if (mask & (1 << i)) continue;
      const vSi = await call([...subset, i]);
      const w = (factorial(subset.length) * factorial(n - subset.length - 1)) / factorial(n);
      phi[i] += w * (vSi - vS);
    }
  }
  return phi;
};

/**
 * Cluster-level Shapley: attributes influence to semantic clusters rather than
 * individuals, reducing cost from O(samples × n) to O(samples × k). Each
 * cluster's value is then split among its members in proportion to `weights`
 * (e.g. representation scores), which preserves the efficiency axiom.
 */
export const computeClusterShapley = async (
  clusterAssignments: number[],
  v: CharacteristicFn,
  options: ShapleyOptions = {},
  weights?: number[]
): Promise<ShapleyResult> => {
  const clusterIds = [...new Set(clusterAssignments)].sort((a, b) => a - b);
  const membersOf = new Map<number, number[]>(
    clusterIds.map(c => [c, clusterAssignments.map((a, i) => (a === c ? i : -1)).filter(i => i >= 0)])
  );

  const clusterV: CharacteristicFn = (subsetClusters) =>
    v(subsetClusters.flatMap(ci => membersOf.get(clusterIds[ci]) ?? []));

  const res = await computeShapleyValues(clusterIds.length, clusterV, options);

  // Distribute each cluster's φ across its members.
  const values = new Array(clusterAssignments.length).fill(0);
  const standardErrors = new Array(clusterAssignments.length).fill(0);
  clusterIds.forEach((cid, ci) => {
    const members = membersOf.get(cid) ?? [];
    const w = members.map(i => (weights?.[i] ?? 1));
    const wSum = w.reduce((a, b) => a + b, 0) || members.length || 1;
    members.forEach((i, k) => {
      const share = (w[k] || 1) / wSum;
      values[i] = res.values[ci] * share;
      standardErrors[i] = res.standardErrors[ci] * share;
    });
  });

  return { ...res, values, standardErrors };
};

/**
 * Convenience characteristic function: semantic coverage of the full input set
 * by a summary generated from a subset.
 *
 * `generate` should synthesise a summary from the given contributions, and
 * `coverage` should score how well that summary represents ALL contributions —
 * typically the same representation measure used elsewhere in the tool, so
 * Shapley influence and representation are on comparable scales.
 */
export const makeCoverageCharacteristic = (
  generate: (subsetIndices: number[]) => Promise<string>,
  coverage: (summary: string) => Promise<number> | number
): CharacteristicFn => async (subset) => {
  if (subset.length === 0) return 0; // v(∅) = 0: no inputs, nothing represented
  const summary = await generate(subset);
  return coverage(summary);
};

/**
 * Groups contributions into statistical equivalence tiers.
 *
 * A strict 1..N leaderboard implies a precision the estimates do not have. When
 * several people make the same point their true Shapley values are nearly
 * identical, so the ordering between them is sampling noise — which is exactly
 * why split-half rank stability stays low on such data. Presenting "#3 vs #4"
 * then manufactures a hierarchy out of nothing, and in a participation audit
 * that is not a cosmetic problem: it invites a facilitator to treat one
 * contributor as more deserving than another on the strength of noise.
 *
 * Adjacent contributions are placed in different tiers only when their estimates
 * are separated by more than the combined uncertainty:
 *
 *     |phi_i - phi_j| > 2 * sqrt(SE_i^2 + SE_j^2)
 *
 * Everything else shares a tier, and the UI can say so plainly.
 */
export interface EquivalenceTier {
  /** 0 = highest influence tier. */
  tier: number;
  participantIds: string[];
  meanPhi: number;
  /** True when every member's phi is within 2 SE of zero. */
  indistinguishableFromZero: boolean;
}

export const computeEquivalenceTiers = (
  participantIds: string[],
  values: number[],
  standardErrors: number[]
): EquivalenceTier[] => {
  const items = participantIds
    .map((id, i) => ({ id, phi: values[i], se: Number.isFinite(standardErrors[i]) ? Math.max(0, standardErrors[i]) : Number.POSITIVE_INFINITY }))
    .sort((a, b) => b.phi - a.phi);
  if (items.length === 0) return [];

  const tiers: EquivalenceTier[] = [];
  let current = [items[0]];

  const separated = (a: { phi: number; se: number }, b: { phi: number; se: number }) =>
    Math.abs(a.phi - b.phi) > 2 * Math.sqrt(a.se * a.se + b.se * b.se) + 1e-12;

  for (let i = 1; i < items.length; i++) {
    // Check neighboring estimates. A chain of unresolved adjacent differences
    // stays together instead of implying an unsupported between-tier boundary.
    if (separated(items[i - 1], items[i])) {
      tiers.push(finaliseTier(tiers.length, current));
      current = [items[i]];
    } else {
      current.push(items[i]);
    }
  }
  tiers.push(finaliseTier(tiers.length, current));
  return tiers;
};

const finaliseTier = (
  tier: number,
  members: { id: string; phi: number; se: number }[]
): EquivalenceTier => ({
  tier,
  participantIds: members.map(m => m.id),
  meanPhi: members.reduce((a, m) => a + m.phi, 0) / members.length,
  indistinguishableFromZero: members.every(m => Math.abs(m.phi) < 2 * m.se),
});
