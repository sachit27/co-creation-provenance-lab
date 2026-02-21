import React from 'react';
import { UncertaintyMetrics } from '../../types';
import { useResponsiveChart, formatMetric } from '../../hooks/useResponsiveChart';
import { formatCI, isHighUncertainty } from '../../services/uncertainty';
import { ANALYSIS_CONFIG } from '../../constants';
import { InfoIcon } from '../ui/MetricGlossary';

interface UncertaintyVizProps {
  data: UncertaintyMetrics;
}

interface ConfidenceIntervalBarProps {
  label: string;
  ci: { lower: number; upper: number; point: number };
  domain?: [number, number];
  colorScheme: 'blue' | 'purple' | 'amber';
  target?: number;
  inverted?: boolean;
}

const ConfidenceIntervalBar: React.FC<ConfidenceIntervalBarProps> = ({
  label,
  ci,
  domain = [0, 1],
  colorScheme,
  target,
  inverted = false
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

  // Determine if value is good or concerning
  const isGood = inverted
    ? ci.point <= (target || 0.5)
    : ci.point >= (target || 0.5);

  return (
    <div className="mb-4">
      <div className="flex justify-between items-center mb-1.5">
        <span className="text-sm font-medium text-slate-700">{label}</span>
        <div className="flex items-center gap-2">
          <span className={`font-mono font-bold ${isGood ? 'text-green-600' : 'text-red-600'}`}>
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
        <div
          className={`absolute top-1 bottom-1 ${colorSet.bar} rounded-full opacity-40`}
          style={{
            left: `${leftPercent}%`,
            width: `${widthPercent}%`
          }}
        />

        {/* Point estimate marker */}
        <div
          className={`absolute top-0 bottom-0 w-1 ${colorSet.point} z-10`}
          style={{ left: `${pointPercent}%` }}
        />

        {/* Confidence interval whiskers */}
        <div
          className="absolute top-2 bottom-2 w-0.5 bg-slate-400"
          style={{ left: `${leftPercent}%` }}
        />
        <div
          className="absolute top-2 bottom-2 w-0.5 bg-slate-400"
          style={{ left: `${rightPercent}%` }}
        />
      </div>

      {/* CI text */}
      <div className="flex justify-between text-[10px] text-slate-500 mt-1">
        <span>95% CI: [{formatMetric(ci.lower, 3)}, {formatMetric(ci.upper, 3)}]</span>
        <span>Width: {formatMetric(ci.upper - ci.lower, 3)}</span>
      </div>
    </div>
  );
};

export const UncertaintyViz: React.FC<UncertaintyVizProps> = ({ data }) => {
  const { containerRef, isCompact, isMobile } = useResponsiveChart({ minHeight: 300 });

  // Use config thresholds for interpretation
  const { representationTarget } = ANALYSIS_CONFIG.thresholds;
  const { low: giniLow, moderate: giniModerate } = ANALYSIS_CONFIG.giniInterpretation;

  const hasEnoughSamples = data.bootstrapSamples >= 50;

  return (
    <div ref={containerRef} className="w-full flex flex-col gap-4 p-3" style={{ minHeight: '350px' }}>
      {/* Header */}
      <div className="flex flex-wrap justify-between items-start gap-3">
        <div>
          <h3 className="text-sm font-bold text-slate-700 flex items-center">
            Uncertainty Quantification <InfoIcon metricKey="bootstrap" />
          </h3>
          <p className="text-[10px] text-slate-500 mt-0.5">
            Bootstrap confidence intervals ({data.bootstrapSamples} samples, 95% CI)
          </p>
        </div>

        {!hasEnoughSamples && (
          <div className="bg-amber-50 border border-amber-200 rounded px-2 py-1 text-[10px] text-amber-700">
            ⚠️ Low sample count - estimates may be unreliable
          </div>
        )}
      </div>

      {/* Metrics with CI bars */}
      <div className="space-y-6 flex-1">
        <ConfidenceIntervalBar
          label="Average Representation"
          ci={data.avgRepresentationCI}
          colorScheme="blue"
          target={representationTarget}
        />

        <ConfidenceIntervalBar
          label="Gini Coefficient (Inequality)"
          ci={data.giniCI}
          colorScheme="purple"
          target={giniLow}
          inverted={true}
        />

        <ConfidenceIntervalBar
          label="Equity Gap (Majority vs Distinct)"
          ci={data.gapCI}
          domain={[-0.5, 0.5]}
          colorScheme="amber"
          target={0}
        />
      </div>

      {/* Interpretation Guide */}
      <div className="bg-slate-50 rounded-lg p-3 border border-slate-200">
        <div className="text-[10px] font-bold text-slate-600 uppercase mb-2">Interpretation</div>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3 text-[10px]">
          <div>
            <span className="font-medium text-blue-700">Avg Representation</span>
            <p className="text-slate-500 mt-0.5">
              {data.avgRepresentationCI.point >= representationTarget
                ? '✓ Good coverage overall'
                : '⚠️ Below target - some voices may be missed'}
            </p>
          </div>
          <div>
            <span className="font-medium text-purple-700">Gini Coefficient</span>
            <p className="text-slate-500 mt-0.5">
              {data.giniCI.point <= giniLow
                ? '✓ Low inequality'
                : data.giniCI.point <= giniModerate
                  ? '⚡ Moderate inequality'
                  : '⚠️ High inequality detected'}
            </p>
          </div>
          <div>
            <span className="font-medium text-amber-700">Equity Gap</span>
            <p className="text-slate-500 mt-0.5">
              {Math.abs(data.gapCI.point) <= 0.1
                ? '✓ Fair coverage across groups'
                : data.gapCI.point > 0
                  ? '⚠️ Distinct voices underrepresented'
                  : '⚡ Unusual: distinct voices overrepresented'}
            </p>
          </div>
        </div>
      </div>

      {/* Legend */}
      <div className="flex flex-wrap gap-4 text-[10px] text-slate-500 justify-center">
        <span className="flex items-center gap-1">
          <span className="w-3 h-1 bg-slate-600 rounded"></span>
          Point Estimate
        </span>
        <span className="flex items-center gap-1">
          <span className="w-3 h-3 bg-blue-500/40 rounded"></span>
          95% Confidence Interval
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
