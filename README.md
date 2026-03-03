<div align="center">

<img src="main.png" alt="Co-Creation Provenance Lab dashboard screenshot" width="100%">

<br/>

# 🔬 Co-Creation Provenance Lab

### *Every voice deserves to be heard. This tool measures whether it was.*

[![License: AGPL v3](https://img.shields.io/badge/License-AGPL%20v3-blue.svg)](https://www.gnu.org/licenses/agpl-3.0)
[![React 18](https://img.shields.io/badge/React-18-61DAFB?logo=react&logoColor=black)](#)
[![TypeScript](https://img.shields.io/badge/TypeScript-5-3178C6?logo=typescript&logoColor=white)](#)
[![Vite](https://img.shields.io/badge/Vite-5-646CFF?logo=vite&logoColor=white)](#)
[![PRs Welcome](https://img.shields.io/badge/PRs-welcome-brightgreen.svg)](#)

[Overview](#-the-problem-we-solve) • [Features](#-feature-overview) • [Quick Start](#-quick-start) • [AI Providers](#-ai-providers--embedding-tiers) • [Methodology](#-methodology) • [Architecture](#-architecture) • [Troubleshooting](#-troubleshooting)

</div>

---

## 📌 The Problem We Solve

Imagine a city planning session with 80 participants — community members, urban planners, youth groups, government officials. An AI summarizes the discussion. **But does that summary actually represent all 80 people?**

Research consistently shows AI-generated summaries amplify majority voices. Minority perspectives, non-English speakers, and unconventional viewpoints are systematically flattened. This problem is near-invisible without the right tooling.

> **The Co-Creation Provenance Lab** is an open-source auditing tool that makes this invisible problem visible. It scores, diagnoses, and gives you the tools to fix it.

---

## ✨ Feature Overview

<table>
<tr>
<td width="50%">

### ⚖️ Representation Scoring
Automatically measures how well each voice is reflected in the AI-generated summary using a hybrid model combining **semantic similarity** (cosine on sentence embeddings with exponential decay) + **concept overlap** via stemmed keyword matching.

**Score interpretation:**
| Range | Meaning |
|:---|:---|
| ≥ 0.6 | ✅ Well Represented |
| 0.5 – 0.6 | 🟡 Marginal |
| 0.3 – 0.5 | 🔶 Underrepresented |
| < 0.3 | 🔴 At Risk |

</td>
<td width="50%">

### 🔍 Blind Spot Detection
A participant is flagged as a **blind spot** only when *both* conditions hold:
1. Semantic centrality is below the group median (genuine isolation)
2. Representation score is below 0.5 (genuinely underrepresented)

This avoids the common pitfall of relative definitions, which would always flag 25% of participants regardless of actual fairness.

**Equity metrics computed:**
- Gini coefficient (inequality across participants)
- Distinct representation gap
- Coverage uniformity index

</td>
</tr>
<tr>
<td>

### 🗂️ Citation Provenance Trail
Click any AI-generated summary sentence to trace it back to the exact participant inputs that constructed it, ranked by cosine similarity and graded with match-strength badges.

Provides an audit trail answering: *"Where did that sentence come from?"*

</td>
<td>

### 🧬 Root-Cause Bias Diagnosis
For any underrepresented participant (score < 0.6), the tool pinpoints the root cause:

| Badge | Cause | Meaning |
|:---|:---|:---|
| 🌍 | *Embedding Gap* | Multilingual failure — TF-IDF used for non-Latin script |
| 👤 | *Unique Voice* | Semantically isolated; content genuinely absent |
| ❌ | *Summarizer Bias* | LLM ignored semantically relevant input |
| 🗣️ | *Phrasing Mismatch* | Same idea, non-standard language |

</td>
</tr>
<tr>
<td>

### 🧭 Facilitation Co-Pilot
Generates a complete **workshop facilitation plan** targeting your specific blind spots:
- 📋 Facilitator-ready gap brief
- ❓ 5 targeted follow-up questions per underrepresented theme
- 🛠️ 3 structured workshop exercises (World Café, Fishbowl, Anonymous Voting)

Works fully offline with a rule-based fallback when LLM is unavailable.

</td>
<td>

### 🔮 What-If Simulator
Run parametric simulations to answer key facilitation decisions:
- *"What would happen to our equity score if we added 5 more youth voices?"*
- *"What if government stakeholders were given twice the representation weight?"*

Scores are bootstrapped from cluster empirical distributions (min. σ = 0.05) and displayed as directional projections.

</td>
</tr>
<tr>
<td>

### ✍️ Interactive Revision Editor
Edit the AI summary manually or click **✨ Generate AI Draft** for an AI-assisted revision that specifically targets underrepresented voices, then compare before/after equity metrics side-by-side — without re-embedding participant inputs.

</td>
<td>

### 📊 Equity & Language Fairness
- **Language equity:** Exact permutation test (10,000 draws) to verify non-English inputs are not statistically underrepresented (p < 0.05 threshold).
- **Group equity:** Per-stakeholder-group comparison with inter-group Gini.
- **Bootstrap CIs:** 200-sample resampling quantifies how sensitive reported metrics are to which participants were sampled.

</td>
</tr>
</table>

---

## 🚀 Quick Start

**Prerequisites:** Node.js v18+

```bash
# Install dependencies
npm install

# Start the development server
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) in your browser.

The tool works **out of the box with no API key** using its built-in benchmark datasets and local TF-IDF embeddings.

<details>
<summary>🐳 <b>One-command setup with Docker</b></summary>

```bash
docker compose up
```

Or the Mac/Linux startup script:

```bash
chmod +x start.sh && ./start.sh
```

</details>

<details>
<summary>🌍 <b>Enable BGE-M3 for multilingual datasets</b></summary>

BGE-M3 (1024-dim, multilingual SOTA) dramatically improves accuracy on non-English inputs:

```bash
pip install sentence-transformers flask flask-cors
python embedding_server.py
```

> **First run:** downloads ~2GB of model weights. Only needed once.
> **Torch error?** Run: `pip install 'transformers<4.50'`

</details>

<details>
<summary>💻 <b>Enable fully local / private mode with Ollama</b></summary>

```bash
ollama pull qwen3:30b-instruct    # text generation
ollama pull all-minilm:latest     # embeddings fallback
ollama serve                      # OLLAMA_ORIGINS handled automatically by the Vite proxy
```

</details>

---

## 🔑 Setting API Keys

| Method | How | Lifetime |
|:---|:---|:---|
| **Environment variable (.env)** | `GEMINI_API_KEY=AIza...` | Persists across sessions |
| **Browser UI** | Paste key in the config panel | Cleared when browser tab closes |

Keys entered via the browser are stored in `sessionStorage` only. No request is ever made to an external server with your key from the UI — Gemini is proxied server-side on Vercel.

---

## 🧠 AI Providers & Embedding Tiers

### Supported Providers

| Provider | Summary Generation | Embeddings | Notes |
|:---|:---|:---|:---|
| ☁️ **Google Gemini** | ✅ Cloud | ✅ `text-embedding-004` | Best for production; API key free at [Google AI Studio](https://aistudio.google.com) |
| ⚡ **Groq** | ✅ Cloud (Llama 3, Gemma 2, Mixtral) | ❌ Fallback only | Very fast; free key at [console.groq.com](https://console.groq.com) |
| 💻 **Ollama** | ✅ Local | ✅ `all-minilm` | 100% private; no data leaves your machine |

### Automatic Embedding Fallback

The system silently selects the best available embedding tier:

```
BGE-M3 (1024-dim, SOTA multilingual)
  └─ Ollama (configurable dim)
       └─ Gemini text-embedding-004
            └─ Local TF-IDF (150-dim, Unicode-aware WASM — always available)
```

> **Dimension safety:** The revision editor enforces dimension matching between stored participant embeddings and newly generated sentence embeddings. If a tier upgrade/downgrade occurs, participant inputs are automatically re-embedded at the matching tier before scores are computed.

---

## 📐 Methodology

<details>
<summary><b>Representation Score Calculation</b></summary>

Each participant's representation score is a weighted hybrid of:

**1. Embedding Similarity** — cosine similarity between participant input vector and each summary sentence vector:

$$S_{embed}(p, \text{summary}) = \cos(e_p, e_{s_1}) + \gamma \cdot \cos(e_p, e_{s_2}) + \gamma^2 \cdot \cos(e_p, e_{s_3}) + \ldots$$

Where γ = 0.3 (exponential decay on secondary matches).

**2. Concept Overlap** — stemmed keyword intersection normalized by participant keyword count.

**Final score:**
- Neural embeddings (BGE-M3, Gemini, Ollama): `0.8 × embedding_sim + 0.2 × concept_overlap`
- TF-IDF fallback: `0.5 × embedding_sim + 0.5 × concept_overlap`

</details>

<details>
<summary><b>Equity Metrics</b></summary>

| Metric | Formula | Interpretation |
|:---|:---|:---|
| **Gini** | Standard Lorenz curve area | 0 = perfect equality; 1 = full concentration |
| **Coverage Uniformity** | 1 - (std / mean) of scores | Higher = more even distribution |
| **Equity Gap** | mean(well-rep) - mean(at-risk) | Smaller = fairer |
| **LOO Sensitivity** | Δ(avg representation) when input i removed | Identifies dominant voices |

Gini thresholds: Low < 0.2 ≤ Moderate < 0.35 ≤ High

</details>

<details>
<summary><b>Clustering & Visualization</b></summary>

- **Algorithm:** K-Means++ initialization (Arthur & Vassilvitskii, 2007) with automatic K via Elbow method.
- **Visualization:** PCA from scratch using power iteration with deflation for 2D projection. No browser-side ML library dependency.
- **Bootstrap CIs:** Efron & Tibshirani (1993). 200-sample resampling of Gini, mean representation, and equity gap to quantify sampling variability. Does not capture model uncertainty.

</details>

---

## 🏗️ Architecture

```
Browser (Vite + React + TypeScript)
  │
  ├── /api/ollama/*  ─── dev proxy ──▶  http://localhost:11434  (local Ollama)
  │
  ├── /api/gemini-*  ─── dev proxy ──▶  Vercel Serverless Functions
  │                                      └── GEMINI_API_KEY  (server-side only, never exposed)
  │
  └── https://api.groq.com ◀── direct fetch (user-supplied key in sessionStorage)

Embedding pipeline (runtime auto-selection, best tier wins):
  BGE-M3 @ localhost:5001  →  Ollama  →  Gemini API  →  Local TF-IDF (WASM)
                                                                      ↑ always available
Performance layer:
  IndexedDB vector cache (LRU) → 100x speedup on reload
  Batched HuggingFace WASM     → offline DistilBERT inference
  Adaptive API concurrency     → respects Groq/Gemini rate limits
```

<details>
<summary>📁 <b>Full Repository Structure</b></summary>

```
co-creation-provenance-lab/
├── api/                                 # Vercel serverless (Gemini proxy)
│   ├── gemini-health.ts
│   ├── gemini-embed.ts
│   └── gemini-complete.ts
├── services/
│   ├── analysis.ts                      # Core pipeline orchestrator
│   ├── aiAnalysis.ts                    # Sentiment/concept Tier-1→2→3 fallback
│   ├── summaryRevision.ts               # Revision engine + dimension-safe re-scoring
│   ├── embeddingCache.ts                # IndexedDB LRU vector cache
│   ├── huggingface.ts                   # Batched WASM inference (DistilBERT)
│   ├── biasAttribution.ts               # Root-cause bias diagnosis
│   ├── facilitationCoPilot.ts           # LLM-powered workshop plan generator
│   ├── provenanceExport.ts              # W3C PROV-O JSON-LD export
│   └── reportExport.ts                  # HTML executive report builder
├── components/
│   ├── ui/
│   │   ├── ProvenanceTrail.tsx          # Interactive sentence citation map
│   │   ├── OnboardingOverlay.tsx        # First-time user tutorial
│   │   ├── ExecutiveSummary.tsx         # Top-level scorecard + recommendations
│   │   ├── FacilitationCoPilotPanel.tsx # Workshop plan display
│   │   └── WhatIfSimulator.tsx          # Parametric simulation UI
│   └── visualizations/
│       ├── SemanticMap.tsx              # 2D PCA semantic space
│       ├── BlindSpotPlot.tsx            # Centrality vs. score quadrant
│       ├── ConceptDistortion.tsx        # Concept fidelity waterfall
│       ├── GroupEquityChart.tsx         # Group Gini comparisons
│       └── RepresentationBar.tsx        # Per-participant horizontal bar
├── embedding_server.py                  # BGE-M3 Python HTTP service
├── types.ts                             # All TypeScript interfaces
├── constants.ts                         # Thresholds and metric config
├── vite.config.ts                       # Dev proxy + build config
├── docker-compose.yml
└── vercel.json
```

</details>

---

## 🔧 Troubleshooting

<details>
<summary><b>BGE-M3 fails with a torch.load vulnerability error</b></summary>

```
ValueError: Due to a serious vulnerability issue in torch.load...
```

Fix:
```bash
pip install 'transformers<4.50'
```

</details>

<details>
<summary><b>Ollama shows "Offline" in the config panel</b></summary>

The Vite dev proxy handles Ollama CORS automatically. Ensure:
1. Ollama is actually running: `ollama serve`
2. You are using the dev server (`npm run dev`), not a built bundle
3. You **do not** need to set `OLLAMA_ORIGINS` manually

</details>

<details>
<summary><b>Gemini model dropdown shows a text input instead of a list</b></summary>

The model list is fetched dynamically after your key is validated. Wait a moment after entering the key and watch for the "✓ Browser key active" indicator. If it doesn't populate, verify the key at [Google AI Studio](https://aistudio.google.com).

</details>

<details>
<summary><b>Scores are unexpectedly low on non-English participant inputs</b></summary>

Check the **Embedding Tier** badge in the Details Panel:
- If it shows `tfidf`, start the BGE-M3 embedding server to unlock multilingual semantic accuracy.
- The **Bias Attribution** badge will also automatically flag this as an *Embedding Gap*.

</details>

<details>
<summary><b>Drastic score drop when revising the summary</b></summary>

This can happen when the embedding tier changes between the original analysis and the revision (e.g., BGE-M3 → TF-IDF), causing a dimension mismatch in cosine similarity. 

The revision engine now **detects and corrects this automatically** by re-embedding participant inputs at the fallback tier before computing scores. If you still see unexpected drops, re-run the full analysis to re-establish a consistent embedding baseline.

</details>

<details>
<summary><b>Facilitation Co-Pilot returns template-based output instead of an LLM plan</b></summary>

This happens when the LLM response cannot be parsed as structured JSON. The rule-based fallback is intentional and always produces a complete plan. For structured LLM output, use **Gemini 2.0 Flash** or a **Groq Llama-3** model.

</details>

---

## 📬 Contributing & License

- **License:** [GNU AGPL v3.0](LICENSE) — use freely, share improvements.  
- **Author:** Sachit Mahajan — [sachitmahajan90@gmail.com](mailto:sachitmahajan90@gmail.com)
- **PRs welcome** — open an issue first for large changes.
