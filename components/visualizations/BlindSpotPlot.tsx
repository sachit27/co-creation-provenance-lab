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
  const { containerRef, isCompact, isMobile, config, width } = useResponsiveChart({
    minHeight: 380,
    needsExtraBottomMargin: true
  });

  // Dynamic Thresholds (Medians) — used for quadrant visualization
  const centralityScores = data.map(p => 1 - p.semanticIsolation).sort((a, b) => a - b);
  const repScores = data.map(p => p.representationScore).sort((a, b) => a - b);

  const mid = Math.floor(data.length / 2);
  const medianCentrality = centralityScores[mid];
  const medianRep = repScores[mid];

  // Relative review quadrants. Median splits organize inspection; they do not
  // establish omission, uniqueness, or a validated risk class.
  const getStatus = (centrality: number, representation: number) => {
    const isCentral = centrality >= medianCentrality;
    const isRepresented = representation >= medianRep;

    if (isCentral && isRepresented) return 'High centrality / High alignment';
    if (!isCentral && isRepresented) return 'Low centrality / High alignment';
    if (isCentral && !isRepresented) return 'High centrality / Low alignment';
    return 'Low centrality / Low alignment';
  };

  const plotData = data.map(p => {
    const centrality = 1 - p.semanticIsolation;
    return {
      ...p,
      centrality: centrality,
      status: getStatus(centrality, p.representationScore)
    };
  });

  // Quadrant counts for large-N annotation
  const quadrantCounts = {
    coreIncluded: plotData.filter(d => d.status === 'High centrality / High alignment').length,
    edgeIncluded: plotData.filter(d => d.status === 'Low centrality / High alignment').length,
    coreExcluded: plotData.filter(d => d.status === 'High centrality / Low alignment').length,
    blindSpot: plotData.filter(d => d.status === 'Low centrality / Low alignment').length,
  };
  const blindSpotCount = quadrantCounts.blindSpot;

  // Large-N scaling: smaller points so they don't overlap
  const isLargeN = data.length > 200;
  const isVeryLargeN = data.length > 500;
  const pointRadius = isVeryLargeN ? 3 : isLargeN ? 4 : 5;
  const blindSpotRadius = isVeryLargeN ? 4 : isLargeN ? 5 : 7;
  const pointStrokeWidth = isVeryLargeN ? 0.3 : isLargeN ? 0.5 : 1;
  const blindSpotStrokeWidth = isVeryLargeN ? 0.8 : isLargeN ? 1 : 2;

  const getColor = (status: string) => {
    switch (status) {
      case 'High centrality / High alignment': return '#10b981';
      case 'Low centrality / High alignment': return '#3b82f6';
      case 'High centrality / Low alignment': return '#f59e0b';
      case 'Low centrality / Low alignment': return '#ef4444';
      default: return '#94a3b8';
    }
  };

  const CustomTooltip = ({ active, payload }: any) => {
    if (active && payload && payload.length) {
      const d = payload[0].payload;
      const isBlindSpot = d.status === 'Low centrality / Low alignment';
      return (
        <div
          className="bg-white p-3 border border-slate-200 shadow-xl rounded-lg z-50"
          style={{ maxWidth: config.tooltipMaxWidth }}
        >
          <div className="font-bold text-slate-800 mb-1 flex justify-between items-center gap-2">
            <span className="truncate">{d.id}</span>
            <span
              className="text-[10px] px-1.5 py-0.5 rounded-full text-white whitespace-nowrap flex-shrink-0"
              style={{ backgroundColor: getColor(d.status) }}
            >
              {d.status}
            </span>
          </div>
          <div className="grid grid-cols-2 gap-2 text-[10px] text-slate-500 my-2 bg-slate-50 p-2 rounded">
            <div>Centrality:</div>
            <div className="font-mono font-medium text-right">{formatMetric(d.centrality)}</div>
            <div>Representation:</div>
            <div className={`font-mono font-medium text-right ${d.representationScore < 0.5 ? 'text-red-600' : 'text-green-600'}`}>
              {formatMetric(d.representationScore)}
            </div>
          </div>
          <p className="text-xs text-slate-600 italic border-t pt-2 mt-1 line-clamp-2">
            "{d.originalText}"
          </p>
          {isBlindSpot && (
            <div className="mt-2 pt-2 border-t text-[10px] text-red-600 font-medium">
              Review candidate under this run's median split; inspect the exact source and summary match.
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
          {isCompact ? (
            <span><strong>Centrality</strong> (X) vs <strong>Representation</strong> (Y) <InfoIcon metricKey="isolation" /></span>
          ) : (
            <span>
              Compares <strong>source-network centrality</strong> <InfoIcon metricKey="isolation" /> (X) with <strong>semantic alignment</strong> <InfoIcon metricKey="representation" /> (Y).
              Crosshairs show median thresholds.
            </span>
          )}
        </div>
        {blindSpotCount > 0 && (
          <div className="bg-red-50 border border-red-200 rounded-lg px-3 py-1.5 flex items-center gap-2">
            <span className="text-red-600 font-bold text-lg">{blindSpotCount}</span>
            <span className="text-red-700 text-xs font-medium">Low / Low quadrant</span>
          </div>
        )}
      </div>

      {/* Legend */}
      <div className="flex flex-wrap gap-3 md:gap-4 text-xs mb-3 px-1">
        {[
          { color: 'bg-green-500', label: 'High / High', desc: 'High centrality and alignment' },
          { color: 'bg-blue-500', label: 'Low / High', desc: 'Low centrality, high alignment' },
          { color: 'bg-amber-500', label: 'High / Low', desc: 'High centrality, low alignment' },
          { color: 'bg-red-500', label: 'Low / Low', desc: 'Low centrality and alignment', bold: true }
        ].map(item => (
          <div key={item.label} className="flex items-center gap-1.5" title={item.desc}>
            <span className={`w-2.5 h-2.5 rounded-full ${item.color} flex-shrink-0`}></span>
            <span className={`${isMobile ? 'text-[10px]' : 'text-xs'} ${item.bold ? 'font-bold text-red-700' : 'text-slate-600'}`}>
              {isMobile ? item.label.split(' ')[0] : item.label}
            </span>
          </div>
        ))}
      </div>

      {/* Chart */}
      <div className="relative bg-white rounded-lg border border-slate-200 shadow-sm" style={{ height: '280px' }}>
        <ResponsiveContainer width="100%" height="100%">
          <ScatterChart margin={margins}>
            <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />

            <XAxis
              type="number"
              dataKey="centrality"
              name="Centrality"
              domain={[0, 1]}
              tickCount={5}
              tick={{ fontSize: config.tickFontSize, fill: '#64748b' }}
              tickFormatter={(v) => formatMetric(v, 1)}
              axisLine={{ stroke: '#cbd5e1' }}
            >
              <Label
                value={isCompact ? 'Centrality →' : 'Opinion Centrality (Marginal → Core)'}
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
              name="Representation"
              domain={[0, 1]}
              tickCount={5}
              tick={{ fontSize: config.tickFontSize, fill: '#64748b' }}
              tickFormatter={(v) => formatMetric(v, 1)}
              axisLine={{ stroke: '#cbd5e1' }}
            >
              <Label
                value={isCompact ? 'Align →' : 'Semantic Alignment'}
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
                    strokeWidth={isSelected ? 3 : entry.status === 'Low centrality / Low alignment' ? blindSpotStrokeWidth : pointStrokeWidth}
                    r={(entry.status === 'Low centrality / Low alignment' ? blindSpotRadius : pointRadius) + (isSelected ? 2 : 0)}
                    opacity={selectedId && !isSelected ? 0.25 : 1}
                  />
                );
              })}
            </Scatter>
          </ScatterChart>
        </ResponsiveContainer>

        {/* Quadrant labels - only on larger screens */}
        {width > 500 && (
          <>
            <div className="absolute top-3 right-3 text-[10px] font-bold text-green-700 bg-green-50/90 px-2 py-1 rounded shadow-sm pointer-events-none border border-green-200">
              High / High {isLargeN && <span className="text-green-500 ml-1">({quadrantCounts.coreIncluded})</span>}
            </div>
            <div className="absolute bottom-16 left-16 text-[10px] font-bold text-red-700 bg-red-50/90 px-2 py-1 rounded shadow-sm pointer-events-none border border-red-200">
              Low / Low {isLargeN && <span className="text-red-500 ml-1">({quadrantCounts.blindSpot})</span>}
            </div>
            <div className="absolute top-3 left-16 text-[10px] font-medium text-blue-600 bg-blue-50/90 px-2 py-1 rounded shadow-sm pointer-events-none border border-blue-200">
              Low / High {isLargeN && <span className="text-blue-400 ml-1">({quadrantCounts.edgeIncluded})</span>}
            </div>
            <div className="absolute bottom-16 right-3 text-[10px] font-medium text-amber-600 bg-amber-50/90 px-2 py-1 rounded shadow-sm pointer-events-none border border-amber-200">
              High / Low {isLargeN && <span className="text-amber-400 ml-1">({quadrantCounts.coreExcluded})</span>}
            </div>
          </>
        )}
      </div>
    </div>
  );
};
