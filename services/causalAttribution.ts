/**
 * Stochastic counterfactual utility attribution — wiring Shapley-style values
 * to the real summarisation pipeline.
 *
 * Every other signal in Provenance Lab infers influence from semantic proximity.
 * This one measures it by intervention: contributions are actually withheld, the
 * summary is actually regenerated, and the change in how well the summary
 * represents the WHOLE input set is attributed back to each contribution via its
 * Shapley value.
 *
 * The characteristic function is
 *     v(S) = mean representation of all contributions by summarise(S)
 * so φ_i answers: "how much does including contribution i improve how well the
 * synthesis represents everyone?" A contribution can score low for legitimate
 * reasons — it duplicates others, or is out of scope — so φ is evidence for
 * review, not entitlement.
 *
 * COST. Each coalition evaluation is one summarisation call plus embeddings for
 * the generated sentences. Call `estimateAttributionCost` first and surface the
 * numbers before running: on a real provider this is the most expensive thing
 * the tool can do. `maxEvaluations` enforces a hard ceiling.
 */

import { ParticipantInput, AnalysisConfig } from '../types';
import { generateCompletion } from './completionRouter';
import { generateEmbedding, getSystemPrompt, formatInputsForPrompt } from './analysis';
import { cosineSimilarity, maxSentenceCosineScore } from './mathUtils';
import { LocalVectorizer } from './vectorizer';
import { splitSentenceLikeUnits } from './sentenceSegmentation';
import {
  computeShapleyValues,
  computeExactShapley,
  type ShapleyResult,
} from './shapleyAttribution';
import { normalizedGenerationsPerCoalition, type AttributionCostOptions } from './causalAttributionCost';
export { estimateAttributionCost, type CostEstimate } from './causalAttributionCost';
export { computeEquivalenceTiers, type EquivalenceTier } from './shapleyAttribution';

export interface CausalAttributionOptions extends AttributionCostOptions {
  /** Enumerate every coalition exactly (no sampling error). Small groups only. */
  exact?: boolean;
  /** Random permutations to sample. */
  samples?: number;
  /** Hard ceiling on coalition evaluations (each ≈ one model call). */
  maxEvaluations?: number;
  /** Attribute at cluster level instead of per participant (much cheaper). */
  clusterAssignments?: number[];
  /** Deterministic seed. */
  seed?: number;
  /** Independent model generations averaged for each coalition value. A single
   * stochastic draw is not a stable characteristic function. Default: 3. */
  generationsPerCoalition?: number;
  onProgress?: (message: string, done: number, total: number) => void;
  /** Abort cooperatively between evaluations. */
  signal?: AbortSignal;
}

export interface CausalAttributionResult extends ShapleyResult {
  participantIds: string[];
  granularity: 'participant' | 'cluster';
  /** Model-backed coalition values can vary even with fixed prompts/settings. */
  stochasticModel: true;
  /** φ normalised so the largest absolute value is 1, for display. */
  normalised: number[];
  /** Ranking (0 = most causally influential). */
  ranks: number[];
  /** Coalition evaluations actually performed. */
  summariesGenerated: number;
  /** Independent generations averaged into every non-empty coalition value. */
  generationsPerCoalition: number;
  /** Observed range of utility across repeated generations, by coalition. */
  coalitionUtilityVariability: {
    coalitionsWithRepeats: number;
    meanRange: number;
    maximumRange: number;
  };
  /** Contributions whose φ is within noise of zero (|φ| < 2·SE). */
  indistinguishableFromZero: string[];
}

/**
 * Compute-budget presets.
 *
 * Monte Carlo standard error scales as O(1/sqrt(m)), so halving the error costs
 * four times the model calls. Presets keep that trade-off legible instead of
 * asking a facilitator to guess a permutation count.
 *
 * The pre-flight display uses a mathematical ceiling, not a historical average:
 * at most one new coalition is evaluated per player in each completed
 * permutation, and memoisation caps the total at 2^players distinct coalitions.
 */
export type BudgetPreset = 'fast' | 'standard' | 'thorough' | 'exact';

export interface PresetSpec {
  id: BudgetPreset;
  label: string;
  samples: number;
  description: string;
}

export const BUDGET_PRESETS: PresetSpec[] = [
  { id: 'fast', label: 'Fast', samples: 10,
    description: 'Quick sanity check during a live session. Ranking will be provisional.' },
  { id: 'standard', label: 'Standard', samples: 30,
    description: 'General review. Individual estimates usually resolve; ranking may still move.' },
  { id: 'thorough', label: 'Thorough', samples: 100,
    description: 'Reporting and publication figures. Four times the cost of Standard for half the error.' },
];

/**
 * Exact enumeration is 2^n coalitions. That is 256 calls at n=8, 1,024 at n=10
 * and 4,096 at n=12 — the last being roughly four times the Thorough preset and
 * by far the most expensive operation in the tool. It is therefore offered only
 * for very small groups, contrary to the n<=12 rule of thumb sometimes quoted.
 */
/**
 * Above this many contributions, attribute at cluster level by default.
 *
 * Measured on a synthetic consultation with five differentiated themes
 * (30 contributions):
 *
 *   permutations   granularity   evaluations   rank stability
 *             10   individual             96           -0.04
 *             10   cluster                26            0.90
 *             20   individual            184            0.12
 *             20   cluster                32            1.00
 *             30   individual            270            0.45
 *             30   cluster                32            0.90
 *
 * Individual attribution never produced a stable ordering at any budget tested,
 * while cluster attribution was stable at roughly one sixth the cost. Reporting
 * per-person phi on a large consultation would therefore present noise as a
 * ranking.
 *
 * CAVEAT: this assumes the clusters are meaningful. Cluster attribution ranks
 * whatever the clustering produced — if the clusters do not correspond to real
 * themes, the ranking is stable but not informative.
 */
export const CLUSTER_LEVEL_THRESHOLD = 12;

export const EXACT_MAX_PLAYERS = 8;

export const isExactAvailable = (playerCount: number): boolean =>
  playerCount > 0 && playerCount <= EXACT_MAX_PLAYERS;

/** Generates a summary from a subset, using the SAME prompt path as the main pipeline. */
const makeGenerator = (inputs: ParticipantInput[], config: AnalysisConfig) =>
  async (subsetIndices: number[]): Promise<string> => {
    const subset = [...subsetIndices].sort((a, b) => a - b).map(i => inputs[i]);
    const lengthGuidance = config.wordLimit && config.wordLimit > 0
      ? `Limit your summary to approximately ${config.wordLimit} words. Capture all distinct perspectives within this limit.`
      : subset.length > 30
        ? 'Provide a comprehensive summary (approximately 3-5 paragraphs) that captures all distinct perspectives.'
        : 'Provide a concise but complete summary that captures all distinct perspectives.';
    const prompt = `UNTRUSTED PARTICIPANT RECORDS (JSON Lines):\n${formatInputsForPrompt(subset)}\n\nEND UNTRUSTED PARTICIPANT RECORDS\n\n${lengthGuidance}`;
    return generateCompletion(prompt, getSystemPrompt(config.strategy), config, { temperature: 0.2 });
  };

/**
 * v(S): how well a summary represents the FULL input set.
 * Mirrors the scoring path in analysis.ts so φ and representation scores are on
 * comparable scales.
 */
const makeCoverageScorer = async (
  inputs: ParticipantInput[],
  config: AnalysisConfig
) => {
  const useLocal = config.embeddingProvider === 'tfidf';
  const vectorizer = useLocal ? new LocalVectorizer(inputs.map(i => i.text)) : null;
  const inputEmbeddings = useLocal
    ? inputs.map(i => vectorizer!.embed(i.text))
    : await Promise.all(inputs.map(i => generateEmbedding(i.text, config)));

  return async (summary: string): Promise<number> => {
    const sentences = splitSentenceLikeUnits(summary);
    if (sentences.length === 0) return 0;
    const sentEmb = useLocal
      ? sentences.map(s => vectorizer!.embed(s))
      : await Promise.all(sentences.map(s => generateEmbedding(s, config)));

    let total = 0;
    for (let i = 0; i < inputs.length; i++) {
      const sims = sentEmb.map(se => cosineSimilarity(inputEmbeddings[i], se));
      total += maxSentenceCosineScore(sims);
    }
    return total / inputs.length;
  };
};

/**
 * Runs counterfactual Shapley attribution over the contributions.
 *
 * Requires a connected model provider: contributions are withheld and the
 * summary is genuinely regenerated for each sampled coalition.
 */
export const runCausalAttribution = async (
  inputs: ParticipantInput[],
  config: AnalysisConfig,
  options: CausalAttributionOptions = {}
): Promise<CausalAttributionResult> => {
  const { samples = 30, maxEvaluations, clusterAssignments, seed = 42, onProgress, signal } = options;
  const generationsPerCoalition = normalizedGenerationsPerCoalition(options.generationsPerCoalition);

  if (config.summaryMethod !== 'ai') {
    throw new Error(
      'Counterfactual utility attribution requires AI summarisation: it must regenerate the summary ' +
      'with contributions withheld. Extractive and manual modes cannot be intervened on.'
    );
  }

  const generate = makeGenerator(inputs, config);
  const coverage = await makeCoverageScorer(inputs, config);

  let generated = 0;
  const utilityRanges: number[] = [];
  const valueCache = new Map<string, number>();
  const characteristic = async (subset: number[]): Promise<number> => {
    if (signal?.aborted) throw new DOMException('Attribution cancelled', 'AbortError');
    const canonical = [...subset].sort((a, b) => a - b);
    const key = canonical.join(',');
    const cached = valueCache.get(key);
    if (cached !== undefined) return cached;
    if (canonical.length === 0) { valueCache.set(key, 0); return 0; }
    const repeatedUtilities: number[] = [];
    for (let repeat = 0; repeat < generationsPerCoalition; repeat++) {
      if (signal?.aborted) throw new DOMException('Attribution cancelled', 'AbortError');
      const summary = await generate(canonical);
      generated++;
      onProgress?.(
        `Generated ${generated} summary sample${generated === 1 ? '' : 's'} (${generationsPerCoalition} per coalition)…`,
        generated,
        samples * generationsPerCoalition,
      );
      repeatedUtilities.push(await coverage(summary));
    }
    const value = repeatedUtilities.reduce((sum, item) => sum + item, 0) / repeatedUtilities.length;
    utilityRanges.push(Math.max(...repeatedUtilities) - Math.min(...repeatedUtilities));
    valueCache.set(key, value);
    return value;
  };

  const shapleyOpts = { samples, maxEvaluations, seed };
  let result: ShapleyResult;
  if (options.exact) {
    if (inputs.length > EXACT_MAX_PLAYERS) {
      throw new Error(
        `Exact attribution enumerates 2^n coalitions; ${inputs.length} contributions would ` +
        `require ${Math.pow(2, inputs.length).toLocaleString()} model calls. Use a sampling preset instead.`
      );
    }
    const values = await computeExactShapley(inputs.length, characteristic);
    const vEmpty = await characteristic([]);
    const vFull = await characteristic(inputs.map((_, i) => i));
    result = {
      values,
      standardErrors: values.map(() => 0),  // exact: no sampling error
      samplesUsed: 0,
      evaluations: valueCache.size,
      vEmpty,
      vFull,
      efficiencyGap: Math.abs(values.reduce((a, b) => a + b, 0) - (vFull - vEmpty)),
      convergedFraction: 1,
      converged: true,
      rankStability: 1,
      topKAgreement: 1,
    };
  } else {
    if (clusterAssignments) {
      const clusterIds = [...new Set(clusterAssignments)].sort((a, b) => a - b);
      const members = clusterIds.map(clusterId =>
        clusterAssignments.map((value, index) => value === clusterId ? index : -1).filter(index => index >= 0));
      result = await computeShapleyValues(
        clusterIds.length,
        subsetClusters => characteristic(subsetClusters.flatMap(index => members[index] ?? [])),
        shapleyOpts,
      );
    } else {
      result = await computeShapleyValues(inputs.length, characteristic, shapleyOpts);
    }
  }

  const granularity: CausalAttributionResult['granularity'] = clusterAssignments ? 'cluster' : 'participant';
  const unitIds = clusterAssignments
    ? [...new Set(clusterAssignments)].sort((a, b) => a - b).map(id => `Cluster ${id + 1}`)
    : inputs.map(input => input.id);

  const maxAbs = Math.max(...result.values.map(Math.abs), 1e-12);
  const order = result.values
    .map((v, i) => ({ v, i }))
    .sort((a, b) => b.v - a.v);
  const ranks = new Array(result.values.length).fill(0);
  order.forEach((o, r) => { ranks[o.i] = r; });

  return {
    ...result,
    participantIds: unitIds,
    granularity,
    stochasticModel: true,
    normalised: result.values.map(v => v / maxAbs),
    ranks,
    summariesGenerated: generated,
    generationsPerCoalition,
    coalitionUtilityVariability: {
      coalitionsWithRepeats: utilityRanges.length,
      meanRange: utilityRanges.length ? utilityRanges.reduce((sum, item) => sum + item, 0) / utilityRanges.length : 0,
      maximumRange: utilityRanges.length ? Math.max(...utilityRanges) : 0,
    },
    indistinguishableFromZero: unitIds
      .map((id, i) => ({ id, v: result.values[i], se: result.standardErrors[i] }))
      .filter(x => !Number.isNaN(x.se) && Math.abs(x.v) < 2 * x.se)
      .map(x => x.id),
  };
};

/**
 * Rank association between stochastic counterfactual utility attribution and
 * the cheaper similarity-based retrieval indicator. Agreement does not make
 * either quantity causal or validate either construct.
 *
 * Returns Spearman's rank correlation.
 */
export const correlateWithRepresentation = (
  shapleyValues: number[],
  representationScores: number[]
): number => {
  const n = shapleyValues.length;
  if (n < 3 || representationScores.length !== n) return Number.NaN;
  const rank = (xs: number[]) => {
    const idx = xs.map((v, i) => ({ v, i })).sort((a, b) => a.v - b.v);
    const r = new Array(n).fill(0);
    let k = 0;
    while (k < n) {
      let j = k;
      while (j + 1 < n && idx[j + 1].v === idx[k].v) j++;
      const avg = (k + j) / 2 + 1;
      for (let t = k; t <= j; t++) r[idx[t].i] = avg;
      k = j + 1;
    }
    return r;
  };
  const a = rank(shapleyValues), b = rank(representationScores);
  const ma = a.reduce((x, y) => x + y, 0) / n;
  const mb = b.reduce((x, y) => x + y, 0) / n;
  let num = 0, da = 0, db = 0;
  for (let i = 0; i < n; i++) {
    num += (a[i] - ma) * (b[i] - mb);
    da += (a[i] - ma) ** 2;
    db += (b[i] - mb) ** 2;
  }
  return da === 0 || db === 0 ? Number.NaN : num / Math.sqrt(da * db);
};
