import {
  evidenceContainsExplicitDisagreement,
  isDisagreementMetaClaim,
  isPopulationScopeClaim,
  selectEvidencePassage,
  validateAtomicDecomposition,
  validateProposedSupportLevel,
} from './.modules/services/claimAttribution.ts';

let pass = 0;
let fail = 0;
const check = (name: string, condition: boolean, detail = '') => {
  if (condition) { pass++; console.log(`  PASS  ${name}`); }
  else { fail++; console.log(`  FAIL  ${name}${detail ? ` - ${detail}` : ''}`); }
};

const claim = 'There was disagreement over repurposing community-garden plots for flood storage.';
const waterText = 'For stormwater and flood resilience planning, the community-garden plots occupy the only feasible flood-storage basin. Every plot should be removed so the entire site can become a stormwater retention area.';
const stewardshipText = 'For equitable access and community stewardship, the community-garden plots must remain in their current location and must not become flood storage. Families depend on the whole site for food and social support.';

const evidence = [
  { participantId: 'Stewardship_06', passage: selectEvidencePassage(stewardshipText, claim), similarity: 0.52 },
  { participantId: 'Water_06', passage: selectEvidencePassage(waterText, claim), similarity: 0.48 },
];

console.log('\n[Relational claim attribution]');
check('recognizes a claim that reports participant disagreement', isDisagreementMetaClaim(claim));
check('does not confuse a one-sided opposition claim with a disagreement meta-claim',
  !isDisagreementMetaClaim('Participants opposed repurposing the garden plots.'));
check('keeps the decisive action sentence in the water evidence excerpt',
  evidence[1].passage.includes('Every plot should be removed'));
check('keeps the prohibition in the stewardship evidence excerpt',
  evidence[0].passage.includes('must not become flood storage'));
check('recognizes the exact retrieved pair as an explicit disagreement',
  evidenceContainsExplicitDisagreement(evidence));
check('opposing participant positions support a meta-claim that disagreement existed',
  validateProposedSupportLevel('contradicted', claim, evidence, true) === 'supported');

const oneSidedEvidence = [evidence[0]];
check('one stance cannot contradict a claim that disagreement existed',
  validateProposedSupportLevel('contradicted', claim, oneSidedEvidence, true) !== 'contradicted');
check('ordinary claim-evidence contradiction labels remain available',
  validateProposedSupportLevel(
    'contradicted',
    'Participants agreed that every garden plot should become flood storage.',
    oneSidedEvidence,
    true,
  ) === 'contradicted');
check('recognizes claims that require consultation-wide prevalence evidence',
  isPopulationScopeClaim('There is a consensus that tree planting should prioritize low-income neighbourhoods.'));
check('top-k passages cannot establish consensus',
  validateProposedSupportLevel(
    'supported',
    'There is a consensus that tree planting should prioritize low-income neighbourhoods.',
    evidence,
    true,
  ) === 'unassessed');
check('one source cannot support a claim explicitly attributed to plural participants',
  validateProposedSupportLevel(
    'supported',
    'Participants advocated for retaining the garden plots.',
    oneSidedEvidence,
    true,
  ) === 'unsupported');
check('irrelevant retrieved candidates do not count as additional supporters',
  validateProposedSupportLevel(
    'supported',
    'Participants advocated for retaining the garden plots.',
    evidence,
    true,
    ['Stewardship_06'],
  ) === 'unsupported');
check('two adjudicated supporting sources can establish plural attribution',
  validateProposedSupportLevel(
    'supported',
    'Participants advocated for retaining the garden plots.',
    [
      evidence[0],
      { participantId: 'Stewardship_08', passage: 'The community-garden plots must remain available to residents.', similarity: 0.46 },
    ],
    true,
    ['Stewardship_06', 'Stewardship_08'],
  ) === 'supported');

console.log('\n[Meaning-preserving atomic decomposition]');
const compoundSentence = 'Transparency in decision-making and funding processes is deemed essential for building trust and ensuring that community voices are heard and prioritized.';
const faithfulClaims = [
  'Transparency in decision-making and funding processes is deemed essential for building trust',
  'Transparency in decision-making and funding processes is deemed essential for ensuring that community voices are heard and prioritized',
];
const flawedClaims = [
  'Transparency in decision-making processes is deemed essential for building trust',
  'Transparency in funding processes is deemed essential for building trust',
  'Transparency in decision-making processes is deemed essential for ensuring that community voices are heard',
];
check('accepts a complete decomposition that preserves coordinated-subject scope',
  validateAtomicDecomposition(compoundSentence, faithfulClaims).length === 2);
check('rejects the exact asymmetric and incomplete decomposition seen in S16',
  validateAtomicDecomposition(compoundSentence, flawedClaims)[0] === compoundSentence);
check('falls back to the original sentence when a qualifier is dropped',
  validateAtomicDecomposition(compoundSentence, [faithfulClaims[0], faithfulClaims[1].replace(' and prioritized', '')])[0] === compoundSentence);
check('falls back to the original sentence when new substantive wording is invented',
  validateAtomicDecomposition(compoundSentence, [compoundSentence.replace('essential', 'critical')])[0] === compoundSentence);
check('falls back to the original sentence when substantive word order changes',
  validateAtomicDecomposition(compoundSentence, [compoundSentence.replace('building trust', 'trust building')])[0] === compoundSentence);
check('retains an unchanged sentence as one valid claim unit',
  validateAtomicDecomposition(compoundSentence, [compoundSentence])[0] === compoundSentence);
const monitoringSentence = 'Monitoring efforts, including surveys of wildlife populations, were deemed necessary to assess the success of restoration initiatives.';
const redundantMonitoringClaims = [
  'Monitoring efforts were deemed necessary',
  'Surveys of wildlife populations were deemed necessary',
  'Monitoring efforts, including surveys of wildlife populations, were deemed necessary to assess the success of restoration initiatives',
];
check('rejects a full claim accompanied by redundant shorter restatements',
  validateAtomicDecomposition(monitoringSentence, redundantMonitoringClaims)[0] === monitoringSentence);

console.log(`\n${fail === 0 ? 'ALL CHECKS PASSED' : 'FAILURES'} - passed ${pass}, failed ${fail}`);
process.exit(fail === 0 ? 0 : 1);
