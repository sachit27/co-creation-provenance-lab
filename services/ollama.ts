/**
 * Ollama Service
 *
 * Supports both local and remote Ollama instances:
 *
 * ── Local development (npm run dev) ─────────────────────────────────────────
 * The Vite dev server proxies /api/ollama → http://localhost:11434.
 * This avoids CORS issues because the browser talks to the same origin.
 *
 * ── Static or other production host ─────────────────────────────────────────
 * The Vite proxy does NOT exist in production. Requests to /api/ollama would
 * 404. Instead, the user must provide their Ollama host URL directly
 * (e.g., http://localhost:11434 with CORS enabled, or a tunneled URL via
 * Cloudflare Tunnel / ngrok).
 *
 * Enable CORS on Ollama:
 * Configure an origin-specific allowlist for the web app, or place Ollama
 * behind an authenticated reverse proxy. Do not expose an unauthenticated
 * Ollama service through a public tunnel or wildcard origin.
 *
 * The runtime host is stored in sessionStorage and defaults to the Vite proxy
 * path (/api/ollama) so local dev works with zero configuration.
 */

import type { CompletionResult } from '../types';

const VITE_PROXY_HOST = '/api/ollama';
const OLLAMA_HOST_STORAGE = 'cprov_ollama_host';

/** Returns the currently active Ollama host URL.
 *  Falls back to the Vite dev proxy if the user hasn't set a custom host. */
const getOllamaHost = (): string =>
  sessionStorage.getItem(OLLAMA_HOST_STORAGE) || VITE_PROXY_HOST;

/** Set a custom Ollama host URL (e.g. http://localhost:11434 for hosted users).
 *  Pass an empty string to reset to the Vite proxy default. */
export const setOllamaHost = (host: string): void => {
  const trimmed = host.trim().replace(/\/$/, ''); // remove trailing slash
  if (trimmed) {
    sessionStorage.setItem(OLLAMA_HOST_STORAGE, trimmed);
  } else {
    sessionStorage.removeItem(OLLAMA_HOST_STORAGE);
  }
};

export const getOllamaHostUrl = (): string => getOllamaHost();

/** Returns true if using the default Vite proxy (local dev mode). */
export const isUsingViteProxy = (): boolean =>
  !sessionStorage.getItem(OLLAMA_HOST_STORAGE);

export const checkOllamaConnection = async (): Promise<boolean> => {
  try {
    const response = await fetch(`${getOllamaHost()}/api/tags`, {
      method: 'GET',
      headers: { 'Content-Type': 'application/json' },
      signal: AbortSignal.timeout(5000), // 5s timeout to prevent hanging
    });
    return response.ok;
  } catch (e) {
    if (isUsingViteProxy()) {
      // On a static production host this path fails because the Vite proxy
      // exists only during local development.
      // Suppress the error; the UI will show the "Enter Ollama URL" prompt.
    } else {
      console.warn(
        "Ollama connection check failed. Ensure `OLLAMA_ORIGINS=\"*\" ollama serve` is running " +
        "and the URL is reachable from your browser."
      );
    }
    return false;
  }
};

export const getOllamaModels = async (): Promise<string[]> => {
  try {
    const response = await fetch(`${getOllamaHost()}/api/tags`, {
      signal: AbortSignal.timeout(5000),
    });
    if (!response.ok) return [];
    const data = await response.json();
    return data.models?.map((m: any) => m.name) || [];
  } catch (e) {
    console.warn("Failed to fetch Ollama models", e);
    return [];
  }
};

/** Cloud-tagged entries route outside the local Ollama host and are therefore
 * not offered when the user selects the local-only provider. */
export const isOllamaCloudModel = (model: string): boolean => /:cloud$/i.test(model.trim());

/** Conservative name-based capability guard for catalogs returned by /api/tags.
 * The generation endpoint remains the final authority and still fails closed. */
export const isLikelyOllamaEmbeddingModel = (model: string): boolean =>
  /(?:embedding|embed(?:-|_|:|$)|mini[-_]?lm|nomic|\bbge[-_:])/i.test(model);

export const filterOllamaCompletionModels = (models: string[]): string[] =>
  models.filter(model => !isOllamaCloudModel(model) && !isLikelyOllamaEmbeddingModel(model));

export const filterOllamaEmbeddingModels = (models: string[]): string[] =>
  models.filter(model => !isOllamaCloudModel(model) && isLikelyOllamaEmbeddingModel(model));

const OLLAMA_COMPLETION_PREFERENCE = [
  'qwen3.6:35b-a3b',
  'qwen3.6:35b',
  'nemotron-cascade-2:latest',
  'gemma4:26b',
  'qwen2.5:14b',
  'phi4:14b',
  'gemma3:12b',
  'qwen3:8b',
];

/** Put strong locally installed text models first without inventing a model
 * that is absent from the live catalog. Unranked compatible models retain the
 * server's order. */
export const rankOllamaCompletionModels = (models: string[]): string[] => {
  const compatible = filterOllamaCompletionModels(models);
  return compatible
    .map((model, originalIndex) => ({
      model,
      originalIndex,
      preference: OLLAMA_COMPLETION_PREFERENCE.indexOf(model),
    }))
    .sort((a, b) => {
      const aRank = a.preference < 0 ? Number.MAX_SAFE_INTEGER : a.preference;
      const bRank = b.preference < 0 ? Number.MAX_SAFE_INTEGER : b.preference;
      return aRank - bRank || a.originalIndex - b.originalIndex;
    })
    .map(item => item.model);
};

export const generateOllamaEmbedding = async (
  text: string,
  model: string,
  signal?: AbortSignal,
): Promise<number[]> => {
  try {
    const response = await fetch(`${getOllamaHost()}/api/embed`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model,
        input: text,
        truncate: false,
      }),
      signal: signal ?? AbortSignal.timeout(60_000),
    });

    if (!response.ok) {
      const errText = await response.text();
      throw new Error(`Ollama Embedding Failed: ${errText}`);
    }
    const data = await response.json();
    const embedding = data.embeddings?.[0];
    if (!Array.isArray(embedding) || embedding.length === 0 || embedding.some((v: unknown) => typeof v !== 'number' || !Number.isFinite(v))) {
      throw new Error('Ollama returned an invalid embedding payload. Select a model with embedding capability.');
    }
    return embedding;
  } catch (e) {
    console.error("Ollama Embedding Error:", e);
    throw e;
  }
};

export const generateOllamaCompletionResult = async (
  prompt: string,
  systemInstruction: string,
  model: string,
  temperature: number = 0.5,
  responseFormat: 'text' | 'json' | Record<string, unknown> = 'text',
  signal?: AbortSignal,
): Promise<CompletionResult> => {
  try {
    const response = await fetch(`${getOllamaHost()}/api/generate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: model,
        prompt: prompt,
        system: systemInstruction,
        stream: false,
        ...(responseFormat === 'text' ? {} : { format: responseFormat }),
        // The application consumes the public response field. Thinking-capable
        // Ollama models can otherwise place the structured answer exclusively
        // in `thinking`, leaving `response` empty and making the run unusable.
        // Keep this explicit and record it in the completion manifest.
        think: false,
        options: {
          temperature,
          top_p: 0.9,
        }
      }),
      signal: signal ?? AbortSignal.timeout(120_000),
    });

    if (!response.ok) {
      const errText = await response.text();
      throw new Error(`Ollama Generation Failed: ${errText}`);
    }
    const data = await response.json();
    if (typeof data.response !== 'string' || data.response.length === 0) {
      throw new Error('Ollama returned no completion text.');
    }
    const inputTokens = typeof data.prompt_eval_count === 'number' ? data.prompt_eval_count : undefined;
    const outputTokens = typeof data.eval_count === 'number' ? data.eval_count : undefined;
    return {
      text: data.response,
      metadata: {
        provider: 'ollama',
        requestedModel: model,
        returnedModel: typeof data.model === 'string' ? data.model : undefined,
        createdAt: typeof data.created_at === 'string' ? data.created_at : new Date().toISOString(),
        finishReason: data.done === true ? (typeof data.done_reason === 'string' ? data.done_reason : 'stop') : undefined,
        usage: inputTokens !== undefined || outputTokens !== undefined ? {
          inputTokens,
          outputTokens,
          totalTokens: (inputTokens ?? 0) + (outputTokens ?? 0),
        } : undefined,
        effectiveParameters: {
          temperature,
          topP: 0.9,
          thinking: false,
          responseFormat: typeof responseFormat === 'string' ? responseFormat : 'json-schema',
        },
      },
    };
  } catch (e) {
    console.error("Ollama Completion Error:", e);
    throw e;
  }
};

export const generateOllamaCompletion = async (...args: Parameters<typeof generateOllamaCompletionResult>): Promise<string> =>
  (await generateOllamaCompletionResult(...args)).text;
