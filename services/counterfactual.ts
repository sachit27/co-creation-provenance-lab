import {
  CounterfactualSuggestion,
  ParticipantAnalysis,
  ConceptFidelityResult
} from '../types';

/**
 * Counterfactual Probes Service
 * Generates facilitator-focused suggestions for how the summary could be revised
 * to better capture underrepresented participant voices. Suggestions are directed
 * at the editor/facilitator, not at the participant.
 */

// Extract key terms that appear frequently in the summary
const extractSummaryKeyTerms = (
  summarySentences: string[],
  preservedConcepts: string[]
): Set<string> => {
  const summaryText = summarySentences.join(' ').toLowerCase();
  const terms = new Set<string>();

  // Add preserved concepts
  preservedConcepts.forEach(c => terms.add(c.toLowerCase()));

  // Extract additional frequent terms from summary
  const words = summaryText.split(/\s+/).filter(w => w.length > 4);
  const freqMap = new Map<string, number>();
  words.forEach(w => {
    const clean = w.replace(/[^a-z]/g, '');
    if (clean.length > 4) {
      freqMap.set(clean, (freqMap.get(clean) || 0) + 1);
    }
  });

  // Add words that appear 2+ times
  freqMap.forEach((count, word) => {
    if (count >= 2) terms.add(word);
  });

  return terms;
};

// Find keywords the participant could emphasize
const findKeywordsToEmphasize = (
  participantText: string,
  participantDroppedKeywords: string[],
  summaryKeyTerms: Set<string>
): string[] => {
  const suggestions: string[] = [];
  const participantWords = new Set(
    participantText.toLowerCase().split(/\s+/).map(w => w.replace(/[^a-z]/g, ''))
  );

  // Find summary terms the participant hasn't used
  summaryKeyTerms.forEach(term => {
    if (!participantWords.has(term) && term.length > 4) {
      suggestions.push(term);
    }
  });

  // Limit to top 5 most relevant
  return suggestions.slice(0, 5);
};

// Generate phrasing alignment suggestions
const generatePhrasingSuggestions = (
  participant: ParticipantAnalysis,
  highRepParticipants: ParticipantAnalysis[]
): string | null => {
  if (highRepParticipants.length === 0) return null;

  // Find common patterns in high-representation inputs
  const highRepTexts = highRepParticipants.map(p => p.originalText.toLowerCase());

  // Simple heuristics for phrasing patterns
  const patterns: string[] = [];

  // Check for action verbs usage
  const actionVerbs = ['need', 'should', 'must', 'want', 'require', 'suggest', 'propose', 'recommend'];
  const participantHasAction = actionVerbs.some(v => participant.originalText.toLowerCase().includes(v));

  if (!participantHasAction) {
    const highRepHasAction = highRepTexts.some(t => actionVerbs.some(v => t.includes(v)));
    if (highRepHasAction) {
      patterns.push('Consider using action-oriented language (e.g., "We need...", "I suggest...")');
    }
  }

  // Check for specificity
  const specificityIndicators = ['example', 'such as', 'specifically', 'in particular', 'for instance'];
  const participantIsSpecific = specificityIndicators.some(s => participant.originalText.toLowerCase().includes(s));

  if (!participantIsSpecific && participant.originalText.length < 100) {
    patterns.push('Add specific examples or details to strengthen your contribution');
  }

  // Check sentence structure
  if (participant.originalText.split(/[.!?]/).filter(s => s.trim()).length < 2) {
    const highRepAvgSentences = highRepTexts.reduce((sum, t) =>
      sum + t.split(/[.!?]/).filter(s => s.trim()).length, 0
    ) / highRepTexts.length;

    if (highRepAvgSentences > 2) {
      patterns.push('Consider elaborating with multiple sentences to convey more context');
    }
  }

  return patterns.length > 0 ? patterns[0] : null;
};

// Estimate predicted impact of following a suggestion
const estimatePredictedImpact = (
  currentScore: number,
  suggestionType: CounterfactualSuggestion['type']
): number => {
  // Base impact estimates (these are heuristic)
  const baseImpact: Record<CounterfactualSuggestion['type'], number> = {
    keyword_emphasis: 0.15,
    phrasing_alignment: 0.10,
    tone_adjustment: 0.05
  };

  // Scale impact inversely with current score
  // Lower scores have more room for improvement
  const scaleFactor = 1 - currentScore;

  return Math.min(0.3, baseImpact[suggestionType] * (1 + scaleFactor));
};

/**
 * Main function: Generate counterfactual suggestions for a participant
 */
export const generateCounterfactualSuggestions = (
  participant: ParticipantAnalysis,
  allParticipants: ParticipantAnalysis[],
  summarySentences: string[],
  conceptAnalysis?: ConceptFidelityResult
): CounterfactualSuggestion[] => {
  const suggestions: CounterfactualSuggestion[] = [];

  // Only generate suggestions for under-represented participants
  if (participant.representationScore >= 0.6) {
    return suggestions;
  }

  // Get summary key terms
  const preservedConcepts = conceptAnalysis?.preservedConcepts || [];
  const summaryKeyTerms = extractSummaryKeyTerms(summarySentences, preservedConcepts);

  // Find high-representation participants for reference
  const highRepParticipants = allParticipants
    .filter(p => p.representationScore >= 0.7)
    .slice(0, 5);

  // 1. Keyword emphasis suggestions
  const keywordsToEmphasize = findKeywordsToEmphasize(
    participant.originalText,
    participant.keywords,
    summaryKeyTerms
  );

  // 1. Keyword emphasis suggestions (facilitator: add dropped concepts to summary)
  const droppedConcepts = participant.keywords?.slice(0, 3) || [];
  if (droppedConcepts.length > 0) {
    suggestions.push({
      type: 'keyword_emphasis',
      suggestion: `Revise the summary to include concept(s) from this participant: "${droppedConcepts.join(', ')}". These were not captured in the current text.`,
      predictedImpact: estimatePredictedImpact(participant.representationScore, 'keyword_emphasis')
    });
  } else if (keywordsToEmphasize.length > 0) {
    // Fallback: suggest terms that connect participant's language to the summary's vocabulary
    suggestions.push({
      type: 'keyword_emphasis',
      suggestion: `Bridge this voice by weaving terms like "${keywordsToEmphasize.slice(0, 3).join(', ')}" into the summary near this participant's perspective.`,
      predictedImpact: estimatePredictedImpact(participant.representationScore, 'keyword_emphasis')
    });
  }

  // 2. Phrasing alignment suggestions (facilitator: where to insert language)
  const closestSentenceIdx = participant.topSentenceMatchIndex;
  if (participant.representationScore < 0.5 && closestSentenceIdx >= 0) {
    const closestSentence = summarySentences[closestSentenceIdx];
    if (closestSentence) {
      const participantFragment = participant.originalText.substring(0, 60);
      suggestions.push({
        type: 'phrasing_alignment',
        suggestion: `Near the sentence "...${closestSentence.substring(0, 55)}...", consider adding language that reflects: "${participantFragment}..."`,
        predictedImpact: estimatePredictedImpact(participant.representationScore, 'phrasing_alignment')
      });
    }
  }

  // 3. Tone adjustment suggestions (facilitator: balance the summary's tone)
  const dominantSentiment = getDominantSentiment(highRepParticipants);
  if (dominantSentiment && participant.sentiment !== dominantSentiment && highRepParticipants.length >= 3) {
    suggestions.push({
      type: 'tone_adjustment',
      suggestion: `This participant's ${participant.sentiment} perspective is not reflected. Add a ${participant.sentiment}-toned statement to balance the summary's overall ${dominantSentiment} framing.`,
      predictedImpact: estimatePredictedImpact(participant.representationScore, 'tone_adjustment')
    });
  }

  // Sort by predicted impact
  suggestions.sort((a, b) => b.predictedImpact - a.predictedImpact);

  return suggestions.slice(0, 3); // Return top 3 suggestions
};

// Helper: Get dominant sentiment from participants
const getDominantSentiment = (
  participants: ParticipantAnalysis[]
): 'positive' | 'neutral' | 'negative' | null => {
  if (participants.length === 0) return null;

  const counts = { positive: 0, neutral: 0, negative: 0 };
  participants.forEach(p => counts[p.sentiment]++);

  const max = Math.max(counts.positive, counts.neutral, counts.negative);
  if (counts.positive === max) return 'positive';
  if (counts.negative === max) return 'negative';
  return 'neutral';
};

/**
 * Generate suggestions for all under-represented participants
 */
export const generateAllCounterfactualSuggestions = (
  participants: ParticipantAnalysis[],
  summarySentences: string[],
  conceptAnalysis?: ConceptFidelityResult
): Map<string, CounterfactualSuggestion[]> => {
  const results = new Map<string, CounterfactualSuggestion[]>();

  participants.forEach(p => {
    const suggestions = generateCounterfactualSuggestions(
      p,
      participants,
      summarySentences,
      conceptAnalysis
    );
    if (suggestions.length > 0) {
      results.set(p.id, suggestions);
    }
  });

  return results;
};

export default generateCounterfactualSuggestions;
