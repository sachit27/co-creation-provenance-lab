import { AnomalyFlags, ParticipantInput } from '../types';

/**
 * Anomaly Detection Service
 * Detects gaming behaviors: keyword stuffing, copy-paste, outlier clusters
 *
 * Copy-paste detection uses MinHash/LSH (Broder 1997) for O(n) near-duplicate
 * detection at scale, with TF-IDF cosine similarity verification for precision.
 * Falls back to O(n²) pairwise comparison for n < 20 where LSH overhead isn't warranted.
 * Async version uses HuggingFace semantic similarity when available.
 */

// Extended stopwords for robust tokenization
const STOPWORDS = new Set([
  'the', 'a', 'an', 'is', 'are', 'was', 'were', 'be', 'been', 'being',
  'have', 'has', 'had', 'do', 'does', 'did', 'will', 'would', 'could',
  'should', 'may', 'might', 'must', 'can', 'to', 'of', 'in', 'for',
  'on', 'with', 'at', 'by', 'from', 'as', 'and', 'but', 'or', 'so',
  'if', 'this', 'that', 'it', 'its', 'they', 'them', 'we', 'i', 'you'
]);

/**
 * Tokenize text with stemming for similarity calculation
 */
const tokenize = (text: string): string[] => {
  return text
    .toLowerCase()
    .replace(/[^a-z\s]/g, ' ')
    .split(/\s+/)
    .filter(w => w.length > 2 && !STOPWORDS.has(w))
    .map(w => {
      // Simple stemming
      if (w.endsWith('ing') && w.length > 5) return w.slice(0, -3);
      if (w.endsWith('ed') && w.length > 4) return w.slice(0, -2);
      if (w.endsWith('s') && w.length > 3 && !w.endsWith('ss')) return w.slice(0, -1);
      return w;
    });
};

/**
 * Calculate sublinear-TF cosine similarity between two texts.
 * Uses term frequency with log-scaling (1 + log(tf)) but no IDF component
 * since comparisons are pairwise rather than corpus-wide.
 * More robust than Jaccard for detecting paraphrased duplicates.
 */
const sublinearTfCosineSimilarity = (a: string, b: string): number => {
  const tokensA = tokenize(a);
  const tokensB = tokenize(b);

  if (tokensA.length === 0 || tokensB.length === 0) return 0;

  // Build term frequency maps
  const tfA: Record<string, number> = {};
  const tfB: Record<string, number> = {};

  tokensA.forEach(t => { tfA[t] = (tfA[t] || 0) + 1; });
  tokensB.forEach(t => { tfB[t] = (tfB[t] || 0) + 1; });

  // Apply sublinear TF scaling
  const tfScaledA: Record<string, number> = {};
  const tfScaledB: Record<string, number> = {};

  for (const [term, count] of Object.entries(tfA)) {
    tfScaledA[term] = 1 + Math.log(count);
  }
  for (const [term, count] of Object.entries(tfB)) {
    tfScaledB[term] = 1 + Math.log(count);
  }

  // Get all unique terms
  const allTerms = new Set([...Object.keys(tfScaledA), ...Object.keys(tfScaledB)]);

  // Calculate cosine similarity
  let dotProduct = 0;
  let normA = 0;
  let normB = 0;

  for (const term of allTerms) {
    const vA = tfScaledA[term] || 0;
    const vB = tfScaledB[term] || 0;

    dotProduct += vA * vB;
    normA += vA * vA;
    normB += vB * vB;
  }

  if (normA === 0 || normB === 0) return 0;

  return dotProduct / (Math.sqrt(normA) * Math.sqrt(normB));
};

// Check for keyword stuffing (excessive keyword repetition)
const detectKeywordStuffing = (text: string): { isStuffing: boolean; reason?: string } => {
  const words = text.toLowerCase().split(/\s+/).filter(w => w.length > 3);
  if (words.length < 5) return { isStuffing: false };

  // Count word frequencies
  const freqMap = new Map<string, number>();
  words.forEach(w => freqMap.set(w, (freqMap.get(w) || 0) + 1));

  // Check if any word appears > 30% of the time (suspicious)
  const maxFreq = Math.max(...freqMap.values());
  const maxRatio = maxFreq / words.length;

  if (maxRatio > 0.3 && maxFreq > 3) {
    const repeatedWord = [...freqMap.entries()].find(([_, v]) => v === maxFreq)?.[0];
    return {
      isStuffing: true,
      reason: `"${repeatedWord}" repeated ${maxFreq} times (${(maxRatio * 100).toFixed(0)}%)`
    };
  }

  // Check for consecutive repetition patterns
  const consecutiveRepeat = words.some((w, i) =>
    i >= 2 && words[i - 1] === w && words[i - 2] === w
  );

  if (consecutiveRepeat) {
    return {
      isStuffing: true,
      reason: 'Consecutive word repetition detected'
    };
  }

  return { isStuffing: false };
};

// ── MinHash for O(n) near-duplicate detection (Broder, 1997) ────────────────────
// Instead of O(n²) pairwise TF-IDF comparisons, we compute a fixed-size
// signature per document from character n-gram shingles. Two documents with
// Jaccard(shingles) ≥ threshold will share ≥ threshold fraction of MinHash values.
// Candidate pairs are identified by band-based LSH (Locality-Sensitive Hashing),
// then verified with TF-IDF cosine similarity for precision.

const MINHASH_NUM_HASHES = 100;
const MINHASH_BANDS = 20;        // 100 hashes / 20 bands = 5 rows per band
const MINHASH_ROWS_PER_BAND = MINHASH_NUM_HASHES / MINHASH_BANDS;
const SHINGLE_SIZE = 3;          // Character 3-grams (works well for short texts)

// Simple hash family: h(x) = (a*x + b) mod p, with prime p.
// Uses a 16-bit prime to avoid exceeding Number.MAX_SAFE_INTEGER (2^53)
// when multiplying 32-bit shingle hashes by coefficients.
// The smaller modulus is acceptable for LSH where we only need
// collision behavior, not cryptographic uniformity.
const MINHASH_PRIME = 104729; // prime, keeps a*x+b < 2^53
const hashCoeffs: Array<{ a: number; b: number }> = [];
{
  // Deterministic coefficients derived from index, kept < MINHASH_PRIME
  for (let i = 0; i < MINHASH_NUM_HASHES; i++) {
    hashCoeffs.push({
      a: ((i * 73856093 + 19349669) % MINHASH_PRIME) + 1, // a > 0
      b: ((i * 83492791 + 39916801) % MINHASH_PRIME),
    });
  }
}

// FNV-1a 32-bit hash for shingle strings
const fnv1a = (s: string): number => {
  let hash = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    hash ^= s.charCodeAt(i);
    hash = (hash * 0x01000193) >>> 0;
  }
  return hash;
};

// Extract character n-gram shingle hashes from text
const getShingleHashes = (text: string): Set<number> => {
  const normalized = text.toLowerCase().replace(/\s+/g, ' ').trim();
  const hashes = new Set<number>();
  for (let i = 0; i <= normalized.length - SHINGLE_SIZE; i++) {
    hashes.add(fnv1a(normalized.substring(i, i + SHINGLE_SIZE)));
  }
  return hashes;
};

// Compute MinHash signature for a set of shingle hashes
const computeMinHashSignature = (shingleHashes: Set<number>): Uint32Array => {
  const sig = new Uint32Array(MINHASH_NUM_HASHES).fill(0xFFFFFFFF);
  for (const shingle of shingleHashes) {
    for (let i = 0; i < MINHASH_NUM_HASHES; i++) {
      const { a, b } = hashCoeffs[i];
      // Reduce shingle first to keep intermediate products within safe integer range
      const reduced = shingle % MINHASH_PRIME;
      const h = (a * reduced + b) % MINHASH_PRIME;
      if (h < sig[i]) sig[i] = h;
    }
  }
  return sig;
};

// LSH banding: hash each band of the signature to find candidate pairs
const lshCandidatePairs = (signatures: Uint32Array[]): Set<string> => {
  const candidates = new Set<string>();
  for (let band = 0; band < MINHASH_BANDS; band++) {
    const buckets = new Map<string, number[]>();
    const start = band * MINHASH_ROWS_PER_BAND;
    for (let docIdx = 0; docIdx < signatures.length; docIdx++) {
      // Band key: concatenate hash values in this band
      let key = '';
      for (let r = 0; r < MINHASH_ROWS_PER_BAND; r++) {
        key += signatures[docIdx][start + r].toString(36) + ',';
      }
      const bucket = buckets.get(key);
      if (bucket) {
        for (const other of bucket) {
          const pairKey = other < docIdx ? `${other}:${docIdx}` : `${docIdx}:${other}`;
          candidates.add(pairKey);
        }
        bucket.push(docIdx);
      } else {
        buckets.set(key, [docIdx]);
      }
    }
  }
  return candidates;
};

/**
 * Check for copy-paste using MinHash/LSH + TF-IDF verification.
 *
 * Complexity: O(n) for signature computation + O(candidates) for verification,
 * where candidates ≪ n² for typical datasets. Falls back to O(n²) only when
 * n < 20 (where the overhead of LSH isn't worthwhile).
 */
const detectCopyPasteAll = (
  allTexts: string[],
  threshold: number = 0.7
): Map<number, { similarTo: string; similarity: number }> => {
  const results = new Map<number, { similarTo: string; similarity: number }>();

  if (allTexts.length < 2) return results;

  // For small datasets, direct pairwise comparison is faster
  if (allTexts.length < 20) {
    for (let i = 0; i < allTexts.length; i++) {
      for (let j = i + 1; j < allTexts.length; j++) {
        const sim = sublinearTfCosineSimilarity(allTexts[i], allTexts[j]);
        if (sim >= threshold) {
          if (!results.has(i) || results.get(i)!.similarity < sim) {
            results.set(i, { similarTo: allTexts[j].substring(0, 50) + '...', similarity: sim });
          }
          if (!results.has(j) || results.get(j)!.similarity < sim) {
            results.set(j, { similarTo: allTexts[i].substring(0, 50) + '...', similarity: sim });
          }
        }
      }
    }
    return results;
  }

  // MinHash/LSH pipeline for larger datasets
  const shingleSets = allTexts.map(getShingleHashes);
  const signatures = shingleSets.map(computeMinHashSignature);
  const candidates = lshCandidatePairs(signatures);

  // Verify candidate pairs with TF-IDF cosine similarity
  for (const pairKey of candidates) {
    const [iStr, jStr] = pairKey.split(':');
    const i = parseInt(iStr);
    const j = parseInt(jStr);
    const sim = sublinearTfCosineSimilarity(allTexts[i], allTexts[j]);
    if (sim >= threshold) {
      if (!results.has(i) || results.get(i)!.similarity < sim) {
        results.set(i, { similarTo: allTexts[j].substring(0, 50) + '...', similarity: sim });
      }
      if (!results.has(j) || results.get(j)!.similarity < sim) {
        results.set(j, { similarTo: allTexts[i].substring(0, 50) + '...', similarity: sim });
      }
    }
  }

  return results;
};

/** @deprecated Use detectCopyPasteAll for batch detection. Kept for detectCopyPasteAsync fallback. */
const detectCopyPaste = (
  text: string,
  allTexts: string[],
  threshold: number = 0.7
): { isCopyPaste: boolean; similarTo?: string; similarity?: number } => {
  for (const otherText of allTexts) {
    if (otherText === text) continue;

    const similarity = sublinearTfCosineSimilarity(text, otherText);
    if (similarity >= threshold) {
      return {
        isCopyPaste: true,
        similarTo: otherText.substring(0, 50) + '...',
        similarity
      };
    }
  }

  return { isCopyPaste: false };
};

/**
 * Async version of copy-paste detection using HuggingFace semantic similarity
 * Catches paraphrased duplicates that TF-IDF might miss
 */
export const detectCopyPasteAsync = async (
  text: string,
  allTexts: string[],
  threshold: number = 0.85
): Promise<{ isCopyPaste: boolean; similarTo?: string; similarity?: number }> => {
  try {
    const { checkHuggingFaceAvailable, semanticSimilarityHF } = await import('./huggingface');

    if (await checkHuggingFaceAvailable()) {
      for (const otherText of allTexts) {
        if (otherText === text) continue;

        const similarity = await semanticSimilarityHF(text, otherText);
        if (similarity >= threshold) {
          console.log(`[Anomaly] HF semantic duplicate: ${similarity.toFixed(2)}`);
          return {
            isCopyPaste: true,
            similarTo: otherText.substring(0, 50) + '...',
            similarity
          };
        }
      }
      return { isCopyPaste: false };
    }
  } catch (e) {
    console.warn('[Anomaly] HuggingFace unavailable, using TF-IDF fallback');
  }

  // Fallback to TF-IDF
  return detectCopyPaste(text, allTexts, threshold - 0.15); // Lower threshold for TF-IDF
};

// Detect outlier clusters using Z-score on representation scores
const detectOutlierCluster = (
  representationScore: number,
  allScores: number[],
  zThreshold: number = 2
): { isOutlier: boolean; zScore: number } => {
  const mean = allScores.reduce((a, b) => a + b, 0) / allScores.length;
  // Bessel's correction (÷n-1) for sample variance, consistent with the rest of the codebase
  const n = allScores.length;
  const variance = n > 1
    ? allScores.reduce((sum, s) => sum + (s - mean) ** 2, 0) / (n - 1)
    : 0;
  const rawStdDev = Math.sqrt(variance);
  // Only apply floor when variance is exactly zero (all scores identical)
  const stdDev = rawStdDev === 0 ? 0.01 : rawStdDev;

  const zScore = Math.abs(representationScore - mean) / stdDev;

  return {
    isOutlier: zScore > zThreshold,
    zScore
  };
};

// Compute composite anomaly score (0-1)
const computeAnomalyScore = (flags: {
  isKeywordStuffing: boolean;
  isCopyPaste: boolean;
  isOutlierCluster: boolean;
  zScore?: number;
  similarity?: number;
}): number => {
  let score = 0;

  // Keyword stuffing: +0.4
  if (flags.isKeywordStuffing) score += 0.4;

  // Copy-paste: +0.4 scaled by similarity
  if (flags.isCopyPaste && flags.similarity) {
    score += 0.4 * flags.similarity;
  }

  // Outlier cluster: scaled by z-score magnitude
  if (flags.isOutlierCluster && flags.zScore) {
    score += Math.min(0.3, flags.zScore * 0.1);
  }

  return Math.min(1, score);
};

/**
 * Main anomaly detection function
 * Analyzes all participants for gaming behaviors
 */
export const detectAnomalies = (
  inputs: ParticipantInput[],
  representationScores: number[],
  zThreshold: number = 2
): Map<string, AnomalyFlags> => {
  const results = new Map<string, AnomalyFlags>();
  const allTexts = inputs.map(i => i.text);

  // Batch copy-paste detection using MinHash/LSH — O(n) instead of O(n²)
  const copyPasteResults = detectCopyPasteAll(allTexts);

  inputs.forEach((input, idx) => {
    const reasons: string[] = [];

    // Check keyword stuffing
    const stuffingResult = detectKeywordStuffing(input.text);
    if (stuffingResult.isStuffing && stuffingResult.reason) {
      reasons.push(stuffingResult.reason);
    }

    // Check copy-paste (from batch MinHash/LSH results)
    const copyResult = copyPasteResults.get(idx);
    const isCopyPaste = !!copyResult;
    if (isCopyPaste) {
      reasons.push(`High similarity (${((copyResult.similarity) * 100).toFixed(0)}%) with another input`);
    }

    // Check outlier cluster
    const outlierResult = detectOutlierCluster(
      representationScores[idx],
      representationScores,
      zThreshold
    );
    if (outlierResult.isOutlier) {
      reasons.push(`Statistical outlier (${outlierResult.zScore.toFixed(1)}σ from mean)`);
    }

    // Compute composite score
    const anomalyScore = computeAnomalyScore({
      isKeywordStuffing: stuffingResult.isStuffing,
      isCopyPaste,
      isOutlierCluster: outlierResult.isOutlier,
      zScore: outlierResult.zScore,
      similarity: copyResult?.similarity
    });

    results.set(input.id, {
      isKeywordStuffing: stuffingResult.isStuffing,
      isCopyPaste,
      isOutlierCluster: outlierResult.isOutlier,
      anomalyScore,
      reasons
    });
  });

  return results;
};

/**
 * Quick check if any participant has significant anomalies
 */
export const hasSignificantAnomalies = (anomalyMap: Map<string, AnomalyFlags>): boolean => {
  for (const flags of anomalyMap.values()) {
    if (flags.anomalyScore > 0.5) return true;
  }
  return false;
};

export default detectAnomalies;
