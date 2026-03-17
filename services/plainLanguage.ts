import { ANALYSIS_CONFIG } from '../constants';
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
      interpretation: 'Voices are represented fairly equally in the summary. No single group dominates.',
      severity: 'good'
    };
  } else if (gini <= moderate) {
    return {
      metric: 'Representation Equality',
      value: gini.toFixed(3),
      interpretation: 'Some participants are better represented than others. The summary may favor certain viewpoints.',
      recommendation: 'Review the summary to ensure minority perspectives are included.',
      severity: 'moderate'
    };
  } else {
    return {
      metric: 'Representation Equality',
      value: gini.toFixed(3),
      interpretation: 'There is significant inequality in how voices are represented. The summary may be dominated by a few perspectives.',
      recommendation: 'Consider revising the summary to better balance different viewpoints.',
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
      metric: 'Mainstream vs. Unique Balance',
      value: `${(gap * 100).toFixed(0)}%`,
      interpretation: 'Mainstream opinions and unique perspectives are represented roughly equally.',
      severity: 'good'
    };
  } else if (absGap <= 0.15) {
    return {
      metric: 'Mainstream vs. Unique Balance',
      value: `${(gap * 100).toFixed(0)}%`,
      interpretation: gap > 0
        ? 'Participants with unique viewpoints are slightly less represented than those with mainstream opinions.'
        : 'Unique perspectives are slightly overrepresented compared to mainstream views.',
      recommendation: 'Minor adjustment may improve balance.',
      severity: 'moderate'
    };
  } else {
    return {
      metric: 'Mainstream vs. Unique Balance',
      value: `${(gap * 100).toFixed(0)}%`,
      interpretation: gap > 0
        ? 'Participants with unique viewpoints are significantly underrepresented. Minority voices may be lost.'
        : 'The summary overemphasizes outlier perspectives at the expense of common concerns.',
      recommendation: 'Review which voices are being missed and consider how to include them.',
      severity: 'concern'
    };
  }
};

/**
 * Generate plain language insight for a participant's representation
 */
export const interpretParticipantRepresentation = (
  participant: ParticipantAnalysis,
  avgScore: number
): PlainInsight => {
  const { atRisk, low, adequate, good } = ANALYSIS_CONFIG.representationInterpretation;
  const score = participant.representationScore;

  if (score >= good) {
    return {
      metric: 'Voice Captured',
      value: `${(score * 100).toFixed(0)}%`,
      interpretation: `This participant's contribution is well-represented in the summary.`,
      severity: 'good'
    };
  } else if (score >= adequate) {
    return {
      metric: 'Voice Captured',
      value: `${(score * 100).toFixed(0)}%`,
      interpretation: `This participant's main points are captured, though some nuance may be lost.`,
      severity: 'good'
    };
  } else if (score >= low) {
    return {
      metric: 'Voice Captured',
      value: `${(score * 100).toFixed(0)}%`,
      interpretation: `This participant's perspective is partially represented but may not be fully reflected.`,
      recommendation: 'Consider whether their key points appear in the summary.',
      severity: 'moderate'
    };
  } else if (score >= atRisk) {
    return {
      metric: 'Voice Captured',
      value: `${(score * 100).toFixed(0)}%`,
      interpretation: `This participant's input is weakly connected to the summary. Their perspective may be underrepresented.`,
      recommendation: 'Review whether this voice should be explicitly included.',
      severity: 'moderate'
    };
  } else {
    return {
      metric: 'Voice Captured',
      value: `${(score * 100).toFixed(0)}%`,
      interpretation: `This participant's contribution does not appear in the summary. Their voice may be completely missed.`,
      recommendation: 'This input should be reviewed for potential inclusion.',
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
      interpretation: 'This participant shares views similar to the majority.',
      severity: 'good'
    };
  } else if (isolation < 0.5) {
    return {
      metric: 'Perspective Uniqueness',
      value: `${(isolation * 100).toFixed(0)}%`,
      interpretation: 'This participant offers a somewhat distinct perspective from the group.',
      severity: 'good'
    };
  } else if (isolation < 0.7) {
    return {
      metric: 'Perspective Uniqueness',
      value: `${(isolation * 100).toFixed(0)}%`,
      interpretation: 'This participant brings a notably unique viewpoint that differs from most others.',
      severity: 'moderate'
    };
  } else {
    return {
      metric: 'Perspective Uniqueness',
      value: `${(isolation * 100).toFixed(0)}%`,
      interpretation: 'This participant raises topics or concerns that few others mentioned. A truly distinct voice.',
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
      metric: 'Discussion Influence',
      value: zScore.toFixed(2),
      interpretation: 'This participant has typical influence on the discussion—neither driving nor peripheral.',
      severity: 'good'
    };
  } else if (absZ < 2) {
    return {
      metric: 'Discussion Influence',
      value: zScore.toFixed(2),
      interpretation: 'This participant has notable influence on the discussion direction.',
      severity: 'moderate'
    };
  } else {
    return {
      metric: 'Discussion Influence',
      value: zScore.toFixed(2),
      interpretation: 'This participant significantly shapes the discussion. Removing them would notably change the group\'s semantic center.',
      recommendation: 'Verify this influence is appropriate and not distorting the summary.',
      severity: 'concern'
    };
  }
};

/**
 * Compute at-risk count using the fixed threshold from ANALYSIS_CONFIG (< 0.3).
 * This matches the documented representation bands and the Coverage Stats card.
 * Shared logic used by ExecutiveSummary, reportExport, and plainLanguage.
 */
export const computeAtRiskCount = (participants: ParticipantAnalysis[]): number => {
  const { atRisk } = ANALYSIS_CONFIG.representationInterpretation;
  return participants.filter(p => p.representationScore < atRisk).length;
};

/**
 * Generate overall summary insight
 */
export const generateOverallInsight = (
  participants: ParticipantAnalysis[],
  metrics: DiversityMetrics
): string => {
  const total = participants.length;
  const avgScore = participants.reduce((sum, p) => sum + p.representationScore, 0) / total;
  const { representationTarget, matchingThreshold } = ANALYSIS_CONFIG.thresholds;

  const wellRepresented = participants.filter(p => p.representationScore >= representationTarget).length;
  const atRiskCount = computeAtRiskCount(participants);
  const underrepresented = participants.filter(p => p.representationScore < matchingThreshold).length;

  const parts: string[] = [];

  // Coverage
  if (wellRepresented === total) {
    parts.push(`All ${total} participants are well-represented in the summary.`);
  } else if (wellRepresented > total * 0.8) {
    parts.push(`${wellRepresented} of ${total} participants (${Math.round(wellRepresented/total*100)}%) are well-represented.`);
  } else {
    parts.push(`Only ${wellRepresented} of ${total} participants (${Math.round(wellRepresented/total*100)}%) are adequately represented.`);
  }

  // At-risk
  if (atRiskCount > 0) {
    parts.push(`${atRiskCount} participant${atRiskCount > 1 ? 's are' : ' is'} at risk of being completely overlooked.`);
  }

  // Inequality
  if (metrics.giniCoefficient > ANALYSIS_CONFIG.giniInterpretation.moderate) {
    parts.push('There is significant inequality in representation—some voices dominate while others fade.');
  } else if (metrics.giniCoefficient > ANALYSIS_CONFIG.giniInterpretation.low) {
    parts.push('Representation is moderately unequal across participants.');
  }

  // Gap
  if (metrics.distinctRepresentationGap > 0.15) {
    parts.push('Unique perspectives are notably underrepresented compared to mainstream views.');
  }

  return parts.join(' ');
};

/**
 * Generate actionable recommendations based on analysis
 */
export const generateRecommendations = (
  participants: ParticipantAnalysis[],
  metrics: DiversityMetrics
): string[] => {
  const recommendations: string[] = [];
  const { matchingThreshold } = ANALYSIS_CONFIG.thresholds;

  const atRiskCount = computeAtRiskCount(participants);
  const underrepresented = participants.filter(p => p.representationScore < matchingThreshold);

  if (atRiskCount > 0) {
    recommendations.push(
      `Review the ${atRiskCount} at-risk participant${atRiskCount > 1 ? 's' : ''} and consider explicitly including their perspectives.`
    );
  }

  if (metrics.giniCoefficient > ANALYSIS_CONFIG.giniInterpretation.moderate) {
    recommendations.push(
      'Consider using a diversity-focused summarization strategy to better balance representation.'
    );
  }

  if (metrics.distinctRepresentationGap > 0.15) {
    recommendations.push(
      'Pay special attention to outlier perspectives—they may contain valuable minority viewpoints.'
    );
  }

  if (underrepresented.length > 0) {
    // Find common themes among underrepresented
    const keywords = underrepresented.flatMap(p => p.keywords || []);
    const uniqueKeywords = [...new Set(keywords)].slice(0, 3);
    if (uniqueKeywords.length > 0) {
      recommendations.push(
        `Topics that may need more attention: ${uniqueKeywords.join(', ')}.`
      );
    }
  }

  if (recommendations.length === 0) {
    recommendations.push('The summary appears to represent all voices fairly. No immediate action needed.');
  }

  return recommendations;
};

export default {
  interpretGini,
  interpretEquityGap,
  interpretParticipantRepresentation,
  interpretIsolation,
  interpretLeverage,
  generateOverallInsight,
  generateRecommendations
};
