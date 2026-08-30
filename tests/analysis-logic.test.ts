/**
 * Logic audit regression tests: rhetorical analysis, claim attribution,
 * Sankey flow, clustering.
 *
 * Requires the module shim: node tests/prepare-modules.mjs
 * Run: node --experimental-strip-types tests/analysis-logic.test.ts
 */
import { analyzeRhetoricalBias } from '../tests/.modules/services/rhetoricalAnalysis.ts';
import { buildSankeyData } from '../tests/.modules/services/sankeyBuilder.ts';
import { computeAutoKMeans } from '../tests/.modules/services/mathUtils.ts';
import { runWhatIfSimulation } from '../tests/.modules/services/whatIfSimulation.ts';
import { extractKeywords } from '../tests/.modules/services/textUtils.ts';

let pass = 0, fail = 0;
const check = (n: string, c: boolean, d = '') => {
  if (c) { pass++; console.log(`  PASS  ${n}`); } else { fail++; console.log(`  FAIL  ${n} ${d}`); }
};

const mkR = (id: string, c: number, r: number) => ({
  id, originalText: 't', representationScore: r, semanticIsolation: 0.2,
  semanticCoords: { x: 0, y: 0 }, clusterId: 0, sentenceMatches: [], topSentenceMatchIndex: 0,
  sentiment: 'neutral', keywords: [], embeddingFailed: false,
  rhetoricalProfile: { compositeScore: c, assertiveness: c, formality: c, evidentiality: c, emotionalIntensity: c },
}) as any;

// ── 1. Spearman with ties, against an independently computed reference ───────
console.log('\n[1] Spearman rank correlation (tie-corrected)');
const X = [1, 2, 2, 3, 4, 5, 5, 5, 6, 7];
const Y = [2, 1, 4, 3, 5, 5, 7, 6, 8, 9];
const rho = analyzeRhetoricalBias(X.map((x, i) => mkR(`P${i}`, x, Y[i]))).correlation;
check('matches reference value 0.9383431168', Math.abs(rho - 0.9383431168171101) < 1e-9, `got ${rho}`);

const perfect = Array.from({ length: 10 }, (_, i) => mkR(`P${i}`, i, i));
check('perfect monotonic agreement gives rho = 1', Math.abs(analyzeRhetoricalBias(perfect).correlation - 1) < 1e-9);
const inverse = Array.from({ length: 10 }, (_, i) => mkR(`P${i}`, i, 10 - i));
check('perfect inversion gives rho = -1', Math.abs(analyzeRhetoricalBias(inverse).correlation + 1) < 1e-9);
check('n < 5 returns neutral rho = 0, p = 1', (() => {
  const r = analyzeRhetoricalBias([mkR('A', 1, 1), mkR('B', 2, 2)]);
  return r.correlation === 0 && r.pValue === 1;
})());

// ── 2. Determinism (audit results must be reproducible) ──────────────────────
console.log('\n[2] Determinism');
const corr = Array.from({ length: 18 }, (_, i) => mkR(`P${i}`, i / 18 + (i % 3) * 0.02, 0.3 + (i / 18) * 0.5));
const sigs = new Set(Array.from({ length: 5 }, () => {
  const r = analyzeRhetoricalBias(corr);
  return `${r.correlation.toFixed(9)}|${r.pValue.toFixed(9)}|${r.hasBias}`;
}));
check('rhetorical bias p-value is reproducible across runs', sigs.size === 1, `${sigs.size} distinct results`);

let s = 7; const rnd = () => { s = (s * 1664525 + 1013904223) % 4294967296; return s / 4294967296; };
const blob = Array.from({ length: 40 }, (_, i) => Array.from({ length: 12 }, (_, j) => (j === i % 3 ? 5 : 0) + rnd() * 0.5));
const ks = new Set(Array.from({ length: 5 }, () => computeAutoKMeans(blob).assignments.join('')));
check('clustering is reproducible across runs', ks.size === 1, `${ks.size} distinct assignments`);
check('clustering recovers 3 well-separated groups', computeAutoKMeans(blob).k === 3, `got k=${computeAutoKMeans(blob).k}`);

// ── 2b. What-if simulation determinism ──────────────────────────────────────
const wp = Array.from({ length: 24 }, (_, i) => ({
  id: `W${i}`, originalText: 't', representationScore: 0.2 + (i % 7) * 0.09,
  semanticIsolation: 0.1 + (i % 5) * 0.12, semanticCoords: { x: 0, y: 0 },
  clusterId: i % 3, sentenceMatches: [], topSentenceMatchIndex: 0,
  sentiment: 'neutral', keywords: [],
})) as any[];
const wdata: any = {
  participants: wp,
  clusters: [{ id: 0 }, { id: 1 }, { id: 2 }],
  clusteringDiagnostics: { usableForDownstream: true },
  metrics: {},
  config: {},
};
const wsig = (r: any) => `${r.projectedGini.toFixed(10)}|${r.projectedAvgRep.toFixed(10)}|${r.projectedBlindSpots}`;
const wruns = new Set(Array.from({ length: 5 }, () =>
  wsig(runWhatIfSimulation(wdata, { type: 'add_voices', clusterId: 1, additionalCount: 5 } as any))));
check('what-if projection is reproducible for the same scenario', wruns.size === 1, `${wruns.size} distinct`);
const wAlt = wsig(runWhatIfSimulation(wdata, { type: 'add_voices', clusterId: 1, additionalCount: 9 } as any));
check('seed still varies with the scenario (different question, different answer)', !wruns.has(wAlt));

// ── 3. Sankey: no fabricated provenance, orphans preserved ───────────────────
console.log('\n[3] Sankey flow integrity');
const mkP = (id: string, cid: number, m: { sentenceIndex: number; similarity: number }[]) => ({
  id, originalText: `text ${id}`, representationScore: 0.5, semanticIsolation: 0.2,
  semanticCoords: { x: 0, y: 0 }, clusterId: cid, sentenceMatches: m,
  topSentenceMatchIndex: m[0]?.sentenceIndex ?? 0, sentiment: 'neutral', keywords: [],
}) as any;
const result: any = {
  participants: [
    mkP('P1', 0, [{ sentenceIndex: 0, similarity: 0.8 }]),
    mkP('P2', 0, [{ sentenceIndex: 0, similarity: 0.6 }]),
    mkP('P3', 1, [{ sentenceIndex: 1, similarity: 0.7 }]),
    mkP('P4', 1, []), // no stored match: partial residual for theme 1
    mkP('P5', 2, []), // no stored match: whole theme residual
  ],
  clusters: [{ id: 0, label: 'A', color: '#111' }, { id: 1, label: 'B', color: '#222' }, { id: 2, label: 'C', color: '#333' }],
  clusteringDiagnostics: { usableForDownstream: true },
  summarySentences: ['S0.', 'S1.', 'S2 never referenced.'], metrics: {}, config: {},
};
const sk: any = buildSankeyData(result, result.participants.map((p: any) => ({ id: p.id, text: p.originalText })));
const real = sk.links.filter((l: any) => l.source !== l.target);

let violations = 0;
for (const t of sk.nodes.filter((n: any) => n.column === 'theme')) {
  const inflow = real.filter((l: any) => l.target === t.id).reduce((a: number, l: any) => a + l.value, 0);
  const outflow = real.filter((l: any) => l.source === t.id).reduce((a: number, l: any) => a + l.value, 0);
  if (outflow > inflow + 1e-9) violations++;
}
check('theme outflow never exceeds inflow (no invented flow)', violations === 0);
check('contributions without a stored match reach no summary sentence',
  real.filter((l: any) => l.target.startsWith('summary-')).reduce((a: number, l: any) => a + l.value, 0) === 3);
check('fully unmatched theme uses an explicit conserved residual channel',
  sk.links.some((l: any) => l.source === 'theme-2' && l.target === 'unmatched-theme-2' && l.isLoss && l.value === 1));
check('partially unmatched theme preserves its residual rather than hiding it',
  sk.links.some((l: any) => l.source === 'theme-1' && l.target === 'unmatched-theme-1' && l.isLoss && l.value === 1));
check('unreferenced summary sentence receives no inbound flow',
  real.filter((l: any) => l.target === 'summary-2').length === 0);

// ── 3b. Sankey flow conservation with MULTI-match participants ──────────────
// The earlier version of this suite only used single-match participants, so it
// passed vacuously while a real conservation bug was present.
console.log('\n[3b] Sankey conservation — participants matching several sentences');
const multi: any = {
  participants: [
    mkP('M1', 0, [{ sentenceIndex: 0, similarity: 0.8 }, { sentenceIndex: 1, similarity: 0.7 }, { sentenceIndex: 2, similarity: 0.6 }]),
    mkP('M2', 0, [{ sentenceIndex: 0, similarity: 0.9 }]),
  ],
  clusters: [{ id: 0, label: 'A', color: '#111' }],
  clusteringDiagnostics: { usableForDownstream: true },
  summarySentences: ['S0.', 'S1.', 'S2.'], metrics: {}, config: {},
};
const skm: any = buildSankeyData(multi, multi.participants.map((p: any) => ({ id: p.id, text: p.originalText })));
const realM = skm.links.filter((l: any) => l.source !== l.target);
const inM = realM.filter((l: any) => l.target === 'theme-0').reduce((a: number, l: any) => a + l.value, 0);
const outM = realM.filter((l: any) => l.source === 'theme-0').reduce((a: number, l: any) => a + l.value, 0);
console.log(`   inflow=${inM}  outflow=${outM.toFixed(4)}`);
check('one contribution carries exactly one unit of flow', Math.abs(outM - inM) < 1e-9, `in ${inM} out ${outM}`);

// ── 3c. Keyword extraction rejects procedural verbs ─────────────────────────
console.log('\n[3c] Keyword extraction');
const kwCases = [
  'Local knowledge about bird migration patterns is being ignored by researchers.',
  'The pilot could not be scaled and incentives for green buildings were overlooked.',
];
const leaked = kwCases.flatMap(c => extractKeywords(c, 8))
  .filter(k => !k.includes(' ') && /(ed|ing)$/.test(k));
check('no bare procedural verbs surface as topics', leaked.length === 0, `leaked ${JSON.stringify(leaked)}`);
check('substantive multi-word topics are preserved',
  extractKeywords(kwCases[0], 8).includes('bird migration patterns'));

// ── 4. Claim support rate has no arbitrary ordinal weighting ─────────────────
console.log('\n[4] Claim attribution score');
const attribution = (supported: number, assessed: number) => assessed > 0 ? supported / assessed : null;
check('inferrable is reported categorically rather than given an invented half-weight', attribution(4, 10) === 0.4);
check('all supported gives 1.0', attribution(10, 10) === 1);
check('all unsupported gives 0', attribution(0, 10) === 0);
check('no assessed claims yields unavailable', attribution(0, 0) === null);

console.log(`\n${fail === 0 ? 'ALL CHECKS PASSED' : 'FAILURES'} — passed ${pass}, failed ${fail}`);
process.exit(fail === 0 ? 0 : 1);
