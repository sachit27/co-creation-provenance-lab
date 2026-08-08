import { GoogleGenAI } from "@google/genai";

/**
 * Gemini Service
 *
 * Two modes:
 *   1. Proxy mode (deployed on Vercel) — calls /api/gemini-* serverless functions.
 *      API key stays server-side, never exposed to the browser.
 *   2. Direct mode (local dev) — uses @google/genai SDK with client-side env var.
 *      Only used when proxy is unavailable (e.g., running npm run dev locally).
 */

// Client-side key from build-time env (local dev only via vite.config.ts)
const buildTimeKey = process.env.API_KEY || '';

// Runtime key entered by the user in the UI — stored in sessionStorage so it
// is never persisted beyond the current browser tab.
const RUNTIME_KEY_STORAGE = 'cprov_gemini_key';

export const setRuntimeGeminiKey = (key: string): void => {
  if (key.trim()) {
    sessionStorage.setItem(RUNTIME_KEY_STORAGE, key.trim());
  } else {
    sessionStorage.removeItem(RUNTIME_KEY_STORAGE);
  }
  // Note: proxyAvailable is intentionally NOT reset here. The Vercel proxy
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

  // 2. Fall back to proxy (deployed mode with server-side key)
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

export const generateEmbedding = async (text: string, model: string = 'text-embedding-004'): Promise<number[]> => {
  try {
    // 1. Try direct SDK first (local dev / runtime key)
    const ai = getAI();
    if (ai && hasRuntimeKey()) {
      const response = await ai.models.embedContent({
        model,
        contents: { role: 'user', parts: [{ text }] },
      });
      return response.embeddings?.[0]?.values || [];
    }

    // 2. Fall back to proxy
    if (await checkProxy()) {
      const res = await fetch('/api/gemini-embed', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text, model }),
      });
      if (res.ok) {
        const data = await res.json();
        return data.values || [];
      }
      console.warn('Gemini proxy embed failed');
    }

    // 3. Final fallback: local SDK with buildTimeKey if no runtime key was present
    if (ai && !hasRuntimeKey()) {
      const response = await ai.models.embedContent({
        model,
        contents: { role: 'user', parts: [{ text }] },
      });
      return response.embeddings?.[0]?.values || [];
    }

    // Fallback: return a zero vector. Dimension must match the requested model.
    // text-embedding-004 = 768, other models may differ. The caller should
    // handle zero vectors as failed embeddings (via the embeddingFailed flag).
    const fallbackDim = model.includes('text-embedding-3') ? 1536 : 768;
    return new Array(fallbackDim).fill(0);
  } catch (error) {
    console.warn(`Gemini Embedding Error for text: "${text.substring(0, 20)}..."`, error);
    const fallbackDim = model.includes('text-embedding-3') ? 1536 : 768;
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

export const generateCompletion = async (
  prompt: string,
  systemInstruction?: string,
  model: string = 'gemini-2.0-flash'
): Promise<string> => {
  try {
    // 1. Try direct SDK first (prioritize user's own key)
    const ai = getAI();
    if (ai && hasRuntimeKey()) {
      const response = await ai.models.generateContent({
        model,
        contents: { role: 'user', parts: [{ text: prompt }] },
        config: { systemInstruction, temperature: 0.5 },
      });
      return response.text || '';
    }

    // 2. Fall back to proxy
    if (await checkProxy()) {
      const res = await fetch('/api/gemini-complete', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompt, systemInstruction, model }),
      });
      if (res.ok) {
        const data = await res.json();
        return data.text || '';
      }
      const errBody = await res.text().catch(() => '');
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
        config: { systemInstruction, temperature: 0.5 },
      });
      return response.text || '';
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
