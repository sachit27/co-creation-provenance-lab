import { GoogleGenAI } from "@google/genai";
import type { CompletionResult } from '../types';

/**
 * Gemini Service
 *
 * Two optional modes:
 *   1. Direct BYOK mode uses @google/genai with a browser-entered key.
 *   2. A separately self-hosted deployment may expose secured /api/gemini-*
 *      relays. The public GitHub Pages build does not provide these routes.
 */

// Client-side key from build-time env (local dev only via vite.config.ts)
const buildTimeKey = process.env.API_KEY || '';

export const DEFAULT_GEMINI_GENERATION_MODEL = 'gemini-3.7-flash';
export const DEFAULT_GEMINI_EMBEDDING_MODEL = 'gemini-embedding-001';

// Runtime key entered by the user in the UI — stored in sessionStorage so it
// is never persisted beyond the current browser tab.
const RUNTIME_KEY_STORAGE = 'cprov_gemini_key';

export const setRuntimeGeminiKey = (key: string): void => {
  if (key.trim()) {
    sessionStorage.setItem(RUNTIME_KEY_STORAGE, key.trim());
  } else {
    sessionStorage.removeItem(RUNTIME_KEY_STORAGE);
  }
  // Note: proxyAvailable is intentionally NOT reset here. A self-hosted proxy
  // doesn't use the user's API key — it runs server-side. Resetting on every
  // keystroke would cause a 3-second timeout delay before each model fetch.
};

const getApiKey = (): string =>
  sessionStorage.getItem(RUNTIME_KEY_STORAGE) || buildTimeKey;

const hasRuntimeKey = (): boolean => !!sessionStorage.getItem(RUNTIME_KEY_STORAGE);

// Build a fresh client each time so it picks up any runtime key change
const getAI = (): GoogleGenAI | null => {
  const key = getApiKey();
  return key ? new GoogleGenAI({ apiKey: key }) : null;
};

// Cache proxy availability check
let proxyAvailable: boolean | null = null;

const checkProxy = async (): Promise<boolean> => {
  // If the user has provided their own key in the UI, we skip the proxy
  // check entirely to ensure their key is used and to save a network roundtrip.
  if (hasRuntimeKey()) return false;

  // A static production bundle has no same-origin API routes. Self-hosted
  // production deployments can opt in when they actually provide the relay.
  const proxyConfigured = import.meta.env?.DEV === true || import.meta.env?.VITE_GEMINI_PROXY_ENABLED === 'true';
  if (!proxyConfigured) {
    proxyAvailable = false;
    return false;
  }

  if (proxyAvailable !== null) return proxyAvailable;
  try {
    const res = await fetch('/api/gemini-health', { signal: AbortSignal.timeout(3000) });
    if (res.ok) {
      const data = await res.json();
      proxyAvailable = data.available === true;
    } else {
      proxyAvailable = false;
    }
  } catch {
    proxyAvailable = false;
  }
  return proxyAvailable;
};

export interface GeminiModelLists {
  generation: string[];
  embedding: string[];
}

export const getGeminiModels = async (): Promise<GeminiModelLists> => {
  const empty: GeminiModelLists = { generation: [], embedding: [] };

  // 1. Try direct SDK first if a runtime or build-time key is available.
  // This ensures that local dev and users with their own keys skip the proxy.
  const ai = getAI();
  if (ai) {
    try {
      const generation: string[] = [];
      const embedding: string[] = [];
      const pager = await ai.models.list({ config: { pageSize: 100 } });
      for await (const m of pager) {
        const id = m.name?.replace('models/', '') || '';
        if (!id) continue;
        const methods: string[] = (m as any).supportedGenerationMethods || [];
        const isGen = methods.length > 0
          ? methods.includes('generateContent')
          : /^gemini-/.test(id) && !id.includes('embed');
        const isEmbed = methods.length > 0
          ? methods.includes('embedContent')
          : /embed/i.test(id);
        if (isGen) generation.push(id);
        if (isEmbed) embedding.push(id);
      }
      if (generation.length > 0) return { generation, embedding };
    } catch (err) {
      console.warn('Direct SDK model list failed', err);
    }
  }

  // 2. Fall back to an optional self-hosted proxy.
  try {
    if (await checkProxy()) {
      const res = await fetch('/api/gemini-models', { signal: AbortSignal.timeout(10000) });
      if (res.ok) {
        const data = await res.json();
        return {
          generation: data.generation || [],
          embedding: data.embedding || [],
        };
      }
    }
  } catch {
    console.warn('Gemini proxy models fetch failed');
  }

  return empty;
};

export const checkAIConnection = async (): Promise<boolean> => {
  // If user has a key, verify it works with a lightweight API call
  const key = getApiKey();
  if (key) {
    try {
      const ai = getAI();
      if (ai) {
        // Lightweight API call to verify the key is valid
        await ai.models.list();
        return true;
      }
    } catch {
      // Key exists but is invalid or network is down
      console.warn('[Gemini] API key verification failed');
      return false;
    }
  }
  // Otherwise check if a proxy is serving a server-side key
  return await checkProxy();
};

const prepareEmbeddingInput = (text: string, model: string): string =>
  model === 'gemini-embedding-2' ? `task: sentence similarity | query: ${text}` : text;

const normalizeEmbedding = (values: number[]): number[] => {
  const norm = Math.sqrt(values.reduce((sum, value) => sum + value * value, 0));
  return norm > 0 ? values.map(value => value / norm) : values;
};

export const generateEmbedding = async (text: string, model: string = DEFAULT_GEMINI_EMBEDDING_MODEL): Promise<number[]> => {
  try {
    const preparedText = prepareEmbeddingInput(text, model);
    const embedConfig = model === 'gemini-embedding-001'
      ? { taskType: 'SEMANTIC_SIMILARITY', outputDimensionality: 768 }
      : { outputDimensionality: 768 };
    // 1. Try direct SDK first (local dev / runtime key)
    const ai = getAI();
    if (ai && hasRuntimeKey()) {
      const response = await ai.models.embedContent({
        model,
        contents: { role: 'user', parts: [{ text: preparedText }] },
        config: embedConfig,
      });
      return normalizeEmbedding(response.embeddings?.[0]?.values || []);
    }

    // 2. Fall back to proxy
    if (await checkProxy()) {
      const res = await fetch('/api/gemini-embed', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text, model }),
        signal: AbortSignal.timeout(60_000),
      });
      if (res.ok) {
        const data = await res.json();
        return normalizeEmbedding(data.values || []);
      }
      console.warn('Gemini proxy embed failed');
    }

    // 3. Final fallback: local SDK with buildTimeKey if no runtime key was present
    if (ai && !hasRuntimeKey()) {
      const response = await ai.models.embedContent({
        model,
        contents: { role: 'user', parts: [{ text: preparedText }] },
        config: embedConfig,
      });
      return normalizeEmbedding(response.embeddings?.[0]?.values || []);
    }

    // Fallback: return a zero vector. Dimension must match the requested model.
    // The configured Gemini output dimensionality is 768. The caller treats a
    // zero vector as failure and atomically recomputes the complete vector space.
    const fallbackDim = 768;
    return new Array(fallbackDim).fill(0);
  } catch (error) {
    console.warn(`Gemini Embedding Error for text: "${text.substring(0, 20)}..."`, error);
    const fallbackDim = 768;
    return new Array(fallbackDim).fill(0);
  }
};

/** Returns true for HTTP 429 / quota-exhausted errors from any provider. */
const isQuotaError = (status?: number, body?: string): boolean => {
  if (status === 429) return true;
  const text = (body || '').toLowerCase();
  return text.includes('quota') || text.includes('resource_exhausted') ||
    text.includes('resource exhausted') || text.includes('rate limit') ||
    text.includes('ratelimit') || text.includes('too many requests');
};

export const generateCompletionResult = async (
  prompt: string,
  systemInstruction?: string,
  model: string = DEFAULT_GEMINI_GENERATION_MODEL,
  temperature: number = 0.5,
  signal?: AbortSignal,
): Promise<CompletionResult> => {
  const supportsTemperature = !/^gemini-3\.7(?:-|$)/.test(model);
  const generationConfig = supportsTemperature
    ? { systemInstruction, temperature, abortSignal: signal }
    : { systemInstruction, abortSignal: signal };
  try {
    // 1. Try direct SDK first (prioritize user's own key)
    const ai = getAI();
    if (ai && hasRuntimeKey()) {
      const response = await ai.models.generateContent({
        model,
        contents: { role: 'user', parts: [{ text: prompt }] },
        config: generationConfig,
      });
      const text = response.text || '';
      if (!text) {
        const raw = response as any;
        const finishReason = raw.candidates?.[0]?.finishReason ?? 'no_text';
        const error = new Error(`Gemini returned no text (finish reason: ${finishReason}).`) as Error & { completionMetadata?: CompletionResult['metadata'] };
        error.completionMetadata = {
          provider: 'gemini', requestedModel: model, returnedModel: raw.modelVersion,
          responseId: raw.responseId, createdAt: new Date().toISOString(),
          finishReason, refusal: String(finishReason),
          effectiveParameters: { temperature: supportsTemperature ? temperature : null },
        };
        throw error;
      }
      const raw = response as any;
      const candidate = raw.candidates?.[0];
      return {
        text,
        metadata: {
          provider: 'gemini', requestedModel: model,
          returnedModel: raw.modelVersion,
          responseId: raw.responseId,
          createdAt: new Date().toISOString(),
          finishReason: candidate?.finishReason,
          usage: raw.usageMetadata ? {
            inputTokens: raw.usageMetadata.promptTokenCount,
            outputTokens: raw.usageMetadata.candidatesTokenCount,
            totalTokens: raw.usageMetadata.totalTokenCount,
          } : undefined,
          effectiveParameters: { temperature: supportsTemperature ? temperature : null },
        },
      };
    }

    // 2. Fall back to proxy
    if (await checkProxy()) {
      const res = await fetch('/api/gemini-complete', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompt, systemInstruction, model, ...(supportsTemperature ? { temperature } : {}) }),
        signal: signal ?? AbortSignal.timeout(120_000),
      });
      if (res.ok) {
        const data = await res.json();
        if (!data.text) throw new Error(`Gemini proxy returned no text${data.finishReason ? ` (finish reason: ${data.finishReason})` : ''}.`);
        return {
          text: data.text,
          metadata: {
            provider: 'gemini', requestedModel: model,
            returnedModel: data.modelVersion,
            responseId: data.responseId,
            requestId: res.headers.get('x-request-id') || undefined,
            createdAt: new Date().toISOString(),
            finishReason: data.finishReason,
            usage: data.usageMetadata ? {
              inputTokens: data.usageMetadata.promptTokenCount,
              outputTokens: data.usageMetadata.candidatesTokenCount,
              totalTokens: data.usageMetadata.totalTokenCount,
            } : undefined,
            effectiveParameters: { temperature: supportsTemperature ? temperature : null, maxOutputTokens: 8192 },
          },
        };
      }
      const errBody = await res.text().catch(() => '');
      if (res.status === 422) {
        let failure: any = {};
        try { failure = JSON.parse(errBody); } catch { /* retain opaque body */ }
        const finishReason = failure.finishReason ?? 'no_text';
        const error = new Error(`Gemini proxy returned no text (finish reason: ${finishReason}).`) as Error & { completionMetadata?: CompletionResult['metadata'] };
        error.completionMetadata = {
          provider: 'gemini', requestedModel: model,
          requestId: res.headers.get('x-request-id') || undefined,
          createdAt: new Date().toISOString(), finishReason, refusal: String(finishReason),
          effectiveParameters: { temperature: supportsTemperature ? temperature : null, maxOutputTokens: 8192 },
        };
        throw error;
      }
      if (isQuotaError(res.status, errBody)) {
        throw new Error('[QUOTA] Gemini API quota exhausted. Try again later, switch to Groq (free), or use a different API key.');
      }
      console.warn('Gemini proxy complete failed');
    }

    // 3. Final fallback: local SDK with buildTimeKey if no runtime key was present
    if (ai && !hasRuntimeKey()) {
      const response = await ai.models.generateContent({
        model,
        contents: { role: 'user', parts: [{ text: prompt }] },
        config: generationConfig,
      });
      const text = response.text || '';
      if (!text) {
        const raw = response as any;
        const finishReason = raw.candidates?.[0]?.finishReason ?? 'no_text';
        const error = new Error(`Gemini returned no text (finish reason: ${finishReason}).`) as Error & { completionMetadata?: CompletionResult['metadata'] };
        error.completionMetadata = {
          provider: 'gemini', requestedModel: model, returnedModel: raw.modelVersion,
          responseId: raw.responseId, createdAt: new Date().toISOString(),
          finishReason, refusal: String(finishReason),
          effectiveParameters: { temperature: supportsTemperature ? temperature : null },
        };
        throw error;
      }
      const raw = response as any;
      const candidate = raw.candidates?.[0];
      return {
        text,
        metadata: {
          provider: 'gemini', requestedModel: model,
          returnedModel: raw.modelVersion,
          responseId: raw.responseId,
          createdAt: new Date().toISOString(),
          finishReason: candidate?.finishReason,
          usage: raw.usageMetadata ? {
            inputTokens: raw.usageMetadata.promptTokenCount,
            outputTokens: raw.usageMetadata.candidatesTokenCount,
            totalTokens: raw.usageMetadata.totalTokenCount,
          } : undefined,
          effectiveParameters: { temperature: supportsTemperature ? temperature : null },
        },
      };
    }

    throw new Error('No Gemini backend available');
  } catch (error: any) {
    // Re-throw quota errors with clear prefix so the UI can show a specific message
    if (error?.message?.startsWith('[QUOTA]')) throw error;
    const msg = String(error?.message || error);
    if (isQuotaError(error?.status, msg)) {
      throw new Error('[QUOTA] Gemini API quota exhausted. Try again later, switch to Groq (free), or use a different API key.');
    }
    console.error('Gemini Completion Error:', error);
    throw error;
  }
};

export const generateCompletion = async (...args: Parameters<typeof generateCompletionResult>): Promise<string> =>
  (await generateCompletionResult(...args)).text;
