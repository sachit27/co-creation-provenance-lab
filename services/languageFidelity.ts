import { AIProvider, LanguageFidelity, PhraseMapping, SentenceFidelity, TransformationType } from '../types';

export const emptyTransformationCounts = (): Record<TransformationType, number> => ({
  preserved: 0,
  softened: 0,
  sanitized: 0,
  abstracted: 0,
  target_shifted: 0,
  target_uncertain: 0,
  dropped: 0,
  unassessed: 0,
});

/**
 * Deterministic aggregation for the model-coded source census. Keeping this
 * separate from provider orchestration makes denominators directly testable.
 */
export const summarizeLanguageTransformation = (
  summarySentences: string[],
  sourceMappings: PhraseMapping[],
  evaluator: { provider: AIProvider; model: string },
): LanguageFidelity => {
  const overallCounts = emptyTransformationCounts();
  sourceMappings.forEach(mapping => { overallCounts[mapping.type]++; });

  const sentences: SentenceFidelity[] = summarySentences.map((sentenceText, sentenceIndex) => {
    const mappings = sourceMappings.filter(mapping => mapping.summarySentenceIndex === sentenceIndex);
    const counts = emptyTransformationCounts();
    mappings.forEach(mapping => { counts[mapping.type]++; });
    return { sentenceIndex, sentenceText, counts, mappings };
  });
  const unmappedMappings = sourceMappings.filter(mapping => mapping.summarySentenceIndex === null);

  const byParticipant = new Map<string, PhraseMapping[]>();
  for (const mapping of sourceMappings) {
    const group = byParticipant.get(mapping.participantId) ?? [];
    group.push(mapping);
    byParticipant.set(mapping.participantId, group);
  }

  let preservedParticipantEquivalent = 0;
  let assessedParticipantEquivalent = 0;
  let assessmentCoverageSum = 0;
  const summaryDroppedParticipantIds: string[] = [];
  for (const [participantId, mappings] of byParticipant.entries()) {
    const completed = mappings.filter(mapping => mapping.type !== 'unassessed');
    const assessed = completed.filter(mapping => mapping.type !== 'target_uncertain');
    assessmentCoverageSum += mappings.length > 0 ? completed.length / mappings.length : 0;
    if (assessed.length > 0) {
      assessedParticipantEquivalent++;
      preservedParticipantEquivalent += assessed.filter(mapping => mapping.type === 'preserved').length / assessed.length;
    }
    if (completed.length === mappings.length && assessed.length === mappings.length && assessed.length > 0 && assessed.every(mapping => mapping.type === 'dropped')) {
      summaryDroppedParticipantIds.push(participantId);
    }
  }

  return {
    methodVersion: 'language-transformation-v2-source-census',
    generatedAt: new Date().toISOString(),
    sentences,
    overallCounts,
    fidelityScore: assessedParticipantEquivalent > 0
      ? preservedParticipantEquivalent / assessedParticipantEquivalent
      : null,
    sourceMappings,
    unmappedMappings,
    totalSourceUnitCount: sourceMappings.length,
    completedSourceUnitCount: sourceMappings.length - overallCounts.unassessed,
    assessedSourceUnitCount: sourceMappings.length - overallCounts.unassessed - overallCounts.target_uncertain,
    preservedParticipantEquivalent,
    assessedParticipantEquivalent,
    assessmentCoverageRate: byParticipant.size > 0 ? assessmentCoverageSum / byParticipant.size : null,
    evaluator: {
      provider: evaluator.provider,
      model: evaluator.model,
      requestedTemperature: 0,
      promptVersion: 'language-transformation-v2-source-census',
    },
    limitations: [
      'This is an automated model-coded transformation assessment, not a validated fidelity scale or human adjudication.',
      'Sentence-like source units are a segmentation proxy and may contain multiple claims or targets.',
      'Dropped means the evaluator completed the unit and returned no summary alignment; missing, malformed, or unverifiable output is unassessed, while a valid target abstention is target-uncertain.',
      'The preservation fraction is participant-balanced and conditional on assessed units; assessment coverage must be interpreted alongside it.',
      'Transformation categories are mutually exclusive primary labels even though real transformations can overlap.',
      'Using a different evaluator model/provider reduces direct self-review but does not make the automated assessment independent or human-validated.',
    ],
    summaryDroppedParticipantIds,
  };
};
