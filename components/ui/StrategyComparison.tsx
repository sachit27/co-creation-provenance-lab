import React, { useState, useMemo } from 'react';
import { StrategyComparisonResult, SummarizationStrategy } from '../../types';

interface StrategyComparisonProps {
  comparisons: StrategyComparisonResult[];
  currentStrategy: SummarizationStrategy;
  onSelectStrategy?: (strategy: SummarizationStrategy) => void;
}

/**
 * Strategy Comparison Panel
 *
 * Side-by-side comparison of different summarization strategies.
 * Helps users understand trade-offs between approaches.
 */
export const StrategyComparison: React.FC<StrategyComparisonProps> = ({
  comparisons,
  currentStrategy,
  onSelectStrategy
}) => {
  const [expanded, setExpanded] = useState<SummarizationStrategy | null>(null);

  const sortedComparisons = useMemo(() => {
    return [...comparisons].sort((a, b) => {
      // Sort by overall score (combination of metrics)
      const scoreA = a.avgRepresentation * 0.4 + (1 - a.metrics.giniCoefficient) * 0.3 +
        (1 - Math.abs(a.metrics.distinctRepresentationGap)) * 0.3;
      const scoreB = b.avgRepresentation * 0.4 + (1 - b.metrics.giniCoefficient) * 0.3 +
        (1 - Math.abs(b.metrics.distinctRepresentationGap)) * 0.3;
      return scoreB - scoreA;
    });
  }, [comparisons]);

  const strategyInfo: Record<SummarizationStrategy, { icon: string; label: string; desc: string }> = {
    balanced: {
      icon: '⚖️',
      label: 'Balanced',
      desc: 'Equal weight to all perspectives'
    },
    diversity: {
      icon: '🌈',
      label: 'Diversity Focus',
      desc: 'Emphasizes minority viewpoints'
    },
    consensus: {
      icon: '🤝',
      label: 'Consensus Focus',
      desc: 'Highlights common ground'
    }
  };

  const getScoreColor = (score: number) => {
    if (score >= 0.7) return 'text-green-600';
    if (score >= 0.5) return 'text-amber-600';
    return 'text-red-600';
  };

  const getGiniLabel = (gini: number) => {
    if (gini <= 0.15) return { label: 'Low', color: 'bg-green-100 text-green-700' };
    if (gini <= 0.3) return { label: 'Moderate', color: 'bg-amber-100 text-amber-700' };
    return { label: 'High', color: 'bg-red-100 text-red-700' };
  };

  if (comparisons.length === 0) {
    return (
      <div className="bg-slate-50 border border-slate-200 rounded-xl p-6 text-center">
        <p className="text-slate-500">
          Strategy comparison requires running analysis with the comparison option enabled.
        </p>
      </div>
    );
  }

  const bestStrategy = sortedComparisons[0];

  return (
    <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
      {/* Header */}
      <div className="bg-gradient-to-r from-indigo-50 to-purple-50 px-6 py-4 border-b border-slate-200">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-indigo-100 rounded-full flex items-center justify-center">
              <span className="text-xl">🔄</span>
            </div>
            <div>
              <h3 className="font-bold text-slate-800">Strategy Comparison</h3>
              <p className="text-sm text-slate-500">
                Compare how different approaches affect representation
              </p>
            </div>
          </div>
          {bestStrategy && (
            <div className="text-right">
              <div className="text-xs text-slate-500 uppercase tracking-wider">Recommended</div>
              <div className="flex items-center gap-1 text-indigo-700 font-bold">
                <span>{strategyInfo[bestStrategy.strategy].icon}</span>
                <span>{strategyInfo[bestStrategy.strategy].label}</span>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Comparison Cards */}
      <div className="p-4 grid grid-cols-1 md:grid-cols-3 gap-4">
        {sortedComparisons.map((comparison, idx) => {
          const info = strategyInfo[comparison.strategy];
          const isSelected = comparison.strategy === currentStrategy;
          const isBest = idx === 0;
          const giniInfo = getGiniLabel(comparison.metrics.giniCoefficient);

          return (
            <div
              key={comparison.strategy}
              className={`relative rounded-xl border-2 transition-all cursor-pointer ${
                isSelected
                  ? 'border-indigo-500 bg-indigo-50/50 shadow-md'
                  : 'border-slate-200 hover:border-slate-300 hover:bg-slate-50'
              }`}
              onClick={() => onSelectStrategy?.(comparison.strategy)}
            >
              {/* Best badge */}
              {isBest && (
                <div className="absolute -top-2 -right-2 bg-green-500 text-white text-[10px] font-bold px-2 py-0.5 rounded-full shadow">
                  Best
                </div>
              )}

              {/* Card header */}
              <div className="p-4 border-b border-slate-100">
                <div className="flex items-center gap-2 mb-1">
                  <span className="text-2xl">{info.icon}</span>
                  <span className={`font-bold ${isSelected ? 'text-indigo-700' : 'text-slate-700'}`}>
                    {info.label}
                  </span>
                </div>
                <p className="text-xs text-slate-500">{info.desc}</p>
              </div>

              {/* Metrics */}
              <div className="p-4 space-y-3">
                {/* Avg Representation */}
                <div>
                  <div className="flex justify-between items-center mb-1">
                    <span className="text-xs text-slate-500">Avg Representation</span>
                    <span className={`font-bold ${getScoreColor(comparison.avgRepresentation)}`}>
                      {(comparison.avgRepresentation * 100).toFixed(0)}%
                    </span>
                  </div>
                  <div className="h-2 bg-slate-100 rounded-full overflow-hidden">
                    <div
                      className={`h-full rounded-full transition-all ${
                        comparison.avgRepresentation >= 0.7 ? 'bg-green-500' :
                        comparison.avgRepresentation >= 0.5 ? 'bg-amber-500' : 'bg-red-500'
                      }`}
                      style={{ width: `${comparison.avgRepresentation * 100}%` }}
                    />
                  </div>
                </div>

                {/* Gini */}
                <div className="flex justify-between items-center">
                  <span className="text-xs text-slate-500">Inequality</span>
                  <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${giniInfo.color}`}>
                    {giniInfo.label} ({comparison.metrics.giniCoefficient.toFixed(2)})
                  </span>
                </div>

                {/* Equity Gap */}
                <div className="flex justify-between items-center">
                  <span className="text-xs text-slate-500">Equity Gap</span>
                  <span className={`text-xs font-mono ${
                    Math.abs(comparison.metrics.distinctRepresentationGap) <= 0.1 ? 'text-green-600' : 'text-amber-600'
                  }`}>
                    {(comparison.metrics.distinctRepresentationGap * 100).toFixed(0)}%
                  </span>
                </div>
              </div>

              {/* Expand for summary preview */}
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  setExpanded(expanded === comparison.strategy ? null : comparison.strategy);
                }}
                className="w-full px-4 py-2 border-t border-slate-100 text-xs text-slate-500 hover:bg-slate-50 flex items-center justify-center gap-1"
              >
                <span>{expanded === comparison.strategy ? 'Hide' : 'Show'} Summary</span>
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  width="14"
                  height="14"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  className={`transition-transform ${expanded === comparison.strategy ? 'rotate-180' : ''}`}
                >
                  <polyline points="6 9 12 15 18 9"/>
                </svg>
              </button>

              {/* Expanded summary */}
              {expanded === comparison.strategy && (
                <div className="px-4 pb-4 animate-fadeIn">
                  <div className="bg-slate-50 rounded-lg p-3 text-sm text-slate-600 italic max-h-32 overflow-y-auto">
                    "{comparison.summary.slice(0, 300)}{comparison.summary.length > 300 ? '...' : ''}"
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Recommendation */}
      {bestStrategy?.recommendation && (
        <div className="px-6 py-4 bg-gradient-to-r from-green-50 to-emerald-50 border-t border-green-100">
          <div className="flex items-start gap-3">
            <div className="w-8 h-8 bg-green-100 rounded-full flex items-center justify-center flex-shrink-0">
              <span className="text-sm">💡</span>
            </div>
            <div>
              <div className="text-xs font-bold text-green-700 uppercase tracking-wider mb-1">
                Recommendation
              </div>
              <p className="text-sm text-green-800">{bestStrategy.recommendation}</p>
            </div>
          </div>
        </div>
      )}

      {/* Current selection indicator */}
      <div className="px-6 py-3 bg-slate-50 border-t border-slate-200 text-center">
        <span className="text-xs text-slate-500">
          Currently viewing: <span className="font-bold text-slate-700">{strategyInfo[currentStrategy].icon} {strategyInfo[currentStrategy].label}</span>
        </span>
      </div>
    </div>
  );
};

export default StrategyComparison;
