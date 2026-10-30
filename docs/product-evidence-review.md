# Product evidence and release review

Reviewed 30 October 2026 against the working tree. This is a code and documentation review, not an independent scientific evaluation, security audit, deployment attestation, or award submission.

## Defensible product position

Provenance Lab supports participatory provenance: people can inspect how a synthesis relates to submitted contributions, review machine assessments, revise a summary, and collect participant feedback. It can serve workshops, consultations, research discussions, organizational deliberation, and other collective synthesis settings. Public consultation is one application, not the boundary of the product.

The defensible fairness claim is **support for reviewing representational concerns**. The system does not certify fairness, establish population representativeness, identify causal influence, authenticate authorship, or prove that a summary preserves every contribution. A transparent workflow creates opportunities for review; it does not establish that participation improved outcomes.

## Claim inventory

| Claim or output | Evidence type and implementation | What can be said | Material limit |
|---|---|---|---|
| Source–summary alignment | Computed: `services/analysis.ts`, `services/mathUtils.ts`; strongest nonnegative source-to-sentence cosine | Reports semantic association and exposes candidate summary matches | Not agreement, entailment, causal contribution, or completeness; long sources can match on one topic only |
| Alignment inequality and group differences | Computed descriptive statistics; valid-record denominators | Helps locate uneven scores for human review | Low inequality can coexist with uniformly poor alignment; score scales depend on embeddings and domain |
| Source map and themes | Computed geometry and internally screened exploratory clustering | Displays source-space structure; withholds downstream grouping when gates fail | Internal stability is not external construct validity; opposing positions can be semantically close; PCA distorts distances |
| Claim evidence, transformation, affective expression, tensions | Model-assessed: respective services plus deterministic parsers/span guards | Presents candidate labels and passages with coverage/missingness | Not human-validated judgments; exact spans validate quotation presence, not label correctness; tension screening misses implicit conflict |
| Recorded methods and revisions | Operational record: run metadata, summary-origin fields, live publications | Records requested/effective methods, available provider metadata, summary versions and lineage | Optional provider metadata may be absent; declaration and browser results are not independently attested |
| Participant ratings | Self-report: `live/survey.ts`, `live/sessionStore.ts` | Reports separate pilot items with wording/version/digest and valid numeric counts | Not a validated scale, fairness measure, causal outcome, or verified-person sample; optional response bias remains |
| Audit exports | Computed records: `services/provenanceExport.ts`, `services/reportExport.ts`, `exportSession` | HTML review report, unsigned PROV-aligned JSON-LD with integrity digest, live operational JSON | Digest is replaceable and is not a signature; different export formats have different contents and privacy exposure |
| Live workshops | Implemented local/single-process workflow: `live/`, `components/live/` | Collect, close, audit, explicitly publish, revise, and export | Static GitHub Pages has no live backend; accounts, operations, and venue reliability require further work |
| Improved inclusion, trust, fairness, deliberation or adoption | No outcome evidence established by this review | State these as aims or evaluation questions | Do not claim measured benefit, users, partners, scale, uptake, or validated accuracy without documented evidence |

## Evidence currently available

The repository contains deterministic regression tests for formulas, parsing, missingness, export escaping and integrity, source-span guards, counterfactual estimators, live authorization boundaries, publication revisions, survey binding, participant views, and file reload. These verify selected implementation behavior. They do not establish scientific validity or complete security.

`docs/release-check-2026-10-30.md` records an earlier successful `npm run verify`, a disposable localhost 200-participant HTTP exercise, and a 20-participant provider simulation. These are author-recorded local checks, not independent user trials, production load benchmarks, or current hosted-service validation. The coordinating release check subsequently reported all 30 test files, TypeScript and production build passing, plus a new isolated 200-participant/800-request exercise (median 36 ms, p95 111 ms, maximum 140 ms on the local machine). This reviewer did not independently rerun those checks. Preserve command output, revision identifier, fixture, hardware/runtime, and date before using numerical performance claims externally.

The bundled 40-record synthetic fixture demonstrates the analysis pipeline and workflow. It is not a real consultation, benchmark, deployment, or evidence of social impact. The documented demo uses the same generator and reviewer model, limiting review independence. Private research material elsewhere in the working tree must not be represented as public, independently verified evidence without explicit review of its design and results.

## Release boundaries and blockers

### Suitable now with explicit scope

A static demonstration using synthetic data and a supervised local workshop pilot are credible descriptions of current maturity. A local pilot still needs informed participants, an operator responsible for data handling, and a checked venue setup. Award preparation can proceed using those boundaries; submission and publication remain separate actions.

### Resolve before public or sensitive-data deployment

1. **Access and abuse controls.** Facilitator control uses a bearer recovery key and participant access uses random browser-tab tokens. Session creation and joins have no service-wide rate control or durable identity. Session caps do not prevent mass session creation or repeated joins. Add deployment authentication, abuse controls, HTTPS, and a documented recovery/threat model. A token proves possession, not a person's identity.
2. **Durable operations.** `sessionStore.ts` writes private JSON files using a temporary file and rename. Operations are synchronous in one process. Multi-process writers can overwrite one another; there is no transactional database, backup/restore proof, automatic expiry, or application deletion/withdrawal workflow. Define retention and deletion ownership and verify recovery before real collection.
3. **Shared-map disclosure.** `publicConstellation` exposes each plotted contribution's alignment, previous alignment, closest summary-sentence index, geometry, and similarity links to session-code viewers after publication. It suppresses small-group labels and source text, but IDs are stable order-based pseudonyms. This is not anonymity and is broader than “only your score and aggregate measures.” The current participant disclosure now states that pseudonymous per-contribution metrics and the summary are shared. Assess linkage risk and decide whether shared per-contribution measures are necessary. Suppressing labels alone does not prevent singling out.
4. **Sensitive exports.** The facilitator live JSON export includes raw contributions, comments, feedback, and full browser-supplied analysis records. Top-level host/participant token hashes are omitted, but arbitrary `analysisRecord` content is not recursively sanitized or allowlisted. Do not promise every possible export is token-free, anonymized, or safe to share. Define an export review/redaction policy and validate allowed fields before broader use.
5. **Publication trust.** The live server checks revision and selected shapes/ranges but does not recompute alignment, reconcile aggregate scores, validate all analysis-record contents, or attest model execution. Treat published results as facilitator-submitted operational records. Signed evidence and independent verification are future work.
6. **Venue and interface verification.** Confirm actual deployment, phone/desktop flows, QR reachability, network/firewall behavior, tab loss/recovery, keyboard and screen-reader access. A localhost API test cannot establish these. Browser automation is currently disabled in Work settings, so the latest navigation has not been visually verified. No independent accessibility audit is documented here. The coordinating check reports a malformed static-URL crash fixed and checked for a 400 response with continued health, and link-local addresses excluded from LAN QR suggestions; these do not replace phone/venue testing.
7. **Provider and consent policy.** Cloud generation/review can send contributions to selected providers. Browser keys are exposed to page JavaScript; “local model” privacy depends on the host. Provide purpose, recipients, retention, withdrawal limits, and publication visibility before collecting sensitive data. Review applicable institutional requirements for the actual setting.

## Scientific work still needed

Use blinded human source–summary annotation with an adjudication protocol; measure agreement and error by language, domain, source length, and embedding method. Evaluate contradictory yet similar passages, small/minority perspectives, missing assessments, and evaluator variation. Test repeat runs, prompt/order perturbations and separate generator/reviewer settings. Evaluate the pilot feedback instrument and actual facilitator/participant usability before asserting improved process quality. No single similarity score or questionnaire item establishes fairness.

## External wording guardrails

Use “helps inspect,” “semantic alignment indicator,” “automated assessment,” “participant self-report,” “unsigned audit record,” and “local pilot.” Avoid “proves inclusion,” “fairness certification,” “causal provenance,” “bias detection,” “verified influence,” “anonymous,” “validated emotion measurement,” “production-ready,” and unsupported adoption or impact statistics. Keep capability, local verification, and intended benefit visibly separate.
