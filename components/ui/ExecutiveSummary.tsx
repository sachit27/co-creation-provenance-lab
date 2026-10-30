import React, { useMemo } from 'react';
import { AnalysisResult } from '../../types';
import { getRepresentationBands } from '../../constants';

interface ExecutiveSummaryProps {
  data: AnalysisResult;
  onViewDetails?: (tab: string) => void;
  onExportReport?: () => void;
  onRevise?: () => void;
  isRevising?: boolean;
}

/**
 * Descriptive audit snapshot.
 * Deliberately avoids an overall quality/fairness grade because the component
 * indicators have different constructs and no validated weighting scheme.
 */
export const ExecutiveSummary: React.FC<ExecutiveSummaryProps> = ({
  data,
  onViewDetails,
  onExportReport,
  onRevise,
  isRevising = false,
}) => {
  const analysis = useMemo(() => {
    const participants = data.participants;
    const valid = participants.filter(item => !item.embeddingFailed && !item.alignmentUnavailableReason);
    const bands = getRepresentationBands(data.embeddingTierUsed);
    const aboveTarget = valid.filter(item => item.representationScore >= bands.target).length;
    const reviewBand = valid.filter(item =>
      item.representationScore >= bands.atRisk && item.representationScore < bands.target
    ).length;
    const belowMarker = valid.filter(item => item.representationScore < bands.atRisk).length;
    const average = valid.length > 0
      ? valid.reduce((sum, item) => sum + item.representationScore, 0) / valid.length
      : null;

    const sortedCentrality = valid
      .map(item => 1 - item.semanticIsolation)
      .sort((left, right) => left - right);
    const medianCentrality = sortedCentrality.length > 0
      ? sortedCentrality[Math.floor(sortedCentrality.length / 2)]
      : 0;
    const distinctLowAlignment = valid.filter(item =>
      1 - item.semanticIsolation < medianCentrality && item.representationScore < bands.low
    );

    const reviewFlags: string[] = [];
    if (belowMarker > 0) {
      reviewFlags.push(`${belowMarker} valid source record${belowMarker === 1 ? '' : 's'} fall below the provisional ${bands.atRisk.toFixed(2)} review marker.`);
    }
    if (distinctLowAlignment.length > 0) {
      reviewFlags.push(`${distinctLowAlignment.length} centroid-distant record${distinctLowAlignment.length === 1 ? '' : 's'} also have low semantic alignment.`);
    }
    if (data.metrics.giniCoefficient > 0.3) {
      reviewFlags.push('The alignment-score distribution is comparatively uneven; inspect the distribution and source evidence.');
    }
    if (data.metrics.distinctRepresentationGap > 0.15) {
      reviewFlags.push('The centroid-distant quartile has lower mean alignment than the remaining valid records.');
    }
    if (participants.length !== valid.length) {
      reviewFlags.push(`${participants.length - valid.length} record${participants.length - valid.length === 1 ? '' : 's'} are unavailable and excluded from aggregates.`);
    }

    return {
      total: participants.length,
      validCount: valid.length,
      bands,
      aboveTarget,
      reviewBand,
      belowMarker,
      average,
      distinctLowAlignment,
      reviewFlags,
    };
  }, [data]);

  return (
    <section className="overflow-hidden rounded-2xl border border-slate-200/90 bg-white shadow-xs" aria-labelledby="audit-snapshot-title">
      {/* Header */}
      <header className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 bg-slate-50/70 px-6 py-4">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-indigo-50 border border-indigo-100 text-indigo-600 shadow-2xs" aria-hidden="true">
            <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M3 3v18h18" /><path d="m7 16 4-5 4 3 4-7" />
            </svg>
          </div>
          <div>
            <h2 id="audit-snapshot-title" className="text-base sm:text-lg font-bold text-slate-900 tracking-tight">
              Semantic-Alignment Audit Snapshot
            </h2>
            <p className="text-xs text-slate-500 font-medium">
              {data.config.datasetName} · {analysis.total} source records · {data.embeddingTierUsed ?? 'unknown'} embedding tier
            </p>
          </div>
        </div>
        <div className="text-right">
          <div className="text-2xl font-black text-indigo-600 tracking-tight">
            {analysis.average === null ? '—' : analysis.average.toFixed(2)}
          </div>
          <div className="text-[10px] text-slate-400 font-medium">Mean strongest-sentence cosine</div>
        </div>
      </header>

      {/* 4 Core Quantitative Metric Blocks */}
      <div className="grid grid-cols-2 divide-x divide-y divide-slate-100 border-b border-slate-100 md:grid-cols-4 md:divide-y-0 bg-white">
        <div className="p-4 text-center">
          <div className="text-2xl font-extrabold text-slate-900">{analysis.validCount}/{analysis.total}</div>
          <div className="text-xs font-semibold text-slate-600 mt-0.5">Valid Comparisons</div>
          <div className="text-[10px] text-slate-400 mt-0.5">Aggregate denominator</div>
        </div>
        <div className="p-4 text-center">
          <div className="text-2xl font-extrabold text-emerald-600">{analysis.aboveTarget}</div>
          <div className="text-xs font-semibold text-slate-600 mt-0.5">At/Above Target</div>
          <div className="text-[10px] text-slate-400 mt-0.5">Score ≥ {analysis.bands.target.toFixed(2)}</div>
        </div>
        <div className="p-4 text-center">
          <div className="text-2xl font-extrabold text-amber-600">{analysis.reviewBand}</div>
          <div className="text-xs font-semibold text-slate-600 mt-0.5">Intermediate Band</div>
          <div className="text-[10px] text-slate-400 mt-0.5">{analysis.bands.atRisk.toFixed(2)}–{analysis.bands.target.toFixed(2)}</div>
        </div>
        <div className="p-4 text-center">
          <div className="text-2xl font-extrabold text-rose-600">{analysis.belowMarker}</div>
          <div className="text-xs font-semibold text-slate-600 mt-0.5">Below Marker</div>
          <div className="text-[10px] text-slate-400 mt-0.5">Score &lt; {analysis.bands.atRisk.toFixed(2)}</div>
        </div>
      </div>

      {/* Statistical Details Trio */}
      <div className="grid gap-3 border-b border-slate-100 bg-slate-50/40 px-6 py-4 text-sm md:grid-cols-3">
        <div className="rounded-xl border border-slate-200/80 bg-white p-3.5 shadow-2xs">
          <div className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Gini of Valid Scores</div>
          <div className="mt-1 text-xl font-bold text-slate-900">{data.metrics.giniCoefficient.toFixed(3)}</div>
          <p className="mt-1 text-[11px] leading-relaxed text-slate-500">Score inequality only; not a quality verdict.</p>
        </div>
        <div className="rounded-xl border border-slate-200/80 bg-white p-3.5 shadow-2xs">
          <div className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Distinct-Record Gap</div>
          <div className="mt-1 text-xl font-bold text-slate-900">{data.metrics.distinctRepresentationGap.toFixed(3)}</div>
          <p className="mt-1 text-[11px] leading-relaxed text-slate-500">Remaining records minus centroid-distant quartile.</p>
        </div>
        <div className="rounded-xl border border-slate-200/80 bg-white p-3.5 shadow-2xs">
          <div className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Epistemic Guardrail</div>
          <p className="mt-1 text-[11px] leading-relaxed text-slate-600">Semantic association is not causal influence, authorship, or population representation.</p>
        </div>
      </div>

      {/* Review Flags */}
      <div className="border-b border-slate-100 px-6 py-4 bg-white">
        <div className="mb-2 text-xs font-bold uppercase tracking-wider text-slate-400">Source-score review flags</div>
        {analysis.reviewFlags.length > 0 ? (
          <ul className="space-y-2">
            {analysis.reviewFlags.map(flag => (
              <li key={flag} className="flex items-start gap-2.5 text-xs text-amber-900 bg-amber-50/70 border border-amber-200/60 rounded-xl p-2.5">
                <span className="mt-0.5 text-amber-600 flex-shrink-0 font-bold" aria-hidden="true">⚠️</span>
                <span className="leading-relaxed font-medium">{flag}</span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-xs text-slate-500">No records cross these source-score rules. The evidence review queue may contain language, claim, or tension suggestions.</p>
        )}
      </div>

      {/* Footer Actions */}
      <footer className="flex flex-wrap items-center gap-3 px-6 py-3.5 bg-slate-50/70">
        <button
          onClick={() => onViewDetails?.('blindspot')}
          className="flex-1 min-h-[38px] rounded-lg bg-white border border-slate-200 hover:bg-slate-50 px-4 py-2 text-xs font-semibold text-slate-700 transition-all shadow-2xs"
        >
          Inspect Evidence
        </button>
        {onRevise && (
          <button
            onClick={onRevise}
            disabled={isRevising}
            className="flex-1 min-h-[38px] rounded-lg bg-emerald-600 hover:bg-emerald-500 px-4 py-2 text-xs font-semibold text-white transition-all shadow-2xs disabled:opacity-50"
          >
            {isRevising ? 'Preparing Revision…' : 'Review or Revise Summary'}
          </button>
        )}
        {onExportReport && (
          <button
            onClick={onExportReport}
            className="flex-1 min-h-[38px] rounded-lg bg-indigo-600 hover:bg-indigo-500 px-4 py-2 text-xs font-semibold text-white transition-all shadow-2xs"
          >
            Export Audit Record
          </button>
        )}
      </footer>
    </section>
  );
};

export default ExecutiveSummary;
