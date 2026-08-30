import { IntentPreservation, EntailmentLabel, AnalysisConfig } from '../types';
import { generateCompletion } from './completionRouter';

/**
 * Natural Language Inference (NLI) Service
 * Uses LLM to classify whether summary sentences entail, contradict, or are neutral to participant inputs
 */

// Prompt template for NLI classification
const getNLIPrompt = (participantInput: string, summarySentence: string): string => {
  return `You are an expert in natural language inference. Analyze the relationship between a participant's input and how it was summarized.

PARTICIPANT INPUT:
"${participantInput}"

SUMMARY SENTENCE:
"${summarySentence}"

Task: Classify the relationship as one of:
- "entails": The summary accurately captures or logically follows from the participant's intent
- "neutral": The summary is somewhat related but doesn't capture the main point
- "contradicts": The summary misrepresents, distorts, or opposes the participant's intent

Respond with ONLY a JSON object in this exact format:
{"label": "entails|neutral|contradicts", "confidence": 0.0-1.0, "explanation": "brief reason"}`;
};

// Parse LLM response to extract NLI result
const parseNLIResponse = (response: string): IntentPreservation | null => {
  try {
    // Try to extract JSON from response
    const jsonMatch = response.match(/\{[\s\S]*\}/);
    if (!jsonMatch) return null;

    const parsed = JSON.parse(jsonMatch[0]);

    // Validate label
    const validLabels: EntailmentLabel[] = ['entails', 'neutral', 'contradicts'];
    if (!validLabels.includes(parsed.label)) {
      return null;
    }

    return {
      label: parsed.label as EntailmentLabel,
      confidence: Math.max(0, Math.min(1, parseFloat(parsed.confidence) || 0.5)),
      explanation: parsed.explanation || undefined
    };
  } catch (e) {
    console.warn('Failed to parse NLI response:', e);
    return null;
  }
};

// Uses shared generateCompletion from completionRouter.ts

/**
 * Classify intent preservation for a single participant-summary pair
 */
export const classifyIntentPreservation = async (
  participantInput: string,
  matchedSummarySentence: string,
  config: AnalysisConfig
): Promise<IntentPreservation> => {
  const systemPrompt = 'You are an expert NLI classifier. Respond only with valid JSON.';
  const userPrompt = getNLIPrompt(participantInput, matchedSummarySentence);

  try {
    const response = await generateCompletion(userPrompt, systemPrompt, config, { temperature: 0, responseFormat: 'json' });
    const result = parseNLIResponse(response);

    if (result) {
      return result;
    }

    // Fallback to neutral if parsing fails
    return {
      label: 'neutral',
      confidence: 0.5,
      explanation: 'Unable to determine relationship (parsing error)'
    };
  } catch (e) {
    console.error('NLI classification failed:', e);
    return {
      label: 'neutral',
      confidence: 0,
      explanation: 'Classification failed due to API error'
    };
  }
};

/**
 * Batch classify intent preservation for multiple participants
 * Uses rate limiting to avoid API overload
 */
export const batchClassifyIntentPreservation = async (
  participantInputs: Array<{ id: string; text: string; matchedSentence: string }>,
  config: AnalysisConfig,
  onProgress?: (processed: number, total: number) => void
): Promise<Map<string, IntentPreservation>> => {
  const results = new Map<string, IntentPreservation>();

  for (let i = 0; i < participantInputs.length; i++) {
    const { id, text, matchedSentence } = participantInputs[i];

    const result = await classifyIntentPreservation(text, matchedSentence, config);
    results.set(id, result);

    onProgress?.(i + 1, participantInputs.length);

    // Rate limiting: small delay between requests
    if (i < participantInputs.length - 1) {
      await new Promise(resolve => setTimeout(resolve, 200));
    }
  }

  return results;
};

/**
 * Quick heuristic check for potential contradiction (without LLM)
 * 
 * TIERED APPROACH:
 * - Uses improved negation scope detection
 * - Looks for semantic polarity mismatches
 * - More robust than simple antonym lookup
 * 
 * quickContradictionCheckAsync is a compatibility wrapper around this method.
 */
export const quickContradictionCheck = (
  participantInput: string,
  summarySentence: string
): boolean => {
  const inputLower = participantInput.toLowerCase();
  const summaryLower = summarySentence.toLowerCase();

  // 1. Check for explicit negation scope
  const negationWords = ['not', "n't", 'no', 'never', 'neither', 'hardly', 'barely', 'without'];

  // Find key content words in input (nouns/verbs that carry meaning)
  const inputContentWords = inputLower
    .replace(/[^a-z\s]/g, ' ')
    .split(/\s+/)
    .filter(w => w.length > 4);

  // Check if any content word appears negated in one text but not the other
  for (const word of inputContentWords) {
    if (!summaryLower.includes(word)) continue;

    // Find context around the word in both texts
    const inputContext = getWordContext(inputLower, word);
    const summaryContext = getWordContext(summaryLower, word);

    const inputNegated = negationWords.some(neg => inputContext.includes(neg));
    const summaryNegated = negationWords.some(neg => summaryContext.includes(neg));

    // Contradiction if word is negated in one but not the other
    if (inputNegated !== summaryNegated) {
      console.log(`[NLI] Contradiction detected: "${word}" negated=${inputNegated} vs ${summaryNegated}`);
      return true;
    }
  }

  // 2. Check for polarity-flipping patterns
  const polarityPairs = [
    ['support', 'oppose'], ['agree', 'disagree'], ['include', 'exclude'],
    ['accept', 'reject'], ['success', 'failure'], ['increase', 'decrease'],
    ['advantage', 'disadvantage'], ['benefit', 'harm'], ['help', 'hinder'],
    ['important', 'unimportant'], ['necessary', 'unnecessary'],
    ['possible', 'impossible'], ['likely', 'unlikely'],
    ['priority', 'not a priority'], ['need', 'don\'t need']
  ];

  for (const [pos, neg] of polarityPairs) {
    const inputHasPos = inputLower.includes(pos);
    const inputHasNeg = inputLower.includes(neg);
    const summaryHasPos = summaryLower.includes(pos);
    const summaryHasNeg = summaryLower.includes(neg);

    // Input uses positive term, summary uses negative (or vice versa)
    if ((inputHasPos && !inputHasNeg && summaryHasNeg && !summaryHasPos) ||
      (inputHasNeg && !inputHasPos && summaryHasPos && !summaryHasNeg)) {
      return true;
    }
  }

  // 3. Check for opposite quantifiers
  const quantifierPairs = [
    ['all', 'none'], ['many', 'few'], ['most', 'least'],
    ['always', 'never'], ['every', 'no'], ['more', 'less']
  ];

  for (const [high, low] of quantifierPairs) {
    if ((inputLower.includes(high) && summaryLower.includes(low)) ||
      (inputLower.includes(low) && summaryLower.includes(high))) {
      // Only flag if about the same topic
      const sharedWords = inputContentWords.filter(w => summaryLower.includes(w));
      if (sharedWords.length > 0) {
        return true;
      }
    }
  }

  return false;
};

/**
 * Get the window of words around a target word for context analysis
 */
const getWordContext = (text: string, word: string, windowSize: number = 4): string => {
  const words = text.split(/\s+/);
  const idx = words.findIndex(w => w.includes(word));
  if (idx === -1) return '';

  const start = Math.max(0, idx - windowSize);
  const end = Math.min(words.length, idx + windowSize + 1);
  return words.slice(start, end).join(' ');
};

/**
 * Backward-compatible async wrapper around the deterministic review heuristic.
 * The retired browser-transformer fallback was an English zero-shot instrument
 * that was not calibrated for deliberative text.
 */
export const quickContradictionCheckAsync = async (
  participantInput: string,
  summarySentence: string
): Promise<boolean> => quickContradictionCheck(participantInput, summarySentence);

/**
 * Get intent preservation statistics
 */
export const getIntentPreservationStats = (
  results: Map<string, IntentPreservation>
): {
  entailsCount: number;
  neutralCount: number;
  contradictsCount: number;
  avgConfidence: number;
  contradictionRate: number;
} => {
  let entailsCount = 0;
  let neutralCount = 0;
  let contradictsCount = 0;
  let totalConfidence = 0;

  results.forEach(result => {
    if (result.label === 'entails') entailsCount++;
    else if (result.label === 'neutral') neutralCount++;
    else contradictsCount++;

    totalConfidence += result.confidence;
  });

  const total = results.size || 1;

  return {
    entailsCount,
    neutralCount,
    contradictsCount,
    avgConfidence: totalConfidence / total,
    contradictionRate: contradictsCount / total
  };
};

export default classifyIntentPreservation;
