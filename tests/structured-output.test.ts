import { parseStructuredArray } from '../tests/.modules/services/structuredOutput.ts';

let pass = 0;
let fail = 0;
const check = (name: string, condition: boolean) => {
  if (condition) { pass++; console.log(`  PASS  ${name}`); }
  else { fail++; console.log(`  FAIL  ${name}`); }
};

console.log('\n[1] Structured model-output envelopes');
check('accepts the documented wrapper object',
  parseStructuredArray('{"assessments":[{"unitId":"l0-0-0"}]}', 'assessments')?.length === 1);
check('accepts a fenced bare array from a local model',
  parseStructuredArray('```json\n[{"unitId":"l0-0-0"},{"unitId":"l1-0-0"}]\n```', 'assessments')?.length === 2);
check('extracts a bounded JSON envelope from surrounding prose',
  parseStructuredArray('Result:\n{"profiles":[{"unitId":"u24"}]}\nDone.', 'profiles')?.[0] != null);
check('rejects malformed output instead of inventing an empty result',
  parseStructuredArray('{"assessments":[}', 'assessments') === null);
check('rejects a valid object with the wrong schema key',
  parseStructuredArray('{"profiles":[]}', 'assessments') === null);

console.log(`\n${fail === 0 ? 'ALL CHECKS PASSED' : 'FAILURES'} — passed ${pass}, failed ${fail}`);
process.exit(fail === 0 ? 0 : 1);
