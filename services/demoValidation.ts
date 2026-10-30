import type { AnalysisResult } from '../types';

const object = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);
const text = (value: unknown): value is string => typeof value === 'string' && value.trim().length > 0;
const finite = (value: unknown): value is number => typeof value === 'number' && Number.isFinite(value);

/** Check the fields every dashboard view needs before trusting a bundled JSON asset.
 * This guards the loading boundary; it does not certify the scientific claims
 * inside a saved analysis. scripts/validate-demo.ts performs separate evidence checks.
 */
export function parseBundledDemo(value: unknown): AnalysisResult {
  if (!object(value) || !object(value.config) || !text(value.summary)
    || !Array.isArray(value.summarySentences) || value.summarySentences.length === 0
    || !value.summarySentences.every(text) || !Array.isArray(value.participants)
    || value.participants.length === 0 || !object(value.metrics)
    || !Array.isArray(value.clusters) || !Array.isArray(value.summarySentenceSentiments)) {
    throw new Error('Bundled demo is missing required analysis fields.');
  }
  const config = value.config;
  if (!text(config.datasetName) || !text(config.model) || !text(config.embeddingModel)
    || !text(config.embeddingProvider) || !text(config.summaryMethod)) {
    throw new Error('Bundled demo has an invalid analysis configuration.');
  }
  const metrics = value.metrics;
  if (!finite(metrics.giniCoefficient) || !finite(metrics.inputDiversity)
    || !finite(metrics.distinctRepresentationGap) || !finite(metrics.totalParticipants)) {
    throw new Error('Bundled demo has invalid summary metrics.');
  }
  const ids = new Set<string>();
  for (const candidate of value.participants) {
    if (!object(candidate) || !text(candidate.id) || !text(candidate.originalText)
      || !finite(candidate.representationScore) || !finite(candidate.semanticIsolation)
      || !object(candidate.semanticCoords) || !finite(candidate.semanticCoords.x)
      || !finite(candidate.semanticCoords.y) || !finite(candidate.clusterId)
      || !Array.isArray(candidate.sentenceMatches) || !Array.isArray(candidate.keywords)
      || !candidate.keywords.every(item => typeof item === 'string') || ids.has(candidate.id)) {
      throw new Error('Bundled demo contains an invalid or duplicate source record.');
    }
    ids.add(candidate.id);
    for (const match of candidate.sentenceMatches) {
      if (!object(match) || !Number.isInteger(match.sentenceIndex)
        || (match.sentenceIndex as number) < 0
        || (match.sentenceIndex as number) >= value.summarySentences.length
        || !finite(match.similarity)) {
        throw new Error(`Bundled demo contains an invalid sentence match for ${candidate.id}.`);
      }
    }
  }
  if (metrics.totalParticipants !== value.participants.length) {
    throw new Error('Bundled demo source count does not match its summary metrics.');
  }
  return value as unknown as AnalysisResult;
}
