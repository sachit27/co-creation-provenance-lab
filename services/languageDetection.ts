/**
 * Language Detection Service
 *
 * Lightweight, dependency-free language detection using Unicode script ranges
 * and common-word heuristics. This is not a full NLP pipeline — the goal is
 * to flag when participant inputs may be in a non-English language so the tool
 * can alert facilitators to potential multilingual equity issues (since most
 * LLMs have known biases favouring English-language inputs).
 *
 * Supports detection of: English, Arabic, Chinese/Japanese/Korean, Cyrillic,
 * Devanagari (Hindi/Nepali/etc.), Thai, and other Latin-script languages.
 */

import { ParticipantAnalysis, LanguageEquityReport } from '../types';

// ─── Unicode script range checks ─────────────────────────────────────────────

const isArabic = (code: number) => code >= 0x0600 && code <= 0x06ff;
const isCJK = (code: number) =>
  (code >= 0x4e00 && code <= 0x9fff) ||  // CJK Unified Ideographs
  (code >= 0x3040 && code <= 0x30ff) ||  // Hiragana / Katakana
  (code >= 0xac00 && code <= 0xd7af);    // Hangul Syllables
const isCyrillic = (code: number) => code >= 0x0400 && code <= 0x04ff;
const isDevanagari = (code: number) => code >= 0x0900 && code <= 0x097f;
const isThai = (code: number) => code >= 0x0e00 && code <= 0x0e7f;
const isHebrew = (code: number) => code >= 0x0590 && code <= 0x05ff;
const isGreek = (code: number) => code >= 0x0370 && code <= 0x03ff;

type ScriptTag =
  | 'ar'   // Arabic
  | 'zh'   // Chinese / Japanese / Korean
  | 'ru'   // Cyrillic (Russian / Ukrainian / etc.)
  | 'hi'   // Devanagari (Hindi / Nepali / Sanskrit / etc.)
  | 'th'   // Thai
  | 'he'   // Hebrew
  | 'el'   // Greek
  | 'en'   // English (Latin + common EN words)
  | 'la'   // Other Latin-script language (French, German, Spanish, etc.)
  | 'un';  // Unknown / mixed

// ─── English common-word heuristic ───────────────────────────────────────────

// High-frequency English function words that appear in almost every EN sentence.
const ENGLISH_MARKERS = new Set([
  'the', 'is', 'are', 'was', 'were', 'be', 'been', 'have', 'has', 'had',
  'do', 'does', 'did', 'will', 'would', 'could', 'should', 'may', 'might',
  'can', 'and', 'but', 'or', 'if', 'in', 'on', 'at', 'to', 'for', 'of',
  'with', 'by', 'from', 'this', 'that', 'it', 'we', 'they', 'our', 'their',
  'not', 'no', 'very', 'just', 'more', 'also', 'so',
]);

// ─── Core detection ───────────────────────────────────────────────────────────

/**
 * Detect the primary script/language of a text string.
 * Returns a simple language tag (BCP-47-ish).
 */
export const detectLanguage = (text: string): string => {
  if (!text || text.trim().length === 0) return 'un';

  // Count characters by script
  const counts: Record<ScriptTag, number> = {
    ar: 0, zh: 0, ru: 0, hi: 0, th: 0, he: 0, el: 0,
    en: 0, la: 0, un: 0,
  };

  for (const char of text) {
    const code = char.charCodeAt(0);
    if (char === ' ' || char === '\n') continue;
    if (isArabic(code))    { counts.ar++; continue; }
    if (isCJK(code))       { counts.zh++; continue; }
    if (isCyrillic(code))  { counts.ru++; continue; }
    if (isDevanagari(code)){ counts.hi++; continue; }
    if (isThai(code))      { counts.th++; continue; }
    if (isHebrew(code))    { counts.he++; continue; }
    if (isGreek(code))     { counts.el++; continue; }
    // Latin-range character (a-z, A-Z, accented Latin)
    if ((code >= 0x0041 && code <= 0x007a) || (code >= 0x00c0 && code <= 0x024f)) {
      counts.la++;
    }
  }

  const textLen = Math.max(1, text.replace(/\s/g, '').length);

  // If more than 20% of chars are in a non-Latin script, return that script
  const nonLatinScripts: ScriptTag[] = ['ar', 'zh', 'ru', 'hi', 'th', 'he', 'el'];
  for (const script of nonLatinScripts) {
    if (counts[script] / textLen > 0.2) return script;
  }

  // Latin script — try to distinguish English vs other Latin languages
  const words = text.toLowerCase().replace(/[^a-z\s]/g, ' ').split(/\s+/).filter(w => w.length > 1);
  if (words.length === 0) return 'un';

  const englishWordCount = words.filter(w => ENGLISH_MARKERS.has(w)).length;

  // If at least 2 common English words (or short input), treat as English
  if (englishWordCount >= 2 || (words.length <= 4 && englishWordCount >= 1)) {
    return 'en';
  }

  // If all Latin but no English markers, flag as other-Latin
  if (counts.la > 0) return 'la';

  return 'un';
};

// ─── Display helpers ──────────────────────────────────────────────────────────

const LANGUAGE_LABELS: Record<string, string> = {
  en: 'English',
  ar: 'Arabic',
  zh: 'Chinese / Japanese / Korean',
  ru: 'Cyrillic (Russian / etc.)',
  hi: 'Devanagari (Hindi / etc.)',
  th: 'Thai',
  he: 'Hebrew',
  el: 'Greek',
  la: 'Other Latin-script',
  un: 'Unknown',
};

export const getLanguageLabel = (code: string): string =>
  LANGUAGE_LABELS[code] ?? code;

export const isNonEnglish = (code: string): boolean =>
  code !== 'en' && code !== 'un';

// ─── Permutation test ─────────────────────────────────────────────────────────

/**
 * Two-sample permutation test for the difference in means.
 *
 * This is a non-parametric test that does not assume normality — appropriate
 * here because representation scores are bounded on [0, 1] and sample sizes
 * are typically small.
 *
 * H₀: The two groups are drawn from the same distribution.
 * H₁: Group A has a higher mean than Group B (one-sided).
 *
 * Reference: Good (2005) "Permutation, Parametric, and Bootstrap Tests of
 * Hypotheses", Springer. Chapter 2.
 *
 * @param groupA - Scores for group A (hypothesised higher, e.g. English)
 * @param groupB - Scores for group B (hypothesised lower, e.g. non-English)
 * @param nPermutations - Number of random permutations (default 10 000)
 * @returns One-sided p-value (probability of observing a gap ≥ the actual gap under H₀)
 */
const permutationTestOneSided = (
  groupA: number[],
  groupB: number[],
  nPermutations: number = 10_000
): number => {
  const nA = groupA.length;
  const combined = [...groupA, ...groupB];
  const n = combined.length;

  const meanA = groupA.reduce((s, v) => s + v, 0) / nA;
  const meanB = groupB.reduce((s, v) => s + v, 0) / groupB.length;
  const observedDiff = meanA - meanB;

  let countGreaterOrEqual = 0;

  for (let p = 0; p < nPermutations; p++) {
    // Fisher–Yates shuffle of combined array
    const shuffled = [...combined];
    for (let i = n - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
    }

    const permMeanA = shuffled.slice(0, nA).reduce((s, v) => s + v, 0) / nA;
    const permMeanB = shuffled.slice(nA).reduce((s, v) => s + v, 0) / groupB.length;

    if (permMeanA - permMeanB >= observedDiff) {
      countGreaterOrEqual++;
    }
  }

  return countGreaterOrEqual / nPermutations;
};

// ─── Equity analysis ──────────────────────────────────────────────────────────

/**
 * Analyse language equity across participants.
 *
 * Returns a report that flags if non-English inputs have meaningfully lower
 * average representation than English inputs — which would indicate a
 * language-related bias in the summarisation or embedding pipeline.
 *
 * An equity issue is flagged only when BOTH conditions are met:
 * 1. The observed gap exceeds 10 percentage points (practical significance)
 * 2. A permutation test rejects H₀ at α = 0.05 (statistical significance)
 *
 * When group sizes are too small for a meaningful test (< 3 per group),
 * the practical-significance criterion alone is used, and pValue is null.
 */
export const analyzeLanguageEquity = (
  participants: ParticipantAnalysis[]
): LanguageEquityReport => {
  // Count participants by language
  const languageCounts: Record<string, number> = {};
  const languageScores: Record<string, number[]> = {};

  for (const p of participants) {
    const lang = p.detectedLanguage ?? 'un';
    languageCounts[lang] = (languageCounts[lang] ?? 0) + 1;
    if (!languageScores[lang]) languageScores[lang] = [];
    languageScores[lang].push(p.representationScore);
  }

  const languageRepresentation: Record<string, number> = {};
  for (const [lang, scores] of Object.entries(languageScores)) {
    languageRepresentation[lang] = scores.reduce((a, b) => a + b, 0) / scores.length;
  }

  const hasMultipleLanguages = Object.keys(languageCounts).filter(l => l !== 'un').length > 1;

  const englishScores = languageScores['en'] ?? [];
  const englishAvg = englishScores.length > 0
    ? englishScores.reduce((a, b) => a + b, 0) / englishScores.length
    : null;

  const underrepresentedLanguages: string[] = [];
  let reportedPValue: number | null = null;

  if (englishAvg !== null) {
    for (const [lang, scores] of Object.entries(languageScores)) {
      if (lang === 'en' || lang === 'un') continue;

      const langAvg = scores.reduce((a, b) => a + b, 0) / scores.length;
      const gap = englishAvg - langAvg;

      // Practical significance gate: gap must exceed 10pp
      if (gap <= 0.1) continue;

      // Statistical significance: permutation test when both groups have ≥ 3 members
      if (englishScores.length >= 3 && scores.length >= 3) {
        const pValue = permutationTestOneSided(englishScores, scores);
        reportedPValue = pValue;

        if (pValue < 0.05) {
          underrepresentedLanguages.push(lang);
        }
        // If p ≥ 0.05, the gap is not statistically significant — do not flag
      } else {
        // Insufficient sample for permutation test — flag on practical significance
        // alone but set pValue to null to signal low confidence
        reportedPValue = null;
        underrepresentedLanguages.push(lang);
      }
    }
  }

  return {
    hasMultipleLanguages,
    languageCounts,
    languageRepresentation,
    hasEquityIssue: underrepresentedLanguages.length > 0,
    underrepresentedLanguages,
    pValue: reportedPValue,
  };
};
