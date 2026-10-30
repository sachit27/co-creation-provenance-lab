import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

const folder = mkdtempSync(path.join(tmpdir(), 'provenance-live-review-'));
process.env.LIVE_DATA_DIR = folder;
const { createSession, changeStatus, joinSession, submit, publish, saveReviewDecisions, publicView, exportSession, getSession, LiveError } = await import('../live/sessionStore.ts');

try {
  const { session, hostToken } = createSession('Private human review', 'What should be included?');
  const participantToken = joinSession(session).participantToken;
  changeStatus(session, hostToken, 'open');
  submit(session, participantToken, 'Keep the trees and make the square accessible.');
  changeStatus(session, hostToken, 'closed');
  const record = {
    summary: 'Improve the square.', summarySentences: ['Improve the square.'], config: { thresholds: { matchingThreshold: 0.5 } },
    participants: [{ id: 'P001', originalText: session.submissions[0].text, representationScore: 0.2, sentenceMatches: [{ sentenceIndex: 0, similarity: 0.2 }] }],
    metrics: { giniCoefficient: 0 },
  };
  const audit = { summary: record.summary, method: 'manual · tfidf', averageAlignment: 0.2, gini: 0, validCount: 1, scores: { P001: 0.2 }, analysisRecord: record };
  publish(session, hostToken, { ...audit, sourceRevision: session.revision });
  const binding = () => ({ versionId: session.published!.versionId, publishedAt: session.published!.publishedAt, reviewRevision: session.published!.reviewRevision || 0 });
  const firstBinding = binding();
  const decision = { issueId: 'alignment:P001', status: 'confirmed', note: 'Private concern: trees were omitted.', updatedAt: 'forged-client-time' };
  const fails = (work: () => unknown, status: number) => assert.throws(work, error => error instanceof LiveError && error.status === status);
  for (const unauthorized of [undefined, 'wrong-token', participantToken]) {
    fails(() => saveReviewDecisions(session, unauthorized, { ...binding(), decisions: [decision] }), 403);
  }
  fails(() => saveReviewDecisions(session, hostToken, { ...binding(), publishedAt: 'stale', decisions: [decision] }), 409);
  fails(() => saveReviewDecisions(session, hostToken, { ...binding(), decisions: [{ ...decision, status: 'automatic-verdict' }] }), 400);
  fails(() => saveReviewDecisions(session, hostToken, { ...binding(), decisions: [decision, decision] }), 400);
  fails(() => saveReviewDecisions(session, hostToken, { ...binding(), decisions: [{ ...decision, issueId: 'alignment:other-source' }] }), 400);
  fails(() => saveReviewDecisions(session, hostToken, { ...binding(), decisions: [{ ...decision, note: 'x'.repeat(4001) }] }), 400);
  const sourceRevision = session.revision;
  saveReviewDecisions(session, hostToken, { ...binding(), decisions: [decision] });
  assert.equal(session.revision, sourceRevision, 'Human review must not invalidate the audited input snapshot.');
  const loaded = getSession(session.code);
  const saved = (loaded.published!.analysisRecord!.reviewDecisions as any[])[0];
  assert.equal(saved.note, decision.note);
  assert.notEqual(saved.updatedAt, decision.updatedAt, 'The server must assign the saved timestamp.');
  assert.ok(Number.isFinite(Date.parse(saved.updatedAt)));
  assert.equal(loaded.published!.reviewHistory!.length, 2);
  assert.equal((loaded.publications[0].analysisRecord!.reviewDecisions as any[])[0].note, decision.note, 'Publication history and current record must agree after reload.');
  fails(() => saveReviewDecisions(loaded, hostToken, { ...firstBinding, decisions: [{ ...decision, note: 'Stale tab overwrote a note.' }] }), 409);
  for (const view of [publicView(loaded), publicView(loaded, participantToken), publicView(loaded, undefined, 'wrong-token')]) {
    const serialized = JSON.stringify(view);
    assert.ok(!serialized.includes('analysisRecord') && !serialized.includes('reviewHistory') && !serialized.includes('reviewDecisions') && !serialized.includes(decision.note), 'Participant/public views must never receive private review annotations or source records.');
  }
  const hostView = publicView(loaded, undefined, hostToken);
  assert.equal((hostView.result!.analysisRecord!.reviewDecisions as any[])[0].note, decision.note);
  const revised = { ...binding(), reviewRevision: loaded.published!.reviewRevision };
  saveReviewDecisions(loaded, hostToken, { ...revised, decisions: [{ ...decision, status: 'dismissed', note: 'Checked source context; draft is acceptable.' }] });
  // Removing a current annotation must preserve earlier notes in the append-only export history.
  saveReviewDecisions(loaded, hostToken, { versionId: loaded.published!.versionId, publishedAt: loaded.published!.publishedAt, reviewRevision: loaded.published!.reviewRevision, decisions: [] });
  const oldPublication = structuredClone(loaded.published);
  publish(loaded, hostToken, { ...audit, sourceRevision: loaded.revision, summary: 'Keep trees while improving access.', analysisRecord: { ...record, summary: 'Keep trees while improving access.', summarySentences: ['Keep trees while improving access.'] } });
  fails(() => saveReviewDecisions(loaded, hostToken, { versionId: oldPublication!.versionId, publishedAt: oldPublication!.publishedAt, reviewRevision: oldPublication!.reviewRevision, decisions: [decision] }), 409);
  const exported = exportSession(getSession(session.code), hostToken);
  assert.equal(exported.publications.length, 2);
  assert.deepEqual(exported.publications[0], oldPublication, 'Publishing a revision must preserve the previous review history.');
  assert.deepEqual(exported.publications[0].reviewHistory!.map(entry => entry.decisions[0]?.status || 'empty'), ['empty', 'confirmed', 'dismissed', 'empty']);
  assert.equal(exported.publications[0].reviewHistory![1].decisions[0].note, decision.note);
  assert.equal(exported.currentPublication!.reviewRevision, 0, 'Each publication starts its own review history.');
  assert.equal(exported.currentPublication!.averageAlignment, audit.averageAlignment);
  assert.equal(exported.currentPublication!.gini, audit.gini);
  assert.ok(!JSON.stringify(exported).includes('tokenHash'));
  fails(() => exportSession(loaded, participantToken), 403);
  const latestPublic = JSON.stringify(publicView(loaded, participantToken));
  assert.ok(!latestPublic.includes('previousAnalysisRecord') && !latestPublic.includes(decision.note));
  assert.ok(publicView(loaded, undefined, hostToken).result!.previousAnalysisRecord, 'Only the facilitator can compare full publication records.');
  console.log('Live review authorization, publication binding, concurrent edits, privacy, persistence, and full export history passed.');
} finally {
  rmSync(folder, { recursive: true, force: true });
}
