/** Regression tests for the production retrieval indicator. */
import { maxSentenceCosineScore } from '../tests/.modules/services/mathUtils.ts';

let pass = 0, fail = 0;
const check = (name: string, condition: boolean, detail = '') => {
  if (condition) { pass++; console.log(`  PASS  ${name}`); }
  else { fail++; console.log(`  FAIL  ${name}  ${detail}`); }
};

console.log('\n[1] Maximum-sentence retrieval indicator');
check('uses the strongest source-to-summary sentence similarity',
  maxSentenceCosineScore([0.62, 0.55, 0.5]) === 0.62);
check('adding weaker summary sentences cannot inflate the score',
  maxSentenceCosineScore([0.62, 0.55, 0.5]) === maxSentenceCosineScore([0.62]));
check('adding a stronger match increases the indicator to that match',
  maxSentenceCosineScore([0.62, 0.8]) === 0.8);
check('negative cosine values are floored at zero',
  maxSentenceCosineScore([-0.5, -0.1]) === 0);
check('non-finite values cannot contaminate the result',
  maxSentenceCosineScore([Number.NaN, Number.POSITIVE_INFINITY, 0.4]) === 0.4);
check('empty evidence yields zero, not NaN',
  maxSentenceCosineScore([]) === 0);

console.log('\n[2] No summary-length reward');
let lengthInvariant = true;
for (let i = 0; i < 2000; i++) {
  const strongest = (i % 100) / 100;
  const weaker = Array.from({ length: i % 20 }, (_, j) => strongest * (j + 1) / 21);
  if (Math.abs(maxSentenceCosineScore([strongest, ...weaker]) - strongest) > 1e-12) {
    lengthInvariant = false;
    break;
  }
}
check('2,000 deterministic cases are invariant to extra weaker sentences', lengthInvariant);

console.log(`\n${fail === 0 ? 'ALL CHECKS PASSED' : 'FAILURES'} — passed ${pass}, failed ${fail}`);
process.exit(fail === 0 ? 0 : 1);
