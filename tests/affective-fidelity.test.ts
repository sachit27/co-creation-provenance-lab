/**
 * Regression tests for the automated affective-fidelity method.
 * Prepare imports first: node tests/prepare-modules.mjs
 * Run: node --experimental-strip-types tests/affective-fidelity.test.ts
 */
import {
  buildAffectiveFidelity,
  parseAffectProfile,
  resolveVerbatimSpan,
  splitVerbatimSourceUnits,
  targetLabelsShareAnchor,
} from '../tests/.modules/services/affectiveFidelity.ts';

let pass = 0, fail = 0;
const check = (name: string, condition: boolean, detail = '') => {
  if (condition) { pass++; console.log(`  PASS  ${name}`); }
  else { fail++; console.log(`  FAIL  ${name} ${detail}`); }
};
const approx = (a: number | null, b: number, epsilon = 1e-12) => a !== null && Math.abs(a - b) < epsilon;

console.log('\n[1] Verified evidence spans');
check('resolves an exact quote case-insensitively',
  resolveVerbatimSpan('Residents are FURIOUS about the delay.', 'furious about the delay') === 'FURIOUS about the delay');
check('allows whitespace-only variation',
  resolveVerbatimSpan('urgent\n action is needed', 'urgent action is needed') === 'urgent\n action is needed');
check('rejects a plausible paraphrase',
  resolveVerbatimSpan('The fees are impossible for us.', 'The costs are unaffordable.') === null);
check('rejects an empty quote', resolveVerbatimSpan('anything', '') === null);
check('source census preserves lower-case sentence boundaries',
  JSON.stringify(splitVerbatimSourceUnits('First point. second point.')) === JSON.stringify(['First point.', 'second point.']));
check('source census handles newlines and multilingual terminators',
  JSON.stringify(splitVerbatimSourceUnits('Line one\n第二点。 ثالثاً؟')) === JSON.stringify(['Line one', '第二点。', 'ثالثاً؟']));

console.log('\n[2] Structured profile validation');
const valid = {
  valence: -2, intensity: 3, urgency: 2, emotions: ['anger'],
  stance: 'oppose', target: 'service cuts', certainty: 0.91,
};
check('accepts a fully valid ordinal profile', parseAffectProfile(valid)?.target === 'service cuts');
check('rejects continuous/out-of-rubric valence', parseAffectProfile({ ...valid, valence: -1.5 }) === null);
check('rejects invented emotion labels', parseAffectProfile({ ...valid, emotions: ['frustration'] }) === null);
check('rejects unbounded self-certainty', parseAffectProfile({ ...valid, certainty: 1.2 }) === null);
check('does not coerce malformed output to neutral', parseAffectProfile({ target: 'x' }) === null);

const profile = (
  valence: -2 | -1 | 0 | 1 | 2,
  intensity: 0 | 1 | 2 | 3,
  urgency: 0 | 1 | 2 | 3,
  emotions: string[],
  stance: 'support' | 'oppose' | 'mixed' | 'none' | 'uncertain',
  certainty = 0.9,
) => ({ valence, intensity, urgency, emotions, stance, target: 'policy', certainty }) as any;

const pair = (id: string, source: any, summary: any, overrides: Record<string, unknown> = {}) => ({
  participantId: id,
  mappingSentenceIndex: 0,
  summarySentenceIndex: 0,
  sourceSpan: `source ${id}`,
  summarySpan: `summary ${id}`,
  targetRelation: 'same',
  sourceProfile: source,
  summaryProfile: summary,
  ...overrides,
}) as any;

console.log('\n[3] Deterministic target-aware transitions');
const pairs = [
  pair('attenuated', profile(-2, 3, 3, ['anger'], 'oppose'), profile(-1, 1, 1, ['anger'], 'oppose')),
  pair('polarity', profile(-1, 2, 1, ['anger'], 'oppose'), profile(1, 2, 1, ['joy'], 'oppose')),
  pair('stance', profile(0, 0, 0, [], 'support'), profile(0, 0, 0, [], 'oppose')),
  pair('mixed', profile(-2, 1, 1, ['fear'], 'oppose'), profile(-1, 2, 1, ['fear'], 'oppose')),
  pair('omitted', profile(-1, 2, 2, ['sadness'], 'oppose'), null, { summarySpan: null, summarySentenceIndex: null }),
  pair('target', profile(-1, 2, 1, ['fear'], 'oppose'), profile(-1, 2, 1, ['fear'], 'oppose'), { targetRelation: 'different' }),
  pair('low-certainty', profile(-1, 2, 1, ['fear'], 'oppose', 0.4), profile(0, 0, 0, [], 'none')),
  pair('neutral', profile(0, 0, 0, [], 'none'), profile(0, 0, 0, [], 'none')),
  pair('stance-uncertain', profile(-1, 1, 0, [], 'uncertain'), profile(-1, 1, 0, [], 'oppose')),
  pair('target-label-review', { ...profile(-1, 2, 1, ['fear'], 'oppose'), target: 'shade trees' }, { ...profile(-1, 2, 1, ['fear'], 'oppose'), target: 'mature shade trees' }),
  pair('target-label-mismatch', { ...profile(-1, 2, 1, ['fear'], 'oppose'), target: 'heatwaves making walks unbearable' }, { ...profile(1, 2, 1, ['joy'], 'support'), target: 'shade in public spaces' }),
];
// Duplicate evidence must not inflate any denominator.
pairs.push({ ...pairs[0] });

const result = buildAffectiveFidelity(pairs, { provider: 'openai', model: 'test-model' }, '2026-01-01T00:00:00.000Z');
const byId = new Map(result.cases.map(item => [item.participantId, item]));
check('classifies ordinal decreases as attenuation', byId.get('attenuated')?.transition === 'attenuated');
check('polarity reversal takes precedence over magnitude change', byId.get('polarity')?.transition === 'polarity_shifted');
check('keeps stance separate from valence', byId.get('stance')?.transition === 'stance_shifted');
check('does not force opposing dimension changes into one direction', byId.get('mixed')?.transition === 'mixed');
check('treats missing mapped summary evidence as omission', byId.get('omitted')?.transition === 'omitted');
check('does not compare affect across changed targets', byId.get('target')?.transition === 'target_shifted');
check('low-certainty output is uncertain, not neutral/preserved', byId.get('low-certainty')?.transition === 'uncertain');
check('uncertain stance cannot be labelled preserved', byId.get('stance-uncertain')?.transition === 'uncertain');
check('literal profile-target disagreement is surfaced without overriding alignment',
  byId.get('target-label-review')?.flags.profileTargetLabelsDiffer === true && byId.get('target-label-review')?.transition === 'preserved');
check('unanchored profile targets abstain instead of creating a false polarity shift',
  byId.get('target-label-mismatch')?.transition === 'uncertain' &&
  byId.get('target-label-mismatch')?.exclusionReason === 'uncertain_target' &&
  byId.get('target-label-mismatch')?.comparable === false);
check('target anchor helper distinguishes paraphrase-like overlap from different objects',
  targetLabelsShareAnchor('shade trees', 'mature shade trees') &&
  !targetLabelsShareAnchor('heatwaves making walks unbearable', 'shade in public spaces'));
check('deduplicates repeated source-summary evidence', result.cases.length === 11, `got ${result.cases.length}`);

console.log('\n[4] Denominators and sensitivity');
check('neutral mappings cannot dilute the affect-bearing denominator', result.comparableAffectBearingCount === 6, `got ${result.comparableAffectBearingCount}`);
check('stance abstention does not make numeric-dimension eligibility depend on the outcome', byId.get('stance-uncertain')?.comparable === true);
check('expressed stance is affective/evaluative even at neutral valence', byId.get('stance')?.sourceAffectBearing === true);
check('attenuation rate includes unchanged stance-abstention cases in its denominator', approx(result.attenuationRate, 2 / 6), `got ${result.attenuationRate}`);
check('coverage denominator includes valid affect-bearing omissions/target changes', result.sourceAffectBearingCount === 9, `got ${result.sourceAffectBearingCount}`);
check('coverage numerator records verified source-to-summary alignments independently of profile comparability', result.representedAffectBearingCount === 7, `got ${result.representedAffectBearingCount}`);
check('coverage is reported conditionally with an explicit denominator', approx(result.affectiveCoverageRate, 7 / 9), `got ${result.affectiveCoverageRate}`);
check('primary sensitivity reproduces the primary estimate',
  result.sensitivity.find(point => point.label === 'primary')?.attenuationRate === result.attenuationRate);
check('method provenance records deterministic evaluation settings',
  result.evaluator.requestedTemperature === 0 && result.evaluator.effectiveTemperature === 0 &&
  result.evaluator.promptVersion === 'affect-profile-v2-source-census');

const weighted = buildAffectiveFidelity([
  pair('long', profile(-2, 3, 3, ['anger'], 'oppose'), profile(-1, 2, 2, ['anger'], 'oppose'), { mappingSentenceIndex: 0, unitWeight: 0.5 }),
  pair('long', profile(-2, 3, 3, ['anger'], 'oppose'), profile(-2, 3, 3, ['anger'], 'oppose'), { mappingSentenceIndex: 1, sourceSpan: 'second long unit', summarySpan: 'second summary unit', unitWeight: 0.5 }),
  pair('short', profile(-2, 3, 3, ['anger'], 'oppose'), profile(-2, 3, 3, ['anger'], 'oppose'), { unitWeight: 1 }),
], { provider: 'openai', model: 'test-model' });
check('participant weighting prevents long responses from dominating rates', approx(weighted.attenuationRate, 0.25), `got ${weighted.attenuationRate}`);

const unassessed = buildAffectiveFidelity([
  pair('failed-alignment', profile(-1, 2, 1, ['fear'], 'oppose'), null, {
    summarySpan: null, summarySentenceIndex: null, alignmentAssessed: false,
  }),
], { provider: 'openai', model: 'test-model' });
check('alignment failure is unassessed, never counted as omission',
  unassessed.cases[0]?.transition === 'unassessed' && unassessed.counts.omitted === 0);
check('unassessed cases are excluded from conditional coverage denominator',
  unassessed.assessedSourceAffectBearingWeight === 0 && unassessed.affectiveCoverageRate === null);

const profileFailure = buildAffectiveFidelity([
  pair('profile-failed', profile(-1, 2, 1, ['fear'], 'oppose'), null, {
    summarySpan: 'verified aligned wording', summarySentenceIndex: 0, alignmentAssessed: true,
  }),
], { provider: 'openai', model: 'test-model' });
check('summary profile failure does not masquerade as missing alignment coverage',
  profileFailure.affectiveCoverageRate === 1);
check('summary profile failure is exposed in a separate comparability rate',
  profileFailure.profileComparabilityRate === 0);

console.log(`\n${fail === 0 ? 'ALL CHECKS PASSED' : 'FAILURES'} — passed ${pass}, failed ${fail}`);
process.exit(fail === 0 ? 0 : 1);
