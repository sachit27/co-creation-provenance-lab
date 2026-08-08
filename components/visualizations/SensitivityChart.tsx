import React, { useState } from 'react';
import { SensitivityResult } from '../../types';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell, CartesianGrid, ReferenceLine, Label } from 'recharts';
import { useResponsiveChart, truncateText, calculateDynamicHeight, formatMetric } from '../../hooks/useResponsiveChart';
import { InfoIcon } from '../ui/MetricGlossary';

interface SensitivityChartProps {
  data: SensitivityResult[];
}

export const SensitivityChart: React.FC<SensitivityChartProps> = ({ data }) => {
  const [showAll, setShowAll] = useState(false);

  // Sorting: Highest leverage first
  const sortedData = [...data].sort((a, b) => b.shiftScore - a.shiftScore);
  const displayData = showAll ? sortedData : sortedData.slice(0, 15);

  // Count high-leverage participants
  const dominantCount = data.filter(d => d.shiftScore > 2).length;
  const driverCount = data.filter(d => d.shiftScore > 1 && d.shiftScore <= 2).length;

  const { containerRef, config, isCompact, isMobile, width } = useResponsiveChart({
    minHeight: 320,
    dataLength: displayData.length,
    hasYAxisLabels: true,
    hasLongLabels: true
  });

  // Dynamic height based on data length
  const chartHeight = calculateDynamicHeight(displayData.length, 32, 320, 650);

  // Dynamic bar size
  const barSize = Math.max(14, Math.min(26, Math.floor(chartHeight / (displayData.length * 1.4))));

  // Dynamic Y-axis width based on label lengths
  const maxLabelLength = Math.max(...displayData.map(d => d.participantId.length));
  const yAxisWidth = Math.min(
    isCompact ? 70 : 100,
    Math.max(isCompact ? 50 : 70, maxLabelLength * (isCompact ? 5 : 6))
  );

  const CustomTooltip = ({ active, payload }: any) => {
    if (active && payload && payload.length) {
      const d = payload[0].payload;
      const isDominant = d.shiftScore > 2;
      const isDriver = d.shiftScore > 1;
      return (
        <div
          className="bg-white p-3 border border-slate-200 shadow-xl rounded-lg text-xs z-50"
          style={{ maxWidth: config.tooltipMaxWidth }}
        >
          <div className="flex justify-between items-center gap-2 mb-2 border-b pb-2">
            <span className="font-bold text-slate-800 truncate">{d.participantId}</span>
            {isDominant && (
              <span className="text-[9px] bg-rose-100 text-rose-700 px-1.5 py-0.5 rounded font-bold">DOMINANT</span>
            )}
          </div>
          <div className="grid grid-cols-2 gap-y-1.5 bg-slate-50 p-2 rounded">
            <span className="text-slate-500">Z-Score:</span>
            <span className={`font-mono font-bold text-right ${isDominant ? 'text-rose-600' : isDriver ? 'text-rose-500' : 'text-slate-600'}`}>
              {formatMetric(d.shiftScore)}σ
            </span>
            <span className="text-slate-500">Vector Shift:</span>
            <span className="font-mono text-slate-600 text-right">{formatMetric(d.semanticDelta, 4)}</span>
          </div>

          <div className={`mt-2 pt-2 border-t text-[10px] ${isDominant ? 'text-rose-600 font-semibold' : 'text-slate-500'}`}>
            {isDominant
              ? '⚠️ High leverage: Disproportionate influence on summary'
              : isDriver
                ? '📊 Above-average influence on semantic direction'
                : '✓ Average contribution to semantic center'}
          </div>
        </div>
      );
    }
    return null;
  };

  return (
    <div ref={containerRef} className="flex-1 min-h-[320px] w-full flex flex-col">
      {/* Header */}
      <div className="mb-4 bg-rose-50 border border-rose-100 p-3 md:p-4 rounded-lg shadow-sm">
        <div className="flex flex-wrap items-start gap-3">
          <div className="text-2xl hidden md:block">⚖️</div>
          <div className="flex-1 min-w-[200px]">
            <div className="flex flex-wrap justify-between items-center gap-2 mb-2">
              <strong className="text-sm text-rose-900">Semantic Leverage (LOO Z-Score) <InfoIcon metricKey="leverage" /></strong>
              <button
                onClick={() => setShowAll(!showAll)}
                className="text-[10px] font-bold bg-white border border-rose-200 px-2 py-1 rounded hover:bg-rose-100 transition-colors shadow-sm whitespace-nowrap"
              >
                {showAll ? 'Show Top 15' : `Show All (${data.length})`}
              </button>
            </div>
            {!isMobile && (
              <p className="text-xs text-rose-800/80 mb-2">
                Identifies participants with <strong>disproportionate influence</strong> on the summary direction.
              </p>
            )}
            <div className="flex flex-wrap gap-3 text-[10px]">
              <span className="flex items-center gap-1.5">
                <span className="w-2.5 h-2.5 rounded-full bg-slate-400"></span>
                <span className="text-rose-800/70">Average (~0σ)</span>
              </span>
              <span className="flex items-center gap-1.5">
                <span className="w-2.5 h-2.5 rounded-full bg-rose-400"></span>
                <span className="text-rose-800/70">Driver (&gt;1σ)</span>
              </span>
              <span className="flex items-center gap-1.5">
                <span className="w-2.5 h-2.5 rounded-full bg-rose-700"></span>
                <span className="text-rose-800/70">Dominant (&gt;2σ)</span>
              </span>
            </div>
          </div>

          {/* Quick stats */}
          {(dominantCount > 0 || driverCount > 0) && (
            <div className="flex gap-2">
              {dominantCount > 0 && (
                <div className="bg-rose-100 border border-rose-200 rounded-lg px-3 py-2 text-center">
                  <div className="text-rose-700 font-bold text-lg">{dominantCount}</div>
                  <div className="text-rose-600 text-[10px] font-medium">Dominant</div>
                </div>
              )}
              {driverCount > 0 && (
                <div className="bg-rose-50 border border-rose-200 rounded-lg px-3 py-2 text-center">
                  <div className="text-rose-600 font-bold text-lg">{driverCount}</div>
                  <div className="text-rose-500 text-[10px] font-medium">Drivers</div>
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Chart */}
      <div className="flex-1 min-h-0 overflow-y-auto custom-scrollbar bg-white rounded-lg border border-slate-200 shadow-sm">
        <ResponsiveContainer width="100%" height={chartHeight}>
          <BarChart
            layout="vertical"
            data={displayData}
            margin={{
              top: 15,
              right: isCompact ? 20 : 35,
              left: 10,
              bottom: 20
            }}
          >
            <CartesianGrid strokeDasharray="3 3" horizontal={false} vertical={true} stroke="#f1f5f9" />

            <XAxis
              type="number"
              domain={[0, 'auto']}
              tick={{ fontSize: config.tickFontSize, fill: '#64748b' }}
              tickFormatter={(v) => `${formatMetric(v, 1)}σ`}
              axisLine={{ stroke: '#cbd5e1' }}
            >
              <Label
                value={isCompact ? 'Influence (σ)' : 'Semantic Influence (Standard Deviations)'}
                position="bottom"
                offset={5}
                style={{
                  fontSize: config.fontSize,
                  fill: '#475569',
                  fontWeight: 500
                }}
              />
            </XAxis>

            <YAxis
              dataKey="participantId"
              type="category"
              width={yAxisWidth}
              tick={{
                fontSize: config.tickFontSize,
                fontWeight: 500,
                fill: '#374151'
              }}
              tickFormatter={(value) => truncateText(value, isCompact ? 8 : 12, true)}
              interval={0}
              axisLine={{ stroke: '#e2e8f0' }}
            />

            <Tooltip content={<CustomTooltip />} cursor={{ fill: '#fef2f2' }} />

            <ReferenceLine
              x={1}
              stroke="#fda4af"
              strokeDasharray="4 4"
              strokeWidth={1.5}
            />
            <ReferenceLine
              x={2}
              stroke="#be123c"
              strokeDasharray="4 4"
              strokeWidth={1.5}
            />

            <Bar dataKey="shiftScore" barSize={barSize} radius={[0, 4, 4, 0]}>
              {displayData.map((entry, index) => (
                <Cell
                  key={`cell-${index}`}
                  fill={entry.shiftScore > 2 ? '#be123c' : entry.shiftScore > 1 ? '#fb7185' : '#cbd5e1'}
                />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>

      {/* Footer note */}
      <div className="mt-2 text-[10px] text-slate-500 px-1">
        <strong>LOO Analysis:</strong> Measures how much removing each participant shifts the semantic center.
        Higher values indicate greater influence on the final summary.
      </div>
    </div>
  );
};
