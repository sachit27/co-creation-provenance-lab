/**
 * Language Detection Service
 *
 * Lightweight, dependency-free language detection using Unicode script ranges
 * and common-word heuristics. This is not a full NLP pipeline — the goal is
 * to flag when participant inputs may be in a non-English language so the tool
 * can surface coarse script-group differences for review. It does not identify
 * a causal language effect, and it abstains on non-English Latin-script text.
 *
 * Supports coarse script detection plus a conservative English marker. It does
 * not claim to distinguish languages that share the Latin script.
 */

import { ParticipantAnalysis, LanguageEquityReport } from '../types';
import { SeededRNG } from './mathUtils';

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
  | 'la'   // Legacy undetermined Latin-script tag
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

  // Latin script without enough English evidence is unknown. Script alone
  // cannot distinguish English from Spanish, French, German, or many others;
  // calling it non-English created false language-equity findings.
  if (counts.la > 0) return 'un';

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
  la: 'Undetermined Latin-script (legacy)',
  un: 'Unknown',
};

export const getLanguageLabel = (code: string): string =>
  LANGUAGE_LABELS[code] ?? code;

export const isNonEnglish = (code: string): boolean =>
  code !== 'en' && code !== 'un' && code !== 'la';

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

  // Seeded from the data so the reported p-value is reproducible: an audit that
  // returns a different exploratory comparison p-value on each identical run
  // cannot support a defensible finding.
  const rng = new SeededRNG(
    Math.round(combined.reduce((a, v, i) => a + v * (i + 1), 0) * 1000) + n * 7919 + nA
  );

  for (let p = 0; p < nPermutations; p++) {
    // Fisher–Yates shuffle of combined array
    const shuffled = [...combined];
    for (let i = n - 1; i > 0; i--) {
      const j = Math.floor(rng.next() * (i + 1));
      [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
    }

    const permMeanA = shuffled.slice(0, nA).reduce((s, v) => s + v, 0) / nA;
    const permMeanB = shuffled.slice(nA).reduce((s, v) => s + v, 0) / groupB.length;

    if (permMeanA - permMeanB >= observedDiff) {
      countGreaterOrEqual++;
    }
  }

  // (count + 1) / (nPermutations + 1) rather than count / nPermutations.
  // The observed arrangement is itself a valid permutation under H0, so the
  // unadjusted form can report p = 0, which is impossible for a permutation
  // test and overstates significance (Phipson & Smyth 2010).
  return (countGreaterOrEqual + 1) / (nPermutations + 1);
};

// ─── Script-label alignment comparison ───────────────────────────────────────

/**
 * Compare automated script/language labels with semantic-alignment scores.
 * This is an exploratory review screen: label error, topic, sampling, and the
 * embedding model are confounded, so it cannot establish language bias.
 *
 * Review flags require a >0.10 mean gap. When both groups have at least three
 * valid records, one-sided permutation p-values receive a Holm family-wise
 * correction across the comparisons made in the run. Smaller groups may still
 * receive a descriptive flag, but pValue remains null.
 */
export const analyzeLanguageEquity = (
  participants: ParticipantAnalysis[]
): LanguageEquityReport => {
  const validParticipants = participants.filter(participant =>
    !participant.embeddingFailed && !participant.alignmentUnavailableReason
  );

  // Count valid records by automated language/script label.
  const languageCounts: Record<string, number> = {};
  const languageScores: Record<string, number[]> = {};

  for (const p of validParticipants) {
    const lang = p.detectedLanguage ?? 'un';
    languageCounts[lang] = (languageCounts[lang] ?? 0) + 1;
    if (!languageScores[lang]) languageScores[lang] = [];
    languageScores[lang].push(p.representationScore);
  }

  const languageRepresentation: Record<string, number> = {};
  for (const [lang, scores] of Object.entries(languageScores)) {
    languageRepresentation[lang] = scores.reduce((a, b) => a + b, 0) / scores.length;
  }

  const hasMultipleLanguages = Object.keys(languageCounts).filter(l => l !== 'un' && l !== 'la').length > 1;

  const englishScores = languageScores['en'] ?? [];
  const englishAvg = englishScores.length > 0
    ? englishScores.reduce((a, b) => a + b, 0) / englishScores.length
    : null;

  const underrepresentedLanguages: string[] = [];
  let reportedPValue: number | null = null;

  if (englishAvg !== null) {
    const candidates = Object.entries(languageScores)
      .filter(([lang]) => lang !== 'en' && lang !== 'un' && lang !== 'la')
      .map(([lang, scores]) => ({
        lang,
        scores,
        gap: englishAvg - scores.reduce((a, b) => a + b, 0) / scores.length,
      }))
      .filter(item => item.gap > 0.1);

    const tested = candidates
      .filter(item => englishScores.length >= 3 && item.scores.length >= 3)
      .map(item => ({
        ...item,
        rawP: permutationTestOneSided(englishScores, item.scores),
      }))
      .sort((a, b) => a.rawP - b.rawP);

    // Holm step-down adjusted p-values, monotone in sorted order.
    const adjustedByLanguage = new Map<string, number>();
    let previousAdjusted = 0;
    tested.forEach((item, rank) => {
      const adjusted = Math.max(previousAdjusted, Math.min(1, item.rawP * (tested.length - rank)));
      adjustedByLanguage.set(item.lang, adjusted);
      previousAdjusted = adjusted;
    });

    let containsSmallSampleFlag = false;
    for (const item of candidates) {
      if (englishScores.length < 3 || item.scores.length < 3) {
        underrepresentedLanguages.push(item.lang);
        containsSmallSampleFlag = true;
        continue;
      }
      const adjusted = adjustedByLanguage.get(item.lang) ?? 1;
      if (adjusted < 0.05) underrepresentedLanguages.push(item.lang);
    }

    if (underrepresentedLanguages.length > 0 && !containsSmallSampleFlag) {
      const flaggedAdjusted = underrepresentedLanguages
        .map(lang => adjustedByLanguage.get(lang))
        .filter((value): value is number => value !== undefined);
      reportedPValue = flaggedAdjusted.length > 0 ? Math.min(...flaggedAdjusted) : null;
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
