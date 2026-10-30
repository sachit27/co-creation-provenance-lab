import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const source = readFileSync('App.tsx', 'utf8');
const fixture = JSON.parse(readFileSync('public/demo-result.json', 'utf8'));
assert.equal(fixture.participants.length, 40);
const handler = source.match(/const handleOpenDemo = \(\) => \{([^]*?)\n  \};/)?.[1];
assert.ok(handler, 'Explicit demo launch handler must exist');
const setterNames = [...new Set(handler.match(/\bset[A-Z]\w*/g))];
const state: Record<string, unknown> = {
  setData: { participants: Array.from({ length: 5 }), summary: 'Previous live session' },
  setLiveSessionCode: 'LIVE123',
  setQuestionResults: [{ question: 'Previous live question' }],
};
const generation = { current: 3 };
const causal = new AbortController();
const enrichment = new AbortController();
const enrichmentRef = { current: enrichment as AbortController | null };
let navigatedUrl = '';
const launch = new Function(
  'cachedDemoData', 'analysisGenRef', 'causalAbortRef', 'enrichmentAbortRef',
  'closeSidebar', 'window', ...setterNames,
  handler.replace('import.meta.env.BASE_URL', '"/"'),
);
const run = (cached: unknown) => launch(
  cached, generation, { current: causal }, enrichmentRef, () => {},
  { history: { replaceState: (_state: unknown, _title: string, url: string) => { navigatedUrl = url; } } },
  ...setterNames.map(name => (value: unknown) => { state[name] = value; }),
);
run(fixture);
assert.equal((state.setData as typeof fixture).participants.length, 40);
assert.notEqual(state.setData, fixture, 'The cache must remain isolated from dashboard edits');
assert.equal(state.setLiveSessionCode, null);
assert.equal(state.setQuestionResults, null);
assert.equal(state.setRevisedData, null);
assert.equal(state.setSelectedParticipant, null);
assert.equal(state.setIsDemo, true);
assert.equal(state.setViewState, 'dashboard');
assert.equal(generation.current, 4, 'Stale analysis callbacks must be invalidated');
assert.ok(causal.signal.aborted);
assert.ok(enrichment.signal.aborted);
assert.equal(navigatedUrl, '/?view=dashboard');
run(null);
assert.equal(state.setViewState, 'setup', 'Unavailable demo must not resume a live audit');
assert.match(source, /onOpenDemo=\{handleOpenDemo\}/);
assert.match(source, /onClick=\{handleOpenDemo\}/);
assert.match(source, /isDemoAvailable=\{isDemoAvailable\}/);
assert.match(source, /urlParams\.get\('view'\) === 'dashboard'[^]*?analysisGenRef\.current === 0/);
assert.doesNotMatch(readFileSync('components/ui/AppHeader.tsx', 'utf8'), /NBS Records|Demo Dataset:/);
console.log('PASS: explicit demo launches replace live audits with the isolated 40-record fixture, clear session state, and cancel stale analysis.');
