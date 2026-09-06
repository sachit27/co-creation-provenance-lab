import { splitSentenceLikeUnits } from '../tests/.modules/services/sentenceSegmentation.ts';

let pass = 0, fail = 0;
const check = (name: string, actual: string[], expected: string[]) => {
  const ok = JSON.stringify(actual) === JSON.stringify(expected);
  if (ok) { pass++; console.log(`  PASS  ${name}`); }
  else { fail++; console.log(`  FAIL  ${name} got=${JSON.stringify(actual)}`); }
};

console.log('\n[1] Boundaries never discard preceding text');
check('lowercase next sentence', splitSentenceLikeUnits('First. second.'), ['First.', 'second.']);
check('mixed terminators', splitSentenceLikeUnits('Alpha! beta? Gamma.'), ['Alpha!', 'beta?', 'Gamma.']);
check('newlines are explicit boundaries', splitSentenceLikeUnits('One line\nsecond line'), ['One line', 'second line']);

console.log('\n[2] Period disambiguation');
check('common title abbreviation', splitSentenceLikeUnits('Dr. smith spoke. next point.'), ['Dr. smith spoke.', 'next point.']);
check('decimal point', splitSentenceLikeUnits('Value is 3.5. next.'), ['Value is 3.5.', 'next.']);
check('common discourse abbreviation', splitSentenceLikeUnits('Use examples, e.g. solar roofs. then decide.'), ['Use examples, e.g. solar roofs.', 'then decide.']);
check('ordinary words ending in an abbreviation suffix still terminate a sentence',
  splitSentenceLikeUnits('The drains can overwhelm systems. Restoring wetlands creates buffers.'),
  ['The drains can overwhelm systems.', 'Restoring wetlands creates buffers.']);

console.log('\n[3] Multilingual terminators');
check('CJK terminators', splitSentenceLikeUnits('最初の文。次の文！'), ['最初の文。', '次の文！']);
check('Arabic question mark', splitSentenceLikeUnits('هذا سؤال؟ هذا جواب۔'), ['هذا سؤال؟', 'هذا جواب۔']);
check('Devanagari danda', splitSentenceLikeUnits('पहला वाक्य। दूसरा वाक्य।'), ['पहला वाक्य।', 'दूसरा वाक्य।']);

console.log(`\n${fail === 0 ? 'ALL CHECKS PASSED' : 'FAILURES'} — passed ${pass}, failed ${fail}`);
process.exit(fail === 0 ? 0 : 1);
