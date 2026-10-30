import React, { useState } from 'react';
import { TensionAnalysis, TensionHandling, ClusterData } from '../../types';
import { InfoIcon } from '../ui/MetricGlossary';

interface Props {
  data: TensionAnalysis;
  clusters: ClusterData[];
}

const HANDLING_CONFIG: Record<TensionHandling, { label: string; color: string; bg: string; icon: string; description: string }> = {
  acknowledged: { label: 'Acknowledged', color: '#059669', bg: '#d1fae5', icon: '\u2713', description: 'Summary explicitly presents the incompatibility' },
  suppressed: { label: 'One-sided', color: '#dc2626', bg: '#fee2e2', icon: '\u2717', description: 'Exactly one position is represented' },
  merged: { label: 'Flattened', color: '#d97706', bg: '#fef3c7', icon: '\u21C4', description: 'Both positions appear but their incompatibility is removed' },
  absent: { label: 'Absent', color: '#be123c', bg: '#ffe4e6', icon: '\u2205', description: 'Neither position is represented' },
  distorted: { label: 'Distorted', color: '#7c3aed', bg: '#ede9fe', icon: '\u26A0', description: 'Disagreement mischaracterized' },
  unassessed: { label: 'Unassessed', color: '#64748b', bg: '#f1f5f9', icon: '?', description: 'Handling evaluation was unavailable or invalid' },
};

const HANDLINGS: TensionHandling[] = ['acknowledged', 'suppressed', 'merged', 'absent', 'distorted', 'unassessed'];

export const TensionNetworkViz: React.FC<Props> = ({ data, clusters }) => {
  const [selectedPair, setSelectedPair] = useState<number | null>(null);
  const [viewMode, setViewMode] = useState<'pairs' | 'clusters'>('pairs');

  if (data.basis !== 'stable-semantic-groups') {
    return (
      <div className="rounded-lg border border-amber-200 bg-amber-50 p-4">
        <div className="text-sm font-semibold text-amber-900">Cluster-conditioned tension mapping unavailable</div>
        <p className="mt-1 text-xs leading-relaxed text-amber-800">
          {data.unavailableReason || 'This saved result does not contain a partition that passed internal checks.'}
          {' '}No absence-of-tension conclusion should be drawn.
        </p>
      </div>
    );
  }

  const total = data.pairs.length;
  const assessedTotal = total - data.unassessedCount;
  const sampling = data.samplingCoverage;

  // Overall bar
  const OverallBar = () => (
    <div className="mb-6">
      <div className="space-y-3 mb-3">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
          <div className="text-sm font-semibold text-slate-700">
            <span className="inline-flex items-center">Model-coded candidate handling <InfoIcon metricKey="tensions" /></span>
          </div>
          <div className="text-xs text-slate-600 sm:max-w-[55%] sm:text-right">
            <div className="font-semibold">{assessedTotal} of {total} candidates assessed</div>
            {assessedTotal > 0 && data.tensionFidelityScore !== null && (
              <div>{(data.tensionFidelityScore * 100).toFixed(0)}% of assessed candidates coded acknowledged</div>
            )}
          </div>
        </div>
        <p className="text-xs leading-relaxed text-slate-600">These are model-generated candidates. Exact quotes verify text locations, not that two views conflict. Complementary proposals can be misclassified; review both sources before accepting a tension or its handling label.</p>
        {total > 0 && assessedTotal === 0 && (
          <div className="rounded-lg border border-slate-200 bg-slate-50 p-3 text-xs leading-relaxed text-slate-600">
            <strong>Summary handling is unassessed.</strong> Source candidates were retained, but no valid handling assessments were recorded. An acknowledged rate is unavailable. This limits this panel's handling conclusions; other analyses have their own checks.
          </div>
        )}
      </div>
      {total > 0 && <><div className="text-[11px] text-slate-500 mb-1">Distribution of retained candidates · counts and shares, not a quality score</div>
      <div className="flex h-8 rounded-lg overflow-hidden border border-slate-200" role="img" aria-label={`Candidate handling distribution: ${assessedTotal} assessed and ${data.unassessedCount} unassessed out of ${total}`}>
        {HANDLINGS.map(h => {
          const count = h === 'acknowledged' ? data.acknowledgedCount
            : h === 'suppressed' ? data.suppressedCount
            : h === 'merged' ? data.mergedCount : h === 'absent' ? (data.absentCount ?? 0) : h === 'distorted' ? data.distortedCount : data.unassessedCount;
          if (count === 0) return null;
          const pct = (count / total) * 100;
          return (
            <div key={h}
              title={`${HANDLING_CONFIG[h].label}: ${count} (${pct.toFixed(0)}%)`}
              className="flex items-center justify-center text-[10px] font-bold transition-all hover:opacity-80"
              style={{ width: `${pct}%`, backgroundColor: HANDLING_CONFIG[h].bg, color: HANDLING_CONFIG[h].color, minWidth: pct > 3 ? undefined : '2px' }}
            >
              {pct >= 25 ? `${HANDLING_CONFIG[h].label} (${count})` : pct >= 12 ? `${pct.toFixed(0)}%` : ''}
            </div>
          );
        })}
      </div></>}
      <div className="flex flex-wrap gap-3 mt-2">
        {HANDLINGS.map(h => {
          const count = h === 'acknowledged' ? data.acknowledgedCount
            : h === 'suppressed' ? data.suppressedCount
            : h === 'merged' ? data.mergedCount : h === 'absent' ? (data.absentCount ?? 0) : h === 'distorted' ? data.distortedCount : data.unassessedCount;
          if (count === 0) return null;
          return (
            <div key={h} className="flex items-center gap-1.5 text-[11px] text-slate-600">
              <span className="w-2.5 h-2.5 rounded-sm" style={{ backgroundColor: HANDLING_CONFIG[h].color }} />
              {HANDLING_CONFIG[h].label} ({count})
            </div>
          );
        })}
      </div>
    </div>
  );

  // Cluster-level aggregation view
  const ClusterView = () => {
    if (data.clusterTensions.length === 0) {
      return <div className="text-sm text-slate-400 text-center py-8">No retained inter-group tension candidates.</div>;
    }

    return (
      <div className="space-y-3">
        <div className="text-sm font-semibold text-slate-700">Retained inter-group tension candidates</div>
        {data.clusterTensions.map((ct, i) => {
          const clusterA = clusters.find(c => c.id === ct.clusterA);
          const clusterB = clusters.find(c => c.id === ct.clusterB);
          const cfg = HANDLING_CONFIG[ct.dominantHandling];
          return (
            <div key={i} className="flex items-center gap-3 p-3 rounded-lg border border-slate-200 hover:border-slate-300 transition-colors">
              <div className="flex items-center gap-2 flex-1">
                <span className="px-2 py-0.5 rounded text-xs font-bold text-white" style={{ backgroundColor: clusterA?.color || '#64748b' }}>
                  {clusterA?.label || `Cluster ${ct.clusterA}`}
                </span>
                <svg width="24" height="16" viewBox="0 0 24 16" className="flex-shrink-0">
                  <line x1="0" y1="8" x2="24" y2="8" stroke={cfg.color} strokeWidth="2" />
                  <line x1="0" y1="4" x2="0" y2="12" stroke={cfg.color} strokeWidth="2" />
                  <line x1="24" y1="4" x2="24" y2="12" stroke={cfg.color} strokeWidth="2" />
                </svg>
                <span className="px-2 py-0.5 rounded text-xs font-bold text-white" style={{ backgroundColor: clusterB?.color || '#64748b' }}>
                  {clusterB?.label || `Cluster ${ct.clusterB}`}
                </span>
              </div>
              <span className="text-xs font-medium text-slate-500">{ct.tensionCount} tension{ct.tensionCount !== 1 ? 's' : ''}</span>
              <span className="text-[10px] font-bold px-2 py-0.5 rounded-full" style={{ backgroundColor: cfg.bg, color: cfg.color }}>
                {cfg.icon} {cfg.label}
              </span>
            </div>
          );
        })}
      </div>
    );
  };

  // Individual tension pairs view
  const PairsView = () => (
    <div className="space-y-3">
      <div className="text-sm font-semibold text-slate-700">Retained tension candidates ({data.pairs.length})</div>
      {data.pairs.map((pair, i) => {
        const isSelected = selectedPair === i;
        const cfg = HANDLING_CONFIG[pair.summaryHandling];
        const clusterA = clusters.find(c => c.id === pair.claimA.clusterId);
        const clusterB = clusters.find(c => c.id === pair.claimB.clusterId);

        return (
          <div key={i} className="border border-slate-200 rounded-lg overflow-hidden hover:border-slate-300 transition-colors">
            <button
              onClick={() => setSelectedPair(isSelected ? null : i)}
              className="w-full text-left p-4 hover:bg-slate-50/50 transition-colors"
            >
              <div className="flex items-start gap-3">
                <span className="text-[10px] font-bold px-2 py-0.5 rounded-full flex-shrink-0 mt-0.5"
                  style={{ backgroundColor: cfg.bg, color: cfg.color }}>
                  {cfg.icon} {cfg.label}
                </span>
                <div className="flex-1 min-w-0">
                  <p className="text-sm text-slate-700 leading-relaxed font-medium">
                    {pair.tensionDescription}
                  </p>
                  {pair.tensionType && (
                    <div className="mt-1 text-[10px] font-medium uppercase tracking-wide text-slate-400">
                      {pair.tensionType.replace(/_/g, ' ')} · exact source spans
                    </div>
                  )}
                  <div className="flex items-center gap-2 mt-1.5">
                    {clusterA && <span className="text-[10px] px-1.5 py-0.5 rounded text-white font-medium" style={{ backgroundColor: clusterA.color }}>{clusterA.label}</span>}
                    <span className="text-[10px] text-slate-400">vs</span>
                    {clusterB && <span className="text-[10px] px-1.5 py-0.5 rounded text-white font-medium" style={{ backgroundColor: clusterB.color }}>{clusterB.label}</span>}
                  </div>
                </div>
                <span className="text-slate-400 text-sm flex-shrink-0">{isSelected ? '-' : '+'}</span>
              </div>
            </button>

            {isSelected && (
              <div className="border-t border-slate-100 bg-slate-50/50 p-4 space-y-3">
                {/* Side A */}
                <div className="p-3 rounded-lg border-l-4" style={{ borderColor: clusterA?.color || '#64748b', backgroundColor: '#f8fafc' }}>
                  <div className="text-[10px] font-bold text-slate-400 uppercase mb-1">Position A — {pair.claimA.participantId}</div>
                  <p className="text-sm text-slate-700 italic">"{pair.claimA.text}"</p>
                </div>

                {/* Side B */}
                <div className="p-3 rounded-lg border-l-4" style={{ borderColor: clusterB?.color || '#64748b', backgroundColor: '#f8fafc' }}>
                  <div className="text-[10px] font-bold text-slate-400 uppercase mb-1">Position B — {pair.claimB.participantId}</div>
                  <p className="text-sm text-slate-700 italic">"{pair.claimB.text}"</p>
                </div>

                {/* Summary handling */}
                <div className="p-3 rounded-lg border" style={{ borderColor: cfg.color + '40', backgroundColor: cfg.bg + '40' }}>
                  <div className="text-[10px] font-bold uppercase mb-1" style={{ color: cfg.color }}>
                    Summary handling: {cfg.label}
                  </div>
                  {pair.summaryEvidence ? (
                    <p className="text-sm text-slate-700 italic">"{pair.summaryEvidence}"</p>
                  ) : (
                    <p className="text-sm text-slate-400 italic">{pair.summaryHandling === 'unassessed' ? 'The model did not return a verified handling assessment for this candidate.' : 'No verified summary passage was recorded for this candidate.'}</p>
                  )}
                  <p className="text-[10px] text-slate-500 mt-1">{cfg.description}</p>
                </div>
              </div>
            )}
          </div>
        );
      })}
      {data.pairs.length === 0 && (
        <div className="text-sm text-slate-400 text-center py-8">
          No tension candidates were returned from the sampled, model-coded assessment. This is not evidence that no disagreement exists.
        </div>
      )}
    </div>
  );

  return (
    <div className="space-y-4">
      <OverallBar />

      {sampling && (
        <div className="rounded-lg border border-blue-200 bg-blue-50 p-3 text-xs leading-relaxed text-blue-900">
          <span className="font-semibold">Source screening coverage: </span>
          {sampling.screenedRecords}/{sampling.totalRecords} records were presented to the candidate detector
          {sampling.screenedRecords === sampling.totalRecords
            ? ' (complete for this run).'
            : ` (capped at ${sampling.maximumRecordsPerCluster} per semantic group).`}
          {' '}A complete screen can still miss disagreements because the detector is model-coded.
        </div>
      )}

      {/* Legend */}
      <div className="bg-slate-50 rounded-lg p-3 border border-slate-200">
        <div className="text-[10px] font-bold text-slate-400 uppercase tracking-wide mb-2">How Summary Handles Disagreements</div>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
          {HANDLINGS.map(h => (
            <div key={h} className="flex items-start gap-1.5">
              <span className="w-2 h-2 rounded-sm mt-1 flex-shrink-0" style={{ backgroundColor: HANDLING_CONFIG[h].color }} />
              <div>
                <div className="text-[11px] font-semibold" style={{ color: HANDLING_CONFIG[h].color }}>{HANDLING_CONFIG[h].label}</div>
                <div className="text-[10px] text-slate-500 leading-tight">{HANDLING_CONFIG[h].description}</div>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* View toggle */}
      <div className="flex gap-2">
        <button
          onClick={() => setViewMode('pairs')}
          className={`px-3 py-1.5 text-xs font-medium rounded-lg border transition-all ${viewMode === 'pairs' ? 'bg-blue-600 text-white border-blue-600' : 'bg-white text-slate-600 border-slate-200 hover:border-slate-300'}`}
        >
          Individual Pairs ({data.pairs.length})
        </button>
        <button
          onClick={() => setViewMode('clusters')}
          className={`px-3 py-1.5 text-xs font-medium rounded-lg border transition-all ${viewMode === 'clusters' ? 'bg-blue-600 text-white border-blue-600' : 'bg-white text-slate-600 border-slate-200 hover:border-slate-300'}`}
        >
          Cluster Summary ({data.clusterTensions.length})
        </button>
      </div>

      {viewMode === 'pairs' ? <PairsView /> : <ClusterView />}
    </div>
  );
};
