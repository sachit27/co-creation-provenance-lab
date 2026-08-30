import {
  AffectEmotion,
  AffectProfile,
  AffectiveFidelity,
  AffectiveFidelityCase,
  AffectiveTransition,
  AffectiveTransitionFlags,
  AIProvider,
  TargetRelation,
} from '../types';
import { splitSentenceLikeUnits } from './sentenceSegmentation';

export const AFFECTIVE_FIDELITY_METHOD_VERSION = 'affective-fidelity-v2-source-census' as const;
export const AFFECT_PROFILE_PROMPT_VERSION = 'affect-profile-v2-source-census' as const;
export const PRIMARY_MIN_CERTAINTY = 0.65;
export const PRIMARY_MATERIAL_DIFFERENCE = 1 as const;

const VALID_EMOTIONS = new Set<AffectEmotion>([
  'joy', 'trust', 'fear', 'surprise', 'sadness',
  'disgust', 'anger', 'anticipation', 'other',
]);
const VALID_STANCES = new Set(['support', 'oppose', 'mixed', 'none', 'uncertain']);
const VALID_VALENCES = new Set([-2, -1, 0, 1, 2]);
const VALID_LEVELS = new Set([0, 1, 2, 3]);

export interface AffectivePairInput {
  participantId: string;
  mappingSentenceIndex: number;
  summarySentenceIndex: number | null;
  sourceSpan: string;
  sourceContext?: string;
  summarySpan: string | null;
  targetRelation: TargetRelation;
  /** Whether source-to-summary alignment was actually evaluated. */
  alignmentAssessed?: boolean;
  /** Equal-participant weight allocated across that participant's source units. */
  unitWeight?: number;
  sourceProfile: AffectProfile | null;
  summaryProfile: AffectProfile | null;
}

export interface AffectiveEvaluatorInfo {
  provider: AIProvider;
  model: string;
}

const normalizeForComparison = (value: string): string => value
  .normalize('NFKC')
  .replace(/[\u2018\u2019]/g, "'")
  .replace(/[\u201C\u201D]/g, '"')
  .replace(/[\u2013\u2014]/g, '-')
  .replace(/\s+/g, ' ')
  .trim()
  .toLocaleLowerCase();

/** Deterministic multilingual sentence-like segmentation for source census. */
export const splitVerbatimSourceUnits = (text: string): string[] => {
  return splitSentenceLikeUnits(text);
};

/**
 * Resolves a model-returned quote back to the actual source substring.
 * Only case and whitespace may differ. Paraphrases are deliberately rejected:
 * an unverified quote is not provenance evidence.
 */
export const resolveVerbatimSpan = (container: string, candidate: unknown): string | null => {
  if (typeof candidate !== 'string') return null;
  const phrase = candidate.trim();
  if (!phrase) return null;

  const directIndex = container.toLocaleLowerCase().indexOf(phrase.toLocaleLowerCase());
  if (directIndex >= 0) return container.slice(directIndex, directIndex + phrase.length);

  const normalizedCandidate = normalizeForComparison(phrase);
  if (!normalizedCandidate || !normalizeForComparison(container).includes(normalizedCandidate)) return null;

  // Recover the original substring while allowing only whitespace variation.
  const escapedTokens = phrase
    .split(/\s+/)
    .filter(Boolean)
    .map(token => token.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
  if (escapedTokens.length === 0) return null;
  const match = container.match(new RegExp(escapedTokens.join('\\s+'), 'iu'));
  return match?.[0] ?? null;
};

/** Strictly validates structured evaluator output. Invalid profiles stay missing. */
export const parseAffectProfile = (value: unknown): AffectProfile | null => {
  if (!value || typeof value !== 'object') return null;
  const candidate = value as Record<string, unknown>;
  if (!VALID_VALENCES.has(candidate.valence as number)) return null;
  if (!VALID_LEVELS.has(candidate.intensity as number)) return null;
  if (!VALID_LEVELS.has(candidate.urgency as number)) return null;
  if (!VALID_STANCES.has(candidate.stance as string)) return null;
  if (typeof candidate.target !== 'string' || !candidate.target.trim()) return null;
  if (typeof candidate.certainty !== 'number' || !Number.isFinite(candidate.certainty)) return null;
  if (candidate.certainty < 0 || candidate.certainty > 1) return null;
  if (!Array.isArray(candidate.emotions)) return null;

  const emotions: AffectEmotion[] = [];
  for (const emotion of candidate.emotions) {
    if (typeof emotion !== 'string' || !VALID_EMOTIONS.has(emotion as AffectEmotion)) return null;
    if (!emotions.includes(emotion as AffectEmotion)) emotions.push(emotion as AffectEmotion);
  }
  if (emotions.length > 3) return null;

  return {
    valence: candidate.valence as AffectProfile['valence'],
    intensity: candidate.intensity as AffectProfile['intensity'],
    urgency: candidate.urgency as AffectProfile['urgency'],
    emotions,
    stance: candidate.stance as AffectProfile['stance'],
    target: candidate.target.trim(),
    certainty: candidate.certainty,
  };
};

export const isAffectBearing = (profile: AffectProfile | null): boolean => !!profile && (
  profile.valence !== 0 || profile.intensity > 0 || profile.emotions.length > 0 ||
  profile.urgency > 0 || profile.stance === 'support' ||
  profile.stance === 'oppose' || profile.stance === 'mixed'
);

const emptyFlags = (): AffectiveTransitionFlags => ({
  valenceMagnitudeDelta: 0,
  intensityDelta: 0,
  urgencyDelta: 0,
  polarityReversed: false,
  stanceAssessed: false,
  stanceChanged: false,
  emotionSetChanged: false,
  profileTargetLabelsDiffer: false,
  attenuatedDimensions: [],
  amplifiedDimensions: [],
});

const emotionSetsDiffer = (a: AffectEmotion[], b: AffectEmotion[]): boolean => {
  if (a.length !== b.length) return true;
  const right = new Set(b);
  return a.some(label => !right.has(label));
};

const classifyPair = (
  pair: AffectivePairInput,
  minCertainty: number,
  materialDifference: 1 | 2,
): AffectiveFidelityCase => {
  const base = {
    participantId: pair.participantId,
    mappingSentenceIndex: pair.mappingSentenceIndex,
    summarySentenceIndex: pair.summarySentenceIndex,
    sourceSpan: pair.sourceSpan,
    sourceContext: pair.sourceContext,
    summarySpan: pair.summarySpan,
    targetRelation: pair.targetRelation,
    alignmentAssessed: pair.alignmentAssessed !== false,
    unitWeight: pair.unitWeight ?? 1,
    sourceProfile: pair.sourceProfile,
    summaryProfile: pair.summaryProfile,
    flags: emptyFlags(),
    sourceAffectBearing: isAffectBearing(pair.sourceProfile),
    comparable: false,
  };

  if (!pair.sourceProfile) {
    return { ...base, transition: 'uncertain', exclusionReason: 'missing_profile' };
  }
  if (pair.sourceProfile.certainty < minCertainty) {
    return { ...base, transition: 'uncertain', exclusionReason: 'low_certainty' };
  }
  if (pair.alignmentAssessed === false) {
    return { ...base, transition: 'unassessed', exclusionReason: 'alignment_unassessed' };
  }
  if (!pair.summarySpan) {
    return { ...base, transition: 'omitted' };
  }
  if (pair.targetRelation === 'uncertain') {
    return { ...base, transition: 'uncertain', exclusionReason: 'uncertain_target' };
  }
  if (pair.targetRelation === 'different') {
    return { ...base, transition: 'target_shifted' };
  }
  if (!pair.summaryProfile) {
    return { ...base, transition: 'uncertain', exclusionReason: 'missing_profile' };
  }
  if (pair.summaryProfile.certainty < minCertainty) {
    return { ...base, transition: 'uncertain', exclusionReason: 'low_certainty' };
  }

  const source = pair.sourceProfile;
  const summary = pair.summaryProfile;
  const valenceMagnitudeDelta = Math.abs(summary.valence) - Math.abs(source.valence);
  const intensityDelta = summary.intensity - source.intensity;
  const urgencyDelta = summary.urgency - source.urgency;
  const polarityReversed = source.valence !== 0 && summary.valence !== 0 &&
    Math.sign(source.valence) !== Math.sign(summary.valence);
  const stanceAssessed = source.stance !== 'uncertain' && summary.stance !== 'uncertain';
  const stanceChanged = stanceAssessed &&
    source.stance !== summary.stance;
  const emotionSetChanged = emotionSetsDiffer(source.emotions, summary.emotions);
  const profileTargetLabelsDiffer = normalizeForComparison(source.target) !== normalizeForComparison(summary.target);

  const attenuatedDimensions: AffectiveTransitionFlags['attenuatedDimensions'] = [];
  const amplifiedDimensions: AffectiveTransitionFlags['amplifiedDimensions'] = [];
  if (valenceMagnitudeDelta <= -materialDifference) attenuatedDimensions.push('valence');
  if (intensityDelta <= -materialDifference) attenuatedDimensions.push('intensity');
  if (urgencyDelta <= -materialDifference) attenuatedDimensions.push('urgency');
  if (valenceMagnitudeDelta >= materialDifference) amplifiedDimensions.push('valence');
  if (intensityDelta >= materialDifference) amplifiedDimensions.push('intensity');
  if (urgencyDelta >= materialDifference) amplifiedDimensions.push('urgency');

  const flags: AffectiveTransitionFlags = {
    valenceMagnitudeDelta,
    intensityDelta,
    urgencyDelta,
    polarityReversed,
    stanceAssessed,
    stanceChanged,
    emotionSetChanged,
    profileTargetLabelsDiffer,
    attenuatedDimensions,
    amplifiedDimensions,
  };

  let transition: AffectiveTransition;
  if (polarityReversed) transition = 'polarity_shifted';
  else if (stanceChanged) transition = 'stance_shifted';
  else if (attenuatedDimensions.length > 0 && amplifiedDimensions.length > 0) transition = 'mixed';
  else if (attenuatedDimensions.length > 0) transition = 'attenuated';
  else if (amplifiedDimensions.length > 0) transition = 'amplified';
  else if (emotionSetChanged) transition = 'emotion_shifted';
  else if (!stanceAssessed) transition = 'uncertain';
  else transition = 'preserved';

  // Both pointwise profiles passed the certainty and target screens, so the
  // numeric/emotion dimensions remain comparable even if stance abstained.
  // Keeping the case in the denominator avoids conditioning eligibility on
  // whether attenuation happened. The primary transition stays `uncertain`,
  // so the UI never labels the full multidimensional profile preserved.
  return { ...base, transition, flags, comparable: true };
};

const emptyCounts = (): Record<AffectiveTransition, number> => ({
  preserved: 0,
  attenuated: 0,
  amplified: 0,
  mixed: 0,
  polarity_shifted: 0,
  stance_shifted: 0,
  emotion_shifted: 0,
  target_shifted: 0,
  omitted: 0,
  unassessed: 0,
  uncertain: 0,
});

const pairKey = (pair: AffectivePairInput): string => [
  pair.participantId,
  String(pair.mappingSentenceIndex),
  normalizeForComparison(pair.sourceSpan),
  normalizeForComparison(pair.summarySpan ?? ''),
].join('\u241f');

export const deduplicateAffectivePairs = (pairs: AffectivePairInput[]): AffectivePairInput[] => {
  const seen = new Set<string>();
  return pairs.filter(pair => {
    const key = pairKey(pair);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
};

const summarizeSensitivity = (
  pairs: AffectivePairInput[],
  label: 'inclusive' | 'primary' | 'conservative',
  minCertainty: number,
  materialDifference: 1 | 2,
) => {
  const cases = pairs.map(pair => classifyPair(pair, minCertainty, materialDifference));
  const comparable = cases.filter(item => item.comparable && item.sourceAffectBearing);
  const attenuatedCount = comparable.filter(item =>
    item.flags.attenuatedDimensions.length > 0
  ).length;
  const { denominatorWeight: comparableWeight, numeratorWeight: attenuatedWeight } =
    participantBalancedWeights(comparable, item => item.flags.attenuatedDimensions.length > 0);
  return {
    label,
    minCertainty,
    materialDifference,
    comparableAffectBearingCount: comparable.length,
    attenuatedCount,
    comparableAffectBearingWeight: comparableWeight,
    attenuatedWeight,
    attenuationRate: comparableWeight > 0 ? attenuatedWeight / comparableWeight : null,
  };
};

/**
 * Each participant contributes total weight one inside the stated conditional
 * denominator, regardless of response length. The numerator is that
 * participant's fraction of eligible source units meeting the condition.
 */
const participantBalancedWeights = (
  cases: AffectiveFidelityCase[],
  isNumerator: (item: AffectiveFidelityCase) => boolean,
): { denominatorWeight: number; numeratorWeight: number } => {
  const byParticipant = new Map<string, AffectiveFidelityCase[]>();
  for (const item of cases) {
    const group = byParticipant.get(item.participantId) ?? [];
    group.push(item);
    byParticipant.set(item.participantId, group);
  }
  let numeratorWeight = 0;
  for (const group of byParticipant.values()) {
    numeratorWeight += group.filter(isNumerator).length / group.length;
  }
  return { denominatorWeight: byParticipant.size, numeratorWeight };
};

export const buildAffectiveFidelity = (
  rawPairs: AffectivePairInput[],
  evaluator: AffectiveEvaluatorInfo,
  generatedAt = new Date().toISOString(),
): AffectiveFidelity => {
  const pairs = deduplicateAffectivePairs(rawPairs);
  const cases = pairs.map(pair => classifyPair(
    pair,
    PRIMARY_MIN_CERTAINTY,
    PRIMARY_MATERIAL_DIFFERENCE,
  ));
  const counts = emptyCounts();
  cases.forEach(item => { counts[item.transition]++; });

  const comparable = cases.filter(item => item.comparable);
  const comparableAffectBearing = comparable.filter(item => item.sourceAffectBearing);
  const attenuationCount = comparableAffectBearing.filter(item =>
    item.flags.attenuatedDimensions.length > 0
  ).length;
  const sourceAffectBearing = cases.filter(item => item.sourceAffectBearing &&
    !!item.sourceProfile && item.sourceProfile.certainty >= PRIMARY_MIN_CERTAINTY);
  const assessedSourceAffectBearing = sourceAffectBearing.filter(item =>
    item.exclusionReason !== 'alignment_unassessed');
  const representedAffectBearing = assessedSourceAffectBearing.filter(item =>
    !!item.summarySpan && item.targetRelation === 'same');
  const comparableWeights = participantBalancedWeights(
    comparableAffectBearing,
    item => item.flags.attenuatedDimensions.length > 0,
  );
  const comparableAffectBearingWeight = comparableWeights.denominatorWeight;
  const attenuationWeight = comparableWeights.numeratorWeight;
  const sourceAffectBearingWeight = new Set(sourceAffectBearing.map(item => item.participantId)).size;
  const coverageWeights = participantBalancedWeights(
    assessedSourceAffectBearing,
    item => representedAffectBearing.includes(item),
  );
  const assessedSourceAffectBearingWeight = coverageWeights.denominatorWeight;
  const representedAffectBearingWeight = coverageWeights.numeratorWeight;
  const profileWeights = participantBalancedWeights(
    representedAffectBearing,
    item => item.comparable,
  );
  const sourceProfileWeights = participantBalancedWeights(cases, item => !!item.sourceProfile);
  const sourceProfileAboveCertainty = cases.filter(item =>
    !!item.sourceProfile && item.sourceProfile.certainty >= PRIMARY_MIN_CERTAINTY);
  const summaryProfileReturned = representedAffectBearing.filter(item => !!item.summaryProfile);

  return {
    methodVersion: AFFECTIVE_FIDELITY_METHOD_VERSION,
    generatedAt,
    evaluator: {
      provider: evaluator.provider,
      model: evaluator.model,
      requestedTemperature: 0,
      effectiveTemperature:
        (evaluator.provider === 'gemini' && /^gemini-3\.7(?:-|$)/.test(evaluator.model)) ||
        (evaluator.provider === 'openai' && /^gpt-5(?:\.|-|$)/.test(evaluator.model))
          ? null : 0,
      ...(
        evaluator.provider === 'openai' && /^gpt-5(?:\.|-|$)/.test(evaluator.model)
          ? { reasoningEffort: 'low' }
          : {}
      ),
      promptVersion: AFFECT_PROFILE_PROMPT_VERSION,
    },
    thresholds: {
      minCertainty: PRIMARY_MIN_CERTAINTY,
      materialDifference: PRIMARY_MATERIAL_DIFFERENCE,
    },
    cases,
    stageCounts: {
      totalSourceUnits: cases.length,
      sourceProfileReturned: cases.filter(item => !!item.sourceProfile).length,
      sourceProfileAboveCertainty: sourceProfileAboveCertainty.length,
      sourceAffectBearing: sourceAffectBearing.length,
      alignmentAssessedAffectBearing: assessedSourceAffectBearing.length,
      sameTargetAlignedAffectBearing: representedAffectBearing.length,
      summaryProfileReturned: summaryProfileReturned.length,
      comparableAffectBearing: comparableAffectBearing.length,
    },
    sourceProfileCompletionRate: sourceProfileWeights.denominatorWeight > 0
      ? sourceProfileWeights.numeratorWeight / sourceProfileWeights.denominatorWeight
      : null,
    sourceProfileCompletedWeight: sourceProfileWeights.numeratorWeight,
    sourceCensusParticipantWeight: sourceProfileWeights.denominatorWeight,
    counts,
    comparableCount: comparable.length,
    comparableAffectBearingCount: comparableAffectBearing.length,
    sourceAffectBearingCount: sourceAffectBearing.length,
    representedAffectBearingCount: representedAffectBearing.length,
    comparableAffectBearingWeight,
    sourceAffectBearingWeight,
    assessedSourceAffectBearingWeight,
    representedAffectBearingWeight,
    profileEligibleAffectBearingWeight: profileWeights.denominatorWeight,
    profileComparableAffectBearingWeight: profileWeights.numeratorWeight,
    attenuatedWeight: attenuationWeight,
    attenuationRate: comparableAffectBearingWeight > 0
      ? attenuationWeight / comparableAffectBearingWeight
      : null,
    affectiveCoverageRate: assessedSourceAffectBearingWeight > 0
      ? representedAffectBearingWeight / assessedSourceAffectBearingWeight
      : null,
    profileComparabilityRate: profileWeights.denominatorWeight > 0
      ? profileWeights.numeratorWeight / profileWeights.denominatorWeight
      : null,
    sensitivity: [
      summarizeSensitivity(pairs, 'inclusive', 0.5, 1),
      summarizeSensitivity(pairs, 'primary', PRIMARY_MIN_CERTAINTY, 1),
      summarizeSensitivity(pairs, 'conservative', 0.8, 2),
    ],
    limitations: [
      'This is a model-estimated audit of expressed affective/evaluative language, not a measurement of a person\'s internal emotional state.',
      'Model-reported certainty is an exclusion screen, not a calibrated probability or confidence interval.',
      'Source-profile completion is reported over the complete source census; later rates condition on successfully profiled, affect-bearing source units.',
      'The method has not been validated against human-coded data for this dataset, language, culture, or domain.',
      'Only verified verbatim source and summary spans with the same target are compared.',
      'Every sentence-like source unit is inventoried before alignment; alignment failures remain unassessed rather than being counted as omissions.',
      'Alignment coverage and affect-profile comparability are reported separately so evaluator profile failures are not mislabeled as missing source representation.',
      'Source units are an automated sentence segmentation proxy and may combine multiple targets or split one target across units.',
      'Same-target status is assigned by the automated alignment evaluator and has not been independently calibrated.',
      'Free-text targets from the independent pointwise profiles are shown and literal disagreements are flagged for review; they are not automatically equated or excluded because labels may be paraphrases.',
      'An uncertain stance cannot be labelled preserved; cases with another measurable change remain comparable only on the assessed dimensions.',
      'The attenuation rate counts any comparable case with a materially attenuated dimension, including cases primarily labelled as a polarity or stance shift.',
      'Ordinal levels are descriptive categories; adjacent levels are not assumed to be equal-interval measurements.',
      'Requested evaluator settings may be unsupported by a provider/model; requested and effective temperature are recorded separately.',
      'A separately configured evaluator model/provider can reduce direct generator self-review, but shared model-family or training-data effects and automated evaluator bias remain.',
      'Within each conditional estimand, eligible source units are averaged within participant and participants then receive equal weight; raw case counts are descriptive only.',
    ],
  };
};
