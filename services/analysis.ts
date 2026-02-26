import { AnalysisResult, ParticipantInput, ParticipantAnalysis, AnalysisConfig, SensitivityResult, BridgingSuggestion, ConceptFidelityResult, SentenceMatch, StrategyComparisonResult } from '../types';
import { checkAIConnection, generateCompletion as generateGeminiCompletion, generateEmbedding as generateGeminiEmbedding } from './gemini';
import { checkOllamaConnection, generateOllamaCompletion, generateOllamaEmbedding } from './ollama';
import { checkGroqConnection, generateGroqCompletion } from './groq';
import { checkBgeM3Connection, generateBgeM3Embedding, generateBgeM3EmbeddingsBatch } from './bgeM3';
import { cosineSimilarity, computePCA, computeAutoKMeans, calculateGini, computeAveragePairwiseDistance, computeGlobalCentroid } from './mathUtils';
// Note: analyzeSentimentAI has built-in 3-tier fallback (AI → HuggingFace → NLP)
// so we always use it regardless of AI connection status
import { analyzeSentimentAI, analyzeConceptGapAI, extractKeywordsAI } from './aiAnalysis';
import { LocalVectorizer } from './vectorizer';
import { computeConceptFidelity, computeConceptOverlapScore, extractKeywords } from './textUtils';
import { computeUncertaintyMetrics } from './uncertainty';
import { analyzeGroups } from './groupAnalysis';
import { generateThresholdSensitivityData } from '../components/visualizations/ThresholdSensitivityMini';
import { runStrategyComparison } from './strategyComparison';
import { ANALYSIS_CONFIG } from '../constants';
import { detectLanguage, analyzeLanguageEquity } from './languageDetection';

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

const generateEmbedding = async (text: string, config: AnalysisConfig): Promise<number[]> => {
  // Try BGE-M3 first (state-of-the-art, local, free)
  if (bgeM3Available) {
    try {
      return await generateBgeM3Embedding(text);
    } catch (e) {
      console.warn('[Embedding] BGE-M3 call failed, falling back to provider:', e);
    }
  }
  // Fallback to configured provider
  if (config.aiProvider === 'ollama') return await generateOllamaEmbedding(text, config.embeddingModel);
  return await generateGeminiEmbedding(text, config.embeddingModel);
};

const generateCompletion = async (prompt: string, system: string, config: AnalysisConfig): Promise<string> => {
  if (config.aiProvider === 'ollama') return await generateOllamaCompletion(prompt, system, config.model);
  if (config.aiProvider === 'groq') return await generateGroqCompletion(prompt, system, config.model);
  return await generateGeminiCompletion(prompt, system, config.model);
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

  // Process in parallel with rate limiting if needed (batch of 5)
  const BATCH_SIZE = 5;
  for (let i = 0; i < inputs.length; i += BATCH_SIZE) {
    const batch = inputs.slice(i, i + BATCH_SIZE);
    await Promise.all(batch.map(async (text, batchIdx) => {
      const actualIdx = i + batchIdx;
      // Use analyzeConceptGapAI which has built-in 3-tier fallback
      const gap = await analyzeConceptGapAI(text, summary, config);
      participantMap[actualIdx] = gap;

      gap.kept.forEach(c => allExampleConcepts.add(c));
      gap.dropped.forEach(c => allExampleConcepts.add(c));
      totalConcepts += (gap.kept.length + gap.dropped.length);
      retainedCount += gap.kept.length;
    }));
    onProgress?.(`Analyzed concepts for ${Math.min(i + BATCH_SIZE, inputs.length)}/${inputs.length} inputs...`);
  }

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

  // Use the robust checker (textUtils)
  const { analyzeConceptGap } = await import('./textUtils');

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

export const runAnalysis = async (
  inputs: ParticipantInput[],
  config: AnalysisConfig,
  onProgress?: (msg: string) => void
): Promise<AnalysisResult> => {

  // 1. Connection Check
  onProgress?.(`Checking availability...`);
  let isConnected = false;
  if (config.aiProvider === 'ollama') {
    isConnected = await checkOllamaConnection();
  } else if (config.aiProvider === 'groq') {
    isConnected = checkGroqConnection();
  } else {
    isConnected = await checkAIConnection();
  }

  // Check BGE-M3 availability (independent of AI provider — used for embeddings only)
  bgeM3Available = await checkBgeM3Connection();
  if (bgeM3Available) {
    onProgress?.("BGE-M3 embedding server detected");
    console.log('[Analysis] BGE-M3 available — using state-of-the-art embeddings');
  }

  // If AI is selected but offline, force fallback (but keep embeddings via local)
  let activeConfig = { ...config };
  if (!isConnected && activeConfig.summaryMethod === 'ai') {
    console.warn("AI Connection failed. Switching to extractive.");
    onProgress?.("⚠️ AI Offline. Switching to Extractive Summary.");
    await new Promise(r => setTimeout(r, 1000));
    activeConfig.summaryMethod = 'extractive';
    activeConfig.runLOO = false;
  }

  // 2. Determine Embedding Strategy
  // Priority: BGE-M3 → Ollama/Gemini → Local TF-IDF
  const hasEmbeddingSource = bgeM3Available || isConnected;
  let useLocalVectors = !hasEmbeddingSource;

  // 3. Generate Embeddings
  let inputEmbeddings: number[][] = [];
  let localVectorizer: LocalVectorizer | null = null;

  if (useLocalVectors) {
    onProgress?.("Generating local vector space...");
    localVectorizer = new LocalVectorizer(inputs.map(i => i.text));
    inputEmbeddings = inputs.map(i => localVectorizer!.embed(i.text));
  } else if (bgeM3Available) {
    // BGE-M3: Use batch embedding for efficiency
    onProgress?.("Generating BGE-M3 embeddings (batch)...");
    try {
      inputEmbeddings = await generateBgeM3EmbeddingsBatch(inputs.map(i => i.text));
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
    onProgress?.(`Generating embeddings...`);
    let failureCount = 0;
    for (let i = 0; i < inputs.length; i++) {
      if (i % 5 === 0) onProgress?.(`Embedding input ${i + 1}/${inputs.length}...`);
      try {
        const emb = await generateEmbedding(inputs[i].text, activeConfig);
        if (emb.every(v => v === 0)) failureCount++;
        inputEmbeddings.push(emb);
      } catch (e) {
        console.warn(`Embedding failed for ${inputs[i].id}`);
        failureCount++;
        inputEmbeddings.push(new Array(768).fill(0));
      }
    }

    if (failureCount > inputs.length * 0.5) {
      onProgress?.("⚠️ High API failure. Switching to local vectors.");
      useLocalVectors = true;
      localVectorizer = new LocalVectorizer(inputs.map(i => i.text));
      inputEmbeddings = inputs.map(i => localVectorizer!.embed(i.text));
    }
  }

  // Determine which embedding tier was ultimately used (after all fallbacks are resolved)
  const embeddingTierUsed: 'bge-m3' | 'ollama' | 'gemini' | 'tfidf' =
    useLocalVectors ? 'tfidf' :
    bgeM3Available ? 'bge-m3' :
    activeConfig.aiProvider === 'ollama' ? 'ollama' : 'gemini';

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
    try {
      const prompt = `Here are the contributions:\n${formatInputsForPrompt(inputs)}\n\nProvide a summary (150 words).`;
      const systemPrompt = getSystemPrompt(activeConfig.strategy);
      summaryText = await generateCompletion(prompt, systemPrompt, activeConfig);
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

  // Sentiment for Summary Sentences
  // analyzeSentimentAI has built-in 3-tier fallback, so always use it
  // Tier 1: AI (Gemini/Ollama) → Tier 2: HuggingFace → Tier 3: VADER-style NLP
  const summarySentenceSentiments = await Promise.all(
    summarySentences.map(s => analyzeSentimentAI(s, activeConfig))
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

  // DYNAMIC CLUSTERING: Determine optimal K (now uses PCA-5 internally)
  const { assignments: clusterAssignments, k: numClusters } = computeAutoKMeans(inputEmbeddings);
  const clusterColors = ["#3b82f6", "#f97316", "#10b981", "#8b5cf6", "#ec4899"]; // Supports up to 5

  const globalCentroid = computeGlobalCentroid(inputEmbeddings);

  // Concept Fidelity Analysis (Async)
  const conceptFidelity = await performConceptFidelityAnalysis(
    inputs.map(i => i.text),
    summaryText,
    activeConfig,
    isConnected,
    onProgress
  );

  // 6a. Hybrid Representation Scoring
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

    let representationScore: number;

    if (useLocalVectors) {
      representationScore = (embeddingSimilarity + conceptOverlap) / 2;
    } else {
      representationScore = embeddingSimilarity * 0.8 + conceptOverlap * 0.2;
    }

    representationScore = Math.max(0, Math.min(1, representationScore));

    if (idx < 5) {
      console.log(`[Analysis] ${input.id}: emb=${embeddingSimilarity.toFixed(2)} (maxSim=${maxSim.toFixed(2)}, matches=${sentenceMatches.length}), concept=${conceptOverlap.toFixed(2)}, useLocal=${useLocalVectors} => final=${representationScore.toFixed(2)}`);
    }

    const distanceToCenter = 1 - cosineSimilarity(embedding, globalCentroid);

    // Sentiment Analysis - always use tiered function
    // It automatically falls back: AI → HuggingFace → improved NLP
    const sentiment = await analyzeSentimentAI(input.text, activeConfig);

    const concepts = conceptFidelity.participantMap[idx] || { kept: [], dropped: [] };

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
      keywords: concepts.dropped,
      embeddingTier: embeddingTierUsed,
      detectedLanguage: detectLanguage(input.text),
    };
  }));

  // Aggregate Metrics
  const repScores = participants.map(p => p.representationScore);
  const gini = calculateGini(repScores);
  const inputDiversity = computeAveragePairwiseDistance(inputEmbeddings);

  const { isolationPercentile } = ANALYSIS_CONFIG.thresholds;

  const sortedByIsolation = [...participants].sort((a, b) => b.semanticIsolation - a.semanticIsolation);
  const splitIndex = Math.floor(participants.length * isolationPercentile);
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
      const missingConcepts = p.keywords.slice(0, 3).join(", ");
      const issueText = `Isolation ${p.semanticIsolation.toFixed(2)} | Rep ${p.representationScore.toFixed(2)}`;

      return {
        participantId: p.id,
        issue: issueText,
        suggestion: `Participant ${p.id} introduces distinct concepts (${missingConcepts || 'unique perspective'}) that are missing. Integrating these would bridge a semantic gap.`,
        facilitationPrompt: `To the group: "${p.id} mentioned concepts like '${missingConcepts || 'local issues'}'. How can we adapt the current consensus to address this perspective?"`
      };
    });

  const clusters = Array.from({ length: numClusters }, (_, i) => ({
    id: i,
    label: `Cluster ${i + 1}`,
    color: clusterColors[i % clusterColors.length]
  }));

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
    sensitivityAnalysis,
    bridgingOpportunities,
    conceptAnalysis: conceptFidelity,
    uncertaintyMetrics,
    groupAnalysis,
    thresholdSensitivity,
    strategyComparison,
    inputEmbeddings,
    embeddingTierUsed,
    languageAnalysis,
  };
};
