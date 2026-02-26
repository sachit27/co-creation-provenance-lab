import { AnomalyFlags, ParticipantInput } from '../types';

/**
 * Anomaly Detection Service
 * Detects gaming behaviors: keyword stuffing, copy-paste, outlier clusters
 * 
 * Uses tiered approach for copy-paste detection:
 * - Tier 2: HuggingFace semantic similarity (async version)
 * - Tier 3: TF-IDF cosine similarity (sync version)
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
 * Calculate TF-IDF cosine similarity between two texts
 * More robust than Jaccard for detecting paraphrased duplicates
 */
const tfidfCosineSimilarity = (a: string, b: string): number => {
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

/**
 * Check for copy-paste using TF-IDF cosine similarity
 * This detects both exact copies and paraphrased duplicates
 */
const detectCopyPaste = (
  text: string,
  allTexts: string[],
  threshold: number = 0.7
): { isCopyPaste: boolean; similarTo?: string; similarity?: number } => {
  for (const otherText of allTexts) {
    if (otherText === text) continue;

    const similarity = tfidfCosineSimilarity(text, otherText);
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
  const stdDev = Math.sqrt(variance) || 0.01;

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

  inputs.forEach((input, idx) => {
    const reasons: string[] = [];

    // Check keyword stuffing
    const stuffingResult = detectKeywordStuffing(input.text);
    if (stuffingResult.isStuffing && stuffingResult.reason) {
      reasons.push(stuffingResult.reason);
    }

    // Check copy-paste
    const copyResult = detectCopyPaste(input.text, allTexts);
    if (copyResult.isCopyPaste) {
      reasons.push(`High similarity (${((copyResult.similarity || 0) * 100).toFixed(0)}%) with another input`);
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
      isCopyPaste: copyResult.isCopyPaste,
      isOutlierCluster: outlierResult.isOutlier,
      zScore: outlierResult.zScore,
      similarity: copyResult.similarity
    });

    results.set(input.id, {
      isKeywordStuffing: stuffingResult.isStuffing,
      isCopyPaste: copyResult.isCopyPaste,
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
