/**
 * Privacy-conscious embedding cache.
 *
 * L1 is memory-only and always available for the current tab. L2 persistence is
 * opt-in because embeddings derived from participant text may retain sensitive
 * information. Persistent identities use SHA-256, never a collision-prone
 * 32-bit hash, and expire after seven days.
 */

const DB_NAME = 'cprov_embeddings';
const DB_VERSION = 2;
const STORE_NAME = 'embeddings';
const MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;
const PERSISTENCE_PREFERENCE_KEY = 'cprov_persistent_embedding_cache';

const memoryKey = (text: string, modelKey: string): string => `${modelKey}\u241f${text}`;

const persistentKey = async (text: string, modelKey: string): Promise<string> => {
  if (!globalThis.crypto?.subtle) throw new Error('Cryptographic digest unavailable');
  const bytes = new TextEncoder().encode(`${modelKey}\u241f${text}`);
  const digest = await globalThis.crypto.subtle.digest('SHA-256', bytes);
  return Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, '0')).join('');
};

const isValidEmbedding = (value: unknown, expectedDimension?: number): value is number[] =>
  Array.isArray(value) && value.length > 0 &&
  (expectedDimension === undefined || value.length === expectedDimension) &&
  value.every(item => typeof item === 'number' && Number.isFinite(item));

let persistentCacheEnabled = (() => {
  try { return globalThis.localStorage?.getItem(PERSISTENCE_PREFERENCE_KEY) === 'true'; }
  catch { return false; }
})();

const memCache = new Map<string, number[]>();
let hits = 0;
let misses = 0;
let l2Hits = 0;
let dbPromise: Promise<IDBDatabase> | null = null;

const evictStaleEntries = (db: IDBDatabase): void => {
  try {
    const store = db.transaction(STORE_NAME, 'readwrite').objectStore(STORE_NAME);
    const now = Date.now();
    const request = store.openCursor();
    request.onsuccess = () => {
      const cursor = request.result;
      if (!cursor) return;
      if (now - (cursor.value.timestamp || 0) > MAX_AGE_MS) cursor.delete();
      cursor.continue();
    };
  } catch { /* disposable cache */ }
};

const openDB = (): Promise<IDBDatabase> => {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise<IDBDatabase>((resolve, reject) => {
    try {
      const request = indexedDB.open(DB_NAME, DB_VERSION);
      request.onupgradeneeded = () => {
        const db = request.result;
        // v1 used collision-prone 32-bit keys. Cache entries are disposable, so
        // delete them instead of trusting or attempting to migrate identities.
        if (db.objectStoreNames.contains(STORE_NAME)) db.deleteObjectStore(STORE_NAME);
        db.createObjectStore(STORE_NAME, { keyPath: 'id' });
      };
      request.onsuccess = () => {
        const db = request.result;
        evictStaleEntries(db);
        resolve(db);
      };
      request.onerror = () => reject(request.error);
    } catch (error) {
      reject(error);
    }
  });
  return dbPromise;
};

const getFromIndexedDB = async (id: string): Promise<number[] | null> => {
  try {
    const db = await openDB();
    return await new Promise(resolve => {
      const request = db.transaction(STORE_NAME, 'readonly').objectStore(STORE_NAME).get(id);
      request.onsuccess = () => {
        const entry = request.result;
        resolve(entry && Date.now() - (entry.timestamp || 0) < MAX_AGE_MS &&
          isValidEmbedding(entry.embedding, entry.dimension) ? entry.embedding : null);
      };
      request.onerror = () => resolve(null);
    });
  } catch {
    return null;
  }
};

const setInIndexedDB = (id: string, modelKey: string, embedding: number[]): void => {
  if (!persistentCacheEnabled || !isValidEmbedding(embedding)) return;
  openDB().then(db => {
    try {
      db.transaction(STORE_NAME, 'readwrite').objectStore(STORE_NAME).put({
        id,
        modelKey,
        embedding,
        dimension: embedding.length,
        timestamp: Date.now(),
      });
    } catch { /* L1 remains available */ }
  }).catch(() => { /* persistence unavailable */ });
};

const deletePersistentDatabase = (): void => {
  try {
    const pending = dbPromise;
    dbPromise = null;
    if (pending) {
      pending.then(db => {
        db.close();
        indexedDB.deleteDatabase(DB_NAME);
      }).catch(() => indexedDB.deleteDatabase(DB_NAME));
    } else {
      indexedDB.deleteDatabase(DB_NAME);
    }
  } catch { /* IndexedDB unavailable */ }
};

export const getCachedEmbedding = (text: string, modelKey: string): number[] | null => {
  const value = memCache.get(memoryKey(text, modelKey));
  if (value) { hits++; return value; }
  misses++;
  return null;
};

export const getCachedEmbeddingAsync = async (text: string, modelKey: string): Promise<number[] | null> => {
  const key = memoryKey(text, modelKey);
  const memoryValue = memCache.get(key);
  if (memoryValue) { hits++; return memoryValue; }
  if (!persistentCacheEnabled) { misses++; return null; }
  try {
    const value = await getFromIndexedDB(await persistentKey(text, modelKey));
    if (value) {
      memCache.set(key, value);
      hits++;
      l2Hits++;
      return value;
    }
  } catch { /* cryptographic storage unavailable */ }
  misses++;
  return null;
};

export const setCachedEmbedding = (text: string, modelKey: string, embedding: number[]): void => {
  if (!isValidEmbedding(embedding)) return;
  memCache.set(memoryKey(text, modelKey), embedding);
  if (persistentCacheEnabled) {
    persistentKey(text, modelKey)
      .then(id => setInIndexedDB(id, modelKey, embedding))
      .catch(() => { /* L1 remains available */ });
  }
};

export const getEmbeddingCacheStats = () => ({
  hits,
  misses,
  l2Hits,
  size: memCache.size,
  hitRate: hits + misses > 0 ? hits / (hits + misses) : 0,
  persistent: persistentCacheEnabled,
});

export const isPersistentEmbeddingCacheEnabled = (): boolean => persistentCacheEnabled;

export const setPersistentEmbeddingCacheEnabled = (enabled: boolean): void => {
  persistentCacheEnabled = enabled;
  try { globalThis.localStorage?.setItem(PERSISTENCE_PREFERENCE_KEY, String(enabled)); } catch { /* unavailable */ }
  if (!enabled) deletePersistentDatabase();
};

export const clearEmbeddingCache = (): void => {
  memCache.clear();
  hits = 0;
  misses = 0;
  l2Hits = 0;
  deletePersistentDatabase();
};

export const prewarmCache = async (texts: string[], modelKey: string): Promise<number> => {
  if (!persistentCacheEnabled) return 0;
  let promoted = 0;
  await Promise.all(texts.map(async text => {
    const key = memoryKey(text, modelKey);
    if (memCache.has(key)) return;
    try {
      const value = await getFromIndexedDB(await persistentKey(text, modelKey));
      if (value) {
        memCache.set(key, value);
        promoted++;
      }
    } catch { /* skip */ }
  }));
  return promoted;
};

// Remove any legacy silent persistent cache on first load unless the user has
// explicitly opted in to the new disclosed behavior.
if (!persistentCacheEnabled) deletePersistentDatabase();
