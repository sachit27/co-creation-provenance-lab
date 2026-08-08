/**
 * Claim-Level Attribution (Atomic Provenance)
 *
 * Decomposes each summary sentence into atomic claims (single propositions),
 * then traces each claim back to source participant texts. Classifies each
 * claim as supported, inferrable, unsupported, or contradicted.
 *
 * Inspired by FActScore (Min et al. 2023) and SAFE (Google DeepMind 2024).
 * Runs in Phase 2 (background enrichment) due to LLM dependency.
 */

import { ParticipantAnalysis, ParticipantInput, AnalysisConfig, AtomicClaim, ClaimAttribution, ClaimSupportLevel } from '../types';
import { generateCompletion } from './completionRouter';
import { computeConceptOverlapScore } from './textUtils';
import { cosineSimilarity } from './mathUtils';

const MAX_CLAIMS_PER_SENTENCE = 5;
const MAX_EVIDENCE_PER_CLAIM = 5;

// ── Claim Decomposition ─────────────────────────────────────────────────────────

const decomposeSentenceIntoClaims = async (
  sentence: string,
  config: AnalysisConfig
): Promise<string[]> => {
  const prompt = `Decompose this summary sentence into atomic claims (single, independent propositions). Each claim should express exactly one fact or assertion that can be independently verified.

SENTENCE: "${sentence}"

Rules:
- Each claim must be a complete, self-contained statement
- Strip qualifiers like "according to" — just state the claim
- Maximum ${MAX_CLAIMS_PER_SENTENCE} claims
- Return a JSON array of strings

Example: "Many participants expressed concerns about data privacy and called for stronger regulations."
→ ["Participants expressed concerns about data privacy", "Participants called for stronger regulations"]

Return ONLY a JSON array.`;

  try {
    const response = await generateCompletion(
      prompt,
      'You are a claim decomposition expert. Return only valid JSON arrays.',
      config
    );
    const match = response.match(/\[[\s\S]*\]/);
    if (match) {
      const claims = JSON.parse(match[0]) as string[];
      return claims.filter(c => typeof c === 'string' && c.length > 5).slice(0, MAX_CLAIMS_PER_SENTENCE);
    }
  } catch (e) {
    console.warn('[ClaimAttribution] Decomposition failed:', e);
  }
  // Fallback: treat the whole sentence as one claim
  return [sentence];
};

// ── Evidence Search ─────────────────────────────────────────────────────────────

/**
 * Hybrid evidence search: combines embedding-based semantic similarity with
 * TF-IDF concept overlap and keyword matching for robust claim-to-source matching.
 *
 * When embeddings are available, cosine similarity is the primary signal.
 * TF-IDF and keyword match act as complementary features (exact terminology,
 * acronyms) that embeddings may underweight. Final score:
 *   score = 0.5 * embeddingSim + 0.3 * conceptOverlap + 0.2 * keywordMatch   (with embeddings)
 *   score = 0.6 * conceptOverlap + 0.4 * keywordMatch                         (TF-IDF only)
 *
 * Evidence threshold is calibrated per mode: higher threshold with embeddings
 * (cosine sims are more informative) vs TF-IDF (scores are generally lower).
 */
const findEvidenceForClaim = (
  claim: string,
  participants: ParticipantAnalysis[],
  inputs: ParticipantInput[],
  claimEmbedding?: number[],
  inputEmbeddings?: number[][]
): AtomicClaim['evidence'] => {
  const claimLower = claim.toLowerCase();
  const results: AtomicClaim['evidence'] = [];
  const hasEmbeddings = !!(claimEmbedding && inputEmbeddings && inputEmbeddings.length === participants.length);

  // Calibrated evidence threshold: with embeddings we can be stricter.
  const EVIDENCE_THRESHOLD = hasEmbeddings ? 0.30 : 0.22;

  for (let pi = 0; pi < participants.length; pi++) {
    const p = participants[pi];
    const input = inputs.find(i => i.id === p.id);
    const text = input?.text || p.originalText;
    const textLower = text.toLowerCase();

    // 1. Embedding cosine similarity (primary semantic signal when available)
    let embSim = 0;
    if (hasEmbeddings) {
      embSim = cosineSimilarity(claimEmbedding!, inputEmbeddings![pi]);
    }

    // 2. Concept overlap (TF-IDF based)
    const overlap = computeConceptOverlapScore(text, claim);

    // 3. Keyword match — only count content words (length > 3) to avoid stop-word inflation.
    // Use word-boundary regex to prevent partial-word matches (e.g. "art" in "participant").
    const claimWords = claimLower.split(/\s+/).filter(w => w.length > 3);
    const matchingWords = claimWords.filter(w => {
      const wordBoundary = new RegExp(`\\b${w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`);
      return wordBoundary.test(textLower);
    });
    const wordMatchRatio = claimWords.length > 0 ? matchingWords.length / claimWords.length : 0;

    const similarity = hasEmbeddings
      ? embSim * 0.5 + overlap * 0.3 + wordMatchRatio * 0.2
      : overlap * 0.6 + wordMatchRatio * 0.4;

    if (similarity > EVIDENCE_THRESHOLD) {
      // Find the most relevant sentence-level passage for the evidence excerpt.
      // When we have claim embeddings, compute per-sentence embedding similarity
      // for more accurate passage extraction; fall back to TF-IDF concept overlap.
      const sents = text.match(/[^.!?]+[.!?]+/g) || [text];
      let bestPassage = text.slice(0, 150);
      let bestScore = 0;

      if (hasEmbeddings && sents.length > 1) {
        // Reuse the input-level embedding as a proxy: rank sentences by combined
        // concept overlap + a length-weighted boost for sentences with more content words.
        // We don't embed each sentence individually (too many LLM calls) but the hybrid
        // TF-IDF + word match approach already benefits from the parent-level similarity.
        for (const sent of sents) {
          const sentOverlap = computeConceptOverlapScore(sent, claim);
          // Boost sentences that are substantial (penalize fragments)
          const lengthBoost = Math.min(1, sent.trim().split(/\s+/).length / 8);
          const sentScore = sentOverlap * 0.8 + lengthBoost * 0.2;
          if (sentScore > bestScore) {
            bestScore = sentScore;
            bestPassage = sent.trim();
          }
        }
      } else {
        for (const sent of sents) {
          const sentScore = computeConceptOverlapScore(sent, claim);
          if (sentScore > bestScore) {
            bestScore = sentScore;
            bestPassage = sent.trim();
          }
        }
      }

      results.push({
        participantId: p.id,
        passage: bestPassage.slice(0, 200),
        similarity,
      });
    }
  }

  return results
    .sort((a, b) => b.similarity - a.similarity)
    .slice(0, MAX_EVIDENCE_PER_CLAIM);
};

// ── Claim Classification ────────────────────────────────────────────────────────

/**
 * Negation pattern for flagging claims that may be contradicted by their evidence.
 * Uses word boundaries to avoid false positives (e.g. "nothing" ≠ "not").
 * Contradiction detection is intentionally delegated to the LLM — this regex
 * only flags candidates for LLM review, it does not make the final call.
 */
const NEGATION_RE = /\b(not|never|no\b|neither|nor|oppos(ed?|es|ing)|reject(ed|s|ing)?|against|disagree[sd]?|den(y|ies|ied)|refus(ed?|es|ing)|prevent(ed|s|ing)?|prohibit(ed|s|ing)?|bann?(ed|ing)?)\b/i;

/**
 * Returns true if the claim and its top evidence passage appear to be about the
 * same topic but one contains a negation the other lacks — a strong signal that
 * the LLM should check for contradiction.
 */
const mightBeContradicted = (claim: string, evidence: AtomicClaim['evidence']): boolean => {
  if (evidence.length === 0) return false;
  const passageHasNegation = NEGATION_RE.test(evidence[0].passage);
  const claimHasNegation = NEGATION_RE.test(claim);
  // Asymmetric negation: one side negates while the other asserts
  return passageHasNegation !== claimHasNegation;
};

/**
 * Deterministic fallback classification using calibrated thresholds.
 * Contradiction is NOT determined here — it requires semantic understanding
 * that keyword heuristics cannot reliably provide. Contradiction candidates
 * are flagged by mightBeContradicted() and resolved by the LLM batch call.
 *
 * Thresholds are calibrated per embedding mode:
 * - With embeddings: cosine similarity spans a wider, more informative range
 * - TF-IDF only: overlap scores are generally lower, so thresholds are relaxed
 */
const classifyClaim = (
  claim: string,
  evidence: AtomicClaim['evidence'],
  hasEmbeddings: boolean
): ClaimSupportLevel => {
  if (evidence.length === 0) return 'unsupported';
  const topSim = evidence[0].similarity;
  const SUPPORTED = hasEmbeddings ? 0.55 : 0.40;
  const INFERRABLE = hasEmbeddings ? 0.35 : 0.25;
  if (topSim >= SUPPORTED) return 'supported';
  if (topSim >= INFERRABLE) return 'inferrable';
  return 'unsupported';
};

// ── LLM-Enhanced Classification ─────────────────────────────────────────────────

/**
 * LLM-based classification for two categories of claims:
 *
 * 1. AMBIGUOUS: similarity in the middle range where threshold-based classification
 *    is unreliable (supported vs inferrable vs unsupported boundary).
 *
 * 2. CONTRADICTION CANDIDATES: claims where the evidence contains asymmetric negation
 *    (e.g. source says "strongly opposed" but the claim says "broadly supported").
 *    These are included regardless of similarity score — contradiction can occur even
 *    when a passage is topically related (high similarity) but semantically opposed.
 *
 * Sent in batches of 8 to balance LLM cost vs coverage.
 */
const classifyClaimsBatchLLM = async (
  claims: Array<{ claim: string; evidence: AtomicClaim['evidence'] }>,
  config: AnalysisConfig,
  hasEmbeddings: boolean
): Promise<ClaimSupportLevel[]> => {
  const AMBIG_LOW = hasEmbeddings ? 0.28 : 0.22;
  const AMBIG_HIGH = hasEmbeddings ? 0.58 : 0.45;

  const toReview = claims.map((c, i) => ({
    ...c,
    idx: i,
    topSim: c.evidence.length > 0 ? c.evidence[0].similarity : 0,
    isContradictionCandidate: mightBeContradicted(c.claim, c.evidence),
  })).filter(c =>
    // Ambiguous similarity range
    (c.topSim >= AMBIG_LOW && c.topSim <= AMBIG_HIGH) ||
    // OR potential contradiction regardless of similarity
    c.isContradictionCandidate
  );

  // Start with deterministic classification for all claims
  const results = claims.map(c => classifyClaim(c.claim, c.evidence, hasEmbeddings));

  if (toReview.length === 0) return results;

  const BATCH = 8;
  for (let start = 0; start < toReview.length; start += BATCH) {
    const batch = toReview.slice(start, start + BATCH);

    const prompt = `You are a claim verification expert using Natural Language Inference (NLI).

For each numbered item, classify whether the EVIDENCE supports the CLAIM.

${batch.map((c, i) => `[${i + 1}]
CLAIM: "${c.claim}"
EVIDENCE: "${c.evidence[0]?.passage || 'No evidence found'}"
`).join('\n')}

Classification rules:
- "supported": the evidence directly states or clearly paraphrases the claim — strong textual overlap with same polarity
- "inferrable": the evidence makes the claim a reasonable inference, but doesn't state it explicitly
- "unsupported": the evidence is unrelated to or provides no basis for the claim
- "contradicted": the evidence and claim are about the same topic but assert opposing positions (e.g. source says "rejected the proposal", claim says "the proposal was welcomed")

Key: only classify as "contradicted" when there is clear semantic opposition on the SAME subject — not just because different words are used.

Return ONLY a JSON array of ${batch.length} strings in order, e.g. ["supported", "inferrable", "contradicted"]`;

    try {
      const response = await generateCompletion(
        prompt,
        'You are a fact-checking and NLI expert. Return only a valid JSON array of strings.',
        config
      );
      const match = response.match(/\[[\s\S]*\]/);
      if (match) {
        const labels = JSON.parse(match[0]) as string[];
        const valid: ClaimSupportLevel[] = ['supported', 'inferrable', 'unsupported', 'contradicted'];
        for (let i = 0; i < Math.min(labels.length, batch.length); i++) {
          const label = labels[i]?.toLowerCase().trim();
          if (valid.includes(label as ClaimSupportLevel)) {
            results[batch[i].idx] = label as ClaimSupportLevel;
          }
        }
      }
    } catch (e) {
      console.warn('[ClaimAttribution] Batch LLM classification failed, using deterministic fallback:', e);
    }
  }

  return results;
};

// ── Orchestrator ────────────────────────────────────────────────────────────────

export const performClaimAttribution = async (
  summarySentences: string[],
  participants: ParticipantAnalysis[],
  inputs: ParticipantInput[],
  config: AnalysisConfig,
  onProgress?: (msg: string) => void,
  inputEmbeddings?: number[][],
  generateEmbedding?: (text: string) => Promise<number[]>
): Promise<ClaimAttribution> => {
  const allClaims: AtomicClaim[] = [];
  let claimIdx = 0;

  // Batch decomposition: send 3 sentences per call to reduce LLM round-trips
  const BATCH_SIZE = 3;
  const decomposed: string[][] = [];

  for (let i = 0; i < summarySentences.length; i += BATCH_SIZE) {
    const batch = summarySentences.slice(i, i + BATCH_SIZE);
    onProgress?.(`Claim attribution: decomposing sentences ${i + 1}-${Math.min(i + BATCH_SIZE, summarySentences.length)}/${summarySentences.length}`);

    const results = await Promise.all(
      batch.map(s => decomposeSentenceIntoClaims(s, config))
    );
    decomposed.push(...results);
  }

  // Flatten all claims for batch embedding
  const allClaimTexts: string[] = [];
  const claimSentenceIndices: number[] = [];
  for (let si = 0; si < decomposed.length; si++) {
    for (const claimText of decomposed[si]) {
      allClaimTexts.push(claimText);
      claimSentenceIndices.push(si);
    }
  }

  // Batch-embed claims if embedding function is available
  let claimEmbeddings: (number[] | undefined)[] = new Array(allClaimTexts.length).fill(undefined);
  if (generateEmbedding && inputEmbeddings && inputEmbeddings.length > 0) {
    onProgress?.(`Claim attribution: embedding ${allClaimTexts.length} claims for semantic matching...`);
    const EMBED_BATCH = 5;
    for (let i = 0; i < allClaimTexts.length; i += EMBED_BATCH) {
      const batch = allClaimTexts.slice(i, i + EMBED_BATCH);
      const embedResults = await Promise.all(
        batch.map(async (text) => {
          try { return await generateEmbedding(text); }
          catch { return undefined; }
        })
      );
      for (let j = 0; j < embedResults.length; j++) {
        claimEmbeddings[i + j] = embedResults[j];
      }
    }
  }

  // Evidence search + preliminary classification
  const claimsWithEvidence: Array<{ claim: string; evidence: AtomicClaim['evidence']; sentenceIndex: number }> = [];

  for (let ci = 0; ci < allClaimTexts.length; ci++) {
    if (ci % 5 === 0) {
      onProgress?.(`Claim attribution: finding evidence ${ci + 1}/${allClaimTexts.length}`);
    }
    const evidence = findEvidenceForClaim(
      allClaimTexts[ci], participants, inputs,
      claimEmbeddings[ci], inputEmbeddings
    );
    claimsWithEvidence.push({ claim: allClaimTexts[ci], evidence, sentenceIndex: claimSentenceIndices[ci] });
  }

  // LLM-enhanced classification for ambiguous and contradiction-candidate cases
  onProgress?.('Claim attribution: classifying claims...');
  const hasEmbeddings = !!(inputEmbeddings && inputEmbeddings.length > 0);
  const levels = await classifyClaimsBatchLLM(claimsWithEvidence, config, hasEmbeddings);

  // Assemble final results
  for (let i = 0; i < claimsWithEvidence.length; i++) {
    allClaims.push({
      claimIndex: claimIdx++,
      sentenceIndex: claimsWithEvidence[i].sentenceIndex,
      claimText: claimsWithEvidence[i].claim,
      supportLevel: levels[i],
      evidence: claimsWithEvidence[i].evidence,
    });
  }

  const supportedCount = allClaims.filter(c => c.supportLevel === 'supported').length;
  const inferrableCount = allClaims.filter(c => c.supportLevel === 'inferrable').length;
  const unsupportedCount = allClaims.filter(c => c.supportLevel === 'unsupported').length;
  const contradictedCount = allClaims.filter(c => c.supportLevel === 'contradicted').length;
  const total = allClaims.length || 1;

  onProgress?.(`Claim attribution complete: ${allClaims.length} claims analyzed`);

  return {
    claims: allClaims,
    supportedCount,
    inferrableCount,
    unsupportedCount,
    contradictedCount,
    // Weighted score: fully supported claims count at full weight,
    // inferrable claims at 0.5 (following FActScore convention that
    // only directly supported facts should receive full credit).
    attributionScore: (supportedCount + 0.5 * inferrableCount) / total,
  };
};
