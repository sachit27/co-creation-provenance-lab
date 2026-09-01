import { ANALYSIS_CONFIG, getRepresentationBands } from '../constants';
import { ParticipantAnalysis, DiversityMetrics } from '../types';

/**
 * Plain Language Insight Generator
 *
 * Translates technical metrics into human-readable explanations.
 * Designed for non-technical stakeholders.
 */

export interface PlainInsight {
  metric: string;
  value: number | string;
  interpretation: string;
  recommendation?: string;
  severity: 'good' | 'moderate' | 'concern';
}

/**
 * Generate plain language insight for Gini coefficient
 */
export const interpretGini = (gini: number): PlainInsight => {
  const { low, moderate, high } = ANALYSIS_CONFIG.giniInterpretation;

  if (gini <= low) {
    return {
      metric: 'Representation Equality',
      value: gini.toFixed(3),
      interpretation: 'Semantic-alignment scores are distributed relatively evenly. This does not show that all voices are well represented or that the process is fair.',
      severity: 'good'
    };
  } else if (gini <= moderate) {
    return {
      metric: 'Representation Equality',
      value: gini.toFixed(3),
      interpretation: 'The valid source-to-summary alignment scores have moderate dispersion under the interface convention.',
      recommendation: 'Inspect the score distribution and exact source–summary matches.',
      severity: 'moderate'
    };
  } else {
    return {
      metric: 'Representation Equality',
      value: gini.toFixed(3),
      interpretation: 'Semantic-alignment scores are unevenly distributed. Inspect the underlying evidence; this descriptive value does not establish domination or unfairness.',
      recommendation: 'Inspect low-scoring evidence before deciding whether revision is warranted.',
      severity: 'concern'
    };
  }
};

/**
 * Generate plain language insight for equity gap
 */
export const interpretEquityGap = (gap: number): PlainInsight => {
  const absGap = Math.abs(gap);

  if (absGap <= 0.05) {
    return {
      metric: 'Distinct-record Alignment Gap',
      value: `${(gap * 100).toFixed(0)}%`,
      interpretation: 'The centroid-distant quartile and remaining valid records have similar mean alignment scores in this run.',
      severity: 'good'
    };
  } else if (absGap <= 0.15) {
    return {
      metric: 'Distinct-record Alignment Gap',
      value: `${(gap * 100).toFixed(0)}%`,
      interpretation: gap > 0
        ? 'The centroid-distant quartile has a slightly lower mean alignment score.'
        : 'The centroid-distant quartile has a slightly higher mean alignment score.',
      recommendation: 'Inspect the underlying records; centroid distance is not a social-group label.',
      severity: 'moderate'
    };
  } else {
    return {
      metric: 'Distinct-record Alignment Gap',
      value: `${(gap * 100).toFixed(0)}%`,
      interpretation: gap > 0
        ? 'More isolated source records have lower semantic-alignment scores in this run. Review those records directly.'
        : 'More centroid-distant source records have higher semantic-alignment scores in this run.',
      recommendation: 'Review the exact records and summary matches; this geometry does not prove omission or overemphasis.',
      severity: 'concern'
    };
  }
};

/**
 * Generate plain language insight for a participant's representation
 */
export const interpretParticipantRepresentation = (
  participant: ParticipantAnalysis,
  _avgScore: number
): PlainInsight => {
  const { atRisk, low, adequate, good } = ANALYSIS_CONFIG.representationInterpretation;
  const score = participant.representationScore;

  if (score >= good) {
    return {
      metric: 'Semantic Alignment',
      value: `${(score * 100).toFixed(0)}%`,
      interpretation: 'This record has a comparatively high strongest-sentence cosine under the selected embedding method.',
      severity: 'good'
    };
  } else if (score >= adequate) {
    return {
      metric: 'Semantic Alignment',
      value: `${(score * 100).toFixed(0)}%`,
      interpretation: 'This record is above the provisional alignment reference; inspect evidence for entailment and nuance.',
      severity: 'good'
    };
  } else if (score >= low) {
    return {
      metric: 'Semantic Alignment',
      value: `${(score * 100).toFixed(0)}%`,
      interpretation: 'This record falls in a middle semantic-alignment band.',
      recommendation: 'Inspect whether its substantive claims appear in the summary.',
      severity: 'moderate'
    };
  } else if (score >= atRisk) {
    return {
      metric: 'Semantic Alignment',
      value: `${(score * 100).toFixed(0)}%`,
      interpretation: 'This record has relatively low source-to-summary semantic similarity.',
      recommendation: 'Review its best match and claim-level evidence before inferring omission.',
      severity: 'moderate'
    };
  } else {
    return {
      metric: 'Semantic Alignment',
      value: `${(score * 100).toFixed(0)}%`,
      interpretation: 'This record falls below the provisional tier-specific review marker.',
      recommendation: 'Inspect the source and best match; the score alone cannot establish absence.',
      severity: 'concern'
    };
  }
};

/**
 * Generate plain language insight for isolation score
 */
export const interpretIsolation = (isolation: number): PlainInsight => {
  if (isolation < 0.3) {
    return {
      metric: 'Perspective Uniqueness',
      value: `${(isolation * 100).toFixed(0)}%`,
      interpretation: 'This record is close to the source-space centroid.',
      severity: 'good'
    };
  } else if (isolation < 0.5) {
    return {
      metric: 'Perspective Uniqueness',
      value: `${(isolation * 100).toFixed(0)}%`,
      interpretation: 'This record is moderately distant from the source-space centroid.',
      severity: 'good'
    };
  } else if (isolation < 0.7) {
    return {
      metric: 'Perspective Uniqueness',
      value: `${(isolation * 100).toFixed(0)}%`,
      interpretation: 'This record is comparatively distant from the source-space centroid.',
      severity: 'moderate'
    };
  } else {
    return {
      metric: 'Perspective Uniqueness',
      value: `${(isolation * 100).toFixed(0)}%`,
      interpretation: 'This record is far from the source-space centroid; inspect whether this reflects a coherent theme, language/model effects, or data quality.',
      severity: 'moderate'
    };
  }
};

/**
 * Generate plain language insight for leverage score
 */
export const interpretLeverage = (zScore: number): PlainInsight => {
  const absZ = Math.abs(zScore);

  if (absZ < 1) {
    return {
      metric: 'Centroid Sensitivity',
      value: zScore.toFixed(2),
      interpretation: 'Removing this record produces a typical shift in the source-space centroid.',
      severity: 'good'
    };
  } else if (absZ < 2) {
    return {
      metric: 'Centroid Sensitivity',
      value: zScore.toFixed(2),
      interpretation: 'Removing this record produces an above-typical shift in the source-space centroid.',
      severity: 'moderate'
    };
  } else {
    return {
      metric: 'Centroid Sensitivity',
      value: zScore.toFixed(2),
      interpretation: 'Removing this record produces a comparatively large shift in the source-space centroid. This is geometric sensitivity, not social influence.',
      recommendation: 'Inspect whether this record is a legitimate distinct perspective, a data-quality issue, or part of a coherent minority cluster.',
      severity: 'concern'
    };
  }
};

/**
 * Count records below their own embedding-tier review marker.
 */
export const computeAtRiskCount = (participants: ParticipantAnalysis[]): number => {
  return participants.filter(participant =>
    participant.representationScore < getRepresentationBands(participant.embeddingTier).atRisk
  ).length;
};

/**
 * Generate overall summary insight
 */
export const generateOverallInsight = (
  participants: ParticipantAnalysis[],
  metrics: DiversityMetrics
): string => {
  const valid = participants.filter(participant => !participant.embeddingFailed && !participant.alignmentUnavailableReason);
  const total = valid.length;
  if (total === 0) return 'No valid source-to-summary alignment scores are available for this run.';
  const targetFor = (participant: ParticipantAnalysis) => getRepresentationBands(participant.embeddingTier).target;

  const aboveReference = valid.filter(p => p.representationScore >= targetFor(p)).length;
  const belowMarkerCount = computeAtRiskCount(valid);

  const parts: string[] = [];

  // Coverage
  parts.push(`${aboveReference} of ${total} valid records (${Math.round(aboveReference / total * 100)}%) are above their embedding-tier alignment reference.`);

  // At-risk
  if (belowMarkerCount > 0) {
    parts.push(`${belowMarkerCount} record${belowMarkerCount > 1 ? 's are' : ' is'} below the tier-specific review marker; this is not proof of omission.`);
  }

  // Inequality
  if (metrics.giniCoefficient > ANALYSIS_CONFIG.giniInterpretation.moderate) {
    parts.push('The semantic-alignment scores are uneven; inspect low-scoring evidence rather than treating the distribution as a fairness verdict.');
  } else if (metrics.giniCoefficient > ANALYSIS_CONFIG.giniInterpretation.low) {
    parts.push('The valid alignment-score distribution has moderate dispersion under the display convention.');
  }

  // Gap
  if (metrics.distinctRepresentationGap > 0.15) {
    parts.push('The centroid-distant quartile has a lower mean alignment score; inspect those records before interpreting the gap.');
  }

  return parts.join(' ');
};

export default {
  interpretGini,
  interpretEquityGap,
  interpretParticipantRepresentation,
  interpretIsolation,
  interpretLeverage,
  generateOverallInsight
};
