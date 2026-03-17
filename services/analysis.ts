import { AnalysisResult, ParticipantInput, ParticipantAnalysis, AnalysisConfig, SensitivityResult, BridgingSuggestion, ConceptFidelityResult, SentenceMatch, StrategyComparisonResult, NetworkGraph } from '../types';
import { checkAIConnection, generateEmbedding as generateGeminiEmbedding } from './gemini';
import { checkOllamaConnection, generateOllamaEmbedding } from './ollama';
import { checkGroqConnection } from './groq';
import { checkOpenAIConnection, generateOpenAIEmbedding } from './openai';
import { checkClaudeConnection } from './claude';
import { checkApertusConnection } from './apertus';
import { checkBgeM3Connection, generateBgeM3Embedding, generateBgeM3EmbeddingsBatch } from './bgeM3';
import { cosineSimilarity, computePCA, computeAutoKMeans, calculateGini, computeAveragePairwiseDistance, computeGlobalCentroid, computeMutualKNN } from './mathUtils';
// Note: analyzeSentimentAI has built-in 3-tier fallback (AI → HuggingFace → NLP)
// so we always use it regardless of AI connection status
import { analyzeSentimentAI, analyzeConceptGapAI, extractKeywordsAI, analyzeSentimentNLP } from './aiAnalysis';
import { LocalVectorizer } from './vectorizer';
import { analyzeConceptGap, computeConceptFidelity, computeConceptOverlapScore, extractKeywords } from './textUtils';
import { computeUncertaintyMetrics } from './uncertainty';
import { analyzeGroups } from './groupAnalysis';
import { checkHuggingFaceAvailable, analyzeSentimentBatchHF } from './huggingface';
import { generateThresholdSensitivityData } from '../components/visualizations/ThresholdSensitivityMini';
import { runStrategyComparison } from './strategyComparison';
import { ANALYSIS_CONFIG } from '../constants';
import { getCachedEmbedding, setCachedEmbedding, prewarmCache, getCachedEmbeddingAsync } from './embeddingCache';
import { detectLanguage, analyzeLanguageEquity } from './languageDetection';
import { generateCompletion } from './completionRouter';

// --- Prompt Engineering ---

const getSystemPrompt = (strategy: string): string => {
  const base = "You are an expert AI facilitator for a collaborative decision-making process. Your goal is to synthesize participant inputs into a concise, actionable summary.";
  switch (strategy) {
    case 'diversity': return `${base} \n\nCRITICAL INSTRUCTION: Prioritize DIVERSITY. Explicitly mention minority viewpoints, outliers, and unique perspectives.`;
    case 'consensus': return `${base} \n\nCRITICAL INSTRUCTION: Prioritize CONSENSUS. Identify shared goals and agreements. Minimize minor disagreements.`;
    case 'balanced': default: return `${base} \n\nCRITICAL INSTRUCTION: Be BALANCED. Represent both the majority trends and significant minority concerns.`;
  }
};

const formatInputsForPrompt = (inputs: ParticipantInput[]): string => {
  return inputs.map(i => `- ${i.text}`).join('\n');
};

// --- Helper Wrappers ---

// Embedding priority: BGE-M3 (best quality) → provider-specific → local TF-IDF
// BGE-M3 is used for embeddings regardless of which provider handles text generation
let bgeM3Available: boolean | null = null;

/**
 * Route an embedding call to the correct provider based on config.embeddingProvider.
 * Falls back to Gemini if provider is somehow unrecognised.
 */
export const generateEmbedding = async (text: string, config: AnalysisConfig): Promise<number[]> => {
  switch (config.embeddingProvider) {
    case 'bge-m3':
      return await generateBgeM3Embedding(text);
    case 'openai':
      return await generateOpenAIEmbedding(text, config.embeddingModel);
    case 'ollama':
      return await generateOllamaEmbedding(text, config.embeddingModel);
    case 'tfidf':
      throw new Error('TF-IDF embeddings are computed locally — generateEmbedding() should not be called for tfidf provider');
    case 'gemini':
    default:
      return await generateGeminiEmbedding(text, config.embeddingModel);
  }
};

// Uses shared generateCompletion from completionRouter.ts

// ── Batched sentiment analysis ───────────────────────────────────────────────
// Instead of 1 AI call per input (N calls), we batch into chunks of 100.
// Each chunk asks the LLM to return a JSON array of {score, label} objects.
// Fallback: individual analyzeSentimentAI for any inputs that fail parsing;
//           if AI is disconnected, HuggingFace Transformer → NLP.
type SentimentResult = { score: number; label: 'positive' | 'negative' | 'neutral' };

const SENTIMENT_BATCH_SIZE = 100;

const batchAnalyzeSentiment = async (
  texts: string[],
  config: AnalysisConfig,
  isConnected: boolean,
  onProgress?: (msg: string) => void
): Promise<SentimentResult[]> => {
  const results: SentimentResult[] = new Array(texts.length).fill(null);
  const startTime = Date.now();

  // ── Tier 1: LLM batch ────────────────────────────────────────────────────
  // Always attempt LLM first when a network connection is available.
  // This is intentionally decoupled from `summaryMethod` — sentiment analysis
  // is independent of whether the user picked AI or extractive summarization.
  if (isConnected) {
    for (let i = 0; i < texts.length; i += SENTIMENT_BATCH_SIZE) {
      const chunk = texts.slice(i, i + SENTIMENT_BATCH_SIZE);
      const chunkNum = Math.floor(i / SENTIMENT_BATCH_SIZE) + 1;
      const totalChunks = Math.ceil(texts.length / SENTIMENT_BATCH_SIZE);

      const elapsed = (Date.now() - startTime) / 1000;
      const etaStr = chunkNum > 1
        ? ` (~${Math.round(elapsed / (chunkNum - 1) * (totalChunks - chunkNum + 1))}s remaining)`
        : '';
      onProgress?.(`Sentiment analysis: batch ${chunkNum}/${totalChunks}${etaStr}`);

      try {
        const numberedInputs = chunk.map((text, idx) =>
          `[${idx}] "${text.slice(0, 250).replace(/"/g, '\\"')}"`
        ).join('\n');

        const prompt = `You are analyzing participant responses from a co-creation or deliberative research session.
Participants are sharing their opinions and experiences about a social/policy/education topic.
Sentiment here means their overall ATTITUDE (positive = supportive/optimistic, negative = critical/concerned, neutral = balanced/descriptive).
Do NOT penalize factual or academic language — "accelerates", "enables", "supports", "fosters" are POSITIVE.
Terms like "barrier", "concern", "risk" are NEGATIVE only if the participant is directly expressing concern — not if they say these things are PREVENTED or OVERCOME.

Analyze the sentiment of each numbered participant response below.

RESPONSES:
${numberedInputs}

Return a JSON array (one entry per input, in the same order, index 0 = first response):
[{"score": <-1.0 to 1.0>, "label": "<positive|negative|neutral>"}, ...]

Rules:
- score > 0.1 → label must be "positive"
- score < -0.1 → label must be "negative"
- otherwise → label must be "neutral"
- Return ONLY the JSON array, no explanation.`;

        const response = await generateCompletion(
          prompt,
          'You are a sentiment analysis expert. Respond only with a valid JSON array.',
          config
        );

        const match = response.match(/\[[\s\S]*\]/);
        if (match) {
          const parsed = JSON.parse(match[0]) as any[];
          for (let j = 0; j < chunk.length; j++) {
            if (parsed[j]?.label && typeof parsed[j]?.score === 'number') {
              const label = ['positive', 'negative', 'neutral'].includes(parsed[j].label)
                ? parsed[j].label : 'neutral';
              results[i + j] = {
                score: Math.max(-1, Math.min(1, parsed[j].score)),
                label,
              };
            }
          }
        }
      } catch (e) {
        console.warn(`[Sentiment] Batch ${chunkNum} LLM call failed:`, e);
        // Leave result as null so the fallback ladder below fills it in.
      }
    }
  }

  // ── Tier 2 / 3: Fill any remaining nulls ─────────────────────────────────
  // Nulls arise when: (a) LLM is offline, (b) specific batches failed above.
  //
  // Strategy:
  //   • For SMALL datasets (≤ 50 missing items): try HuggingFace WASM first.
  //     It is more accurate but loads ~70 MB into browser memory, so we only
  //     do this when the count is manageable.
  //   • For LARGE datasets: skip WASM entirely and go straight to the NLP
  //     lexicon (pure JS, instant, zero memory risk).
  const missingIndices = results.map((r, i) => r === null ? i : -1).filter(i => i >= 0);

  if (missingIndices.length === 0) return results as SentimentResult[];

  const missingTexts = missingIndices.map(idx => texts[idx]);
  const useHuggingFace = missingIndices.length <= 50;

  if (useHuggingFace) {
    onProgress?.(`Sentiment fallback: running local model on ${missingIndices.length} inputs...`);
    try {
      if (await checkHuggingFaceAvailable()) {
        const hfStartTime = Date.now();
        const hfResults = await analyzeSentimentBatchHF(missingTexts, (processed, total) => {
          const elapsed = (Date.now() - hfStartTime) / 1000;
          const eta = processed < total
            ? ` (~${Math.round(elapsed / processed * (total - processed))}s remaining)`
            : '';
          onProgress?.(`Local model classifying ${processed}/${total}${eta}`);
        });
        for (let j = 0; j < missingIndices.length; j++) {
          results[missingIndices[j]] = hfResults[j];
        }
        return results as SentimentResult[];
      }
    } catch (e) {
      console.warn('[Sentiment] HuggingFace WASM failed, falling back to NLP:', e);
    }
  } else {
    onProgress?.(`Sentiment: large dataset (${missingIndices.length} inputs) — using fast NLP lexicon to avoid browser memory limits.`);
  }

  // Tier 3: NLP lexicon — pure JS, O(n) per text, no memory risk.
  for (let j = 0; j < missingIndices.length; j++) {
    results[missingIndices[j]] = analyzeSentimentNLP(missingTexts[j]);
  }

  return results as SentimentResult[];
};

// --- Concept Fidelity (AI & Manual) ---
const performConceptFidelityAnalysis = async (
  inputs: string[],
  summary: string,
  config: AnalysisConfig,
  isConnected: boolean,
  onProgress?: (msg: string) => void
): Promise<ConceptFidelityResult> => {

  // Always use Tiered Analysis (AI -> HF -> NLP)
  onProgress?.("Running concept fidelity analysis...");
  const summaryConcepts = await extractKeywordsAI(summary, config, 20);

  const participantMap: Record<string, { kept: string[], dropped: string[] }> = {};
  const allExampleConcepts = new Set<string>();
  let totalConcepts = 0;
  let retainedCount = 0;

  // ── Batched concept gap analysis ──────────────────────────────────────────
  // Instead of 1 AI call per participant (N calls = slow + expensive), we batch
  // multiple participants into a single AI call. For 30 inputs with CHUNK_SIZE=15
  // that's only 2 API round-trips instead of 30, while preserving semantic
  // accuracy. Any participant that fails JSON parsing falls back to local NLP.
  const AI_CHUNK_SIZE = 15; // Max participants per AI call (keeps prompt under context window)

  if (isConnected && config.summaryMethod === 'ai') {
    for (let i = 0; i < inputs.length; i += AI_CHUNK_SIZE) {
      const chunk = inputs.slice(i, i + AI_CHUNK_SIZE);
      onProgress?.(`Analyzing concepts (batch ${Math.floor(i / AI_CHUNK_SIZE) + 1}/${Math.ceil(inputs.length / AI_CHUNK_SIZE)})...`);

      try {
        const numberedInputs = chunk.map((text, idx) => `[${idx}] "${text.slice(0, 300)}"`).join('\n');
        const prompt = `Compare the key concepts in each numbered INPUT to those in the SUMMARY.
Return MEANINGFUL multi-word concept phrases (e.g. "regulatory compliance", "data privacy", "public consultation").
NEVER return single generic words like "people", "more", "dont", "cant", "real", "show", "focus".
Each concept should be a substantive topic that a policy-maker or researcher could act on.

SUMMARY: "${summary.slice(0, 1500)}"

INPUTS:
${numberedInputs}

For EACH input, identify which substantive concepts are kept in the SUMMARY and which are dropped.
Respond with ONLY a JSON array where index matches input number:
[{"kept": ["concept phrase 1", ...], "dropped": ["concept phrase 1", ...]}, ...]`;

        const response = await generateCompletion(prompt, 'You are a concept analysis expert. Respond only with a valid JSON array.', config);
        const match = response.match(/\[[\s\S]*\]/);
        if (match) {
          const parsed = JSON.parse(match[0]) as { kept: string[], dropped: string[] }[];
          for (let j = 0; j < chunk.length; j++) {
            const actualIdx = i + j;
            if (parsed[j]?.kept && parsed[j]?.dropped) {
              participantMap[actualIdx] = {
                kept: parsed[j].kept.map((k: string) => String(k).toLowerCase()),
                dropped: parsed[j].dropped.map((k: string) => String(k).toLowerCase()),
              };
            } else {
              // AI didn't return valid data for this participant — use NLP fallback
              participantMap[actualIdx] = analyzeConceptGap(chunk[j], summary);
            }
          }
        } else {
          // JSON parse failed — fall back to NLP for entire chunk
          for (let j = 0; j < chunk.length; j++) {
            participantMap[i + j] = analyzeConceptGap(chunk[j], summary);
          }
        }
      } catch (e) {
        console.warn(`[ConceptFidelity] Batched AI call failed for chunk at ${i}, falling back to NLP:`, e);
        for (let j = 0; j < chunk.length; j++) {
          participantMap[i + j] = analyzeConceptGap(chunk[j], summary);
        }
      }
    }
  } else {
    // No AI connection — use fast local NLP for all participants
    onProgress?.("Using local NLP concept analysis...");
    for (let i = 0; i < inputs.length; i++) {
      participantMap[i] = analyzeConceptGap(inputs[i], summary);
    }
  }

  // Aggregate concept counts
  Object.values(participantMap).forEach(gap => {
    gap.kept.forEach(c => allExampleConcepts.add(c));
    gap.dropped.forEach(c => allExampleConcepts.add(c));
    totalConcepts += (gap.kept.length + gap.dropped.length);
    retainedCount += gap.kept.length;
  });
  onProgress?.(`Concept analysis complete for ${inputs.length} inputs`);

  // Calculate added concepts (potential hallucinations or AI-introduced framing).
  // Use stemmed matching to avoid false positives from morphological variants
  // (e.g. "communities" vs "community", "well-being" vs "wellbeing").
  const flatInputText = inputs.join(' ').toLowerCase();
  const flatInputWords = new Set(
    flatInputText
      .replace(/[.,/#!$%^&*;:{}=\-_`~()]/g, ' ')
      .split(/\s+/)
      .filter(w => w.length > 2)
  );
  // Build a set of stemmed input words for fuzzy matching
  const simpleStemWord = (w: string): string => {
    if (w.length < 4) return w;
    if (w.endsWith('ing') && w.length > 5) return w.slice(0, -3);
    if (w.endsWith('ies') && w.length > 4) return w.slice(0, -3) + 'y';
    if (w.endsWith('es') && w.length > 4 && !w.endsWith('ss')) return w.slice(0, -2);
    if (w.endsWith('ed') && w.length > 4) return w.slice(0, -2);
    if (w.endsWith('s') && w.length > 3 && !w.endsWith('ss')) return w.slice(0, -1);
    return w;
  };
  const stemmedInputWords = new Set([...flatInputWords].map(simpleStemWord));

  const addedConcepts = summaryConcepts.filter(sc => {
    const scLower = sc.toLowerCase();
    // Check 1: Direct substring match in combined inputs
    if (flatInputText.includes(scLower)) return false;
    // Check 2: Stem match — stem each word in the concept and check
    const conceptWords = scLower.replace(/[^a-z\s]/g, ' ').split(/\s+/).filter(w => w.length > 2);
    if (conceptWords.length === 0) return false;
    const matchedParts = conceptWords.filter(w =>
      flatInputWords.has(w) || stemmedInputWords.has(simpleStemWord(w))
    );
    // If > 60% of concept words have stemmed matches in inputs, it's not hallucinated
    if (matchedParts.length / conceptWords.length > 0.6) return false;
    return true; // Genuinely added concept
  });

  /*
  // Aggregate preserved/dropped concepts across all participants
  const allConceptsArray = Array.from(allExampleConcepts);
  // Re-check summary inclusion globally (just in case individual checks were partial)
  const summaryLower = summary.toLowerCase();
  
  // Use robust matching logic (same as analyzeConceptGap from textUtils) for final categorization
  // Note: we're doing this globally now instead of just relying on the per-participant map
  // This ensures consistent counts
  const { analyzeConceptGap } = await import('./textUtils');
  
  // We reconstruct the lists based on the set of unique concepts found
  const uniqueConcepts = Array.from(allExampleConcepts);
  const preservedConcepts: string[] = [];
  const droppedConcepts: string[] = [];
  
  // Check each concept against summary using robust matching
  // We can treat the list of concepts as "input text" for checking purposes, 
  // but better to check one by one
  for (const concept of uniqueConcepts) {
    // Check if concept is in summary (using robust logic)
    const gap = analyzeConceptGap(concept, summary);
    if (gap.kept.length > 0) {
      preservedConcepts.push(concept);
    } else {
      droppedConcepts.push(concept);
    }
  }
  */

  // Simplification based on accumulated results (participantMap)
  // Since we already ran analyzeConceptGapAI/analyzeConceptGap for each participant,
  // we can just aggregate the results directly.
  const preservedSet = new Set<string>();
  const droppedSet = new Set<string>();

  Object.values(participantMap).forEach(gap => {
    gap.kept.forEach(c => preservedSet.add(c));
    gap.dropped.forEach(c => droppedSet.add(c));
  });

  // If a concept was kept in one place but dropped in another (context dependent), 
  // we count it as preserved overall if it appears in the summary
  const summaryDesc = summary.toLowerCase();

  // Refine sets: verify strictly against summary
  const finalPreserved: string[] = [];
  const finalDropped: string[] = [];

  // Check all unique concepts found
  const allFound = new Set([...preservedSet, ...droppedSet]);

  // analyzeConceptGap is imported at the top level from './textUtils'

  for (const concept of allFound) {
    const res = analyzeConceptGap(concept, summary);
    if (res.kept.length > 0) {
      finalPreserved.push(concept);
    } else {
      finalDropped.push(concept);
    }
  }

  return {
    preservedConcepts: finalPreserved,
    droppedConcepts: finalDropped,
    addedConcepts,
    fidelityScore: totalConcepts === 0 ? 0 : retainedCount / totalConcepts,
    participantMap
  };
};


// --- Main Analysis Function ---

export const runCoreAnalysis = async (
  inputs: ParticipantInput[],
  config: AnalysisConfig,
  onProgress?: (msg: string) => void
): Promise<AnalysisResult> => {

  // 0. Minimum sample size guard
  // Analysis requires at least 2 participants for any meaningful pairwise metric
  // (Gini, pairwise distance, LOO sensitivity). A single participant produces
  // degenerate results (Gini = 0, distance = 0).
  if (inputs.length < 2) {
    throw new Error(
      `Analysis requires at least 2 participant inputs, but only ${inputs.length} was provided. ` +
      `Please add more contributions before running the analysis.`
    );
  }

  onProgress?.(`Checking availability...`);
  let isConnected = false;
  if (config.aiProvider === 'ollama') {
    isConnected = await checkOllamaConnection();
  } else if (config.aiProvider === 'groq') {
    isConnected = checkGroqConnection();
  } else if (config.aiProvider === 'openai') {
    isConnected = checkOpenAIConnection();
  } else if (config.aiProvider === 'claude') {
    isConnected = checkClaudeConnection();
  } else if (config.aiProvider === 'apertus') {
    isConnected = checkApertusConnection();
  } else {
    isConnected = await checkAIConnection();
  }

  // If AI is selected but offline, force fallback (but keep embeddings via local)
  let activeConfig = { ...config };

  // Check BGE-M3 availability (independent of AI provider — used for embeddings only)
  bgeM3Available = await checkBgeM3Connection();
  if (bgeM3Available) {
    onProgress?.("BGE-M3 embedding server detected");
    console.log('[Analysis] BGE-M3 available — using state-of-the-art embeddings');
  } else if (activeConfig.embeddingProvider === 'bge-m3') {
    // User selected BGE-M3 but it's not running
    onProgress?.('⚠️ BGE-M3 not detected. Switching to TF-IDF fallback.');
    console.warn('[Analysis] BGE-M3 not available — falling back to TF-IDF');
    activeConfig = { ...activeConfig, embeddingProvider: 'tfidf' };
  }

  if (!isConnected && activeConfig.summaryMethod === 'ai') {
    console.warn("AI Connection failed. Switching to extractive.");
    onProgress?.("⚠️ AI Offline. Switching to Extractive Summary.");
    await new Promise(r => setTimeout(r, 1000));
    activeConfig.summaryMethod = 'extractive';
    activeConfig.runLOO = false;
  }

  // 2. Determine Embedding Strategy based on user-selected embeddingProvider
  let useLocalVectors = activeConfig.embeddingProvider === 'tfidf';

  // 3. Generate Embeddings
  let inputEmbeddings: number[][] = [];
  let localVectorizer: LocalVectorizer | null = null;

  if (useLocalVectors) {
    onProgress?.("Generating local vector space...");
    localVectorizer = new LocalVectorizer(inputs.map(i => i.text));
    inputEmbeddings = inputs.map(i => localVectorizer!.embed(i.text));
  } else if (activeConfig.embeddingProvider === 'bge-m3') {
    // BGE-M3: Chunked batch embedding (32 texts/chunk) with model-keyed in-session cache.
    // Sending all texts in one request fails at 5000+ inputs due to payload size.
    const BGE_CHUNK_SIZE = 32;
    const BGE_MODEL_KEY = 'bge-m3';
    onProgress?.("Generating BGE-M3 embeddings...");
    try {
      const texts = inputs.map(i => i.text);
      const result: (number[] | null)[] = texts.map(t => getCachedEmbedding(t, BGE_MODEL_KEY));
      const uncachedIndices = result.map((v, i) => v === null ? i : -1).filter(i => i >= 0);
      if (uncachedIndices.length > 0) {
        onProgress?.(`Embedding ${uncachedIndices.length} new inputs (${texts.length - uncachedIndices.length} cached)...`);
        for (let chunkStart = 0; chunkStart < uncachedIndices.length; chunkStart += BGE_CHUNK_SIZE) {
          const chunkIndices = uncachedIndices.slice(chunkStart, chunkStart + BGE_CHUNK_SIZE);
          const chunkTexts = chunkIndices.map(i => texts[i]);
          const chunkEmbeddings = await generateBgeM3EmbeddingsBatch(chunkTexts);
          for (let j = 0; j < chunkIndices.length; j++) {
            result[chunkIndices[j]] = chunkEmbeddings[j];
            setCachedEmbedding(texts[chunkIndices[j]], BGE_MODEL_KEY, chunkEmbeddings[j]);
          }
          onProgress?.(`BGE-M3: ${Math.min(chunkStart + BGE_CHUNK_SIZE, uncachedIndices.length)}/${uncachedIndices.length} embedded...`);
        }
      } else {
        onProgress?.(`All ${texts.length} embeddings served from cache`);
      }
      inputEmbeddings = result.map(v => v ?? new Array(768).fill(0));
      onProgress?.(`Embedded ${inputEmbeddings.length} inputs with BGE-M3`);
    } catch (e) {
      console.warn('[Analysis] BGE-M3 batch failed, falling back:', e);
      bgeM3Available = false;
      // Fall through to per-item embedding below
      inputEmbeddings = [];
    }
  }

  // Per-item embedding if batch wasn't used or failed
  if (inputEmbeddings.length === 0 && !useLocalVectors) {
    const texts = inputs.map(i => i.text);
    // Model key must match the actual embedding model so cached vectors from a
    // different provider are never reused (they live in incomparable vector spaces).
    const PER_ITEM_MODEL_KEY = `${activeConfig.embeddingProvider}::${activeConfig.embeddingModel}`;

    // Pre-warm L1 from IndexedDB (L2) — batch-loads previously cached vectors
    // so they don't need individual async lookups in the hot loop below.
    const prewarmed = await prewarmCache(texts, PER_ITEM_MODEL_KEY);
    if (prewarmed > 0) {
      onProgress?.(`Pre-loaded ${prewarmed} embeddings from persistent cache`);
    }

    // Check L1 cache (now includes any L2-promoted entries)
    const result: (number[] | null)[] = texts.map(t => getCachedEmbedding(t, PER_ITEM_MODEL_KEY));
    const uncachedIndices = result.map((v, i) => v === null ? i : -1).filter(i => i >= 0);
    let failureCount = 0;

    if (uncachedIndices.length > 0) {
      onProgress?.(`Embedding ${uncachedIndices.length} inputs (${texts.length - uncachedIndices.length} cached)...`);
      // Adaptive concurrency: provider-specific limits from ANALYSIS_CONFIG.
      // OpenAI (high rate limits) → 40 concurrent, Ollama (local CPU) → 5 concurrent.
      const CONCURRENCY = ANALYSIS_CONFIG.providerConcurrency[activeConfig.embeddingProvider] || 10;
      const embStartTime = Date.now();

      for (let start = 0; start < uncachedIndices.length; start += CONCURRENCY) {
        const batch = uncachedIndices.slice(start, start + CONCURRENCY);
        await Promise.all(batch.map(async (origIdx) => {
          try {
            const emb = await generateEmbedding(inputs[origIdx].text, activeConfig);
            if (emb.every(v => v === 0)) {
              // Zero vector from API — this participant's embedding failed.
              // We flag it explicitly so the UI can show a warning badge and
              // exclude it from aggregate metrics rather than silently scoring it ~0.
              console.warn(`[Embedding] Zero vector received for ${inputs[origIdx].id} — API may be failing`);
              failureCount++;
              result[origIdx] = emb;
              // Mark as failed — do NOT cache a zero vector (would poison future runs)
            } else {
              result[origIdx] = emb;
              setCachedEmbedding(texts[origIdx], PER_ITEM_MODEL_KEY, emb);
            }
          } catch (e) {
            console.warn(`[Embedding] API call failed for ${inputs[origIdx].id}`);
            failureCount++;
            result[origIdx] = new Array(768).fill(0);
          }
        }));
        // Progress update with ETA
        const processed = Math.min(start + CONCURRENCY, uncachedIndices.length);
        if (processed % 50 === 0 || processed === uncachedIndices.length) {
          const embElapsed = (Date.now() - embStartTime) / 1000;
          const embEta = processed < uncachedIndices.length
            ? ` (~${Math.round(embElapsed / processed * (uncachedIndices.length - processed))}s remaining)`
            : '';
          onProgress?.(`Embedded ${processed}/${uncachedIndices.length}${embEta}`);
        }
      }
    } else {
      onProgress?.(`All ${texts.length} embeddings served from cache`);
    }

    inputEmbeddings = result.map(v => v ?? new Array(768).fill(0));

    if (failureCount > 0) {
      const pct = Math.round(failureCount / inputs.length * 100);
      if (failureCount > inputs.length * 0.5) {
        onProgress?.(`⚠️ ${pct}% of embeddings failed. Switching to local vectors to protect score integrity.`);
        useLocalVectors = true;
        localVectorizer = new LocalVectorizer(inputs.map(i => i.text));
        inputEmbeddings = inputs.map(i => localVectorizer!.embed(i.text));
      } else {
        // Partial failure: scores for the affected participants will be unreliable.
        // Surfacing this explicitly so the user is aware rather than silently wrong.
        onProgress?.(`⚠️ ${failureCount} embeddings failed (${pct}%). Affected participants may show artificially low representation scores.`);
      }
    }
  }

  // Determine which embedding tier was ultimately used (after all fallbacks are resolved)
  const embeddingTierUsed = activeConfig.embeddingProvider;

  // Pre-compute clustering — reused for hierarchical summarization (below) and participant analysis.
  // Must run after embeddings are finalised.
  const { assignments: clusterAssignments, k: numClusters } = computeAutoKMeans(inputEmbeddings);

  // 4. Generate Summary
  onProgress?.("Synthesizing summary...");
  let summaryText = "";

  if (activeConfig.summaryMethod === 'manual') {
    summaryText = activeConfig.manualSummaryText || "No summary provided.";
  } else if (activeConfig.summaryMethod === 'extractive') {
    onProgress?.("Running extractive algorithm...");
    // Centroid-based extraction
    const dim = inputEmbeddings[0].length;
    const centroid = new Array(dim).fill(0);
    for (const vec of inputEmbeddings) {
      for (let i = 0; i < dim; i++) centroid[i] += vec[i];
    }
    for (let i = 0; i < dim; i++) centroid[i] /= inputEmbeddings.length;

    // Rank by similarity to centroid
    const ranked = inputs.map((input, idx) => ({
      text: input.text,
      sim: cosineSimilarity(inputEmbeddings[idx], centroid)
    })).sort((a, b) => b.sim - a.sim);

    // Take top 3-5 sentences
    summaryText = ranked.slice(0, 4).map(r => r.text).join(' ');
  } else {
    // AI Mode
    // For very large datasets, sending all inputs would overflow the LLM context window.
    // Instead, select proportional cluster representatives — actual participant texts, not
    // abstractions — so the summary preserves authentic voice and scores stay accurate.
    try {
      // Dynamic length guidance based on dataset size
      // We don't want a hard word limit as it forces the model to drop perspectives.
      // Instead, we encourage a comprehensive summary proportional to the input diversity.
      const lengthGuidance = inputs.length > 30
        ? "Provide a comprehensive summary (approximately 3-5 paragraphs) that captures all distinct perspectives."
        : "Provide a concise but complete summary that captures all distinct perspectives.";

      const prompt = `Here are the contributions:\n${formatInputsForPrompt(inputs)}\n\n${lengthGuidance}`;
      summaryText = await generateCompletion(prompt, getSystemPrompt(activeConfig.strategy), activeConfig);
    } catch (e) {
      summaryText = "AI Generation Failed. " + inputs.slice(0, 3).map(i => i.text).join(' ');
    }
  }

  // Split sentences robustly — multilingual support.
  //
  // Handles:
  // - English abbreviations (e.g., Dr., etc.)
  // - CJK sentence-ending markers: 。(full stop), ！(exclamation), ？(question)
  // - Arabic/Urdu sentence markers: ۔ (full stop), ؟ (question mark)
  // - Devanagari: । (danda), ॥ (double danda)
  // - Thai: no explicit sentence delimiter — falls through to Latin splitter
  //   (Thai summaries from LLMs typically use Latin punctuation)
  //
  // Design: first split on non-Latin sentence markers, then apply the
  // Latin abbreviation-aware splitter to each resulting segment.
  const splitIntoSentences = (text: string): string[] => {
    // Step 1: Split on non-Latin sentence-ending punctuation
    // These are unambiguous sentence boundaries — no abbreviation issue.
    const nonLatinSentenceMarkers = /(?<=[。！？۔؟।॥])\s*/g;
    const segments = text.split(nonLatinSentenceMarkers).filter(s => s.trim().length > 0);

    const allSentences: string[] = [];

    for (const segment of segments) {
      // If this segment contains only non-Latin characters and is already a
      // sentence (came from a CJK/Arabic/Devanagari split), keep it as-is
      const hasLatinPunctuation = /[.!?]/.test(segment);

      if (!hasLatinPunctuation) {
        if (segment.trim().length > 0) allSentences.push(segment.trim());
        continue;
      }

      // Step 2: Latin abbreviation-aware splitting
      const abbreviations = [
        'e.g.', 'i.e.', 'etc.', 'vs.', 'cf.', 'al.', 'fig.', 'vol.',
        'Dr.', 'Mr.', 'Mrs.', 'Ms.', 'Prof.', 'Sr.', 'Jr.',
        'Inc.', 'Ltd.', 'Corp.', 'Co.', 'No.', 'approx.'
      ];

      let processed = segment;
      const placeholders: Map<string, string> = new Map();

      abbreviations.forEach((abbr, idx) => {
        const placeholder = `__ABBR${idx}__`;
        placeholders.set(placeholder, abbr);
        processed = processed.split(abbr).join(placeholder);
      });

      // Split on sentence-ending punctuation followed by space and capital letter, or end of string
      const sentences = processed.match(/[^.!?]+[.!?]+(?=\s+[A-Z]|$)/g) || [processed];

      // Restore abbreviations
      for (const sent of sentences) {
        let restored = sent;
        placeholders.forEach((abbr, placeholder) => {
          restored = restored.split(placeholder).join(abbr);
        });
        const trimmed = restored.trim();
        if (trimmed.length > 0) allSentences.push(trimmed);
      }
    }

    return allSentences;
  };

  const summarySentences = splitIntoSentences(summaryText);

  // Sentiment for Summary Sentences — same batch approach as participant inputs
  // to ensure consistent labeling (same prompt, same provider, same model).
  const summarySentenceSentiments = await batchAnalyzeSentiment(
    summarySentences, activeConfig, isConnected, onProgress
  );

  // 5. Embed Summary Sentences
  const sentenceEmbeddings: number[][] = [];
  if (useLocalVectors) {
    if (!localVectorizer) localVectorizer = new LocalVectorizer(inputs.map(i => i.text));
    for (const sent of summarySentences) sentenceEmbeddings.push(localVectorizer.embed(sent));
  } else {
    for (const sent of summarySentences) {
      try {
        const emb = await generateEmbedding(sent, activeConfig);
        sentenceEmbeddings.push(emb);
      } catch (e) {
        sentenceEmbeddings.push(new Array(inputEmbeddings[0]?.length || 768).fill(0));
      }
    }
  }

  // 6. Compute Metrics & Clustering
  onProgress?.("Computing analysis metrics...");

  // Compute PCA-2 for visualization (x,y)
  const pcaVectors = computePCA(inputEmbeddings, 2);
  const coords = pcaVectors.map(vec => ({ x: vec[0], y: vec[1] }));

  const clusterColors = ["#3b82f6", "#f97316", "#10b981", "#8b5cf6", "#ec4899"]; // Supports up to 5

  const globalCentroid = computeGlobalCentroid(inputEmbeddings);

  // Concept Fidelity Analysis is deferred to Phase 2 (enrichAnalysisResult).
  // participantMap is empty so keywords default to [] via the fallback on the
  // line below: `conceptFidelity.participantMap[idx] || { kept: [], dropped: [] }`.
  // Keywords are backfilled into participants by enrichAnalysisResult.
  const conceptFidelity: ConceptFidelityResult = {
    preservedConcepts: [], droppedConcepts: [], addedConcepts: [],
    fidelityScore: 0, participantMap: {},
  };

  // 6a. Pre-compute sentiment for ALL participants in batches (before the per-participant loop).
  // This reduces N individual AI calls down to N/100 batched calls.
  onProgress?.('Analyzing participant sentiment...');
  const allSentiments = await batchAnalyzeSentiment(
    inputs.map(i => i.text),
    activeConfig,
    isConnected,
    onProgress
  );

  // 6b. Hybrid Representation Scoring
  console.log(`[Analysis] Computing hybrid representation scores...`);
  onProgress?.("Computing representation scores...");

  const participants: ParticipantAnalysis[] = await Promise.all(inputs.map(async (input, idx) => {
    const embedding = inputEmbeddings[idx];

    // Semantic Representation Score (Match to Summary)
    // PROVENANCE LOGIC: Calculate matches to ALL sentences to support Many-to-Many
    const sentenceMatches: SentenceMatch[] = [];
    let maxSim = 0;
    let topSentIdx = 0;

    // Use configurable threshold for what constitutes a "significant" semantic match
    const { matchingThreshold } = ANALYSIS_CONFIG.thresholds;

    sentenceEmbeddings.forEach((sentEmb, sIdx) => {
      const sim = cosineSimilarity(embedding, sentEmb);
      // Store matches above the threshold (justification: standard IR threshold for "related" content)
      if (sim > matchingThreshold) {
        sentenceMatches.push({ sentenceIndex: sIdx, similarity: sim });
      }
      if (sim > maxSim) { maxSim = sim; topSentIdx = sIdx; }
    });

    // Ensure at least the top match is present even if low similarity (for "best guess")
    if (sentenceMatches.length === 0) {
      sentenceMatches.push({ sentenceIndex: topSentIdx, similarity: maxSim });
    }

    // Sort matches by strength
    sentenceMatches.sort((a, b) => b.similarity - a.similarity);

    // Aggregate embedding similarity: capture distributed representation
    // A participant's perspective may be spread across multiple summary sentences.
    // Using only max-similarity penalises distributed representation.
    // We take the top match at full weight, then add diminishing contributions
    // from secondary matches (γ = 0.3 decay) so that a participant partially
    // covered by 3 sentences scores higher than one covered by 0.
    //
    // Formula: S_emb = s_1 + γ·s_2 + γ²·s_3 + …  (clamped to [0, 1])
    // where s_i are the sorted match similarities above the threshold.
    //
    // Justification: This follows the "coverage-aware scoring" approach used in
    // multi-document summarisation evaluation (Radev et al., 2004). The decay
    // factor prevents double-counting when multiple sentences paraphrase the
    // same point.
    const SECONDARY_DECAY = 0.3;
    let embeddingSimilarity: number;

    if (sentenceMatches.length <= 1) {
      embeddingSimilarity = maxSim;
    } else {
      // sentenceMatches is already sorted descending by similarity
      let aggregated = sentenceMatches[0].similarity;
      for (let k = 1; k < sentenceMatches.length; k++) {
        aggregated += sentenceMatches[k].similarity * Math.pow(SECONDARY_DECAY, k);
      }
      embeddingSimilarity = Math.min(1, aggregated);
    }

    const conceptOverlap = computeConceptOverlapScore(input.text, summaryText);

    // --- Hybrid Representation Score ---
    // Combines dense embedding similarity (primary signal, captures semantics)
    // with TF-IDF keyword concept overlap (safety net for keyword-level matches).
    //
    // Weights rationale (from ANALYSIS_CONFIG.algorithms.representationWeights):
    //   When using neural embeddings (BGE-M3 / Gemini / Ollama / OpenAI), the embedding
    //   captures richer semantic relationships than keyword overlap, so it receives
    //   higher weight (default 0.8). TF-IDF is a sparser signal that acts as a
    //   "safety net" to catch direct keyword matches the embedding may miss (0.2).
    //
    //   When falling back to local TF-IDF vectors, both signals are derived from the
    //   same sparse term counts and are equally informative, so we use equal weights
    //   (0.5 / 0.5).
    const { embeddingWeight, conceptOverlapWeight } = ANALYSIS_CONFIG.algorithms.representationWeights;

    let representationScore: number;

    if (useLocalVectors) {
      // Both signals are TF-IDF-based — equal weighting is appropriate.
      representationScore = (embeddingSimilarity + conceptOverlap) / 2;
    } else {
      // Neural embedding dominant; concept overlap acts as safety net.
      representationScore = embeddingSimilarity * embeddingWeight + conceptOverlap * conceptOverlapWeight;
    }

    representationScore = Math.max(0, Math.min(1, representationScore));

    if (idx < 5) {
      console.log(`[Analysis] ${input.id}: emb=${embeddingSimilarity.toFixed(2)} (maxSim=${maxSim.toFixed(2)}, matches=${sentenceMatches.length}), concept=${conceptOverlap.toFixed(2)}, useLocal=${useLocalVectors} => final=${representationScore.toFixed(2)}`);
    }

    // --- Semantic Isolation: Distance from Global Centroid ---
    //
    // Design note: The global centroid is the arithmetic mean of all participant
    // embeddings, making it inherently majority-weighted. This is intentional:
    // the tool measures how far a voice is from the *consensus center*, which by
    // definition is dominated by the majority perspective. Isolation therefore
    // correctly flags participants whose views diverge from the mainstream.
    //
    // Limitation: In multi-cluster datasets, a participant in a legitimate
    // minority cluster may appear "isolated" even when surrounded by like-minded
    // peers. For such datasets, the intra-cluster distance (computed by
    // computeAutoKMeans) provides complementary context.
    const distanceToCenter = 1 - cosineSimilarity(embedding, globalCentroid);

    // Sentiment — already pre-computed in batch above
    const sentiment = allSentiments[idx];

    const concepts = conceptFidelity.participantMap[idx] || { kept: [], dropped: [] };

    // Detect whether this participant's embedding was a zero-vector failure.
    // A zero vector is the sentinel returned when the embedding API fails or
    // times out. We explicitly flag it so the UI can show a warning badge
    // and the aggregate metrics can exclude the participant.
    const embeddingFailed = embedding.every(v => v === 0);

    return {
      id: input.id,
      originalText: input.text,
      representationScore,
      semanticIsolation: distanceToCenter,
      semanticCoords: coords[idx] || { x: 0, y: 0 },
      clusterId: clusterAssignments[idx],
      sentenceMatches,
      topSentenceMatchIndex: topSentIdx,
      sentiment: sentiment.label,
      keywords: extractKeywords(input.text, 6),
      embeddingTier: embeddingTierUsed,
      detectedLanguage: detectLanguage(input.text),
      embeddingFailed: embeddingFailed || undefined, // only set when true
    };
  }));

  // Aggregate Metrics
  // Exclude participants with failed embeddings from aggregate metrics.
  // Including them (score ≈ 0) would artificially inflate the Gini coefficient
  // and depress average representation — misrepresenting the true equity picture.
  const validParticipants = participants.filter(p => !p.embeddingFailed);
  const failedCount = participants.length - validParticipants.length;
  if (failedCount > 0) {
    console.warn(
      `[Analysis] ${failedCount} participant(s) have failed embeddings and are excluded from aggregate metrics ` +
      `(Gini, avg representation, distinctGap). Their scores display as "⚠ Unreliable" in the UI.`
    );
  }
  const repScores = validParticipants.map(p => p.representationScore);
  const gini = calculateGini(repScores);
  const inputDiversity = computeAveragePairwiseDistance(inputEmbeddings);

  const { isolationPercentile } = ANALYSIS_CONFIG.thresholds;

  const sortedByIsolation = [...validParticipants].sort((a, b) => b.semanticIsolation - a.semanticIsolation);
  const splitIndex = Math.floor(validParticipants.length * isolationPercentile);
  let distinctGap = 0;
  if (splitIndex > 0) {
    const distinctGroup = sortedByIsolation.slice(0, splitIndex);
    const majorityGroup = sortedByIsolation.slice(splitIndex);
    const avgRepDistinct = distinctGroup.reduce((sum, p) => sum + p.representationScore, 0) / distinctGroup.length;
    const avgRepMajority = majorityGroup.reduce((sum, p) => sum + p.representationScore, 0) / majorityGroup.length;
    distinctGap = avgRepMajority - avgRepDistinct;
  }

  // Language equity analysis (detectedLanguage is now set on each participant)
  const languageAnalysis = analyzeLanguageEquity(participants);

  // 7. Influence Analysis (LOO Z-Score) + Representation Delta
  onProgress?.("Calculating influence leverage...");
  const dim = inputEmbeddings[0].length;
  const globalMean = computeGlobalCentroid(inputEmbeddings);

  const shifts: number[] = inputs.map((_, i) => {
    const looMean = new Array(dim).fill(0);
    for (let d = 0; d < dim; d++) {
      const sumWithoutI = (globalMean[d] * inputs.length) - inputEmbeddings[i][d];
      looMean[d] = sumWithoutI / (inputs.length - 1);
    }
    return 1 - cosineSimilarity(globalMean, looMean);
  });

  const avgShift = shifts.reduce((a, b) => a + b, 0) / shifts.length;
  // Bessel's correction: divide by (n - 1) for sample variance.
  // We are computing Z-scores from a sample of participants, not the full population,
  // so unbiased sample variance is the correct estimator.
  const n_loo = shifts.length;
  const variance = shifts.reduce((a, b) => a + (b - avgShift) ** 2, 0) / Math.max(1, n_loo - 1);
  const stdDev = Math.sqrt(variance) || 1e-9;

  // representationDelta: how removing participant i changes the OTHER participants' avg representation.
  // Positive = removal raises the group average (participant drags it down — below-average rep).
  // Negative = removal lowers the group average (participant pulls it up — above-average rep).
  const overallAvgRep = participants.reduce((s, p) => s + p.representationScore, 0) / participants.length;

  const sensitivityAnalysis: SensitivityResult[] = inputs.map((input, i) => {
    const zScore = (shifts[i] - avgShift) / stdDev;
    const sumOthers = participants.reduce((s, p, idx) => idx !== i ? s + p.representationScore : s, 0);
    const othersAvgRep = participants.length > 1 ? sumOthers / (participants.length - 1) : overallAvgRep;
    return {
      participantId: input.id,
      shiftScore: zScore,
      semanticDelta: shifts[i],
      representationDelta: othersAvgRep - overallAvgRep,
    };
  }).sort((a, b) => b.shiftScore - a.shiftScore);

  // 8. Bridging Suggestions - Identify isolated, underrepresented participants
  const sortedIso = [...participants].sort((a, b) => b.semanticIsolation - a.semanticIsolation);
  const isoThreshold = sortedIso[Math.floor(participants.length * isolationPercentile)]?.semanticIsolation || 0.3;
  const sortedRep = [...participants].sort((a, b) => a.representationScore - b.representationScore);
  const repThreshold = sortedRep[Math.floor(participants.length * isolationPercentile)]?.representationScore || ANALYSIS_CONFIG.thresholds.matchingThreshold;

  const bridgingOpportunities: BridgingSuggestion[] = participants
    .filter(p => p.semanticIsolation >= isoThreshold && p.representationScore <= repThreshold)
    .slice(0, 3)
    .map(p => {
      // FIX: Re-extract keywords using the improved filter (strips contractions + generic words)
      // rather than relying on p.keywords which may have been computed with the old extractor.
      const cleanKeywords = extractKeywords(p.originalText, 4)
        .filter(kw => kw.length >= 5);

      const issueText = `Isolation ${p.semanticIsolation.toFixed(2)} | Rep ${p.representationScore.toFixed(2)}`;

      // Build a human-readable concept label:
      //   1. If we have ≥1 clean keyword, use up to 3 joined by ", "
      //   2. Otherwise quote a short excerpt of the original text so the
      //      facilitator still has meaningful context (never show 'local issues').
      let conceptLabel: string;
      if (cleanKeywords.length > 0) {
        conceptLabel = cleanKeywords.slice(0, 3).join(', ');
      } else {
        const excerpt = p.originalText.trim().split(/[.!?]/)[0].trim();
        conceptLabel = excerpt.length > 80 ? excerpt.slice(0, 77) + '…' : excerpt;
      }

      return {
        participantId: p.id,
        issue: issueText,
        suggestion: `Participant ${p.id} raised a semantically distinct perspective that was not reflected in the summary. Their input (isolation: ${p.semanticIsolation.toFixed(2)}, representation: ${(p.representationScore * 100).toFixed(0)}%) should be explicitly surfaced.`,
        facilitationPrompt: `To the group: "One participant raised the perspective: '${conceptLabel}'. How could the current consensus be adapted to include this point of view?"`
      };
    });

  const clusters = Array.from({ length: numClusters }, (_, i) => ({
    id: i,
    label: `Cluster ${i + 1}`,
    color: clusterColors[i % clusterColors.length]
  }));

  // 8b. Compute Participant Similarity Network (mutual k-NN graph)
  // Pure math — no LLM calls. Mutual kNN produces sparse, high-confidence
  // edges: an edge exists iff both nodes rank each other in their top-k.
  onProgress?.("Building similarity network...");
  const knnK = Math.min(5, Math.ceil(Math.sqrt(inputs.length)));
  const networkEdges = computeMutualKNN(
    inputEmbeddings,
    inputs.map(inp => inp.id),
    knnK
  );
  const networkGraph: NetworkGraph = {
    nodes: participants.map(p => ({
      id: p.id,
      clusterId: p.clusterId,
      representationScore: p.representationScore,
      semanticIsolation: p.semanticIsolation,
      x: p.semanticCoords.x,
      y: p.semanticCoords.y,
    })),
    edges: networkEdges,
    k: knnK,
  };

  // 9. Compute Uncertainty Metrics (Bootstrap CI)
  const { bootstrapSamples } = ANALYSIS_CONFIG.algorithms;
  onProgress?.("Computing uncertainty estimates...");
  const uncertaintyMetrics = computeUncertaintyMetrics(participants, bootstrapSamples, 0.95);

  // 10. Compute Group Analysis (if groups are defined)
  onProgress?.("Analyzing stakeholder groups...");
  const groupAnalysis = analyzeGroups(inputs, participants);

  // 11. Compute Threshold Sensitivity
  const thresholdSensitivity = generateThresholdSensitivityData(
    participants.map(p => p.representationScore),
    participants.map(p => p.semanticIsolation)
  );

  // 12. Strategy Comparison (if enabled)
  let strategyComparison: StrategyComparisonResult[] | undefined;
  if (activeConfig.runStrategyComparison && activeConfig.summaryMethod === 'ai' && isConnected) {
    onProgress?.("Comparing summarization strategies...");
    try {
      const embedFn = async (text: string) => generateEmbedding(text, activeConfig);
      strategyComparison = await runStrategyComparison(
        inputs,
        inputEmbeddings,
        activeConfig,
        embedFn,
        (strategy, status) => onProgress?.(`Strategy ${strategy}: ${status}`)
      );
      if (strategyComparison.length > 0) {
        const sorted = [...strategyComparison].sort((a, b) => b.avgRepresentation - a.avgRepresentation);
        const best = sorted[0];
        const current = strategyComparison.find(s => s.strategy === activeConfig.strategy);
        if (best && current && best.strategy !== activeConfig.strategy) {
          best.recommendation = `The "${best.strategy}" strategy achieved ${((best.avgRepresentation - current.avgRepresentation) * 100).toFixed(0)}% better average representation. Consider using this approach for more inclusive summaries.`;
        } else if (best) {
          best.recommendation = `The current "${best.strategy}" strategy is optimal for this dataset.`;
        }
      }
    } catch (e) {
      console.error("Strategy comparison failed:", e);
    }
  }

  return {
    config: activeConfig,
    summary: summaryText,
    summarySentences,
    summarySentenceSentiments,
    participants,
    metrics: {
      giniCoefficient: gini,
      inputDiversity: inputDiversity,
      coverageUniformity: 1 - gini,
      distinctRepresentationGap: distinctGap,
      totalParticipants: inputs.length
    },
    clusters,
    networkGraph,
    sensitivityAnalysis,
    bridgingOpportunities,
    conceptAnalysis: undefined,
    enrichmentStatus: 'pending' as const,
    uncertaintyMetrics,
    groupAnalysis,
    thresholdSensitivity,
    strategyComparison,
    inputEmbeddings,
    embeddingTierUsed,
    languageAnalysis,
  };
};

// --- Phase 2: Concept Fidelity Enrichment ---

/**
 * Runs concept fidelity analysis in the background and merges the result
 * into the core analysis. Called after runCoreAnalysis so the dashboard
 * can render immediately without waiting for the N/5 LLM batches.
 */
export const enrichAnalysisResult = async (
  coreResult: AnalysisResult,
  inputs: ParticipantInput[],
  config: AnalysisConfig,
  onProgress?: (msg: string) => void
): Promise<AnalysisResult> => {
  // Re-check connection (same pattern as runCoreAnalysis)
  let isConnected = false;
  if (config.aiProvider === 'ollama') {
    isConnected = await checkOllamaConnection();
  } else if (config.aiProvider === 'groq') {
    isConnected = checkGroqConnection();
  } else {
    isConnected = await checkAIConnection();
  }

  const conceptFidelity = await performConceptFidelityAnalysis(
    inputs.map(i => i.text),
    coreResult.summary,
    { ...config, summaryMethod: config.summaryMethod },
    isConnected,
    onProgress
  );

  // Return new objects (not mutations) so React detects the state change.
  // Keywords (RAKE-extracted) are already set in Phase 1 — do not overwrite.
  return {
    ...coreResult,
    conceptAnalysis: conceptFidelity,
    enrichmentStatus: 'complete' as const,
  };
};

// --- Backward-Compatible Wrapper (used by multi-question mode and other callers) ---

export const runAnalysis = async (
  inputs: ParticipantInput[],
  config: AnalysisConfig,
  onProgress?: (msg: string) => void
): Promise<AnalysisResult> => {
  const core = await runCoreAnalysis(inputs, config, onProgress);
  return await enrichAnalysisResult(core, inputs, config, onProgress);
};
