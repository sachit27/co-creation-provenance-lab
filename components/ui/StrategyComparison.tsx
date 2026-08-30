import React, { useState } from 'react';
import { StrategyComparisonResult, SummarizationStrategy } from '../../types';

interface Props {
  comparisons: StrategyComparisonResult[];
  currentStrategy: SummarizationStrategy;
  onSelectStrategy?: (strategy: SummarizationStrategy) => void;
}

const INFO: Record<SummarizationStrategy, { label: string; description: string }> = {
  balanced: { label: 'Balanced', description: 'Prompts for majority trends and significant minority concerns.' },
  diversity: { label: 'Diversity focus', description: 'Prompts for distinct and minority perspectives.' },
  consensus: { label: 'Consensus focus', description: 'Prompts for shared goals and areas of agreement.' },
};

const value = (number: number | undefined, percent = false): string => {
  if (number === undefined || !Number.isFinite(number)) return 'Unavailable';
  return percent ? `${(number * 100).toFixed(1)}%` : number.toFixed(3);
};

export const StrategyComparison: React.FC<Props> = ({ comparisons, currentStrategy, onSelectStrategy }) => {
  const [expanded, setExpanded] = useState<SummarizationStrategy | null>(null);
  if (comparisons.length === 0) return null;

  return (
    <section className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
      <header className="border-b border-slate-200 bg-indigo-50 px-6 py-4">
        <h3 className="font-bold text-slate-800">Strategy Sensitivity Comparison</h3>
        <p className="mt-1 text-xs leading-relaxed text-slate-600">
          A descriptive comparison under the same provider, word guidance, embeddings, and production retrieval metric.
          The current strategy reuses its audited summary; alternatives are new model generations and may vary on repeat.
          No composite “best” strategy is imposed.
        </p>
      </header>

      <div className="grid gap-4 p-4 md:grid-cols-3">
        {comparisons.map(comparison => {
          const complete = comparison.status === 'complete' && comparison.avgRepresentation !== null && !!comparison.metrics;
          const isCurrent = comparison.isCurrentSummary || comparison.strategy === currentStrategy;
          const isExpanded = expanded === comparison.strategy;
          return (
            <article key={comparison.strategy} className={`rounded-xl border-2 ${isCurrent ? 'border-indigo-500 bg-indigo-50/40' : 'border-slate-200'}`}>
              <div className="border-b border-slate-100 p-4">
                <div className="flex items-center justify-between gap-2">
                  <h4 className="font-bold text-slate-800">{INFO[comparison.strategy].label}</h4>
                  {isCurrent && <span className="rounded bg-indigo-100 px-2 py-0.5 text-[10px] font-bold text-indigo-700">CURRENT SUMMARY</span>}
                </div>
                <p className="mt-1 text-xs text-slate-500">{INFO[comparison.strategy].description}</p>
              </div>

              {complete ? (
                <dl className="space-y-2 p-4 text-xs">
                  <div className="flex justify-between gap-3"><dt className="text-slate-500">Mean max-sentence cosine</dt><dd className="font-mono font-bold">{value(comparison.avgRepresentation ?? undefined)}</dd></div>
                  <div className="flex justify-between gap-3"><dt className="text-slate-500">Gini of retrieval scores</dt><dd className="font-mono">{value(comparison.metrics?.giniCoefficient)}</dd></div>
                  <div className="flex justify-between gap-3"><dt className="text-slate-500">Distinct-group gap</dt><dd className="font-mono">{value(comparison.metrics?.distinctRepresentationGap)}</dd></div>
                </dl>
              ) : (
                <div className="m-4 rounded border border-amber-200 bg-amber-50 p-3 text-xs text-amber-900">
                  Unavailable: {comparison.error ?? 'generation or scoring failed'}
                </div>
              )}

              {complete && (
                <>
                  <button
                    type="button"
                    onClick={() => setExpanded(isExpanded ? null : comparison.strategy)}
                    className="w-full border-t border-slate-100 px-4 py-2 text-xs text-slate-600 hover:bg-slate-50"
                    aria-expanded={isExpanded}
                  >
                    {isExpanded ? 'Hide' : 'Show'} summary
                  </button>
                  {isExpanded && <div className="m-4 mt-0 max-h-40 overflow-y-auto rounded bg-slate-50 p-3 text-xs leading-relaxed text-slate-700">{comparison.summary}</div>}
                </>
              )}

              {onSelectStrategy && !isCurrent && complete && (
                <button type="button" onClick={() => onSelectStrategy(comparison.strategy)} className="m-4 mt-0 rounded border border-slate-300 px-3 py-1.5 text-xs text-slate-700">
                  Use this strategy in a new run
                </button>
              )}
            </article>
          );
        })}
      </div>
      <p className="border-t border-slate-100 px-6 py-3 text-[11px] text-slate-500">
        These indicators describe automated retrieval-score distributions. They do not establish fairness, quality, or statistical superiority.
      </p>
    </section>
  );
};

export default StrategyComparison;
