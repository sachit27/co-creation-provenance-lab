import React, { useMemo, useState } from 'react';
import { ParticipantAnalysis, ClusterData } from '../../types';
import { getRepresentationBands } from '../../constants';

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
 * Semantic Alignment Review Panel
 *
 * Shows records below a tier-specific provisional retrieval band. This is not
 * evidence that the content was omitted; exact transformation evidence lives
 * in the source-unit transformation audit.
 */
export const MissedPerspectives: React.FC<MissedPerspectivesProps> = ({
  participants,
  clusters,
  summarySentences,
  onSelectParticipant
}) => {
  const [expanded, setExpanded] = useState<string | null>(null);

  const analysis = useMemo(() => {
    const { atRisk, low } = getRepresentationBands(participants[0]?.embeddingTier);
    const validParticipants = participants.filter(participant =>
      !participant.embeddingFailed && !participant.alignmentUnavailableReason
    );

    // Tier-specific retrieval review bands. These are descriptive aids, not
    // validated omission or adequacy thresholds.
    const underrepresented = validParticipants.filter(p => p.representationScore < low);
    const atRiskParticipants = validParticipants.filter(p => p.representationScore < atRisk);

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

    return {
      totalMissed: underrepresented.length,
      atRiskCount: atRiskParticipants.length,
      missedGroups,
      atRiskParticipants,
      atRisk,
      low,
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
        <h3 className="font-bold text-green-800 mb-1">No source-score flags under this rule</h3>
        <p className="text-green-600 text-sm">
          No records cross this heuristic. This does not prove complete representation; inspect transformation, claim, and unassessed evidence.
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
              <h3 className="font-bold text-slate-800">Semantic Alignment Review</h3>
              <p className="text-sm text-slate-500">
                {analysis.totalMissed} source record{analysis.totalMissed !== 1 ? 's' : ''} below the provisional {analysis.low.toFixed(2)} band
              </p>
            </div>
          </div>
          {analysis.atRiskCount > 0 && (
            <div className="bg-red-100 text-red-700 px-3 py-1 rounded-full text-xs font-bold">
              {analysis.atRiskCount} stronger review flag{analysis.atRiskCount !== 1 ? 's' : ''}
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
                        p.representationScore < analysis.atRisk
                          ? 'bg-red-100 text-red-700'
                          : 'bg-amber-100 text-amber-700'
                      }`}>
                        {p.representationScore.toFixed(3)} retrieval
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

    </div>
  );
};

export default MissedPerspectives;
