import React, { useMemo, useState } from 'react';
import { ParticipantAnalysis, ClusterData } from '../../types';
import { ANALYSIS_CONFIG } from '../../constants';

interface MissedPerspectivesProps {
  participants: ParticipantAnalysis[];
  clusters: ClusterData[];
  summarySentences: string[];
  onSelectParticipant?: (id: string) => void;
}

interface MissedGroup {
  theme: string;
  themeDescription: string;
  participants: ParticipantAnalysis[];
  keywords: string[];
  severity: 'high' | 'medium';
}

// Filter out unhelpful/vague keywords
const STOPWORDS = new Set([
  'more', 'less', 'very', 'much', 'many', 'some', 'any', 'other', 'also',
  'just', 'only', 'even', 'still', 'already', 'always', 'never', 'often',
  'really', 'actually', 'basically', 'generally', 'usually', 'sometimes',
  'thing', 'things', 'something', 'anything', 'everything', 'nothing',
  'way', 'ways', 'time', 'times', 'year', 'years', 'day', 'days',
  'people', 'person', 'place', 'places', 'part', 'parts',
  'good', 'bad', 'great', 'best', 'better', 'worse', 'worst',
  'new', 'old', 'big', 'small', 'large', 'little', 'long', 'short',
  'high', 'low', 'first', 'last', 'next', 'different', 'same',
  'need', 'needs', 'want', 'wants', 'like', 'make', 'makes',
  'use', 'used', 'using', 'get', 'got', 'take', 'put', 'see', 'saw',
  'know', 'think', 'feel', 'find', 'give', 'tell', 'say', 'said',
  'come', 'go', 'going', 'work', 'works', 'working',
  'observation', 'observations', 'specie', 'species', 'area', 'areas',
  'data', 'information', 'example', 'examples', 'point', 'points',
  'issue', 'issues', 'problem', 'problems', 'question', 'questions',
  'important', 'specific', 'particular', 'certain', 'various',
  'able', 'available', 'possible', 'necessary', 'required'
]);

const isUsefulKeyword = (keyword: string): boolean => {
  const normalized = keyword.toLowerCase().trim();
  // Filter out stopwords, single characters, and very short words
  if (STOPWORDS.has(normalized)) return false;
  if (normalized.length < 3) return false;
  // Filter out pure numbers
  if (/^\d+$/.test(normalized)) return false;
  return true;
};

/**
 * What Was Missed Panel
 *
 * Explicitly shows content that was dropped or underrepresented.
 * Groups missed perspectives by theme for actionability.
 */
export const MissedPerspectives: React.FC<MissedPerspectivesProps> = ({
  participants,
  clusters,
  summarySentences,
  onSelectParticipant
}) => {
  const [expanded, setExpanded] = useState<string | null>(null);

  const analysis = useMemo(() => {
    const { matchingThreshold, representationTarget } = ANALYSIS_CONFIG.thresholds;
    const { atRisk } = ANALYSIS_CONFIG.representationInterpretation;

    // Find underrepresented participants
    const underrepresented = participants.filter(p => p.representationScore < matchingThreshold);
    const atRiskParticipants = participants.filter(p => p.representationScore < atRisk);

    // Group by cluster to identify themes
    const missedByCluster: Record<number, ParticipantAnalysis[]> = {};
    underrepresented.forEach(p => {
      if (!missedByCluster[p.clusterId]) {
        missedByCluster[p.clusterId] = [];
      }
      missedByCluster[p.clusterId].push(p);
    });

    // Create theme groups
    const missedGroups: MissedGroup[] = [];

    Object.entries(missedByCluster).forEach(([clusterId, members]) => {
      const cluster = clusters.find(c => c.id === parseInt(clusterId));
      if (!cluster || members.length === 0) return;

      // Collect all keywords from missed participants, filtering unhelpful ones
      const allKeywords = members.flatMap(p => p.keywords || []).filter(isUsefulKeyword);
      const keywordCounts = allKeywords.reduce((acc, kw) => {
        acc[kw.toLowerCase()] = (acc[kw.toLowerCase()] || 0) + 1;
        return acc;
      }, {} as Record<string, number>);

      // Top keywords for this theme (only useful ones)
      const topKeywords = Object.entries(keywordCounts)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 5)
        .map(([kw]) => kw);

      // Determine severity
      const hasAtRisk = members.some(m => m.representationScore < atRisk);

      missedGroups.push({
        theme: cluster.label,
        themeDescription: `${members.length} participant${members.length > 1 ? 's' : ''} in this topic group`,
        participants: members.sort((a, b) => a.representationScore - b.representationScore),
        keywords: topKeywords,
        severity: hasAtRisk ? 'high' : 'medium'
      });
    });

    // Sort by severity and count
    missedGroups.sort((a, b) => {
      if (a.severity !== b.severity) return a.severity === 'high' ? -1 : 1;
      return b.participants.length - a.participants.length;
    });

    // Generate suggested additions
    const suggestedAdditions: string[] = [];
    missedGroups.forEach(group => {
      if (group.keywords.length > 0) {
        const keywordStr = group.keywords.slice(0, 3).join(', ');
        suggestedAdditions.push(
          `Consider adding perspectives on: ${keywordStr}`
        );
      }
    });

    return {
      totalMissed: underrepresented.length,
      atRiskCount: atRiskParticipants.length,
      missedGroups,
      suggestedAdditions,
      atRiskParticipants
    };
  }, [participants, clusters]);

  if (analysis.totalMissed === 0) {
    return (
      <div className="bg-green-50 border border-green-200 rounded-xl p-6 text-center">
        <div className="w-12 h-12 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-3">
          <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-green-600">
            <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/>
            <polyline points="22 4 12 14.01 9 11.01"/>
          </svg>
        </div>
        <h3 className="font-bold text-green-800 mb-1">All Voices Represented</h3>
        <p className="text-green-600 text-sm">
          No significant perspectives were missed in the summary.
        </p>
      </div>
    );
  }

  return (
    <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
      {/* Header */}
      <div className="bg-gradient-to-r from-red-50 to-amber-50 px-6 py-4 border-b border-slate-200">
        <div className="flex items-start justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-red-100 rounded-full flex items-center justify-center">
              <span className="text-xl">🔍</span>
            </div>
            <div>
              <h3 className="font-bold text-slate-800">What Was Missed</h3>
              <p className="text-sm text-slate-500">
                {analysis.totalMissed} perspective{analysis.totalMissed !== 1 ? 's' : ''} not adequately captured
              </p>
            </div>
          </div>
          {analysis.atRiskCount > 0 && (
            <div className="bg-red-100 text-red-700 px-3 py-1 rounded-full text-xs font-bold">
              {analysis.atRiskCount} Critical
            </div>
          )}
        </div>
      </div>

      {/* Missed Groups */}
      <div className="divide-y divide-slate-100">
        {analysis.missedGroups.map((group, idx) => (
          <div key={idx} className="hover:bg-slate-50 transition-colors">
            <button
              onClick={() => setExpanded(expanded === group.theme ? null : group.theme)}
              className="w-full px-6 py-4 text-left flex items-start justify-between gap-4"
            >
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-1">
                  <span className={`w-2 h-2 rounded-full ${group.severity === 'high' ? 'bg-red-500' : 'bg-amber-500'}`} />
                  <span className="font-medium text-slate-800">{group.theme}</span>
                  <span className="text-xs text-slate-400">({group.participants.length})</span>
                </div>
                <p className="text-sm text-slate-500">{group.themeDescription}</p>
                {group.keywords.length > 0 && (
                  <div className="flex flex-wrap gap-1 mt-2">
                    {group.keywords.map((kw, i) => (
                      <span key={i} className="px-2 py-0.5 bg-slate-100 text-slate-600 text-xs rounded">
                        {kw}
                      </span>
                    ))}
                  </div>
                )}
              </div>
              <svg
                xmlns="http://www.w3.org/2000/svg"
                width="20"
                height="20"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
                className={`text-slate-400 transition-transform flex-shrink-0 ${expanded === group.theme ? 'rotate-180' : ''}`}
              >
                <polyline points="6 9 12 15 18 9"/>
              </svg>
            </button>

            {/* Expanded content */}
            {expanded === group.theme && (
              <div className="px-6 pb-4 space-y-3">
                {group.participants.map(p => (
                  <div
                    key={p.id}
                    onClick={() => onSelectParticipant?.(p.id)}
                    className="bg-slate-50 rounded-lg p-3 cursor-pointer hover:bg-slate-100 transition-colors border border-slate-200"
                  >
                    <div className="flex items-center justify-between mb-2">
                      <span className="font-medium text-slate-700 text-sm">{p.id}</span>
                      <span className={`text-xs font-mono px-2 py-0.5 rounded ${
                        p.representationScore < 0.3
                          ? 'bg-red-100 text-red-700'
                          : 'bg-amber-100 text-amber-700'
                      }`}>
                        {(p.representationScore * 100).toFixed(0)}% match
                      </span>
                    </div>
                    <p className="text-sm text-slate-600 italic leading-relaxed">
                      "{p.originalText}"
                    </p>
                  </div>
                ))}
              </div>
            )}
          </div>
        ))}
      </div>

      {/* Suggestions */}
      {analysis.suggestedAdditions.length > 0 && (
        <div className="px-6 py-4 bg-blue-50 border-t border-blue-100">
          <div className="flex items-start gap-3">
            <div className="w-8 h-8 bg-blue-100 rounded-full flex items-center justify-center flex-shrink-0">
              <span className="text-sm">💡</span>
            </div>
            <div>
              <div className="text-xs font-bold text-blue-700 uppercase tracking-wider mb-1">
                Suggested Additions to Summary
              </div>
              <ul className="space-y-1">
                {analysis.suggestedAdditions.slice(0, 3).map((suggestion, i) => (
                  <li key={i} className="text-sm text-blue-800">
                    • {suggestion}
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default MissedPerspectives;
