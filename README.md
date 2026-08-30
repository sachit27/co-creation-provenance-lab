<div align="center">

<img src="public/logo.png" alt="Provenance Lab" width="120" style="border-radius: 20px;" />

<br/>

# Provenance Lab

**Open-source visual analytics for auditing AI-generated summaries.**<br/>
Inspect execution provenance, semantic associations, and automated evidence-review flags in source-to-summary workflows.

<br/>

[![Try it live](https://img.shields.io/badge/Try_it_live-Provenance_Lab-2563eb?style=for-the-badge&logo=github&logoColor=white)](https://sachit27.github.io/apps/provenance-lab/)

[![TypeScript](https://img.shields.io/badge/TypeScript-5-3178C6?logo=typescript&logoColor=white)](https://www.typescriptlang.org/)
[![React](https://img.shields.io/badge/React-18-61DAFB?logo=react&logoColor=black)](https://react.dev/)
[![Vite](https://img.shields.io/badge/Vite-6-646CFF?logo=vite&logoColor=white)](https://vitejs.dev/)
[![License: AGPL v3](https://img.shields.io/badge/License-AGPL%20v3-blue.svg)](https://www.gnu.org/licenses/agpl-3.0)

<br/>

[The Problem](#the-problem) &nbsp;&middot;&nbsp; [How It Works](#how-it-works) &nbsp;&middot;&nbsp; [Features](#features) &nbsp;&middot;&nbsp; [Quick Start](#quick-start) &nbsp;&middot;&nbsp; [AI Providers](#ai-providers) &nbsp;&middot;&nbsp; [Methodology](#methodology)

<br/>

<img src="public/dashboard.png" alt="Provenance Lab Dashboard" width="100%" style="border-radius: 12px;" />

<sub>Audit dashboard showing model-dependent alignment indicators, evidence checks, and explicit limitations.</sub>

</div>

<br/>

## The Problem

Large Language Models are increasingly used to synthesize complex inputs — stakeholder consultations, survey responses, research literature, community feedback. But **synthesis is inherently reductive**:

- Summaries can omit, merge, or reframe source material
- Nuance and affective expression can change without an explicit record
- The distance between original evidence and final summary is invisible
- It is difficult to inspect which source passages are semantically aligned with, or absent from, each summary claim

**Provenance Lab makes this inspectable.** It records execution provenance and adds semantic-association and automated evidence audits between source documents and a summary. Similarity is not causal influence, and automated judgments remain review aids rather than proof.

<br/>

## How It Works

```
  Upload CSV              AI Generates             Provenance Engine            Visual Dashboard
  ┌──────────┐           ┌──────────────┐          ┌───────────────┐           ┌──────────────┐
  │ Participant │  ───>   │   Summary    │   ───>   │  Embed, Score │   ───>   │ 16 Analytical│
  │ Responses  │         │  (any LLM)   │          │  Trace, Audit │          │    Views     │
  └──────────┘           └──────────────┘          └───────────────┘           └──────────────┘
```

1. **Upload** participant responses as CSV (auto-detects columns, handles messy data)
2. **Summarize** using any AI provider — or paste an existing summary
3. **Audit** — the engine computes semantic-alignment scores, highlights review candidates, and checks claim evidence
4. **Explore** — 16 interactive visualizations reveal exactly what happened during synthesis

> **Privacy-first**: All analysis can run entirely in-browser. No data leaves your machine unless you opt into a cloud LLM provider.

<br/>

## Features

Provenance Lab provides **16 analytical views** organized into four layers:

### Representation & Equity

<table>
<tr>
<td width="50%">

**Discussion Map** — 2D semantic projection (PCA) of all participant inputs. Colors show semantic groups only when a cosine-space spherical K-Means partition passes projection-fidelity, full-space separation, minimum-size, resampling-stability, neighborhood-coherence, and method-sensitivity gates; otherwise the map remains explicitly unpartitioned.

**Blind Spot Analysis** — Quadrant scatterplot (Centrality vs. Representation) that identifies voices the summary ignored despite being topically relevant.

**Alignment Distribution** — Lorenz curves, Gini coefficient, and participant-resampling stability intervals describing inequality in model-dependent alignment scores. These do not prove fairness or population bias.

</td>
<td width="50%">
<img src="public/blind_spot.png" alt="Blind Spot Analysis" width="100%" style="border-radius: 8px;" />
<sub>Blind Spot Analysis: identifying excluded voices by comparing opinion centrality against AI representation.</sub>
</td>
</tr>
</table>

### Provenance & Traceability

<table>
<tr>
<td width="50%">
<img src="public/lineage.png" alt="Contribution Lineage" width="100%" style="border-radius: 8px;" />
<sub>Source–summary associations: reviewing sentence-level semantic matches without claiming causal influence.</sub>
</td>
<td width="50%">

**Source–Summary Associations** — Interactive flow diagram showing participant-to-summary semantic matches. It does not claim observed influence or derivation.

**Semantic Association Sankey** — Theme-to-summary similarity map with explicit unmatched residuals.

**Knowledge Graph** — Entity-relationship graph extracted from participant texts using Louvain community detection, revealing the conceptual structure of the discussion.

</td>
</tr>
</table>

### Language & Rhetoric

<table>
<tr>
<td width="50%">

**Source-unit Transformation** — Inventories every sentence-like answer unit and records preserved, softened, sanitized, abstracted, target-shifted, target-uncertain, dropped, or unassessed outcomes with exact summary spans and explicit output completeness.

**Affective-expression Audit** — Compares target-aware pointwise profiles of verified source and summary spans across valence magnitude, expressed intensity, urgency, broad emotion families, and stance. It does not infer internal emotion or report a generic emotion-smoothing score.

**Claim Attribution** — FActScore-inspired analysis mapping each summary claim to supporting, inferrable, or unsupported evidence in the source texts.

**Tension Network** — Detects conflicting viewpoints in the source data and tracks whether the AI acknowledged, suppressed, merged, or distorted those contradictions.

**Rhetoric–Alignment Association** — Exploratory Spearman association between an English-oriented marker composite and semantic-alignment scores. It does not control confounders or diagnose systematic bias.

</td>
<td width="50%">
<img src="public/loo.png" alt="Semantic Leverage LOO" width="100%" style="border-radius: 8px;" />
<sub>Semantic-centroid sensitivity (LOO): measuring how much the source-space centroid shifts when one record is removed.</sub>
</td>
</tr>
</table>

### Statistical Robustness

| View | What it measures |
|:---|:---|
| **Sensitivity (LOO)** | Leave-one-out source geometry showing which record most shifts the source-space centroid; not causal leverage over the summary |
| **Resampling Stability** | Deterministic participant-resampling intervals for selected aggregates; not population confidence intervals without defensible IID sampling |
| **Group Equity** | Between-group representation gaps when stakeholder categories (e.g., community, government, business) are present |
| **Strategy Comparison** | Side-by-side comparison of different summarization strategies on the same data |
| **PROV-O Export** | Unsigned W3C PROV-aligned JSON-LD audit record with digests, actual/requested methods, fallbacks, assessments, and limitations |

<br/>

## Quick Start

**Prerequisites:** Node.js 18+

### Local Development

```bash
git clone https://github.com/sachit27/co-creation-provenance-lab.git
cd co-creation-provenance-lab
npm install
npm run dev
```

Open `http://localhost:5173`. The tool works immediately with built-in demo datasets and local TF-IDF embeddings — **no API key required**.

The hosted read-only demo is available at [sachit27.github.io/apps/provenance-lab](https://sachit27.github.io/apps/provenance-lab/). Its bundled result is a full production-pipeline run over the 30 public sample contributions using local Ollama models. To reproduce that artifact:

```bash
OLLAMA_HOST=http://127.0.0.1:11434 npm run demo:generate
```

<details>
<summary><b>Run with Docker</b></summary>

```bash
docker compose up
```

</details>

<details>
<summary><b>High-fidelity multilingual embeddings (optional)</b></summary>

For an optional published multilingual dense-embedding method, run the local BGE-M3 embedding server:

```bash
pip install -r requirements-embedding.txt
python embedding_server.py
```

This provides 1024-dimensional multilingual embeddings supporting 100+ languages — no API key required.

</details>

<br/>

## AI Providers

Provenance Lab is **model-agnostic**. Bring your own API key or run fully offline.

| Provider | Summary Generation | Embeddings | Privacy |
|:---|:---:|:---:|:---|
| **Ollama** (configured host) | Yes | Yes | Local only when the configured host is local or organization-controlled |
| **BGE-M3** (local Python) | — | Yes | Local by default; depends on how the server is deployed |
| **TF-IDF** (built-in) | — | Yes | Computed in the browser |
| **Google Gemini** | Yes | Yes | Cloud API |
| **OpenAI** | Yes | Yes | Cloud API |
| **Anthropic Claude** | Yes | — | Cloud API |
| **Groq** | Yes | — | Cloud API; availability and pricing depend on the account |
| **Apertus** (Swiss National AI) | Yes | — | Cloud API |

> Browser-entered keys are kept in `sessionStorage`, not local persistent storage. Cloud providers receive participant text. Apertus sends the PublicAI key and text through the deployment's same-origin BYOK relay; opt-in Gemini server-key relays require authentication and quota controls. Review server logging, provider retention, and organizational policy before uploading sensitive data.

<br/>

## Methodology

<details>
<summary><b>Representation Scoring</b></summary>

<br/>

For participant vector $p_i$ and summary-sentence vectors $s_k$, the representation score is $R_i = \max_k \max(0, \cos(p_i,s_k))$. It is strongest sentence-level semantic alignment—not entailment, authorship, agreement, causal influence, or affective preservation. Failed vectors and unavailable extractive leave-self-out cases are excluded from aggregates. Dense and TF-IDF scores use different provisional interpretation bands because their cosine distributions are not comparable.

</details>

<details>
<summary><b>Automated affective-expression audit</b></summary>

<br/>

Legacy ternary sentiment and the mixed LLM/English-classifier/lexicon fallback have been retired. Current runs use a source-first, exact-span, target-aware, multidimensional model-coded audit with explicit missingness and conditional participant-balanced denominators. It is exploratory and requires human-coded multilingual/domain validation before consequential use.

</details>

<details>
<summary><b>Statistical Methods</b></summary>

<br/>

- **Participant-resampling stability intervals**: 1000 seeded resamples of observed valid records for selected aggregates
- **Spearman rank correlation**: Seeded Monte Carlo permutation screen (1,999 permutations) for the exploratory rhetoric–alignment association
- **Louvain community detection**: Modularity-optimized clustering with proper null-model penalty for non-edges
- **MinHash/LSH**: Near-duplicate detection with integer-safe hashing (prime = 104729)
- **Gini coefficient**: Descriptive inequality of valid semantic-alignment scores

</details>

<details>
<summary><b>Embedding Tier System</b></summary>

<br/>

The tool selects from available embedding methods using a documented fallback order; “available” does not imply best for the user's language or domain:

| Tier | Method | Dimensions | Intended role |
|:---:|:---|:---:|:---|
| 1 | BGE-M3 (local Python server) | 1024 | Published multilingual dense retriever; validate for the target domain |
| 2 | Gemini / OpenAI API embeddings | Model-dependent | Cloud dense retrieval; capabilities and dimensions depend on the selected model |
| 3 | TF-IDF (built-in, no setup) | Corpus-dependent | Lexical baseline — always available |

</details>

<br/>

## Input Format

Upload a CSV file with participant responses. The tool auto-detects columns:

```csv
id,text,group
P1,"We need more green spaces in the city center",community
P2,"Budget constraints limit infrastructure expansion",government
P3,"Mixed-use development could address both concerns",business
```

- **id** — Participant identifier (optional, auto-generated if missing)
- **text** — The participant's response (required)
- **group** — Stakeholder category for descriptive group comparison (optional)

Works with or without headers. Handles messy data, encoding issues, and varied delimiters.

<br/>

## Project Structure

```
co-creation-provenance-lab/
  components/
    ui/                    # Dashboard panels, config, onboarding
    visualizations/        # 16 analytical view components
  services/
    analysis.ts            # Core analysis pipeline
    completionRouter.ts    # Multi-provider LLM routing with timeout
    affectiveFidelity.ts   # Pointwise affective-expression profiles and deterministic comparisons
    languageFidelity.ts    # Source-census transformation aggregation
    rhetoricalAnalysis.ts  # Exploratory marker/alignment association
    claimAttribution.ts    # FActScore-inspired claim tracing
    graphRAG.ts            # Knowledge graph & Louvain clustering
    mathUtils.ts           # Statistical primitives (Gini, PCA, bootstrap)
    textUtils.ts           # Porter stemmer, RAKE, concept overlap
  api/                     # Vercel serverless functions (proxy)
  public/                  # Static assets & demo data
```

<br/>

## License & Contributing

Contributions are welcome. Please open an issue before submitting large architectural changes.

- **License:** [GNU AGPL v3.0](LICENSE)
- **Author:** Sachit Mahajan — [sachitmahajan90@gmail.com](mailto:sachitmahajan90@gmail.com)

For commercial or enterprise licensing inquiries, please contact the author.

<div align="center">

<br/>

<img src="public/landing.png" alt="Provenance Lab Setup" width="60%" style="border-radius: 12px;" />

<sub>Configuration panel with support for 8 AI providers and built-in demo datasets.</sub>

<br/><br/>

</div>
