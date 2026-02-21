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

// ─── Equity analysis ──────────────────────────────────────────────────────────

/**
 * Analyse language equity across participants.
 *
 * Returns a report that flags if non-English inputs have meaningfully lower
 * average representation than English inputs — which would indicate a
 * language-related bias in the summarisation or embedding pipeline.
 */
export const analyzeLanguageEquity = (
  participants: ParticipantAnalysis[]
): LanguageEquityReport => {
  // Count participants by language
  const languageCounts: Record<string, number> = {};
  const languageRepresentationSum: Record<string, number> = {};

  for (const p of participants) {
    const lang = p.detectedLanguage ?? 'un';
    languageCounts[lang] = (languageCounts[lang] ?? 0) + 1;
    languageRepresentationSum[lang] = (languageRepresentationSum[lang] ?? 0) + p.representationScore;
  }

  const languageRepresentation: Record<string, number> = {};
  for (const [lang, count] of Object.entries(languageCounts)) {
    languageRepresentation[lang] = languageRepresentationSum[lang] / count;
  }

  const hasMultipleLanguages = Object.keys(languageCounts).filter(l => l !== 'un').length > 1;

  // Equity issue: any non-English language averages more than 10pp below English
  const englishAvg = languageRepresentation['en'] ?? null;
  const underrepresentedLanguages: string[] = [];

  if (englishAvg !== null) {
    for (const [lang, avgRep] of Object.entries(languageRepresentation)) {
      if (lang !== 'en' && lang !== 'un' && (englishAvg - avgRep) > 0.1) {
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
  };
};
