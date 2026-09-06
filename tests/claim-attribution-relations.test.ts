import {
  evidenceContainsExplicitDisagreement,
  isDisagreementMetaClaim,
  selectEvidencePassage,
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

console.log(`\n${fail === 0 ? 'ALL CHECKS PASSED' : 'FAILURES'} - passed ${pass}, failed ${fail}`);
process.exit(fail === 0 ? 0 : 1);
