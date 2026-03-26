<div align="center">

<img src="main.png" alt="Provenance Lab — dashboard screenshot" width="100%">

<br/>

# 🔬 Provenance Lab

### *Trace every claim. Question every summary. Trust nothing unverified.*

<br/>

[![Try it live](https://img.shields.io/badge/🚀_Try_it_live-co--creation--provenance--tool.vercel.app-blue?style=for-the-badge)](https://co-creation-provenance-tool.vercel.app)

<br/>

[![License: AGPL v3](https://img.shields.io/badge/License-AGPL%20v3-blue.svg)](https://www.gnu.org/licenses/agpl-3.0)
[![React 18](https://img.shields.io/badge/React-18-61DAFB?logo=react&logoColor=black)](#)
[![TypeScript](https://img.shields.io/badge/TypeScript-5-3178C6?logo=typescript&logoColor=white)](#)
[![Vite](https://img.shields.io/badge/Vite-5-646CFF?logo=vite&logoColor=white)](#)
[![PRs Welcome](https://img.shields.io/badge/PRs-welcome-brightgreen.svg)](#contributing)

[The Problem](#-the-problem) · [Use Cases](#-use-cases) · [How It Works](#-how-it-works) · [Analysis Engine](#-analysis-engine) · [Dashboard](#-interactive-dashboard) · [Quick Start](#-quick-start) · [Methodology](#-methodology)

</div>

---

## 🎯 The Problem

Every day, LLMs summarize legal depositions, financial filings, medical records, and public consultations. These summaries shape decisions — but **synthesis is never neutral**.

- An AI summarizing a whistleblower complaint may **sanitize** the most damaging allegations into bland corporate language
- A 10-K summary may **extrapolate** forward-looking guidance that the original filing never stated
- A clinical trial digest may **abstract** a specific adverse event ("3 patients experienced cardiac arrest") into a vague category ("some cardiovascular events were noted")

**These transformations are invisible to the reader.** Provenance Lab makes them visible.

It is an open-source auditing engine that sits between your source documents and any LLM-generated summary, producing a complete **provenance trail** that traces every claim back to its origin, classifies every epistemological leap, and quantifies what was preserved, distorted, or dropped.

---

## 🌍 Use Cases

| Domain | What gets audited | What the tool catches |
|:---|:---|:---|
| **⚖️ Legal & Arbitration** | Witness depositions, expert reports, internal communications | Claims sanitized into neutral phrasing; liability language softened; whistleblower allegations dropped |
| **📊 Financial Analysis** | 10-K filings, earnings transcripts, audit reports | Risk factors omitted; forward-guidance hallucinated; quantitative claims rounded or abstracted |
| **🏥 Clinical Governance** | Trial reports, adverse event logs, regulatory submissions | Specific adverse events genericized; dosage details dropped; statistical significance misrepresented |
| **🏛️ Policy & Civic** | Public consultations, stakeholder surveys, community input | Minority perspectives flattened; dissenting voices excluded; consensus artificially manufactured |
| **🎓 Academic Research** | Systematic reviews, literature surveys, interview transcripts | Citation provenance broken; methodological caveats dropped; conflicting findings merged |

---

## ⚙️ How It Works

```
┌─────────────────────────────────────────────────────────────────────┐
│  1. INGEST — Upload your source material                            │
│     ├── 📄 Multi-Document Upload (.txt/.md files per slot)          │
│     ├── 📑 Single Document with Section-Aware Chunking              │
│     │     (auto-detects ITEM 1A, § 3.1, Article IV, etc.)           │
│     └── 📊 CSV/Spreadsheet (structured participant data)            │
├─────────────────────────────────────────────────────────────────────┤
│  2. CONFIGURE — Select Domain Intelligence                          │
│     ├── 6 Domain Presets: Legal · Finance · Clinical · Policy ·     │
│     │     Academic · Media                                          │
│     └── Custom domain context with free-text bias hints             │
├─────────────────────────────────────────────────────────────────────┤
│  3. SUMMARIZE — Generate or paste a summary                        │
│     ├── AI-generated (GPT-4o, Gemini, Claude, Llama, etc.)         │
│     ├── Paste your own (from any source)                            │
│     └── Extractive (no API key needed)                              │
├─────────────────────────────────────────────────────────────────────┤
│  4. AUDIT — Full provenance analysis runs automatically             │
│     ├── Epistemic classification of every summary sentence          │
│     ├── Language fidelity tracking (preserved / softened / dropped) │
│     ├── Claim-level source attribution with evidence mapping        │
│     ├── Tension & contradiction mapping across sources              │
│     ├── Root-cause bias diagnosis for underrepresented voices       │
│     ├── Blind spot detection via centrality × representation        │
│     ├── Anomaly & gaming detection (near-duplicate inputs)          │
│     └── W3C PROV-O JSON-LD certificate export                      │
└─────────────────────────────────────────────────────────────────────┘
```

> **Privacy-first**: All analysis runs in-browser. No data leaves your machine unless you opt into a cloud LLM provider.

---

## 🔬 Analysis Engine

### Epistemic Classification

Every summary sentence is labeled with an **Epistemic Class** — a measure of how grounded the claim is in the actual source material:

| Class | Label | Meaning |
|:---|:---|:---|
| 🟢 | **Explicit** | Directly stated in or closely paraphrases source text |
| 🔵 | **Inferred** | Reasonable derivation or synthesis from source evidence |
| 🟠 | **Extrapolated** | Logical leap beyond direct evidence; assumes unstated facts |
| 🟣 | **Speculative** | Unverifiable claim, prediction, or hallucination without source grounding |

### Language Fidelity Tracking

The engine compares original language against summary language at the phrase level:

| Transformation | What happened |
|:---|:---|
| ✅ **Preserved** | Language kept faithfully |
| 🟡 **Softened** | Topic retained but emotional intensity reduced |
| 🔴 **Sanitized** | Accusation or demand replaced with neutral framing |
| 🟣 **Abstracted** | Concrete experience replaced with abstract category |
| ⬛ **Dropped** | Key concept absent from the summary entirely |

### Claim-Level Attribution

Each summary claim is traced to specific source segments with hybrid evidence scoring (semantic similarity + concept overlap + keyword matching). Claims are flagged as **Supported**, **Partially Supported**, **Unsupported**, or **Contradicted**.

### Tension & Contradiction Mapping

When source documents disagree — whether across groups or within the same group — the engine detects genuine points of opposition and tracks whether the summary **acknowledged**, **suppressed**, **merged**, or **distorted** each disagreement. Tensions are aggregated at the cluster level to reveal systematic patterns.

### Root-Cause Bias Diagnosis

For every underrepresented input, the tool diagnoses *why*:

| Label | Cause |
|:---|:---|
| 🌍 Embedding Gap | Multilingual failure — non-Latin script fell back to TF-IDF |
| 👤 Unique Voice | Content genuinely distinct; LLM had no basis to include it |
| ❌ Summariser Bias | LLM ignored semantically relevant input |
| 🗣️ Phrasing Mismatch | Same idea expressed in non-standard language |

### Anomaly & Gaming Detection

Detects near-duplicate and copy-paste submissions using locality-sensitive hashing, flagging coordinated inputs that could skew representation scores.

### Rhetorical Influence Analysis

Measures whether communication style (assertive vs. hedged language) correlates with representation — surfacing cases where *how* something is said matters more than *what* is said.

### Summary Revision Engine

One-click revision that re-generates the summary with explicit instructions to incorporate underrepresented voices, then re-scores representation to measure improvement.

### Facilitation Co-Pilot

Generates actionable follow-up plans: gap briefs for facilitators, targeted follow-up questions for underrepresented themes, and structured workshop exercises to address blind spots.

### Participant Verification

Exports individualized verification pages so each participant can confirm whether their voice was faithfully represented — closing the loop between analysis and ground truth.

---

## 📊 Interactive Dashboard

The dashboard provides **16+ specialized views** organized into four analysis layers:

### Semantic Analysis
| View | Description |
|:---|:---|
| **Semantic Space** | 2D PCA projection of all inputs — outliers indicate distinct perspectives |
| **Blind Spot Analysis** | Centrality vs. Representation scatterplot with quadrant classification |
| **Similarity Network** | Mutual k-NN force-directed graph — structurally isolated nodes are unique voices |
| **Knowledge Graph** | Entity-relationship graph with community detection |

### Provenance Tracking
| View | Description |
|:---|:---|
| **Contribution Lineage** | Sankey-style flow from inputs → themes → summary sentences |
| **Provenance Flow** | Information flow visualization with dropped themes and unsourced sentences highlighted |
| **Language Fidelity** | Per-sentence transformation audit with epistemic profile and stacked bar chart |
| **Claim Attribution** | Each summary claim traced to source evidence with support classification |
| **Tension Mapping** | How contradictions between and within source groups were handled in the summary |
| **Rhetorical Influence** | Does communication style correlate with representation? |

### Statistical Analysis
| View | Description |
|:---|:---|
| **Equity Distribution** | Sorted representation scores — a flat line indicates equal coverage |
| **Semantic Leverage (LOO)** | Leave-one-out analysis — which inputs pull the semantic center the most |
| **Group Equity** | Representation comparison across stakeholder groups |
| **Uncertainty Analysis** | Bootstrap confidence intervals (95% CI) for key metrics |

### Additional Tools
| View | Description |
|:---|:---|
| **Strategy Comparison** | Side-by-side comparison of different summarization strategies |
| **Citation Trail** | Click any summary sentence to trace its provenance to source inputs |
| **Facilitation Co-Pilot** | AI-generated follow-up plans, questions, and workshop exercises |
| **Summary Revision** | Re-generate the summary to improve representation equity |

---

## 🚀 Quick Start

**Prerequisites:** Node.js 18+

```bash
git clone https://github.com/sachit27/co-creation-provenance-lab.git
cd co-creation-provenance-lab
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000). Works immediately with built-in demo data and local TF-IDF embeddings — no API key required.

<details>
<summary><b>🐳 Docker</b></summary>

```bash
docker compose up
```

Or on Mac/Linux:

```bash
chmod +x start.sh && ./start.sh
```

</details>

<details>
<summary><b>🌐 BGE-M3 — recommended for multilingual datasets</b></summary>

BGE-M3 (1024-dim, multilingual SOTA) significantly improves accuracy on non-English inputs. Runs locally — no API key required.

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
<summary><b>🔒 Ollama — fully local, fully private</b></summary>

```bash
ollama pull llama3.2:3b       # text generation (fast)
ollama pull nomic-embed-text  # embeddings
ollama serve
```

No data leaves your machine. CORS is handled automatically by the Vite dev proxy.

</details>

---

## 🤖 AI Providers

| Provider | Generation | Embeddings | Privacy |
|:---|:---|:---|:---|
| **BGE-M3** | — | ✅ 1024-dim SOTA | 🟢 Local |
| **Google Gemini** | ✅ | ✅ `text-embedding-004` | ☁️ Cloud |
| **OpenAI** | ✅ GPT-4o, GPT-4.1 | ✅ `text-embedding-3-small` | ☁️ Cloud |
| **Claude** | ✅ Claude 4 Sonnet/Opus | ❌ (fallback) | ☁️ Cloud |
| **Groq** | ✅ Llama 3, Gemma 2 | ❌ (fallback) | ☁️ Cloud |
| **Ollama** | ✅ Any local model | ✅ Any local model | 🟢 Local |
| **TF-IDF** | — | ✅ Always available | 🟢 Local |

**Embedding priority (automatic):** `BGE-M3 → Ollama → Gemini → Local TF-IDF`

The system selects the best available tier at startup. All AI features route through a unified completion layer — choose a provider once, and every feature uses it consistently.

### API Keys

| Method | How | Persists |
|:---|:---|:---|
| `.env` file | `GEMINI_API_KEY=AIza...` | ✅ Yes |
| Config panel | Paste in browser UI | Session only |

Keys entered in the browser are stored in `sessionStorage` only. Server-side proxies never expose your key in client code.

---

## 📐 Methodology

<details>
<summary><b>Representation Score</b></summary>

Each input's score combines two signals:

**1. Embedding similarity** — cosine similarity between the input vector and each summary sentence vector, with exponential decay on secondary matches:

$$S_{embed} = \cos(e_p, e_{s_1}) + \gamma \cdot \cos(e_p, e_{s_2}) + \gamma^2 \cdot \cos(e_p, e_{s_3}) + \ldots \quad (\gamma = 0.3)$$

The decay factor prevents double-counting when multiple sentences paraphrase the same point. Inspired by coverage-aware scoring in multi-document summarisation (Radev et al., 2004).

**2. Concept overlap** — stemmed keyword intersection normalised by source keyword count (RAKE extraction).

**Final score:**
- Neural embeddings: `0.8 × embedding_sim + 0.2 × concept_overlap`
- TF-IDF fallback: `0.5 × embedding_sim + 0.5 × concept_overlap`

</details>

<details>
<summary><b>Equity Metrics</b></summary>

| Metric | Formula | Interpretation |
|:---|:---|:---|
| Gini | Lorenz curve area | 0 = perfect equality; 1 = full concentration |
| Coverage uniformity | 1 − Gini | Higher = more even |
| Distinct gap | mean_rep(mainstream) − mean_rep(top 25% most isolated) | Smaller = fairer |
| LOO sensitivity | Z-score of Δ centroid when input *i* removed | Identifies dominant voices |

Gini thresholds: Low < 0.2 ≤ Moderate < 0.35 ≤ High

</details>

<details>
<summary><b>Clustering & Visualization</b></summary>

- **Clustering:** K-Means++ with automatic K via elbow method
- **Projection:** PCA via power iteration — no browser-side ML library dependency
- **Similarity network:** Mutual k-nearest neighbors graph. An edge exists iff both nodes rank each other in their top-k. The mutual requirement produces sparse, high-confidence connections.
- **Bootstrap CIs:** 200-sample resampling of Gini, mean representation, and equity gap

</details>

<details>
<summary><b>Reproducibility</b></summary>

All stochastic algorithms (PCA initialization, K-Means++ seeding, bootstrap sampling) use a deterministic seeded PRNG derived from the input data. The same dataset produces identical results across runs — no random variation between analyses.

</details>

<details>
<summary><b>Staged Analysis Execution</b></summary>

For responsiveness with large datasets, analysis runs in two phases:

- **Phase 1** (immediate): embeddings, clustering, summary generation, representation scoring — dashboard renders as soon as this completes
- **Phase 2** (background): concept fidelity analysis, claim attribution, tension mapping — tabs populate progressively

A generation counter prevents stale state if a new analysis is started before Phase 2 finishes.

</details>

---

## 📄 License & Contributing

Contributions are welcome. Open an issue before submitting large changes.

- **License:** [GNU AGPL v3.0](LICENSE)
- **Author:** Sachit Mahajan — [sachitmahajan90@gmail.com](mailto:sachitmahajan90@gmail.com)
