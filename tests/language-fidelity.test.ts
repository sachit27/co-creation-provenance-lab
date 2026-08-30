import { summarizeLanguageTransformation } from '../tests/.modules/services/languageFidelity.ts';

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

console.log(`\n${fail === 0 ? 'ALL CHECKS PASSED' : 'FAILURES'} — passed ${pass}, failed ${fail}`);
process.exit(fail === 0 ? 0 : 1);
