import {
  ParticipantInput,
  ParticipantAnalysis,
  StakeholderGroup,
  GroupEquityMetrics,
  InterGroupAnalysis
} from '../types';
import { calculateGini } from './mathUtils';
import { getRepresentationBands } from '../constants';

/**
 * Group Analysis Service
 * Computes group-level equity metrics for stakeholder groups
 */

// Get all unique groups from participants
export const getUniqueGroups = (inputs: ParticipantInput[]): StakeholderGroup[] => {
  const groups = new Set<StakeholderGroup>();
  inputs.forEach(i => {
    if (i.group) groups.add(i.group);
  });
  return Array.from(groups);
};

// Calculate metrics for a single group
const computeGroupMetrics = (
  groupId: StakeholderGroup,
  participants: ParticipantAnalysis[]
): GroupEquityMetrics => {
  const groupParticipants = participants.filter(p => p.group === groupId);

  if (groupParticipants.length === 0) {
    return {
      groupId,
      participantCount: 0,
      avgRepresentation: 0,
      avgIsolation: 0
    };
  }

  const avgRepresentation = groupParticipants.reduce(
    (sum, p) => sum + p.representationScore, 0
  ) / groupParticipants.length;

  const avgIsolation = groupParticipants.reduce(
    (sum, p) => sum + p.semanticIsolation, 0
  ) / groupParticipants.length;

  return {
    groupId,
    participantCount: groupParticipants.length,
    avgRepresentation,
    avgIsolation
  };
};

// Compute inter-group Gini coefficient
// Measures inequality of average representation across groups
const computeInterGroupGini = (groupMetrics: GroupEquityMetrics[]): number => {
  const avgReps = groupMetrics
    .filter(g => g.participantCount > 0)
    .map(g => g.avgRepresentation);

  if (avgReps.length < 2) return 0;

  return calculateGini(avgReps);
};

// Compute representation gap matrix between groups
const computeRepresentationGapMatrix = (
  groupMetrics: GroupEquityMetrics[]
): Record<string, Record<string, number>> => {
  const matrix: Record<string, Record<string, number>> = {};

  groupMetrics.forEach(g1 => {
    matrix[g1.groupId] = {};
    groupMetrics.forEach(g2 => {
      if (g1.groupId === g2.groupId) {
        matrix[g1.groupId][g2.groupId] = 0;
      } else {
        // Positive value means g1 has higher representation than g2
        matrix[g1.groupId][g2.groupId] = g1.avgRepresentation - g2.avgRepresentation;
      }
    });
  });

  return matrix;
};

/**
 * Main group analysis function
 * Computes all group-level equity metrics
 */
export const analyzeGroups = (
  inputs: ParticipantInput[],
  participants: ParticipantAnalysis[]
): InterGroupAnalysis | null => {
  const validParticipants = participants.filter(participant =>
    !participant.embeddingFailed && !participant.alignmentUnavailableReason
  );
  // Get unique groups that have at least one participant
  const groups = getUniqueGroups(inputs);

  if (groups.length < 2) {
    // Not enough groups for meaningful analysis
    return null;
  }

  // Compute metrics for each group
  const groupMetrics = groups.map(g => computeGroupMetrics(g, validParticipants));

  // Filter out empty groups
  const nonEmptyMetrics = groupMetrics.filter(g => g.participantCount > 0);

  if (nonEmptyMetrics.length < 2) {
    return null;
  }

  // Compute inter-group Gini
  const interGroupGini = computeInterGroupGini(nonEmptyMetrics);

  // Compute representation gap matrix
  const representationGapMatrix = computeRepresentationGapMatrix(nonEmptyMetrics);
  const reviewBands = getRepresentationBands(validParticipants[0]?.embeddingTier);

  return {
    groupMetrics: nonEmptyMetrics,
    interGroupGini,
    representationGapMatrix,
    reviewBands: {
      atRisk: reviewBands.atRisk,
      low: reviewBands.low,
      target: reviewBands.target,
    },
  };
};

/**
 * Get group labels for display
 */
export const getGroupLabel = (group: StakeholderGroup): string => {
  const labels: Record<StakeholderGroup, string> = {
    community: 'Community Members',
    expert: 'Subject Experts',
    youth: 'Youth Representatives',
    government: 'Government Officials',
    business: 'Business Stakeholders',
    other: 'Other'
  };
  return labels[group] || group;
};

/**
 * Get group color for visualization
 */
export const getGroupColor = (group: StakeholderGroup): string => {
  const colors: Record<StakeholderGroup, string> = {
    community: '#3b82f6',  // Blue
    expert: '#8b5cf6',     // Purple
    youth: '#10b981',      // Green
    government: '#f59e0b', // Amber
    business: '#ef4444',   // Red
    other: '#6b7280'       // Gray
  };
  return colors[group] || '#6b7280';
};

/**
 * Find the most and least represented groups
 */
export const findExtremeGroups = (
  groupMetrics: GroupEquityMetrics[]
): { highest: GroupEquityMetrics | null; lowest: GroupEquityMetrics | null } => {
  const sorted = [...groupMetrics]
    .filter(g => g.participantCount > 0)
    .sort((a, b) => b.avgRepresentation - a.avgRepresentation);

  return {
    highest: sorted[0] || null,
    lowest: sorted[sorted.length - 1] || null
  };
};

/**
 * Generate group equity recommendations
 */
export const generateGroupRecommendations = (
  analysis: InterGroupAnalysis
): string[] => {
  const recommendations: string[] = [];

  // Check inter-group Gini
  if (analysis.interGroupGini > 0.2) {
    recommendations.push(
      `Group mean-alignment scores are uneven (inter-group Gini: ${analysis.interGroupGini.toFixed(2)}). Inspect valid counts, group composition, and source evidence before considering changes.`
    );
  }

  // Find extreme groups
  const { highest, lowest } = findExtremeGroups(analysis.groupMetrics);

  if (highest && lowest) {
    const gap = highest.avgRepresentation - lowest.avgRepresentation;
    if (gap > 0.2) {
      recommendations.push(
        `${getGroupLabel(lowest.groupId)} has a lower mean semantic-alignment score (${(lowest.avgRepresentation * 100).toFixed(0)}%) than ${getGroupLabel(highest.groupId)} (${(highest.avgRepresentation * 100).toFixed(0)}%). This descriptive gap is not a significance test; inspect composition and evidence.`
      );
    }
  }

  // Check for underrepresented groups
  analysis.groupMetrics.forEach(g => {
    if (g.avgRepresentation < (analysis.reviewBands?.low ?? 0.5) && g.participantCount > 1) {
      recommendations.push(
        `${getGroupLabel(g.groupId)} falls below the current embedding-tier review marker (mean alignment: ${g.avgRepresentation.toFixed(2)}). Inspect the group's source evidence and valid count.`
      );
    }
  });

  return recommendations;
};

export default analyzeGroups;
