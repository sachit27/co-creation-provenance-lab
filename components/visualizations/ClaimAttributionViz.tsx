import React, { useState, useMemo } from 'react';
import { ClaimAttribution, ClaimSupportLevel } from '../../types';
import { InfoIcon } from '../ui/MetricGlossary';

interface Props {
  data: ClaimAttribution;
  summarySentences: string[];
}

const SUPPORT_CONFIG: Record<ClaimSupportLevel, { label: string; color: string; bg: string; icon: string; description: string }> = {
  supported: { label: 'Supported', color: '#059669', bg: '#d1fae5', icon: '\u2713', description: 'Directly stated in source text' },
  inferrable: { label: 'Inferrable', color: '#2563eb', bg: '#dbeafe', icon: '\u2197', description: 'Reasonable derivation from evidence' },
  unsupported: { label: 'No support retrieved', color: '#dc2626', bg: '#fee2e2', icon: '\u2717', description: 'Automated search/judge did not establish source support; not proof of hallucination' },
  contradicted: { label: 'Contradicted', color: '#7c3aed', bg: '#ede9fe', icon: '\u26A0', description: 'Source evidence says the opposite' },
  unassessed: { label: 'Unassessed', color: '#64748b', bg: '#f1f5f9', icon: '?', description: 'Retrieval or evaluation did not establish usable evidence' },
};

const LEVELS: ClaimSupportLevel[] = ['supported', 'inferrable', 'unsupported', 'contradicted', 'unassessed'];

export const ClaimAttributionViz: React.FC<Props> = ({ data, summarySentences }) => {
  const [selectedSentence, setSelectedSentence] = useState<number | null>(null);
  const [expandedClaim, setExpandedClaim] = useState<number | null>(null);

  const totalClaims = data.claims.length || 1;

  // Group claims by sentence
  const claimsBySentence = useMemo(() => {
    const map: Record<number, typeof data.claims> = {};
    for (const c of data.claims) {
      if (!map[c.sentenceIndex]) map[c.sentenceIndex] = [];
      map[c.sentenceIndex].push(c);
    }
    return map;
  }, [data.claims]);

  const sentenceIndices = useMemo(() =>
    [...new Set(data.claims.map(c => c.sentenceIndex))].sort((a, b) => a - b),
    [data.claims]
  );

  // Overall stacked bar
  const OverallBar = () => (
    <div className="mb-6">
      <div className="flex items-center justify-between mb-2">
        <div className="text-sm font-semibold text-slate-700">Overall Claim Attribution <InfoIcon metricKey="claims" /></div>
        <div className="text-sm font-bold text-slate-700">
          {data.attributionScore === null ? 'Assessment unavailable' : `${(data.attributionScore * 100).toFixed(0)}% directly supported among assessed claims`}
        </div>
      </div>
      <div className="flex h-8 rounded-lg overflow-hidden border border-slate-200">
        {LEVELS.map(level => {
          const count = level === 'supported' ? data.supportedCount
            : level === 'inferrable' ? data.inferrableCount
            : level === 'unsupported' ? data.unsupportedCount
            : level === 'contradicted' ? data.contradictedCount
            : data.unassessedCount;
          if (count === 0) return null;
          const pct = (count / totalClaims) * 100;
          return (
            <div
              key={level}
              title={`${SUPPORT_CONFIG[level].label}: ${count} (${pct.toFixed(0)}%)`}
              className="flex items-center justify-center text-[10px] font-bold transition-all hover:opacity-80"
              style={{
                width: `${pct}%`,
                backgroundColor: SUPPORT_CONFIG[level].bg,
                color: SUPPORT_CONFIG[level].color,
                minWidth: pct > 3 ? undefined : '2px',
              }}
            >
              {pct >= 10 ? `${pct.toFixed(0)}%` : ''}
            </div>
          );
        })}
      </div>
      <div className="flex flex-wrap gap-3 mt-2">
        {LEVELS.map(level => {
          const count = level === 'supported' ? data.supportedCount
            : level === 'inferrable' ? data.inferrableCount
            : level === 'unsupported' ? data.unsupportedCount
            : level === 'contradicted' ? data.contradictedCount
            : data.unassessedCount;
          if (count === 0) return null;
          return (
            <div key={level} className="flex items-center gap-1.5 text-[11px] text-slate-600">
              <span className="w-2.5 h-2.5 rounded-sm" style={{ backgroundColor: SUPPORT_CONFIG[level].color }} />
              {SUPPORT_CONFIG[level].label} ({count})
            </div>
          );
        })}
      </div>
    </div>
  );

  // Sentence selector
  const SentenceNav = () => (
    <div className="flex flex-wrap gap-1.5 mb-4">
      <button
        onClick={() => setSelectedSentence(null)}
        className={`px-2.5 py-1 text-xs font-medium rounded-lg border transition-all ${
          selectedSentence === null
            ? 'bg-slate-800 text-white border-slate-800'
            : 'bg-white text-slate-600 border-slate-200 hover:border-slate-300'
        }`}
      >
        All ({data.claims.length})
      </button>
      {sentenceIndices.map(si => {
        const claims = claimsBySentence[si] || [];
        const hasIssue = claims.some(c => c.supportLevel === 'unsupported' || c.supportLevel === 'contradicted');
        return (
          <button
            key={si}
            onClick={() => setSelectedSentence(si)}
            className={`px-2.5 py-1 text-xs font-medium rounded-lg border transition-all ${
              selectedSentence === si
                ? 'bg-blue-600 text-white border-blue-600'
                : 'bg-white text-slate-600 border-slate-200 hover:border-slate-300'
            }`}
          >
            S{si + 1}
            {hasIssue && <span className="ml-1 w-1.5 h-1.5 rounded-full bg-red-500 inline-block" />}
          </button>
        );
      })}
    </div>
  );

  // Claims list
  const visibleClaims = selectedSentence !== null
    ? (claimsBySentence[selectedSentence] || [])
    : data.claims;

  return (
    <div className="space-y-4">
      <OverallBar />

      {/* Legend */}
      <div className="bg-slate-50 rounded-lg p-3 border border-slate-200">
        <div className="text-[10px] font-bold text-slate-400 uppercase tracking-wide mb-2">Attribution Levels</div>
        <div className="grid grid-cols-2 md:grid-cols-5 gap-2">
          {LEVELS.map(level => (
            <div key={level} className="flex items-start gap-1.5">
              <span className="w-2 h-2 rounded-sm mt-1 flex-shrink-0" style={{ backgroundColor: SUPPORT_CONFIG[level].color }} />
              <div>
                <div className="text-[11px] font-semibold" style={{ color: SUPPORT_CONFIG[level].color }}>{SUPPORT_CONFIG[level].label}</div>
                <div className="text-[10px] text-slate-500 leading-tight">{SUPPORT_CONFIG[level].description}</div>
              </div>
            </div>
          ))}
        </div>
      </div>

      <SentenceNav />

      {/* Selected sentence context */}
      {selectedSentence !== null && summarySentences[selectedSentence] && (
        <div className="p-3 bg-blue-50 border border-blue-200 rounded-lg text-sm text-blue-900 italic">
          "{summarySentences[selectedSentence]}"
        </div>
      )}

      {/* Claims cards */}
      <div className="space-y-2">
        {visibleClaims.map(claim => {
          const isExpanded = expandedClaim === claim.claimIndex;
          const cfg = SUPPORT_CONFIG[claim.supportLevel];
          return (
            <div key={claim.claimIndex} className="border border-slate-200 rounded-lg overflow-hidden hover:border-slate-300 transition-colors">
              <button
                onClick={() => setExpandedClaim(isExpanded ? null : claim.claimIndex)}
                className="w-full text-left p-3 hover:bg-slate-50/50 transition-colors"
              >
                <div className="flex items-start gap-3">
                  <span
                    className="text-[11px] font-bold px-2 py-0.5 rounded-full flex-shrink-0 mt-0.5"
                    style={{ backgroundColor: cfg.bg, color: cfg.color }}
                  >
                    {cfg.icon} {cfg.label}
                  </span>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm text-slate-700 leading-relaxed">
                      {claim.claimText}
                    </p>
                    <div className="flex items-center gap-2 mt-1">
                      <span className="text-[10px] text-slate-400">
                        S{claim.sentenceIndex + 1}
                      </span>
                      {claim.evidence.length > 0 && (
                        <span className="text-[10px] text-slate-400">
                          {claim.evidence.length} source{claim.evidence.length !== 1 ? 's' : ''}
                        </span>
                      )}
                    </div>
                  </div>
                  <span className="text-slate-400 text-sm flex-shrink-0">{isExpanded ? '-' : '+'}</span>
                </div>
              </button>

              {isExpanded && (
                <div className="border-t border-slate-100 bg-slate-50/50 p-4">
                  {claim.evidence.length === 0 ? (
                    <div className="text-xs text-red-500 italic flex items-center gap-2">
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <circle cx="12" cy="12" r="10" /><line x1="15" y1="9" x2="9" y2="15" /><line x1="9" y1="9" x2="15" y2="15" />
                      </svg>
                      No supporting passage was retrieved by the configured automated search. This is a review flag, not proof that the claim is AI-generated or absent from every source.
                    </div>
                  ) : (
                    <div className="space-y-2">
                      <div className="text-[10px] font-bold text-slate-400 uppercase tracking-wide mb-1">Source Evidence</div>
                      {claim.evidence.map((ev, i) => (
                        <div key={i} className="flex items-start gap-3 p-2.5 rounded-lg bg-white border border-slate-200">
                          <div className="flex-shrink-0">
                            <div className="text-[10px] font-bold text-slate-500">{ev.participantId}</div>
                            <div className="text-[9px] text-slate-400 mt-0.5">
                              sim: {ev.similarity.toFixed(2)}
                            </div>
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className="text-xs text-slate-700 leading-relaxed italic">"{ev.passage}"</p>
                          </div>
                          <div className="flex-shrink-0 w-12">
                            <div className="h-1.5 bg-slate-200 rounded-full overflow-hidden">
                              <div
                                className="h-full rounded-full"
                                style={{
                                  width: `${Math.min(100, ev.similarity * 100)}%`,
                                  backgroundColor: ev.similarity >= 0.5 ? '#059669' : ev.similarity >= 0.3 ? '#2563eb' : '#d97706',
                                }}
                              />
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {visibleClaims.length === 0 && (
        <div className="text-sm text-slate-400 text-center py-8">
          No claims found for this sentence.
        </div>
      )}
    </div>
  );
};
