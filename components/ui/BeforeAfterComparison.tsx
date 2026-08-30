import React, { useMemo } from 'react';
import { AnalysisResult } from '../../types';
import { getRepresentationBands } from '../../constants';

interface BeforeAfterComparisonProps {
  before: AnalysisResult;
  after: AnalysisResult;
  onClose?: () => void;
}

interface ImprovementMetric {
  label: string;
  before: number;
  after: number;
  change: number;
  unit: string;
  isPositive: boolean; // Whether increase is good
  interpretation: string;
}

/**
 * Before/After Comparison Panel
 *
 * Shows descriptive changes after revision using a comparable embedding space.
 */
export const BeforeAfterComparison: React.FC<BeforeAfterComparisonProps> = ({
  before,
  after,
  onClose
}) => {
  const analysis = useMemo(() => {
    const bands = getRepresentationBands(before.embeddingTierUsed);
    const representationTarget = before.config.thresholds?.representationTarget ?? bands.target;
    const atRisk = bands.atRisk;
    const beforeEmbedding = before.runManifest?.actualEmbedding;
    const afterEmbedding = after.runManifest?.actualEmbedding;
    const comparableMethod = !!beforeEmbedding && !!afterEmbedding &&
      beforeEmbedding.provider === afterEmbedding.provider && beforeEmbedding.model === afterEmbedding.model;
    const eligible = (result: AnalysisResult) => result.participants.filter(
      participant => !participant.embeddingFailed && !participant.alignmentUnavailableReason
    );
    const beforeParticipants = eligible(before);
    const afterParticipants = eligible(after);

    // Calculate metrics
    const metrics: ImprovementMetric[] = [];

    // Avg Representation
    const avgBefore = beforeParticipants.reduce((s, p) => s + p.representationScore, 0) / Math.max(1, beforeParticipants.length);
    const avgAfter = afterParticipants.reduce((s, p) => s + p.representationScore, 0) / Math.max(1, afterParticipants.length);
    metrics.push({
      label: 'Average Alignment',
      before: avgBefore,
      after: avgAfter,
      change: avgAfter - avgBefore,
      unit: '%',
      isPositive: true,
      interpretation: avgAfter > avgBefore
        ? 'The mean strongest-sentence alignment score increased'
        : 'The mean strongest-sentence alignment score decreased'
    });

    // Well Represented Count
    const wellBefore = beforeParticipants.filter(p => p.representationScore >= representationTarget).length;
    const wellAfter = afterParticipants.filter(p => p.representationScore >= representationTarget).length;
    metrics.push({
      label: 'Above Reference',
      before: wellBefore,
      after: wellAfter,
      change: wellAfter - wellBefore,
      unit: '',
      isPositive: true,
      interpretation: wellAfter > wellBefore
        ? `${wellAfter - wellBefore} more record${wellAfter - wellBefore > 1 ? 's are' : ' is'} above the provisional reference`
        : wellAfter < wellBefore
          ? 'Fewer records are above the provisional reference'
          : 'Same number above the provisional reference'
    });

    // At Risk Count
    const atRiskBefore = beforeParticipants.filter(p => p.representationScore < atRisk).length;
    const atRiskAfter = afterParticipants.filter(p => p.representationScore < atRisk).length;
    metrics.push({
      label: 'Below Review Marker',
      before: atRiskBefore,
      after: atRiskAfter,
      change: atRiskAfter - atRiskBefore,
      unit: '',
      isPositive: false, // Lower is better
      interpretation: atRiskAfter < atRiskBefore
        ? `${atRiskBefore - atRiskAfter} fewer record${atRiskBefore - atRiskAfter > 1 ? 's' : ''} below the marker`
        : atRiskAfter > atRiskBefore
          ? 'More records are below the marker'
          : 'Same below-marker count'
    });

    // Gini Coefficient
    metrics.push({
      label: 'Inequality (Gini)',
      before: before.metrics.giniCoefficient,
      after: after.metrics.giniCoefficient,
      change: after.metrics.giniCoefficient - before.metrics.giniCoefficient,
      unit: '',
      isPositive: false, // Lower is better
      interpretation: after.metrics.giniCoefficient < before.metrics.giniCoefficient
        ? 'Alignment scores became more even'
        : 'Alignment scores became less even'
    });

    // Distinct-record alignment gap
    metrics.push({
      label: 'Distinct-record Gap',
      before: Math.abs(before.metrics.distinctRepresentationGap),
      after: Math.abs(after.metrics.distinctRepresentationGap),
      change: Math.abs(after.metrics.distinctRepresentationGap) - Math.abs(before.metrics.distinctRepresentationGap),
      unit: '%',
      isPositive: false, // Lower is better
      interpretation: Math.abs(after.metrics.distinctRepresentationGap) < Math.abs(before.metrics.distinctRepresentationGap)
        ? 'The absolute centroid-distant-quartile gap decreased'
        : 'The absolute centroid-distant-quartile gap increased'
    });

    // Find most improved participants
    const participantChanges = after.participants.map(afterP => {
      const beforeP = before.participants.find(b => b.id === afterP.id);
      return {
        id: afterP.id,
        text: afterP.originalText,
        before: beforeP?.representationScore || 0,
        after: afterP.representationScore,
        change: afterP.representationScore - (beforeP?.representationScore || 0)
      };
    });

    const mostImproved = participantChanges
      .filter(p => p.change > 0.05)
      .sort((a, b) => b.change - a.change)
      .slice(0, 5);

    const mostDeclined = participantChanges
      .filter(p => p.change < -0.05)
      .sort((a, b) => a.change - b.change)
      .slice(0, 3);

    // Overall improvement score
    const directions = metrics.map(metric => metric.isPositive ? metric.change : -metric.change);
    const favorableCount = directions.filter(change => change > 0).length;
    const unfavorableCount = directions.filter(change => change < 0).length;

    return {
      metrics,
      mostImproved,
      mostDeclined,
      favorableCount,
      unfavorableCount,
      comparableMethod,
      isImprovement: favorableCount > unfavorableCount,
    };
  }, [before, after]);

  const overallVerdict = !analysis.comparableMethod
    ? 'Embedding method changed; numeric deltas are not directly comparable.'
    : `${analysis.favorableCount} indicators moved favorably; ${analysis.unfavorableCount} moved unfavorably. Descriptive only—not a significance test.`;

  return (
    <div className="bg-white rounded-xl border border-slate-200 shadow-lg overflow-hidden">
      {/* Header */}
      <div className="px-6 py-4 border-b bg-gradient-to-r from-slate-50 to-blue-50 border-slate-200">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-full flex items-center justify-center bg-blue-100">
              <span className="text-xl">↔</span>
            </div>
            <div>
              <h3 className="font-bold text-slate-800">Descriptive Revision Comparison</h3>
              <p className="text-sm text-slate-600">
                {overallVerdict}
              </p>
            </div>
          </div>
          {onClose && (
            <button
              onClick={onClose}
              className="p-2 hover:bg-white/50 rounded-lg transition-colors"
            >
              <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-slate-400">
                <line x1="18" y1="6" x2="6" y2="18"/>
                <line x1="6" y1="6" x2="18" y2="18"/>
              </svg>
            </button>
          )}
        </div>
      </div>

      {/* Metrics Comparison */}
      <div className="p-6">
        {!analysis.comparableMethod && (
          <div className="mb-4 rounded-lg border border-amber-300 bg-amber-50 p-3 text-xs text-amber-900">
            The two runs used different embedding methods or models. Their score levels are not commensurable; inspect the text and re-run with one stable method before interpreting deltas.
          </div>
        )}
        <h4 className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-4">Key Metrics</h4>
        <div className="space-y-4">
          {analysis.metrics.map((metric) => {
            const improved = metric.isPositive ? metric.change > 0 : metric.change < 0;
            const declined = metric.isPositive ? metric.change < 0 : metric.change > 0;

            return (
              <div key={metric.label} className="bg-slate-50 rounded-lg p-4">
                <div className="flex items-center justify-between mb-2">
                  <span className="font-medium text-slate-700">{metric.label}</span>
                  <span className={`px-2 py-0.5 rounded-full text-xs font-bold ${
                    improved ? 'bg-green-100 text-green-700' :
                    declined ? 'bg-red-100 text-red-700' :
                    'bg-slate-200 text-slate-600'
                  }`}>
                    {improved ? '↑ Favored direction' : declined ? '↓ Opposite direction' : '→ Same'}
                  </span>
                </div>

                <div className="flex items-center gap-4">
                  {/* Before */}
                  <div className="flex-1">
                    <div className="text-xs text-slate-400 mb-1">Before</div>
                    <div className="text-lg font-bold text-slate-600">
                      {metric.unit === '%'
                        ? `${(metric.before * 100).toFixed(0)}%`
                        : typeof metric.before === 'number' && metric.before < 1
                          ? metric.before.toFixed(3)
                          : metric.before}
                    </div>
                  </div>

                  {/* Arrow */}
                  <div className={`text-2xl ${
                    improved ? 'text-green-500' : declined ? 'text-red-500' : 'text-slate-300'
                  }`}>
                    →
                  </div>

                  {/* After */}
                  <div className="flex-1">
                    <div className="text-xs text-slate-400 mb-1">After</div>
                    <div className={`text-lg font-bold ${
                      improved ? 'text-green-600' : declined ? 'text-red-600' : 'text-slate-600'
                    }`}>
                      {metric.unit === '%'
                        ? `${(metric.after * 100).toFixed(0)}%`
                        : typeof metric.after === 'number' && metric.after < 1
                          ? metric.after.toFixed(3)
                          : metric.after}
                    </div>
                  </div>

                  {/* Change */}
                  <div className="flex-1 text-right">
                    <div className="text-xs text-slate-400 mb-1">Change</div>
                    <div className={`text-lg font-bold ${
                      improved ? 'text-green-600' : declined ? 'text-red-600' : 'text-slate-400'
                    }`}>
                      {metric.change > 0 ? '+' : ''}
                      {metric.unit === '%'
                        ? `${(metric.change * 100).toFixed(1)}%`
                        : typeof metric.change === 'number' && Math.abs(metric.change) < 1
                          ? metric.change.toFixed(3)
                          : metric.change}
                    </div>
                  </div>
                </div>

                <p className="text-xs text-slate-500 mt-2">{metric.interpretation}</p>
              </div>
            );
          })}
        </div>
      </div>

      {/* Most Improved Participants */}
      {analysis.mostImproved.length > 0 && (
        <div className="px-6 pb-6">
          <h4 className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-3">
            Largest Alignment Increases ({analysis.mostImproved.length})
          </h4>
          <div className="space-y-2">
            {analysis.mostImproved.map((p) => (
              <div key={p.id} className="bg-green-50 border border-green-200 rounded-lg p-3">
                <div className="flex items-center justify-between mb-1">
                  <span className="font-medium text-green-800">{p.id}</span>
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-slate-500">
                      {(p.before * 100).toFixed(0)}%
                    </span>
                    <span className="text-green-600">→</span>
                    <span className="text-xs font-bold text-green-700">
                      {(p.after * 100).toFixed(0)}%
                    </span>
                    <span className="bg-green-200 text-green-800 text-xs px-1.5 py-0.5 rounded font-bold">
                      +{(p.change * 100).toFixed(0)}%
                    </span>
                  </div>
                </div>
                <p className="text-xs text-green-700 truncate">{p.text}</p>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Participants who declined (if any) */}
      {analysis.mostDeclined.length > 0 && (
        <div className="px-6 pb-6">
          <h4 className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-3">
            ⚠️ Watch Out - Score Decreased ({analysis.mostDeclined.length})
          </h4>
          <div className="space-y-2">
            {analysis.mostDeclined.map((p) => (
              <div key={p.id} className="bg-amber-50 border border-amber-200 rounded-lg p-3">
                <div className="flex items-center justify-between mb-1">
                  <span className="font-medium text-amber-800">{p.id}</span>
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-slate-500">
                      {(p.before * 100).toFixed(0)}%
                    </span>
                    <span className="text-amber-600">→</span>
                    <span className="text-xs font-bold text-amber-700">
                      {(p.after * 100).toFixed(0)}%
                    </span>
                    <span className="bg-amber-200 text-amber-800 text-xs px-1.5 py-0.5 rounded font-bold">
                      {(p.change * 100).toFixed(0)}%
                    </span>
                  </div>
                </div>
                <p className="text-xs text-amber-700 truncate">{p.text}</p>
              </div>
            ))}
          </div>
          <p className="text-xs text-amber-600 mt-2">
            Some records have lower semantic alignment after revision. Inspect their exact evidence before adopting the revision.
          </p>
        </div>
      )}

      {/* Summary text comparison */}
      <div className="px-6 pb-6">
        <h4 className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-3">
          Summary Comparison
        </h4>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <div className="text-xs text-slate-400 mb-2">Original Summary</div>
            <div className="bg-slate-50 rounded-lg p-3 text-sm text-slate-600 max-h-40 overflow-y-auto">
              {before.summary}
            </div>
          </div>
          <div>
            <div className="text-xs text-green-600 mb-2 font-medium">Revised Summary</div>
            <div className="bg-green-50 border border-green-200 rounded-lg p-3 text-sm text-slate-700 max-h-40 overflow-y-auto">
              {after.summary}
            </div>
          </div>
        </div>
      </div>

      {/* Footer */}
      <div className="px-6 py-4 bg-slate-50 border-t border-slate-200">
        <p className="text-xs text-slate-500 text-center">
          These are automated retrieval and distribution indicators, not proof of fairness or statistical improvement.
          Review the revised text and re-run the evidence audits before adopting it.
        </p>
      </div>
    </div>
  );
};

export default BeforeAfterComparison;
