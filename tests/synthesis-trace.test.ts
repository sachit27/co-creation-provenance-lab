import assert from 'node:assert/strict';
import { buildSynthesisTrace, ILLUSTRATIVE_SYNTHESIS_TRACE } from './.modules/services/synthesisTrace.ts';

const fixture = ILLUSTRATIVE_SYNTHESIS_TRACE;
const build = (participants = fixture.participants, fidelity = fixture.languageFidelity) => buildSynthesisTrace(participants, fixture.summarySentences, fidelity);
const rows = build();
assert.equal(rows.length, 3);
assert.equal(rows[1].mappings.find(mapping => mapping.sourceUnitId === 'p2-cap')?.type, 'dropped');
assert.equal(rows[2].mappings[0].type, 'abstracted');
assert.equal(rows[0].mappings[0].type, 'abstracted');
assert.equal(buildSynthesisTrace(fixture.participants, fixture.summarySentences)[0].mappings.length, 0, 'retrieval alone cannot create transformation findings');
assert.equal(build(fixture.participants, { ...fixture.languageFidelity, methodVersion: undefined })[0].mappings.length, 0, 'legacy mappings are not a complete source census');
for (const unavailable of [{ embeddingFailed: true }, { alignmentUnavailableReason: 'no-independent-extractive-summary' as const }]) {
  const row = build([{ ...fixture.participants[0], ...unavailable }])[0];
  assert.equal(row.scoreAvailable, false);
  assert.equal(row.links.length, 0, 'unavailable embeddings cannot produce links');
}
const duplicate = fixture.languageFidelity.sourceMappings[0];
assert.equal(build(fixture.participants, { ...fixture.languageFidelity, sourceMappings: [duplicate, duplicate] })[0].mappings.length, 1, 'duplicate source-unit IDs do not inflate findings');
assert.equal(build(fixture.participants, { ...fixture.languageFidelity, sourceMappings: [duplicate, { ...duplicate, sourceUnitId: 'different-unit' }] })[0].mappings.length, 2, 'different source units with identical text remain distinct');
for (const patch of [{ summarySentenceIndex: 99 }, { summaryPhrase: 'invented evidence' }, { rawPhrase: 'invented source' }, { alignmentAssessed: false }]) {
  const row = build(fixture.participants, { ...fixture.languageFidelity, sourceMappings: [{ ...duplicate, ...patch }] })[0];
  assert.equal(row.mappings[0].type, 'unassessed', 'unverifiable mappings abstain');
  assert.equal(row.mappings[0].summarySentenceIndex, null);
}
const candidate = build([{ ...fixture.participants[0], sentenceMatches: [{ sentenceIndex: -1, similarity: .9 }, { sentenceIndex: 90, similarity: .9 }, { sentenceIndex: 0, similarity: NaN }, { sentenceIndex: 0, similarity: .5 }, { sentenceIndex: 0, similarity: .8 }] }])[0];
assert.equal(candidate.links.length, 1);
assert.equal(candidate.links[0].similarity, .8);
assert.equal(buildSynthesisTrace([], [], undefined).length, 0);
console.log('Synthesis trace adapter checks passed.');
