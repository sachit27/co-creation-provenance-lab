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

/** Normalize raw host input by stripping trailing slashes and ensuring a protocol scheme. */
export const normalizeOllamaHost = (rawHost: string): string => {
  let trimmed = rawHost.trim().replace(/\/$/, '');
  if (!trimmed || trimmed === VITE_PROXY_HOST) return trimmed;
  if (!/^https?:\/\//i.test(trimmed)) {
    trimmed = `http://${trimmed}`;
  }
  return trimmed;
};

/** Returns the currently active Ollama host URL.
 *  Falls back to the Vite dev proxy if the user hasn't set a custom host. */
const getOllamaHost = (): string => {
  const stored = sessionStorage.getItem(OLLAMA_HOST_STORAGE);
  if (!stored) return VITE_PROXY_HOST;
  return normalizeOllamaHost(stored);
};

/** Set a custom Ollama host URL (e.g. http://localhost:11434 for hosted users).
 *  Pass an empty string to reset to the Vite proxy default. */
export const setOllamaHost = (host: string): void => {
  const normalized = normalizeOllamaHost(host);
  if (normalized && normalized !== VITE_PROXY_HOST) {
    sessionStorage.setItem(OLLAMA_HOST_STORAGE, normalized);
  } else {
    sessionStorage.removeItem(OLLAMA_HOST_STORAGE);
  }
};

export const getOllamaHostUrl = (): string => getOllamaHost();

/** Returns true if using the default Vite proxy (local dev mode). */
export const isUsingViteProxy = (): boolean =>
  !sessionStorage.getItem(OLLAMA_HOST_STORAGE);

export type OllamaConnectionCode =
  | 'connected'
  | 'static-proxy-unavailable'
  | 'invalid-url'
  | 'insecure-remote-host'
  | 'browser-permission-denied'
  | 'http-error'
  | 'timeout'
  | 'unreachable-or-blocked';

export interface OllamaConnectionDiagnostic {
  connected: boolean;
  code: OllamaConnectionCode;
  host: string;
  message: string;
  httpStatus?: number;
  models: string[];
}

interface OllamaTagModel {
  name?: unknown;
  remote_host?: unknown;
}

/** Cloud-backed tags send prompts outside the configured Ollama host. They are
 * excluded from the provider presented as Local Ollama. `remote_host` is the
 * authoritative signal; the suffix check covers older catalog responses. */
export const isOllamaCloudModel = (model: string): boolean =>
  /(?:[:_-]cloud)$/i.test(model.trim());

export const parseLocalOllamaModelNames = (payload: unknown): string[] => {
  if (typeof payload !== 'object' || payload === null || !('models' in payload)) return [];
  const models = (payload as { models?: unknown }).models;
  if (!Array.isArray(models)) return [];

  return models.flatMap((entry: unknown) => {
    if (typeof entry !== 'object' || entry === null) return [];
    const model = entry as OllamaTagModel;
    const name = typeof model.name === 'string' ? model.name.trim() : '';
    const hasRemoteHost = typeof model.remote_host === 'string' && model.remote_host.trim().length > 0;
    return name && !hasRemoteHost && !isOllamaCloudModel(name) ? [name] : [];
  });
};

const browserOrigin = (): string =>
  typeof window === 'undefined' ? '' : window.location.origin;

const isLoopbackHostname = (hostname: string): boolean =>
  hostname === 'localhost' || hostname === '127.0.0.1' || hostname === '[::1]' || hostname.endsWith('.localhost');

const isTimeoutError = (error: unknown): boolean =>
  error instanceof DOMException && error.name === 'TimeoutError';

const isChromiumBrowser = (): boolean =>
  typeof navigator !== 'undefined' && /(?:Chrome|Chromium|CriOS)\//.test(navigator.userAgent || '');

type LocalNetworkPermissionState = PermissionState | 'unsupported';

/** Read Chrome's Local Network Access permission without prompting. Chrome
 * 145 split loopback access from access to the wider local network, while the
 * older name remains an alias. Other browsers currently reject these names. */
const getLoopbackPermissionState = async (): Promise<LocalNetworkPermissionState> => {
  if (typeof navigator === 'undefined' || !navigator.permissions?.query) return 'unsupported';

  for (const name of ['loopback-network', 'local-network-access'] as const) {
    try {
      const status = await navigator.permissions.query({ name } as unknown as PermissionDescriptor);
      return status.state;
    } catch {
      // Try the compatibility name before declaring the API unsupported.
    }
  }
  return 'unsupported';
};

class LoopbackPermissionDeniedError extends Error {
  constructor() {
    super('Browser loopback permission denied');
    this.name = 'LoopbackPermissionDeniedError';
  }
}

/**
 * Fetch a loopback endpoint with the Local Network Access hint where supported.
 * Safari 26.2–26.3 throws before sending requests containing
 * `targetAddressSpace: "loopback"` (WebKit bug 304164). A single retry without
 * the hint preserves Safari compatibility. Other network and CORS failures
 * still fail closed because the ordinary fetch must independently succeed.
 */
const fetchOllamaTags = async (host: string, isLoopback: boolean): Promise<Response> => {
  const url = `${host}/api/tags`;
  const request: RequestInit & { targetAddressSpace?: 'loopback' | 'local' } = {
    method: 'GET',
    signal: AbortSignal.timeout(5000),
  };
  if (isLoopback) request.targetAddressSpace = 'loopback';

  try {
    return await fetch(url, request);
  } catch (error) {
    if (!isLoopback || isTimeoutError(error)) throw error;
    // A denied Chrome LNA request must not be retried. The retry cannot bypass
    // browser permission and only adds a second misleading console failure.
    if (await getLoopbackPermissionState() === 'denied' || isChromiumBrowser()) {
      throw new LoopbackPermissionDeniedError();
    }
    return fetch(url, {
      method: 'GET',
      signal: AbortSignal.timeout(5000),
    });
  }
};

/**
 * Diagnose whether this browser can reach the configured Ollama API.
 * A running Ollama process is not sufficient: static hosted pages also need a
 * browser-reachable URL, an allowed Origin, and any required local-network
 * permission. Network and CORS failures are intentionally grouped because
 * Fetch exposes both as an opaque TypeError.
 */
export const diagnoseOllamaConnection = async (
  isDevelopment: boolean = import.meta.env?.DEV === true,
): Promise<OllamaConnectionDiagnostic> => {
  const host = getOllamaHost();
  const origin = browserOrigin();
  if (host === VITE_PROXY_HOST && !isDevelopment) {
    return {
      connected: false,
      code: 'static-proxy-unavailable',
      host,
      message: 'This static page has no Ollama proxy. Enter the Ollama URL that this browser can reach, then select Test connection.',
      models: [],
    };
  }

  let parsedHost: URL;
  try {
    parsedHost = host === VITE_PROXY_HOST ? new URL(host, origin) : new URL(host);
  } catch {
    return { connected: false, code: 'invalid-url', host, message: 'Enter a complete valid Ollama URL (e.g. http://localhost:11434).', models: [] };
  }
  const isLoopback = host !== VITE_PROXY_HOST && isLoopbackHostname(parsedHost.hostname);
  if (origin.startsWith('https:') && parsedHost.protocol === 'http:' && !isLoopback) {
    return {
      connected: false,
      code: 'insecure-remote-host',
      host,
      message: 'An HTTPS page cannot call an insecure remote HTTP host. Use an authenticated HTTPS reverse proxy or tunnel.',
      models: [],
    };
  }

  try {
    const response = await fetchOllamaTags(host, isLoopback);
    if (!response.ok) {
      return {
        connected: false,
        code: 'http-error',
        host,
        httpStatus: response.status,
        message: `The browser reached Ollama, but /api/tags returned HTTP ${response.status}.`,
        models: [],
      };
    }
    const payload = await response.json().catch(() => ({}));
    const models = parseLocalOllamaModelNames(payload);
    return {
      connected: true,
      code: 'connected',
      host,
      message: `Connected${models.length ? `; ${models.length} local model${models.length === 1 ? '' : 's'} found` : '; no local models were reported'}.`,
      models,
    };
  } catch (error) {
    if (error instanceof LoopbackPermissionDeniedError) {
      return {
        connected: false,
        code: 'browser-permission-denied',
        host,
        message: `Chrome has blocked or has not granted loopback access for ${origin || 'this site'}. Open the site controls beside the address bar, choose Site settings, and select Reset permissions. Reload the page, select Test connection, and choose Allow when Chrome asks about loopback or local-network access. If it is already allowed, confirm that OLLAMA_ORIGINS includes ${origin || 'this site'} exactly.`,
        models: [],
      };
    }
    const timedOut = isTimeoutError(error);
    const originAdvice = origin ? ` Allow the exact origin ${origin} in OLLAMA_ORIGINS.` : '';
    const reachability = isLoopback
      ? 'localhost means the computer running this browser. If Ollama is on another machine, create a local SSH tunnel first.'
      : 'Confirm that the URL is reachable from this browser and protected appropriately.';
    const message = timedOut
      ? `The connection to ${host} timed out after 5 seconds. ${reachability}`
      : `The browser received no usable response. ${reachability}${originAdvice} A browser local-network permission or CORS policy may also be blocking access.`;

    return {
      connected: false,
      code: timedOut ? 'timeout' : 'unreachable-or-blocked',
      host,
      message,
      models: [],
    };
  }
};

export const checkOllamaConnection = async (): Promise<boolean> =>
  (await diagnoseOllamaConnection()).connected;

export const getOllamaModels = async (): Promise<string[]> => {
  try {
    const response = await fetch(`${getOllamaHost()}/api/tags`, {
      signal: AbortSignal.timeout(5000),
    });
    if (!response.ok) return [];
    const data = await response.json();
    return parseLocalOllamaModelNames(data);
  } catch (e) {
    console.warn("Failed to fetch Ollama models", e);
    return [];
  }
};

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
