import React from 'react';
import type { DiversityMetrics, EmbeddingProvider, ParticipantAnalysis, UncertaintyMetrics } from '../../types';
import { getRepresentationBands } from '../../constants';
import { Card } from './Card';
import { InfoIcon } from './MetricGlossary';

interface MetricsBannerProps {
  metrics: DiversityMetrics;
  participants: ParticipantAnalysis[];
  uncertaintyMetrics?: UncertaintyMetrics;
  embeddingTier?: EmbeddingProvider;
}

export function MetricsBanner({ metrics, participants, uncertaintyMetrics, embeddingTier }: MetricsBannerProps) {
  const validParticipants = participants.filter(participant =>
    !participant.embeddingFailed && !participant.alignmentUnavailableReason && Number.isFinite(participant.representationScore),
  );
  const avgScore = validParticipants.length
    ? validParticipants.reduce((total, participant) => total + participant.representationScore, 0) / validParticipants.length
    : null;
  const bands = getRepresentationBands(embeddingTier);
  const atRiskCount = validParticipants.filter(participant => participant.representationScore < bands.atRisk).length;
  const formatCI = (ci: { lower: number; upper: number }) => `[${ci.lower.toFixed(2)}, ${ci.upper.toFixed(2)}]`;

  return (
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
      <Card className="border-l-4 border-l-blue-500 hover:shadow-md transition-shadow metric-card" allowOverflow>
        <div className="text-slate-500 text-xs uppercase font-bold tracking-wider flex items-center">
          Avg Representation <InfoIcon metricKey="representation" />
        </div>
        <div className="text-2xl font-bold mt-1 text-blue-700">{avgScore === null ? '—' : avgScore.toFixed(2)}</div>
        <div className="text-xs mt-1 flex items-center gap-1 flex-wrap">
          <span className="px-1 rounded bg-blue-50 text-blue-700">Provisional reference: {'>'}{bands.target}</span>
          {uncertaintyMetrics?.avgRepresentationCI && (
            <span className="text-slate-400 text-[10px]">resampling range: {formatCI(uncertaintyMetrics.avgRepresentationCI)}</span>
          )}
        </div>
      </Card>
      <Card className="border-l-4 border-l-purple-500 hover:shadow-md transition-shadow metric-card" allowOverflow>
        <div className="text-slate-500 text-xs uppercase font-bold tracking-wider flex items-center">Gini Coefficient <InfoIcon metricKey="gini" /></div>
        <div className="text-2xl font-bold mt-1 text-purple-700">{metrics.giniCoefficient.toFixed(3)}</div>
        <div className="text-xs text-slate-500 mt-1 flex items-center gap-1 flex-wrap"><span>Descriptive spread of valid alignment scores</span></div>
      </Card>
      <Card className="border-l-4 border-l-amber-500 hover:shadow-md transition-shadow metric-card" allowOverflow>
        <div className="text-slate-500 text-xs uppercase font-bold tracking-wider flex items-center">Distinct-record Gap <InfoIcon metricKey="gap" /></div>
        <div className="text-2xl font-bold mt-1 text-amber-700">{metrics.distinctRepresentationGap.toFixed(2)}</div>
        <div className="text-xs text-slate-500 mt-1">Mean difference for the centroid-distant quartile</div>
      </Card>
      <Card className="border-l-4 border-l-teal-500 hover:shadow-md transition-shadow metric-card" allowOverflow>
        <div className="text-slate-500 text-xs uppercase font-bold tracking-wider flex items-center">Coverage Stats <InfoIcon metricKey="diversity" /></div>
        <div className="flex items-baseline gap-2 mt-1"><span className="text-2xl font-bold text-slate-800">{participants.length}</span><span className="text-sm text-slate-500">inputs</span></div>
        <div className="text-xs mt-1 flex items-center gap-2 flex-wrap">
          {atRiskCount > 0
            ? <span className="bg-red-100 text-red-700 px-1.5 rounded flex items-center gap-1">{atRiskCount} below review marker <InfoIcon metricKey="atRisk" /></span>
            : <span className="bg-slate-100 text-slate-700 px-1.5 rounded">None below marker</span>}
          <span className="text-slate-400">Div: {metrics.inputDiversity.toFixed(2)}</span>
        </div>
      </Card>
    </div>
  );
}
