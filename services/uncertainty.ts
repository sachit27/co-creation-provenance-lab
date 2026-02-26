import { UncertaintyMetrics, ParticipantAnalysis } from '../types';
import { calculateGini } from './mathUtils';

/**
 * Uncertainty Quantification Service
 * Uses bootstrap resampling to compute confidence intervals for key metrics
 */

// Bootstrap resampling: randomly sample with replacement
const bootstrapSample = <T>(data: T[]): T[] => {
  const n = data.length;
  const sample: T[] = [];

  for (let i = 0; i < n; i++) {
    const randomIndex = Math.floor(Math.random() * n);
    sample.push(data[randomIndex]);
  }

  return sample;
};

// Compute percentile from sorted array
const percentile = (sortedValues: number[], p: number): number => {
  const index = (p / 100) * (sortedValues.length - 1);
  const lower = Math.floor(index);
  const upper = Math.ceil(index);

  if (lower === upper) return sortedValues[lower];

  const weight = index - lower;
  return sortedValues[lower] * (1 - weight) + sortedValues[upper] * weight;
};

// Compute confidence interval from bootstrap samples
const computeCI = (samples: number[], confidenceLevel: number = 0.95): {
  lower: number;
  upper: number;
  point: number;
} => {
  const sorted = [...samples].sort((a, b) => a - b);
  const alpha = 1 - confidenceLevel;

  const lower = percentile(sorted, (alpha / 2) * 100);
  const upper = percentile(sorted, (1 - alpha / 2) * 100);
  const point = samples.reduce((a, b) => a + b, 0) / samples.length;

  return { lower, upper, point };
};

// Compute Gini coefficient for a sample
const computeGiniFromScores = (scores: number[]): number => {
  return calculateGini(scores);
};

// Compute average representation for a sample
const computeAvgRepresentation = (participants: ParticipantAnalysis[]): number => {
  if (participants.length === 0) return 0;
  return participants.reduce((sum, p) => sum + p.representationScore, 0) / participants.length;
};

// Compute representation gap for a sample
const computeGap = (participants: ParticipantAnalysis[]): number => {
  if (participants.length < 4) return 0;

  const sortedByIsolation = [...participants].sort((a, b) => b.semanticIsolation - a.semanticIsolation);
  const splitIndex = Math.floor(participants.length * 0.25);

  if (splitIndex === 0) return 0;

  const distinctGroup = sortedByIsolation.slice(0, splitIndex);
  const majorityGroup = sortedByIsolation.slice(splitIndex);

  const avgRepDistinct = distinctGroup.reduce((sum, p) => sum + p.representationScore, 0) / distinctGroup.length;
  const avgRepMajority = majorityGroup.reduce((sum, p) => sum + p.representationScore, 0) / majorityGroup.length;

  return avgRepMajority - avgRepDistinct;
};

/**
 * Compute uncertainty metrics using bootstrap resampling.
 *
 * IMPORTANT — what these CIs represent:
 *
 * The bootstrap resamples *participants* (with replacement) and recomputes
 * aggregate metrics (Gini, mean representation, equity gap) on each resample.
 * This quantifies **sampling variability**: "If we had drawn a different
 * sample of participants from the same population, how much would these
 * aggregate metrics change?"
 *
 * This does NOT capture:
 * - Measurement uncertainty in individual representation scores (those are
 *   deterministic given the embedding model and summary).
 * - Model uncertainty (different embedding models would give different scores).
 *
 * Interpretation: a wide CI means the aggregate metric is sensitive to which
 * particular participants happen to be in the dataset. A narrow CI means the
 * metric is stable regardless of participant composition.
 *
 * Reference: Efron & Tibshirani (1993) "An Introduction to the Bootstrap",
 * Chapter 13 (percentile intervals).
 *
 * @param participants - The participant analysis results
 * @param numSamples - Number of bootstrap samples (default: 100)
 * @param confidenceLevel - Confidence level for intervals (default: 0.95)
 */
export const computeUncertaintyMetrics = (
  participants: ParticipantAnalysis[],
  numSamples: number = 100,
  confidenceLevel: number = 0.95
): UncertaintyMetrics => {
  if (participants.length < 3) {
    // Not enough data for meaningful bootstrap
    const scores = participants.map(p => p.representationScore);
    const gini = calculateGini(scores);
    const avgRep = computeAvgRepresentation(participants);
    const gap = computeGap(participants);

    return {
      giniCI: { lower: gini, upper: gini, point: gini },
      avgRepresentationCI: { lower: avgRep, upper: avgRep, point: avgRep },
      gapCI: { lower: gap, upper: gap, point: gap },
      bootstrapSamples: 0
    };
  }

  const giniSamples: number[] = [];
  const avgRepSamples: number[] = [];
  const gapSamples: number[] = [];

  // Run bootstrap sampling
  for (let i = 0; i < numSamples; i++) {
    const sample = bootstrapSample(participants);
    const scores = sample.map(p => p.representationScore);

    giniSamples.push(computeGiniFromScores(scores));
    avgRepSamples.push(computeAvgRepresentation(sample));
    gapSamples.push(computeGap(sample));
  }

  return {
    giniCI: computeCI(giniSamples, confidenceLevel),
    avgRepresentationCI: computeCI(avgRepSamples, confidenceLevel),
    gapCI: computeCI(gapSamples, confidenceLevel),
    bootstrapSamples: numSamples
  };
};

/**
 * Format confidence interval for display
 */
export const formatCI = (ci: { lower: number; upper: number; point: number }): string => {
  return `${ci.point.toFixed(2)} [${ci.lower.toFixed(2)}, ${ci.upper.toFixed(2)}]`;
};

/**
 * Check if confidence interval is wide (high uncertainty)
 */
export const isHighUncertainty = (ci: { lower: number; upper: number; point: number }): boolean => {
  const width = ci.upper - ci.lower;
  // Consider high uncertainty if CI width is > 20% of the point estimate
  return ci.point > 0 && (width / ci.point) > 0.2;
};

/**
 * Get uncertainty warning message if applicable
 */
export const getUncertaintyWarning = (metrics: UncertaintyMetrics): string | null => {
  const warnings: string[] = [];

  if (isHighUncertainty(metrics.giniCI)) {
    warnings.push('Gini coefficient has high uncertainty');
  }
  if (isHighUncertainty(metrics.avgRepresentationCI)) {
    warnings.push('Average representation has high uncertainty');
  }
  if (isHighUncertainty(metrics.gapCI)) {
    warnings.push('Equity gap has high uncertainty');
  }

  if (warnings.length === 0) return null;

  return `⚠️ ${warnings.join('; ')}. These aggregate metrics are sensitive to participant composition — consider a larger sample for more stable estimates.`;
};

export default computeUncertaintyMetrics;
