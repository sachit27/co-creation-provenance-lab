/**
 * Ollama Service
 *
 * Supports both local and remote Ollama instances:
 *
 * ── Local development (npm run dev) ─────────────────────────────────────────
 * The Vite dev server proxies /api/ollama → http://localhost:11434.
 * This avoids CORS issues because the browser talks to the same origin.
 *
 * ── Deployed on Vercel (or any CDN) ─────────────────────────────────────────
 * The Vite proxy does NOT exist in production. Requests to /api/ollama would
 * 404. Instead, the user must provide their Ollama host URL directly
 * (e.g., http://localhost:11434 with CORS enabled, or a tunneled URL via
 * Cloudflare Tunnel / ngrok).
 *
 * Enable CORS on Ollama:
 *   OLLAMA_ORIGINS="*" ollama serve
 *   or: launchctl setenv OLLAMA_ORIGINS "*" (macOS)
 *
 * The runtime host is stored in sessionStorage and defaults to the Vite proxy
 * path (/api/ollama) so local dev works with zero configuration.
 */

const VITE_PROXY_HOST = '/api/ollama';
const OLLAMA_HOST_STORAGE = 'cprov_ollama_host';

/** Returns the currently active Ollama host URL.
 *  Falls back to the Vite dev proxy if the user hasn't set a custom host. */
const getOllamaHost = (): string =>
  sessionStorage.getItem(OLLAMA_HOST_STORAGE) || VITE_PROXY_HOST;

/** Set a custom Ollama host URL (e.g. http://localhost:11434 for Vercel users).
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
      // On Vercel this path always fails — the proxy doesn't exist.
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

export const generateOllamaEmbedding = async (text: string, model: string): Promise<number[]> => {
  try {
    const response = await fetch(`${getOllamaHost()}/api/embeddings`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: model,
        prompt: text
      })
    });

    if (!response.ok) {
      const errText = await response.text();
      throw new Error(`Ollama Embedding Failed: ${errText}`);
    }
    const data = await response.json();
    return data.embedding;
  } catch (e) {
    console.error("Ollama Embedding Error:", e);
    throw e;
  }
};

export const generateOllamaCompletion = async (
  prompt: string,
  systemInstruction: string,
  model: string
): Promise<string> => {
  try {
    const response = await fetch(`${getOllamaHost()}/api/generate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: model,
        prompt: prompt,
        system: systemInstruction,
        stream: false,
        options: {
          temperature: 0.5,
          top_p: 0.9,
        }
      })
    });

    if (!response.ok) {
      const errText = await response.text();
      throw new Error(`Ollama Generation Failed: ${errText}`);
    }
    const data = await response.json();
    return data.response;
  } catch (e) {
    console.error("Ollama Completion Error:", e);
    throw e;
  }
};
