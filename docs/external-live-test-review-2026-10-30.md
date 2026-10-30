# Review of the 20-client live test — 2026-10-30

The recorded session `9OPHG35V7M` demonstrates that the local HTTP workflow accepted 20 scripted synthetic submissions, an edit, two publications, a customized survey, 40 predetermined feedback records, a review note, and a token-free facilitator export. The second publication links to the first. The OpenAI response metadata records `gpt-4o-mini-2024-07-18` for the first summary; alignment used local TF-IDF. These are useful functional checks.

The report is **not evidence that 20 people participated or felt better represented**. One process submitted the 20 prewritten records sequentially. Both rating waves and their positive revision responses were hard-coded in the test. It did not test concurrent load, physical phones, user comprehension, or independent human review.

The script called `runCoreAnalysis`, not the complete `runAnalysis` used by the facilitator UI. Therefore it did not exercise the model-coded claim, language, tension, affect, knowledge-graph, or association stages in this run. The API accepted a client-supplied analysis record; it did not independently recompute or substantiate the published summary. The known-token string scan supports only the narrow conclusion that those tokens and the configured API key were absent from the exported JSON. Published wording and pseudonymous graph data can still disclose information.

## Substantive failure in the recorded publication

Publication 1 says there is “a consensus” on human oversight. The 20 contributions contain several distinct oversight proposals, but this test did not perform a consultation-wide agreement assessment. Publication 2 retained that statement and appended that “multiple participants strictly opposed” AI use for discrimination and harassment grievances. Only P003 states that specific opposition; P006 asks for an opt-out from third-party AI processing, P012 raises conditional cloud-service concerns, and P020 prefers manual review if dissent is diluted. P017 separately asks for immediate escalation of one-off emergencies. The appended sentence improperly combined and amplified these positions.

The numerical change from 0.344 to 0.354 mean TF-IDF alignment, and from 0.284 to 0.282 Gini, does not repair these content errors. The second summary is longer, and the 40 ratings were scripted. Neither the score change nor the ratings establishes improved fidelity, fairness, or participant approval. Keep the persisted session as the historical test record; do not present either publication as a validated synthesis.

## Corrections made after review

- Future runs of `scripts/test-live-20-agents.ts` identify the 20 clients and survey responses as scripted, describe the core-only analysis scope, use source-bound singular attributions in the revision, remove the specific unsupported consensus sentence when present, and mark an AI-derived manual edit as `ai-assisted`.
- The live facilitator console now flags broad agreement or prevalence wording before publication and asks the facilitator to check the full source set and rerun the audit if the wording is unsupported. This is a review aid, not an automated truth test or a server-side publication gate.
- Revising an AI draft in the live UI now defaults to `ai-assisted` provenance, including when the prior AI version has already been published.

The saved benchmark demo in `public/demo-result.json` and `public/demo-revision.json` was not changed by this separate test. Its own methodological limits remain documented in `docs/demo-refresh-2026-10-30.md`.
