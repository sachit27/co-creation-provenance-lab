# Evidence review workflow validation

Implemented 2026-10-30. No provider API calls were made and `public/demo-result.json` was not regenerated or modified.

## Delivered

- Audit overview and sidebar open a dedicated evidence review queue. Suggestions draw only from available assessments: below-reference valid alignment, verified source-census transformations, evaluator-flagged claims, and exact-source competing views. Suggestions are not confirmed omissions or fairness findings.
- Human decisions have unresolved/confirmed/dismissed status, reasons, and timestamps. Decisions remain attached to the current summary. Static review notes stay in application memory until exported; JSON export and matching-run restore provide a deliberate recovery path. Restoring rejects different run IDs, summaries, source collections, unknown issue IDs, or invalid notes.
- Static reports and integrity-covered provenance records include human decisions and retained revision history. HTML escapes reviewer text.
- Revised core results show wording comparison and both increases and decreases among valid paired scores. Different embedding methods, missing metadata, or changed source collections suppress numeric deltas. Invalid scores are never replaced with zeros. Wording highlighting marks the span between common opening and closing tokens, not a semantic edit classification.
- Adopting a revision retains the previous summary, scores, manifest, and human notes; starts a new empty review state; aborts old enrichment; and clears stale feedback and auxiliary analyses. Advanced stages are explicitly skipped until a new full audit is run. Earlier versions remain available in Revision history.
- Live facilitators can review draft analysis and privately save notes against published versions. The server checks host authorization, publication identity, issue IDs, and optimistic review revision. Append-only snapshots preserve review history in the full session export. Participant/public views exclude notes and full analysis records.
- The audit lab opened from a live session is explicitly a browser copy. Live persistence/publication happens in the facilitator console.
- Demo generation targets `tmp/demo-result.candidate.json`, refuses direct replacement of the published demo, and validates the current tension v4 method.

## Verification

`npm run verify` passed all 32 test files, TypeScript checking, and production build. `tests/audit-review.test.ts` covers evidence eligibility, failure/unassessed handling, paired score comparability, note replacement and restore binding, exported note integrity, HTML escaping, and wording reconstruction. `tests/live-review.test.ts` covers authorization, stale publication/concurrent update rejection, issue/schema validation, participant privacy, persistence and export history. The final restore run-binding and stale revision-result guards were followed by targeted review tests, type checking, and a new build.

`node --import tsx tmp/render-review.tsx` successfully rendered the saved demo through the review queue, revision comparison, and contribution map using React server rendering. This is a render smoke check, not a browser interaction or visual acceptance test.

The local server was restarted on `http://127.0.0.1:5173` with `.live-data/phone-test`. It is not a public deployment.

## Outstanding acceptance checks

Browser use is disabled in Work settings. Final visual inspection, keyboard interaction, responsive layout, and phone testing remain outstanding. No claim is made that these changes are free of defects or production-certified. Existing build warns about the main JavaScript chunk exceeding 500 kB.

The bundled demo remains method-compatible; see `demo-refresh-readiness.md` for exact historical configuration omissions, assessment coverage, and safe rerun procedure. It contains no genuine rescored revision. An optional paid run should occur only after browser acceptance and user authorization; retain the existing fixture until the candidate passes tests and manual evidence review. Complete execution can still contain unassessed source units and is not proof of fair representation.

## Browser acceptance follow-up (2026-10-30)

Browser access was restored. Chrome checks confirmed: landing-to-demo-to-queue navigation, decision saving/filtering, source search, keyboard source selection, exact-wording comparison, and a phone sentence selector. The downloaded `audit-with-review-notes.json` contained all 40 sources plus the saved decision and excluded input embeddings. Automated restoration through the file chooser was blocked by the Chrome extension's file-URL permission; no extension permission was changed. Restore validation remains covered by the regression tests, but the browser restore acceptance check remains outstanding.

Responsive checking found and fixed mobile header overflow: the compact brand and accessible navigation controls now fit at a 390px viewport. The contribution map uses a selectable source list and summary-sentence selector on phones, with the connected diagram retained for larger screens. The checked phone pages had document scroll width 382px at innerWidth 390px; desktop measured 1504px at innerWidth 1512px. Temporary viewport overrides were reset.

A disposable live session verified creation, survey off/collapsed by default, participant join, submit, edit, facilitator close, and participant saved-text receipt. No analysis provider was called. The test also revealed misleading LAN QR suggestions on a server bound to loopback. Health now reads the actual listener binding; loopback suppresses a LAN suggestion and the facilitator sees a prominent phone-access warning. IPv4/IPv6 loopback regression tests were added. Local serving remains bound to 127.0.0.1; no public exposure was created.

The complete 32-file regression suite passed after the responsive and network changes; final TypeScript checking and production build also passed. Browser preview screenshot: `tmp/review-queue-browser-check.png`. A genuine scored revision comparison and published-live-results walkthrough remain part of the optional provider-backed acceptance run; a human study and cross-device testing on physical phones are not implied by viewport emulation.

## Browser restore acceptance completed

After the user enabled the Chrome extension file-URL permission, the actual exported `/Users/smahajan/Downloads/audit-with-review-notes.json` was restored through the app's file chooser. The interface reported “1 review decisions restored to this audit.” Filtering to confirmed concerns showed the saved Stewardship_06 decision, and the reason textarea retained the exact exported acceptance-test note. Screenshot: `tmp/review-restore-verified.png`. This closes the earlier automated restore limitation. No provider calls were made and the bundled demo was not changed. Provider-backed rescoring and publication walkthrough remain for the authorized demo candidate run.
