# Provider endpoint audit

Checked against official documentation on 2026-10-30. Endpoint paths, request contracts, model discovery, and error handling were reviewed; regression tests use mocked HTTP responses. **No credentialed provider calls were made**, so this does not certify account access, model availability, billing, quotas, browser CORS, or live uptime.

| Provider | Upstream endpoints used | Official reference |
| --- | --- | --- |
| OpenAI | `https://api.openai.com/v1/models`, `/v1/chat/completions`, `/v1/embeddings` | [Chat Completions](https://developers.openai.com/api/reference/resources/chat/subresources/completions/methods/create), [embeddings](https://developers.openai.com/api/reference/resources/embeddings/methods/create) |
| Gemini | SDK / REST at `https://generativelanguage.googleapis.com/v1beta/models`; model-specific `:generateContent` and `:embedContent` | [Models and pagination](https://ai.google.dev/api/models), [generation](https://ai.google.dev/api/generate-content), [embeddings](https://ai.google.dev/api/embeddings), [JavaScript model capabilities](https://googleapis.github.io/js-genai/release_docs/interfaces/types.Model.html) |
| Groq | `https://api.groq.com/openai/v1/models`, `/openai/v1/chat/completions` | [API reference](https://console.groq.com/docs/api-reference), [available models](https://console.groq.com/docs/models) |
| Claude | `https://api.anthropic.com/v1/models`, `/v1/messages` | [Models](https://platform.claude.com/docs/en/api/models/list), [Messages](https://platform.claude.com/docs/en/api/messages/create) |
| Apertus / PublicAI | `https://api.publicai.co/v1/models`, `/v1/chat/completions` | [PublicAI endpoint reference](https://platform.publicai.co/api/~endpoints) |
| Ollama | Configured host, normally `http://localhost:11434`, with `/api/tags`, `/api/generate`, `/api/embed` | [Models](https://docs.ollama.com/api/tags), [generation](https://docs.ollama.com/api/generate), [embeddings](https://docs.ollama.com/api/embed) |
| BGE-M3 | Project-owned local server at `http://localhost:5001/health` and `/embed` | Contract implemented by `embedding_server.py`; underlying model is [BAAI/bge-m3](https://huggingface.co/BAAI/bge-m3). These are application routes, not a hosted BAAI API. |

## Corrections and compatibility

- Optional Gemini relays follow model-list pagination and concatenate visible response text while excluding thought parts.
- Gemini SDK discovery now uses `supportedActions`, the SDK representation of REST `supportedGenerationMethods`; specialized model names no longer override explicit API capabilities.
- GPT-6 and o-series selections use reasoning-compatible Chat Completions arguments. [OpenAI's current guide](https://developers.openai.com/api/docs/guides/latest-model) documents the sampling restrictions; existing inexpensive model selections remain supported.
- Claude 4.7+ and Fable requests omit sampling parameters rejected by those models. The adapter retains API version `2023-06-01` to preserve older-model temperature behavior; this remains an intentional compatibility choice under the [official migration guidance](https://platform.claude.com/docs/en/api/migration-2026-10-21).
- Gemini 3.7/3.8 and 4 requests omit explicit temperature. The existing `gemini-3.7-flash` default remains callable: Google [documents](https://ai.google.dev/gemini-api/docs/deprecations) that it automatically routes to 3.8 Flash and is not shutting down. `gemini-embedding-001` remains supported until its documented 2028 retirement.
- Groq's fallback contains documented production GPT-OSS models; the older unlisted Qwen fallback was removed. Live discovery remains authoritative.
- Ollama diagnostics correctly resolve the relative development proxy; static hosting still requires a browser-reachable custom Ollama host.
- Adapter errors omit upstream error bodies and sanitize credential echoes in structured refusal messages.

## Browser and deployment boundaries

The public static build has no API server. OpenAI, Gemini, Groq, and Claude use browser-entered session keys for direct calls. Browser/network policy and provider account permissions still apply. Claude explicitly sends `anthropic-dangerous-direct-browser-access: true`; direct access necessarily makes the user's key available to their browser runtime.

Vite development maps `/api/ollama/*` to local Ollama and `/api/apertus/*` to PublicAI `/v1/*`. PublicAI requires a client `User-Agent`; the Vite proxy and optional serverless relays add it server-side. A custom PublicAI base needs a compatible browser-accessible gateway.

Optional `/api/gemini-*` and `/api/apertus-*` serverless handlers are for separately configured server deployments. Vite does not automatically run those serverless files, and GitHub Pages does not host them. Shared Gemini relay access is disabled unless an operator enables and secures it. Local BGE-M3 and custom Ollama endpoints need browser reachability and the appropriate origin permissions.
