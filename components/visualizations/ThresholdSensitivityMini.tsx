import React from 'react';
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, ReferenceLine } from 'recharts';
import { ThresholdSensitivityAnalysis } from '../../types';

interface ThresholdSensitivityMiniProps {
  data: ThresholdSensitivityAnalysis;
  currentThreshold: number;
  thresholdType: 'representation' | 'isolation';
}

export const ThresholdSensitivityMini: React.FC<ThresholdSensitivityMiniProps> = ({
  data,
  currentThreshold,
  thresholdType
}) => {
  const curveData = thresholdType === 'representation'
    ? data.representationCurve
    : data.isolationCurve;

  const CustomTooltip = ({ active, payload }: any) => {
    if (active && payload && payload.length) {
      const d = payload[0].payload;
      return (
        <div className="bg-slate-800 text-white text-[10px] px-2 py-1 rounded shadow-lg">
          <div>Threshold: {d.threshold.toFixed(2)}</div>
          <div>Affected: {d.affectedCount} participants</div>
        </div>
      );
    }
    return null;
  };

  return (
    <div className="h-20 w-full">
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={curveData} margin={{ top: 5, right: 5, bottom: 5, left: 5 }}>
          <XAxis
            dataKey="threshold"
            tick={false}
            axisLine={{ stroke: '#e2e8f0' }}
          />
          <YAxis hide />
          <Tooltip content={<CustomTooltip />} />

          <ReferenceLine
            x={currentThreshold}
            stroke="#3b82f6"
            strokeWidth={2}
            strokeDasharray="3 3"
          />

          <Line
            type="monotone"
            dataKey="affectedCount"
            stroke="#94a3b8"
            strokeWidth={2}
            dot={false}
            activeDot={{ r: 3, fill: '#3b82f6' }}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
};

// Generate sensitivity curve data
export const generateThresholdSensitivityData = (
  representationScores: number[],
  isolationScores: number[]
): ThresholdSensitivityAnalysis => {
  const thresholds = Array.from({ length: 20 }, (_, i) => 0.1 + i * 0.045);

  const representationCurve = thresholds.map(threshold => ({
    threshold,
    metricValue: threshold,
    affectedCount: representationScores.filter(s => s < threshold).length
  }));

  const isolationCurve = thresholds.map(threshold => ({
    threshold,
    metricValue: threshold,
    affectedCount: isolationScores.filter(s => s > threshold).length
  }));

  return { representationCurve, isolationCurve };
};

// Compact threshold impact display
interface ThresholdImpactProps {
  thresholds: {
    representationTarget: number;
    matchingThreshold: number;
  };
  representationScores: number[];
}

export const ThresholdImpactBadges: React.FC<ThresholdImpactProps> = ({
  thresholds,
  representationScores
}) => {
  const atRiskCount = representationScores.filter(s => s < thresholds.representationTarget).length;
  const atRiskPercent = ((atRiskCount / representationScores.length) * 100).toFixed(0);

  const wellRepCount = representationScores.filter(s => s >= thresholds.representationTarget).length;
  const wellRepPercent = ((wellRepCount / representationScores.length) * 100).toFixed(0);

  return (
    <div className="flex gap-2 text-[10px]">
      <span className="px-2 py-0.5 bg-red-100 text-red-700 rounded-full">
        {atRiskCount} at-risk ({atRiskPercent}%)
      </span>
      <span className="px-2 py-0.5 bg-green-100 text-green-700 rounded-full">
        {wellRepCount} well-represented ({wellRepPercent}%)
      </span>
    </div>
  );
};

export default ThresholdSensitivityMini;
