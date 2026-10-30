import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { parseBundledDemo } from './.modules/services/demoValidation.ts';

const baseline = JSON.parse(readFileSync('public/demo-result.json', 'utf8'));
const revision = JSON.parse(readFileSync('public/demo-revision.json', 'utf8'));
assert.equal(parseBundledDemo(baseline).participants.length, 40);
assert.equal(parseBundledDemo(revision).revisionOfRunId, baseline.runManifest.runId);

const changed = (edit: (value: any) => void) => {
  const value = structuredClone(baseline);
  edit(value);
  return value;
};
assert.throws(() => parseBundledDemo(null), /required analysis fields/);
assert.throws(() => parseBundledDemo(changed(value => { value.metrics = null; })), /required analysis fields/);
assert.throws(() => parseBundledDemo(changed(value => { value.participants[0].id = value.participants[1].id; })), /duplicate source/);
assert.throws(() => parseBundledDemo(changed(value => { value.participants[0].sentenceMatches[0].sentenceIndex = 9999; })), /invalid sentence match/);
assert.throws(() => parseBundledDemo(changed(value => { value.metrics.giniCoefficient = 'missing'; })), /invalid summary metrics/);
assert.throws(() => parseBundledDemo(changed(value => { value.summary = ''; })), /required analysis fields/);
console.log('Bundled demo JSON boundary rejects missing, malformed, and inconsistent core fields.');
