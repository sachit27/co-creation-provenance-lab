/**
 * Dual-Layer Embedding Cache
 *
 * L1: In-memory Map — fast, current-session only.
 * L2: IndexedDB `cprov_embeddings` store — persists across page refresh / browser restart.
 *
 * Lookup order: L1 → L2 → (cache miss → API call).
 * Write: store in both L1 and L2 simultaneously.
 *
 * Key: djb2 hash of (modelKey + ":" + text).
 * The model key is REQUIRED to prevent returning vectors from a different
 * embedding model — different models produce incomparable vector spaces.
 *
 * Auto-eviction: entries older than 30 days are pruned on IndexedDB open.
 *
 * Why IndexedDB?
 * - Browser's built-in persistent storage with multi-MB capacity
 * - Async, non-blocking — won't freeze the UI
 * - No external dependencies
 * - Works in all modern browsers (including Vercel-deployed URLs)
 */

const DB_NAME = 'cprov_embeddings';
const DB_VERSION = 1;
const STORE_NAME = 'embeddings';
const MAX_AGE_MS = 30 * 24 * 60 * 60 * 1000; // 30 days

// ── djb2 hash — fast, good distribution for short-to-medium strings ──────────
const hashText = (text: string): string => {
  let h = 5381;
  for (let i = 0; i < text.length; i++) {
    h = ((h << 5) + h) ^ text.charCodeAt(i);
    h = h & h; // keep 32-bit
  }
  return h.toString(36);
};

// ── L1: In-memory cache ──────────────────────────────────────────────────────
const memCache = new Map<string, number[]>();
let hits = 0;
let misses = 0;
let l2Hits = 0;

// ── L2: IndexedDB wrapper ───────────────────────────────────────────────────

let dbPromise: Promise<IDBDatabase> | null = null;

const openDB = (): Promise<IDBDatabase> => {
  if (dbPromise) return dbPromise;

  dbPromise = new Promise<IDBDatabase>((resolve, reject) => {
    try {
      const request = indexedDB.open(DB_NAME, DB_VERSION);

      request.onupgradeneeded = () => {
        const db = request.result;
        if (!db.objectStoreNames.contains(STORE_NAME)) {
          db.createObjectStore(STORE_NAME, { keyPath: 'id' });
        }
      };

      request.onsuccess = () => {
        const db = request.result;
        // Async background eviction of stale entries (fire-and-forget)
        evictStaleEntries(db);
        resolve(db);
      };

      request.onerror = () => {
        console.warn('[EmbeddingCache] IndexedDB open failed, L2 disabled:', request.error);
        reject(request.error);
      };
    } catch (e) {
      // IndexedDB not available (e.g., private browsing in some browsers)
      console.warn('[EmbeddingCache] IndexedDB not available, using L1 only');
      reject(e);
    }
  });

  return dbPromise;
};

/** Remove entries older than MAX_AGE_MS. Runs once on DB open. */
const evictStaleEntries = (db: IDBDatabase): void => {
  try {
    const tx = db.transaction(STORE_NAME, 'readwrite');
    const store = tx.objectStore(STORE_NAME);
    const now = Date.now();
    let evicted = 0;

    const cursorRequest = store.openCursor();
    cursorRequest.onsuccess = () => {
      const cursor = cursorRequest.result;
      if (cursor) {
        if (now - (cursor.value.timestamp || 0) > MAX_AGE_MS) {
          cursor.delete();
          evicted++;
        }
        cursor.continue();
      } else if (evicted > 0) {
        console.log(`[EmbeddingCache] Evicted ${evicted} stale entries from IndexedDB`);
      }
    };
  } catch {
    // Non-critical — stale entries just waste space
  }
};

/** Read a single embedding from IndexedDB (L2). Returns null on miss or error. */
const getFromIndexedDB = async (id: string): Promise<number[] | null> => {
  try {
    const db = await openDB();
    return new Promise<number[] | null>((resolve) => {
      const tx = db.transaction(STORE_NAME, 'readonly');
      const request = tx.objectStore(STORE_NAME).get(id);
      request.onsuccess = () => {
        const entry = request.result;
        if (entry && Date.now() - (entry.timestamp || 0) < MAX_AGE_MS) {
          resolve(entry.embedding);
        } else {
          resolve(null);
        }
      };
      request.onerror = () => resolve(null);
    });
  } catch {
    return null;
  }
};

/** Write a single embedding to IndexedDB (L2). Fire-and-forget. */
const setInIndexedDB = (id: string, modelKey: string, embedding: number[]): void => {
  openDB().then(db => {
    try {
      const tx = db.transaction(STORE_NAME, 'readwrite');
      tx.objectStore(STORE_NAME).put({
        id,
        modelKey,
        embedding,
        timestamp: Date.now(),
      });
    } catch {
      // Non-critical — L1 still has it
    }
  }).catch(() => {
    // IndexedDB unavailable — L1 only
  });
};

// ── Public API (same interface as before) ────────────────────────────────────

/**
 * Lookup embedding. Checks L1 (memory) first, then L2 (IndexedDB).
 * Returns null on cache miss.
 *
 * When an L2 hit occurs, the vector is promoted to L1 for faster repeat access.
 */
export const getCachedEmbedding = (text: string, modelKey: string): number[] | null => {
  const key = hashText(modelKey + ':' + text);

  // L1 check (synchronous — fast path)
  const memVal = memCache.get(key);
  if (memVal) {
    hits++;
    return memVal;
  }

  misses++;
  return null;
};

/**
 * Async version that also checks IndexedDB (L2).
 * Call this when you can await — it checks L1 first, then L2.
 * On L2 hit, promotes to L1.
 */
export const getCachedEmbeddingAsync = async (text: string, modelKey: string): Promise<number[] | null> => {
  const key = hashText(modelKey + ':' + text);

  // L1 check
  const memVal = memCache.get(key);
  if (memVal) {
    hits++;
    return memVal;
  }

  // L2 check (IndexedDB)
  const dbVal = await getFromIndexedDB(key);
  if (dbVal) {
    // Promote to L1
    memCache.set(key, dbVal);
    l2Hits++;
    hits++;
    return dbVal;
  }

  misses++;
  return null;
};

/**
 * Store embedding in both L1 (memory) and L2 (IndexedDB).
 */
export const setCachedEmbedding = (text: string, modelKey: string, embedding: number[]): void => {
  const key = hashText(modelKey + ':' + text);
  memCache.set(key, embedding);
  setInIndexedDB(key, modelKey, embedding);
};

export const getEmbeddingCacheStats = () => ({
  hits,
  misses,
  l2Hits,
  size: memCache.size,
  hitRate: hits + misses > 0 ? hits / (hits + misses) : 0,
});

export const clearEmbeddingCache = (): void => {
  memCache.clear();
  hits = 0;
  misses = 0;
  l2Hits = 0;

  // Also clear IndexedDB
  openDB().then(db => {
    try {
      const tx = db.transaction(STORE_NAME, 'readwrite');
      tx.objectStore(STORE_NAME).clear();
      console.log('[EmbeddingCache] IndexedDB cleared');
    } catch {
      // Non-critical
    }
  }).catch(() => { });
};

/**
 * Pre-warm L1 from IndexedDB for a batch of texts.
 * Call this at analysis start to batch-load previously cached embeddings.
 * Returns the count of L2 hits that were promoted to L1.
 */
export const prewarmCache = async (texts: string[], modelKey: string): Promise<number> => {
  let promoted = 0;
  try {
    const db = await openDB();
    const tx = db.transaction(STORE_NAME, 'readonly');
    const store = tx.objectStore(STORE_NAME);

    await Promise.all(texts.map(text => {
      const key = hashText(modelKey + ':' + text);
      if (memCache.has(key)) return Promise.resolve(); // Already in L1

      return new Promise<void>((resolve) => {
        const request = store.get(key);
        request.onsuccess = () => {
          const entry = request.result;
          if (entry && Date.now() - (entry.timestamp || 0) < MAX_AGE_MS) {
            memCache.set(key, entry.embedding);
            promoted++;
          }
          resolve();
        };
        request.onerror = () => resolve();
      });
    }));
  } catch {
    // IndexedDB unavailable
  }

  if (promoted > 0) {
    console.log(`[EmbeddingCache] Pre-warmed ${promoted} embeddings from IndexedDB`);
  }
  return promoted;
};
