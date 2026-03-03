import React, { useState, useMemo } from 'react';
import { ParticipantAnalysis, BiasAttributionCause } from '../../types';
import { computeBiasAttribution } from '../../services/biasAttribution';

interface BiasAttributionBadgeProps {
  participant: ParticipantAnalysis;
  allParticipants: ParticipantAnalysis[];
  summary: string;
  summarySentences: string[];
}

const CAUSE_META: Record<BiasAttributionCause, { label: string; icon: string; color: string; bg: string; border: string }> = {
  embedding_gap: {
    label: 'Embedding Gap',
    icon: '🔧',
    color: 'text-orange-700',
    bg: 'bg-orange-50',
    border: 'border-orange-200',
  },
  topical_uniqueness: {
    label: 'Unique Voice',
    icon: '💡',
    color: 'text-purple-700',
    bg: 'bg-purple-50',
    border: 'border-purple-200',
  },
  summarizer_bias: {
    label: 'Summarizer Bias',
    icon: '⚖️',
    color: 'text-red-700',
    bg: 'bg-red-50',
    border: 'border-red-200',
  },
  phrasing_mismatch: {
    label: 'Phrasing Mismatch',
    icon: '🔄',
    color: 'text-blue-700',
    bg: 'bg-blue-50',
    border: 'border-blue-200',
  },
};

export const BiasAttributionBadge: React.FC<BiasAttributionBadgeProps> = ({
  participant,
  allParticipants,
  summary,
  summarySentences,
}) => {
  const [expanded, setExpanded] = useState(false);

  const attribution = useMemo(
    () => computeBiasAttribution(participant, allParticipants, summary, summarySentences),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [participant.id, participant.representationScore, summary, allParticipants.length]
  );

  if (!attribution) return null;

  const meta = CAUSE_META[attribution.primaryCause];

  return (
    <div className={`rounded-lg border ${meta.border} ${meta.bg} overflow-hidden`}>
      {/* Trigger row */}
      <button
        onClick={() => setExpanded(e => !e)}
        className="w-full flex items-center justify-between px-3 py-2 text-left hover:opacity-80 transition-opacity"
        aria-expanded={expanded}
      >
        <div className="flex items-center gap-2">
          <span className="text-sm">{meta.icon}</span>
          <span className={`text-xs font-semibold ${meta.color}`}>Why underrepresented?</span>
          <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-medium border ${meta.border} ${meta.color} ${meta.bg}`}>
            {meta.label}
          </span>
        </div>
        <svg
          xmlns="http://www.w3.org/2000/svg"
          width="12"
          height="12"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          className={`${meta.color} transition-transform ${expanded ? 'rotate-180' : ''}`}
        >
          <polyline points="6 9 12 15 18 9" />
        </svg>
      </button>

      {expanded && (
        <div className="px-3 pb-3 space-y-2 border-t border-current/10">
          {/* All factors */}
          {attribution.factors.map((factor, i) => {
            const fm = CAUSE_META[factor.cause];
            return (
              <div key={i} className="mt-2">
                <div className="flex items-center gap-1.5 mb-1">
                  <span className="text-xs">{fm.icon}</span>
                  <span className={`text-[11px] font-semibold ${fm.color}`}>{fm.label}</span>
                  <span
                    className="text-[10px] text-slate-400 ml-auto"
                    title="Not a calibrated probability. Indicates strength of observable evidence for this cause."
                  >
                    {Math.round(factor.confidence * 100)}% evidence strength
                  </span>
                </div>
                {/* Confidence bar */}
                <div className="h-1 bg-slate-200 rounded-full mb-1.5">
                  <div
                    className={`h-full rounded-full ${factor.confidence > 0.7 ? 'bg-red-500' :
                        factor.confidence > 0.4 ? 'bg-amber-500' : 'bg-slate-400'
                      }`}
                    style={{ width: `${factor.confidence * 100}%` }}
                  />
                </div>
                <p className="text-[11px] text-slate-600 leading-relaxed">{factor.evidence}</p>
              </div>
            );
          })}

          {/* Intervention */}
          <div className="mt-3 p-2 bg-indigo-50 border border-indigo-200 rounded">
            <div className="flex items-center gap-1 mb-1">
              <svg xmlns="http://www.w3.org/2000/svg" width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-indigo-600">
                <circle cx="12" cy="12" r="10" /><line x1="12" y1="8" x2="12" y2="12" /><line x1="12" y1="16" x2="12.01" y2="16" />
              </svg>
              <span className="text-[10px] font-bold text-indigo-700 uppercase tracking-wide">Recommended Action</span>
            </div>
            <p className="text-[11px] text-indigo-800 leading-relaxed">{attribution.actionableIntervention}</p>
          </div>
        </div>
      )}
    </div>
  );
};

export default BiasAttributionBadge;
