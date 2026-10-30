import type { LanguageFidelity, ParticipantAnalysis, PhraseMapping, TransformationType } from '../types';

export interface TraceLink { sentenceIndex: number; similarity: number }
export interface TraceRecord {
  participant: ParticipantAnalysis;
  links: TraceLink[];
  mappings: PhraseMapping[];
  scoreAvailable: boolean;
}

/** Retrieval candidates and evaluator classifications stay separate throughout the view. */
export function buildSynthesisTrace(
  participants: ParticipantAnalysis[], summarySentences: string[], languageFidelity?: LanguageFidelity,
): TraceRecord[] {
  const census = languageFidelity?.methodVersion === 'language-transformation-v2-source-census'
    ? languageFidelity.sourceMappings ?? [] : [];
  return participants.map(participant => {
    const scoreAvailable = !participant.embeddingFailed && !participant.alignmentUnavailableReason;
    const links = new Map<number, TraceLink>();
    if (scoreAvailable) for (const match of participant.sentenceMatches) {
      if (!Number.isInteger(match.sentenceIndex) || match.sentenceIndex < 0 || match.sentenceIndex >= summarySentences.length || !Number.isFinite(match.similarity)) continue;
      const previous = links.get(match.sentenceIndex);
      if (!previous || previous.similarity < match.similarity) links.set(match.sentenceIndex, { ...match });
    }
    // Source-unit IDs identify repeated census entries; distinct units with identical words remain distinct.
    const seen = new Set<string>();
    const mappings = census.filter(mapping => {
      if (mapping.participantId !== participant.id) return false;
      if (mapping.sourceUnitId) {
        if (seen.has(mapping.sourceUnitId)) return false;
        seen.add(mapping.sourceUnitId);
      }
      return true;
    }).map(mapping => {
      const index = mapping.summarySentenceIndex;
      const validSpan = typeof index === 'number' && Number.isInteger(index) && index >= 0 && index < summarySentences.length
        && !!mapping.summaryPhrase && summarySentences[index].includes(mapping.summaryPhrase);
      const validSource = !!mapping.rawPhrase && participant.originalText.includes(mapping.rawPhrase);
      // Never turn malformed or unverifiable alignments into a loss finding.
      const validUnmapped = (mapping.type === 'dropped' || mapping.type === 'unassessed') && !mapping.summaryPhrase;
      if (!validSource || (!validSpan && !validUnmapped) || mapping.alignmentAssessed === false) {
        return { ...mapping, type: 'unassessed' as TransformationType, summaryPhrase: null, summarySentenceIndex: null };
      }
      return mapping;
    });
    return { participant, links: [...links.values()].sort((a, b) => b.similarity - a.similarity), mappings, scoreAvailable };
  });
}

const exampleParticipants: ParticipantAnalysis[] = [
  { id: 'P01', group: 'community', originalText: 'We need shaded green corridors so older residents can walk safely in summer.', representationScore: .81, semanticIsolation: 0, semanticCoords: { x: 0, y: 0 }, clusterId: 0, keywords: [], sentenceMatches: [{ sentenceIndex: 0, similarity: .81 }], topSentenceMatchIndex: 0 },
  { id: 'P02', group: 'government', originalText: 'Use public-private financing, but any plan must respect the existing budget cap.', representationScore: .68, semanticIsolation: 0, semanticCoords: { x: 0, y: 0 }, clusterId: 0, keywords: [], sentenceMatches: [{ sentenceIndex: 1, similarity: .68 }], topSentenceMatchIndex: 1 },
  { id: 'P03', group: 'youth', originalText: 'We want a skate park and protected bike lanes, not another committee report.', representationScore: .34, semanticIsolation: 0, semanticCoords: { x: 0, y: 0 }, clusterId: 0, keywords: [], sentenceMatches: [{ sentenceIndex: 1, similarity: .34 }], topSentenceMatchIndex: 1 },
];
const exampleSentences = ['Create shaded green corridors for safe summer walking.', 'Use public-private financing to improve accessibility.'];
const exampleMappings: PhraseMapping[] = [
  { participantId: 'P01', sourceUnitId: 'p1-walking', rawPhrase: 'shaded green corridors so older residents can walk safely in summer', summaryPhrase: 'shaded green corridors for safe summer walking', summarySentenceIndex: 0, type: 'abstracted', alignmentAssessed: true },
  { participantId: 'P02', sourceUnitId: 'p2-finance', rawPhrase: 'Use public-private financing', summaryPhrase: 'Use public-private financing', summarySentenceIndex: 1, type: 'preserved', alignmentAssessed: true },
  { participantId: 'P02', sourceUnitId: 'p2-cap', rawPhrase: 'any plan must respect the existing budget cap', summaryPhrase: null, summarySentenceIndex: null, type: 'dropped', alignmentAssessed: true },
  { participantId: 'P03', sourceUnitId: 'p3-proposals', rawPhrase: 'a skate park and protected bike lanes', summaryPhrase: 'improve accessibility', summarySentenceIndex: 1, type: 'abstracted', alignmentAssessed: true },
];

/** Hand-authored teaching example; these are illustrative classifications, not an executed audit. */
export const ILLUSTRATIVE_SYNTHESIS_TRACE = {
  participants: exampleParticipants,
  summarySentences: exampleSentences,
  languageFidelity: {
    methodVersion: 'language-transformation-v2-source-census', sourceMappings: exampleMappings,
    sentences: [], overallCounts: { preserved: 1, softened: 0, sanitized: 0, abstracted: 2, target_shifted: 0, target_uncertain: 0, dropped: 1, unassessed: 0 },
    fidelityScore: null, summaryDroppedParticipantIds: [],
  } satisfies LanguageFidelity,
};
