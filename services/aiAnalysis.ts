/**
 * AI Analysis Service with Tiered Fallback
 * 
 * Implements a 3-tier fallback hierarchy for robust NLP analysis:
 * 
 * Tier 1: AI Models (Gemini/Ollama) - Best quality, context-aware
 * Tier 2: HuggingFace Transformers - SOTA, runs in browser
 * Tier 3: Scientifically correct NLP - TF-IDF, BM25, PMI methods
 * 
 * This ensures accurate analysis regardless of API availability.
 */

import { AnalysisConfig } from '../types';
import { generateCompletion } from './completionRouter';
import {
    checkHuggingFaceAvailable,
    analyzeSentimentHF,
    classifyEntailmentHF,
    extractKeywordsHF,
    semanticSimilarityHF
} from './huggingface';

// ============================================================================
// TIER AVAILABILITY TRACKING
// ============================================================================

let tier2Available: boolean | null = null;

const checkTier2Available = async (): Promise<boolean> => {
    if (tier2Available !== null) return tier2Available;
    tier2Available = await checkHuggingFaceAvailable();
    return tier2Available;
};

// ============================================================================
// TIER 3: SCIENTIFICALLY CORRECT NLP FALLBACKS
// ============================================================================

/**
 * VADER-inspired sentiment analysis (Tier 3)
 * 
 * Unlike naive AFINN, this handles:
 * - Negation ("not good" → negative)
 * - Intensifiers ("very good" → more positive)
 * - Booster words ("extremely", "incredibly")
 * 
 * Based on: Hutto & Gilbert (2014) "VADER: A Parsimonious Rule-based Model"
 */
export const analyzeSentimentNLP = (text: string): { score: number; label: 'positive' | 'negative' | 'neutral' } => {
    const words = text.toLowerCase().split(/\s+/);

    // Sentiment lexicon (subset of VADER)
    const lexicon: Record<string, number> = {
        // Positive
        good: 1.9, great: 3.1, excellent: 3.2, amazing: 3.1, wonderful: 2.8,
        love: 2.9, like: 1.5, happy: 2.5, glad: 2.0, pleased: 2.1, joy: 2.8,
        helpful: 2.0, useful: 1.8, benefit: 1.8, success: 2.3, improve: 1.9,
        important: 1.5, valuable: 2.0, support: 1.7, positive: 2.1, opportunity: 1.8,
        // Negative
        bad: -2.5, terrible: -3.1, awful: -3.0, horrible: -3.2, poor: -1.9,
        hate: -2.9, dislike: -2.0, sad: -2.1, angry: -2.3, upset: -2.0,
        problem: -1.8, issue: -1.2, concern: -1.0, worry: -1.5, difficult: -1.3,
        fail: -2.2, failure: -2.5, wrong: -1.9, negative: -2.0, lack: -1.5,
        miss: -1.2, missing: -1.3, drop: -1.0, dropped: -1.2, ignore: -1.8,
        // Domain-specific
        crash: -2.0, crashes: -2.0, bug: -1.8, error: -1.5, broken: -2.2,
        slow: -1.3, confusing: -1.5, complex: -0.8, barrier: -1.5, exclude: -2.0
    };

    // Negation words
    const negations = new Set(['not', "n't", 'no', 'never', 'neither', 'nobody', 'nothing', 'nowhere', 'hardly', 'barely', 'scarcely']);

    // Intensifiers
    const intensifiers: Record<string, number> = {
        very: 1.3, extremely: 1.5, incredibly: 1.4, really: 1.2, absolutely: 1.4,
        quite: 1.1, somewhat: 0.8, slightly: 0.7, too: 1.2, much: 1.1
    };

    let totalScore = 0;
    let isNegated = false;
    let intensifier = 1.0;

    for (let i = 0; i < words.length; i++) {
        const word = words[i].replace(/[^a-z]/g, '');

        // Check for negation
        if (negations.has(word)) {
            isNegated = true;
            continue;
        }

        // Check for intensifier
        if (intensifiers[word]) {
            intensifier = intensifiers[word];
            continue;
        }

        // Check sentiment
        if (lexicon[word]) {
            let wordScore = lexicon[word] * intensifier;
            if (isNegated) wordScore *= -0.74; // VADER's negation scalar
            totalScore += wordScore;
        }

        // Reset after applying
        isNegated = false;
        intensifier = 1.0;
    }

    // Normalize by word count
    const normalized = totalScore / Math.max(words.length, 1);

    // Determine label with thresholds
    let label: 'positive' | 'negative' | 'neutral' = 'neutral';
    if (normalized > 0.15) label = 'positive';
    else if (normalized < -0.15) label = 'negative';

    return { score: normalized, label };
};

/**
 * Analyze sentiment with 3-tier fallback
 * 
 * Tier 1: AI (Gemini/Ollama)
 * Tier 2: HuggingFace DistilBERT
 * Tier 3: VADER-inspired NLP
 */
export const analyzeSentimentAI = async (
    text: string,
    config: AnalysisConfig
): Promise<{ score: number; label: 'positive' | 'negative' | 'neutral' }> => {

    // Tier 1: Try AI
    try {
        const safeText = text.replace(/"/g, '\\"');
        const prompt = `Analyze the sentiment of this text and respond with ONLY a JSON object:
Text: "${safeText}"

Respond with: {"score": <-1 to 1>, "label": "<positive|negative|neutral>"}`;

        const response = await generateCompletion(prompt, 'You are a sentiment analysis expert. Respond only with valid JSON.', config);

        const match = response.match(/\{[\s\S]*\}/);
        if (match) {
            const parsed = JSON.parse(match[0]);
            return {
                score: Math.max(-1, Math.min(1, parsed.score || 0)),
                label: ['positive', 'negative', 'neutral'].includes(parsed.label) ? parsed.label : 'neutral'
            };
        }
    } catch (e) {
        console.warn('[Sentiment] Tier 1 (AI) failed, trying Tier 2:', e);
    }

    // Tier 2: Try HuggingFace
    try {
        if (await checkTier2Available()) {
            const result = await analyzeSentimentHF(text);
            return { score: result.score, label: result.label };
        }
    } catch (e) {
        console.warn('[Sentiment] Tier 2 (HuggingFace) failed, using Tier 3:', e);
    }

    // Tier 3: NLP fallback
    console.log('[Sentiment] Using Tier 3 (NLP) fallback');
    return analyzeSentimentNLP(text);
};

/**
 * Extract keywords with 3-tier fallback
 */
export const extractKeywordsAI = async (
    text: string,
    config: AnalysisConfig,
    topK: number = 10
): Promise<string[]> => {

    // Tier 1: Try AI
    try {
        const safeText = text.replace(/"/g, '\\"');
        const prompt = `Extract the ${topK} most important substantive concepts from this text.
Return MEANINGFUL multi-word concept phrases (e.g., "regulatory compliance", "public consultation", "data privacy").
NEVER return single generic words like "people", "more", "dont", "cant", "real", "show".
Each concept should be specific enough that a researcher or policy-maker could act on it.

Text: "${safeText}"

Respond with ONLY a JSON array of concept phrase strings, e.g., ["concept phrase 1", "concept phrase 2", ...]`;

        const systemPrompt = 'You are a concept extraction expert for participatory research. Return multi-word concept phrases, never single generic words. Respond only with a JSON array.';
        const response = await generateCompletion(prompt, systemPrompt, config);

        const match = response.match(/\[[\s\S]*\]/);
        if (match) {
            const parsed = JSON.parse(match[0]);
            if (Array.isArray(parsed)) {
                return parsed.slice(0, topK).map(k => String(k).toLowerCase());
            }
        }
    } catch (e) {
        console.warn('[Keywords] Tier 1 (AI) failed, trying Tier 2:', e);
    }

    // Tier 2: Try HuggingFace
    try {
        if (await checkTier2Available()) {
            return await extractKeywordsHF(text, topK);
        }
    } catch (e) {
        console.warn('[Keywords] Tier 2 (HuggingFace) failed, using Tier 3:', e);
    }

    // Tier 3: NLP fallback (Robust version from textUtils with Bigrams)
    console.log('[Keywords] Using Tier 3 (Robust NLP) fallback');
    // Import dynamically to avoid circular deps if any, or just standard import
    const { extractKeywords } = await import('./textUtils');
    return extractKeywords(text, topK);
};

/**
 * Analyze concept gap with 3-tier fallback
 */
export const analyzeConceptGapAI = async (
    inputText: string,
    summaryText: string,
    config: AnalysisConfig
): Promise<{ kept: string[]; dropped: string[] }> => {

    // Tier 1: Try AI
    try {
        const safeInput = inputText.replace(/"/g, '\\"');
        const safeSummary = summaryText.replace(/"/g, '\\"');
        const prompt = `Compare the key concepts in the INPUT to those in the SUMMARY.
Identify MEANINGFUL multi-word concept phrases (e.g., "regulatory compliance", "public accountability").
NEVER return single generic words like "people", "more", "dont", "cant", "real".

INPUT: "${safeInput}"

SUMMARY: "${safeSummary}"

Identify which substantive concepts from the INPUT are kept in the SUMMARY and which are dropped.
Respond with ONLY a JSON object: {"kept": ["concept phrase 1", ...], "dropped": ["concept phrase 1", ...]}`;

        const systemPrompt = 'You are a concept analysis expert for participatory research. Return multi-word concept phrases, never single generic words. Respond only with valid JSON.';
        const response = await generateCompletion(prompt, systemPrompt, config);

        const match = response.match(/\{[\s\S]*\}/);
        if (match) {
            const parsed = JSON.parse(match[0]);
            if (parsed.kept && parsed.dropped) {
                return {
                    kept: parsed.kept.map((k: string) => String(k).toLowerCase()),
                    dropped: parsed.dropped.map((k: string) => String(k).toLowerCase())
                };
            }
        }
    } catch (e) {
        console.warn('[ConceptGap] Tier 1 (AI) failed, trying Tier 2:', e);
    }

    // Tier 2: Try HuggingFace semantic similarity
    try {
        if (await checkTier2Available()) {
            const inputKeywords = await extractKeywordsHF(inputText, 15);
            const kept: string[] = [];
            const dropped: string[] = [];

            for (const keyword of inputKeywords) {
                const similarity = await semanticSimilarityHF(keyword, summaryText);
                if (similarity > 0.4) {
                    kept.push(keyword);
                } else {
                    dropped.push(keyword);
                }
            }

            return { kept, dropped };
        }
    } catch (e) {
        console.warn('[ConceptGap] Tier 2 (HuggingFace) failed, using Tier 3:', e);
    }

    // Tier 3: NLP fallback (Robust version from textUtils)
    console.log('[ConceptGap] Using Tier 3 (NLP) fallback');

    // Use the robust implementation from textUtils (which we improved with fuzzy/stem matching)
    // We need to import it first (updating imports below)
    const { analyzeConceptGap } = await import('./textUtils');
    return analyzeConceptGap(inputText, summaryText);
};

/**
 * Classify entailment/contradiction with 3-tier fallback
 */
export const classifyEntailmentAI = async (
    premise: string,
    hypothesis: string,
    config: AnalysisConfig
): Promise<{ label: 'entails' | 'neutral' | 'contradicts'; confidence: number }> => {

    // Tier 1: Try AI
    try {
        const safePremise = premise.replace(/"/g, '\\"');
        const safeHypothesis = hypothesis.replace(/"/g, '\\"');
        const prompt = `Analyze the logical relationship between these two statements:

PREMISE: "${safePremise}"
HYPOTHESIS: "${safeHypothesis}"

Does the PREMISE entail (logically support), contradict, or have no clear relation to the HYPOTHESIS?
Respond with ONLY a JSON object: {"label": "entails|neutral|contradicts", "confidence": 0.0-1.0}`;

        const response = await generateCompletion(prompt, 'You are an NLI expert. Respond only with valid JSON.', config);

        const match = response.match(/\{[\s\S]*\}/);
        if (match) {
            const parsed = JSON.parse(match[0]);
            if (['entails', 'neutral', 'contradicts'].includes(parsed.label)) {
                return {
                    label: parsed.label,
                    confidence: Math.max(0, Math.min(1, parsed.confidence || 0.8))
                };
            }
        }
    } catch (e) {
        console.warn('[Entailment] Tier 1 (AI) failed, trying Tier 2:', e);
    }

    // Tier 2: Try HuggingFace NLI
    try {
        if (await checkTier2Available()) {
            return await classifyEntailmentHF(premise, hypothesis);
        }
    } catch (e) {
        console.warn('[Entailment] Tier 2 (HuggingFace) failed, using Tier 3:', e);
    }

    // Tier 3: Simple heuristic fallback
    console.log('[Entailment] Using Tier 3 (heuristic) fallback');

    // Check for obvious contradiction signals
    const contradictionPatterns = [
        ['support', 'oppose'], ['agree', 'disagree'], ['need', "don't need"],
        ['good', 'bad'], ['positive', 'negative'], ['should', "shouldn't"]
    ];

    const premiseLower = premise.toLowerCase();
    const hypothesisLower = hypothesis.toLowerCase();

    for (const [pos, neg] of contradictionPatterns) {
        if ((premiseLower.includes(pos) && hypothesisLower.includes(neg)) ||
            (premiseLower.includes(neg) && hypothesisLower.includes(pos))) {
            return { label: 'contradicts', confidence: 0.6 };
        }
    }

    // Check for word overlap (simple entailment heuristic)
    const premiseWords = new Set(premiseLower.split(/\s+/).filter(w => w.length > 3));
    const hypothesisWords = hypothesisLower.split(/\s+/).filter(w => w.length > 3);

    let overlap = 0;
    for (const word of hypothesisWords) {
        if (premiseWords.has(word)) overlap++;
    }

    const overlapRatio = hypothesisWords.length > 0 ? overlap / hypothesisWords.length : 0;

    if (overlapRatio > 0.5) {
        return { label: 'entails', confidence: 0.5 };
    }

    return { label: 'neutral', confidence: 0.4 };
};

/**
 * Semantic similarity with 3-tier fallback
 */
export const semanticSimilarityAI = async (
    text1: string,
    text2: string,
    config: AnalysisConfig
): Promise<number> => {

    // Tier 1: Try AI
    try {
        const safeText1 = text1.replace(/"/g, '\\"');
        const safeText2 = text2.replace(/"/g, '\\"');
        const prompt = `Rate the semantic similarity between these two texts on a scale of 0 to 1:

TEXT 1: "${safeText1}"
TEXT 2: "${safeText2}"

0 = completely unrelated, 1 = identical meaning
Respond with ONLY a number between 0 and 1.`;

        const response = await generateCompletion(prompt, 'Respond with only a decimal number.', config);

        const match = response.match(/[0-9]+\.?[0-9]*/);
        if (match) {
            return Math.max(0, Math.min(1, parseFloat(match[0])));
        }
    } catch (e) {
        console.warn('[Similarity] Tier 1 (AI) failed, trying Tier 2:', e);
    }

    // Tier 2: Try HuggingFace
    try {
        if (await checkTier2Available()) {
            return await semanticSimilarityHF(text1, text2);
        }
    } catch (e) {
        console.warn('[Similarity] Tier 2 (HuggingFace) failed, using Tier 3:', e);
    }

    // Tier 3: Jaccard with stemming (improved)
    console.log('[Similarity] Using Tier 3 (Jaccard) fallback');

    const tokenize = (text: string): Set<string> => {
        return new Set(
            text.toLowerCase()
                .replace(/[^a-z\s]/g, ' ')
                .split(/\s+/)
                .filter(w => w.length > 2)
                .map(w => w.length > 4 ? w.slice(0, -1) : w) // Simple stemming
        );
    };

    const set1 = tokenize(text1);
    const set2 = tokenize(text2);

    const intersection = new Set([...set1].filter(x => set2.has(x)));
    const union = new Set([...set1, ...set2]);

    return union.size > 0 ? intersection.size / union.size : 0;
};

export default {
    analyzeSentimentAI,
    extractKeywordsAI,
    analyzeConceptGapAI,
    classifyEntailmentAI,
    semanticSimilarityAI
};
