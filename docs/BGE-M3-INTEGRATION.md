# BGE-M3 Integration Guide

## Overview

[BGE-M3](https://huggingface.co/BAAI/bge-m3) is a state-of-the-art multilingual embedding model from BAAI. It is integrated into the Co-Creation Provenance Lab as the **primary embedding source**. When the embedding server is running, the tool auto-detects it and uses BGE-M3 for all embeddings.

## Architecture

```
Text Generation:   Ollama (default) or Gemini (API key)
Embeddings:        BGE-M3 → Ollama → Gemini → Local TF-IDF
```

BGE-M3 is used **only for embeddings**, not text generation. The tool checks for BGE-M3 at startup and uses it automatically if available.

## Setup

### 1. Install Python dependencies

```bash
pip install sentence-transformers flask flask-cors
```

If you encounter a torch version error (`CVE-2025-32434`), pin transformers:

```bash
pip install 'transformers<4.50'
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

In the config panel, you will see: **"BGE-M3 embeddings active (state-of-the-art)"**

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

BGE-M3 produces 1024-dimensional dense embeddings with state-of-the-art semantic understanding. Compared to fallback options:

| Embedding Source | Scoring Formula | Quality |
|-----------------|-----------------|---------|
| BGE-M3 | `similarity × 0.8 + concept_overlap × 0.2` | Best — captures semantics, syntax, context |
| Ollama/Gemini | `similarity × 0.8 + concept_overlap × 0.2` | Good — quality varies by specific model |
| Local TF-IDF | `(similarity + concept_overlap) / 2` | Basic — bag-of-words only, no semantic understanding |

## References

- Chen, J., Xiao, S., Zhang, P., Luo, K., Lian, D., & Liu, Z. (2024). [BGE M3-Embedding: Multi-Lingual, Multi-Functionality, Multi-Granularity Text Embeddings Through Self-Knowledge Distillation](https://arxiv.org/abs/2402.03216). *arXiv*.
- [Hugging Face Model Card](https://huggingface.co/BAAI/bge-m3)
