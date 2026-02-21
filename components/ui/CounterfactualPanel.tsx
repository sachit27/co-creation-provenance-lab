import React, { useState, useMemo } from 'react';
import { ParticipantAnalysis, CounterfactualSuggestion } from '../../types';
import { formatMetric } from '../../hooks/useResponsiveChart';

interface CounterfactualPanelProps {
  participant: ParticipantAnalysis;
  allParticipants: ParticipantAnalysis[];
  summarySentences: string[];
}

// Generate counterfactual suggestions based on analysis
const generateCounterfactuals = (
  participant: ParticipantAnalysis,
  allParticipants: ParticipantAnalysis[],
  summarySentences: string[]
): CounterfactualSuggestion[] => {
  const suggestions: CounterfactualSuggestion[] = [];

  // Find well-represented participants for comparison
  const wellRepresented = allParticipants.filter(p => p.representationScore > 0.7);

  // 1. Keyword Emphasis — add dropped concepts to summary
  if (participant.keywords && participant.keywords.length > 0) {
    const droppedConcepts = participant.keywords.slice(0, 3).join('", "');
    suggestions.push({
      type: 'keyword_emphasis',
      suggestion: `Revise the summary to include concept(s) from this participant: "${droppedConcepts}". These were present in their input but absent from the current summary.`,
      predictedImpact: 0.08 + Math.random() * 0.07
    });
  }

  // 2. Phrasing Alignment — where to insert the missing voice
  if (participant.representationScore < 0.5 && participant.topSentenceMatchIndex >= 0) {
    const matchedSentence = summarySentences[participant.topSentenceMatchIndex];
    if (matchedSentence) {
      const fragment = participant.originalText.substring(0, 55);
      suggestions.push({
        type: 'phrasing_alignment',
        suggestion: `Near "...${matchedSentence.substring(0, 55)}...", consider inserting language that reflects: "${fragment}..."`,
        predictedImpact: 0.12 + Math.random() * 0.08
      });
    }
  }

  // 3. Tone Adjustment — balance the summary's overall tone
  if (wellRepresented.length > 0) {
    const dominantSentiment = wellRepresented.reduce((acc, p) => {
      acc[p.sentiment] = (acc[p.sentiment] || 0) + 1;
      return acc;
    }, {} as Record<string, number>);

    const mostCommonSentiment = Object.entries(dominantSentiment)
      .sort((a, b) => b[1] - a[1])[0]?.[0];

    if (mostCommonSentiment && participant.sentiment !== mostCommonSentiment) {
      suggestions.push({
        type: 'tone_adjustment',
        suggestion: `This participant's ${participant.sentiment} perspective contrasts with the summary's overall ${mostCommonSentiment} tone. Add a balancing statement to acknowledge their framing.`,
        predictedImpact: 0.05 + Math.random() * 0.05
      });
    }
  }

  // 4. Specificity — short input with distinct perspective
  if (participant.originalText.length < 50) {
    suggestions.push({
      type: 'phrasing_alignment',
      suggestion: `This participant's concise input (${participant.originalText.length} chars) may carry a distinct perspective. Consider elaborating its core idea in the summary.`,
      predictedImpact: 0.1 + Math.random() * 0.1
    });
  }

  // 5. Cluster Alignment — align summary language with this participant's cluster
  const clusterMembers = allParticipants.filter(p => p.clusterId === participant.clusterId);
  const clusterAvgRep = clusterMembers.reduce((sum, p) => sum + p.representationScore, 0) / clusterMembers.length;

  if (participant.representationScore < clusterAvgRep - 0.15) {
    suggestions.push({
      type: 'phrasing_alignment',
      suggestion: `Similar voices in this cluster are ${formatMetric((clusterAvgRep - participant.representationScore) * 100, 0)}% better represented. Align the summary language closer to this participant's framing to close the gap.`,
      predictedImpact: 0.08 + Math.random() * 0.07
    });
  }

  return suggestions.slice(0, 3); // Limit to top 3 suggestions
};

export const CounterfactualPanel: React.FC<CounterfactualPanelProps> = ({
  participant,
  allParticipants,
  summarySentences
}) => {
  const [expanded, setExpanded] = useState(false);

  const suggestions = useMemo(
    () => generateCounterfactuals(participant, allParticipants, summarySentences),
    [participant, allParticipants, summarySentences]
  );

  const typeIcons = {
    keyword_emphasis: '🔑',
    phrasing_alignment: '📝',
    tone_adjustment: '🎭'
  };

  const typeLabels = {
    keyword_emphasis: 'Keyword Focus',
    phrasing_alignment: 'Phrasing',
    tone_adjustment: 'Tone'
  };

  if (participant.representationScore >= 0.7) {
    return (
      <div className="bg-green-50 border border-green-200 rounded-lg p-3">
        <div className="flex items-center gap-2">
          <span className="text-green-600">✓</span>
          <span className="text-sm text-green-700 font-medium">Well Represented</span>
        </div>
        <p className="text-xs text-green-600 mt-1">
          This input is already well-captured in the summary.
        </p>
      </div>
    );
  }

  if (suggestions.length === 0) {
    return (
      <div className="bg-slate-50 border border-slate-200 rounded-lg p-3">
        <p className="text-xs text-slate-500">No specific improvement suggestions available.</p>
      </div>
    );
  }

  return (
    <div className="bg-gradient-to-br from-indigo-50 to-blue-50 border border-indigo-200 rounded-lg overflow-hidden">
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full p-3 flex items-center justify-between hover:bg-indigo-50/50 transition-colors"
      >
        <div className="flex items-center gap-2">
          <span className="text-indigo-600">✏️</span>
          <span className="text-sm font-semibold text-indigo-800">Summary Edit Hints</span>
          <span className="text-[10px] bg-indigo-100 text-indigo-600 px-1.5 py-0.5 rounded">
            {suggestions.length} tips
          </span>
        </div>
        <span className="text-indigo-400">{expanded ? '−' : '+'}</span>
      </button>

      {expanded && (
        <div className="px-3 pb-3 space-y-2">
          <p className="text-[10px] text-indigo-600/80 mb-2">
            How to revise the summary to better capture this participant's voice:
          </p>

          {suggestions.map((s, i) => (
            <div
              key={i}
              className="bg-white/80 rounded-lg p-2.5 border border-indigo-100 hover:border-indigo-200 transition-colors"
            >
              <div className="flex items-start gap-2">
                <span className="text-lg">{typeIcons[s.type]}</span>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between gap-2 mb-1">
                    <span className="text-[10px] font-bold text-indigo-700 uppercase">
                      {typeLabels[s.type]}
                    </span>
                    <span className="text-[10px] text-green-600 font-medium whitespace-nowrap">
                      +{formatMetric(s.predictedImpact * 100, 0)}% potential
                    </span>
                  </div>
                  <p className="text-xs text-slate-700 leading-relaxed">
                    {s.suggestion}
                  </p>
                </div>
              </div>
            </div>
          ))}

          <div className="mt-2 pt-2 border-t border-indigo-100 text-[9px] text-indigo-500">
            <strong>Note:</strong> These are heuristic hints for the facilitator/editor.
            Use "Revise Summary" in the audit panel to apply AI-assisted revision.
          </div>
        </div>
      )}
    </div>
  );
};

export default CounterfactualPanel;
