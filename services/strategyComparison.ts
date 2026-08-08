import {
  StrategyComparisonResult,
  SummarizationStrategy,
  DiversityMetrics,
  ParticipantInput,
  AnalysisConfig
} from '../types';
import { generateCompletion } from './completionRouter';
import { cosineSimilarity, calculateGini, computeAveragePairwiseDistance, computeGlobalCentroid } from './mathUtils';

/**
 * Strategy Comparison Service
 * Runs multiple summarization strategies and compares their outcomes
 */

// Strategy-specific prompts
const getStrategyPrompt = (strategy: SummarizationStrategy): string => {
  switch (strategy) {
    case 'diversity':
      return 'CRITICAL: Prioritize DIVERSITY. Explicitly mention minority viewpoints, outliers, and unique perspectives. Ensure marginalized voices are represented.';
    case 'consensus':
      return 'CRITICAL: Prioritize CONSENSUS. Identify shared goals and agreements. Focus on common ground and minimize minor disagreements.';
    case 'balanced':
    default:
      return 'CRITICAL: Be BALANCED. Represent both the majority trends and significant minority concerns fairly.';
  }
};

// Generate summary with specific strategy
const generateStrategySummary = async (
  inputs: ParticipantInput[],
  strategy: SummarizationStrategy,
  config: AnalysisConfig
): Promise<string> => {
  const inputText = inputs.map(i => `- ${i.text}`).join('\n');

  const systemPrompt = `You are an expert AI facilitator for collaborative decision-making. Your goal is to synthesize participant inputs into a concise, actionable summary.

${getStrategyPrompt(strategy)}`;

  const userPrompt = `Here are the contributions from ${inputs.length} participants:\n${inputText}\n\nProvide a summary (150-200 words) that follows the specified strategy.`;

  return await generateCompletion(userPrompt, systemPrompt, config);
};

/**
 * Compute representation metrics for a strategy's summary using per-SENTENCE
 * matching with decay aggregation — the same methodology as the main analysis.
 *
 * CRITICAL: Previously, this embedded the whole summary as one vector and computed
 * cosine similarity per participant. That approach is fundamentally different from
 * the main analysis (per-sentence matching) and produces incomparable scores.
 * A long summary's single embedding is dominated by majority themes, making minority
 * participants appear even less represented than they are.
 *
 * Now uses the same per-sentence matching + secondary decay as analysis.ts:
 *   S_emb = s_1 + γ·s_2 + γ²·s_3 + …  (clamped to [0, 1])
 */
const computeSummaryMetrics = (
  summary: string,
  inputEmbeddings: number[][],
  sentenceEmbeddings: number[][]
): { avgRepresentation: number; metrics: DiversityMetrics } => {
  const SECONDARY_DECAY = 0.3;
  const MATCH_THRESHOLD = 0.5;

  // Per-participant: match against all summary sentences (same as main analysis)
  const representationScores = inputEmbeddings.map(emb => {
    const sims = sentenceEmbeddings
      .map(sentEmb => cosineSimilarity(emb, sentEmb))
      .sort((a, b) => b - a);

    if (sims.length === 0) return 0;

    // Aggregate with decay (coverage-aware scoring, Radev et al. 2004)
    let aggregated = sims[0];
    for (let k = 1; k < sims.length; k++) {
      if (sims[k] < MATCH_THRESHOLD) break;
      aggregated += sims[k] * Math.pow(SECONDARY_DECAY, k);
    }
    return Math.min(1, aggregated);
  });

  const avgRepresentation = representationScores.reduce((a, b) => a + b, 0) / representationScores.length;
  const gini = calculateGini(representationScores);
  const inputDiversity = computeAveragePairwiseDistance(inputEmbeddings);

  // Distinct representation gap (same as main analysis)
  const globalCentroid = computeGlobalCentroid(inputEmbeddings);
  const isolationScores = inputEmbeddings.map(emb => 1 - cosineSimilarity(emb, globalCentroid));

  const sortedByIsolation = representationScores
    .map((rep, i) => ({ rep, isolation: isolationScores[i] }))
    .sort((a, b) => b.isolation - a.isolation);

  const splitIndex = Math.floor(sortedByIsolation.length * 0.25);
  let distinctGap = 0;
  if (splitIndex > 0) {
    const distinctGroup = sortedByIsolation.slice(0, splitIndex);
    const majorityGroup = sortedByIsolation.slice(splitIndex);
    const avgDistinct = distinctGroup.reduce((sum, p) => sum + p.rep, 0) / distinctGroup.length;
    const avgMajority = majorityGroup.reduce((sum, p) => sum + p.rep, 0) / majorityGroup.length;
    distinctGap = avgMajority - avgDistinct;
  }

  return {
    avgRepresentation,
    metrics: {
      giniCoefficient: gini,
      inputDiversity,
      coverageUniformity: 1 - gini,
      distinctRepresentationGap: distinctGap,
      totalParticipants: inputEmbeddings.length
    }
  };
};

// Generate recommendation based on metrics
const generateRecommendation = (
  result: StrategyComparisonResult,
  allResults: StrategyComparisonResult[]
): string | undefined => {
  const bestAvgRep = Math.max(...allResults.map(r => r.avgRepresentation));
  const bestGini = Math.min(...allResults.map(r => r.metrics.giniCoefficient));
  const bestGap = Math.min(...allResults.map(r => r.metrics.distinctRepresentationGap));

  const isTopAvgRep = result.avgRepresentation >= bestAvgRep - 0.02;
  const isTopGini = result.metrics.giniCoefficient <= bestGini + 0.02;
  const isTopGap = result.metrics.distinctRepresentationGap <= bestGap + 0.02;

  if (isTopAvgRep && isTopGini && isTopGap) {
    return 'Best Overall';
  } else if (isTopAvgRep) {
    return 'Highest Coverage';
  } else if (isTopGini) {
    return 'Most Equitable';
  } else if (isTopGap) {
    return 'Best for Minorities';
  }

  return undefined;
};

/**
 * Main function: Run strategy comparison
 * Generates summaries with all 3 strategies and compares outcomes
 */
export const runStrategyComparison = async (
  inputs: ParticipantInput[],
  inputEmbeddings: number[][],
  config: AnalysisConfig,
  generateEmbedding: (text: string) => Promise<number[]>,
  onProgress?: (strategy: SummarizationStrategy, status: string) => void
): Promise<StrategyComparisonResult[]> => {
  const strategies: SummarizationStrategy[] = ['balanced', 'diversity', 'consensus'];
  const results: StrategyComparisonResult[] = [];

  for (const strategy of strategies) {
    try {
      onProgress?.(strategy, 'Generating summary...');

      // Generate summary
      const summary = await generateStrategySummary(inputs, strategy, config);

      onProgress?.(strategy, 'Embedding summary sentences...');

      // Split into sentences (same approach as main analysis)
      const sentences = summary.match(/[^.!?]+[.!?]+(?=\s+[A-Z]|$)/g) || [summary];

      // Embed each sentence individually (consistent with main analysis methodology)
      const sentenceEmbeddings: number[][] = [];
      for (const sent of sentences) {
        try {
          sentenceEmbeddings.push(await generateEmbedding(sent.trim()));
        } catch {
          sentenceEmbeddings.push(new Array(inputEmbeddings[0]?.length || 768).fill(0));
        }
      }

      onProgress?.(strategy, 'Computing metrics...');

      // Compute metrics using per-sentence matching (same as main analysis)
      const { avgRepresentation, metrics } = computeSummaryMetrics(
        summary,
        inputEmbeddings,
        sentenceEmbeddings
      );

      results.push({
        strategy,
        summary,
        metrics,
        avgRepresentation
      });

      // Small delay between strategies to avoid rate limiting
      if (strategy !== 'consensus') {
        await new Promise(resolve => setTimeout(resolve, 500));
      }
    } catch (e) {
      console.error(`Strategy comparison failed for ${strategy}:`, e);
      // Add placeholder result for failed strategy
      results.push({
        strategy,
        summary: `Failed to generate ${strategy} summary`,
        metrics: {
          giniCoefficient: 0,
          inputDiversity: 0,
          coverageUniformity: 0,
          distinctRepresentationGap: 0,
          totalParticipants: inputs.length
        },
        avgRepresentation: 0
      });
    }
  }

  // Add recommendations
  results.forEach(result => {
    result.recommendation = generateRecommendation(result, results);
  });

  return results;
};

/**
 * Find the best strategy based on a specific criterion
 */
export const findBestStrategy = (
  results: StrategyComparisonResult[],
  criterion: 'avgRepresentation' | 'gini' | 'gap' | 'overall'
): StrategyComparisonResult | null => {
  if (results.length === 0) return null;

  switch (criterion) {
    case 'avgRepresentation':
      return results.reduce((best, curr) =>
        curr.avgRepresentation > best.avgRepresentation ? curr : best
      );

    case 'gini':
      return results.reduce((best, curr) =>
        curr.metrics.giniCoefficient < best.metrics.giniCoefficient ? curr : best
      );

    case 'gap':
      return results.reduce((best, curr) =>
        curr.metrics.distinctRepresentationGap < best.metrics.distinctRepresentationGap ? curr : best
      );

    case 'overall':
    default:
      // Composite score: higher avgRep, lower gini, lower gap
      return results.reduce((best, curr) => {
        const currScore = curr.avgRepresentation - curr.metrics.giniCoefficient - curr.metrics.distinctRepresentationGap;
        const bestScore = best.avgRepresentation - best.metrics.giniCoefficient - best.metrics.distinctRepresentationGap;
        return currScore > bestScore ? curr : best;
      });
  }
};

/**
 * Get strategy description for display
 */
export const getStrategyDescription = (strategy: SummarizationStrategy): string => {
  const descriptions: Record<SummarizationStrategy, string> = {
    balanced: 'Represents both majority trends and minority concerns fairly',
    diversity: 'Prioritizes unique perspectives and marginalized voices',
    consensus: 'Focuses on shared goals and common ground'
  };
  return descriptions[strategy];
};

/**
 * Get strategy color for visualization
 */
export const getStrategyColor = (strategy: SummarizationStrategy): string => {
  const colors: Record<SummarizationStrategy, string> = {
    balanced: '#3b82f6',  // Blue
    diversity: '#8b5cf6', // Purple
    consensus: '#10b981'  // Green
  };
  return colors[strategy];
};

export default runStrategyComparison;
