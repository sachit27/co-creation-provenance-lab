/**
 * Embedding Cache
 *
 * In-memory cache for embedding vectors. Persists for the lifetime of the
 * browser session (until page refresh). This means re-running the analysis
 * with the same inputs — e.g. changing strategy or summarization mode —
 * skips re-embedding and returns results immediately.
 *
 * Key: djb2 hash of (modelKey + ":" + text).
 * The model key is REQUIRED to prevent returning vectors from a different
 * embedding model — different models produce incomparable vector spaces.
 * Value: embedding vector (number[]).
 */

// djb2 hash — fast, good distribution for short-to-medium strings
const hashText = (text: string): string => {
  let h = 5381;
  for (let i = 0; i < text.length; i++) {
    h = ((h << 5) + h) ^ text.charCodeAt(i);
    h = h & h; // keep 32-bit
  }
  return h.toString(36);
};

const cache = new Map<string, number[]>();
let hits = 0;
let misses = 0;

export const getCachedEmbedding = (text: string, modelKey: string): number[] | null => {
  const val = cache.get(hashText(modelKey + ':' + text));
  if (val) { hits++; return val; }
  misses++;
  return null;
};

export const setCachedEmbedding = (text: string, modelKey: string, embedding: number[]): void => {
  cache.set(hashText(modelKey + ':' + text), embedding);
};

export const getEmbeddingCacheStats = () => ({
  hits,
  misses,
  size: cache.size,
  hitRate: hits + misses > 0 ? hits / (hits + misses) : 0,
});

export const clearEmbeddingCache = (): void => {
  cache.clear();
  hits = 0;
  misses = 0;
};
