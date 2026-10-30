# Product and research review

The live-session pilot now supplies a short facilitator path and a separate participant phone view. The next work should focus on these priorities.

## Before public deployment

1. **Accounts and recovery.** Give facilitators durable authentication and the ability to recover a session from another device. Browser-tab tokens are suitable for a local pilot, not a public service.
2. **Transactional storage and operations.** Replace single-process JSON storage with a database, backup/restore, retention rules, and deletion controls. Add input and session rate limits, abuse monitoring, capacity tests, and an explicit maximum session lifetime.
3. **Privacy and moderation.** Let facilitators disclose the purpose, provider destination, and retention period before joining. Add a review or hide action for harmful or identifying text before any shared projection. Never project raw contributions by default.
4. **Secure access.** Serve the app over HTTPS. Separate facilitator and participant roles in a durable authorization layer, and test cross-origin requests, injection, session fixation, and concurrent submissions.

## Make workshops easier to run

1. Provide a dedicated projection view with a persistent QR code, short code, current prompt, response count, and the current phase. Keep private controls and raw responses off the projection screen.
2. Add multiple prompts in a facilitator agenda, with each prompt's own open/close state and a clear record of what data entered each summary. Support optional timers and participant draft recovery.
3. Replace the dense dashboard entry point with a guided “What should I check?” path: summary, missing or weakly matched perspectives, source evidence, then advanced methods. Keep the full analytical workbench available.
4. Let participants contest the published summary or their own match in the phone view. Display response coverage and unresolved objections to the facilitator before ending the session.
5. Run keyboard and screen-reader tests on the dashboard's clickable participant rows, tabs, chart alternatives, and focus order. Test phones on slow networks and narrow screens. Add plain-language translations for the intended workshop languages.

## Scientific validation

1. Treat semantic alignment as a retrieval indicator. Calibrate its display bands separately for each embedding method, language, domain, and source length using human-coded source–summary pairs. Measure false matches, missed paraphrases, and contradiction cases. Avoid presenting uncalibrated thresholds as fairness criteria.
2. Freeze the closed source snapshot, summary origin, provider/model metadata, and effective settings for each publication. Permit a revised summary only as a new version with a visible before/after comparison and a record of which participants reviewed it.
3. Validate model-coded claim, tension, and transformation labels against blinded human annotation. Report abstentions and disagreement, not only aggregate rates. Separate generator and evaluator when feasible.
4. For uncertainty, distinguish participant-resampling stability, Monte Carlo variation in counterfactual utility, and uncertainty caused by model outputs. None of these alone supports a causal claim about a person's influence.
5. Give every chart a denominator, method/tier label, unavailable count, and link back to the source text or exact summary sentence that produced the indicator.

The current live mode keeps the existing audit methodology and exposes only a small, privacy-limited result on phones. Its limitations and run instructions are in [live-sessions.md](live-sessions.md); formal measure definitions are in [methodology.md](methodology.md).
