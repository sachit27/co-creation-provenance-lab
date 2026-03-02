/**
 * Embedding Cache
 *
 * In-memory cache for embedding vectors. Persists for the lifetime of the
 * browser session (until page refresh). This means re-running the analysis
 * with the same inputs — e.g. changing strategy or summarization mode —
 * skips re-embedding and returns results immediately.
 *
 * Key: djb2 hash of the input text (fast, collision-resistant for typical lengths).
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

export const getCachedEmbedding = (text: string): number[] | null => {
  const val = cache.get(hashText(text));
  if (val) { hits++; return val; }
  misses++;
  return null;
};

export const setCachedEmbedding = (text: string, embedding: number[]): void => {
  cache.set(hashText(text), embedding);
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
