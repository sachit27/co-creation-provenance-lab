import { ANALYSIS_CONFIG } from '../constants';

// Vector Operations
export const dotProduct = (vecA: number[], vecB: number[]): number => {
    return vecA.reduce((sum, val, i) => sum + val * vecB[i], 0);
};

export const magnitude = (vec: number[]): number => {
    return Math.sqrt(vec.reduce((sum, val) => sum + val * val, 0));
};

export const cosineSimilarity = (vecA: number[], vecB: number[]): number => {
    const magA = magnitude(vecA);
    const magB = magnitude(vecB);
    if (magA === 0 || magB === 0) return 0;
    return dotProduct(vecA, vecB) / (magA * magB);
};

export const computeGlobalCentroid = (vectors: number[][]): number[] => {
    if (vectors.length === 0) return [];
    const dim = vectors[0].length;
    const centroid = new Array(dim).fill(0);
    for (const vec of vectors) {
        for (let i = 0; i < dim; i++) centroid[i] += vec[i];
    }
    for (let i = 0; i < dim; i++) centroid[i] /= vectors.length;
    return centroid;
};

// Calculate average pairwise cosine distance (1 - similarity)
export const computeAveragePairwiseDistance = (vectors: number[][]): number => {
    if (vectors.length < 2) return 0;

    // Optimization: Sampling for large datasets (>100)
    let targetVectors = vectors;
    if (vectors.length > 100) {
        // Deterministic stride-based systematic sampling (≤ ~50 vectors).
        // Using Math.random() would produce non-deterministic results on the
        // same data — a reproducibility concern for repeated analyses.
        // Stride sampling: take every k-th vector so the sample is always the
        // same for the same input, and coverage is uniform across the dataset.
        const targetSize = 50;
        const stride = Math.ceil(vectors.length / targetSize);
        targetVectors = vectors.filter((_, i) => i % stride === 0);
    }

    let totalDist = 0;
    let count = 0;

    for (let i = 0; i < targetVectors.length; i++) {
        for (let j = i + 1; j < targetVectors.length; j++) {
            totalDist += (1 - cosineSimilarity(targetVectors[i], targetVectors[j]));
            count++;
        }
    }

    return count === 0 ? 0 : totalDist / count;
};

/**
 * PCA Implementation using Power Iteration method
 *
 * Statistical Justification:
 * - Power iteration converges to the dominant eigenvector in O(log(1/ε)) iterations
 * - For embedding spaces, 10 iterations typically achieve machine precision convergence
 * - We use deflation to extract subsequent principal components
 *
 * @param vectors - Input data matrix (n x d)
 * @param k - Number of principal components to extract (default: 2)
 * @returns Projected vectors in k-dimensional space
 */
export const computePCA = (vectors: number[][], k: number = 2): number[][] => {
    if (vectors.length === 0) return [];

    const { pcaIterations } = ANALYSIS_CONFIG.algorithms;

    // 1. Center the data (mean subtraction for each dimension)
    const dimensions = vectors[0].length;
    const mean = new Array(dimensions).fill(0);

    for (const vec of vectors) {
        for (let i = 0; i < dimensions; i++) {
            mean[i] += vec[i];
        }
    }
    for (let i = 0; i < dimensions; i++) mean[i] /= vectors.length;

    let residualData = vectors.map(vec => vec.map((val, i) => val - mean[i]));
    const projectedData = new Array(vectors.length).fill(0).map(() => new Array(k).fill(0));

    // 2. Extract k principal components using power iteration with deflation
    for (let componentIdx = 0; componentIdx < k; componentIdx++) {
        // Initialize random unit vector
        let pc = new Array(dimensions).fill(0).map(() => Math.random() - 0.5);
        let mag = magnitude(pc);
        pc = pc.map(v => v / (mag || 1));

        // Power iteration: converges to dominant eigenvector
        for (let iter = 0; iter < pcaIterations; iter++) {
            const scores = residualData.map(vec => dotProduct(vec, pc));
            const newPc = new Array(dimensions).fill(0);
            for (let i = 0; i < residualData.length; i++) {
                for (let j = 0; j < dimensions; j++) {
                    newPc[j] += residualData[i][j] * scores[i];
                }
            }
            mag = magnitude(newPc);
            if (mag < 1e-6) break; // Convergence check
            pc = newPc.map(v => v / mag);
        }

        // Project data onto this component and deflate residual
        for (let i = 0; i < vectors.length; i++) {
            const score = dotProduct(residualData[i], pc);
            projectedData[i][componentIdx] = score;

            // Deflation: remove this component's contribution
            for (let j = 0; j < dimensions; j++) {
                residualData[i][j] -= score * pc[j];
            }
        }
    }

    return projectedData;
};

/**
 * Automatic K-Means Clustering with Elbow Method
 *
 * Statistical Justification:
 * - PCA preprocessing addresses the curse of dimensionality in high-d embeddings
 * - Elbow method uses within-cluster variance (WCSS) to find optimal k
 * - 15% improvement threshold balances model complexity vs. fit (parsimony principle)
 * - Max k=5 ensures interpretability while allowing meaningful segmentation
 *
 * Stability note:
 * - K-Means++ initialization (Arthur & Vassilvitskii, 2007) gives O(log k)
 *   approximation guarantee vs. optimal and dramatically reduces sensitivity to
 *   initial centroid placement. In practice, for N=5–30 participants and k≤5,
 *   cluster assignments are near-deterministic across repeated runs.
 * - For full reproducibility across sessions, a seeded PRNG (e.g., `seedrandom`)
 *   could be added, but the current approach is sufficient for interactive use.
 *
 * References:
 * - Thorndike (1953) for elbow method
 * - Rule of thumb: k << sqrt(n/2) for meaningful clusters
 *
 * @param vectors - Input embedding vectors
 * @returns Cluster assignments and optimal k
 */
export const computeAutoKMeans = (vectors: number[][]): { assignments: number[], k: number } => {
    const { maxClusters, elbowThreshold, kmeansIterations } = ANALYSIS_CONFIG.algorithms;

    // PCA preprocessing to address curse of dimensionality
    // 5 components typically capture >80% variance in embedding spaces
    const pcaVectors = computePCA(vectors, 5);

    // Minimum viable cluster size
    if (pcaVectors.length < 5) return { assignments: new Array(pcaVectors.length).fill(0), k: 1 };

    const maxK = Math.min(maxClusters, Math.floor(pcaVectors.length / 2));
    let bestK = 2;
    let bestAssignments: number[] = [];

    // Elbow method: track within-cluster sum of squares (WCSS)
    let previousVariance = Infinity;

    for (let k = 1; k <= maxK; k++) {
        const { assignments, centroids } = runKMeansStep(pcaVectors, k, kmeansIterations);

        // Compute WCSS (within-cluster sum of squares)
        let totalVariance = 0;
        pcaVectors.forEach((vec, i) => {
            const c = centroids[assignments[i]];
            const distSq = vec.reduce((sum, v, j) => sum + (v - c[j]) ** 2, 0);
            totalVariance += distSq;
        });

        if (k > 1) {
            const improvement = (previousVariance - totalVariance) / previousVariance;
            // Elbow criterion: stop when marginal improvement drops below threshold
            if (improvement < elbowThreshold) {
                break;
            }
        }

        bestK = k;
        bestAssignments = assignments;
        previousVariance = totalVariance;
    }

    return { assignments: bestAssignments, k: bestK };
};

/**
 * Gini Coefficient - Measures inequality in a distribution
 *
 * Statistical Justification:
 * - Standard metric from economics for measuring inequality (Gini, 1912)
 * - Returns 0 for perfect equality (all values identical)
 * - Returns 1 for perfect inequality (one has everything)
 * - Widely used for income inequality and adapted for representation analysis
 *
 * Interpretation thresholds (from ANALYSIS_CONFIG):
 * - < 0.2: Low inequality (well-distributed)
 * - 0.2-0.35: Moderate inequality
 * - > 0.35: High inequality
 * - > 0.5: Very high inequality
 *
 * Formula: G = (2 * Σ(i * x_i)) / (n * Σx_i) - (n+1)/n
 * where x_i are sorted values and i is rank (1-indexed)
 *
 * @param values - Array of values (e.g., representation scores)
 * @returns Gini coefficient between 0 and 1
 */
export const calculateGini = (values: number[]): number => {
    if (values.length === 0) return 0;

    // Sort ascending (required for Gini calculation)
    const sorted = [...values].sort((a, b) => a - b);
    const n = sorted.length;

    // Weighted sum: Σ(rank * value)
    let numerator = 0;
    sorted.forEach((val, i) => {
        numerator += (i + 1) * val;
    });

    const denominator = n * sorted.reduce((sum, val) => sum + val, 0);

    if (denominator === 0) return 0; // Handle edge case of all zeros

    return ((2 * numerator) / denominator) - ((n + 1) / n);
};

/**
 * K-Means++ Initialization (Arthur & Vassilvitskii, 2007)
 *
 * Selects initial centroids with probability proportional to squared distance
 * from existing centroids. This provably achieves O(log k) competitive ratio
 * versus optimal clustering, and avoids the poor-convergence pathologies of
 * naive (first-k or random) initialization.
 *
 * @param vectors - Input data points
 * @param k - Number of clusters to initialise
 * @returns Array of k centroid vectors
 */
const kMeansPlusPlusInit = (vectors: number[][], k: number): number[][] => {
    const n = vectors.length;
    // 1. Choose first centroid uniformly at random
    const centroids: number[][] = [vectors[Math.floor(Math.random() * n)]];

    for (let c = 1; c < k; c++) {
        // 2. Compute D(x)² — squared Euclidean distance to nearest existing centroid
        const distances = vectors.map(vec => {
            let minDist = Infinity;
            for (const centroid of centroids) {
                const dist = vec.reduce((sum, v, j) => sum + (v - centroid[j]) ** 2, 0);
                if (dist < minDist) minDist = dist;
            }
            return minDist;
        });

        // 3. Choose next centroid with probability proportional to D(x)²
        const totalDist = distances.reduce((a, b) => a + b, 0);
        if (totalDist === 0) {
            // All points coincide — pick any remaining point
            centroids.push([...vectors[c % n]]);
            continue;
        }

        let r = Math.random() * totalDist;
        for (let i = 0; i < n; i++) {
            r -= distances[i];
            if (r <= 0) {
                centroids.push([...vectors[i]]);
                break;
            }
        }

        // Edge case: floating-point rounding didn't select anything
        if (centroids.length <= c) {
            centroids.push([...vectors[n - 1]]);
        }
    }

    return centroids;
};

/**
 * K-Means clustering (Lloyd's algorithm) with K-Means++ initialization
 *
 * Statistical Justification:
 * - K-Means++ initialisation (Arthur & Vassilvitskii, 2007) gives O(log k)
 *   approximation guarantee vs. optimal, avoiding poor local minima
 * - Lloyd's algorithm converges to local minimum in O(k * n * d * i) time
 * - 15 iterations typically sufficient for convergence in most practical cases
 * - Random centroid reinitialization handles empty cluster edge case
 *
 * @param vectors - Input data points
 * @param k - Number of clusters
 * @param maxIterations - Maximum iterations (from config)
 * @returns Cluster assignments and final centroids
 */
const runKMeansStep = (
    vectors: number[][],
    k: number,
    maxIterations: number = ANALYSIS_CONFIG.algorithms.kmeansIterations
): { assignments: number[], centroids: number[][] } => {
    let centroids = kMeansPlusPlusInit(vectors, k);
    let assignments = new Array(vectors.length).fill(0);

    for (let iter = 0; iter < maxIterations; iter++) {
        // Assignment step: assign each point to nearest centroid
        assignments = vectors.map(vec => {
            let minDist = Infinity;
            let cluster = 0;
            centroids.forEach((c, i) => {
                const dist = vec.reduce((sum, v, j) => sum + (v - c[j]) ** 2, 0);
                if (dist < minDist) {
                    minDist = dist;
                    cluster = i;
                }
            });
            return cluster;
        });

        // Update step: recompute centroids as cluster means
        const newCentroids = Array(k).fill(0).map(() => Array(vectors[0].length).fill(0));
        const counts = Array(k).fill(0);

        vectors.forEach((vec, i) => {
            const cluster = assignments[i];
            counts[cluster]++;
            for (let j = 0; j < vec.length; j++) {
                newCentroids[cluster][j] += vec[j];
            }
        });

        for (let i = 0; i < k; i++) {
            if (counts[i] > 0) {
                for (let j = 0; j < vectors[0].length; j++) {
                    newCentroids[i][j] /= counts[i];
                }
            } else {
                // Handle empty cluster: reinitialize with random point
                newCentroids[i] = vectors[Math.floor(Math.random() * vectors.length)];
            }
        }
        centroids = newCentroids;
    }
    return { assignments, centroids };
};

/**
 * Mutual k-Nearest Neighbors graph construction.
 *
 * An edge between participants i and j exists iff both rank each other
 * among their k most similar neighbors. This mutual requirement produces
 * sparse, high-confidence edges — standard in spectral clustering and
 * manifold learning (von Luxburg, 2007).
 *
 * @param embeddings - Per-participant embedding vectors
 * @param participantIds - Matching participant ID strings
 * @param k - Number of nearest neighbors (typically min(5, ceil(sqrt(N))))
 * @returns Array of undirected edges with cosine similarity weights
 */
export const computeMutualKNN = (
  embeddings: number[][],
  participantIds: string[],
  k: number
): { source: string; target: string; weight: number }[] => {
  const n = embeddings.length;
  if (n < 2) return [];

  const effectiveK = Math.min(k, n - 1);

  // Compute pairwise similarities and cache them (symmetric, so store once)
  const simCache = new Float64Array(n * n);
  for (let i = 0; i < n; i++) {
    for (let j = i + 1; j < n; j++) {
      const sim = cosineSimilarity(embeddings[i], embeddings[j]);
      simCache[i * n + j] = sim;
      simCache[j * n + i] = sim;
    }
  }

  // For each node, find its top-k neighbors
  const knnSets: Set<number>[] = new Array(n);
  for (let i = 0; i < n; i++) {
    const sims: { idx: number; sim: number }[] = [];
    for (let j = 0; j < n; j++) {
      if (i === j) continue;
      sims.push({ idx: j, sim: simCache[i * n + j] });
    }
    sims.sort((a, b) => b.sim - a.sim);
    knnSets[i] = new Set(sims.slice(0, effectiveK).map(s => s.idx));
  }

  // Mutual kNN: edge exists iff both nodes rank each other in top-k
  const edges: { source: string; target: string; weight: number }[] = [];
  for (let i = 0; i < n; i++) {
    for (let j = i + 1; j < n; j++) {
      if (knnSets[i].has(j) && knnSets[j].has(i)) {
        edges.push({
          source: participantIds[i],
          target: participantIds[j],
          weight: simCache[i * n + j],
        });
      }
    }
  }

  return edges;
};
