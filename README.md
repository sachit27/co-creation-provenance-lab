<div align="center">

<img src="main.png" alt="Co-Creation Provenance Lab — dashboard screenshot" width="100%">

<br/>

# Co-Creation Provenance Lab

### *Who spoke. Who was heard. And the gap between them.*

[![License: AGPL v3](https://img.shields.io/badge/License-AGPL%20v3-blue.svg)](https://www.gnu.org/licenses/agpl-3.0)
[![React 18](https://img.shields.io/badge/React-18-61DAFB?logo=react&logoColor=black)](#)
[![TypeScript](https://img.shields.io/badge/TypeScript-5-3178C6?logo=typescript&logoColor=white)](#)
[![Vite](https://img.shields.io/badge/Vite-5-646CFF?logo=vite&logoColor=white)](#)
[![PRs Welcome](https://img.shields.io/badge/PRs-welcome-brightgreen.svg)](#contributing)

[Problem](#the-problem) · [Use Cases](#use-cases) · [How It Works](#how-it-works) · [Capabilities](#capabilities) · [Quick Start](#quick-start) · [Methodology](#methodology) · [Troubleshooting](#troubleshooting)

</div>

---

## The Problem

Whenever a group of people contributes to a shared process — a consultation, a workshop, a survey, a policy forum — their inputs eventually get distilled into a synthesis: a summary, a report, a set of recommendations. That synthesis is what shapes decisions.

But synthesis is never neutral. AI-generated summaries amplify majority voices and flatten minority perspectives. Human facilitators do too, unconsciously. Non-English speakers, unconventional viewpoints, and structurally isolated participants are systematically left out — and nobody can see it happening.

**This gap between participation and representation is near-invisible without the right tooling.**

The Co-Creation Provenance Lab is an open-source auditing tool for any synthesis of collective input. Bring your own existing summary, or let the tool generate one — either way, it scores every participant's voice individually, clusters perspectives to detect structurally excluded groups, and tells you exactly who was left out and why.

---

## Use Cases

| Context | How the tool helps |
|:---|:---|
| **Civic & participatory design** | Audit AI summaries of community consultations; ensure no demographic cluster is systematically excluded |
| **Academic research** | Quantify representation bias in LLM summarisation across languages, groups, and ideological positions |
| **Facilitation & workshops** | Identify blind spots in real time; generate targeted follow-up questions for underrepresented voices |
| **Organisational co-creation** | Verify that employee surveys, ideation sessions, and strategy workshops reflect the full range of input |
| **Policy & governance** | Produce a verifiable provenance certificate documenting whose voices shaped a decision |

---

## How It Works

```
1. Upload participant responses (CSV or paste text)
        │
        ▼
2. Provide a summary to audit — your choice:
        ├── Paste an existing summary (human-written, AI-generated, or from another tool)
        ├── Let the tool generate one using your preferred AI provider
        └── Use extractive summarisation (no API key needed)
        │
        ▼
3. The tool audits the summary against every participant:
        │
        ├── Embeds every participant response and every summary sentence
        ├── Scores each participant: how much of their voice survived?
        ├── Clusters voices to detect structurally excluded groups
        ├── Diagnoses the root cause of each exclusion (LLM bias · language gap · unique voice)
        └── Generates an actionable facilitation plan to fix it
```

All of this happens in your browser. No participant data is sent to external servers unless you choose a cloud provider for text generation.

---

## Capabilities

### Representation Scoring

Every participant receives a score from 0 to 1 measuring how well their input is reflected in the summary. The score is a hybrid of semantic similarity (cosine on dense embeddings with exponential decay across matched sentences) and concept overlap (stemmed keyword intersection).

| Score | Status |
|:---|:---|
| ≥ 0.6 | ✅ Well represented |
| 0.5 – 0.6 | 🟡 Marginal |
| 0.3 – 0.5 | 🔶 Underrepresented |
| < 0.3 | 🔴 At risk |

### Blind Spot Detection

A participant is flagged as a blind spot only when *both* conditions hold: they are semantically isolated from the group centroid **and** their representation score is below threshold. This avoids the common pitfall of relative definitions, which would always flag 25% of participants regardless of actual fairness.

### Root-Cause Bias Diagnosis

For every underrepresented participant the tool diagnoses *why*:

| Label | Cause |
|:---|:---|
| 🌍 Embedding Gap | Multilingual failure — non-Latin script fell back to TF-IDF |
| 👤 Unique Voice | Content genuinely distinct; LLM had no basis to include it |
| ❌ Summariser Bias | LLM ignored semantically relevant input |
| 🗣️ Phrasing Mismatch | Same idea expressed in non-standard language |

### Semantic Clustering

K-Means++ with automatic K selection groups participants into semantic clusters. The 2D semantic map (PCA projection) shows the spatial arrangement of all voices and which clusters are furthest from the summary.

### Participant Similarity Network

An interactive force-directed graph where each node is a participant and edges connect those whose embeddings are mutually among each other's top-k nearest neighbors (mutual k-NN). Nodes are coloured by cluster and sized inversely by representation score — at-risk voices appear larger. Supports zoom, pan, drag, hover tooltips, and click-to-select. Isolated nodes (no mutual neighbors) are structurally distinct perspectives that no other participant closely shares.

### Citation Provenance Trail

Click any sentence in the AI-generated summary to trace it back to the exact participant inputs that influenced it, ranked by cosine similarity with match-strength badges. Answers: *"Where did that sentence come from?"*

### Equity Metrics

| Metric | What it measures |
|:---|:---|
| Gini coefficient | Inequality of representation across all participants |
| Coverage uniformity | How evenly the summary distributes across voices |
| Distinct representation gap | Mean score difference between isolated and mainstream voices |
| LOO sensitivity | Which individual inputs most shift the group semantic centre |
| Bootstrap CIs (95%) | Sampling uncertainty around all reported metrics |

### Language Equity

An exact permutation test (10,000 draws) verifies whether non-English inputs are statistically underrepresented relative to English inputs. Flags at p < 0.05.

### Facilitation Co-Pilot

Generates a workshop facilitation plan targeted at your specific blind spots: a gap brief, five follow-up questions per underrepresented theme, and three structured exercises (World Café, Fishbowl, Anonymous Voting). Works offline with a rule-based fallback.

### Interactive Revision Editor

Edit the AI summary manually or generate an AI draft that specifically targets underrepresented voices. Before/after equity metrics update without re-embedding participant inputs.

### Provenance Certificate

Export a W3C PROV-O JSON-LD provenance record documenting who contributed, what they said, and how much of their voice was captured — suitable for governance accountability.

---

## Quick Start

**Prerequisites:** Node.js 18+

```bash
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000). The tool works immediately with no API key using built-in demo data and local TF-IDF embeddings.

<details>
<summary><b>Docker</b></summary>

```bash
docker compose up
```

Or on Mac/Linux:

```bash
chmod +x start.sh && ./start.sh
```

</details>

<details>
<summary><b>BGE-M3 — recommended for multilingual datasets</b></summary>

BGE-M3 (1024-dim, multilingual SOTA) significantly improves accuracy on non-English inputs and large datasets. It runs locally — no API key required.

```bash
pip install sentence-transformers flask flask-cors
python embedding_server.py
```

First run downloads ~2 GB of model weights (cached afterwards). The app auto-detects the server at startup.

**Torch compatibility error?**
```bash
pip install 'transformers<4.50'
```

</details>

<details>
<summary><b>Ollama — fully local, fully private</b></summary>

```bash
ollama pull llama3.2:3b       # text generation (fast)
ollama pull nomic-embed-text  # embeddings
ollama serve
```

No data leaves your machine. CORS is handled automatically by the Vite dev proxy — no manual configuration needed.

</details>

---

## AI Providers

| Provider | Generation | Embeddings | Privacy |
|:---|:---|:---|:---|
| **BGE-M3** | — | ✅ 1024-dim SOTA | Local |
| **Google Gemini** | ✅ | ✅ `text-embedding-004` | Cloud |
| **OpenAI** | ✅ GPT-4o, GPT-4.1 | ✅ `text-embedding-3-small` | Cloud |
| **Claude** | ✅ Claude 4 Sonnet/Opus | ❌ (fallback) | Cloud |
| **Groq** | ✅ Llama 3, Gemma 2 | ❌ (fallback) | Cloud |
| **Apertus** | ✅ | ❌ (fallback) | Cloud |
| **Ollama** | ✅ Any local model | ✅ Any local model | Local |
| **TF-IDF** | — | ✅ Always available | Local |

### Embedding priority (automatic)

```
BGE-M3  →  Ollama  →  Gemini  →  Local TF-IDF
```

The system selects the best available tier at startup. No configuration required.

All AI features — sentiment analysis, keyword extraction, concept fidelity, facilitation planning, summary revision, and strategy comparison — route through a unified completion layer that respects the provider you select. Choose once, and every feature uses it consistently.

### API keys

| Method | How | Persists |
|:---|:---|:---|
| `.env` file | `GEMINI_API_KEY=AIza...` | Yes |
| Config panel | Paste in browser UI | Session only |

Keys entered in the browser are stored in `sessionStorage` only. Gemini calls are proxied server-side — your key is never exposed in client code.

---

## Methodology

<details>
<summary><b>Representation score</b></summary>

Each participant's score combines two signals:

**1. Embedding similarity** — cosine similarity between the participant's input vector and each summary sentence vector, with exponential decay on secondary matches:

$$S_{embed} = \cos(e_p, e_{s_1}) + \gamma \cdot \cos(e_p, e_{s_2}) + \gamma^2 \cdot \cos(e_p, e_{s_3}) + \ldots \quad (\gamma = 0.3)$$

The decay factor prevents double-counting when multiple sentences paraphrase the same point. This approach is inspired by coverage-aware scoring principles in multi-document summarisation (Radev et al., 2004); the specific weighted formulation is implemented in this codebase.

**2. Concept overlap** — stemmed keyword intersection normalised by participant keyword count (RAKE extraction).

**Final score:**
- Neural embeddings: `0.8 × embedding_sim + 0.2 × concept_overlap`
- TF-IDF fallback: `0.5 × embedding_sim + 0.5 × concept_overlap`

</details>

<details>
<summary><b>Equity metrics</b></summary>

| Metric | Formula | Interpretation |
|:---|:---|:---|
| Gini | Lorenz curve area | 0 = perfect equality; 1 = full concentration |
| Coverage uniformity | 1 − Gini | Higher = more even |
| Distinct gap | mean_rep(mainstream) − mean_rep(top 25% most isolated) | Smaller = fairer |
| LOO sensitivity | Z-score of Δ centroid when input i removed | Identifies dominant voices |

Gini thresholds: Low < 0.2 ≤ Moderate < 0.35 ≤ High

</details>

<details>
<summary><b>Clustering and visualisation</b></summary>

- **Clustering:** K-Means++ (Arthur & Vassilvitskii, 2007) with automatic K via elbow method
- **Projection:** PCA via power iteration with deflation — no browser-side ML library dependency
- **Similarity network:** Mutual k-nearest neighbors graph (von Luxburg, 2007). An edge exists iff both nodes rank each other in their top-k (k = min(5, ceil(sqrt(N)))). The mutual requirement produces sparse, high-confidence connections suitable for visual interpretation at scale.
- **Bootstrap CIs:** Efron & Tibshirani (1993); 200-sample resampling of Gini, mean representation, and equity gap

</details>

<details>
<summary><b>Staged analysis execution</b></summary>

For responsiveness with large datasets, analysis runs in two phases:

- **Phase 1** (immediate): embeddings, clustering, summary generation, representation scoring, all pure-math analyses — dashboard renders as soon as this completes
- **Phase 2** (background): concept fidelity analysis (N/5 LLM batches) — fills the Concepts tab when complete

A generation counter prevents stale state if a new analysis is started before Phase 2 finishes.

</details>

---

## Architecture

```
Browser (Vite + React + TypeScript)
  │
  ├── /api/ollama/*  ──▶  localhost:11434        (Ollama, dev proxy)
  ├── /api/gemini-*  ──▶  Vercel serverless       (Gemini, key server-side only)
  ├── localhost:5001  ──▶  BGE-M3 Python server   (embedding_server.py)
  └── api.groq.com   ──▶  direct fetch            (user key in sessionStorage)
```

<details>
<summary><b>Repository structure</b></summary>

```
co-creation-provenance-lab/
├── api/                          # Vercel serverless (Gemini proxy)
├── services/
│   ├── analysis.ts               # Core pipeline — Phase 1 + Phase 2
│   ├── completionRouter.ts      # Unified AI provider routing for all LLM calls
│   ├── embeddingCache.ts         # In-session LRU vector cache (model-keyed)
│   ├── aiAnalysis.ts             # Sentiment/concept with 3-tier fallback
│   ├── biasAttribution.ts        # Root-cause bias diagnosis
│   ├── facilitationCoPilot.ts    # Workshop plan generator
│   ├── summaryRevision.ts        # Revision engine + dimension-safe re-scoring
│   ├── provenanceExport.ts       # W3C PROV-O JSON-LD export
│   └── reportExport.ts           # HTML executive report
├── components/
│   ├── ui/                       # ConfigPanel, ExecutiveSummary, FacilitationCoPilot, …
│   └── visualizations/           # SemanticMap, BlindSpotPlot, ConceptDistortion, …
├── embedding_server.py           # BGE-M3 Flask server (localhost:5001)
├── types.ts                      # All TypeScript interfaces
├── constants.ts                  # Thresholds and algorithm config
├── docker-compose.yml
└── vercel.json
```

</details>

---

## Troubleshooting

<details>
<summary><b>BGE-M3 fails with a torch.load vulnerability error</b></summary>

```bash
pip install 'transformers<4.50'
```

</details>

<details>
<summary><b>BGE-M3 fails with a NumPy 2.x compatibility error</b></summary>

```bash
pip install "numpy<2"
pip install tf-keras
```

</details>

<details>
<summary><b>Ollama shows "Offline" in the config panel</b></summary>

1. Confirm Ollama is running: `ollama serve`
2. Use the dev server (`npm run dev`), not a built bundle
3. `OLLAMA_ORIGINS` does not need to be set manually — the Vite proxy handles CORS

</details>

<details>
<summary><b>Scores are unexpectedly low on non-English inputs</b></summary>

Check the **Embedding Tier** badge in the participant details panel. If it shows `tfidf`, start the BGE-M3 server to unlock multilingual semantic accuracy. The **Bias Attribution** badge will also flag this automatically as an *Embedding Gap*.

</details>

<details>
<summary><b>Gemini model dropdown shows a text field instead of a list</b></summary>

The model list is fetched after key validation. Wait a moment after entering your key and look for the "✓ Browser key active" indicator. If it does not populate, verify the key at [Google AI Studio](https://aistudio.google.com).

</details>

<details>
<summary><b>Facilitation Co-Pilot returns template output instead of an LLM plan</b></summary>

This happens when the LLM response cannot be parsed as structured JSON. The rule-based fallback always produces a complete plan. For structured LLM output, use Gemini 2.0 Flash or a Groq Llama-3 model.

</details>

---

## Contributing

Contributions are welcome. Open an issue before submitting large changes.

- **License:** [GNU AGPL v3.0](LICENSE)
- **Author:** Sachit Mahajan — [sachitmahajan90@gmail.com](mailto:sachitmahajan90@gmail.com)
