import { ANALYSIS_CONFIG } from '../constants';
import type { ClusteringCandidateDiagnostic, ClusteringDiagnostics } from '../types';

// ── Seeded PRNG (xorshift128+ variant) ──────────────────────────────────────────
// Adapted from Marsaglia (2003) xorshift family. This 32-bit JavaScript
// implementation has a shorter period than the 64-bit reference (~2^64 vs 2^128-1)
// due to JS bitwise operators working on 32-bit signed integers.
// Sufficient for PCA, K-Means++, and bootstrap where ~10^4 draws are typical.
class SeededRNG {
  private s0: number;
  private s1: number;

  constructor(seed: number) {
    // SplitMix64-style seed expansion (Steele et al. 2014)
    // Ensures even small seed differences produce uncorrelated states
    let s = seed | 0;
    s = ((s >>> 16) ^ s) * 0x45d9f3b | 0;
    s = ((s >>> 16) ^ s) * 0x45d9f3b | 0;
    this.s0 = (s >>> 16) ^ s;
    s = (seed + 0x9e3779b9) | 0;
    s = ((s >>> 16) ^ s) * 0x45d9f3b | 0;
    s = ((s >>> 16) ^ s) * 0x45d9f3b | 0;
    this.s1 = (s >>> 16) ^ s;
    if (this.s0 === 0 && this.s1 === 0) this.s1 = 1;
  }

  /** Returns a float in [0, 1) */
  next(): number {
    let s1 = this.s0;
    const s0 = this.s1;
    this.s0 = s0;
    s1 ^= s1 << 23;
    s1 ^= s1 >>> 17;
    s1 ^= s0;
    s1 ^= s0 >>> 26;
    this.s1 = s1;
    // Map to [0,1) using unsigned 32-bit conversion
    return ((this.s0 + this.s1) >>> 0) / 0x100000000;
  }
}

/**
 * Create a deterministic seed from input data.
 * Uses a simple hash of array dimensions so the same dataset
 * always produces the same sequence, but different datasets diverge.
 */
export const createDataSeed = (vectors: number[][]): number => {
  let hash = vectors.length * 31;
  if (vectors.length > 0 && vectors[0]) {
    hash = (hash + vectors[0].length * 17) | 0;
    // Mix in a few data values for uniqueness
    for (let i = 0; i < Math.min(vectors.length, 8); i++) {
      const v = vectors[i];
      hash = (hash * 31 + ((v[0] * 1e6) | 0)) | 0;
      if (v.length > 1) hash = (hash * 31 + ((v[v.length - 1] * 1e6) | 0)) | 0;
    }
  }
  return hash;
};

export { SeededRNG };

// Vector Operations
export const dotProduct = (vecA: number[], vecB: number[]): number => {
    if (vecA.length === 0 || vecA.length !== vecB.length) return 0;
    return vecA.reduce((sum, val, i) => sum + val * vecB[i], 0);
};

export const magnitude = (vec: number[]): number => {
    return Math.sqrt(vec.reduce((sum, val) => sum + val * val, 0));
};

export const cosineSimilarity = (vecA: number[], vecB: number[]): number => {
    if (vecA.length === 0 || vecA.length !== vecB.length ||
        vecA.some(value => !Number.isFinite(value)) || vecB.some(value => !Number.isFinite(value))) return 0;
    const magA = magnitude(vecA);
    const magB = magnitude(vecB);
    if (magA === 0 || magB === 0) return 0;
    return dotProduct(vecA, vecB) / (magA * magB);
};

/**
 * Retrieval indicator used by the core audit: best finite source-to-summary
 * sentence cosine, clamped to the display range. Multiple correlated matches
 * are not combined as though they were independent probabilities.
 */
export const maxSentenceCosineScore = (similarities: number[]): number => {
    const finite = similarities.filter(Number.isFinite);
    if (finite.length === 0) return 0;
    return Math.max(0, Math.min(1, Math.max(...finite)));
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
 * - Power iteration is stopped at the configured ceiling
 * - Deflation extracts subsequent display components
 * - This approximate PCA is used only for visualization, never clustering
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
    const rng = new SeededRNG(createDataSeed(vectors));
    for (let componentIdx = 0; componentIdx < k; componentIdx++) {
        // Initialize random unit vector (seeded for reproducibility)
        let pc = new Array(dimensions).fill(0).map(() => rng.next() - 0.5);
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
 * Mean silhouette score for a clustering (Rousseeuw, 1987).
 *
 *   s(i) = (b(i) - a(i)) / max(a(i), b(i))
 *
 * where a(i) is the mean distance to points in i's own cluster and b(i) the
 * mean distance to the nearest other cluster. Ranges [-1, 1]; higher is better.
 * O(n^2) per evaluation, so points are subsampled above SILHOUETTE_MAX_N.
 */
const normalizeVector = (vector: number[]): number[] => {
    const mag = magnitude(vector);
    return mag > 0 && Number.isFinite(mag) ? vector.map(value => value / mag) : [];
};

const squaredEuclidean = (a: number[], b: number[]): number => {
    let sum = 0;
    for (let i = 0; i < a.length; i++) {
        const delta = a[i] - b[i];
        sum += delta * delta;
    }
    return sum;
};

const cosineDistanceUnit = (a: number[], b: number[]): number =>
    1 - Math.max(-1, Math.min(1, dotProduct(a, b)));

/** Two independent 32-bit hashes give a stable, order-independent sort key. */
const vectorSignature = (vector: number[]): string => {
    let h1 = 2166136261;
    let h2 = 0x9e3779b9;
    for (let i = 0; i < vector.length; i++) {
        const quantized = Math.round(vector[i] * 1e8);
        h1 = Math.imul(h1 ^ quantized, 16777619);
        h2 = Math.imul(h2 ^ (quantized + i), 2246822519);
    }
    return `${h1 >>> 0}:${h2 >>> 0}`;
};

const orderInvariantSeed = (vectors: number[][]): number => {
    const signatures = vectors.map(vectorSignature).sort();
    let hash = 2166136261;
    for (const signature of signatures) {
        for (let i = 0; i < signature.length; i++) hash = Math.imul(hash ^ signature.charCodeAt(i), 16777619);
    }
    return hash >>> 0;
};

const deterministicSilhouetteSample = (vectors: number[][], maxN: number): number[] => {
    const indices = vectors.map((_, index) => index);
    if (indices.length <= maxN) return indices;
    return indices
        .map(index => ({ index, signature: vectorSignature(vectors[index]) }))
        .sort((a, b) => a.signature.localeCompare(b.signature) || a.index - b.index)
        .slice(0, maxN)
        .map(item => item.index);
};

export const meanSilhouette = (
    vectors: number[][],
    assignments: number[],
    maxN: number = 400
): number => {
    const n = vectors.length;
    if (n < 3 || assignments.length !== n) return -1;
    const clusters = new Set(assignments);
    if (clusters.size < 2 || clusters.size >= n) return -1;
    const normalized = vectors.map(normalizeVector);
    if (normalized.some(vector => vector.length === 0 || vector.length !== normalized[0].length)) return -1;

    const sample = deterministicSilhouetteSample(normalized, maxN);
    let total = 0;
    let counted = 0;
    for (const i of sample) {
        const own = assignments[i];
        const sums = new Map<number, { sum: number; count: number }>();
        for (let j = 0; j < n; j++) {
            if (i === j) continue;
            const cluster = assignments[j];
            const entry = sums.get(cluster) ?? { sum: 0, count: 0 };
            entry.sum += cosineDistanceUnit(normalized[i], normalized[j]);
            entry.count++;
            sums.set(cluster, entry);
        }
        const ownEntry = sums.get(own);
        if (!ownEntry || ownEntry.count === 0) {
            // Rousseeuw's singleton convention: s(i)=0, and it remains in the mean.
            counted++;
            continue;
        }
        const a = ownEntry.sum / ownEntry.count;
        let b = Infinity;
        for (const [cluster, entry] of sums) {
            if (cluster !== own && entry.count > 0) b = Math.min(b, entry.sum / entry.count);
        }
        if (!Number.isFinite(b)) return -1;
        const denominator = Math.max(a, b);
        total += denominator > 0 ? (b - a) / denominator : 0;
        counted++;
    }
    return counted > 0 ? total / counted : -1;
};

const choose2 = (value: number): number => value < 2 ? 0 : value * (value - 1) / 2;

/** Label-invariant adjusted Rand index. */
export const adjustedRandIndex = (a: number[], b: number[]): number => {
    if (a.length !== b.length || a.length < 2) return 0;
    const contingency = new Map<string, number>();
    const rows = new Map<number, number>();
    const columns = new Map<number, number>();
    for (let i = 0; i < a.length; i++) {
        const key = `${a[i]}:${b[i]}`;
        contingency.set(key, (contingency.get(key) ?? 0) + 1);
        rows.set(a[i], (rows.get(a[i]) ?? 0) + 1);
        columns.set(b[i], (columns.get(b[i]) ?? 0) + 1);
    }
    const totalPairs = choose2(a.length);
    if (totalPairs === 0) return 0;
    const cellPairs = [...contingency.values()].reduce((sum, count) => sum + choose2(count), 0);
    const rowPairs = [...rows.values()].reduce((sum, count) => sum + choose2(count), 0);
    const columnPairs = [...columns.values()].reduce((sum, count) => sum + choose2(count), 0);
    const expected = rowPairs * columnPairs / totalPairs;
    const maximum = 0.5 * (rowPairs + columnPairs);
    const denominator = maximum - expected;
    if (Math.abs(denominator) < 1e-12) return Math.abs(cellPairs - expected) < 1e-12 ? 1 : 0;
    return Math.max(-1, Math.min(1, (cellPairs - expected) / denominator));
};

/** Internal fit. A downstream unpartitioned sentinel is not evidence of one topic. */
interface KMeansFit {
    assignments: number[];
    centroids: number[][];
    inertia: number;
    iterations: number;
}

const mean = (values: number[]): number =>
    values.length > 0 ? values.reduce((sum, value) => sum + value, 0) / values.length : 0;

const canonicalizeFit = (fit: KMeansFit): KMeansFit => {
    const order = fit.centroids
        .map((centroid, index) => ({ centroid, index, signature: vectorSignature(centroid) }))
        .sort((a, b) => a.signature.localeCompare(b.signature) || a.index - b.index);
    const remap = new Map(order.map((item, canonical) => [item.index, canonical]));
    return {
        ...fit,
        assignments: fit.assignments.map(cluster => remap.get(cluster) ?? cluster),
        centroids: order.map(item => item.centroid),
    };
};

const fitWithRestarts = (
    vectors: number[][],
    k: number,
    restarts: number,
    iterations: number,
    seed: number,
): { best: KMeansFit; fits: KMeansFit[] } => {
    const fits = Array.from({ length: restarts }, (_, restart) => canonicalizeFit(runKMeansStep(
        vectors,
        k,
        iterations,
        new SeededRNG((seed + Math.imul(k + 1, 104729) + Math.imul(restart + 1, 7919)) >>> 0),
    )));
    const best = [...fits].sort((a, b) => a.inertia - b.inertia || a.iterations - b.iterations)[0];
    return { best, fits };
};

const clusterSizesFor = (assignments: number[], k: number): number[] => {
    const sizes = new Array(k).fill(0);
    for (const assignment of assignments) if (assignment >= 0 && assignment < k) sizes[assignment]++;
    return sizes;
};

const withoutReplacementSample = (n: number, size: number, rng: SeededRNG): number[] => {
    const indices = Array.from({ length: n }, (_, index) => index);
    for (let i = indices.length - 1; i > 0; i--) {
        const j = Math.floor(rng.next() * (i + 1));
        [indices[i], indices[j]] = [indices[j], indices[i]];
    }
    return indices.slice(0, size).sort((a, b) => a - b);
};

const estimateSubsampleStability = (
    vectors: number[][],
    fullAssignments: number[],
    k: number,
    runs: number,
    fraction: number,
    minClusterSize: number,
    restarts: number,
    iterations: number,
    seed: number,
): number | null => {
    const sampleSize = Math.min(vectors.length - 1, Math.round(vectors.length * fraction));
    // Increasing a subsample to fit k can silently turn it into the entire data
    // set. Such a run does not measure sensitivity to removing observations.
    if (sampleSize < k * minClusterSize) return null;
    const scores: number[] = [];
    for (let run = 0; run < runs; run++) {
        const sample = withoutReplacementSample(vectors.length, sampleSize, new SeededRNG((seed + Math.imul(run + 1, 65537)) >>> 0));
        const subset = sample.map(index => vectors[index]);
        const { best } = fitWithRestarts(subset, k, restarts, iterations, (seed + Math.imul(run + 1, 99991)) >>> 0);
        const sizes = clusterSizesFor(best.assignments, k);
        scores.push(sizes.every(size => size > 0)
            ? adjustedRandIndex(sample.map(index => fullAssignments[index]), best.assignments)
            : 0);
    }
    return mean(scores);
};

/**
 * Measures the fraction of local-neighbour relations that remain inside the
 * assigned group. Method dependence is screened separately against the
 * average-linkage sensitivity partition below.
 */
const neighborhoodCoherence = (vectors: number[][], assignments: number[]): number => {
    const n = vectors.length;
    if (n < 3) return 0;
    const neighborCount = Math.min(5, Math.max(1, Math.floor(Math.sqrt(n)) - 1));
    let same = 0;
    let total = 0;
    for (let i = 0; i < n; i++) {
        const nearest = Array.from({ length: n }, (_, j) => j)
            .filter(j => j !== i)
            .map(j => ({ j, distance: cosineDistanceUnit(vectors[i], vectors[j]) }))
            .sort((a, b) => a.distance - b.distance || a.j - b.j)
            .slice(0, neighborCount);
        for (const { j } of nearest) {
            if (assignments[i] === assignments[j]) same++;
            total++;
        }
    }
    const localAgreement = total > 0 ? same / total : 0;
    return localAgreement;
};

/**
 * Deterministic average-linkage hierarchy under cosine distance.
 *
 * Single linkage was previously used as the method-sensitivity check. Its
 * chaining behaviour allowed one locally close pair to join otherwise compact
 * groups and rejected stable spherical partitions for the wrong reason.
 * Average linkage still makes a meaningfully different hierarchical assumption
 * from K-Means, but bases each merge on all cross-cluster pairs rather than a
 * single edge. One hierarchy supplies every requested k.
 */
const averageLinkageHierarchy = (
    vectors: number[][],
    maximumReportedK: number,
): Map<number, number[]> => {
    type Cluster = { id: number; members: number[]; size: number };
    const active = new Map<number, Cluster>();
    vectors.forEach((_, index) => active.set(index, { id: index, members: [index], size: 1 }));
    let nextClusterId = vectors.length;
    const distances = new Map<string, number>();
    const key = (left: number, right: number): string =>
        left < right ? `${left}:${right}` : `${right}:${left}`;
    const getDistance = (left: number, right: number): number =>
        distances.get(key(left, right)) ?? Infinity;

    for (let left = 0; left < vectors.length; left++) {
        for (let right = left + 1; right < vectors.length; right++) {
            distances.set(key(left, right), cosineDistanceUnit(vectors[left], vectors[right]));
        }
    }

    const cuts = new Map<number, number[]>();
    const recordCut = (): void => {
        if (active.size < 2 || active.size > maximumReportedK) return;
        const assignments = new Array(vectors.length).fill(-1);
        [...active.values()]
            .sort((left, right) => left.members[0] - right.members[0])
            .forEach((cluster, label) => {
                cluster.members.forEach(member => { assignments[member] = label; });
            });
        cuts.set(active.size, assignments);
    };

    recordCut();
    while (active.size > 2) {
        const ids = [...active.keys()].sort((a, b) => a - b);
        let selectedLeft = ids[0];
        let selectedRight = ids[1];
        let selectedDistance = getDistance(selectedLeft, selectedRight);
        for (let leftIndex = 0; leftIndex < ids.length; leftIndex++) {
            for (let rightIndex = leftIndex + 1; rightIndex < ids.length; rightIndex++) {
                const left = ids[leftIndex];
                const right = ids[rightIndex];
                const distance = getDistance(left, right);
                if (
                    distance < selectedDistance - 1e-12 ||
                    (Math.abs(distance - selectedDistance) <= 1e-12 &&
                        (left < selectedLeft || (left === selectedLeft && right < selectedRight)))
                ) {
                    selectedLeft = left;
                    selectedRight = right;
                    selectedDistance = distance;
                }
            }
        }

        const leftCluster = active.get(selectedLeft)!;
        const rightCluster = active.get(selectedRight)!;
        const mergedId = nextClusterId++;
        const pendingDistances: Array<[number, number]> = [];
        for (const otherId of ids) {
            if (otherId === selectedLeft || otherId === selectedRight) continue;
            const weightedDistance = (
                leftCluster.size * getDistance(selectedLeft, otherId) +
                rightCluster.size * getDistance(selectedRight, otherId)
            ) / (leftCluster.size + rightCluster.size);
            pendingDistances.push([otherId, weightedDistance]);
        }

        for (const distanceKey of [...distances.keys()]) {
            const [left, right] = distanceKey.split(':').map(Number);
            if (
                left === selectedLeft || right === selectedLeft ||
                left === selectedRight || right === selectedRight
            ) distances.delete(distanceKey);
        }
        active.delete(selectedLeft);
        active.delete(selectedRight);
        active.set(mergedId, {
            id: mergedId,
            members: [...leftCluster.members, ...rightCluster.members].sort((a, b) => a - b),
            size: leftCluster.size + rightCluster.size,
        });
        pendingDistances.forEach(([otherId, distance]) => {
            distances.set(key(mergedId, otherId), distance);
        });
        recordCut();
    }
    return cuts;
};

const unavailableClustering = (
    originalLength: number,
    validLength: number,
    dimensions: number,
    reason: string,
    candidates: ClusteringCandidateDiagnostic[] = [],
    analysisDimensions: number = dimensions,
    projectionMethod: ClusteringDiagnostics['projectionMethod'] = 'none',
    projectionDistanceCorrelation: number = 1,
): { assignments: number[]; k: number; diagnostics: ClusteringDiagnostics } => {
    const algorithms = ANALYSIS_CONFIG.algorithms;
    return {
        assignments: new Array(originalLength).fill(0),
        k: 1,
        diagnostics: {
            methodVersion: 'spherical-kmeans-stability-v4',
            status: 'unavailable',
            usableForDownstream: false,
            reason,
            sampleSize: validLength,
            inputDimensions: dimensions,
            analysisDimensions,
            projectionMethod,
            projectionDistanceCorrelation,
            selectedK: 1,
            silhouette: null,
            stability: null,
            neighborhoodAgreement: null,
            methodAgreement: null,
            clusterSizes: validLength > 0 ? [validLength] : [],
            candidateDiagnostics: candidates,
            distanceMetric: 'cosine',
            normalized: true,
            restarts: algorithms.kmeansRestarts,
            stabilityRuns: algorithms.clusterStabilityRuns,
            thresholds: {
                minimumSampleSize: algorithms.minClusteringSampleSize,
                minimumClusterSize: algorithms.minClusterSize,
                minimumSilhouette: algorithms.minSilhouette,
                minimumStability: algorithms.minClusterStability,
                minimumNeighborhoodAgreement: algorithms.minNeighborhoodAgreement,
                minimumMethodAgreement: algorithms.minClusteringMethodAgreement,
                minimumProjectionDistanceCorrelation: algorithms.minProjectionDistanceCorrelation,
            },
            limitations: [
                'Semantic groups are exploratory geometric partitions, not validated topics, stakeholder categories, or causal strata.',
                'Passing internal separation and stability checks does not establish external construct validity.',
                'Thresholds are configured screening rules, not calibrated tests for the existence of topics or disagreement.',
            ],
        },
    };
};

/**
 * Deterministic spherical K-Means with internal diagnostic screening.
 *
 * The method uses unit-normalized source embeddings (cosine geometry),
 * repeated K-Means++ starts, convergence stopping, silhouette with singleton
 * zeroes, and without-replacement resampling stability. If no candidate passes
 * every diagnostic gate, the result is deliberately unpartitioned and cluster-
 * conditioned downstream modules must remain unavailable.
 */
export const computeAutoKMeans = (
    vectors: number[][],
): { assignments: number[]; k: number; diagnostics: ClusteringDiagnostics } => {
    const algorithms = ANALYSIS_CONFIG.algorithms;
    const dimensions = vectors[0]?.length ?? 0;
    const validEntries = vectors
        .map((vector, originalIndex) => ({ vector: normalizeVector(vector), originalIndex }))
        .filter(entry => entry.vector.length === dimensions && dimensions > 0 && entry.vector.every(Number.isFinite))
        .map(entry => ({ ...entry, signature: vectorSignature(entry.vector) }))
        .sort((a, b) => a.signature.localeCompare(b.signature) || a.originalIndex - b.originalIndex);

    if (validEntries.length !== vectors.length) {
        return unavailableClustering(
            vectors.length,
            validEntries.length,
            dimensions,
            `Semantic grouping requires a complete common embedding space; ${vectors.length - validEntries.length} record(s) had invalid or zero embeddings.`,
        );
    }

    if (validEntries.length < algorithms.minClusteringSampleSize) {
        return unavailableClustering(
            vectors.length,
            validEntries.length,
            dimensions,
            `Semantic grouping requires at least ${algorithms.minClusteringSampleSize} valid source embeddings; ${validEntries.length} were available.`,
        );
    }

    const normalized = validEntries.map(entry => entry.vector);
    const seed = orderInvariantSeed(normalized);
    // Version 4 fits the original normalized embedding vectors. A projected
    // rejection cannot rule out structure in the original space, while a
    // projected acceptance can depend on projection artefacts.
    const workingVectors = normalized;
    const projectionMethod: ClusteringDiagnostics['projectionMethod'] = 'none';
    const projectionDistanceCorrelation = 1;
    const maxK = Math.min(algorithms.maxClusters, Math.floor(workingVectors.length / algorithms.minClusterSize));
    const methodSampleSize = Math.min(
        workingVectors.length,
        Math.max(maxK * algorithms.minClusterSize, algorithms.clusterMethodSensitivityMaxSampleSize),
    );
    const methodSampleIndices = methodSampleSize === workingVectors.length
        ? Array.from({ length: workingVectors.length }, (_, index) => index)
        : withoutReplacementSample(
            workingVectors.length,
            methodSampleSize,
            new SeededRNG((seed ^ 0x6d2b79f5) >>> 0),
        ).sort((a, b) => a - b);
    const methodHierarchy = averageLinkageHierarchy(
        methodSampleIndices.map(index => workingVectors[index]),
        maxK,
    );
    const candidates: Array<ClusteringCandidateDiagnostic & { assignments: number[] }> = [];
    const stabilitySampleSize = Math.min(workingVectors.length - 1, Math.round(workingVectors.length * algorithms.clusterSubsampleFraction));

    for (let k = 2; k <= maxK; k++) {
        const { best, fits } = fitWithRestarts(workingVectors, k, algorithms.kmeansRestarts, algorithms.kmeansIterations, seed);
        const sizes = clusterSizesFor(best.assignments, k);
        const silhouette = meanSilhouette(workingVectors, best.assignments);
        const restartStability = mean(fits.map(fit => adjustedRandIndex(best.assignments, fit.assignments)));
        const subsampleStability = estimateSubsampleStability(
            workingVectors,
            best.assignments,
            k,
            algorithms.clusterStabilityRuns,
            algorithms.clusterSubsampleFraction,
            algorithms.minClusterSize,
            algorithms.kmeansRestarts,
            algorithms.kmeansIterations,
            seed,
        );
        const neighborhoodAgreement = neighborhoodCoherence(workingVectors, best.assignments);
        const methodAssignments = methodHierarchy.get(k);
        const methodAgreement = methodAssignments
            ? adjustedRandIndex(
                methodSampleIndices.map(index => best.assignments[index]),
                methodAssignments,
            )
            : 0;
        const rejectionReasons: string[] = [];
        if (stabilitySampleSize < k * algorithms.minClusterSize) rejectionReasons.push('insufficient-subsample-size');
        if (Math.min(...sizes) < algorithms.minClusterSize) rejectionReasons.push('minimum-cluster-size');
        if (silhouette <= algorithms.minSilhouette) rejectionReasons.push('nonpositive-separation');
        if (subsampleStability !== null && subsampleStability < algorithms.minClusterStability) rejectionReasons.push('subsample-stability');
        if (neighborhoodAgreement < algorithms.minNeighborhoodAgreement) rejectionReasons.push('neighborhood-coherence');
        if (methodAgreement < algorithms.minClusteringMethodAgreement) rejectionReasons.push('method-sensitivity');
        candidates.push({
            k,
            silhouette,
            fullSpaceSilhouette: projectionMethod === 'none' ? silhouette : null,
            restartStability,
            subsampleStability,
            stabilitySampleSize,
            neighborhoodAgreement,
            methodAgreement,
            minimumClusterSize: Math.min(...sizes),
            clusterSizes: sizes,
            inertia: best.inertia,
            eligible: rejectionReasons.length === 0,
            rejectionReasons,
            assignments: best.assignments,
        });
    }

    const eligibleByWorkingSpace = [...candidates]
        .filter(candidate => candidate.eligible)
        .sort((a, b) => b.silhouette - a.silhouette || (b.subsampleStability ?? -1) - (a.subsampleStability ?? -1) || a.k - b.k);
    let selected: typeof eligibleByWorkingSpace[number] | undefined;
    for (const candidate of eligibleByWorkingSpace) {
        candidate.fullSpaceSilhouette ??= meanSilhouette(normalized, candidate.assignments, 120);
        if (candidate.fullSpaceSilhouette > algorithms.minSilhouette) {
            selected = candidate;
            break;
        }
        candidate.eligible = false;
        candidate.rejectionReasons.push('full-space-silhouette');
    }
    const publicCandidates = candidates.map(({ assignments: _assignments, ...candidate }) => candidate);
    if (!selected) {
        return unavailableClustering(
            vectors.length,
            validEntries.length,
            dimensions,
            (() => {
                const best = [...publicCandidates].sort((a, b) => b.silhouette - a.silhouette || a.k - b.k)[0];
                if (!best) return 'No candidate partition could be evaluated.';
                return `No candidate met all configured internal robustness checks. The highest-separation candidate had k=${best.k}, silhouette=${best.silhouette.toFixed(3)}, resampling ARI=${best.subsampleStability === null ? 'not assessed' : best.subsampleStability.toFixed(3)}, neighbourhood coherence=${best.neighborhoodAgreement.toFixed(3)}, and method agreement=${best.methodAgreement.toFixed(3)}. Its checks below threshold were ${best.rejectionReasons.join(', ') || 'none'}. Records remain unpartitioned. This may reflect overlapping contributions or sensitivity to the clustering method; it does not establish consensus or absence of distinct viewpoints.`;
            })(),
            publicCandidates,
            workingVectors[0]?.length ?? dimensions,
            projectionMethod,
            projectionDistanceCorrelation,
        );
    }

    const assignments = new Array(vectors.length).fill(-1);
    validEntries.forEach((entry, sortedIndex) => { assignments[entry.originalIndex] = selected.assignments[sortedIndex]; });
    const diagnostics: ClusteringDiagnostics = {
        methodVersion: 'spherical-kmeans-stability-v4',
        status: 'available',
        usableForDownstream: true,
        reason: 'Partition passed all configured internal diagnostic gates.',
        sampleSize: validEntries.length,
        inputDimensions: dimensions,
        analysisDimensions: workingVectors[0]?.length ?? dimensions,
        projectionMethod: projectionMethod,
        projectionDistanceCorrelation: projectionDistanceCorrelation,
        selectedK: selected.k,
        silhouette: selected.fullSpaceSilhouette,
        stability: selected.subsampleStability,
        neighborhoodAgreement: selected.neighborhoodAgreement,
        methodAgreement: selected.methodAgreement,
        clusterSizes: selected.clusterSizes,
        candidateDiagnostics: publicCandidates,
        distanceMetric: 'cosine',
        normalized: true,
        restarts: algorithms.kmeansRestarts,
        stabilityRuns: algorithms.clusterStabilityRuns,
        thresholds: {
            minimumSampleSize: algorithms.minClusteringSampleSize,
            minimumClusterSize: algorithms.minClusterSize,
            minimumSilhouette: algorithms.minSilhouette,
            minimumStability: algorithms.minClusterStability,
            minimumNeighborhoodAgreement: algorithms.minNeighborhoodAgreement,
            minimumMethodAgreement: algorithms.minClusteringMethodAgreement,
            minimumProjectionDistanceCorrelation: algorithms.minProjectionDistanceCorrelation,
        },
        limitations: [
            'Semantic groups are exploratory geometric partitions, not validated topics, stakeholder categories, or causal strata.',
            'The diagnostics measure internal run stability and geometry; they do not establish external construct validity.',
            'Thresholds are configured screening rules, not calibrated tests for the existence of topics or disagreement.',
            'K-Means favors compact cosine-space partitions. Irregular or varying-density structure may remain unavailable.',
            `Strong disagreement with a same-k cosine average-linkage sensitivity partition disables downstream cluster-conditioned claims (method-sensitivity n=${methodSampleSize}).`,
        ],
    };
    return { assignments, k: selected.k, diagnostics };
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
 * from existing centroids. The published O(log k) result concerns the ordinary
 * Euclidean k-means objective; no such guarantee is claimed for this spherical
 * variant, which re-normalizes centroids after every update.
 *
 * @param vectors - Input data points
 * @param k - Number of clusters to initialise
 * @returns Array of k centroid vectors
 */
const kMeansPlusPlusInit = (vectors: number[][], k: number, rng: SeededRNG): number[][] => {
    const n = vectors.length;
    // 1. Choose first centroid uniformly at random (seeded)
    const centroids: number[][] = [vectors[Math.floor(rng.next() * n)]];

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

        let r = rng.next() * totalDist;
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
 * - K-Means++ seeding is repeated to reduce sensitivity to local solutions
 * - Spherical Lloyd updates cost O(k * n * d * i) up to the iteration limit
 * - Assignment convergence stops the algorithm before its iteration ceiling
 * - Empty clusters are deterministically re-seeded from the worst-fit point
 *
 * @param vectors - Input data points
 * @param k - Number of clusters
 * @param maxIterations - Maximum iterations (from config)
 * @returns Cluster assignments and final centroids
 */
const runKMeansStep = (
    vectors: number[][],
    k: number,
    maxIterations: number = ANALYSIS_CONFIG.algorithms.kmeansIterations,
    rng?: SeededRNG
): KMeansFit => {
    const localRng = rng || new SeededRNG(createDataSeed(vectors));
    let centroids = kMeansPlusPlusInit(vectors, k, localRng);
    let assignments = new Array(vectors.length).fill(-1);
    let iterations = 0;

    for (let iter = 0; iter < maxIterations; iter++) {
        iterations = iter + 1;
        // Assignment step: assign each point to nearest centroid
        const nextAssignments = vectors.map(vec => {
            let minDist = Infinity;
            let cluster = 0;
            centroids.forEach((c, i) => {
                const dist = squaredEuclidean(vec, c);
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
            const cluster = nextAssignments[i];
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
                newCentroids[i] = normalizeVector(newCentroids[i]);
            } else {
                // Deterministically split off the currently worst represented point.
                let worstIndex = 0;
                let worstDistance = -Infinity;
                for (let point = 0; point < vectors.length; point++) {
                    const assigned = nextAssignments[point];
                    const distance = squaredEuclidean(vectors[point], centroids[assigned]);
                    if (distance > worstDistance) {
                        worstDistance = distance;
                        worstIndex = point;
                    }
                }
                newCentroids[i] = [...vectors[worstIndex]];
            }
        }
        const converged = assignments.every((assignment, index) => assignment === nextAssignments[index]);
        assignments = nextAssignments;
        centroids = newCentroids;
        if (converged) break;
    }
    // Ensure assignments and objective correspond to the final centroids.
    assignments = vectors.map(vec => {
        let bestCluster = 0;
        let bestDistance = Infinity;
        centroids.forEach((centroid, index) => {
            const distance = squaredEuclidean(vec, centroid);
            if (distance < bestDistance) {
                bestDistance = distance;
                bestCluster = index;
            }
        });
        return bestCluster;
    });
    const inertia = vectors.reduce(
        (sum, vector, index) => sum + squaredEuclidean(vector, centroids[assignments[index]]),
        0,
    );
    return { assignments, centroids, inertia, iterations };
};

/**
 * Mutual k-Nearest Neighbors graph construction.
 *
 * An edge between participants i and j exists iff both rank each other
 * among their k most similar neighbors. This mutual requirement produces
 * a sparse graph often used in spectral clustering and manifold learning
 * (von Luxburg, 2007). Mutual inclusion is a construction rule, not a
 * confidence guarantee about any substantive relationship.
 *
 * @param embeddings - Per-participant embedding vectors
 * @param participantIds - Matching participant ID strings
 * @param k - Number of nearest neighbors (chosen separately and reported)
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
  const dimensions = embeddings[0]?.length ?? 0;
  const valid = embeddings.map(vector =>
    dimensions > 0 &&
    vector.length === dimensions &&
    vector.every(Number.isFinite) &&
    vector.some(value => value !== 0),
  );

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
    if (!valid[i]) {
      knnSets[i] = new Set();
      continue;
    }
    const sims: { idx: number; sim: number }[] = [];
    for (let j = 0; j < n; j++) {
      if (i === j || !valid[j]) continue;
      sims.push({ idx: j, sim: simCache[i * n + j] });
    }
    sims.sort((a, b) =>
      b.sim - a.sim ||
      participantIds[a.idx].localeCompare(participantIds[b.idx]) ||
      a.idx - b.idx,
    );
    // Zero/negative cosine links have no positive semantic overlap and should
    // not be manufactured merely because every node is forced to choose k.
    knnSets[i] = new Set(sims.filter(item => item.sim > 0).slice(0, effectiveK).map(s => s.idx));
  }

  // Mutual kNN: edge exists iff both nodes rank each other in top-k
  const edges: { source: string; target: string; weight: number }[] = [];
  for (let i = 0; i < n; i++) {
    for (let j = i + 1; j < n; j++) {
      if (valid[i] && valid[j] && knnSets[i].has(j) && knnSets[j].has(i)) {
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

/** Sparse, deterministic display-graph heuristic. There is no universal k. */
export const chooseMutualKnnK = (sampleSize: number): number =>
  Math.max(1, Math.min(6, Math.ceil(Math.sqrt(Math.max(1, sampleSize)))));

// ── Network Graph Analysis ─────────────────────────────────────────────────────

import { NetworkAnalysis, NodeMetrics, NetworkNode, NetworkEdge } from '../types';

/**
 * Comprehensive graph analysis for the mutual k-NN network.
 *
 * Computes per-node metrics (degree, betweenness, clustering coefficient,
 * bridge status) and global metrics (modularity, density, components).
 *
 * References:
 * - Betweenness centrality: Brandes (2001), O(VE) algorithm
 * - Modularity: Newman (2004), compares intra-community edges to null model
 * - Clustering coefficient: Watts & Strogatz (1998)
 */
export const analyzeNetworkGraph = (
  nodes: NetworkNode[],
  edges: NetworkEdge[]
): NetworkAnalysis => {
  const n = nodes.length;
  const nodeIds = nodes.map(nd => nd.id);
  const idToIdx = new Map(nodeIds.map((id, i) => [id, i]));
  const clusterOf = new Map(nodes.map(nd => [nd.id, nd.clusterId]));

  // Build adjacency list + weight map
  const adj: Set<number>[] = Array.from({ length: n }, () => new Set());
  const weightMap = new Map<string, number>();
  for (const e of edges) {
    const i = idToIdx.get(e.source)!;
    const j = idToIdx.get(e.target)!;
    if (i === undefined || j === undefined) continue;
    adj[i].add(j);
    adj[j].add(i);
    weightMap.set(`${i}-${j}`, e.weight);
    weightMap.set(`${j}-${i}`, e.weight);
  }

  // ── Per-node: degree, weighted degree, cross/intra cluster edges ───────
  const nodeMetrics: Record<string, NodeMetrics> = {};
  const degrees: number[] = new Array(n).fill(0);

  for (let i = 0; i < n; i++) {
    const id = nodeIds[i];
    const neighbors = adj[i];
    const degree = neighbors.size;
    degrees[i] = degree;

    let weightedDegree = 0;
    let crossCluster = 0;
    let intraCluster = 0;
    const myCluster = clusterOf.get(id)!;

    for (const j of neighbors) {
      weightedDegree += weightMap.get(`${i}-${j}`) || 0;
      if (clusterOf.get(nodeIds[j]) === myCluster) intraCluster++;
      else crossCluster++;
    }

    nodeMetrics[id] = {
      id,
      degree,
      weightedDegree,
      clusteringCoefficient: 0, // computed below
      betweennessCentrality: 0, // computed below
      isBridge: crossCluster > 0 && intraCluster > 0,
      crossClusterEdges: crossCluster,
      intraClusterEdges: intraCluster,
    };
  }

  // ── Per-node: clustering coefficient (Watts & Strogatz, 1998) ──────────
  for (let i = 0; i < n; i++) {
    const neighbors = Array.from(adj[i]);
    const k = neighbors.length;
    if (k < 2) { nodeMetrics[nodeIds[i]].clusteringCoefficient = 0; continue; }

    let triangles = 0;
    for (let a = 0; a < k; a++) {
      for (let b = a + 1; b < k; b++) {
        if (adj[neighbors[a]].has(neighbors[b])) triangles++;
      }
    }
    nodeMetrics[nodeIds[i]].clusteringCoefficient = (2 * triangles) / (k * (k - 1));
  }

  // ── Per-node: betweenness centrality (Brandes, 2001) ───────────────────
  // O(V * E) — fine for mutual-kNN which is sparse
  const betweenness = new Float64Array(n);
  for (let s = 0; s < n; s++) {
    // BFS from source s
    const stack: number[] = [];
    const pred: number[][] = Array.from({ length: n }, () => []);
    const sigma = new Float64Array(n); sigma[s] = 1;
    const dist = new Int32Array(n).fill(-1); dist[s] = 0;
    const queue: number[] = [s];
    let head = 0;

    while (head < queue.length) {
      const v = queue[head++];
      stack.push(v);
      for (const w of adj[v]) {
        // First visit
        if (dist[w] < 0) {
          dist[w] = dist[v] + 1;
          queue.push(w);
        }
        // Shortest path via v
        if (dist[w] === dist[v] + 1) {
          sigma[w] += sigma[v];
          pred[w].push(v);
        }
      }
    }

    // Back-propagation of dependencies
    const delta = new Float64Array(n);
    while (stack.length > 0) {
      const w = stack.pop()!;
      for (const v of pred[w]) {
        delta[v] += (sigma[v] / sigma[w]) * (1 + delta[w]);
      }
      if (w !== s) betweenness[w] += delta[w];
    }
  }

  // Normalize betweenness centrality for undirected graphs.
  // Brandes' algorithm on undirected graphs counts each shortest path s→t
  // once from each endpoint, so the raw score is 2x the true betweenness.
  // Normalization: divide by 2 (undirected correction), then by (n-1)(n-2)/2
  // to get values in [0, 1]. Combined: multiply by 1/((n-1)(n-2)).
  const normFactor = n > 2 ? 1 / ((n - 1) * (n - 2)) : 1;
  for (let i = 0; i < n; i++) {
    nodeMetrics[nodeIds[i]].betweennessCentrality = betweenness[i] * normFactor;
  }

  // ── Global: modularity (Newman, 2004) ──────────────────────────────────
  // Q = (1/2m) * Σ_{i,j} [A_ij - (k_i * k_j)/(2m)] * δ(c_i, c_j)
  //
  // The sum runs over ALL ordered intra-community pairs, including the
  // diagonal i == j. Since the graph has no self-loops (A_ii = 0) and
  // δ(c_i, c_i) = 1, the diagonal contributes the strictly negative term
  //     -(1/2m) * Σ_i k_i² / (2m)
  //
  // v2 fix: a previous implementation iterated only i < j and doubled the
  // result, which silently dropped that diagonal term and inflated Q by
  // Σ k_i² / (2m)². On sparse graphs this is large — on a two-triangle test
  // graph it reported Q = 0.531 against a true Q = 0.357 — making poorly
  // separated clusters appear well partitioned.
  const m = edges.length; // number of undirected edges
  let Q = 0;
  if (m > 0) {
    const m2 = 2 * m;
    // Off-diagonal intra-community pairs (each unordered pair counted twice).
    for (let i = 0; i < n; i++) {
      for (let j = i + 1; j < n; j++) {
        if (clusterOf.get(nodeIds[i]) !== clusterOf.get(nodeIds[j])) continue;
        const A_ij = adj[i].has(j) ? 1 : 0;
        Q += 2 * (A_ij - (degrees[i] * degrees[j]) / m2);
      }
    }
    // Diagonal term (i == j): A_ii = 0, so only the null model contributes.
    for (let i = 0; i < n; i++) {
      Q -= (degrees[i] * degrees[i]) / m2;
    }
    Q /= m2;
  }

  // ── Global: connected components (BFS) ─────────────────────────────────
  const visited = new Uint8Array(n);
  let components = 0;
  for (let i = 0; i < n; i++) {
    if (visited[i]) continue;
    components++;
    const bfsQueue = [i];
    visited[i] = 1;
    let bfsHead = 0;
    while (bfsHead < bfsQueue.length) {
      const v = bfsQueue[bfsHead++];
      for (const w of adj[v]) {
        if (!visited[w]) { visited[w] = 1; bfsQueue.push(w); }
      }
    }
  }

  // ── Global: density, avg degree, avg clustering ────────────────────────
  const maxEdges = n > 1 ? (n * (n - 1)) / 2 : 1;
  const density = edges.length / maxEdges;
  const avgDeg = n > 0 ? degrees.reduce((a, b) => a + b, 0) / n : 0;
  const ccValues = Object.values(nodeMetrics).map(nm => nm.clusteringCoefficient);
  const avgCC = ccValues.length > 0 ? ccValues.reduce((a, b) => a + b, 0) / ccValues.length : 0;

  // ── Classify special nodes ─────────────────────────────────────────────
  // Hub: degree > mean + 1 standard deviation (z-score > 1).
  // This is more principled than an arbitrary 2x multiplier and adapts
  // to the actual degree distribution of the network.
  const degreeVariance = n > 1
    ? degrees.reduce((sum, d) => sum + (d - avgDeg) ** 2, 0) / (n - 1)
    : 0;
  const degreeStdDev = Math.sqrt(degreeVariance);
  const hubThreshold = Math.max(2, avgDeg + degreeStdDev);
  const hubNodes = nodeIds.filter((id, i) => degrees[i] >= hubThreshold);

  // Connector candidate: at least one retained edge to the node's assigned
  // group and at least one to another group. A degree-1 cross-group leaf is
  // peripheral, not a connector between neighborhoods.
  const bridgeNodes = nodeIds.filter(id =>
    nodeMetrics[id].crossClusterEdges > 0 && nodeMetrics[id].intraClusterEdges > 0
  );

  const peripheralNodes = nodeIds.filter((id, i) => degrees[i] <= 1);

  return {
    nodeMetrics,
    modularity: Q,
    density,
    avgClusteringCoefficient: avgCC,
    connectedComponents: components,
    avgDegree: avgDeg,
    bridgeNodes,
    hubNodes,
    peripheralNodes,
  };
};
