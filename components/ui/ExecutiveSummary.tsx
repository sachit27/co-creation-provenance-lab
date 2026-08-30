import React, { useMemo } from 'react';
import { AnalysisResult } from '../../types';
import { getRepresentationBands } from '../../constants';
import { generateRecommendations } from '../../services/plainLanguage';

interface ExecutiveSummaryProps {
  data: AnalysisResult;
  onViewDetails?: (tab: string) => void;
  onExportReport?: () => void;
  onRevise?: () => void;
  isRevising?: boolean;
}

/**
 * Descriptive audit snapshot. It deliberately avoids an overall quality/fairness
 * grade because the component indicators have different constructs and no
 * validated weighting scheme.
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

  const recommendations = useMemo(
    () => generateRecommendations(
      data.participants.filter(item => !item.embeddingFailed && !item.alignmentUnavailableReason),
      data.metrics,
    ),
    [data],
  );

  return (
    <section className="overflow-hidden rounded-2xl border border-slate-700 bg-gradient-to-br from-slate-900 to-slate-800 shadow-xl" aria-labelledby="audit-snapshot-title">
      <header className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-700 px-6 py-4">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-full bg-blue-500/20" aria-hidden="true">
            <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-blue-400">
              <path d="M3 3v18h18" /><path d="m7 16 4-5 4 3 4-7" />
            </svg>
          </div>
          <div>
            <h2 id="audit-snapshot-title" className="text-lg font-bold text-white">Semantic-alignment Audit Snapshot</h2>
            <p className="text-xs text-slate-400">{data.config.datasetName} · {analysis.total} source records · {data.embeddingTierUsed ?? 'unknown'} embedding tier</p>
          </div>
        </div>
        <div className="text-right">
          <div className="text-2xl font-bold text-blue-300">
            {analysis.average === null ? '—' : analysis.average.toFixed(2)}
          </div>
          <div className="text-[10px] text-slate-400">Mean strongest-sentence cosine · descriptive</div>
        </div>
      </header>

      <div className="grid grid-cols-2 divide-x divide-y divide-slate-700 border-b border-slate-700 md:grid-cols-4 md:divide-y-0">
        <div className="p-4 text-center">
          <div className="text-2xl font-bold text-slate-100">{analysis.validCount}/{analysis.total}</div>
          <div className="text-xs text-slate-400">Valid comparisons</div>
          <div className="text-[10px] text-slate-500">aggregate denominator</div>
        </div>
        <div className="p-4 text-center">
          <div className="text-2xl font-bold text-emerald-300">{analysis.aboveTarget}</div>
          <div className="text-xs text-slate-400">At/above target band</div>
          <div className="text-[10px] text-slate-500">score ≥ {analysis.bands.target.toFixed(2)}</div>
        </div>
        <div className="p-4 text-center">
          <div className="text-2xl font-bold text-amber-300">{analysis.reviewBand}</div>
          <div className="text-xs text-slate-400">Intermediate band</div>
          <div className="text-[10px] text-slate-500">{analysis.bands.atRisk.toFixed(2)}–{analysis.bands.target.toFixed(2)}</div>
        </div>
        <div className="p-4 text-center">
          <div className="text-2xl font-bold text-rose-300">{analysis.belowMarker}</div>
          <div className="text-xs text-slate-400">Below review marker</div>
          <div className="text-[10px] text-slate-500">score &lt; {analysis.bands.atRisk.toFixed(2)}</div>
        </div>
      </div>

      <div className="grid gap-3 border-b border-slate-700 px-6 py-4 text-sm md:grid-cols-3">
        <div className="rounded-lg border border-slate-700 bg-slate-800/60 p-3">
          <div className="text-[10px] font-bold uppercase tracking-wide text-slate-500">Gini of valid scores</div>
          <div className="mt-1 text-xl font-bold text-slate-100">{data.metrics.giniCoefficient.toFixed(3)}</div>
          <p className="mt-1 text-[10px] leading-relaxed text-slate-400">Score inequality only; not a fairness or quality verdict.</p>
        </div>
        <div className="rounded-lg border border-slate-700 bg-slate-800/60 p-3">
          <div className="text-[10px] font-bold uppercase tracking-wide text-slate-500">Distinct-record gap</div>
          <div className="mt-1 text-xl font-bold text-slate-100">{data.metrics.distinctRepresentationGap.toFixed(3)}</div>
          <p className="mt-1 text-[10px] leading-relaxed text-slate-400">Remaining records minus centroid-distant quartile.</p>
        </div>
        <div className="rounded-lg border border-slate-700 bg-slate-800/60 p-3">
          <div className="text-[10px] font-bold uppercase tracking-wide text-slate-500">Interpretation</div>
          <p className="mt-1 text-[11px] leading-relaxed text-slate-300">Semantic association is not entailment, observed influence, authorship, affective preservation, or population representation.</p>
        </div>
      </div>

      <div className="border-b border-slate-700 px-6 py-4">
        <div className="mb-2 text-xs font-bold uppercase tracking-wider text-slate-400">Review flags</div>
        {analysis.reviewFlags.length > 0 ? (
          <ul className="space-y-2">
            {analysis.reviewFlags.map(flag => (
              <li key={flag} className="flex items-start gap-2 text-sm text-amber-200">
                <span className="mt-0.5 text-amber-400" aria-hidden="true">•</span><span>{flag}</span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-slate-300">No records cross the current review rules. This does not establish completeness or validity; inspect exact evidence and enrichment coverage.</p>
        )}
      </div>

      <div className="border-b border-slate-700 bg-emerald-900/10 px-6 py-4">
        <div className="mb-2 text-xs font-bold uppercase tracking-wider text-emerald-300">Review prompts</div>
        <ul className="space-y-2">
          {recommendations.slice(0, 4).map(prompt => (
            <li key={prompt} className="flex items-start gap-2 text-sm text-emerald-100">
              <span className="mt-0.5 text-emerald-400" aria-hidden="true">→</span><span>{prompt}</span>
            </li>
          ))}
        </ul>
      </div>

      <footer className="flex flex-wrap gap-3 px-6 py-4">
        <button onClick={() => onViewDetails?.('blindspot')} className="flex-1 rounded-lg bg-slate-700 px-4 py-2.5 text-sm font-medium text-white transition-colors hover:bg-slate-600">
          Inspect evidence
        </button>
        {onRevise && (
          <button onClick={onRevise} disabled={isRevising} className="flex-1 rounded-lg bg-emerald-600 px-4 py-2.5 text-sm font-medium text-white transition-colors hover:bg-emerald-500 disabled:cursor-wait disabled:bg-slate-600">
            {isRevising ? 'Preparing revision…' : 'Review or revise summary'}
          </button>
        )}
        {onExportReport && (
          <button onClick={onExportReport} className="flex-1 rounded-lg bg-blue-600 px-4 py-2.5 text-sm font-medium text-white transition-colors hover:bg-blue-500">
            Export audit record
          </button>
        )}
      </footer>
    </section>
  );
};

export default ExecutiveSummary;
