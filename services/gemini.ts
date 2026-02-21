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

// Build a fresh client each time so it picks up any runtime key change
const getAI = (): GoogleGenAI | null => {
  const key = getApiKey();
  return key ? new GoogleGenAI({ apiKey: key }) : null;
};

// Cache proxy availability check
let proxyAvailable: boolean | null = null;

const checkProxy = async (): Promise<boolean> => {
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

  // Try proxy first (deployed mode)
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
    console.warn('Gemini proxy models fetch failed, trying direct SDK');
  }

  // Fall back to direct SDK (local dev / runtime key)
  const ai = getAI();
  if (ai) {
    try {
      const generation: string[] = [];
      const embedding: string[] = [];
      const pager = await ai.models.list({ config: { pageSize: 100 } });
      for await (const m of pager) {
        const id = m.name?.replace('models/', '') || '';
        if (!id) continue;
        // The newer @google/genai SDK doesn't expose supportedGenerationMethods
        // on the Model type — fall back to name-based detection when the field
        // is absent (it's still present at runtime on some SDK versions).
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
      return { generation, embedding };
    } catch (err) {
      console.warn('Direct SDK model list failed', err);
    }
  }

  return empty;
};

export const checkAIConnection = async (): Promise<boolean> => {
  // Check proxy first (deployed mode)
  const proxy = await checkProxy();
  if (proxy) return true;
  // Fall back to runtime or build-time key
  return !!getApiKey();
};

export const generateEmbedding = async (text: string, model: string = 'text-embedding-004'): Promise<number[]> => {
  try {
    // Try proxy first
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
      console.warn('Gemini proxy embed failed, trying direct SDK');
    }

    // Fall back to direct SDK (local dev / runtime key)
    const ai = getAI();
    if (ai) {
      const response = await ai.models.embedContent({
        model,
        contents: { role: 'user', parts: [{ text }] },
      });
      return response.embeddings?.[0]?.values || [];
    }

    return new Array(768).fill(0);
  } catch (error) {
    console.warn(`Gemini Embedding Error for text: "${text.substring(0, 20)}..."`, error);
    return new Array(768).fill(0);
  }
};

export const generateCompletion = async (
  prompt: string,
  systemInstruction?: string,
  model: string = 'gemini-2.0-flash'
): Promise<string> => {
  try {
    // Try proxy first
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
      console.warn('Gemini proxy complete failed, trying direct SDK');
    }

    // Fall back to direct SDK (local dev / runtime key)
    const ai = getAI();
    if (ai) {
      const response = await ai.models.generateContent({
        model,
        contents: { role: 'user', parts: [{ text: prompt }] },
        config: { systemInstruction, temperature: 0.5 },
      });
      return response.text || '';
    }

    throw new Error('No Gemini backend available');
  } catch (error) {
    console.error('Gemini Completion Error:', error);
    throw error;
  }
};
