# Co-Creation Provenance Lab

![Co-Creation Provenance Lab](main.png)

A tool for auditing how AI-generated summaries represent diverse participant inputs in co-creation processes. It measures whether every voice is captured fairly, identifies blind spots and at-risk participants, and provides actionable recommendations for more inclusive summarization.

## What It Does

- **Representation scoring** — measures how well each participant's input is reflected in the final AI summary (semantic similarity + concept overlap)
- **Blind spot detection** — identifies unique voices that were missed
- **Equity metrics** — Gini coefficient, distinct representation gap, and coverage uniformity
- **Language equity** — flags when non-English inputs are systematically underrepresented
- **Interactive revision editor** — manually edit or AI-generate a revised summary and compare before/after metrics
- **LOO sensitivity analysis** — Leave-One-Out testing shows which inputs most influence the summary
- **Counterfactual suggestions** — edit hints telling the facilitator exactly how to revise the summary
- **W3C PROV-O export** — download a machine-readable audit certificate (JSON-LD)
- **Participant verification** — download a standalone HTML page for participants to verify their representation

---

## AI Providers

The tool supports three AI providers. You can switch between them in the configuration panel.

| Provider | Summary Generation | Embeddings | Setup |
|---|---|---|---|
| **Google Gemini** ☁️ | ✅ Cloud (via proxy on Vercel) | ✅ text-embedding-004 | API key (free at [ai.google.dev](https://aistudio.google.com)) |
| **Groq** ⚡ | ✅ Llama 3, Gemma 2, Mixtral | ❌ Falls back to TF-IDF / BGE-M3 | Free API key at [console.groq.com](https://console.groq.com) |
| **Ollama** 💻 | ✅ Any local model | ✅ all-minilm or any embed model | Local install, 100% private |

### Embedding Fallback Chain

Embeddings are used to compute representation scores. The tool tries each tier in order:

| Priority | Model | Quality | Requirement |
|---|---|---|---|
| 1 | **BGE-M3** (BAAI) | State-of-the-art, multilingual | `python embedding_server.py` |
| 2 | **Ollama** embeddings | Good | `ollama pull all-minilm` |
| 3 | **Gemini** text-embedding-004 | Good | Gemini API key |
| 4 | **Local TF-IDF** | Basic (always available) | Nothing — automatic fallback |

---

## Quick Start (Local Development)

### Prerequisites

- Node.js v18+
- Python 3.10+ (optional, for BGE-M3 embedding server)
- Ollama (optional, for local LLM)

### 1. Install dependencies

```bash
npm install
```

### 2. (Optional) Start the BGE-M3 embedding server

```bash
pip install sentence-transformers flask flask-cors
python embedding_server.py
```

> On first run, BGE-M3 downloads ~2 GB of model weights. This only happens once.
> If you get a `torch.load` / CVE-2025-32434 error: `pip install 'transformers<4.50'`

### 3. (Optional) Start Ollama

```bash
ollama pull qwen3:30b-instruct        # generation model
ollama pull all-minilm:latest         # embedding fallback
OLLAMA_ORIGINS="*" ollama serve
```

> `OLLAMA_ORIGINS="*"` is handled automatically via the Vite dev proxy — you no longer need to set it manually when using `npm run dev`.

### 4. Start the dev server

```bash
npm run dev
```

Open `http://localhost:3000`.

### 5. Set API keys (optional)

You can set API keys either via environment variables **or** directly in the browser UI:

**Option A — Environment variable** (persists across sessions):
```bash
# .env (local dev only — never committed)
GEMINI_API_KEY=AIza...
GROQ_API_KEY=gsk_...
```

**Option B — Browser UI** (stored in sessionStorage, cleared when tab closes):
Select your provider in the configuration panel and paste the key into the API key field that appears. No server ever receives this key.

---

## Vercel Deployment

The app is designed to deploy to Vercel with zero client-side key exposure.

### Environment variables to set in Vercel

| Variable | Purpose |
|---|---|
| `GEMINI_API_KEY` | Used **server-side** by the `/api/gemini-*` serverless functions. Users do not need to enter a key — Gemini works out of the box on the deployed app. |
| `GROQ_API_KEY` | ⚠️ Currently no server-side Groq proxy exists. Users must enter their own free Groq key in the browser UI. This variable is not used in production builds. |

### How the Gemini proxy works

Four Vercel serverless functions handle all Gemini requests server-side:

```
/api/gemini-health    → health check (used to detect proxy availability)
/api/gemini-models    → list available models
/api/gemini-embed     → generate embeddings
/api/gemini-complete  → generate text completions
```

The browser never sees the `GEMINI_API_KEY`. In local development, the SDK falls back to the key in `.env`.

---

## One-Command Docker Setup

To run the full stack (BGE-M3 + frontend) with Docker:

```bash
docker compose up
```

Or use the startup script on Mac/Linux:

```bash
chmod +x start.sh && ./start.sh
```

---

## Usage

1. **Load data** — Use the sample dataset, paste inputs, or upload a CSV (`id`, `text`, optional `group` columns)
2. **Choose provider** — Gemini (cloud), Groq (free cloud), or Ollama (local)
3. **Configure** — Pick summarization strategy (Balanced / Diversity / Consensus) and model
4. **Run analysis** — AI generates a summary; the tool scores every participant's representation
5. **Review dashboard** — Overall score, at-risk participants, blind spots, language equity alerts
6. **Revise summary** — Click "Revise Summary" to open the interactive editor:
   - Edit the summary manually in the textarea
   - Click **✨ Generate AI Draft** to get an AI-assisted starting point
   - Click **Apply & Compare** to recompute scores and see before/after metrics
7. **Export** — Download the HTML report, W3C PROV-O audit certificate, or participant verification page

---

## Architecture

```
Browser
  │
  ├── /api/ollama/*  ──proxy──▶  http://localhost:11434  (Ollama, local dev)
  │
  ├── /api/gemini-* ──proxy──▶  Vercel serverless functions
  │                              └── GEMINI_API_KEY (server-side only)
  │
  └── https://api.groq.com  ◀── direct fetch (user's own key, sessionStorage)

Embedding pipeline (auto-selected, best available):
  BGE-M3 (localhost:5001) → Ollama → Gemini → Local TF-IDF
```

---

## Project Structure

```
co-creation-provenance-lab/
├── embedding_server.py              # BGE-M3 Python embedding server
├── api/
│   ├── gemini-health.ts             # Vercel: proxy health check
│   ├── gemini-models.ts             # Vercel: list Gemini models
│   ├── gemini-embed.ts              # Vercel: generate embeddings
│   └── gemini-complete.ts           # Vercel: generate completions
├── services/
│   ├── analysis.ts                  # Core analysis pipeline
│   ├── gemini.ts                    # Gemini client (proxy + direct SDK)
│   ├── groq.ts                      # Groq client (free tier, OpenAI-compatible)
│   ├── ollama.ts                    # Ollama client (via Vite dev proxy)
│   ├── bgeM3.ts                     # BGE-M3 embedding client
│   ├── summaryRevision.ts           # Interactive summary revision + score recomputation
│   ├── provenanceExport.ts          # W3C PROV-O JSON-LD certificate export
│   ├── participantVerification.ts   # Standalone HTML verification page
│   ├── languageDetection.ts         # Unicode script detection + language equity analysis
│   ├── counterfactual.ts            # Facilitator-focused edit hints
│   ├── reportExport.ts              # HTML report export
│   └── vectorizer.ts                # Local TF-IDF fallback embeddings
├── components/
│   ├── ui/
│   │   ├── ConfigPanel.tsx          # 3-provider config + browser API key entry
│   │   ├── ExecutiveSummary.tsx     # Top-level audit scorecard
│   │   ├── BeforeAfterComparison.tsx # Revision impact metrics
│   │   ├── CounterfactualPanel.tsx  # Summary edit hints
│   │   └── MissedPerspectives.tsx   # Missed voices panel
│   └── visualizations/
│       ├── SemanticMap.tsx          # 2D semantic space plot
│       ├── BlindSpotPlot.tsx        # Centrality vs. representation quadrant
│       ├── RepresentationBar.tsx    # Per-participant score bars
│       ├── SensitivityChart.tsx     # LOO sensitivity chart
│       ├── ConceptDistortion.tsx    # Concept fidelity visualization
│       ├── GroupEquityChart.tsx     # Stakeholder group equity
│       └── UncertaintyViz.tsx       # Bootstrap confidence intervals
├── types.ts                         # TypeScript interfaces
├── constants.ts                     # Thresholds and analysis config
├── vite.config.ts                   # Dev proxy (Ollama + Gemini health)
├── docker-compose.yml               # Full-stack Docker setup
├── start.sh                         # Mac/Linux one-command startup
└── vercel.json                      # Vercel routing config
```

---

## Troubleshooting

**BGE-M3 torch error on startup:**
```
ValueError: Due to a serious vulnerability issue in torch.load...
```
Fix: `pip install 'transformers<4.50'`

**Ollama shows "Offline" in the config panel:**
The Vite dev proxy handles Ollama CORS automatically. Make sure Ollama is running (`ollama serve`) and you're using `npm run dev`. No need to set `OLLAMA_ORIGINS`.

**Gemini model dropdown shows a text box instead of a dropdown:**
The model list is fetched automatically after you enter your API key. If the dropdown doesn't appear, check that your key is valid (the key field shows "✓ Browser key active" when connected).

**"No underrepresented participants to incorporate" when generating AI draft:**
This has been fixed. The revision now uses a tiered threshold — if all participants score above 0.5, it targets those below the 0.6 representation target; if all are above 0.6, it targets the bottom quartile.

**Tone Distortion shows "negative but matched sentence is negative":**
This has been fixed. Tone distortion now only checks the primary (highest-similarity) matched sentence, not secondary weak matches.

**Scores seem low:**
Check which embedding tier is active in the Details Panel (shown per participant). BGE-M3 produces the most reliable scores. Local TF-IDF produces lower absolute scores due to sparse vector representation.

---

## License

[GNU Affero General Public License v3.0 (AGPL-3.0)](LICENSE)

## Author

**Sachit Mahajan** — [sachitmahajan90@gmail.com](mailto:sachitmahajan90@gmail.com)
