export interface AttributionCostOptions {
  exact?: boolean;
  samples?: number;
  maxEvaluations?: number;
  clusterAssignments?: number[];
  generationsPerCoalition?: number;
}

export interface CostEstimate {
  /** Worst-case coalition evaluations. */
  maxEvaluations: number;
  /** Worst-case summarisation calls, including repeated generations. */
  maxCompletions: number;
  /** Worst-case embedding calls (0 only when accounted for by the caller's local tier). */
  maxEmbeddingCalls: number;
  generationsPerCoalition: number;
  /** Plain-language warning to show before running. */
  note: string;
}

export const normalizedGenerationsPerCoalition = (requested?: number): number =>
  Math.max(2, Math.min(5, Math.floor(requested ?? 3)));

/** Conservative pre-flight ceiling. Memoisation may reduce coalition counts,
 * but never the predeclared repetitions within a coalition. */
export const estimateAttributionCost = (
  participantCount: number,
  options: AttributionCostOptions = {},
): CostEstimate => {
  const players = options.clusterAssignments
    ? new Set(options.clusterAssignments).size
    : participantCount;
  const generationsPerCoalition = normalizedGenerationsPerCoalition(options.generationsPerCoalition);

  if (options.exact) {
    const evaluations = Math.pow(2, players);
    return {
      maxEvaluations: evaluations,
      maxCompletions: evaluations * generationsPerCoalition,
      maxEmbeddingCalls: evaluations * generationsPerCoalition * 6,
      generationsPerCoalition,
      note:
        `Exact enumeration evaluates every one of the 2^${players} = ${evaluations.toLocaleString()} ` +
        `possible coalitions. The result has no permutation-sampling error, but model-generation ` +
        `variability remains. Every coalition is generated ${generationsPerCoalition} times and averaged. ` +
        `This is only practical for very small groups.`,
    };
  }

  const samples = options.samples ?? 30;
  const coalitionCeiling = Math.min(2 ** players, samples * players + 2);
  const maxEvaluations = Math.min(coalitionCeiling, options.maxEvaluations ?? coalitionCeiling);
  return {
    maxEvaluations,
    maxCompletions: maxEvaluations * generationsPerCoalition,
    maxEmbeddingCalls: maxEvaluations * generationsPerCoalition * 6,
    generationsPerCoalition,
    note:
      `Up to ${maxEvaluations} coalition values may be evaluated (${samples} permutations over ` +
      `${players} ${options.clusterAssignments ? 'clusters' : 'contributions'}). ` +
      `Each coalition is generated ${generationsPerCoalition} times and its utility is averaged; memoisation can reduce the actual total. ` +
      `Halving Monte Carlo sampling error costs roughly four times as much. ` +
      `Use the local TF-IDF tier to avoid embedding costs entirely.`,
  };
};
