import React, { useMemo } from 'react';
import { AnalysisResult } from '../../types';
import { ANALYSIS_CONFIG } from '../../constants';
import { generateRecommendations } from '../../services/plainLanguage';

interface ExecutiveSummaryProps {
  data: AnalysisResult;
  onViewDetails?: (tab: string) => void;
  onExportReport?: () => void;
  onRevise?: () => void;
  isRevising?: boolean;
}

/**
 * Executive Summary Card
 *
 * Provides a single, glanceable summary of the representation audit.
 * Designed for decision-makers who need quick answers.
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
    const total = participants.length;

    // Thresholds from config — using documented interpretation bands
    const { representationTarget } = ANALYSIS_CONFIG.thresholds;
    const { atRisk: atRiskThreshold, low: lowThreshold } = ANALYSIS_CONFIG.representationInterpretation;

    // Calculate key metrics
    const avgScore = participants.reduce((sum, p) => sum + p.representationScore, 0) / total;
    const wellRepresented = participants.filter(p => p.representationScore >= representationTarget).length;

    // At Risk: score < 0.3 — genuinely at risk of being completely missed.
    // Uses the documented atRisk threshold from representationInterpretation.
    const atRiskCount = participants.filter(p => p.representationScore < atRiskThreshold).length;

    // Blind spots: unique perspectives that were genuinely missed.
    // Requires BOTH conditions:
    //   1. Below-median centrality (peripheral/unique perspective)
    //   2. Score below the "low" threshold (0.5) — genuinely underrepresented
    //
    // This avoids the purely relative median-quadrant approach which always
    // produces ~25% "blind spots" even when all participants are well represented.
    // The BlindSpotPlot uses median quadrants for VISUALIZATION (coloring dots),
    // but this count uses absolute thresholds for a meaningful headline metric.
    const centralityScores = participants.map(p => 1 - p.semanticIsolation).sort((a, b) => a - b);
    const mid = Math.floor(total / 2);
    const medianCentrality = centralityScores[mid];

    const blindSpots = participants.filter(p => {
      const centrality = 1 - p.semanticIsolation;
      return centrality < medianCentrality && p.representationScore < lowThreshold;
    });

    // Calculate overall score (0-100)
    // Weighted: 40% avg representation, 30% coverage, 30% equity
    const coverageScore = (wellRepresented / total);
    const equityScore = 1 - data.metrics.giniCoefficient;
    const overallScore = Math.round(
      (avgScore * 0.4 + coverageScore * 0.3 + equityScore * 0.3) * 100
    );

    // Determine status
    let status: 'good' | 'moderate' | 'poor';
    let statusLabel: string;
    let statusColor: string;

    if (overallScore >= 75) {
      status = 'good';
      statusLabel = 'GOOD';
      statusColor = 'text-green-600';
    } else if (overallScore >= 55) {
      status = 'moderate';
      statusLabel = 'MODERATE';
      statusColor = 'text-amber-600';
    } else {
      status = 'poor';
      statusLabel = 'NEEDS ATTENTION';
      statusColor = 'text-red-600';
    }

    // Identify top concerns
    const concerns: { type: string; description: string; severity: 'high' | 'medium' }[] = [];

    if (atRiskCount > 0) {
      concerns.push({
        type: 'at-risk',
        description: `${atRiskCount} participant${atRiskCount > 1 ? 's' : ''} at risk of being completely missed`,
        severity: 'high'
      });
    }

    if (blindSpots.length > 0) {
      concerns.push({
        type: 'blind-spots',
        description: `${blindSpots.length} distinct perspective${blindSpots.length > 1 ? 's' : ''} not captured in summary`,
        severity: 'high'
      });
    }

    if (data.metrics.giniCoefficient > ANALYSIS_CONFIG.giniInterpretation.moderate) {
      concerns.push({
        type: 'inequality',
        description: 'High inequality in how voices are represented',
        severity: 'medium'
      });
    }

    if (data.metrics.distinctRepresentationGap > 0.15) {
      concerns.push({
        type: 'gap',
        description: 'Mainstream opinions favored over unique perspectives',
        severity: 'medium'
      });
    }

    // Find most underrepresented topics (by cluster)
    const clusterScores = data.clusters.map(cluster => {
      const members = participants.filter(p => p.clusterId === cluster.id);
      const avgRep = members.reduce((sum, p) => sum + p.representationScore, 0) / members.length;
      return { cluster, avgRep, count: members.length };
    }).sort((a, b) => a.avgRep - b.avgRep);

    const weakestCluster = clusterScores[0];

    return {
      total,
      wellRepresented,
      atRiskCount,
      blindSpots,
      avgScore,
      overallScore,
      status,
      statusLabel,
      statusColor,
      concerns,
      weakestCluster,
      gini: data.metrics.giniCoefficient
    };
  }, [data]);

  // Progress bar color
  const getProgressColor = (score: number) => {
    if (score >= 75) return 'bg-green-500';
    if (score >= 55) return 'bg-amber-500';
    return 'bg-red-500';
  };

  return (
    <div className="bg-gradient-to-br from-slate-900 to-slate-800 rounded-2xl shadow-xl border border-slate-700 overflow-hidden">
      {/* Header */}
      <div className="px-6 py-4 border-b border-slate-700 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-full bg-blue-500/20 flex items-center justify-center">
            <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-blue-400">
              <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
              <path d="m9 12 2 2 4-4" />
            </svg>
          </div>
          <div>
            <h2 className="text-white font-bold text-lg">Representation Audit</h2>
            <p className="text-slate-400 text-xs">{data.config.datasetName} • {analysis.total} participants</p>
          </div>
        </div>
        <div className={`text-right`}>
          <div className={`text-3xl font-bold ${analysis.statusColor}`}>{analysis.overallScore}<span className="text-lg text-slate-500">/100</span></div>
          <div className={`text-xs font-bold ${analysis.statusColor}`}>{analysis.statusLabel}</div>
          <div className="text-[10px] text-slate-500">Overall Score</div>
        </div>
      </div>

      {/* Score Bar */}
      <div className="px-6 py-3 bg-slate-800/50">
        <div className="flex items-center gap-4">
          <div className="flex-1">
            <div className="h-3 bg-slate-700 rounded-full overflow-hidden">
              <div
                className={`h-full ${getProgressColor(analysis.overallScore)} transition-all duration-500`}
                style={{ width: `${analysis.overallScore}%` }}
              />
            </div>
          </div>
          <div className="text-slate-400 text-xs whitespace-nowrap">
            {analysis.overallScore < 55 && '⚠️ '}
            {analysis.overallScore >= 75 ? 'Excellent' : analysis.overallScore >= 55 ? 'Acceptable' : 'Review needed'}
          </div>
        </div>
      </div>

      {/* Key Stats */}
      <div className="grid grid-cols-3 divide-x divide-slate-700 border-b border-slate-700">
        <div className="p-4 text-center">
          <div className="text-2xl font-bold text-green-400">{analysis.wellRepresented}</div>
          <div className="text-xs text-slate-400">Well Represented</div>
          <div className="text-[10px] text-slate-500">of {analysis.total} participants</div>
        </div>
        <div className="p-4 text-center">
          <div className={`text-2xl font-bold ${analysis.atRiskCount > 0 ? 'text-red-400' : 'text-green-400'}`}>
            {analysis.atRiskCount}
          </div>
          <div className="text-xs text-slate-400">At Risk</div>
          <div className="text-[10px] text-slate-500">may be missed</div>
        </div>
        <div className="p-4 text-center">
          <div className={`text-2xl font-bold ${analysis.blindSpots.length > 0 ? 'text-amber-400' : 'text-green-400'}`}>
            {analysis.blindSpots.length}
          </div>
          <div className="text-xs text-slate-400">Blind Spots</div>
          <div className="text-[10px] text-slate-500">unique voices missed</div>
        </div>
      </div>

      {/* Concerns */}
      {analysis.concerns.length > 0 && (
        <div className="px-6 py-4 border-b border-slate-700">
          <div className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-3">Key Concerns</div>
          <div className="space-y-2">
            {analysis.concerns.slice(0, 3).map((concern, i) => (
              <div
                key={i}
                className={`flex items-start gap-2 text-sm ${concern.severity === 'high' ? 'text-red-300' : 'text-amber-300'
                  }`}
              >
                <span className="mt-0.5">{concern.severity === 'high' ? '⚠️' : '⚡'}</span>
                <span>{concern.description}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Actionable Recommendations */}
      {(() => {
        const recs = generateRecommendations(data.participants, data.metrics);
        return recs.length > 0 ? (
          <div className="px-6 py-4 border-b border-slate-700 bg-emerald-900/20">
            <div className="text-xs font-bold text-emerald-400 uppercase tracking-wider mb-3">
              ✅ Recommended Actions
            </div>
            <div className="space-y-2">
              {recs.slice(0, 4).map((rec, i) => (
                <div key={i} className="flex items-start gap-2 text-sm text-emerald-200">
                  <span className="mt-0.5 text-emerald-500 flex-shrink-0">→</span>
                  <span>{rec}</span>
                </div>
              ))}
            </div>
          </div>
        ) : null;
      })()}

      {/* Plain Language Summary */}
      <div className="px-6 py-4 bg-slate-800/30">
        <div className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-2">Summary</div>
        <p className="text-slate-300 text-sm leading-relaxed">
          {analysis.overallScore >= 75 ? (
            <>
              The AI summary <span className="text-green-400 font-medium">adequately represents</span> the majority of participant voices.
              {analysis.wellRepresented} out of {analysis.total} contributions are well-captured.
              {analysis.concerns.length === 0 && ' No significant concerns detected.'}
            </>
          ) : analysis.overallScore >= 55 ? (
            <>
              The summary captures most perspectives but <span className="text-amber-400 font-medium">some voices may be underrepresented</span>.
              {analysis.atRiskCount > 0 && ` ${analysis.atRiskCount} participant${analysis.atRiskCount > 1 ? 's are' : ' is'} at risk of being missed.`}
              {analysis.blindSpots.length > 0 && ` ${analysis.blindSpots.length} unique perspective${analysis.blindSpots.length > 1 ? 's were' : ' was'} not captured.`}
            </>
          ) : (
            <>
              <span className="text-red-400 font-medium">Significant representation gaps detected.</span>
              {' '}The summary may not fairly represent all participant voices.
              {analysis.atRiskCount > 0 && ` ${analysis.atRiskCount} participant${analysis.atRiskCount > 1 ? 's are' : ' is'} at risk of being completely missed.`}
              {' '}Review recommended before using this summary for decision-making.
            </>
          )}
        </p>
      </div>

      {/* Actions */}
      <div className="px-6 py-4 flex gap-3 flex-wrap">
        <button
          onClick={() => onViewDetails?.('blindspot')}
          className="flex-1 bg-slate-700 hover:bg-slate-600 text-white text-sm font-medium py-2.5 px-4 rounded-lg transition-colors flex items-center justify-center gap-2"
        >
          <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
            <circle cx="12" cy="12" r="3" />
          </svg>
          View Details
        </button>
        {onRevise && (
          <button
            onClick={onRevise}
            disabled={isRevising}
            className="flex-1 bg-emerald-600 hover:bg-emerald-500 disabled:bg-slate-600 disabled:cursor-wait text-white text-sm font-medium py-2.5 px-4 rounded-lg transition-colors flex items-center justify-center gap-2"
          >
            {isRevising ? (
              <>
                <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="animate-spin">
                  <path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 12" /><path d="M3 3v9h9" />
                </svg>
                Revising…
              </>
            ) : (
              <>
                <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
                  <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
                </svg>
                Revise Summary
              </>
            )}
          </button>
        )}
        {onExportReport && (
          <button
            onClick={onExportReport}
            className="flex-1 bg-blue-600 hover:bg-blue-500 text-white text-sm font-medium py-2.5 px-4 rounded-lg transition-colors flex items-center justify-center gap-2"
          >
            <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
              <polyline points="7 10 12 15 17 10" />
              <line x1="12" y1="15" x2="12" y2="3" />
            </svg>
            Export Report
          </button>
        )}
      </div>
    </div>
  );
};

export default ExecutiveSummary;
