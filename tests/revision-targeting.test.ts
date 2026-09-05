import assert from 'node:assert/strict';
import {
  MAX_REVISION_CANDIDATES,
  selectRevisionCandidates,
} from '../tests/.modules/services/revisionTargeting.ts';

const participant = (
  id: string,
  representationScore: number,
  matchCount = 1,
  extra: Record<string, unknown> = {},
) => ({
  id,
  originalText: `Source text for ${id}`,
  representationScore,
  semanticIsolation: 0,
  semanticCoords: { x: 0, y: 0 },
  clusterId: 0,
  sentenceMatches: Array.from({ length: matchCount }, () => ({
    sentenceIndex: 0,
    sentence: 'Summary sentence',
    score: representationScore,
  })),
  topSentenceMatchIndex: 0,
  keywords: [],
  ...extra,
}) as any;

const participants = [
  participant('P-high', 0.82),
  participant('P-low', 0.31),
  participant('P-no-match', 0.78, 0),
  participant('P-mid', 0.56),
  participant('P-failed', 0.05, 1, { embeddingFailed: true }),
  participant('P-unavailable', 0.04, 1, { alignmentUnavailableReason: 'no-independent-extractive-summary' }),
];

console.log('\n[AI revision targeting]');

const thresholdSelection = selectRevisionCandidates(participants, {
  mode: 'below-threshold',
  threshold: 0.5,
  maxCandidates: 8,
});
assert.deepEqual(thresholdSelection.candidates.map(item => item.id), ['P-low', 'P-no-match']);
assert.equal(thresholdSelection.eligibleCount, 4);
assert.equal(thresholdSelection.matchingCount, 2);
console.log('  PASS  score cutoff includes low-score and no-match records');

const raisedThreshold = selectRevisionCandidates(participants, {
  mode: 'below-threshold',
  threshold: 0.6,
  maxCandidates: 1,
});
assert.equal(raisedThreshold.matchingCount, 3);
assert.deepEqual(raisedThreshold.candidates.map(item => item.id), ['P-low']);
console.log('  PASS  user-selected cutoff and prompt-size cap are applied deterministically');

const explicitLowest = selectRevisionCandidates(participants, {
  mode: 'lowest-ranked',
  threshold: 0,
  maxCandidates: 3,
});
assert.deepEqual(explicitLowest.candidates.map(item => item.id), ['P-low', 'P-mid', 'P-no-match']);
console.log('  PASS  explicit lowest-ranked mode works without inventing a hidden fallback');

assert.throws(() => selectRevisionCandidates(participants, {
  mode: 'below-threshold',
  threshold: 1.01,
  maxCandidates: 8,
}), /between 0 and 1/);
assert.throws(() => selectRevisionCandidates(participants, {
  mode: 'lowest-ranked',
  threshold: 0.5,
  maxCandidates: MAX_REVISION_CANDIDATES + 1,
}), /between 1 and 12/);
console.log('  PASS  invalid user configuration fails closed');
