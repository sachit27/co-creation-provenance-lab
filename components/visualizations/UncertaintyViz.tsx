import React from 'react';
import { UncertaintyMetrics } from '../../types';
import { useResponsiveChart, formatMetric } from '../../hooks/useResponsiveChart';
import { isHighUncertainty } from '../../services/uncertainty';
import { InfoIcon } from '../ui/MetricGlossary';

interface UncertaintyVizProps {
  data: UncertaintyMetrics;
}

interface ConfidenceIntervalBarProps {
  label: React.ReactNode;
  ci: { lower: number; upper: number; point: number };
  domain?: [number, number];
  colorScheme: 'blue' | 'purple' | 'amber';
  target?: number;
  showInterval?: boolean;
}

const ConfidenceIntervalBar: React.FC<ConfidenceIntervalBarProps> = ({
  label,
  ci,
  domain = [0, 1],
  colorScheme,
  target,
  showInterval = true,
}) => {
  const [min, max] = domain;
  const range = max - min;

  const toPercent = (value: number) => ((value - min) / range) * 100;

  const leftPercent = toPercent(ci.lower);
  const rightPercent = toPercent(ci.upper);
  const pointPercent = toPercent(ci.point);
  const widthPercent = rightPercent - leftPercent;

  const highUncertainty = isHighUncertainty(ci);

  const colors = {
    blue: { bg: 'bg-blue-100', bar: 'bg-blue-500', point: 'bg-blue-700', text: 'text-blue-700' },
    purple: { bg: 'bg-purple-100', bar: 'bg-purple-500', point: 'bg-purple-700', text: 'text-purple-700' },
    amber: { bg: 'bg-amber-100', bar: 'bg-amber-500', point: 'bg-amber-700', text: 'text-amber-700' }
  };

  const colorSet = colors[colorScheme];

  return (
    <div className="mb-4">
      <div className="flex justify-between items-center mb-1.5">
        <span className="text-sm font-medium text-slate-700">{label}</span>
        <div className="flex items-center gap-2">
          <span className={`font-mono font-bold ${colorSet.text}`}>
            {formatMetric(ci.point, 3)}
          </span>
          {highUncertainty && (
            <span className="text-[9px] bg-amber-100 text-amber-700 px-1.5 py-0.5 rounded">
              HIGH VARIANCE
            </span>
          )}
        </div>
      </div>

      {/* The bar visualization */}
      <div className="relative h-6 bg-slate-100 rounded-full overflow-hidden">
        {/* Target reference line */}
        {target !== undefined && (
          <div
            className="absolute top-0 bottom-0 w-0.5 bg-green-500 z-20"
            style={{ left: `${toPercent(target)}%` }}
          >
            <div className="absolute -top-5 left-1/2 -translate-x-1/2 text-[8px] text-green-600 whitespace-nowrap">
              target
            </div>
          </div>
        )}

        {/* Confidence interval range */}
        {showInterval && <div
            className={`absolute top-1 bottom-1 ${colorSet.bar} rounded-full opacity-40`}
            style={{ left: `${leftPercent}%`, width: `${widthPercent}%` }}
          />}

        {/* Point estimate marker */}
        <div
          className={`absolute top-0 bottom-0 w-1 ${colorSet.point} z-10`}
          style={{ left: `${pointPercent}%` }}
        />

        {/* Confidence interval whiskers */}
        {showInterval && <div
          className="absolute top-2 bottom-2 w-0.5 bg-slate-400"
          style={{ left: `${leftPercent}%` }}
        />}
        {showInterval && <div
          className="absolute top-2 bottom-2 w-0.5 bg-slate-400"
          style={{ left: `${rightPercent}%` }}
        />}
      </div>

      {/* CI text */}
      <div className="flex justify-between text-[10px] text-slate-500 mt-1">
        <span>{showInterval ? `95% resampling interval: [${formatMetric(ci.lower, 3)}, ${formatMetric(ci.upper, 3)}]` : 'Resampling interval unavailable (fewer than 3 records)'}</span>
        {showInterval && <span>Width: {formatMetric(ci.upper - ci.lower, 3)}</span>}
      </div>
    </div>
  );
};

export const UncertaintyViz: React.FC<UncertaintyVizProps> = ({ data }) => {
  const { containerRef, isCompact, isMobile } = useResponsiveChart({ minHeight: 300 });

  const hasResamplingInterval = data.bootstrapSamples > 0;

  return (
    <div ref={containerRef} className="w-full flex flex-col gap-4 p-3" style={{ minHeight: '350px' }}>
      {/* Header */}
      <div className="flex flex-wrap justify-between items-start gap-3">
        <div>
          <h3 className="text-sm font-bold text-slate-700 flex items-center">
            Participant-resampling stability <InfoIcon metricKey="bootstrap" />
          </h3>
          <p className="text-[10px] text-slate-500 mt-0.5">
            {hasResamplingInterval
              ? `${data.bootstrapSamples} bootstrap replicates · 95% percentile interval`
              : 'Point estimates only'}
          </p>
        </div>

        {!hasResamplingInterval && (
          <div className="bg-amber-50 border border-amber-200 rounded px-2 py-1 text-[10px] text-amber-700">
            Fewer than 3 records — no resampling interval
          </div>
        )}
      </div>

      {/* Metrics with CI bars */}
      <div className="space-y-6 flex-1">
        <ConfidenceIntervalBar
          label={<>Mean semantic-alignment estimate <InfoIcon metricKey="representation" /></>}
          ci={data.avgRepresentationCI}
          colorScheme="blue"
          showInterval={hasResamplingInterval}
        />

        <ConfidenceIntervalBar
          label={<>Gini of alignment estimates <InfoIcon metricKey="gini" /></>}
          ci={data.giniCI}
          colorScheme="purple"
          showInterval={hasResamplingInterval}
        />

        <ConfidenceIntervalBar
          label={<>Distinct-to-central alignment gap <InfoIcon metricKey="gap" /></>}
          ci={data.gapCI}
          domain={[-0.5, 0.5]}
          colorScheme="amber"
          target={0}
          showInterval={hasResamplingInterval}
        />
      </div>

      {/* Interpretation Guide */}
      <div className="bg-slate-50 rounded-lg p-3 border border-slate-200">
        <div className="text-[10px] font-bold text-slate-600 uppercase mb-2">What this does—and does not—show</div>
        <p className="text-[10px] text-slate-600 leading-relaxed">
          These intervals reweight the observed records to show descriptive sensitivity to participant composition.
          They are not population confidence intervals unless recruitment can be treated as an IID sample, and they do
          not include model, prompt, embedding, or measurement uncertainty. Narrow intervals therefore do not establish fairness.
        </p>
      </div>

      {/* Legend */}
      <div className="flex flex-wrap gap-4 text-[10px] text-slate-500 justify-center">
        <span className="flex items-center gap-1">
          <span className="w-3 h-1 bg-slate-600 rounded"></span>
          Point Estimate
        </span>
        <span className="flex items-center gap-1">
          <span className="w-3 h-3 bg-blue-500/40 rounded"></span>
          95% participant-resampling interval
        </span>
        <span className="flex items-center gap-1">
          <span className="w-1 h-3 bg-green-500"></span>
          Target Value
        </span>
      </div>
    </div>
  );
};

export default UncertaintyViz;
