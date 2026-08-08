/**
 * What-If Simulation Service
 *
 * Client-side parametric simulation of counterfactual consultation scenarios.
 * No LLM or network calls required — all computation uses existing analysis data.
 *
 * Two scenario types:
 *
 *   add_voices    — Simulate adding N synthetic participants drawn from the
 *                   score distribution of a selected cluster.
 *
 *   reweight_group — Simulate applying a score multiplier to all participants
 *                    in a selected stakeholder group (hypothetical equity boost).
 *
 * Synthetic scores are sampled from a Normal distribution parameterized by
 * the target cluster's empirical mean and standard deviation, then clamped to
 * [0, 1]. This is a parametric bootstrap approach (Efron & Tibshirani, 1993).
 *
 * IMPORTANT: Results are labeled as hypothetical projections. They do NOT
 * represent actual new participants or actual embedding-level changes.
 */

import { AnalysisResult, WhatIfScenario, WhatIfResult } from '../types';
import { calculateGini } from './mathUtils';
import { ANALYSIS_CONFIG } from '../constants';

// ─── Utilities ────────────────────────────────────────────────────────────────

/** Box-Muller transform: sample from N(0,1) */
const sampleNormal = (): number => {
  const u1 = Math.random();
  const u2 = Math.random();
  return Math.sqrt(-2 * Math.log(Math.max(u1, 1e-10))) * Math.cos(2 * Math.PI * u2);
};

/** Sample from N(mean, std), clamped to [0, 1] */
const sampleClamped = (mean: number, std: number): number => {
  const raw = mean + std * sampleNormal();
  return Math.max(0, Math.min(1, raw));
};

interface AggregateMetrics {
  gini: number;
  avgRep: number;
  blindSpots: number;
  atRisk: number;
}

/**
 * Recompute aggregate fairness metrics from a list of (representation score, centrality) pairs.
 * Centrality = 1 - semanticIsolation.
 */
const computeAggregates = (
  scores: number[],
  centralityScores: number[]
): AggregateMetrics => {
  const { atRisk: atRiskThreshold, low: lowThreshold } = ANALYSIS_CONFIG.representationInterpretation;

  const gini = calculateGini(scores);
  const avgRep = scores.length > 0
    ? scores.reduce((s, v) => s + v, 0) / scores.length
    : 0;

  // Median-based thresholds for blind spot and at-risk counts
  const sortedScores = [...scores].sort((a, b) => a - b);
  const sortedCentrality = [...centralityScores].sort((a, b) => a - b);
  const mid = Math.floor(scores.length / 2);
  const medianCentrality = sortedCentrality[mid] ?? 0.5;

  const blindSpots = scores.filter((score, i) => {
    const centrality = centralityScores[i];
    return centrality < medianCentrality && score < lowThreshold;
  }).length;

  const atRisk = scores.filter(s => s < atRiskThreshold).length;

  return { gini, avgRep, blindSpots, atRisk };
};

// ─── Scenario: Add Voices ─────────────────────────────────────────────────────

const simulateAddVoices = (data: AnalysisResult, scenario: WhatIfScenario): WhatIfResult => {
  const { clusterId, additionalCount = 5 } = scenario;

  const targetParticipants = clusterId !== undefined
    ? data.participants.filter(p => p.clusterId === clusterId)
    : data.participants; // Fallback: use all if no cluster specified

  // Compute cluster empirical distribution
  const clusterScores = targetParticipants.map(p => p.representationScore);
  const clusterCentrality = targetParticipants.map(p => 1 - p.semanticIsolation);

  const clusterMeanScore = clusterScores.length > 0
    ? clusterScores.reduce((s, v) => s + v, 0) / clusterScores.length
    : 0.5;

  const clusterMeanCentrality = clusterCentrality.length > 0
    ? clusterCentrality.reduce((s, v) => s + v, 0) / clusterCentrality.length
    : 0.5;

  // Bessel-corrected std dev; minimum floor of 0.05 ensures meaningful spread
  // even for single-member clusters (avoids degenerate point distributions)
  const n = clusterScores.length;
  const scoreStd = Math.max(0.05, n > 1
    ? Math.sqrt(clusterScores.reduce((s, v) => s + (v - clusterMeanScore) ** 2, 0) / (n - 1))
    : 0.05);
  const centralityStd = Math.max(0.05, n > 1
    ? Math.sqrt(clusterCentrality.reduce((s, v) => s + (v - clusterMeanCentrality) ** 2, 0) / (n - 1))
    : 0.05);

  // Generate synthetic scores and centrality values
  const syntheticScores: number[] = [];
  const syntheticCentrality: number[] = [];
  for (let i = 0; i < additionalCount; i++) {
    syntheticScores.push(sampleClamped(clusterMeanScore, scoreStd));
    syntheticCentrality.push(sampleClamped(clusterMeanCentrality, centralityStd));
  }

  const allScores = [...data.participants.map(p => p.representationScore), ...syntheticScores];
  const allCentrality = [
    ...data.participants.map(p => 1 - p.semanticIsolation),
    ...syntheticCentrality,
  ];

  // Baseline metrics
  const baseScores = data.participants.map(p => p.representationScore);
  const baseCentrality = data.participants.map(p => 1 - p.semanticIsolation);
  const baseline = computeAggregates(baseScores, baseCentrality);
  const projected = computeAggregates(allScores, allCentrality);

  const clusterLabel = clusterId !== undefined
    ? (data.clusters.find(c => c.id === clusterId)?.label ?? `Cluster ${clusterId}`)
    : 'all clusters';

  const giniInterpretation = (g: number) =>
    g < ANALYSIS_CONFIG.giniInterpretation.low ? 'low inequality'
    : g < ANALYSIS_CONFIG.giniInterpretation.moderate ? 'moderate inequality'
    : 'high inequality';

  let description = `Adding ${additionalCount} voices like ${clusterLabel} `;
  const deltaGini = projected.gini - baseline.gini;
  if (Math.abs(deltaGini) >= 0.01) {
    description += `would ${deltaGini < 0 ? 'reduce' : 'increase'} Gini from ${baseline.gini.toFixed(2)} ` +
      `to ${projected.gini.toFixed(2)} (${giniInterpretation(projected.gini)})`;
  } else {
    description += `would not significantly change inequality (Gini stays at ${baseline.gini.toFixed(2)})`;
  }
  if (projected.blindSpots !== baseline.blindSpots) {
    const diff = baseline.blindSpots - projected.blindSpots;
    description += ` and ${diff > 0 ? `eliminate ${diff} blind spot${diff > 1 ? 's' : ''}` : `add ${-diff} blind spot${-diff > 1 ? 's' : ''}`}`;
  }
  description += '.';

  return {
    scenario,
    projectedGini: projected.gini,
    projectedAvgRep: projected.avgRep,
    projectedBlindSpots: projected.blindSpots,
    projectedAtRisk: projected.atRisk,
    deltaGini: projected.gini - baseline.gini,
    deltaAvgRep: projected.avgRep - baseline.avgRep,
    deltaBlindSpots: projected.blindSpots - baseline.blindSpots,
    deltaAtRisk: projected.atRisk - baseline.atRisk,
    description,
  };
};

// ─── Scenario: Reweight Group ─────────────────────────────────────────────────

const simulateReweightGroup = (data: AnalysisResult, scenario: WhatIfScenario): WhatIfResult => {
  const { groupId, weightBoost = 1.5 } = scenario;

  if (!groupId) {
    throw new Error('reweight_group scenario requires groupId');
  }

  const baseScores = data.participants.map(p => p.representationScore);
  const baseCentrality = data.participants.map(p => 1 - p.semanticIsolation);
  const baseline = computeAggregates(baseScores, baseCentrality);

  // Apply boost to target group scores
  const boostedScores = data.participants.map(p => {
    if (p.group === groupId) {
      return Math.min(1.0, p.representationScore * weightBoost);
    }
    return p.representationScore;
  });

  const projected = computeAggregates(boostedScores, baseCentrality);

  const groupCount = data.participants.filter(p => p.group === groupId).length;
  const boostPct = Math.round((weightBoost - 1) * 100);
  let description = `Boosting representation of the "${groupId}" group by ${boostPct}% (${groupCount} participants) `;
  const deltaGini = projected.gini - baseline.gini;
  if (Math.abs(deltaGini) >= 0.01) {
    description += `would ${deltaGini < 0 ? 'reduce' : 'increase'} Gini from ${baseline.gini.toFixed(2)} to ${projected.gini.toFixed(2)}`;
  } else {
    description += `would not significantly change overall inequality`;
  }
  description += `. This is a hypothetical equity intervention, not an actual change to the summary.`;

  return {
    scenario,
    projectedGini: projected.gini,
    projectedAvgRep: projected.avgRep,
    projectedBlindSpots: projected.blindSpots,
    projectedAtRisk: projected.atRisk,
    deltaGini: projected.gini - baseline.gini,
    deltaAvgRep: projected.avgRep - baseline.avgRep,
    deltaBlindSpots: projected.blindSpots - baseline.blindSpots,
    deltaAtRisk: projected.atRisk - baseline.atRisk,
    description,
  };
};

// ─── Main Export ──────────────────────────────────────────────────────────────

export const runWhatIfSimulation = (
  data: AnalysisResult,
  scenario: WhatIfScenario
): WhatIfResult => {
  switch (scenario.type) {
    case 'add_voices':
      return simulateAddVoices(data, scenario);
    case 'reweight_group':
      return simulateReweightGroup(data, scenario);
  }
};

/** Get current baseline metrics in the same shape as WhatIfResult for comparison */
export const getBaselineMetrics = (data: AnalysisResult) => {
  const scores = data.participants.map(p => p.representationScore);
  const centrality = data.participants.map(p => 1 - p.semanticIsolation);
  return computeAggregates(scores, centrality);
};
