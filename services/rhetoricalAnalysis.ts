/**
 * Rhetorical Influence Analysis
 *
 * Scores each participant's linguistic style on four dimensions:
 *   assertiveness, register, evidentiality, emotional intensity
 *
 * Then tests whether rhetorical style correlates with representation —
 * if it does, that's evidence of systematic bias in how the summarizer
 * treats different communication styles.
 *
 * Two scoring modes:
 *   1. Lexicon-based (Phase 1, deterministic, fast) — uses marker word counts
 *   2. LLM-enhanced (Phase 2, when AI provider available) — uses the LLM for
 *      context-aware scoring, then takes weighted blend of LLM + lexicon scores.
 *      This resolves ambiguities the lexicon can't handle (e.g. "like" as filler
 *      vs preference, "actually" in formal vs informal contexts).
 *
 * Statistical test: Spearman rank correlation between composite rhetorical score
 * and representation score, with permutation test for small samples (n ≤ 30).
 */

import { ParticipantAnalysis, RhetoricalProfile, RhetoricalBiasAnalysis, AnalysisConfig } from '../types';
import { generateCompletion } from './completionRouter';

// ── Lexicons ────────────────────────────────────────────────────────────────────

const ASSERTIVE_MARKERS = new Set([
  'must', 'shall', 'demand', 'require', 'insist', 'mandate', 'need',
  'essential', 'critical', 'imperative', 'urgent', 'immediately',
  'always', 'never', 'absolutely', 'certainly', 'undeniably',
  'unacceptable', 'non-negotiable', 'compel', 'obligate',
]);

const HEDGE_MARKERS = new Set([
  'maybe', 'perhaps', 'possibly', 'might', 'could', 'somewhat',
  'arguably', 'seemingly',
]);

// Multi-word hedges checked via substring (separate from single-word set)
const HEDGE_PHRASES = [
  'sort of', 'kind of', 'a bit', 'i think', 'i feel', 'i guess',
  'i suppose', 'it seems', 'in my opinion', 'not sure', 'to some extent',
  'more or less',
];

const FORMAL_MARKERS = new Set([
  'furthermore', 'moreover', 'notwithstanding', 'pursuant', 'aforementioned',
  'herein', 'whereas', 'thereby', 'henceforth', 'subsequently',
  'accordingly', 'consequently', 'nevertheless', 'regarding',
  'implementation', 'framework', 'methodology', 'infrastructure',
  'stakeholder', 'compliance', 'governance', 'regulatory',
  'facilitate', 'utilize', 'constitute', 'demonstrate',
]);

const COLLOQUIAL_MARKERS = new Set([
  'gonna', 'wanna', 'gotta', 'yeah', 'nah', 'stuff',
  'basically', 'honestly', 'literally',
  'okay', 'ok', 'cool', 'awesome', 'terrible', 'huge',
]);

// Contractions checked separately — only counted when they appear alongside
// other colloquial markers, since contractions alone are normal in professional writing.
const CONTRACTION_RE = /\b(don't|can't|won't|isn't|aren't|wasn't|weren't|hasn't|haven't|didn't|couldn't|wouldn't|shouldn't)\b/gi;

const EVIDENCE_MARKERS = [
  /\d+%/, /\d+\s*(percent|million|billion|thousand)/i,
  /according to/i, /research\s+(shows?|indicates?|suggests?)/i,
  /data\s+(shows?|indicates?|suggests?)/i, /stud(y|ies)\s+(show|find|found)/i,
  /evidence\s+(shows?|suggests?|indicates?)/i, /statistics?/i,
  /report(s|ed)?\s+(that|show)/i, /survey(s|ed)?/i,
  /source:/i, /citation/i, /published/i, /peer.?review/i,
];

const EMOTION_INTENSIFIERS = new Set([
  'devastating', 'outrageous', 'appalling', 'disgraceful', 'alarming',
  'terrifying', 'shocking', 'horrifying', 'infuriating', 'heartbreaking',
  'wonderful', 'extraordinary', 'incredible', 'brilliant', 'magnificent',
  'desperate', 'furious', 'disgusted', 'thrilled', 'ecstatic',
  'catastrophic', 'disastrous', 'tragic', 'dire', 'crisis',
]);

// ── Core Lexicon Scoring ────────────────────────────────────────────────────────

const tokenize = (text: string): string[] =>
  text.toLowerCase().replace(/[^\w\s'-]/g, ' ').split(/\s+/).filter(w => w.length > 1);

export const scoreRhetoricalMarkers = (text: string): RhetoricalProfile => {
  const lower = text.toLowerCase();
  const words = tokenize(text);
  const wordCount = Math.max(words.length, 1);

  // 1. Assertiveness: assertive markers minus hedges, normalized
  let assertiveHits = 0;
  let hedgeHits = 0;
  for (const w of words) {
    if (ASSERTIVE_MARKERS.has(w)) assertiveHits++;
    if (HEDGE_MARKERS.has(w)) hedgeHits++;
  }
  for (const phrase of HEDGE_PHRASES) {
    if (lower.includes(phrase)) hedgeHits++;
  }
  const exclamations = (text.match(/!/g) || []).length;
  assertiveHits += exclamations * 0.5;
  const questions = (text.match(/\?/g) || []).length;
  hedgeHits += questions * 0.3;

  // Normalized assertiveness: net assertive density, scaled to [0, 1]
  const netAssertive = assertiveHits - hedgeHits * 0.7;
  const assertiveness = Math.min(1, Math.max(0, netAssertive / (wordCount * 0.06 + 1)));

  // 2. Register: formal vs colloquial markers
  let formalHits = 0;
  let colloquialHits = 0;
  for (const w of words) {
    if (FORMAL_MARKERS.has(w)) formalHits++;
    if (COLLOQUIAL_MARKERS.has(w)) colloquialHits++;
  }
  // Passive voice patterns boost formality
  const passiveMatches = (text.match(/\b(is|are|was|were|been|being)\s+\w+ed\b/gi) || []).length;
  formalHits += passiveMatches;
  // Contractions only boost colloquial score when other colloquial markers are present.
  // Rationale: contractions alone are common in professional writing (e.g. "don't", "isn't")
  // and would cause false colloquial classification. They only signal informality when
  // combined with genuine colloquial vocabulary (gonna, wanna, basically, etc.).
  const contractionCount = (text.match(CONTRACTION_RE) || []).length;
  if (colloquialHits > 0) colloquialHits += contractionCount * 0.5;

  let register: 'formal' | 'colloquial' | 'mixed';
  if (formalHits > colloquialHits * 1.5 && formalHits >= 2) register = 'formal';
  else if (colloquialHits > formalHits * 1.5 && colloquialHits >= 2) register = 'colloquial';
  else register = 'mixed';

  // 3. Evidentiality: regex-based evidence marker detection
  let evidenceHits = 0;
  for (const pattern of EVIDENCE_MARKERS) {
    const matches = text.match(pattern);
    if (matches) evidenceHits += matches.length;
  }
  const evidentiality = Math.min(1, evidenceHits / (wordCount * 0.03 + 1));

  // 4. Emotional intensity
  let emotionHits = 0;
  for (const w of words) {
    if (EMOTION_INTENSIFIERS.has(w)) emotionHits++;
  }
  const capsWords = (text.match(/\b[A-Z]{3,}\b/g) || []).length;
  emotionHits += capsWords * 0.5;
  emotionHits += exclamations * 0.3;
  const emotionalIntensity = Math.min(1, emotionHits / (wordCount * 0.04 + 1));

  // Composite: weighted average
  const registerScore = register === 'formal' ? 0.8 : register === 'colloquial' ? 0.2 : 0.5;
  const compositeScore = Math.min(1, Math.max(0,
    assertiveness * 0.35 +
    registerScore * 0.25 +
    evidentiality * 0.20 +
    emotionalIntensity * 0.20
  ));

  return { assertiveness, register, evidentiality, emotionalIntensity, compositeScore };
};

// ── LLM-Enhanced Scoring (Phase 2) ──────────────────────────────────────────────

/**
 * Batch LLM scoring for rhetorical dimensions. Runs in Phase 2 (background
 * enrichment) since it requires async LLM calls.
 *
 * The LLM provides context-aware scores that handle ambiguities lexicons miss:
 * - "like" as filler ("I, like, think") vs preference ("I like this approach")
 * - "actually" in formal vs informal registers
 * - Sarcasm and rhetorical questions as assertiveness rather than hedging
 * - Cultural register differences in multilingual inputs
 *
 * Returns a Map from participantId → LLM-scored RhetoricalProfile.
 * The caller blends these with lexicon scores (70% LLM / 30% lexicon).
 */
export const scoreRhetoricalWithLLM = async (
  participants: Array<{ id: string; text: string }>,
  config: AnalysisConfig,
  onProgress?: (msg: string) => void
): Promise<Map<string, RhetoricalProfile>> => {
  const results = new Map<string, RhetoricalProfile>();
  const BATCH = 6;

  for (let i = 0; i < participants.length; i += BATCH) {
    const batch = participants.slice(i, i + BATCH);
    onProgress?.(`Rhetorical analysis: scoring participants ${i + 1}-${Math.min(i + BATCH, participants.length)}/${participants.length}`);

    const prompt = `You are a discourse analyst. Score each text below on four rhetorical dimensions.

${batch.map((p, j) => `[${p.id}] "${p.text.slice(0, 500)}"`).join('\n\n')}

Score each on these dimensions (0.00 to 1.00):

1. **assertiveness**: How directive or commanding is the language?
   0.0 = entirely hedged, uncertain, deferential ("maybe we could consider...")
   0.5 = balanced, states positions but with qualifiers
   1.0 = imperative, demanding, absolute ("we must immediately...")

2. **register**: The formality level of the language.
   Return exactly one of: "formal", "colloquial", or "mixed"
   - formal = professional jargon, complex sentences, passive voice, academic style
   - colloquial = conversational, slang, fragments, first-person anecdotes
   - mixed = elements of both

3. **evidentiality**: How data-driven and referenced is the content?
   0.0 = pure personal opinion, no evidence cited
   0.5 = references general facts or common knowledge
   1.0 = cites specific statistics, studies, named sources, quantitative data

4. **emotionalIntensity**: How emotionally charged is the language?
   0.0 = neutral, factual, dispassionate
   0.5 = engaged but measured
   1.0 = highly charged, urgent, dramatic, uses strong emotional words

Return ONLY a JSON array with one object per text:
[{"id": "...", "assertiveness": 0.XX, "register": "formal|colloquial|mixed", "evidentiality": 0.XX, "emotionalIntensity": 0.XX}]`;

    try {
      const response = await generateCompletion(
        prompt,
        'You are a discourse analysis expert. Return only valid JSON.',
        config
      );
      const match = response.match(/\[[\s\S]*\]/);
      if (match) {
        const parsed = JSON.parse(match[0]) as any[];
        for (const entry of parsed) {
          const id = entry.id || entry.participantId;
          if (!id) continue;
          const assertiveness = clampScore(entry.assertiveness);
          const evidentiality = clampScore(entry.evidentiality);
          const emotionalIntensity = clampScore(entry.emotionalIntensity);
          const register = (['formal', 'colloquial', 'mixed'].includes(entry.register))
            ? entry.register as 'formal' | 'colloquial' | 'mixed'
            : 'mixed';
          const registerScore = register === 'formal' ? 0.8 : register === 'colloquial' ? 0.2 : 0.5;
          const compositeScore = Math.min(1, Math.max(0,
            assertiveness * 0.35 + registerScore * 0.25 +
            evidentiality * 0.20 + emotionalIntensity * 0.20
          ));
          results.set(id, { assertiveness, register, evidentiality, emotionalIntensity, compositeScore });
        }
      }
    } catch (e) {
      console.warn(`[RhetoricalAnalysis] LLM batch ${i}-${i + BATCH} failed:`, e);
    }
  }

  return results;
};

const clampScore = (v: any): number => {
  const n = Number(v);
  if (isNaN(n)) return 0.5;
  return Math.min(1, Math.max(0, n));
};

/**
 * Merge LLM-scored profiles with lexicon-scored profiles.
 * Weighted blend: 70% LLM (context-aware) + 30% lexicon (deterministic baseline).
 * If no LLM score exists for a participant, the lexicon score stands as-is.
 */
export const mergeRhetoricalProfiles = (
  participants: ParticipantAnalysis[],
  llmScores: Map<string, RhetoricalProfile>
): void => {
  for (const p of participants) {
    const lexicon = p.rhetoricalProfile;
    const llm = llmScores.get(p.id);
    if (!lexicon || !llm) continue;

    const blend = (lex: number, llmVal: number) => lex * 0.3 + llmVal * 0.7;

    p.rhetoricalProfile = {
      assertiveness: blend(lexicon.assertiveness, llm.assertiveness),
      register: llm.register, // LLM is far better at register detection
      evidentiality: blend(lexicon.evidentiality, llm.evidentiality),
      emotionalIntensity: blend(lexicon.emotionalIntensity, llm.emotionalIntensity),
      compositeScore: blend(lexicon.compositeScore, llm.compositeScore),
    };
  }
};

// ── Spearman Rank Correlation ───────────────────────────────────────────────────

const rankArray = (arr: number[]): number[] => {
  const sorted = arr.map((v, i) => ({ v, i })).sort((a, b) => a.v - b.v);
  const ranks = new Array(arr.length);
  let i = 0;
  while (i < sorted.length) {
    let j = i;
    while (j < sorted.length && sorted[j].v === sorted[i].v) j++;
    const avgRank = (i + j - 1) / 2 + 1;
    for (let k = i; k < j; k++) ranks[sorted[k].i] = avgRank;
    i = j;
  }
  return ranks;
};

const spearmanCorrelation = (x: number[], y: number[]): { rho: number; pValue: number } => {
  const n = x.length;
  if (n < 5) return { rho: 0, pValue: 1 };

  const rx = rankArray(x);
  const ry = rankArray(y);

  // Pearson on ranks
  const meanRx = rx.reduce((a, b) => a + b, 0) / n;
  const meanRy = ry.reduce((a, b) => a + b, 0) / n;
  let num = 0, denX = 0, denY = 0;
  for (let i = 0; i < n; i++) {
    const dx = rx[i] - meanRx;
    const dy = ry[i] - meanRy;
    num += dx * dy;
    denX += dx * dx;
    denY += dy * dy;
  }
  const rho = denX === 0 || denY === 0 ? 0 : num / Math.sqrt(denX * denY);

  // P-value: permutation test for n ≤ 30 (exact, no distributional assumptions),
  // t-distribution approximation via normal CDF for larger samples.
  let pValue: number;
  if (n <= 30) {
    // Permutation test: shuffle y 999 times, compute rho each time,
    // count how often |rho_perm| >= |rho_observed|.
    const NUM_PERMS = 999;
    let extremeCount = 0;
    const yPerm = [...ry];
    for (let p = 0; p < NUM_PERMS; p++) {
      // Fisher-Yates shuffle
      for (let k = yPerm.length - 1; k > 0; k--) {
        const j = Math.floor(Math.random() * (k + 1));
        [yPerm[k], yPerm[j]] = [yPerm[j], yPerm[k]];
      }
      let numP = 0, denXP = 0, denYP = 0;
      for (let i = 0; i < n; i++) {
        const dx = rx[i] - meanRx;
        const dy = yPerm[i] - meanRy;
        numP += dx * dy;
        denXP += dx * dx;
        denYP += dy * dy;
      }
      const rhoPerm = denXP === 0 || denYP === 0 ? 0 : numP / Math.sqrt(denXP * denYP);
      if (Math.abs(rhoPerm) >= Math.abs(rho)) extremeCount++;
    }
    pValue = (extremeCount + 1) / (NUM_PERMS + 1); // +1 for the observed value itself
  } else {
    // t-distribution approximation (reliable for n > 30, use normal CDF)
    const t = rho * Math.sqrt((n - 2) / (1 - rho * rho + 1e-10));
    pValue = 2 * (1 - normalCDF(Math.abs(t)));
  }

  return { rho, pValue };
};

const normalCDF = (x: number): number => {
  // Abramowitz & Stegun approximation
  const a1 = 0.254829592, a2 = -0.284496736, a3 = 1.421413741;
  const a4 = -1.453152027, a5 = 1.061405429, p = 0.3275911;
  const sign = x < 0 ? -1 : 1;
  x = Math.abs(x) / Math.SQRT2;
  const t = 1.0 / (1.0 + p * x);
  const y = 1.0 - (((((a5 * t + a4) * t) + a3) * t + a2) * t + a1) * t * Math.exp(-x * x);
  return 0.5 * (1.0 + sign * y);
};

// ── Regression ──────────────────────────────────────────────────────────────────

const linearRegression = (x: number[], y: number[]): { slope: number; intercept: number } => {
  const n = x.length;
  if (n < 2) return { slope: 0, intercept: 0 };
  const meanX = x.reduce((a, b) => a + b, 0) / n;
  const meanY = y.reduce((a, b) => a + b, 0) / n;
  let num = 0, den = 0;
  for (let i = 0; i < n; i++) {
    num += (x[i] - meanX) * (y[i] - meanY);
    den += (x[i] - meanX) * (x[i] - meanX);
  }
  const slope = den === 0 ? 0 : num / den;
  const intercept = meanY - slope * meanX;
  return { slope, intercept };
};

// ── Main Analysis Function ──────────────────────────────────────────────────────

export const analyzeRhetoricalBias = (
  participants: ParticipantAnalysis[]
): RhetoricalBiasAnalysis => {
  const valid = participants.filter(p =>
    !p.embeddingFailed && p.rhetoricalProfile && p.representationScore != null && !isNaN(p.representationScore)
  );

  const profiles = valid.map(p => ({
    participantId: p.id,
    profile: p.rhetoricalProfile!,
    representationScore: p.representationScore,
  }));

  const composites = profiles.map(p => p.profile.compositeScore);
  const repScores = profiles.map(p => p.representationScore);

  const { rho, pValue } = spearmanCorrelation(composites, repScores);
  const regression = linearRegression(composites, repScores);

  return {
    profiles,
    correlation: rho,
    pValue,
    // Two-sided bias detection: either positive correlation (rhetorically dominant
    // voices favored) or negative (formal/assertive speakers under-represented).
    // Dual threshold: |ρ| > 0.25 (weak-to-moderate effect size per Cohen 1988;
    // conservative for typical n=10–30 where weak correlations may be real) AND
    // p < 0.05 (standard significance level). The effect-size gate prevents
    // declaring bias on trivially small correlations that happen to reach
    // significance with larger samples.
    hasBias: Math.abs(rho) > 0.25 && pValue < 0.05,
    regressionLine: regression,
  };
};
