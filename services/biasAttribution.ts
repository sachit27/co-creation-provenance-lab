/**
 * Bias Source Attribution Service
 *
 * Diagnoses WHY a participant's voice is underrepresented, using only
 * observable evidence already present in the analysis result — no LLM needed.
 *
 * Four mutually non-exclusive causes are evaluated with confidence scores:
 *
 *   embedding_gap      — Embedding model poorly handles this input's script/language.
 *   topical_uniqueness — Genuinely novel perspective; no other participant reinforced it.
 *   summarizer_bias    — LLM omitted the perspective despite detectable semantic relevance.
 *   phrasing_mismatch  — Mainstream ideas expressed in non-standard phrasing.
 *
 * The cause with highest confidence becomes the primaryCause.
 * All causes with confidence > 0.2 are returned in `factors` (sorted desc).
 *
 * Reference: Simpson et al. (2023) "Why is My Model Wrong?": a taxonomy of
 * ML explanation failure modes that motivates distinguishing model-level from
 * data-level attribution causes.
 */

import { ParticipantAnalysis, BiasAttribution, BiasAttributionFactor, BiasAttributionCause } from '../types';

// Non-Latin Unicode ranges (mirrors vectorizer.ts logic)
const NON_LATIN_RANGES: Array<[number, number]> = [
  [0x4e00, 0x9fff],  // CJK
  [0x3040, 0x30ff],  // Hiragana / Katakana
  [0xac00, 0xd7af],  // Hangul
  [0x0600, 0x06ff],  // Arabic
  [0x0900, 0x097f],  // Devanagari
  [0x0400, 0x04ff],  // Cyrillic
  [0x0e00, 0x0e7f],  // Thai
  [0x0590, 0x05ff],  // Hebrew
  [0x0370, 0x03ff],  // Greek
];

const isNonLatinScript = (text: string): boolean => {
  for (const char of text) {
    const code = char.charCodeAt(0);
    for (const [lo, hi] of NON_LATIN_RANGES) {
      if (code >= lo && code <= hi) return true;
    }
  }
  return false;
};

// ─── Cause 1: Embedding Gap ───────────────────────────────────────────────────

const detectEmbeddingGap = (
  participant: ParticipantAnalysis
): BiasAttributionFactor | null => {
  const tier = participant.embeddingTier ?? 'tfidf';
  if (tier !== 'tfidf') return null; // Stronger models are not susceptible

  const nonLatin = isNonLatinScript(participant.originalText);
  const confidence = nonLatin ? 0.85 : 0.40;

  const scriptInfo = participant.detectedLanguage
    ? `"${participant.detectedLanguage}" script`
    : nonLatin
    ? 'non-Latin script'
    : 'this input';

  return {
    cause: 'embedding_gap',
    confidence,
    evidence: `Input contains ${scriptInfo} but was vectorized using the TF-IDF fallback (150-dim), ` +
      `which cannot capture cross-lingual semantic relationships. ` +
      `Representation scores based on TF-IDF are less reliable for non-Latin inputs.`,
  };
};

// ─── Cause 2: Topical Uniqueness ─────────────────────────────────────────────

const detectTopicalUniqueness = (
  participant: ParticipantAnalysis,
  allParticipants: ParticipantAnalysis[]
): BiasAttributionFactor | null => {
  const ISOLATION_THRESHOLD = 0.60;
  if (participant.semanticIsolation < ISOLATION_THRESHOLD) return null;

  const myKeywords = new Set((participant.keywords ?? []).map(k => k.toLowerCase()));
  if (myKeywords.size === 0) {
    // Even without keywords, high isolation alone is evidence
    return {
      cause: 'topical_uniqueness',
      confidence: Math.min(0.70, participant.semanticIsolation),
      evidence: `This perspective is semantically isolated from ${Math.round(participant.semanticIsolation * 100)}% ` +
        `of participants (isolation score: ${participant.semanticIsolation.toFixed(2)}). ` +
        `The summary may not have captured this theme because no other voice reinforced it.`,
    };
  }

  const others = allParticipants.filter(p => p.id !== participant.id);
  const allOtherKeywords = new Set(
    others.flatMap(p => (p.keywords ?? []).map(k => k.toLowerCase()))
  );

  let matchCount = 0;
  for (const kw of myKeywords) {
    if (allOtherKeywords.has(kw)) matchCount++;
  }
  const uniquenessRatio = 1 - matchCount / myKeywords.size;

  // Require high isolation AND mostly unique keywords
  if (uniquenessRatio < 0.50) return null;

  const confidence = Math.min(0.90, participant.semanticIsolation * 0.7 + uniquenessRatio * 0.5);
  const uniqueCount = myKeywords.size - matchCount;

  return {
    cause: 'topical_uniqueness',
    confidence,
    evidence: `This perspective is semantically isolated (score: ${participant.semanticIsolation.toFixed(2)}) ` +
      `and ${uniqueCount} of ${myKeywords.size} keywords are unique across all participants. ` +
      `The AI summary did not capture this theme because no other voice reinforced it — this is a genuine gap, not a modeling artifact.`,
  };
};

// ─── Cause 3: Summarizer Bias ─────────────────────────────────────────────────

const detectSummarizerBias = (
  participant: ParticipantAnalysis,
  allParticipants: ParticipantAnalysis[],
  summary: string
): BiasAttributionFactor | null => {
  // Needs: low rep score, some semantic proximity to summary, not isolated, but keywords absent from summary
  if (participant.representationScore >= 0.5) return null;
  if (participant.semanticIsolation > 0.55) return null; // Isolated voices → uniqueness, not bias

  // Check if top sentence match has at least marginal similarity
  const topMatch = participant.sentenceMatches[0];
  if (!topMatch || topMatch.similarity < 0.30) return null;

  // Check if any of this participant's keywords appear in the full summary (as substrings)
  const summaryLower = summary.toLowerCase();
  const keywordsInSummary = (participant.keywords ?? []).filter(kw =>
    summaryLower.includes(kw.toLowerCase())
  );

  // Find other participants with similar keywords who ARE well-represented
  const myKeywords = (participant.keywords ?? []).map(k => k.toLowerCase());
  const similarWellRepresented = allParticipants.filter(other => {
    if (other.id === participant.id) return false;
    if (other.representationScore < 0.55) return false;
    const otherKws = (other.keywords ?? []).map(k => k.toLowerCase());
    return myKeywords.some(kw => otherKws.includes(kw));
  });

  if (keywordsInSummary.length === 0 && similarWellRepresented.length === 0) return null;

  const confidence = 0.65;
  const sharedKwList = keywordsInSummary.slice(0, 3).join(', ');
  const similarIds = similarWellRepresented.slice(0, 2).map(p => p.id).join(', ');

  let evidence = `The AI found a related summary sentence (similarity: ${topMatch.similarity.toFixed(2)}) ` +
    `but de-emphasized this participant's framing. `;
  if (sharedKwList) {
    evidence += `Keyword(s) [${sharedKwList}] appear in the summary but in the context of other participants' inputs. `;
  }
  if (similarIds) {
    evidence += `Similar themes from ${similarIds} were better represented, suggesting the AI preferentially weighted their phrasing.`;
  }

  return { cause: 'summarizer_bias', confidence, evidence };
};

// ─── Cause 4: Phrasing Mismatch ──────────────────────────────────────────────

const detectPhrasingMismatch = (
  participant: ParticipantAnalysis,
  summary: string
): BiasAttributionFactor | null => {
  if (participant.representationScore >= 0.5) return null;
  if (participant.semanticIsolation > 0.45) return null; // Not sharing perspectives with others → not a phrasing issue

  // Keywords absent from summary (concepts exist in mainstream but not the same words)
  const summaryLower = summary.toLowerCase();
  const myKeywords = (participant.keywords ?? []).map(k => k.toLowerCase());
  const absentKeywords = myKeywords.filter(kw => !summaryLower.includes(kw));

  if (absentKeywords.length === 0) return null; // Keywords do appear → not a phrasing mismatch

  // Confidence: higher the more central (low isolation) and the more keywords are absent
  const absentRatio = myKeywords.length > 0 ? absentKeywords.length / myKeywords.length : 0;
  const confidence = Math.min(0.75, 0.55 * (1 - participant.semanticIsolation) * (0.5 + absentRatio));

  if (confidence < 0.20) return null;

  return {
    cause: 'phrasing_mismatch',
    confidence,
    evidence: `This participant's semantic position (isolation: ${participant.semanticIsolation.toFixed(2)}) ` +
      `is close to well-represented participants, suggesting ideological alignment. ` +
      `However, ${absentKeywords.slice(0, 3).join(', ')} and other key terms do not appear in the summary, ` +
      `indicating the participant's phrasing diverges from the language the AI adopted in the summary.`,
  };
};

// ─── Intervention Mapping ─────────────────────────────────────────────────────

const INTERVENTIONS: Record<BiasAttributionCause, string> = {
  embedding_gap:
    'Re-run the analysis with BGE-M3 or a Gemini/Ollama embedding model to get semantically reliable scores for this input. ' +
    'If the score remains low after upgrading the embedding model, the underrepresentation is substantive.',
  topical_uniqueness:
    'This is a genuine gap, not a modeling artifact. In the next session, ask a targeted follow-up question that explicitly invites this perspective. ' +
    'Consider using the Facilitation Co-Pilot to generate a specific question for this theme.',
  summarizer_bias:
    'Use "Revise Summary" to explicitly weave this voice into the summary. The AI can find semantic connections — it just chose not to include them. ' +
    'The revision feature will recompute representation scores after incorporating this perspective.',
  phrasing_mismatch:
    'The counterfactual hints for this participant offer rephrasing options aligned with the summary\'s language. ' +
    'Alternatively, adjust the summary to use the participant\'s phrasing, which would bridge the semantic gap.',
};

// ─── Main Export ──────────────────────────────────────────────────────────────

/**
 * Compute bias attribution for a single participant.
 *
 * Only meaningful when representationScore < 0.6.
 * Returns null if the participant is well-represented (no diagnosis needed).
 */
export const computeBiasAttribution = (
  participant: ParticipantAnalysis,
  allParticipants: ParticipantAnalysis[],
  summary: string,
  summarySentences: string[],
): BiasAttribution | null => {
  if (participant.representationScore >= 0.60) return null;

  const rawFactors: BiasAttributionFactor[] = [];

  const embGap = detectEmbeddingGap(participant);
  if (embGap) rawFactors.push(embGap);

  const topicUniq = detectTopicalUniqueness(participant, allParticipants);
  if (topicUniq) rawFactors.push(topicUniq);

  const sumBias = detectSummarizerBias(participant, allParticipants, summary);
  if (sumBias) rawFactors.push(sumBias);

  const phrasingMis = detectPhrasingMismatch(participant, summary);
  if (phrasingMis) rawFactors.push(phrasingMis);

  // Filter to meaningful factors only (confidence > 0.20)
  const factors = rawFactors
    .filter(f => f.confidence > 0.20)
    .sort((a, b) => b.confidence - a.confidence);

  if (factors.length === 0) {
    // Fallback: if score is low but no cause detects, report low-confidence topical uniqueness
    return {
      primaryCause: 'topical_uniqueness',
      factors: [{
        cause: 'topical_uniqueness',
        confidence: 0.30,
        evidence: `Representation score is ${participant.representationScore.toFixed(2)} but no dominant cause was identified. ` +
          `The perspective may be underrepresented due to a combination of subtle factors.`,
      }],
      actionableIntervention: INTERVENTIONS.topical_uniqueness,
    };
  }

  const primaryCause = factors[0].cause;

  return {
    primaryCause,
    factors,
    actionableIntervention: INTERVENTIONS[primaryCause],
  };
};
