import React from 'react';
import { ScatterChart, Scatter, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, ReferenceLine, Cell, Label } from 'recharts';
import { ParticipantAnalysis } from '../../types';
import { useResponsiveChart, formatMetric } from '../../hooks/useResponsiveChart';
import { InfoIcon } from '../ui/MetricGlossary';

interface BlindSpotPlotProps {
  data: ParticipantAnalysis[];
  onSelect: (id: string) => void;
  /** Brushing: participant currently selected elsewhere in the dashboard. */
  selectedId?: string | null;
}

export const BlindSpotPlot: React.FC<BlindSpotPlotProps> = ({ data, onSelect, selectedId }) => {
  const { containerRef, isCompact, isMobile, config } = useResponsiveChart({
    minHeight: 380,
    needsExtraBottomMargin: true
  });

  // Unavailable measurements must not become low-score observations or move
  // the display medians. These filters do not alter saved analysis data.
  const validData = data.filter(p => !p.embeddingFailed && !p.alignmentUnavailableReason
    && Number.isFinite(p.semanticIsolation) && Number.isFinite(p.representationScore));
  const unavailableCount = data.length - validData.length;
  const median = (values: number[]) => {
    const sorted = [...values].sort((a, b) => a - b);
    const mid = Math.floor(sorted.length / 2);
    return sorted.length === 0 ? undefined
      : sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
  };
  const medianCentrality = median(validData.map(p => 1 - p.semanticIsolation));
  const medianRep = median(validData.map(p => p.representationScore));

  // Relative review quadrants. Median splits organize inspection; they do not
  // establish omission, uniqueness, or a validated risk class.
  const getStatus = (centrality: number, representation: number) => {
    const isCentral = centrality >= (medianCentrality ?? 0);
    const isRepresented = representation >= (medianRep ?? 0);

    if (isCentral && isRepresented) return 'Higher centroid similarity / Higher alignment';
    if (!isCentral && isRepresented) return 'Lower centroid similarity / Higher alignment';
    if (isCentral && !isRepresented) return 'Higher centroid similarity / Lower alignment';
    return 'Lower centroid similarity / Lower alignment';
  };

  const plotData = validData.map(p => {
    const centrality = 1 - p.semanticIsolation;
    return {
      ...p,
      centrality: centrality,
      status: getStatus(centrality, p.representationScore)
    };
  });

  const blindSpotCount = plotData.filter(d => d.status === 'Lower centroid similarity / Lower alignment').length;

  // Large-N scaling: smaller points so they don't overlap
  const isLargeN = plotData.length > 200;
  const isVeryLargeN = plotData.length > 500;
  const pointRadius = isVeryLargeN ? 3 : isLargeN ? 4 : 5;
  const blindSpotRadius = isVeryLargeN ? 4 : isLargeN ? 5 : 7;
  const pointStrokeWidth = isVeryLargeN ? 0.3 : isLargeN ? 0.5 : 1;
  const blindSpotStrokeWidth = isVeryLargeN ? 0.8 : isLargeN ? 1 : 2;

  const getColor = (status: string) => {
    switch (status) {
      case 'Higher centroid similarity / Higher alignment': return '#10b981';
      case 'Lower centroid similarity / Higher alignment': return '#3b82f6';
      case 'Higher centroid similarity / Lower alignment': return '#f59e0b';
      case 'Lower centroid similarity / Lower alignment': return '#ef4444';
      default: return '#94a3b8';
    }
  };

  const CustomTooltip = ({ active, payload }: any) => {
    if (active && payload && payload.length) {
      const d = payload[0].payload;
      const isBlindSpot = d.status === 'Lower centroid similarity / Lower alignment';
      return (
        <div
          className="bg-white p-3 border border-slate-200 shadow-xl rounded-lg z-50"
          style={{ maxWidth: config.tooltipMaxWidth }}
        >
          <div className="font-bold text-slate-800 mb-1 flex flex-wrap items-center gap-2">
            <span className="truncate">{d.id}</span>
            <span
              className="text-[10px] px-1.5 py-0.5 rounded text-white"
              style={{ backgroundColor: getColor(d.status) }}
            >
              {d.status}
            </span>
          </div>
          <div className="grid grid-cols-2 gap-2 text-[10px] text-slate-500 my-2 bg-slate-50 p-2 rounded">
            <div>Centroid similarity (X):</div>
            <div className="font-mono font-medium text-right">{formatMetric(d.centrality)}</div>
            <div>Summary alignment (Y):</div>
            <div className="font-mono font-medium text-right text-slate-700">
              {formatMetric(d.representationScore)}
            </div>
          </div>
          <p className="text-xs text-slate-600 italic border-t pt-2 mt-1 line-clamp-2">
            "{d.originalText}"
          </p>
          {isBlindSpot && (
            <div className="mt-2 pt-2 border-t text-[10px] text-red-600 font-medium">
              Below both displayed medians; inspect the source and its strongest summary match. This does not establish omission.
            </div>
          )}
        </div>
      );
    }
    return null;
  };

  // Enhanced dynamic margins with proper spacing for labels
  const margins = {
    top: isCompact ? 20 : 25,
    right: isCompact ? 25 : 35,
    bottom: isCompact ? 50 : 60,
    left: isCompact ? 50 : 60
  };

  return (
    <div ref={containerRef} className="w-full flex flex-col" style={{ minHeight: '420px' }}>
      {/* Header with blind spot count */}
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <div className="text-xs text-slate-600 bg-slate-50 p-2 rounded border border-slate-100 flex-1 min-w-[200px]">
          <span>
            <strong>X: similarity to the input centroid</strong> <InfoIcon metricKey="isolation" /> (1 − semantic isolation, a non-negative cosine score; farther right means closer to the center of the source embeddings).
            {' '}<strong>Y: summary alignment</strong> <InfoIcon metricKey="representation" /> (strongest non-negative cosine similarity to an eligible summary sentence; higher means a closer semantic match).
          </span>
        </div>
        {blindSpotCount > 0 && (
          <div className="bg-red-50 border border-red-200 rounded-lg px-3 py-1.5 flex items-center gap-2">
            <span className="text-red-600 font-bold text-lg">{blindSpotCount}</span>
            <span className="text-red-700 text-xs font-medium">Below both medians</span>
          </div>
        )}
      </div>
      <p className="mb-3 text-xs leading-relaxed text-slate-600">
        {medianCentrality !== undefined && medianRep !== undefined
          ? <>Dashed lines mark the medians of {validData.length} plotted records: X = {formatMetric(medianCentrality)}, Y = {formatMetric(medianRep)}. </>
          : 'No valid paired measurements are available. '}
        “Lower” means below that axis's median; “Higher” means at or above it. For an even record count, the median averages the two middle values. Ties can leave quadrants empty.
        {' '}These relative groups organize evidence review; they do not establish fairness, unique perspectives, or omitted content.
        {unavailableCount > 0 && <> {unavailableCount} {unavailableCount === 1 ? 'record with unavailable measurements is' : 'records with unavailable measurements are'} excluded from the chart and its medians.</>}
      </p>

      {/* Legend */}
      <div className="flex flex-wrap gap-3 md:gap-4 text-xs mb-3 px-1">
        {[
          { color: 'bg-green-500', label: 'Higher X / Higher Y', desc: 'At or above both medians' },
          { color: 'bg-blue-500', label: 'Lower X / Higher Y', desc: 'Below the X median, at or above the Y median' },
          { color: 'bg-amber-500', label: 'Higher X / Lower Y', desc: 'At or above the X median, below the Y median' },
          { color: 'bg-red-500', label: 'Lower X / Lower Y', desc: 'Below both medians', bold: true }
        ].map(item => (
          <div key={item.label} className="flex items-center gap-1.5" title={item.desc}>
            <span className={`w-2.5 h-2.5 rounded-full ${item.color} flex-shrink-0`}></span>
            <span className={`${isMobile ? 'text-[10px]' : 'text-xs'} ${item.bold ? 'font-bold text-red-700' : 'text-slate-600'}`}>
              {item.label}
            </span>
          </div>
        ))}
      </div>

      {/* Chart */}
      <div className="relative bg-white rounded-lg border border-slate-200 shadow-sm" style={{ height: '340px' }}>
        <ResponsiveContainer width="100%" height="100%">
          <ScatterChart margin={margins}>
            <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />

            <XAxis
              type="number"
              dataKey="centrality"
              name="Centroid similarity"
              domain={[0, 1]}
              tickCount={5}
              tick={{ fontSize: config.tickFontSize, fill: '#64748b' }}
              tickFormatter={(v) => formatMetric(v, 1)}
              axisLine={{ stroke: '#cbd5e1' }}
            >
              <Label
                value={isCompact ? 'Centroid similarity →' : 'Similarity to input centroid →'}
                position="bottom"
                offset={isCompact ? 30 : 38}
                style={{
                  fontSize: config.fontSize,
                  fill: '#475569',
                  fontWeight: 500
                }}
              />
            </XAxis>

            <YAxis
              type="number"
              dataKey="representationScore"
              name="Summary alignment"
              domain={[0, 1]}
              tickCount={5}
              tick={{ fontSize: config.tickFontSize, fill: '#64748b' }}
              tickFormatter={(v) => formatMetric(v, 1)}
              axisLine={{ stroke: '#cbd5e1' }}
            >
              <Label
                value="Summary alignment →"
                angle={-90}
                position="left"
                offset={isCompact ? 35 : 45}
                style={{
                  fontSize: config.fontSize,
                  fill: '#475569',
                  fontWeight: 500,
                  textAnchor: 'middle'
                }}
              />
            </YAxis>

            <Tooltip content={<CustomTooltip />} cursor={{ strokeDasharray: '3 3', stroke: '#94a3b8' }} />

            {/* Dynamic Median Lines */}
            <ReferenceLine
              x={medianCentrality}
              stroke="#94a3b8"
              strokeDasharray="5 5"
              strokeWidth={1.5}
            />
            <ReferenceLine
              y={medianRep}
              stroke="#94a3b8"
              strokeDasharray="5 5"
              strokeWidth={1.5}
            />

            <Scatter
              name="Participants"
              data={plotData}
              // recharts types the click payload as ScatterPointItem, which does not
              // declare our custom row fields; narrow to the shape we actually supply.
              onClick={(d) => { const id = (d as unknown as { id?: string }).id; if (id) onSelect(id); }}
              cursor="pointer"
            >
              {plotData.map((entry, index) => {
                const isSelected = !!selectedId && entry.id === selectedId;
                return (
                  <Cell
                    key={`cell-${index}`}
                    fill={getColor(entry.status)}
                    // Selection is encoded by stroke + size + opacity, never by hue
                    // alone: hue already carries the blind-spot status, and relying
                    // on colour alone would fail WCAG 1.4.1 (use of colour).
                    stroke={isSelected ? '#1e40af' : '#fff'}
                    strokeWidth={isSelected ? 3 : entry.status === 'Lower centroid similarity / Lower alignment' ? blindSpotStrokeWidth : pointStrokeWidth}
                    r={(entry.status === 'Lower centroid similarity / Lower alignment' ? blindSpotRadius : pointRadius) + (isSelected ? 2 : 0)}
                    opacity={selectedId && !isSelected ? 0.25 : 1}
                  />
                );
              })}
            </Scatter>
          </ScatterChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
};
