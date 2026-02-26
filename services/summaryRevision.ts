/**
 * Summary Revision Service
 *
 * Closes the core audit loop: once underrepresented voices are identified,
 * this service generates an AI-revised summary that incorporates them, then
 * recomputes all representation scores using stored input embeddings — no
 * re-embedding of inputs required. Only the new summary sentences are embedded.
 *
 * The result is a full AnalysisResult that can be fed into BeforeAfterComparison.
 */

import { AnalysisResult, AnalysisConfig } from '../types';
import { generateCompletion as generateGeminiCompletion } from './gemini';
import { generateOllamaCompletion, generateOllamaEmbedding } from './ollama';
import { checkBgeM3Connection, generateBgeM3EmbeddingsBatch } from './bgeM3';
import { generateEmbedding as generateGeminiEmbedding } from './gemini';
import { cosineSimilarity, calculateGini } from './mathUtils';
import { computeConceptOverlapScore } from './textUtils';
import { LocalVectorizer } from './vectorizer';
import { ANALYSIS_CONFIG } from '../constants';

// ─── Sentence splitter (mirrors logic in analysis.ts) ─────────────────────────

// Multilingual sentence splitter — mirrors the implementation in analysis.ts.
// Handles CJK (。！？), Arabic (۔ ؟), Devanagari (। ॥), and Latin abbreviations.
const splitIntoSentences = (text: string): string[] => {
  // Step 1: Split on non-Latin sentence-ending punctuation
  const nonLatinSentenceMarkers = /(?<=[。！？۔؟।॥])\s*/g;
  const segments = text.split(nonLatinSentenceMarkers).filter(s => s.trim().length > 0);

  const allSentences: string[] = [];

  for (const segment of segments) {
    const hasLatinPunctuation = /[.!?]/.test(segment);

    if (!hasLatinPunctuation) {
      if (segment.trim().length > 10) allSentences.push(segment.trim());
      continue;
    }

    const abbreviations = [
      'e.g.', 'i.e.', 'etc.', 'vs.', 'cf.', 'al.', 'fig.', 'vol.',
      'Dr.', 'Mr.', 'Mrs.', 'Ms.', 'Prof.', 'Sr.', 'Jr.',
      'Inc.', 'Ltd.', 'Corp.', 'Co.', 'No.', 'approx.'
    ];

    let processed = segment;
    const placeholders = new Map<string, string>();
    abbreviations.forEach((abbr, idx) => {
      const placeholder = `__ABBR${idx}__`;
      placeholders.set(placeholder, abbr);
      processed = processed.split(abbr).join(placeholder);
    });

    const sentences = processed.match(/[^.!?]+[.!?]+(?=\s+[A-Z]|$)/g) || [processed];

    for (const sent of sentences) {
      let restored = sent;
      placeholders.forEach((abbr, placeholder) => {
        restored = restored.split(placeholder).join(abbr);
      });
      const trimmed = restored.trim();
      if (trimmed.length > 10) allSentences.push(trimmed);
    }
  }

  return allSentences;
};

// ─── AI revision prompt ───────────────────────────────────────────────────────

/**
 * Generate a revised summary that incorporates underrepresented voices.
 * Requires an active AI provider.
 */
export const generateRevisedSummary = async (
  data: AnalysisResult,
  config: AnalysisConfig
): Promise<string> => {
  const { low } = ANALYSIS_CONFIG.representationInterpretation;
  const { representationTarget } = ANALYSIS_CONFIG.thresholds;

  const sorted = [...data.participants].sort(
    (a, b) => a.representationScore - b.representationScore
  );

  // Tiered threshold: try strict → relaxed → bottom quartile
  // This ensures revision always has meaningful targets even when overall
  // representation is good (e.g. all scores in the 0.5–0.6 "marginal" band).
  let underrepresented = sorted.filter(p => p.representationScore < low);

  if (underrepresented.length === 0) {
    // Relax to below the representation target (< 0.6)
    underrepresented = sorted.filter(p => p.representationScore < representationTarget);
  }

  if (underrepresented.length === 0) {
    // Last resort: bottom quartile (always at least 1 participant)
    const q1 = Math.max(1, Math.floor(sorted.length * 0.25));
    underrepresented = sorted.slice(0, q1);
  }

  underrepresented = underrepresented.slice(0, 8); // Cap at 8 to keep prompt manageable

  const missedVoices = underrepresented
    .map(p => {
      const droppedConcepts = (p.keywords || []).slice(0, 3).join(', ');
      return `[${p.id}] "${p.originalText}"${droppedConcepts ? ` (missed concepts: ${droppedConcepts})` : ''}`;
    })
    .join('\n');

  const prompt = `You are revising an AI-generated summary to achieve fairer representation of all participant voices.

ORIGINAL SUMMARY:
"${data.summary}"

UNDERREPRESENTED PARTICIPANTS — these voices are not adequately captured above:
${missedVoices}

REVISION INSTRUCTIONS:
1. Keep all strong points from the original summary.
2. Explicitly integrate the perspectives of the underrepresented participants listed above.
3. Do NOT simply append a new paragraph — weave the new content throughout.
4. Maintain the same approximate length (±25%) and professional tone.
5. Do not add information not present in the participants' inputs.

Write only the revised summary text, no preamble:`;

  const system = 'You are an expert facilitator skilled at writing inclusive summaries that give equal weight to all participant voices while remaining coherent and concise.';

  if (config.aiProvider === 'ollama') {
    return await generateOllamaCompletion(prompt, system, config.model);
  }
  if (config.aiProvider === 'groq') {
    const { generateGroqCompletion } = await import('./groq');
    return await generateGroqCompletion(prompt, system, config.model);
  }
  return await generateGeminiCompletion(prompt, system, config.model);
};

// ─── Score recomputation ──────────────────────────────────────────────────────

/**
 * Recompute representation scores for a new summary text, reusing stored
 * input embeddings from the original analysis (so no re-embedding of inputs).
 * Only the new summary sentences need embedding API calls.
 */
export const recomputeWithNewSummary = async (
  originalData: AnalysisResult,
  newSummary: string,
  config: AnalysisConfig,
  onProgress?: (msg: string) => void
): Promise<AnalysisResult> => {
  if (!originalData.inputEmbeddings || originalData.inputEmbeddings.length === 0) {
    throw new Error(
      'Input embeddings were not stored in the original analysis. ' +
      'Re-run the analysis to enable summary revision.'
    );
  }

  const inputEmbeddings = originalData.inputEmbeddings;
  const newSentences = splitIntoSentences(newSummary);

  onProgress?.('Embedding revised summary sentences…');

  // Embed new summary sentences using the best available tier
  let newSentenceEmbeddings: number[][] | null = null;
  let tierUsed = originalData.embeddingTierUsed ?? 'tfidf';

  // Tier 1: BGE-M3
  if (tierUsed === 'bge-m3' || await checkBgeM3Connection()) {
    try {
      newSentenceEmbeddings = await generateBgeM3EmbeddingsBatch(newSentences);
      tierUsed = 'bge-m3';
    } catch {
      console.warn('[Revision] BGE-M3 failed, falling back');
    }
  }

  // Tier 2: Configured AI provider
  if (!newSentenceEmbeddings) {
    try {
      if (config.aiProvider === 'ollama') {
        newSentenceEmbeddings = await Promise.all(
          newSentences.map(s => generateOllamaEmbedding(s, config.embeddingModel))
        );
        tierUsed = 'ollama';
      } else {
        newSentenceEmbeddings = await Promise.all(
          newSentences.map(s => generateGeminiEmbedding(s, config.embeddingModel))
        );
        tierUsed = 'gemini';
      }
    } catch {
      console.warn('[Revision] Provider embedding failed, falling back to TF-IDF');
    }
  }

  // Tier 3: Local TF-IDF (always available)
  if (!newSentenceEmbeddings) {
    const inputTexts = originalData.participants.map(p => p.originalText);
    const vectorizer = new LocalVectorizer(inputTexts);
    newSentenceEmbeddings = newSentences.map(s => vectorizer.embed(s));
    tierUsed = 'tfidf';
  }

  onProgress?.('Recomputing representation scores…');

  const { matchingThreshold } = ANALYSIS_CONFIG.thresholds;
  const { isolationPercentile } = ANALYSIS_CONFIG.thresholds;

  // Detect whether inputs were embedded with local TF-IDF (dim = 150)
  const isLocalVectors = inputEmbeddings[0]?.length === 150;

  const updatedParticipants = originalData.participants.map((p, idx) => {
    const embedding = inputEmbeddings[idx];
    if (!embedding) return p;

    let maxSim = 0;
    let topSentIdx = 0;
    const sentenceMatches: { sentenceIndex: number; similarity: number }[] = [];

    newSentenceEmbeddings!.forEach((sentEmb, sIdx) => {
      const sim = cosineSimilarity(embedding, sentEmb);
      if (sim > matchingThreshold) {
        sentenceMatches.push({ sentenceIndex: sIdx, similarity: sim });
      }
      if (sim > maxSim) { maxSim = sim; topSentIdx = sIdx; }
    });

    if (sentenceMatches.length === 0) {
      sentenceMatches.push({ sentenceIndex: topSentIdx, similarity: maxSim });
    }
    sentenceMatches.sort((a, b) => b.similarity - a.similarity);

    // Aggregate embedding similarity with secondary match decay (see analysis.ts)
    const SECONDARY_DECAY = 0.3;
    let embeddingSimilarity: number;
    if (sentenceMatches.length <= 1) {
      embeddingSimilarity = maxSim;
    } else {
      let aggregated = sentenceMatches[0].similarity;
      for (let k = 1; k < sentenceMatches.length; k++) {
        aggregated += sentenceMatches[k].similarity * Math.pow(SECONDARY_DECAY, k);
      }
      embeddingSimilarity = Math.min(1, aggregated);
    }

    const conceptOverlap = computeConceptOverlapScore(p.originalText, newSummary);
    const representationScore = Math.max(
      0,
      Math.min(
        1,
        isLocalVectors
          ? (embeddingSimilarity + conceptOverlap) / 2
          : embeddingSimilarity * 0.8 + conceptOverlap * 0.2
      )
    );

    return {
      ...p,
      representationScore,
      sentenceMatches,
      topSentenceMatchIndex: topSentIdx,
    };
  });

  // Recompute aggregate metrics
  const repScores = updatedParticipants.map(p => p.representationScore);
  const gini = calculateGini(repScores);

  const sortedByIsolation = [...updatedParticipants].sort(
    (a, b) => b.semanticIsolation - a.semanticIsolation
  );
  const splitIndex = Math.floor(updatedParticipants.length * isolationPercentile);
  let distinctGap = 0;
  if (splitIndex > 0) {
    const distinctGroup = sortedByIsolation.slice(0, splitIndex);
    const majorityGroup = sortedByIsolation.slice(splitIndex);
    const avgDistinct = distinctGroup.reduce((s, p) => s + p.representationScore, 0) / distinctGroup.length;
    const avgMajority = majorityGroup.reduce((s, p) => s + p.representationScore, 0) / majorityGroup.length;
    distinctGap = avgMajority - avgDistinct;
  }

  // Rebuild sentence sentiments (inherit original for unchanged length, else neutral)
  const newSentenceSentiments = newSentences.map((_, i) => {
    return originalData.summarySentenceSentiments?.[i] ?? { score: 0, label: 'neutral' as const };
  });

  return {
    ...originalData,
    summary: newSummary,
    summarySentences: newSentences,
    summarySentenceSentiments: newSentenceSentiments,
    participants: updatedParticipants,
    metrics: {
      ...originalData.metrics,
      giniCoefficient: gini,
      coverageUniformity: 1 - gini,
      distinctRepresentationGap: distinctGap,
    },
    embeddingTierUsed: tierUsed,
    // Do not carry forward inputEmbeddings — keep them only on the original
  };
};
