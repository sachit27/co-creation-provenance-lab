/**
 * Tier-specific representation bands (source-level invariants).
 * These checks enforce tier separation and consumer consistency.
 * Run: node --experimental-strip-types tests/tier-bands.test.ts
 */
import { readFileSync } from 'node:fs';
let pass = 0, fail = 0;
const check = (n: string, c: boolean, d = '') => {
  if (c) { pass++; console.log(`  PASS  ${n}`); } else { fail++; console.log(`  FAIL  ${n} ${d}`); }
};
const src = readFileSync(new URL('../constants.ts', import.meta.url), 'utf8');

console.log('\n[1] Tier-specific bands are defined and distinct');
check('representationInterpretationByTier exists', src.includes('representationInterpretationByTier'));
check('getRepresentationBands helper is exported', /export const getRepresentationBands/.test(src));

const band = (tier: string, key: string) => {
  const block = src.match(new RegExp(tier + ':\\s*\\{([^}]*)\\}'));
  const m = block?.[1].match(new RegExp(key + ':\\s*([0-9.]+)'));
  return m ? parseFloat(m[1]) : NaN;
};
const dense = { atRisk: band('dense','atRisk'), low: band('dense','low'), adequate: band('dense','adequate'), good: band('dense','good') };
const tfidf = { atRisk: band('tfidf','atRisk'), low: band('tfidf','low'), adequate: band('tfidf','adequate'), good: band('tfidf','good') };
console.log(`   dense: ${JSON.stringify(dense)}`);
console.log(`   tfidf: ${JSON.stringify(tfidf)}`);

check('tfidf low remains configured at 0.16', tfidf.low === 0.16, `got ${tfidf.low}`);
check('dense low unchanged at 0.50 (backwards compatible)', dense.low === 0.5, `got ${dense.low}`);
check('tfidf bands sit below dense bands', tfidf.low < dense.low && tfidf.atRisk < dense.atRisk);
check('dense bands strictly ordered', dense.atRisk < dense.low && dense.low < dense.adequate && dense.adequate < dense.good);
check('tfidf bands strictly ordered', tfidf.atRisk < tfidf.low && tfidf.low < tfidf.adequate && tfidf.adequate < tfidf.good);
check('legacy representationInterpretation retained for existing consumers',
      /representationInterpretation:\s*\{/.test(src));

console.log('\n[2] Tier-aware consumers');
const consumers = ['components/visualizations/RepresentationBar.tsx','components/ui/MissedPerspectives.tsx','components/ui/ExecutiveSummary.tsx'];
for (const c of consumers) {
  const s = readFileSync(new URL('../' + c, import.meta.url), 'utf8');
  check(`${c.split('/').pop()} uses getRepresentationBands`, s.includes('getRepresentationBands'));
}
const quadrant = readFileSync(new URL('../components/visualizations/BlindSpotPlot.tsx', import.meta.url), 'utf8');
check('alignment quadrant explicitly uses a relative median split', quadrant.includes('Median splits organize inspection'));

console.log(`\n${fail === 0 ? 'ALL CHECKS PASSED' : 'FAILURES'} — passed ${pass}, failed ${fail}`);
process.exit(fail === 0 ? 0 : 1);
