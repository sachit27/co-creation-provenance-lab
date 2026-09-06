import {
  isPlausibleLanguageAlignment,
  summarizeLanguageTransformation,
} from '../tests/.modules/services/languageFidelity.ts';

let pass = 0, fail = 0;
const check = (name: string, condition: boolean, detail = '') => {
  if (condition) { pass++; console.log(`  PASS  ${name}`); }
  else { fail++; console.log(`  FAIL  ${name} ${detail}`); }
};

const mapping = (
  participantId: string,
  sourceUnitIndex: number,
  type: 'preserved' | 'softened' | 'sanitized' | 'abstracted' | 'target_shifted' | 'target_uncertain' | 'dropped' | 'unassessed',
  summarySentenceIndex: number | null,
) => ({
  participantId,
  sourceUnitId: `${participantId}-${sourceUnitIndex}`,
  sourceUnitIndex,
  rawPhrase: `source ${participantId} ${sourceUnitIndex}`,
  summaryPhrase: summarySentenceIndex === null ? null : 'summary evidence',
  summarySentenceIndex,
  type,
  targetRelation: type === 'target_shifted' ? 'different' : (type === 'unassessed' || type === 'target_uncertain') ? 'uncertain' : 'same',
  alignmentAssessed: type !== 'unassessed',
}) as any;

console.log('\n[1] Complete census and explicit missingness');
const result = summarizeLanguageTransformation(
  ['summary evidence'],
  [
    mapping('A', 0, 'preserved', 0),
    mapping('A', 1, 'preserved', 0),
    mapping('A', 2, 'preserved', 0),
    mapping('A', 3, 'preserved', 0),
    mapping('B', 0, 'dropped', null),
    mapping('C', 0, 'unassessed', null),
  ],
  { provider: 'gemini', model: 'test-model' },
);
check('every inventoried source unit remains in the result', result.sourceMappings?.length === 6);
check('unassessed output is counted separately from omission', result.overallCounts.unassessed === 1 && result.overallCounts.dropped === 1);
check('partial evaluator failure lowers assessment coverage', Math.abs((result.assessmentCoverageRate ?? 0) - 2 / 3) < 1e-12);
check('unassessed participant is not asserted as fully dropped',
  !result.summaryDroppedParticipantIds.includes('C'));
check('only a fully assessed, wholly absent participant is marked dropped',
  result.summaryDroppedParticipantIds.length === 1 && result.summaryDroppedParticipantIds[0] === 'B');

console.log('\n[2] Participant-balanced conditional preservation');
check('long participant A cannot dominate participant B',
  Math.abs((result.fidelityScore ?? 0) - 0.5) < 1e-12,
  `got ${result.fidelityScore}`);
check('numerator and denominator travel with the percentage',
  result.preservedParticipantEquivalent === 1 && result.assessedParticipantEquivalent === 2);

console.log('\n[3] Target shift is never counted as preservation');
const shifted = summarizeLanguageTransformation(
  ['summary evidence'],
  [mapping('A', 0, 'preserved', 0), mapping('B', 0, 'target_shifted', 0)],
  { provider: 'gemini', model: 'test-model' },
);
check('target-shifted mappings have their own category', shifted.overallCounts.target_shifted === 1);
check('target shift contributes zero to preservation numerator', shifted.fidelityScore === 0.5);

const abstained = summarizeLanguageTransformation(
  ['summary evidence'],
  [mapping('A', 0, 'target_uncertain', 0)],
  { provider: 'gemini', model: 'test-model' },
);
check('valid target abstention counts as complete output, not execution failure',
  abstained.completedSourceUnitCount === 1 && abstained.overallCounts.unassessed === 0);
check('target-uncertain unit is excluded from conditional preservation denominator',
  abstained.fidelityScore === null && abstained.assessedParticipantEquivalent === 0);

console.log('\n[4] Conservative alignment cross-check');
const summarySentences = [
  'Preserving dead wood and leaf litter provides habitat for many species.',
  'Monitoring wildlife populations across several seasons can assess restoration.',
  'Rain gardens and vegetated bioswales capture stormwater.',
];
const participant = {
  id: 'Habitat_09',
  representationScore: 0.49,
  topSentenceMatchIndex: 1,
  sentenceMatches: [{ sentenceIndex: 1, similarity: 0.49 }],
} as any;
check('accepts a sentence retained by dense record retrieval',
  isPlausibleLanguageAlignment(
    'Bird, bat, pollinator, and vegetation surveys are needed before and after restoration.',
    1,
    summarySentences,
    participant,
  ));
check('same-language dense topic retrieval alone cannot establish proposition alignment',
  !isPlausibleLanguageAlignment(
    'Sensitive locations must never be disclosed.',
    1,
    summarySentences,
    participant,
  ));
check('dense retrieval can validate cross-language alignment without literal anchors',
  isPlausibleLanguageAlignment(
    'Die Beobachtung muss mehrere Jahreszeiten umfassen.',
    1,
    summarySentences,
    { ...participant, detectedLanguage: 'de' },
  ));
check('accepts an exact lexical alignment without a participant record',
  isPlausibleLanguageAlignment(
    'Dead wood and leaf litter must remain in habitat areas.',
    0,
    summarySentences,
  ));
check('rejects a different same-topic object that neither retrieval nor exact anchors support',
  !isPlausibleLanguageAlignment(
    'Precise nest coordinates should be withheld from public maps.',
    0,
    summarySentences,
    participant,
  ));
check('rejects an unrelated dashboard-to-rain-garden alignment',
  !isPlausibleLanguageAlignment(
    'A public dashboard should show spending and maintenance progress.',
    2,
    summarySentences,
  ));

console.log(`\n${fail === 0 ? 'ALL CHECKS PASSED' : 'FAILURES'} — passed ${pass}, failed ${fail}`);
process.exit(fail === 0 ? 0 : 1);
