import React, { useState, useMemo } from 'react';
import { ComposedChart, Bar, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, ReferenceLine, Cell, Label } from 'recharts';
import { ParticipantAnalysis } from '../../types';
import { useResponsiveChart, formatMetric } from '../../hooks/useResponsiveChart';
import { getRepresentationBands } from '../../constants';
import { InfoIcon } from '../ui/MetricGlossary';

interface RepresentationBarProps {
  data: ParticipantAnalysis[];
}

export const RepresentationBar: React.FC<RepresentationBarProps> = ({ data }) => {
  const validData = data.filter(d => !d.embeddingFailed && !d.alignmentUnavailableReason);
  const isLargeDataset = validData.length > 200;
  const [viewMode, setViewMode] = useState<'auto' | 'bars' | 'histogram'>(isLargeDataset ? 'histogram' : 'bars');
  const showHistogram = viewMode === 'histogram' || (viewMode === 'auto' && isLargeDataset);

  const { containerRef, config, isCompact, isMobile, width } = useResponsiveChart({
    minHeight: 320,
    dataLength: showHistogram ? 20 : data.length,
    needsExtraBottomMargin: true
  });

  // Sort by score ascending for the Lorenz-style curve
  const sortedData = [...validData].sort((a, b) => a.representationScore - b.representationScore);

  // Calculate "Perfect Equity" line (Average)
  const avgScore = validData.reduce((a, b) => a + b.representationScore, 0) / Math.max(1, validData.length);

  // Use config thresholds for interpretation — 3-state model consistent with ExecutiveSummary:
  //   Well Represented: >= representationTarget (0.6)
  //   Underrepresented: atRisk (0.3) – representationTarget (0.6)
  //   At Risk:          < atRisk (0.3)
  const bands = getRepresentationBands(validData[0]?.embeddingTier);
  const atRisk = bands.atRisk;
  const representationTarget = bands.target;

  // Calculate counts matching ExecutiveSummary's 3-state bands
  const belowMarkerCount = validData.filter(d => d.representationScore < atRisk).length;
  const middleBandCount = validData.filter(d => d.representationScore >= atRisk && d.representationScore < representationTarget).length;
  const aboveReferenceCount = validData.filter(d => d.representationScore >= representationTarget).length;

  const chartData = sortedData.map((d, i) => ({
    ...d,
    index: i,
    ideal: avgScore,
    percentile: ((i + 1) / data.length * 100).toFixed(0)
  }));

  // Histogram bins: 20 bins from 0.0 to 1.0
  const NUM_BINS = 20;
  const histogramData = useMemo(() => {
    const bins = Array.from({ length: NUM_BINS }, (_, i) => ({
      binStart: i / NUM_BINS,
      binEnd: (i + 1) / NUM_BINS,
      label: `${(i / NUM_BINS).toFixed(2)}–${((i + 1) / NUM_BINS).toFixed(2)}`,
      count: 0,
      isAtRisk: (i + 1) / NUM_BINS <= atRisk,
      isWellRepresented: i / NUM_BINS >= representationTarget,
    }));
    for (const d of validData) {
      const binIdx = Math.min(NUM_BINS - 1, Math.floor(d.representationScore * NUM_BINS));
      bins[binIdx].count++;
    }
    return bins;
  }, [validData, atRisk, representationTarget]);

  // Dynamic bar size based on data length and container width
  const barSize = Math.max(4, Math.min(24, Math.floor(Math.min(400, width * 0.6) / Math.max(1, validData.length))));

  const CustomTooltip = ({ active, payload }: any) => {
    if (active && payload && payload.length) {
      const d = payload[0].payload;
      const gap = d.representationScore - avgScore;
      const isAtRisk = d.representationScore < atRisk;

      return (
        <div
          className="bg-slate-800 text-white text-xs p-3 rounded-lg shadow-lg border border-slate-700 z-50"
          style={{ maxWidth: config.tooltipMaxWidth }}
        >
          <div className="flex justify-between items-center mb-2">
            <span className="font-bold truncate max-w-[120px]">{d.id}</span>
            {isAtRisk && (
              <span className="text-[9px] bg-red-500/30 text-red-300 px-1.5 py-0.5 rounded">AT RISK</span>
            )}
          </div>
          <div className="grid grid-cols-2 gap-x-3 gap-y-1.5 bg-slate-700/50 p-2 rounded">
            <span className="text-slate-400">Score:</span>
            <span className={`font-mono font-medium ${d.representationScore < 0.5 ? 'text-red-400' : 'text-green-400'}`}>
              {formatMetric(d.representationScore, 3)}
            </span>
            <span className="text-slate-400">Gap from Avg:</span>
            <span className={`font-mono font-medium ${gap < 0 ? 'text-amber-400' : 'text-blue-400'}`}>
              {gap >= 0 ? '+' : ''}{formatMetric(gap, 3)}
            </span>
            <span className="text-slate-400">Percentile:</span>
            <span className="font-mono text-slate-300">{d.percentile}%</span>
          </div>
          <div className="mt-2 pt-2 border-t border-slate-600 italic text-slate-400 line-clamp-2">
            "{d.originalText}"
          </div>
        </div>
      );
    }
    return null;
  };

  // Enhanced margins
  const margins = {
    top: 20,
    right: isCompact ? 25 : 50,
    bottom: isCompact ? 50 : 60,
    left: isCompact ? 50 : 60
  };

  // recharts' ChartData generic rejects a union of the two row shapes, so widen
  // once here and hand the chart a single array type.
  const activeChartData = (showHistogram ? histogramData : chartData) as Array<Record<string, unknown>>;

  return (
    <div ref={containerRef} className="w-full flex flex-col" style={{ minHeight: '380px' }}>
      {/* Header with stats */}
      <div className="mb-4 flex flex-wrap items-start gap-3">
        <div className="flex-1 text-sm text-slate-600 bg-slate-50 p-3 rounded-lg border border-slate-100 min-w-[200px]">
          <div className="flex items-start gap-2">
            <span className="text-lg">📊</span>
            <div>
              <strong>Equity Distribution</strong> <InfoIcon metricKey="representation" />
              {isCompact ? (
                <span className="block text-xs mt-0.5">Sorted semantic-alignment scores</span>
              ) : (
                <span className="block text-xs mt-0.5">
                  Valid records sorted by strongest source-to-summary sentence similarity.
                  A flat line indicates equal scores, not complete coverage.
                </span>
              )}
            </div>
          </div>
        </div>

        {/* Quick stats */}
        <div className="flex gap-2">
          <div className="bg-blue-50 border border-blue-200 rounded-lg px-3 py-2 text-center">
            <div className="text-blue-600 font-bold text-lg">{formatMetric(avgScore)}</div>
            <div className="text-blue-700 text-[10px] font-medium">Avg Score</div>
          </div>
          {belowMarkerCount > 0 && (
            <div className="bg-red-50 border border-red-200 rounded-lg px-3 py-2 text-center">
              <div className="text-red-600 font-bold text-lg">{belowMarkerCount}</div>
              <div className="text-red-700 text-[10px] font-medium">Below Marker</div>
            </div>
          )}
        </div>
      </div>

      {/* View mode toggle for large datasets */}
      {validData.length > 100 && (
        <div className="mb-2 flex items-center gap-2">
          <span className="text-[10px] text-slate-400">View:</span>
          <button
            onClick={() => setViewMode('bars')}
            className={`text-[10px] px-2 py-0.5 rounded-full border transition-colors ${!showHistogram ? 'bg-blue-100 border-blue-300 text-blue-700 font-bold' : 'bg-white border-slate-200 text-slate-500 hover:border-slate-300'
              }`}
          >
            Full Bars ({data.length})
          </button>
          <button
            onClick={() => setViewMode('histogram')}
            className={`text-[10px] px-2 py-0.5 rounded-full border transition-colors ${showHistogram ? 'bg-blue-100 border-blue-300 text-blue-700 font-bold' : 'bg-white border-slate-200 text-slate-500 hover:border-slate-300'
              }`}
          >
            Distribution
          </button>
        </div>
      )}

      {/* Chart */}
      <div className="relative bg-white rounded-lg border border-slate-200 shadow-sm p-1" style={{ height: '250px' }}>
        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart data={activeChartData} margin={margins}>
            <CartesianGrid stroke="#f1f5f9" strokeDasharray="3 3" vertical={false} />

            {showHistogram ? (
              /* ── Histogram mode ── */
              <>
                <XAxis
                  dataKey="label"
                  tick={{ fontSize: config.tickFontSize - 1, fill: '#64748b' }}
                  tickLine={false}
                  axisLine={{ stroke: '#cbd5e1' }}
                  interval={1}
                >
                  <Label
                    value="Representation Score Range"
                    position="bottom"
                    offset={isCompact ? 30 : 40}
                    style={{ fontSize: config.fontSize, fill: '#475569', fontWeight: 500 }}
                  />
                </XAxis>
                <YAxis
                  tickCount={6}
                  tick={{ fontSize: config.tickFontSize, fill: '#64748b' }}
                  axisLine={{ stroke: '#cbd5e1' }}
                >
                  <Label
                    value="Participants"
                    angle={-90}
                    position="left"
                    offset={isCompact ? 35 : 45}
                    style={{ fontSize: config.fontSize, fill: '#475569', fontWeight: 500, textAnchor: 'middle' }}
                  />
                </YAxis>
                <Tooltip
                  formatter={(value: number, _name: string, props: any) => [
                    `${value} participant${value !== 1 ? 's' : ''}`,
                    `Range: ${props.payload.label}`
                  ]}
                  cursor={{ fill: '#f8fafc' }}
                />
                <Bar dataKey="count" barSize={Math.max(8, Math.min(28, Math.floor(width * 0.5 / NUM_BINS)))} radius={[3, 3, 0, 0]}>
                  {histogramData.map((entry, index) => (
                    <Cell
                      key={`hist-${index}`}
                      fill={
                        entry.isAtRisk ? '#f43f5e' :
                          entry.isWellRepresented ? '#10b981' : '#fbbf24'
                      }
                    />
                  ))}
                </Bar>
              </>
            ) : (
              /* ── Full bars mode ── */
              <>
                <XAxis
                  dataKey="index"
                  tick={false}
                  axisLine={{ stroke: '#cbd5e1' }}
                  tickLine={false}
                >
                  <Label
                    value={isCompact ? 'Participants →' : 'Participants (Sorted by Representation Score)'}
                    position="bottom"
                    offset={isCompact ? 30 : 40}
                    style={{ fontSize: config.fontSize, fill: '#475569', fontWeight: 500 }}
                  />
                </XAxis>
                <YAxis
                  domain={[0, 1]}
                  tickCount={6}
                  tick={{ fontSize: config.tickFontSize, fill: '#64748b' }}
                  tickFormatter={(v) => formatMetric(v, 1)}
                  axisLine={{ stroke: '#cbd5e1' }}
                >
                  <Label
                    value={isCompact ? 'Score' : 'Representation Score'}
                    angle={-90}
                    position="left"
                    offset={isCompact ? 35 : 45}
                    style={{ fontSize: config.fontSize, fill: '#475569', fontWeight: 500, textAnchor: 'middle' }}
                  />
                </YAxis>
                <Tooltip content={<CustomTooltip />} cursor={{ fill: '#f8fafc' }} />
                <ReferenceLine y={avgScore} stroke="#3b82f6" strokeDasharray="6 4" strokeWidth={2} />
                <ReferenceLine y={representationTarget} stroke="#10b981" strokeDasharray="4 4" strokeWidth={1} />
                <ReferenceLine y={atRisk} stroke="#ef4444" strokeDasharray="3 3" strokeWidth={1} />
                <Bar dataKey="representationScore" barSize={barSize} radius={[2, 2, 0, 0]}>
                  {chartData.map((entry, index) => (
                    <Cell
                      key={`cell-${index}`}
                      fill={
                        entry.representationScore < atRisk ? '#f43f5e' :
                          entry.representationScore < representationTarget ? '#fbbf24' : '#10b981'
                      }
                    />
                  ))}
                </Bar>
                <Line
                  type="monotone"
                  dataKey="representationScore"
                  stroke="#475569"
                  strokeWidth={1.5}
                  dot={false}
                  activeDot={{ r: 4, fill: '#3b82f6' }}
                />
              </>
            )}
          </ComposedChart>
        </ResponsiveContainer>

        {/* Reference line legend - positioned inside chart area */}
        {!isMobile && (
          <div className="absolute top-4 right-4 bg-white/95 border border-slate-200 rounded-lg p-2 text-[10px] space-y-1 shadow-sm">
            <div className="flex items-center gap-2">
              <div className="w-4 h-0.5 bg-blue-500" style={{ borderTop: '2px dashed #3b82f6' }}></div>
              <span className="text-slate-600">Average ({formatMetric(avgScore)})</span>
            </div>
            <div className="flex items-center gap-2">
              <div className="w-4 h-0.5 bg-green-500" style={{ borderTop: '2px dashed #10b981' }}></div>
              <span className="text-slate-600">Upper reference ({representationTarget})</span>
            </div>
            <div className="flex items-center gap-2">
              <div className="w-4 h-0.5 bg-red-500" style={{ borderTop: '2px dashed #ef4444' }}></div>
              <span className="text-slate-600">Review marker ({atRisk})</span>
            </div>
          </div>
        )}
      </div>

      {/* Color legend — 3-state bands matching ExecutiveSummary */}
      <div className="mt-3 flex flex-wrap gap-3 justify-center text-[10px]">
        <div className="flex items-center gap-1.5">
          <span className="w-3 h-3 rounded bg-green-500"></span>
          <span className="text-slate-600">Above reference ({aboveReferenceCount}) — score &ge; {representationTarget}</span>
        </div>
        <div className="flex items-center gap-1.5">
          <span className="w-3 h-3 rounded bg-amber-400"></span>
          <span className="text-slate-600">Middle band ({middleBandCount}) — score {atRisk}–{representationTarget}</span>
        </div>
        <div className="flex items-center gap-1.5">
          <span className="w-3 h-3 rounded bg-red-500"></span>
          <span className="text-slate-600">Below review marker ({belowMarkerCount}) — score &lt; {atRisk}</span>
        </div>
      </div>
    </div>
  );
};
