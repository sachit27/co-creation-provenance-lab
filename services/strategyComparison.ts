import {
  StrategyComparisonResult,
  SummarizationStrategy,
  DiversityMetrics,
  ParticipantInput,
  AnalysisConfig
} from '../types';
import { generateCompletion as generateGeminiCompletion } from './gemini';
import { generateOllamaCompletion } from './ollama';
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

  if (config.aiProvider === 'ollama') {
    return await generateOllamaCompletion(userPrompt, systemPrompt, config.model);
  }
  return await generateGeminiCompletion(userPrompt, systemPrompt, config.model);
};

// Compute metrics for a summary
const computeSummaryMetrics = (
  summary: string,
  inputEmbeddings: number[][],
  summaryEmbedding: number[]
): { avgRepresentation: number; metrics: DiversityMetrics } => {
  // Compute representation scores
  const representationScores = inputEmbeddings.map(emb =>
    cosineSimilarity(emb, summaryEmbedding)
  );

  const avgRepresentation = representationScores.reduce((a, b) => a + b, 0) / representationScores.length;
  const gini = calculateGini(representationScores);
  const inputDiversity = computeAveragePairwiseDistance(inputEmbeddings);

  // Compute distinct representation gap
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

      onProgress?.(strategy, 'Computing metrics...');

      // Generate summary embedding
      const summaryEmbedding = await generateEmbedding(summary);

      // Compute metrics
      const { avgRepresentation, metrics } = computeSummaryMetrics(
        summary,
        inputEmbeddings,
        summaryEmbedding
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
