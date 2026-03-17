/**
 * Facilitation Co-Pilot Service
 *
 * Generates an actionable facilitation plan from a completed analysis result.
 * Grounded in deliberative democracy theory (Habermas 1984; Fishkin 1991) and
 * participatory action research principles.
 *
 * Output:
 *   - Gap Brief: 2-3 sentence facilitator-ready description of representation gaps
 *   - Follow-Up Questions: 5 targeted questions designed to surface blind-spot themes
 *   - Workshop Exercises: 3 evidence-based facilitation activities
 *
 * Primary path: LLM-powered (Gemini / Ollama / Groq) with a structured prompt.
 * Fallback path: Rule-based template generation (works fully offline).
 */

import { AnalysisResult, AnalysisConfig, FacilitationGapBrief, ParticipantAnalysis } from '../types';
import { ANALYSIS_CONFIG } from '../constants';
import { generateCompletion } from './completionRouter';

// ─── Pre-analysis helpers ─────────────────────────────────────────────────────

interface FacilitationContext {
  total: number;
  wellRepCount: number;
  blindSpotParticipants: ParticipantAnalysis[];
  atRiskParticipants: ParticipantAnalysis[];
  underrepClusters: string[];
  dominantThemes: string[];
  missingThemes: string[];
  giniInterpretation: string;
  languageAlert: string | null;
  groupAlert: string | null;
}

const buildContext = (data: AnalysisResult): FacilitationContext => {
  const { representationTarget, } = ANALYSIS_CONFIG.thresholds;
  const { atRisk: atRiskThreshold, low: lowThreshold } = ANALYSIS_CONFIG.representationInterpretation;
  const { low: giniLow, moderate: giniModerate } = ANALYSIS_CONFIG.giniInterpretation;

  const participants = data.participants;
  const total = participants.length;
  const wellRepCount = participants.filter(p => p.representationScore >= representationTarget).length;

  // Blind spots: low centrality + score < lowThreshold
  const centralityScores = participants.map(p => 1 - p.semanticIsolation).sort((a, b) => a - b);
  const medianCentrality = centralityScores[Math.floor(total / 2)] ?? 0.5;
  const blindSpotParticipants = participants.filter(p =>
    (1 - p.semanticIsolation) < medianCentrality && p.representationScore < lowThreshold
  );
  const atRiskParticipants = participants.filter(p => p.representationScore < atRiskThreshold);

  // Underrepresented clusters
  const clusterAvgRep: Record<number, number[]> = {};
  participants.forEach(p => {
    if (!clusterAvgRep[p.clusterId]) clusterAvgRep[p.clusterId] = [];
    clusterAvgRep[p.clusterId].push(p.representationScore);
  });
  const underrepClusters = Object.entries(clusterAvgRep)
    .filter(([, scores]) => scores.reduce((a, b) => a + b, 0) / scores.length < lowThreshold)
    .map(([id]) => data.clusters.find(c => c.id === Number(id))?.label ?? `Cluster ${id}`);

  // Dominant themes (from well-represented voices)
  const wellRepKeywords = participants
    .filter(p => p.representationScore >= representationTarget)
    .flatMap(p => p.keywords ?? []);
  const kwFreq: Record<string, number> = {};
  wellRepKeywords.forEach(kw => { kwFreq[kw] = (kwFreq[kw] || 0) + 1; });
  // A keyword is only a valid "theme" if it's substantive:
  // - at least 5 characters (eliminates most noise words)
  // - no apostrophes (contractions that slipped through tokenizer)
  // - not purely numeric
  const isValidTheme = (kw: string) =>
    kw.length >= 5 && !kw.includes("'") && !/^\d+$/.test(kw);

  const dominantThemes = Object.entries(kwFreq)
    .sort((a, b) => b[1] - a[1])
    .filter(([kw]) => isValidTheme(kw))
    .slice(0, 6)
    .map(([kw]) => kw);

  // Missing themes (from blind-spot / at-risk voices)
  const underrepKeywords = [...blindSpotParticipants, ...atRiskParticipants]
    .flatMap(p => p.keywords ?? []);
  const missingFreq: Record<string, number> = {};
  underrepKeywords.forEach(kw => { missingFreq[kw] = (missingFreq[kw] || 0) + 1; });
  const missingThemes = Object.entries(missingFreq)
    .sort((a, b) => b[1] - a[1])
    .filter(([kw]) => isValidTheme(kw) && !dominantThemes.includes(kw))
    .slice(0, 6)
    .map(([kw]) => kw);

  // Gini interpretation
  const gini = data.metrics.giniCoefficient;
  const giniInterpretation = gini < giniLow
    ? 'low inequality (voices are fairly distributed)'
    : gini < giniModerate
      ? 'moderate inequality (some voices significantly more represented than others)'
      : 'high inequality (representation is severely skewed toward dominant perspectives)';

  // Alerts
  const languageAlert = data.languageAnalysis?.hasEquityIssue
    ? `Non-English inputs are statistically underrepresented (p-value: ${data.languageAnalysis.pValue?.toFixed(3) ?? 'N/A'}). ` +
    `Languages affected: ${data.languageAnalysis.underrepresentedLanguages.join(', ')}.`
    : null;

  const groupAlert = data.groupAnalysis && data.groupAnalysis.interGroupGini > 0.25
    ? `Inter-group Gini = ${data.groupAnalysis.interGroupGini.toFixed(2)}. ` +
    `Groups with lowest representation: ${data.groupAnalysis.groupMetrics
      .sort((a, b) => a.avgRepresentation - b.avgRepresentation)
      .slice(0, 2)
      .map(g => `${g.groupId} (avg ${g.avgRepresentation.toFixed(2)})`)
      .join(', ')}.`
    : null;

  return {
    total,
    wellRepCount,
    blindSpotParticipants,
    atRiskParticipants,
    underrepClusters,
    dominantThemes,
    missingThemes,
    giniInterpretation,
    languageAlert,
    groupAlert,
  };
};

// ─── LLM prompt builder ───────────────────────────────────────────────────────

const buildPrompt = (data: AnalysisResult, ctx: FacilitationContext): string => {
  const blindSpotSnippets = ctx.blindSpotParticipants
    .slice(0, 6)
    .map(p => `  [${p.id}, score ${p.representationScore.toFixed(2)}]: "${p.originalText.slice(0, 120)}${p.originalText.length > 120 ? '…' : ''}"`)
    .join('\n');

  const atRiskSnippets = ctx.atRiskParticipants
    .slice(0, 3)
    .map(p => `  [${p.id}, score ${p.representationScore.toFixed(2)}]: "${p.originalText.slice(0, 80)}…"`)
    .join('\n') || '  None';

  return `You are an expert deliberation facilitator. Analyze this co-creation session and generate a structured facilitation plan.

SESSION STATISTICS:
- Total participants: ${ctx.total}
- Well-represented: ${ctx.wellRepCount} (score ≥ 0.6)
- Blind spots: ${ctx.blindSpotParticipants.length} (peripheral + underrepresented)
- At risk of being missed: ${ctx.atRiskParticipants.length} (score < 0.3)
- Representation inequality (Gini ${data.metrics.giniCoefficient.toFixed(2)}): ${ctx.giniInterpretation}
- Underrepresented clusters: ${ctx.underrepClusters.length > 0 ? ctx.underrepClusters.join(', ') : 'None'}

DOMINANT THEMES (captured by the summary):
${ctx.dominantThemes.length > 0 ? ctx.dominantThemes.map(t => `  • ${t}`).join('\n') : '  (none identified)'}

MISSING THEMES (from underrepresented participants):
${ctx.missingThemes.length > 0 ? ctx.missingThemes.map(t => `  • ${t}`).join('\n') : '  (none identified)'}
${ctx.languageAlert ? `\nLANGUAGE EQUITY ALERT: ${ctx.languageAlert}` : ''}
${ctx.groupAlert ? `\nGROUP EQUITY ALERT: ${ctx.groupAlert}` : ''}

BLIND SPOT PARTICIPANTS (peripheral voices not captured):
${blindSpotSnippets || '  None detected'}

AT-RISK PARTICIPANTS (nearly absent from summary):
${atRiskSnippets}

ORIGINAL SUMMARY:
"${data.summary.slice(0, 400)}${data.summary.length > 400 ? '…' : ''}"

Generate a facilitation plan with EXACTLY this format (one item per line, no extra commentary):
GAP_BRIEF: [2-3 sentences for the facilitator to read aloud, explaining what was missed and why it matters for decision-making]
QUESTION_1: [specific follow-up question targeting the first missing theme — actionable, open-ended]
QUESTION_2: [specific follow-up question targeting the second missing theme]
QUESTION_3: [question to surface perspectives from participants with high isolation scores]
QUESTION_4: [question addressing any language/group equity issues, or a question inviting dissenting views]
QUESTION_5: [question that challenges a dominant theme to test whether it truly represents consensus]
EXERCISE_1_TITLE: [workshop exercise title]
EXERCISE_1_DESC: [2-sentence description of what participants do and what it achieves]
EXERCISE_1_GROUP: [optional: target stakeholder group or "all"]
EXERCISE_2_TITLE: [workshop exercise title]
EXERCISE_2_DESC: [2-sentence description]
EXERCISE_2_GROUP: [optional target group or "all"]
EXERCISE_3_TITLE: [workshop exercise title]
EXERCISE_3_DESC: [2-sentence description]
EXERCISE_3_GROUP: [optional target group or "all"]`;
};

// ─── Response parser ──────────────────────────────────────────────────────────

/**
 * Robustly parse a structured LLM response.
 *
 * Handles common LLM formatting deviations:
 *   - Markdown code fences (```text ... ```)
 *   - Leading preambles ("Here is the plan:", "Sure!", etc.)
 *   - Case variations (gap_brief:, GAP BRIEF:)
 *   - Multi-line values for DESC fields (collected until next KEY: or end)
 *   - Trailing brackets/quotes left in by some models ([...], "...")
 */
const parseResponse = (text: string): Omit<FacilitationGapBrief, 'generatedAt' | 'modelUsed'> => {
  // 1. Strip markdown code fences
  let clean = text.replace(/```[\w]*\n?/g, '').replace(/```/g, '');

  // 2. Normalize key separators: "GAP BRIEF:" → "GAP_BRIEF:", case-insensitive
  clean = clean.replace(/\b(GAP|QUESTION|EXERCISE)[_ ](\d*[_ ]?)?(BRIEF|TITLE|DESC|GROUP)?/gi, (m) =>
    m.toUpperCase().replace(/ /g, '_')
  );

  // 3. Extract single-line values (KEY: value on one line)
  const extractLine = (key: string): string => {
    const re = new RegExp(`^${key}:\\s*(.+)$`, 'mi');
    const raw = text.match(re)?.[1] ?? clean.match(re)?.[1] ?? '';
    // Remove surrounding brackets/quotes that some LLMs add: [value] or "value"
    return raw.replace(/^\[(.+)\]$/, '$1').replace(/^"(.+)"$/, '$1').trim();
  };

  // 4. Extract multi-line values (for DESC fields — collect until next KEY: line or end)
  const extractMultiLine = (key: string): string => {
    const keyRe = new RegExp(`^${key}:\\s*`, 'mi');
    const match = keyRe.exec(clean);
    if (!match) return extractLine(key); // fallback to single-line

    const startIdx = match.index + match[0].length;
    const rest = clean.slice(startIdx);
    // Stop at the next line that starts with an all-caps KEY:
    const nextKeyRe = /^[A-Z][A-Z0-9_]+:\s*/m;
    const nextMatch = nextKeyRe.exec(rest);
    const value = nextMatch ? rest.slice(0, nextMatch.index) : rest;
    return value.replace(/^\[(.+)\]$/s, '$1').replace(/^"(.+)"$/s, '$1').trim();
  };

  const gapBrief = extractMultiLine('GAP_BRIEF');
  const followUpQuestions = [1, 2, 3, 4, 5]
    .map(i => extractLine(`QUESTION_${i}`))
    .filter(q => q.length > 5);

  const exercises = [1, 2, 3].map(i => ({
    title: extractLine(`EXERCISE_${i}_TITLE`),
    description: extractMultiLine(`EXERCISE_${i}_DESC`),
    targetGroup: extractLine(`EXERCISE_${i}_GROUP`) || undefined,
  })).filter(e => e.title.length > 0 && e.description.length > 0);

  return { gapBrief, followUpQuestions, workshopExercises: exercises };
};

// ─── Rule-based fallback ──────────────────────────────────────────────────────

const EVIDENCE_BASED_EXERCISES = [
  {
    title: 'World Café — Missing Theme Rotation',
    description: 'Small groups rotate through 3 tables, each dedicated to an underrepresented theme. ' +
      'Each group adds to what previous groups wrote, building on each perspective.',
    targetGroup: 'all',
  },
  {
    title: 'Fishbowl — Marginal Voices',
    description: 'Invite participants whose perspectives scored lowest to sit in an inner circle and speak first, ' +
      'while others listen without interrupting. Surfaces voices crowded out in open discussion.',
    targetGroup: undefined,
  },
  {
    title: 'Anonymous Digital Voting',
    description: 'Use a live poll where participants anonymously rank the importance of each missing theme. ' +
      'Reduces social desirability bias and reveals preferences the summary missed.',
    targetGroup: 'all',
  },
];

const generateFallbackPlan = (
  ctx: FacilitationContext,
  data: AnalysisResult
): Omit<FacilitationGapBrief, 'generatedAt' | 'modelUsed'> => {
  const gap = ctx.blindSpotParticipants.length + ctx.atRiskParticipants.length;
  const gapBrief = gap === 0
    ? `The AI summary captured the majority of participant voices well (${ctx.wellRepCount} of ${ctx.total} well-represented). ` +
    `Minor gaps exist — consider targeted questions to verify that all perspectives are accurately reflected.`
    : `${gap} participant${gap > 1 ? 's are' : ' is'} underrepresented in the current summary, ` +
    `including ${ctx.blindSpotParticipants.length} peripheral blind spots ` +
    `and ${ctx.atRiskParticipants.length} at-risk voices. ` +
    `The missing themes (${ctx.missingThemes.slice(0, 3).join(', ') || 'see blind spots'}) ` +
    `should be explicitly raised in the next session to ensure fair representation.`;

  const baseQuestions = [
    ...ctx.missingThemes.slice(0, 3).map(theme =>
      `Several participants raised the theme of "${theme}" which was not fully reflected in the summary. ` +
      `What specific aspects of this are most important for our decision-making?`
    ),
    `Some participants expressed perspectives that differ significantly from the summary's conclusions. ` +
    `Would anyone like to add or clarify points that may have been missed?`,
    `The summary presents certain themes as dominant — do participants feel this accurately reflects ` +
    `the full range of views expressed today, or were important dissenting perspectives omitted?`,
  ].slice(0, 5);

  // Pad to 5 questions if needed
  while (baseQuestions.length < 5) {
    baseQuestions.push(
      `What aspects of today's discussion do you feel were not adequately captured in the AI summary?`
    );
  }

  return {
    gapBrief,
    followUpQuestions: baseQuestions,
    workshopExercises: EVIDENCE_BASED_EXERCISES,
  };
};

// ─── Main Export ──────────────────────────────────────────────────────────────

export const generateFacilitationPlan = async (
  data: AnalysisResult,
  config: AnalysisConfig,
  onProgress?: (msg: string) => void
): Promise<FacilitationGapBrief> => {
  const ctx = buildContext(data);
  onProgress?.('Analyzing representation gaps…');

  const modelName = config.model || config.aiProvider;
  const systemPrompt = 'You are an expert deliberation facilitator trained in participatory action research. ' +
    'Generate precise, actionable facilitation plans grounded in the data provided. ' +
    'Be specific — reference actual missing themes and participant perspectives, not generic advice.';

  try {
    onProgress?.('Generating facilitation plan…');
    const prompt = buildPrompt(data, ctx);

    const rawResponse = await generateCompletion(prompt, systemPrompt, config);

    const parsed = parseResponse(rawResponse);

    // Validate output — fall back if essential fields are empty
    if (!parsed.gapBrief || parsed.followUpQuestions.length < 3) {
      throw new Error('LLM response missing required fields');
    }

    return { ...parsed, generatedAt: Date.now(), modelUsed: modelName };
  } catch (err) {
    console.warn('[FacilitationCoPilot] LLM generation failed, using rule-based fallback:', err);
    onProgress?.('Using rule-based facilitation plan (offline mode)…');
    const fallback = generateFallbackPlan(ctx, data);
    return { ...fallback, generatedAt: Date.now(), modelUsed: 'rule-based fallback' };
  }
};
