import { analyzeLanguageEquity, detectLanguage, isNonEnglish } from '../tests/.modules/services/languageDetection.ts';

let pass = 0, fail = 0;
const check = (name: string, condition: boolean, detail = '') => {
  if (condition) { pass++; console.log(`  PASS  ${name}`); }
  else { fail++; console.log(`  FAIL  ${name} ${detail}`); }
};

console.log('\n[1] Latin script alone never becomes a non-English assertion');
check('clear English markers classify as English', detectLanguage('We should have more say in the process.') === 'en');
check('terse English without function words abstains', detectLanguage('Privacy concerns about sensitive species locations.') === 'un');
check('Spanish Latin script abstains rather than inventing a language', detectLanguage('Necesitamos participación comunitaria urgente.') === 'un');
check('legacy Latin tag is not treated as non-English', !isNonEnglish('la'));

console.log('\n[2] Distinct non-Latin scripts remain detectable');
check('Arabic script is detected', detectLanguage('نحتاج إلى مشاركة المجتمع في القرار') === 'ar');
check('Arabic script is non-English for the coarse comparison', isNonEnglish('ar'));

console.log('\n[3] Undetermined Latin records cannot create a language-equity flag');
const report = analyzeLanguageEquity([
  ...Array.from({ length: 4 }, (_, index) => ({ id: `E${index}`, detectedLanguage: 'en', representationScore: 0.8 })),
  ...Array.from({ length: 4 }, (_, index) => ({ id: `L${index}`, detectedLanguage: 'la', representationScore: 0.1 })),
] as any);
check('legacy/undetermined Latin group is excluded from comparison', !report.hasEquityIssue && report.underrepresentedLanguages.length === 0);

console.log(`\n${fail === 0 ? 'ALL CHECKS PASSED' : 'FAILURES'} — passed ${pass}, failed ${fail}`);
process.exit(fail === 0 ? 0 : 1);
