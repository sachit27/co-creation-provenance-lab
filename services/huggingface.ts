/**
 * HuggingFace Transformers Service (Tier 2 Fallback)
 * 
 * Uses @xenova/transformers for browser-based inference with SOTA models.
 * This provides high-quality NLP when AI APIs are unavailable.
 * 
 * Models used:
 * - Sentiment: Xenova/distilbert-base-uncased-finetuned-sst-2-english
 * - NLI: Xenova/nli-deberta-v3-small  
 * - Embeddings: Xenova/all-MiniLM-L6-v2
 */

import { pipeline, env } from '@xenova/transformers';
import { extractKeywords as extractCandidates } from './textUtils';

// Configure for browser environment
env.allowLocalModels = false;
env.useBrowserCache = true;

// Singleton pipelines (lazy-loaded)
let sentimentPipeline: any = null;
let nliPipeline: any = null;
let embeddingPipeline: any = null;

// Loading state
let isLoadingSentiment = false;
let isLoadingNLI = false;
let isLoadingEmbedding = false;

// Model availability flags
let hfAvailable: boolean | null = null;

/**
 * Check if HuggingFace Transformers is available
 */
export const checkHuggingFaceAvailable = async (): Promise<boolean> => {
    if (hfAvailable !== null) return hfAvailable;

    try {
        // Quick check - try to import the library
        const { pipeline: testPipeline } = await import('@xenova/transformers');
        hfAvailable = typeof testPipeline === 'function';
        console.log('[HuggingFace] Availability check:', hfAvailable);
        return hfAvailable;
    } catch (e) {
        console.warn('[HuggingFace] Not available:', e);
        hfAvailable = false;
        return false;
    }
};

/**
 * Initialize sentiment analysis pipeline
 */
const getSentimentPipeline = async () => {
    if (sentimentPipeline) return sentimentPipeline;
    if (isLoadingSentiment) {
        // Wait for existing load
        while (isLoadingSentiment) {
            await new Promise(r => setTimeout(r, 100));
        }
        return sentimentPipeline;
    }

    isLoadingSentiment = true;
    try {
        console.log('[HuggingFace] Loading sentiment model...');
        sentimentPipeline = await pipeline(
            'sentiment-analysis',
            'Xenova/distilbert-base-uncased-finetuned-sst-2-english'
        );
        console.log('[HuggingFace] Sentiment model loaded');
        return sentimentPipeline;
    } finally {
        isLoadingSentiment = false;
    }
};

/**
 * Initialize NLI (Natural Language Inference) pipeline
 */
const getNLIPipeline = async () => {
    if (nliPipeline) return nliPipeline;
    if (isLoadingNLI) {
        while (isLoadingNLI) {
            await new Promise(r => setTimeout(r, 100));
        }
        return nliPipeline;
    }

    isLoadingNLI = true;
    try {
        console.log('[HuggingFace] Loading NLI model...');
        nliPipeline = await pipeline(
            'zero-shot-classification',
            'Xenova/nli-deberta-v3-small'
        );
        console.log('[HuggingFace] NLI model loaded');
        return nliPipeline;
    } finally {
        isLoadingNLI = false;
    }
};

/**
 * Initialize embedding pipeline
 */
const getEmbeddingPipeline = async () => {
    if (embeddingPipeline) return embeddingPipeline;
    if (isLoadingEmbedding) {
        while (isLoadingEmbedding) {
            await new Promise(r => setTimeout(r, 100));
        }
        return embeddingPipeline;
    }

    isLoadingEmbedding = true;
    try {
        console.log('[HuggingFace] Loading embedding model...');
        embeddingPipeline = await pipeline(
            'feature-extraction',
            'Xenova/all-MiniLM-L6-v2'
        );
        console.log('[HuggingFace] Embedding model loaded');
        return embeddingPipeline;
    } finally {
        isLoadingEmbedding = false;
    }
};

// ============================================================================
// PUBLIC API
// ============================================================================

export interface HFSentimentResult {
    score: number;       // -1 to 1 scale (negative to positive)
    label: 'positive' | 'negative' | 'neutral';
    confidence: number;  // 0 to 1
}

/**
 * Analyze sentiment using HuggingFace DistilBERT
 * 
 * This is significantly more accurate than AFINN lexicon because:
 * 1. Considers word order and context
 * 2. Trained on 50k movie reviews (SST-2 dataset)
 * 3. Understands negation ("not good" → negative)
 */
export const analyzeSentimentHF = async (text: string): Promise<HFSentimentResult> => {
    try {
        const classifier = await getSentimentPipeline();
        const result = await classifier(text);

        const label = result[0].label.toLowerCase();
        const confidence = result[0].score;

        // Convert to our format
        // DistilBERT outputs POSITIVE/NEGATIVE, we add neutral for low confidence
        let normalizedLabel: 'positive' | 'negative' | 'neutral' = 'neutral';
        let score = 0;

        if (confidence > 0.6) {
            if (label === 'positive') {
                normalizedLabel = 'positive';
                score = confidence;
            } else {
                normalizedLabel = 'negative';
                score = -confidence;
            }
        }

        return { score, label: normalizedLabel, confidence };
    } catch (e) {
        console.error('[HuggingFace] Sentiment analysis failed:', e);
        throw e;
    }
};

export interface HFNLIResult {
    label: 'entails' | 'neutral' | 'contradicts';
    confidence: number;
}

/**
 * Check if a summary sentence entails/contradicts a participant input
 * Uses zero-shot classification with NLI model
 */
export const classifyEntailmentHF = async (
    premise: string,  // participant input
    hypothesis: string  // summary sentence
): Promise<HFNLIResult> => {
    try {
        const classifier = await getNLIPipeline();

        // Use zero-shot to classify the relationship
        const result = await classifier(
            `${premise}. Therefore: ${hypothesis}`,
            ['This follows logically', 'This is unrelated', 'This contradicts'],
            { multi_label: false }
        );

        // Map to our labels
        const topLabel = result.labels[0];
        const confidence = result.scores[0];

        let label: 'entails' | 'neutral' | 'contradicts' = 'neutral';
        if (topLabel.includes('follows')) label = 'entails';
        else if (topLabel.includes('contradicts')) label = 'contradicts';

        return { label, confidence };
    } catch (e) {
        console.error('[HuggingFace] NLI classification failed:', e);
        throw e;
    }
};

/**
 * Generate embeddings using MiniLM
 * Returns 384-dimensional vectors
 */
export const generateEmbeddingHF = async (text: string): Promise<number[]> => {
    try {
        const extractor = await getEmbeddingPipeline();
        const result = await extractor(text, { pooling: 'mean', normalize: true });

        // Convert to array
        return Array.from(result.data);
    } catch (e) {
        console.error('[HuggingFace] Embedding generation failed:', e);
        throw e;
    }
};

/**
 * Batch generate embeddings (more efficient)
 */
export const generateEmbeddingsBatchHF = async (texts: string[]): Promise<number[][]> => {
    try {
        const extractor = await getEmbeddingPipeline();
        const results: number[][] = [];

        // Process in small batches to avoid memory issues
        const batchSize = 8;
        for (let i = 0; i < texts.length; i += batchSize) {
            const batch = texts.slice(i, i + batchSize);
            const batchResults = await Promise.all(
                batch.map(async (text) => {
                    const result = await extractor(text, { pooling: 'mean', normalize: true });
                    return Array.from(result.data) as number[];
                })
            );
            results.push(...batchResults);
        }

        return results;
    } catch (e) {
        console.error('[HuggingFace] Batch embedding failed:', e);
        throw e;
    }
};

/**
 * Extract keywords using embedding similarity
 * More accurate than TF-IDF for semantic relevance
 */
export const extractKeywordsHF = async (
    text: string,
    topK: number = 10
): Promise<string[]> => {
    try {
        // Use textUtils to get candidate keywords (unigrams + bigrams)
        // We ask for more candidates (e.g. 50) to re-rank them semantically
        const candidates = extractCandidates(text, 50);

        if (candidates.length === 0) return [];

        // Get unique candidates (extractCandidates already returns unique, but just in case)
        const uniqueCandidates = [...new Set(candidates)];

        // Get embeddings for text and each candidate
        const textEmbedding = await generateEmbeddingHF(text);
        const candidateEmbeddings = await generateEmbeddingsBatchHF(uniqueCandidates);

        // Calculate similarity of each candidate to the full text
        const cosineSim = (a: number[], b: number[]): number => {
            let dot = 0, normA = 0, normB = 0;
            for (let i = 0; i < a.length; i++) {
                dot += a[i] * b[i];
                normA += a[i] * a[i];
                normB += b[i] * b[i];
            }
            return dot / (Math.sqrt(normA) * Math.sqrt(normB) || 1);
        };

        const scored = uniqueCandidates.map((word, idx) => ({
            word,
            score: cosineSim(textEmbedding, candidateEmbeddings[idx])
        }));

        // Sort by similarity and return top K
        scored.sort((a, b) => b.score - a.score);
        return scored.slice(0, topK).map(s => s.word);
    } catch (e) {
        console.error('[HuggingFace] Keyword extraction failed:', e);
        // Fallback to frequency-based candidates if embeddings fail
        return extractCandidates(text, topK);
    }
};

/**
 * Calculate semantic similarity between two texts
 * More accurate than Jaccard for detecting paraphrases
 */
export const semanticSimilarityHF = async (
    text1: string,
    text2: string
): Promise<number> => {
    try {
        const [emb1, emb2] = await generateEmbeddingsBatchHF([text1, text2]);

        // Cosine similarity
        let dot = 0, normA = 0, normB = 0;
        for (let i = 0; i < emb1.length; i++) {
            dot += emb1[i] * emb2[i];
            normA += emb1[i] * emb1[i];
            normB += emb2[i] * emb2[i];
        }

        return dot / (Math.sqrt(normA) * Math.sqrt(normB) || 1);
    } catch (e) {
        console.error('[HuggingFace] Semantic similarity failed:', e);
        throw e;
    }
};

/**
 * Preload all models (call during app initialization)
 */
export const preloadModels = async (
    onProgress?: (model: string, status: string) => void
): Promise<void> => {
    try {
        onProgress?.('sentiment', 'loading');
        await getSentimentPipeline();
        onProgress?.('sentiment', 'ready');

        onProgress?.('embedding', 'loading');
        await getEmbeddingPipeline();
        onProgress?.('embedding', 'ready');

        // NLI is larger, load last
        onProgress?.('nli', 'loading');
        await getNLIPipeline();
        onProgress?.('nli', 'ready');
    } catch (e) {
        console.error('[HuggingFace] Model preloading failed:', e);
        throw e;
    }
};

export default {
    checkHuggingFaceAvailable,
    analyzeSentimentHF,
    classifyEntailmentHF,
    generateEmbeddingHF,
    generateEmbeddingsBatchHF,
    extractKeywordsHF,
    semanticSimilarityHF,
    preloadModels
};
