import { normalizeRelationshipKeywords } from './.modules/services/graphRAG.ts';

let pass = 0;
let fail = 0;
const check = (name: string, condition: boolean, detail = '') => {
  if (condition) { pass++; console.log(`  PASS  ${name}`); }
  else { fail++; console.log(`  FAIL  ${name}${detail ? ` - ${detail}` : ''}`); }
};

console.log('\n[Knowledge-graph structured-output normalization]');

check(
  'accepts the requested comma-separated string shape',
  normalizeRelationshipKeywords('privacy, data governance') === 'privacy, data governance',
);
check(
  'accepts the JSON-array shape returned by Ollama models',
  normalizeRelationshipKeywords(['privacy', 'data governance']) === 'privacy, data governance',
);
check(
  'splits comma-delimited values inside arrays and removes case-insensitive duplicates',
  normalizeRelationshipKeywords(['Privacy, consent', 'privacy', 'security']) === 'Privacy, consent, security',
);
check(
  'ignores non-string values instead of coercing them into evidence',
  normalizeRelationshipKeywords({ keyword: 'privacy' }) === '' &&
    normalizeRelationshipKeywords(['privacy', 7, null]) === 'privacy',
);
check(
  'enforces the five-keyword evidence bound',
  normalizeRelationshipKeywords(['a', 'b', 'c', 'd', 'e', 'f']) === 'a, b, c, d, e',
);

console.log(`\n${fail === 0 ? 'ALL CHECKS PASSED' : 'FAILURES'} - passed ${pass}, failed ${fail}`);
process.exit(fail === 0 ? 0 : 1);
