# Release check — 30 October 2026

## Checks completed

- `npm run verify`: all 28 test files, TypeScript, and production build passed.
- Production build with `VITE_BASE_PATH=/apps/provenance-lab/`: six HTML asset references resolved; the configured OpenAI key did not appear in built JavaScript.
- Disposable localhost HTTP stress run: 200 concurrent participant joins, 200 submissions, 200 personal views, and 200 survey responses. All 800 requests succeeded. Median 43 ms, p95 163 ms, maximum 194 ms on this machine. The run also checked stale publication rejection, two publication versions, access control, privacy, and complete export.
- Current 20 participant simulation: OpenAI returned `gpt-4o-mini-2024-07-18` for the first summary. A facilitator revision was rescored; all 12 simulation assertions passed, including versioned feedback, export, and participant isolation.

## Sharing boundary

The static hosted build supports the uploaded-data workflow and bundled demo. It does **not** provide a live session server. Shared live workshops require the Node server on an address reachable by participant devices. The current server uses local JSON files and is documented as a single-process pilot; public deployment needs HTTPS, operational access control, retention and abuse controls, and a transactional store for multiple instances.

## Checks still needed in the intended venue

- Scan the actual QR code with a participant phone on the workshop network; the selected LAN interface and firewall cannot be verified by a localhost test.
- Walk through facilitator and participant screens in a real browser on desktop and phone, including recovery after closing a tab. Browser UI automation was unavailable in this check.
- Confirm the chosen hosting setup and provider credentials. The simulation checked the local server and one OpenAI model response, not the eventual public deployment.

The stress script is `tests/stress-live.mjs`. Run it only against a disposable server and `LIVE_DATA_DIR`; it intentionally fills one session to the 200 contribution limit.

## Product refresh verification (later on 30 October)

- General participatory-provenance landing message, use contexts, separate existing-data/live workflows, and explicit demo framing implemented.
- Active audit functions now use full width with overview-only aggregate sections, purpose text, focus/scroll navigation, and source inspection below the chart. Input sensitivity remains explicitly a source-centroid measure, not summary regeneration.
- Final `npm run verify`: all 30 test files passed, TypeScript passed, production build passed. Build retains a bundle-size warning.
- Fresh isolated API stress run: 200 concurrent participants, 800 requests, median 36 ms, p95 111 ms, max 140 ms; versioning, survey, privacy and export checks passed.
- Malformed encoded request path returned HTTP 400 and server remained healthy. Link-local addresses are excluded from QR address suggestions; regression test passed.
- Public test server restarted with existing phone-test data preserved. Static hosting publication and repository push remain separate later work.
- Browser automation became disabled in Work settings. Latest layout/focus changes therefore still require visual and assistive-technology checks; earlier screenshots are not proof of this build.
- Claims and public-service blockers are tracked in product-evidence-review.md. No real-user study, independent security audit or fairness validation was performed by these checks.
