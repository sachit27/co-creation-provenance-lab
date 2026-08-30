import { looksLikeHeader, preprocessCSV, preprocessWithSelections, scanColumns } from '../tests/.modules/services/dataPreprocessor.ts';

let pass = 0, fail = 0;
const check = (name: string, condition: boolean, detail = '') => {
  if (condition) { pass++; console.log(`  PASS  ${name}`); }
  else { fail++; console.log(`  FAIL  ${name} ${detail}`); }
};

console.log('\n[1] Question context is not participant evidence');
const csv = `id,What worries you most?,How urgent is action?
P1,"Flooding damages homes.","Very urgent."
P2,"Prefer not to answer","5"`;
const columns = scanColumns(csv);
const result: any = preprocessWithSelections(csv, {
  idColumnIndex: 0,
  textColumnIndices: [1, 2],
  groupColumnIndex: -1,
}, 'combined', columns);
check('both participant rows are retained', result.inputs.length === 2, `got ${result.inputs.length}`);
check('combined prompt text retains question context for generation',
  result.inputs[0].text.includes('Q: What worries you most?'));
check('source census segments contain answers only',
  result.inputs[0].sourceSegments.length === 2 &&
  result.inputs[0].sourceSegments[0].text === 'Flooding damages homes.' &&
  !result.inputs[0].sourceSegments.some((segment: any) => segment.text.includes('What worries')));
check('question is carried separately as non-evidentiary context',
  result.inputs[0].sourceSegments[0].context === 'What worries you most?');

console.log('\n[2] Short, numeric, refusal, and uncertainty responses are not silently erased');
check('explicit refusal is retained', result.inputs[1].sourceSegments[0].text === 'Prefer not to answer');
check('numeric response is retained', result.inputs[1].sourceSegments[1].text === '5');

console.log('\n[3] Per-question runs keep question context separate from evidence');
const perQuestion = preprocessWithSelections(csv, {
  idColumnIndex: 0,
  textColumnIndices: [1, 2],
  groupColumnIndex: -1,
}, 'per_question', columns) as any as any[];
check('one result is returned per selected question', perQuestion.length === 2);
check('per-question evidence remains answer-only',
  perQuestion[0].inputs[0].text === 'Flooding damages homes.' &&
  perQuestion[0].inputs[0].sourceSegments[0].text === 'Flooding damages homes.');
check('per-question source context keeps the question header',
  perQuestion[0].inputs[0].sourceSegments[0].context === 'What worries you most?');

console.log('\n[4] Header detection never silently drops an unknown short-text first response');
check('unknown short alphabetic row is treated as data', !looksLikeHeader(['Pine trees', 'More shade']));
const headerless = preprocessCSV('Pine trees\nMore shade');
check('headerless first response is retained', headerless.inputs.length === 2 && headerless.inputs[0].text === 'Pine trees');

console.log(`\n${fail === 0 ? 'ALL CHECKS PASSED' : 'FAILURES'} — passed ${pass}, failed ${fail}`);
process.exit(fail === 0 ? 0 : 1);
