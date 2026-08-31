# Provenance Lab methodology

## Scope and scientific status

Provenance Lab audits how a stored source collection and a stored summary relate. It distinguishes:

1. **execution provenance** — what source collection, summary origin, provider, model, embedding method, software version, timestamps, and fallbacks were recorded for a run;
2. **semantic association** — similarity-based links between source records and summary sentences;
3. **automated model-coded assessments** — source-unit transformation, affective expression, claim support, and tension handling.

Semantic association is not observed influence or causal derivation. Automated assessments are review aids, not human adjudication or validated outcome scales. The tool cannot establish that the uploaded participants represent a target population because recruitment, consent, nonresponse, and sampling frames are outside the uploaded text unless separately documented.

## 1. Input census and preprocessing

Each stored participant response has an identifier, text, and optional group. Combined multi-question files retain the question as non-evidentiary context while answer text alone enters the source-unit census. Short, numeric, refusal, and unknown responses are retained rather than silently treated as missing.

CSV parsing is quote-aware and supports quoted newlines and common delimiters. Header detection remains heuristic, so the preview is part of the evidence check. Preprocessing decisions should be recorded with the source data in a real deployment.

Summary and source text use a shared deterministic sentence-like segmenter. It supports lowercase sentence starts, newlines, common abbreviations, decimals, and several non-Latin terminators. These units are reproducible proxies, not linguistically validated clauses; a unit can contain several claims or targets.

## 2. Summary origin

The run distinguishes:

- **generated in run** — a configured language model generated the summary;
- **algorithmic extractive** — complete source responses were selected by a deterministic centroid-nearness rule;
- **human or externally supplied** — the user pasted or revised text;
- **fallback** — a requested AI generation failed and the disclosed extractive method was used.

Manual and extractive summaries are not attributed to the configured generator. For extractive summaries, a selected source is scored against a leave-self-out version of the summary. When no independent text remains, its representation score is unavailable rather than circular.

## 3. Embedding methods

A run uses one embedding space atomically:

- BGE-M3 through the optional local Python service;
- provider embeddings from OpenAI, Gemini, or Ollama;
- local sublinear TF × smoothed-IDF vectors.

If a dense method fails, the complete run is recomputed in the local TF-IDF space. Vectors from different models or dimensions are never mixed. BGE-M3 does not run in the browser.

The optional persistent embedding cache is off by default. If enabled, it uses SHA-256 identities, finite-vector validation, a seven-day retention period, and a user-visible clear control. An in-memory cache exists only for the current page session.

## 4. Representation score

For participant $i$, let $p_i$ be its vector and $s_k$ the vector for summary sentence $k$. The representation score is

$$
R_i = \max_k \max(0, \cos(p_i,s_k)).
$$

This measures strongest sentence-level semantic alignment, not factual entailment, authorship, influence, agreement, or affective preservation. The interface exposes the best sentence and thresholded secondary associations.

Failed embeddings and unavailable leave-self-out comparisons are excluded from aggregate metrics and shown as unavailable. Interpretation bands are embedding-tier specific because sparse TF-IDF and dense embedding cosines are not numerically comparable. All display bands are provisional and require calibration for the intended corpus, language, and embedding method.

## 5. Descriptive distribution and geometry

The Gini coefficient is calculated over valid $R_i$ values:

$$
G = \frac{\sum_i\sum_j |R_i-R_j|}{2n^2\bar R}.
$$

It describes inequality in these model-dependent alignment scores. It does not prove unfairness, discrimination, majority rule, or population bias. Equal scores can all be low, so Gini must be read with the score distribution and valid-record count.

Semantic isolation is clamped cosine distance from the source-vector centroid:

$$
I_i = \min(1,\max(0,1-\cos(p_i,\bar p))).
$$

The centroid is majority-weighted. High isolation can mean a legitimate minority cluster, noise, or an unusual contribution. The alignment-quadrant view uses median centrality and alignment splits only to organize review; it is not a hypothesis test or validated risk class.

The mutual-k-nearest-neighbour graph, PCA map, clusters, and Sankey-style view are semantic-association visualizations. Their edges do not establish information flow or derivation.

### Validated exploratory semantic grouping

New runs do not treat every K-Means output as a usable partition. The grouping
pipeline first L2-normalizes source embeddings, so squared Euclidean assignment
is equivalent to cosine assignment. Up to 128 dimensions are used directly. For
larger embeddings, a deterministic signed feature-hash projection is used for
repeated candidate fitting only when sampled full/projected cosine distances
correlate at least 0.80; the selected partition must then also pass silhouette
validation in the original full embedding space. PCA is used only to draw the
two-dimensional map and cannot determine group membership.

For every candidate `k`, the application runs multiple deterministic K-Means++
starts, stops Lloyd iterations at assignment convergence, and retains the
minimum-inertia fit. A candidate remains eligible only when all of the following
transparent internal gates pass:

- at least six valid source embeddings are available;
- every group has at least two source records;
- mean cosine silhouette is at least 0.25, with singleton observations assigned
  silhouette zero rather than removed from the mean;
- mean adjusted-Rand agreement with deterministic 80% participant subsamples is
  at least 0.75;
- at least 75% of local-neighbour relations remain inside the proposed groups.
- adjusted-Rand agreement with a same-`k` cosine average-linkage sensitivity
  partition is at least 0.75. Average linkage uses all cross-group distances and
  avoids the single-edge chaining failure of the earlier single-linkage check.
  For more than 160 records, the sensitivity hierarchy uses a deterministic
  160-record subsample and the sample size is recorded with the diagnostics.

The eligible candidate with the highest silhouette is reported. If none passes,
the map is explicitly **unpartitioned**. Cluster-conditioned counterfactual
utility attribution, facilitation gaps, tension sampling, and cluster-score
simulation are then unavailable rather than silently using an arbitrary split.
The report and PROV record carry the selected `k`, group sizes, candidate scores,
thresholds, stability, neighborhood coherence, method version, and failure
reason. These checks establish only internal geometric reproducibility. They do
not validate topics, stakeholder identities, natural social groups, or causal
strata; every interpretation still requires source-text review.

## 6. Participant-resampling stability

The tool resamples observed valid participants with replacement and recomputes Gini, mean representation, and the centroid-distant-quartile gap. The deterministic percentile ranges answer: *how sensitive is this aggregate to reweighting the observed records?*

They are population confidence intervals only if the records can defensibly be treated as an IID sample from a defined population—an assumption usually unsupported in open or purposive consultations. They do not include embedding-model, generator, evaluator, recruitment, or preprocessing uncertainty. A narrow interval is not evidence of validity or representativeness.

## 7. Source-unit transformation census

The current method first inventories every sentence-like answer unit. In batches, an evaluator must return exactly one of:

- **preserved** — meaning, specificity, and expressed force retained;
- **softened** — same claim and target, materially weaker force, urgency, or intensity;
- **sanitized** — concrete criticism, accusation, or demand replaced by neutral or bureaucratic wording;
- **abstracted** — concrete actor, event, quantity, or lived detail generalized away;
- **target shifted** — mapped evidence concerns a different target;
- **target uncertain** — an exact span was returned but the evaluator abstained on target comparability;
- **dropped** — a completed assessment found no summary alignment;
- **unassessed** — missing, malformed, or unverifiable evaluator output.

Mapped summary quotations must resolve to contiguous verbatim spans. Failures are never converted to “dropped” or “preserved.”

The preservation estimate is participant-balanced. For participant $i$, let $E_i$ be source units with complete evaluator output other than target abstentions. A target-shift result remains eligible and counts as non-preserved; malformed/missing output and target-uncertain abstentions are excluded. Let $y_{ij}=1$ for preserved unit $j$:

$$
\widehat P = \frac{1}{N_E}\sum_{i:|E_i|>0}\frac{\sum_{j\in E_i} y_{ij}}{|E_i|}.
$$

The numerator and denominator are reported as participant-equivalent units. Output completeness is reported separately. This is an automated transformation assessment, not a validated “language fidelity” scale.

## 8. Automated affective-expression audit

The affective audit does not infer internal emotion and does not produce a generic emotion-smoothing score. It reuses the complete transformation census and its verified alignments.

Each unique source or summary unit is profiled pointwise under an opaque identifier. A profile records target-relative ordinal valence, expressed affect/evaluative intensity, urgency, broad emotion families, stance, and model-reported certainty. Missing profiles remain missing; low certainty is excluded rather than changed to neutral.

Deterministic code then records material attenuation, amplification, polarity change, stance change, emotion-family change, target shift, omission, or uncertainty. Attenuation counts any comparable unit with a decrease of at least one ordinal level in valence magnitude, intensity, or urgency, even when another change is the primary label.

For each conditional denominator, participants are macro-averaged:

$$
\widehat A = \frac{1}{N_C}\sum_{i:|C_i|>0}\frac{\sum_{j\in C_i}\mathbf 1(\text{attenuation}_{ij})}{|C_i|}.
$$

The interface separately reports:

- full-census source-profile completion;
- high-certainty source affect/evaluation-bearing units;
- alignment assessment and same-target coverage;
- summary-profile comparability;
- attenuation within comparable units;
- sensitivity to certainty and ordinal-change screens.

An uncertain stance cannot be labelled preserved. Free-text target labels from the independent profiles are displayed and literal disagreements are flagged for review, but are not automatically equated or excluded because synonymous labels may differ.

The user can select a different evaluator model and provider. Cross-provider evaluation reduces direct same-model and same-provider self-review, but it is not a substitute for independent measurement validation: shared training-data effects, pointwise batch effects, sentence-unit granularity, ordinal thresholds, and cultural/language variation remain explicit limitations. Human-coded validation remains necessary before treating this as a validated measurement instrument.

## 9. Claim and tension assessment

Summary claims are decomposed and matched to candidate passages. Vector dimensions are validated; lexical retrieval is used when an individual claim embedding is unavailable. The evaluator sees multiple retrieved passages and can return supported, inferable, unsupported, or unassessed. The headline supported fraction excludes unassessed claims but reports their count.

Tension analysis runs only after the semantic partition passes its validity gates. Every record is screened in groups of up to 12 records; larger groups use a disclosed bounded subset, and the exported result records the screened and total counts for every group. A first evaluator proposes candidates from a conservative taxonomy: direct contradiction, incompatible policy, or explicit trade-off. Code rejects unknown participant IDs, invented quotations, non-contiguous source spans, and broader priority or emphasis labels. A second evaluator prompt independently rejects candidates whose two exact quotes can coexist. Summary handling then distinguishes an explicitly acknowledged incompatibility, one-sided coverage, flattened conflict, complete absence, distortion, or an unassessed result. Non-absent handling labels require an exact contiguous summary span. Sampling caps and evaluator dependence mean this remains a model-coded candidate screen rather than a complete contradiction census.

## 10. Exploratory rhetoric–alignment association

The rhetoric screen uses one deterministic English-oriented marker lexicon for assertiveness, register, evidentiality, and emotional-intensity cues. Its weighted composite is an unvalidated interface construct. A Spearman coefficient and seeded Monte Carlo permutation p-value describe association with semantic-alignment scores. The review rule does not control topic, language, group, model, or multiple researcher choices and cannot diagnose rhetorical bias. Model-coded/lexicon blending was retired to avoid mixing instruments across records and generator self-evaluation.

## 11. Counterfactual utility attribution

The optional Shapley-style module estimates changes in a specified deterministic coverage utility when source coalitions are summarized. It is labelled **stochastic counterfactual utility attribution**, not causal influence. Coalition inputs are canonicalized and cached, but each model-generated coalition summary is still one stochastic realization. Above the direct-participant limit, results are cluster-level only. Sampling error does not include generator variability.

The arithmetic what-if panel only recomputes outcomes under explicit score-change assumptions. It is not a forecast of recruitment, facilitation, or policy outcomes.

## 12. Provenance export

The JSON-LD export follows W3C PROV concepts and records source/summary SHA-256 digests, activity times, declared summary origin, requested/configured methods, fallbacks, semantic assessments, transformation and affect cases, and limitations. Provider-returned model snapshots, request IDs, finish reasons, token usage, and accepted parameters are not yet captured, so configured model identifiers are explicitly labelled as such.

It is an **unsigned audit record**, not a certificate, digital signature, or proof that source text is true. The export includes a SHA-256 integrity manifest over a stable serialization of the record (excluding the manifest itself), so a verifier can detect later modification. Because the digest is not signed with a trusted key, anyone who changes the record can also replace the digest; it provides change detection, not author or institutional authentication. Per-content digests enable comparison only when the verifier already has the referenced content. Semantic matches are represented as assessments, never as observed derivation from every source.

## Offline participant responses

The participant-response page is a static, privacy-minimal manual-return package. It contains the summary and project label but no participant roster, source contribution, automated score, matched sentence, or other response. Each export receives a cryptographically random request ID and is bound by SHA-256 digests to the dataset label, summary, and analysis run, with a 30-day expiry. A returned v3 response has a separate response ID and payload digest. Import checks the run and summary binding, request and payload digests, validity interval, exact participant-ID membership, and duplicate response IDs. If a participant returns multiple responses, only a later submission replaces an existing one.

These checks reject stale, mismatched, duplicated, or corrupted packages; they do **not** authenticate who entered a participant ID. Legacy v2 files can still be imported when their run, dataset, participant, and timestamp match, but the interface flags their missing summary binding and integrity controls. Authenticated consent, withdrawal, identity recovery, organizational signing, access control, and retention enforcement require a deployed backend, identity/consent policy, and managed keys.

## 13. Validation boundaries

Current regression tests cover deterministic parsers, formulas, denominator logic, sentence segmentation, source-census missingness, export escaping, strategy math, and attribution games. Type checking and production builds are part of release verification.

Still required before consequential deployment:

- blinded human-coded, multilingual and domain-specific validation;
- inter-rater agreement and adjudication protocols;
- evaluator-model, order, repeat, and prompt-perturbation robustness;
- real consultation sampling/recruitment provenance;
- accessibility and usability studies with facilitators and participants;
- authenticated participant challenge/withdrawal workflows;
- signed evidence packages and external security review.

## Primary methodological references

- [W3C PROV Overview](https://www.w3.org/TR/prov-overview/) and [PROV-O](https://www.w3.org/TR/prov-o/)
- [SummaC: Re-Visiting NLI-based Models for Inconsistency Detection in Summarization](https://aclanthology.org/2022.tacl-1.10/)
- [SemEval-2018 Task 1: Affect in Tweets](https://aclanthology.org/S18-1001/)
- [Target-Guided Structured Attention for Target-Dependent Sentiment](https://aclanthology.org/2020.tacl-1.12/)
- [GoEmotions](https://aclanthology.org/2020.acl-main.372/)
- [The Comparative Trap](https://aclanthology.org/2025.blackboxnlp-1.5/)
- [Judging the Judges](https://aclanthology.org/2025.ijcnlp-long.18/)
