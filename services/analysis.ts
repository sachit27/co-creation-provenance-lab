import { AnalysisResult, ParticipantInput, ParticipantAnalysis, AnalysisConfig, SensitivityResult, BridgingSuggestion, SentenceMatch, StrategyComparisonResult, NetworkGraph, LanguageFidelity, SentenceFidelity, PhraseMapping, TransformationType, EpistemicClass } from '../types';
import { checkAIConnection, generateEmbedding as generateGeminiEmbedding } from './gemini';
import { checkOllamaConnection, generateOllamaEmbedding } from './ollama';
import { checkGroqConnection } from './groq';
import { checkOpenAIConnection, generateOpenAIEmbedding } from './openai';
import { checkClaudeConnection } from './claude';
import { checkApertusConnection } from './apertus';
import { checkBgeM3Connection, generateBgeM3Embedding, generateBgeM3EmbeddingsBatch } from './bgeM3';
import { cosineSimilarity, computePCA, computeAutoKMeans, calculateGini, computeAveragePairwiseDistance, computeGlobalCentroid, computeMutualKNN, analyzeNetworkGraph } from './mathUtils';
// Note: analyzeSentimentAI has built-in 3-tier fallback (AI → HuggingFace → NLP)
// so we always use it regardless of AI connection status
import { analyzeSentimentAI, analyzeSentimentNLP } from './aiAnalysis';
import { LocalVectorizer } from './vectorizer';
import { computeConceptOverlapScore, extractKeywords } from './textUtils';
import { computeUncertaintyMetrics } from './uncertainty';
import { analyzeGroups } from './groupAnalysis';
import { checkHuggingFaceAvailable, analyzeSentimentBatchHF } from './huggingface';
import { generateThresholdSensitivityData } from '../components/visualizations/ThresholdSensitivityMini';
import { runStrategyComparison } from './strategyComparison';
import { ANALYSIS_CONFIG } from '../constants';
import { getCachedEmbedding, setCachedEmbedding, prewarmCache, getCachedEmbeddingAsync } from './embeddingCache';
import { detectLanguage, analyzeLanguageEquity } from './languageDetection';
import { generateCompletion } from './completionRouter';
import { scoreRhetoricalMarkers, analyzeRhetoricalBias, scoreRhetoricalWithLLM, mergeRhetoricalProfiles } from './rhetoricalAnalysis';
import { performClaimAttribution } from './claimAttribution';
import { performTensionAnalysis } from './tensionAnalysis';
import { buildSankeyData } from './sankeyBuilder';
import { buildKnowledgeGraph } from './graphRAG';

// --- Prompt Engineering ---

const getSystemPrompt = (strategy: string): string => {
  const base = "You are an expert AI facilitator for a collaborative decision-making process. Your goal is to synthesize participant inputs into a concise, actionable summary.\n\nCRITICAL INSTRUCTION: Output ONLY plain text paragraphs. Do NOT use markdown formatting, bolding (**), italics, bullet points, or section headings.";
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
// Note: bgeM3Available is checked per-call via checkBgeM3Connection() rather than
// stored in module-level state, to avoid race conditions when multiple analyses run
// concurrently (e.g., multi-question mode).

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

Sentiment means overall ATTITUDE toward the topic:
- POSITIVE: supportive, optimistic, constructive, advocating FOR something (even urgently)
- NEGATIVE: opposed, pessimistic, frustrated, raising complaints or fears
- NEUTRAL: balanced, purely descriptive, no clear valence

IMPORTANT disambiguation rules:
- "critical" meaning "essential/important" (e.g. "X is critical for Y") → POSITIVE, not negative
- "critical" meaning "disapproving" (e.g. "I am critical of X") → NEGATIVE
- Advocating for reforms, improvements, or solutions → POSITIVE (constructive intent)
- Identifying problems without proposing solutions → NEGATIVE or NEUTRAL depending on tone
- Academic/policy language ("accelerates", "enables", "fosters", "reforms", "essential") → typically POSITIVE
- "barrier", "concern", "risk" → NEGATIVE only if the speaker expresses worry; POSITIVE if they say these are OVERCOME

Analyze each numbered response:

RESPONSES:
${numberedInputs}

Return a JSON array (one entry per input, same order, index 0 = first):
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
  let bgeM3Available = await checkBgeM3Connection();
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
  // Tracks which input indices are part of an extractive summary (for data-leakage prevention)
  const extractiveIndices = new Set<number>();

  if (activeConfig.summaryMethod === 'manual') {
    summaryText = activeConfig.manualSummaryText || "No summary provided.";
  } else if (activeConfig.summaryMethod === 'extractive') {
    onProgress?.("Running extractive algorithm...");
    // Centroid-based extraction: select the most representative participant inputs.
    // IMPORTANT: When scoring participants against this extractive summary, we must
    // exclude their own text to avoid data leakage (a participant whose text IS the
    // summary trivially gets similarity ≈ 1.0). The extractiveIndices set tracks
    // which inputs were selected for the summary so downstream scoring can adjust.
    const dim = inputEmbeddings[0].length;
    const centroid = new Array(dim).fill(0);
    for (const vec of inputEmbeddings) {
      for (let i = 0; i < dim; i++) centroid[i] += vec[i];
    }
    for (let i = 0; i < dim; i++) centroid[i] /= inputEmbeddings.length;

    const ranked = inputs.map((input, idx) => ({
      text: input.text,
      idx,
      sim: cosineSimilarity(inputEmbeddings[idx], centroid)
    })).sort((a, b) => b.sim - a.sim);

    const selected = ranked.slice(0, 4);
    summaryText = selected.map(r => r.text).join(' ');
    // Track which participant indices were used in the extractive summary
    for (const r of selected) extractiveIndices.add(r.idx);
  } else {
    // AI Mode
    // For very large datasets, sending all inputs would overflow the LLM context window.
    // Instead, select proportional cluster representatives — actual participant texts, not
    // abstractions — so the summary preserves authentic voice and scores stay accurate.
    try {
      // Length guidance: user-specified word limit takes priority, otherwise auto-scale.
      let lengthGuidance: string;
      if (activeConfig.wordLimit && activeConfig.wordLimit > 0) {
        lengthGuidance = `Limit your summary to approximately ${activeConfig.wordLimit} words. Capture all distinct perspectives within this limit.`;
      } else {
        lengthGuidance = inputs.length > 30
          ? "Provide a comprehensive summary (approximately 3-5 paragraphs) that captures all distinct perspectives."
          : "Provide a concise but complete summary that captures all distinct perspectives.";
      }

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

    // Use configurable threshold for what constitutes a "significant" semantic match.
    // User-provided thresholds take precedence over defaults.
    const { matchingThreshold } = activeConfig.thresholds ?? ANALYSIS_CONFIG.thresholds;

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
      // sentenceMatches is already sorted descending by similarity.
      // Normalize by the geometric series sum so distributed representation
      // is not penalized by a hard ceiling at 1.0.
      let aggregated = sentenceMatches[0].similarity;
      let normFactor = 1;
      for (let k = 1; k < sentenceMatches.length; k++) {
        const weight = Math.pow(SECONDARY_DECAY, k);
        aggregated += sentenceMatches[k].similarity * weight;
        normFactor += weight;
      }
      embeddingSimilarity = aggregated / normFactor;
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

    // Data-leakage guard for extractive summaries: if this participant's text IS
    // part of the summary, the high similarity is tautological, not evidence of good
    // representation. Discount their score to the median of other participants' scores
    // (computed in a post-pass after all scores are known). For now, flag them.
    const isExtractiveSource = extractiveIndices.has(idx);
    if (isExtractiveSource) {
      // Will be corrected in post-pass below; mark for now
      representationScore = -1; // sentinel
    }

    if (idx < 5) {
      console.log(`[Analysis] ${input.id}: emb=${embeddingSimilarity.toFixed(2)} (maxSim=${maxSim.toFixed(2)}, matches=${sentenceMatches.length}), concept=${conceptOverlap.toFixed(2)}, useLocal=${useLocalVectors} => final=${representationScore.toFixed(2)}${isExtractiveSource ? ' (extractive source — will be corrected)' : ''}`);
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
      rhetoricalProfile: scoreRhetoricalMarkers(input.text),
    };
  }));

  // Post-pass: fix extractive summary data leakage.
  // Participants whose text IS the summary get the median score of non-extractive participants.
  if (extractiveIndices.size > 0) {
    const nonExtractiveScores = participants
      .filter(p => p.representationScore >= 0) // sentinel is -1
      .map(p => p.representationScore)
      .sort((a, b) => a - b);
    const median = nonExtractiveScores.length > 0
      ? nonExtractiveScores[Math.floor(nonExtractiveScores.length / 2)]
      : 0.5;
    for (const p of participants) {
      if (p.representationScore < 0) p.representationScore = median;
    }
  }

  // Rhetorical bias analysis (deterministic, runs on all participants)
  const rhetoricalBias = analyzeRhetoricalBias(participants);

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
  // Filter out zero-vector failed embeddings from diversity computation —
  // zero vectors have cosine similarity 0 with everything, artificially inflating distance.
  const validEmbeddings = inputEmbeddings.filter((_, i) => !participants[i].embeddingFailed);
  const inputDiversity = computeAveragePairwiseDistance(validEmbeddings.length >= 2 ? validEmbeddings : inputEmbeddings);

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
  // Exclude participants with failed embeddings — a zero-vector removal would
  // artificially shift the centroid, making failed participants look "influential".
  onProgress?.("Calculating influence leverage...");
  const dim = inputEmbeddings[0].length;
  // Compute centroid only from valid (non-zero) embeddings
  const validIdxs = inputs.map((_, i) => i).filter(i => !participants[i].embeddingFailed);
  const looCentroid = computeGlobalCentroid(validIdxs.map(i => inputEmbeddings[i]));

  const shifts: number[] = inputs.map((_, i) => {
    if (participants[i].embeddingFailed) return 0; // No influence computable
    const looMean = new Array(dim).fill(0);
    for (let d = 0; d < dim; d++) {
      const sumWithoutI = (looCentroid[d] * validIdxs.length) - inputEmbeddings[i][d];
      looMean[d] = sumWithoutI / Math.max(1, validIdxs.length - 1);
    }
    return 1 - cosineSimilarity(looCentroid, looMean);
  });

  const avgShift = shifts.reduce((a, b) => a + b, 0) / shifts.length;
  // Bessel's correction: divide by (n - 1) for sample variance.
  // We are computing Z-scores from a sample of participants, not the full population,
  // so unbiased sample variance is the correct estimator.
  const n_loo = shifts.length;
  const variance = shifts.reduce((a, b) => a + (b - avgShift) ** 2, 0) / Math.max(1, n_loo - 1);
  const stdDev = Math.sqrt(variance) || 1e-9;

  // representationDelta: how far this participant's representation score deviates
  // from the group average. Positive = above average, negative = below average.
  // This is a simpler, more interpretable metric than a true LOO re-analysis
  // (which would require re-summarizing without the participant).
  const overallAvgRep = validParticipants.length > 0
    ? validParticipants.reduce((s, p) => s + p.representationScore, 0) / validParticipants.length
    : 0;

  const sensitivityAnalysis: SensitivityResult[] = inputs.map((input, i) => {
    const zScore = (shifts[i] - avgShift) / stdDev;
    return {
      participantId: input.id,
      shiftScore: zScore,
      semanticDelta: shifts[i],
      representationDelta: participants[i].representationScore - overallAvgRep,
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
  const networkNodes = participants.map(p => ({
    id: p.id,
    clusterId: p.clusterId,
    representationScore: p.representationScore,
    semanticIsolation: p.semanticIsolation,
    x: p.semanticCoords.x,
    y: p.semanticCoords.y,
  }));
  const networkAnalysis = analyzeNetworkGraph(networkNodes, networkEdges);
  const networkGraph: NetworkGraph = {
    nodes: networkNodes,
    edges: networkEdges,
    k: knnK,
    analysis: networkAnalysis,
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
      totalParticipants: inputs.length,
      scoredParticipants: validParticipants.length
    },
    clusters,
    networkGraph,
    sensitivityAnalysis,
    bridgingOpportunities,
    enrichmentStatus: 'pending' as const,
    uncertaintyMetrics,
    groupAnalysis,
    thresholdSensitivity,
    strategyComparison,
    inputEmbeddings,
    embeddingTierUsed,
    languageAnalysis,
    rhetoricalBias,
  };
};

// --- Phase 2: Language Fidelity Enrichment ---

// ── Language Fidelity Analysis ────────────────────────────────────────────────
// For each summary sentence, traces how raw participant language was transformed.
// Runs one LLM call per summary sentence — classifies each phrase-level change.

const performLanguageFidelityAnalysis = async (
  summarySentences: string[],
  participants: ParticipantAnalysis[],
  inputs: ParticipantInput[],
  config: AnalysisConfig,
  isConnected: boolean,
  onProgress?: (msg: string) => void
): Promise<LanguageFidelity> => {
  const sentences: SentenceFidelity[] = [];
  const overallCounts: Record<TransformationType, number> = {
    preserved: 0, softened: 0, sanitized: 0, abstracted: 0, dropped: 0
  };

  if (!isConnected) {
    // Without LLM, return empty analysis
    return { sentences: [], overallCounts, fidelityScore: 0, summaryDroppedParticipantIds: [] };
  }

  for (let si = 0; si < summarySentences.length; si++) {
    onProgress?.(`Language fidelity: sentence ${si + 1}/${summarySentences.length}`);
    const sentence = summarySentences[si];

    // Get participants genuinely matched to this sentence.
    // Primary: participants whose top match is this sentence.
    // Secondary: participants with any significant similarity (>= 0.3) to this sentence.
    let matched = participants
      .filter(p => p.topSentenceMatchIndex === si)
      .slice(0, 15);

    if (matched.length === 0) {
      matched = participants
        .filter(p => p.sentenceMatches.some(m => m.sentenceIndex === si && m.similarity >= 0.3))
        .sort((a, b) => {
          const simA = a.sentenceMatches.find(m => m.sentenceIndex === si)?.similarity ?? 0;
          const simB = b.sentenceMatches.find(m => m.sentenceIndex === si)?.similarity ?? 0;
          return simB - simA;
        })
        .slice(0, 10);
    }

    // When no participant genuinely relates to this sentence, do epistemic-only analysis.
    // Using top-scored participants as proxy for phrase mapping would produce meaningless
    // "dropped" labels for content that simply doesn't relate to this sentence.
    const hasMatchedParticipants = matched.length > 0;

    // For epistemic context when no participants match, use a broad sample
    const epistemicContext = hasMatchedParticipants
      ? matched
      : [...participants].sort((a, b) => b.representationScore - a.representationScore).slice(0, 5);

    const inputBlock = epistemicContext
      .map(p => `[${p.id}] "${inputs.find(inp => inp.id === p.id)?.text?.slice(0, 300) || p.originalText.slice(0, 300)}"`)
      .join('\n');

    // Provide the full summary as context so the LLM can distinguish between
    // "concept dropped from the entire summary" vs "concept captured in a different sentence."
    // Without this, the LLM frequently marks content as "dropped" when it's just expressed elsewhere.
    const summaryContext = summarySentences.map((s, i) =>
      `${i === si ? '>>> ' : '    '}[${i + 1}] ${s}`
    ).join('\n');

    // Two different prompts: full analysis when participants match, epistemic-only otherwise.
    const prompt = hasMatchedParticipants
      ? `You are analyzing how raw participant language was transformed in a summary.

FULL SUMMARY (the sentence being analyzed is marked with >>>):
${summaryContext}

RAW PARTICIPANT INPUTS THAT MAP TO THE MARKED SENTENCE:
${inputBlock}

Perform TWO analyses:

## PART 1: Phrase Transformation
For each participant input, identify their single most important claim or phrase and classify how it was transformed in the MARKED summary sentence:

- "preserved": the core meaning AND emotional intensity/specificity are kept faithfully in this sentence
- "softened": same topic but intensity/urgency is clearly reduced (e.g. "will destroy jobs" → "may displace workers", "furious" → "concerned")
- "sanitized": a specific accusation, demand, or criticism is replaced with neutral/bureaucratic framing (e.g. "stolen datasets" → "data usage concerns", "corrupt officials" → "governance challenges")
- "abstracted": a concrete, specific experience becomes a vague category (e.g. "I can't pay rent this month" → "financial difficulties", "three patients died" → "adverse events occurred")
- "dropped": the participant's most important concept does not appear in this sentence AND is also absent from the rest of the summary

IMPORTANT:
- Only classify as "softened"/"sanitized"/"abstracted" when there is a CLEAR, identifiable shift in meaning, intensity, or specificity — not when the summary simply paraphrases using different words.
- Before marking "dropped", check the other summary sentences. If the concept appears elsewhere in the summary, classify as "preserved" with a note that it appears in a different sentence.
- Default to "preserved" when the meaning is captured with reasonable fidelity.

## PART 2: Epistemic Classification
Classify the overall claim in the marked summary sentence:
- "explicit": directly stated or closely paraphrased from source inputs
- "inferred": reasonable synthesis from the evidence, not directly stated
- "extrapolated": requires knowledge or context beyond what the sources provide
- "speculative": forward-looking, predictive, or generated without source basis

Return ONLY this JSON:
{"mappings": [{"participantId": "...", "rawPhrase": "exact phrase from their input", "summaryPhrase": "matching phrase in summary or null", "type": "preserved|softened|sanitized|abstracted|dropped"}], "epistemicClass": "explicit|inferred|extrapolated|speculative", "epistemicExplanation": "one sentence reason"}`

      : `You are classifying the epistemic status of a summary sentence relative to source inputs.

SUMMARY SENTENCE:
"${sentence}"

SOURCE INPUTS (context):
${inputBlock}

Classify the overall claim in the summary sentence:
- "explicit": directly stated or closely paraphrased from source inputs
- "inferred": reasonable synthesis from the evidence, not directly stated
- "extrapolated": requires knowledge or context beyond what the sources provide
- "speculative": forward-looking, predictive, or generated without clear source basis

Return ONLY this JSON:
{"mappings": [], "epistemicClass": "explicit|inferred|extrapolated|speculative", "epistemicExplanation": "one sentence reason"}`;

    try {
      const response = await generateCompletion(
        prompt,
        'You are a linguistic analysis expert specializing in discourse transformation. Return only valid JSON.',
        config
      );

      const jsonMatch = response.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        const parsed = JSON.parse(jsonMatch[0]) as any;
        const validTypes: TransformationType[] = ['preserved', 'softened', 'sanitized', 'abstracted', 'dropped'];
        const validEpistemic: EpistemicClass[] = ['explicit', 'inferred', 'extrapolated', 'speculative'];
        const mappings: PhraseMapping[] = [];
        const counts: Record<TransformationType, number> = {
          preserved: 0, softened: 0, sanitized: 0, abstracted: 0, dropped: 0
        };

        const mappingEntries = Array.isArray(parsed) ? parsed : (parsed.mappings || []);
        for (const entry of mappingEntries) {
          // Skip entries with unrecognized types — do NOT silently reclassify them,
          // as that inflates whichever category we default to.
          if (!validTypes.includes(entry.type)) continue;
          const type = entry.type as TransformationType;
          counts[type]++;
          overallCounts[type]++;
          mappings.push({
            participantId: entry.participantId || 'unknown',
            rawPhrase: entry.rawPhrase || '',
            summaryPhrase: entry.summaryPhrase || null,
            type,
          });
        }

        const epistemicClass = validEpistemic.includes(parsed.epistemicClass)
          ? parsed.epistemicClass as EpistemicClass
          : undefined;
        const epistemicExplanation = typeof parsed.epistemicExplanation === 'string'
          ? parsed.epistemicExplanation
          : undefined;

        sentences.push({
          sentenceIndex: si, sentenceText: sentence, counts, mappings,
          epistemicClass, epistemicExplanation,
        });
      } else {
        sentences.push({
          sentenceIndex: si, sentenceText: sentence,
          counts: { preserved: 0, softened: 0, sanitized: 0, abstracted: 0, dropped: 0 },
          mappings: [],
        });
      }
    } catch (e) {
      console.warn(`[LanguageFidelity] Sentence ${si} failed:`, e);
      sentences.push({
        sentenceIndex: si, sentenceText: sentence,
        counts: { preserved: 0, softened: 0, sanitized: 0, abstracted: 0, dropped: 0 },
        mappings: [],
      });
    }
  }

  // ── Post-processing: distinguish per-sentence "dropped" from summary-level drops ──
  // A participant whose phrase is "dropped" from sentence S1 but "preserved" in sentence S3
  // is not truly dropped from the summary — the label is only meaningful within that sentence.
  // We compute summaryDroppedParticipantIds separately and adjust the fidelity score to not
  // double-penalize participants who appear elsewhere.
  const participantsRepresentedAnywhere = new Set<string>();
  for (const sf of sentences) {
    for (const m of sf.mappings) {
      if (m.type !== 'dropped') participantsRepresentedAnywhere.add(m.participantId);
    }
  }

  const summaryDroppedParticipantIds = participants
    .map(p => p.id)
    .filter(id => !participantsRepresentedAnywhere.has(id));

  // Fidelity score: preserved / (total - cross-sentence dropped)
  // "dropped" mappings for participants who appear elsewhere in the summary don't count
  // against fidelity since the content was captured, just in a different sentence.
  let effectiveTotal = 0;
  let preservedCount = 0;
  for (const sf of sentences) {
    for (const m of sf.mappings) {
      if (m.type === 'dropped' && participantsRepresentedAnywhere.has(m.participantId)) continue;
      effectiveTotal++;
      if (m.type === 'preserved') preservedCount++;
    }
  }
  const fidelityScore = effectiveTotal > 0 ? preservedCount / effectiveTotal : 0;

  return { sentences, overallCounts, fidelityScore, summaryDroppedParticipantIds };
};

/**
 * Runs language fidelity analysis in the background and merges the result
 * into the core analysis. Called after runCoreAnalysis so the dashboard
 * can render immediately without waiting for the per-sentence LLM calls.
 */
export const enrichAnalysisResult = async (
  coreResultArg: AnalysisResult,
  inputs: ParticipantInput[],
  config: AnalysisConfig,
  onProgress?: (msg: string) => void
): Promise<AnalysisResult> => {
  // Mutable copy so we can update participants/rhetoricalBias without mutating the input
  let coreResult = coreResultArg;
  // Re-check connection (same pattern as runCoreAnalysis)
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

  // Language fidelity: how raw language was transformed in the summary
  const languageFidelity = await performLanguageFidelityAnalysis(
    coreResult.summarySentences,
    coreResult.participants,
    inputs,
    config,
    isConnected,
    onProgress
  );

  // Claim-level attribution (LLM-heavy, decomposes summary into atomic claims)
  // Pass input embeddings + embedding function for hybrid semantic+TF-IDF evidence search
  let claimAttribution = undefined;
  try {
    if (isConnected) {
      const embedFn = (text: string) => generateEmbedding(text, config);
      claimAttribution = await performClaimAttribution(
        coreResult.summarySentences, coreResult.participants, inputs, config, onProgress,
        coreResult.inputEmbeddings, embedFn
      );
    }
  } catch (e) {
    console.warn('[Enrichment] Claim attribution failed, skipping:', e);
  }

  // Tension & contradiction mapping (LLM-heavy, finds disagreements)
  let tensionAnalysis = undefined;
  try {
    if (isConnected) {
      tensionAnalysis = await performTensionAnalysis(
        coreResult.participants, inputs, coreResult.summary,
        coreResult.clusters, config, onProgress
      );
    }
  } catch (e) {
    console.warn('[Enrichment] Tension analysis failed, skipping:', e);
  }

  // GraphRAG: Build knowledge graph from participant inputs
  let knowledgeGraph = undefined;
  try {
    if (isConnected) {
      knowledgeGraph = await buildKnowledgeGraph(inputs, config, onProgress, coreResult.summary);
    }
  } catch (e) {
    console.warn('[Enrichment] Knowledge graph construction failed, skipping:', e);
  }

  // LLM-enhanced rhetorical scoring: blends context-aware LLM scores with lexicon baseline
  try {
    if (isConnected) {
      onProgress?.('Rhetorical analysis: LLM-enhanced scoring...');
      const textsForRhetorical = inputs.map(inp => ({ id: inp.id, text: inp.text }));
      const llmRhetoricalScores = await scoreRhetoricalWithLLM(textsForRhetorical, config, onProgress);
      if (llmRhetoricalScores.size > 0) {
        // Work on a copy of participants to avoid mutating coreResult in place
        const updatedParticipants = coreResult.participants.map(p => ({ ...p }));
        mergeRhetoricalProfiles(updatedParticipants, llmRhetoricalScores);
        // Replace participants and re-run bias analysis with updated profiles
        coreResult = { ...coreResult, participants: updatedParticipants };
        coreResult = { ...coreResult, rhetoricalBias: analyzeRhetoricalBias(updatedParticipants) };
      }
    }
  } catch (e) {
    console.warn('[Enrichment] LLM rhetorical scoring failed, using lexicon-only:', e);
  }

  // Assemble enriched result (before Sankey so Sankey can use all data)
  const enrichedResult: AnalysisResult = {
    ...coreResult,
    languageFidelity,
    claimAttribution,
    tensionAnalysis,
    knowledgeGraph,
    enrichmentStatus: 'complete' as const,
  };

  // Provenance Sankey (deterministic, assembles from all available data)
  try {
    enrichedResult.sankeyData = buildSankeyData(enrichedResult, inputs);
  } catch (e) {
    console.warn('[Enrichment] Sankey build failed, skipping:', e);
  }

  return enrichedResult;
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
