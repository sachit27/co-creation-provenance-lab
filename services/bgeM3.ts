/**
 * BGE-M3 Embedding Service
 *
 * Connects to a local Python server running BGE-M3 (BAAI/bge-m3),
 * a state-of-the-art multilingual embedding model.
 *
 * Setup: See docs/BGE-M3-INTEGRATION.md
 *
 * The server exposes:
 *   GET  /health  → { status: 'ok', model: '...' }
 *   POST /embed   → { embeddings: number[][] }
 */

const BGE_M3_HOST = 'http://localhost:5001';

let connectionChecked = false;
let isAvailable = false;

/**
 * Check if the BGE-M3 Python server is running.
 * Result is cached after first check to avoid repeated requests.
 */
export const checkBgeM3Connection = async (): Promise<boolean> => {
  if (connectionChecked) return isAvailable;

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 2000);

    const response = await fetch(`${BGE_M3_HOST}/health`, {
      signal: controller.signal
    });
    clearTimeout(timeout);

    isAvailable = response.ok;
    connectionChecked = true;
    if (isAvailable) {
      console.log('[BGE-M3] Server detected and available');
    }
    return isAvailable;
  } catch {
    connectionChecked = true;
    isAvailable = false;
    return false;
  }
};

/**
 * Reset connection cache (e.g., if user starts the server mid-session).
 */
export const resetBgeM3Cache = () => {
  connectionChecked = false;
  isAvailable = false;
};

/**
 * Generate embedding for a single text using BGE-M3.
 */
export const generateBgeM3Embedding = async (text: string): Promise<number[]> => {
  const response = await fetch(`${BGE_M3_HOST}/embed`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ text })
  });

  if (!response.ok) {
    throw new Error(`BGE-M3 embedding failed: ${response.statusText}`);
  }

  const data = await response.json();
  return data.embeddings[0];
};

/**
 * Generate embeddings for multiple texts in a single batch request.
 * More efficient than calling generateBgeM3Embedding in a loop.
 */
export const generateBgeM3EmbeddingsBatch = async (texts: string[]): Promise<number[][]> => {
  const response = await fetch(`${BGE_M3_HOST}/embed`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ text: texts })
  });

  if (!response.ok) {
    throw new Error(`BGE-M3 batch embedding failed: ${response.statusText}`);
  }

  const data = await response.json();
  return data.embeddings;
};
