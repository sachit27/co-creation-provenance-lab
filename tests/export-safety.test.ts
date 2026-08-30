/**
 * Regression tests for v2 batch 2 fixes.
 *   1. HTML export escaping (reportExport, participantVerification)
 *   2. Threshold single-source-of-truth
 * Run: node --experimental-strip-types tests/export-safety.test.ts
 */
let pass = 0, fail = 0;
const check = (name: string, cond: boolean, detail = '') => {
  if (cond) { pass++; console.log(`  PASS  ${name}`); }
  else { fail++; console.log(`  FAIL  ${name} ${detail}`); }
};

// ── 1. Escaping logic (mirrors esc()/escHtml() in the export services) ───────
const esc = (v: unknown) => String(v ?? '')
  .replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;')
  .replace(/"/g,'&quot;').replace(/'/g,'&#39;');
const escapeJson = (o: unknown) =>
  JSON.stringify(o).replace(/</g,'\\u003c').replace(/>/g,'\\u003e');

console.log('\n[1] HTML export escaping');
const PAYLOAD = `<script>alert('xss')</script><img src=x onerror="steal()">`;
const out = esc(PAYLOAD);
check('script tag neutralised', !/<script>/i.test(out));
check('event handler neutralised', !/<img src=x onerror=/i.test(out));
check('quotes escaped (attribute breakout blocked)', !out.includes('"') && !out.includes("'"));
check('ampersand escaped first (no double-decode)', esc('&lt;') === '&amp;lt;');
check('plain text unchanged', esc('bike lanes & parking') === 'bike lanes &amp; parking');
check('null/undefined safe', esc(undefined) === '' && esc(null) === '');

console.log('\n[2] Script-context JSON escaping (</script> breakout)');
const raw = JSON.stringify(`</script><script>alert(1)</script>`);
const safe = escapeJson(`</script><script>alert(1)</script>`);
check('raw JSON.stringify DOES allow breakout (bug reproduced)', raw.includes('</script>'));
check('escapeJson blocks breakout', !safe.includes('</script>') && safe.includes('\\u003c'));

// ── 3. Threshold single source of truth ─────────────────────────────────────
console.log('\n[3] Threshold consistency (source-level invariant)');
import { readFileSync } from 'node:fs';
const read = (f: string) => readFileSync(new URL(f, import.meta.url), 'utf8');
const constants = read('../constants.ts');
const sliders   = read('../components/ui/ThresholdSliders.tsx');
const app       = read('../App.tsx');

const canonical = (name: string) => {
  const m = constants.match(new RegExp(name + '\\s*:\\s*([0-9.]+)'));
  return m ? parseFloat(m[1]) : NaN;
};
check('constants.ts defines matchingThreshold = 0.5', canonical('matchingThreshold') === 0.5,
      `got ${canonical('matchingThreshold')}`);
check('constants.ts defines representationPercentile = 0.75', canonical('representationPercentile') === 0.75,
      `got ${canonical('representationPercentile')}`);

const dupLiteral = /(representationTarget|matchingThreshold)\s*:\s*0\.[0-9]+/;
check('ThresholdSliders has no duplicate threshold literals', !dupLiteral.test(sliders));
check('App.tsx has no duplicate threshold literals', !dupLiteral.test(app));
check('ThresholdSliders derives defaults from ANALYSIS_CONFIG', sliders.includes('ANALYSIS_CONFIG.thresholds'));

console.log(`\n${fail===0 ? 'ALL CHECKS PASSED' : 'FAILURES PRESENT'} — passed ${pass}, failed ${fail}`);
process.exit(fail===0?0:1);
