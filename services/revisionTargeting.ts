import type { ParticipantAnalysis } from '../types';

export type RevisionTargetMode = 'below-threshold' | 'lowest-ranked';

export interface RevisionTargetingOptions {
  mode: RevisionTargetMode;
  /** Used only in below-threshold mode. Scores are cosine-based retrieval indicators. */
  threshold: number;
  /** Limits the amount of participant text sent to the completion model. */
  maxCandidates: number;
  /** Optional facilitator request, constrained by the source-grounding instructions. */
  instruction?: string;
}

export interface RevisionTargetSelection {
  candidates: ParticipantAnalysis[];
  /** Eligible records before applying the user-selected rule. */
  eligibleCount: number;
  /** Records matching the rule before applying maxCandidates. */
  matchingCount: number;
}

/**
 * Select records for an AI-assisted revision using an explicit, inspectable rule.
 * This function never changes the rule or invents a fallback target.
 */
export const selectRevisionCandidates = (
  participants: ParticipantAnalysis[],
  options: RevisionTargetingOptions,
): RevisionTargetSelection => {
  if (!Number.isFinite(options.threshold) || options.threshold < 0 || options.threshold > 1) {
    throw new Error('The AI-draft score cutoff must be between 0 and 1.');
  }
  if (!Number.isSafeInteger(options.maxCandidates) || options.maxCandidates < 1) {
    throw new Error('The AI-draft record count must be a positive whole number.');
  }

  const eligible = participants
    .filter(participant =>
      !participant.embeddingFailed &&
      !participant.alignmentUnavailableReason &&
      Number.isFinite(participant.representationScore),
    )
    .sort((a, b) =>
      a.representationScore - b.representationScore || a.id.localeCompare(b.id),
    );

  const matching = options.mode === 'lowest-ranked'
    ? eligible
    : eligible.filter(participant =>
      participant.sentenceMatches.length === 0 ||
      participant.representationScore < options.threshold,
    );

  return {
    candidates: matching.slice(0, options.maxCandidates),
    eligibleCount: eligible.length,
    matchingCount: matching.length,
  };
};
