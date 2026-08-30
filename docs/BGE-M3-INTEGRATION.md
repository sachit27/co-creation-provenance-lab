# BGE-M3 Integration Guide

## Overview

[BGE-M3](https://huggingface.co/BAAI/bge-m3) is a published multilingual dense-embedding model from BAAI. It is an optional embedding source. When its local server is available, the setup screen can select it; the run manifest records whether it was actually used or whether the run fell back.

## Architecture

```
Text generation:   User-selected provider, extractive algorithm, or external/manual summary
Embeddings:        User-selected BGE-M3, provider embedding model, Ollama, or local TF-IDF
```

BGE-M3 is used **only for embeddings**, not text generation. The setup screen checks availability and lets the user select it; the documented fallback order applies only when the selected method fails.

## Setup

### 1. Install Python dependencies

```bash
pip install -r requirements-embedding.txt
```

### 2. Start the server

```bash
python embedding_server.py
```

First run downloads ~2GB of model weights (cached for subsequent runs). Wait for:

```
Model loaded and ready!
Embedding server running at http://localhost:5001
```

### 3. Verify

```bash
curl http://localhost:5001/health
# → {"model":"BAAI/bge-m3","status":"ok"}
```

### 4. Run the app

```bash
npm run dev
```

In the config panel, you will see whether the BGE-M3 service is available and which embedding method is selected.

## How It Works

The `embedding_server.py` file runs a Flask server on port 5001 with two endpoints:

| Endpoint | Method | Purpose |
|----------|--------|---------|
| `/health` | GET | Returns `{"status": "ok", "model": "BAAI/bge-m3"}` |
| `/embed` | POST | Accepts `{"text": "string or [array]"}`, returns `{"embeddings": [[...]]}` |

The app's `bgeM3.ts` service checks `/health` at startup. If BGE-M3 is available, all embedding requests route through it. Otherwise, the app falls back to the next available provider.

### Batch Embedding

For efficiency, the analysis pipeline sends all texts in a single batch request rather than one-by-one:

```json
POST /embed
{"text": ["participant 1 text", "participant 2 text", "..."]}
```

This is significantly faster than individual requests, especially on CPU.

## Hardware Requirements

| Setup | RAM | Speed |
|-------|-----|-------|
| CPU only | 8GB+ | ~1 sec/text |
| GPU (CUDA) | 4GB VRAM | ~50ms/text |
| Apple Silicon | 8GB unified | ~200ms/text |

## Lighter Alternatives

If BGE-M3 is too heavy for your hardware, edit `embedding_server.py` to use a smaller model:

```python
# Lighter English-only option (~90MB)
model = SentenceTransformer('all-MiniLM-L6-v2')

# Lighter multilingual option (~470MB)
model = SentenceTransformer('paraphrase-multilingual-MiniLM-L12-v2')
```

The server API remains the same — no other code changes are needed.

## Impact on Scoring

BGE-M3 produces 1024-dimensional dense embeddings. The app applies the same strongest-summary-sentence cosine retrieval indicator to every embedding space, but numeric scores are not directly comparable across models or with TF-IDF:

| Embedding Source | Scoring Formula | Interpretation boundary |
|-----------------|-----------------|-------------------------|
| BGE-M3 | `max_k max(0, cosine(source, summary_sentence_k))` | Multilingual dense retrieval; validate on the target language/domain |
| Provider/Ollama dense model | Same | Capabilities and score distribution depend on the exact model |
| Local TF-IDF | Same cosine calculation in its sparse space | Lexical baseline with separately calibrated display bands |

## References

- Chen, J., Xiao, S., Zhang, P., Luo, K., Lian, D., & Liu, Z. (2024). [BGE M3-Embedding: Multi-Lingual, Multi-Functionality, Multi-Granularity Text Embeddings Through Self-Knowledge Distillation](https://arxiv.org/abs/2402.03216). *arXiv*.
- [Hugging Face Model Card](https://huggingface.co/BAAI/bge-m3)
