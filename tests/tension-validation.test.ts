import { MAX_TENSION_RECORDS_PER_CLUSTER, sampleClusterRecords, validateDetectedTensionPayload } from './.modules/services/tensionAnalysis.ts';

let pass = 0;
let fail = 0;
const check = (name: string, condition: boolean, detail = '') => {
  if (condition) { pass++; console.log(`  PASS  ${name}`); }
  else { fail++; console.log(`  FAIL  ${name}${detail ? ` - ${detail}` : ''}`); }
};

const groupA = [{ id: 'a0', clusterId: 0, text: 'Exact locations must be published for every observation.' }];
const groupB = [{ id: 'b0', clusterId: 1, text: 'Exact locations must never be published for sensitive species.' }];

console.log('\n[Conservative tension candidate validation]');
const valid = validateDetectedTensionPayload([{
  participantA: 'a0',
  quoteA: 'Exact locations must be published for every observation.',
  participantB: 'b0',
  quoteB: 'Exact locations must never be published for sensitive species.',
  tensionType: 'incompatible_policy',
  incompatibility: 'The universal publication rule conflicts with the prohibition for sensitive species.',
}], groupA, groupB);
check('accepts allowlisted IDs, exact spans, and a conservative type', valid.length === 1);
check('stores exact evidence spans rather than whole-record substitutions',
  valid[0]?.claimA.text === groupA[0].text && valid[0]?.claimB.text === groupB[0].text);
check('allows whitespace-only quote variation while retaining source wording', validateDetectedTensionPayload([{
  participantA: 'a0', quoteA: 'Exact   locations must be published for every observation.',
  participantB: 'b0', quoteB: groupB[0].text, tensionType: 'direct_contradiction',
  incompatibility: 'One rule requires publication and the other prohibits it for a defined subset.',
}], groupA, groupB)[0]?.claimA.text === groupA[0].text);

check('rejects an invented source quote', validateDetectedTensionPayload([{
  participantA: 'a0', quoteA: 'Locations may be public.', participantB: 'b0', quoteB: groupB[0].text,
  tensionType: 'incompatible_policy', incompatibility: 'These rules conflict directly and cannot both be implemented.',
}], groupA, groupB).length === 0);
check('rejects an unknown participant ID', validateDetectedTensionPayload([{
  participantA: 'unknown', quoteA: groupA[0].text, participantB: 'b0', quoteB: groupB[0].text,
  tensionType: 'incompatible_policy', incompatibility: 'These rules conflict directly and cannot both be implemented.',
}], groupA, groupB).length === 0);
check('rejects broad priority and emphasis labels outside the conservative taxonomy', validateDetectedTensionPayload([{
  participantA: 'a0', quoteA: groupA[0].text, participantB: 'b0', quoteB: groupB[0].text,
  tensionType: 'priority_conflict', incompatibility: 'The records emphasize different priorities in the project.',
}], groupA, groupB).length === 0);

console.log('\n[Disclosed source-screening coverage]');
const participants = Array.from({ length: MAX_TENSION_RECORDS_PER_CLUSTER + 3 }, (_, index) => ({
  id: `a${index}`,
  originalText: `Record ${index}`,
  representationScore: index / 20,
  semanticIsolation: index / 30,
  clusterId: 0,
})) as any;
participants.push({
  id: 'b0', originalText: 'Other group record', representationScore: 0.5, semanticIsolation: 0, clusterId: 1,
});
const inputs = participants.map((participant: any) => ({ id: participant.id, text: participant.originalText }));
const sampled = sampleClusterRecords(participants, inputs, [
  { id: 0, label: 'A', color: '#000000' },
  { id: 1, label: 'B', color: '#ffffff' },
]);
check('ordinary groups are screened completely', sampled.recordsByCluster.get(1)?.length === 1);
check('large groups respect the declared context cap', sampled.recordsByCluster.get(0)?.length === MAX_TENSION_RECORDS_PER_CLUSTER);
check('exported coverage distinguishes screened from total records',
  sampled.coverage.screenedRecords === MAX_TENSION_RECORDS_PER_CLUSTER + 1 &&
  sampled.coverage.totalRecords === MAX_TENSION_RECORDS_PER_CLUSTER + 4);

console.log(`\n${fail === 0 ? 'ALL CHECKS PASSED' : 'FAILURES'} - passed ${pass}, failed ${fail}`);
process.exit(fail === 0 ? 0 : 1);
