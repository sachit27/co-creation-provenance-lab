# Demo refresh — 2026-10-30

The validated synthetic baseline and a separately generated, fully rescored revision are now the application's saved demo. This is a local update; no repository push or hosted deployment was performed.

## Saved records

| Artifact | Run ID | SHA-256 |
| --- | --- | --- |
| `public/demo-result.json` | `353d8d0c-d945-4d0d-8b1d-2ad973d99603` | `c4a8afc2565e78d8e729e864879f061fc2394fe2fc3772703a704400c0249e89` |
| `public/demo-revision.json` | `5553b54c-76b8-4e09-9e69-8b8b7abd08dd` | `3fcedfc2a0387655c9d65ec28a05155fb7537f9046fc260126f1228d1b1999a7` |

The revision's `revisionOfRunId` points to the baseline. Both retain the exact 40 current `SAMPLE_DATA` IDs and source texts, with OpenAI `text-embedding-3-small` embeddings. Generation, drafting, and evaluation used the requested `gpt-4o-mini`; provider metadata records `gpt-4o-mini-2024-07-18`. These are same-model automated assessments, not independent human validation.

The previous baseline is retained at `tmp/demo-before-refresh.json` (SHA-256 `bee3c7acb5021f3028ae7373a2f67c3dada8164b71ea1cf47515bdc077e7cf92`). No fabricated reviewer decisions or participant approval were added to the public artifacts.

## Interpretation

- Baseline: 256 words, 11 summary sentences; 44 of 77 source units assessed for language transformation, with participant-balanced assessment coverage 0.575. The remaining 33 units are unassessed, not omissions.
- Revision: 433 words, 16 summary sentences; 50 of 77 source units assessed, with participant-balanced assessment coverage 0.625. The remaining 27 units are unassessed.
- All 40 source-score pairs are comparable under the recorded source/model checks. Eight increase and two decrease by more than 0.005; the other 30 fall within that display tolerance. These changes are descriptive and do not prove meaning preservation, fair representation, significance, or causality.
- The draft exceeded the requested ±25% length range. The actual text was retained rather than silently shortened or relabeled. The comparison displays both word counts and explicitly warns that it does not control for length. Future draft generation now includes an explicit length warning in its targeting note when the requested range is exceeded.
- The baseline contains an unsupported consensus assertion that its claim assessor left unassessed. The revision removes the consensus wording and explicitly includes the garden/flood-storage and wildlife-disclosure disagreements. This is a synthetic AI-assisted revision, not participant-approved text.
- Tension candidates include plausible false positives, such as volunteer participation versus paid stewardship, and accessibility versus habitat features. They were preserved as actual model outputs. Exact source spans establish text membership, not incompatibility. Every candidate, including one coded acknowledged, can now be inspected in the human review queue; the tension view carries a prominent warning. No model-coded handling rate should be treated as a validated disagreement-preservation rate.

## Application and validation

The demo fetches a matching saved revision and offers **Compare saved revision** without needing an API key. Comparison, adoption, and retained revision history were exercised in Chrome. A revised static audit retains the earlier full analysis in its JSON history, excluding recursive history and input embeddings. The overview now distinguishes source-score flags from the broader queue and shows the number of automated evidence suggestions.

`npm run verify` passed all **33 test files**, TypeScript checking, and production build. The new saved-demo test checks source identity, current configuration, model identity, complete execution, distinct run IDs, revision lineage, paired score eligibility, and absence of fabricated human decisions. Both artifacts also passed `scripts/validate-demo.ts`, including exact-span membership checks for source-language, claim evidence, and tension quotes; finite scores; current method records; and credential/embedding exclusion. Atomic claims may be decompositions rather than verbatim spans, so they are bound to valid parent summary sentences and displayed alongside that original wording.

A replay through the real local HTTP API used all 40 synthetic contributions, both saved publications, private review notes, a facilitator-activated customized survey, nonnumeric `cannot_judge` feedback, and full export. The export preserved both publications and review history and excluded all access tokens. Chrome checks additionally verified facilitator recovery, the published comparison, note saving, persistence after reload, and inclusion of the browser-saved note in a subsequent export. Replay source IDs were relabeled to the session's P001–P040 IDs; source text and scores were not changed. This was a synthetic saved-result replay, not a new workshop or another model run.

The production build and both public artifacts were scanned for the configured API key: no occurrence was found. Input embeddings and private live access tokens are not in the public demo files. The key was loaded from `.env` without being displayed.

Recorded completion usage across baseline, drafting, and revision: 99 calls, 83,259 input tokens, 52,452 output tokens; 0 provider responses ended because of the output limit. Embedding usage is additional and is not included in those totals. Actual billing is determined by the provider; no billing estimate is asserted here.

Build retains the existing warning about a JavaScript chunk exceeding 500 kB. Physical phone testing and an independent human evaluation remain outstanding; viewport checks do not replace them. The app remains local at `http://127.0.0.1:5173`; LAN/public hosting has not been enabled.

Screenshot: `tmp/refreshed-demo-comparison.png`. Detailed validation reports and the synthetic live export are in `tmp/`; private replay credentials remain in a separate file and are not included in public artifacts.

Final browser/build follow-up: the saved comparison uses a bounded word-level diff (with an explicitly disclosed coarse-span fallback for long texts), preserving shared wording between edits. Chrome displayed 20 precise highlighted segments for this pair. Revision lineage and recorded drafting completion metadata are included in the integrity-covered provenance export. The final `npm run verify` again passed all 33 test files, type checking, and build; the final build and both public demo files passed the configured-key scan. No further provider calls were made for these UI and export checks.
