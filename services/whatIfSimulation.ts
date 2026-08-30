/**
 * What-If Simulation Service
 *
 * Client-side arithmetic sensitivity explorer for explicitly hypothetical score scenarios.
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
 * IMPORTANT: This does not model how new people would speak, how a summary
 * would change, or how the embedding model would respond. It is not a forecast,
 * intervention effect, counterfactual consultation, or statistical bootstrap CI.
 */

import { AnalysisResult, WhatIfScenario, WhatIfResult } from '../types';
import { calculateGini, SeededRNG } from './mathUtils';
import { getRepresentationBands } from '../constants';

// ─── Utilities ────────────────────────────────────────────────────────────────

/** Box-Muller transform: sample from N(0,1) using the supplied PRNG. */
const sampleNormal = (rng: SeededRNG): number => {
  const u1 = rng.next();
  const u2 = rng.next();
  return Math.sqrt(-2 * Math.log(Math.max(u1, 1e-10))) * Math.cos(2 * Math.PI * u2);
};

/** Sample from N(mean, std), clamped to [0, 1]. */
const sampleClamped = (rng: SeededRNG, mean: number, std: number): number => {
  const raw = mean + std * sampleNormal(rng);
  return Math.max(0, Math.min(1, raw));
};

/**
 * Deterministic seed derived from the dataset and the scenario being simulated.
 * The same what-if question on the same data returns the same answer, so a
 * facilitator cannot get two different conclusions by clicking twice.
 */
const scenarioSeed = (data: AnalysisResult, scenario: WhatIfScenario): number => {
  let h = 2166136261;
  const mix = (v: number) => { h ^= Math.round(v * 1e6); h = Math.imul(h, 16777619); };
  data.participants.forEach((p, i) => { mix(p.representationScore + i); mix(p.semanticIsolation); });
  mix(scenario.additionalCount ?? 0);
  mix((scenario.clusterId ?? -1) + 1);
  mix(scenario.type === 'add_voices' ? 1 : 2);
  return Math.abs(h) % 2147483647;
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
  centralityScores: number[],
  bands: ReturnType<typeof getRepresentationBands>,
): AggregateMetrics => {
  const { atRisk: atRiskThreshold, low: lowThreshold } = bands;

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
  const rng = new SeededRNG(scenarioSeed(data, scenario));
  const validParticipants = data.participants.filter(participant =>
    !participant.embeddingFailed && !participant.alignmentUnavailableReason);
  const bands = getRepresentationBands(data.embeddingTierUsed);

  const targetParticipants = clusterId !== undefined
    ? validParticipants.filter(p => p.clusterId === clusterId)
    : validParticipants;

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
    syntheticScores.push(sampleClamped(rng, clusterMeanScore, scoreStd));
    syntheticCentrality.push(sampleClamped(rng, clusterMeanCentrality, centralityStd));
  }

  const allScores = [...validParticipants.map(p => p.representationScore), ...syntheticScores];
  const allCentrality = [
    ...validParticipants.map(p => 1 - p.semanticIsolation),
    ...syntheticCentrality,
  ];

  // Baseline metrics
  const baseScores = validParticipants.map(p => p.representationScore);
  const baseCentrality = validParticipants.map(p => 1 - p.semanticIsolation);
  const baseline = computeAggregates(baseScores, baseCentrality, bands);
  const projected = computeAggregates(allScores, allCentrality, bands);

  const clusterLabel = clusterId !== undefined
    ? (data.clusters.find(c => c.id === clusterId)?.label ?? `Cluster ${clusterId}`)
    : 'all clusters';

  let description = `Mechanical assumption only: append ${additionalCount} synthetic score pairs sampled independently from the observed ${clusterLabel} marginals. `;
  const deltaGini = projected.gini - baseline.gini;
  description += `The arithmetic Gini changes from ${baseline.gini.toFixed(2)} to ${projected.gini.toFixed(2)} (Δ ${deltaGini.toFixed(2)}). ` +
    'This does not estimate what recruitment, new testimony, or re-summarization would cause.';

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

  const validParticipants = data.participants.filter(participant =>
    !participant.embeddingFailed && !participant.alignmentUnavailableReason);
  const bands = getRepresentationBands(data.embeddingTierUsed);
  const baseScores = validParticipants.map(p => p.representationScore);
  const baseCentrality = validParticipants.map(p => 1 - p.semanticIsolation);
  const baseline = computeAggregates(baseScores, baseCentrality, bands);

  // Apply boost to target group scores
  const boostedScores = validParticipants.map(p => {
    if (p.group === groupId) {
      return Math.min(1.0, p.representationScore * weightBoost);
    }
    return p.representationScore;
  });

  const projected = computeAggregates(boostedScores, baseCentrality, bands);

  const groupCount = validParticipants.filter(p => p.group === groupId).length;
  const boostPct = Math.round((weightBoost - 1) * 100);
  let description = `Mechanical assumption only: multiply existing retrieval indicators for "${groupId}" by ${boostPct}% (${groupCount} scored records), capped at 1. `;
  const deltaGini = projected.gini - baseline.gini;
  description += `The arithmetic Gini changes from ${baseline.gini.toFixed(2)} to ${projected.gini.toFixed(2)} (Δ ${deltaGini.toFixed(2)}). ` +
    'No real intervention is represented, and the summary is not regenerated.';

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
      if (data.clusteringDiagnostics?.usableForDownstream !== true) {
        throw new Error(
          `Cluster-conditioned score simulation is unavailable: ${data.clusteringDiagnostics?.reason || 'no validated semantic partition is present.'}`,
        );
      }
      return simulateAddVoices(data, scenario);
    case 'reweight_group':
      return simulateReweightGroup(data, scenario);
  }
};

/** Get current baseline metrics in the same shape as WhatIfResult for comparison */
export const getBaselineMetrics = (data: AnalysisResult) => {
  const validParticipants = data.participants.filter(participant =>
    !participant.embeddingFailed && !participant.alignmentUnavailableReason);
  const scores = validParticipants.map(p => p.representationScore);
  const centrality = validParticipants.map(p => 1 - p.semanticIsolation);
  return computeAggregates(scores, centrality, getRepresentationBands(data.embeddingTierUsed));
};
