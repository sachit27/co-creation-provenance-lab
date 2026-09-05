import React, { useMemo } from 'react';
import { ScatterChart, Scatter, XAxis, YAxis, ZAxis, Tooltip, ResponsiveContainer, Cell, ReferenceLine } from 'recharts';
import { ParticipantAnalysis, ClusterData, ClusteringDiagnostics } from '../../types';
import { useResponsiveChart, formatMetric } from '../../hooks/useResponsiveChart';
import { InfoIcon } from '../ui/MetricGlossary';

interface SemanticMapProps {
  data: ParticipantAnalysis[];
  clusters: ClusterData[];
  clusteringDiagnostics?: ClusteringDiagnostics;
  onSelect: (id: string) => void;
  selectedId: string | null;
}

export const SemanticMap: React.FC<SemanticMapProps> = ({ data, clusters, clusteringDiagnostics, onSelect, selectedId }) => {
  const { containerRef, isCompact, isMobile, config, width } = useResponsiveChart({ minHeight: 380 });
  const groupingUsable = clusteringDiagnostics?.usableForDownstream === true;

  const getColor = (clusterId: number) => {
    if (!groupingUsable) return '#94a3b8';
    return clusters.find(c => c.id === clusterId)?.color || '#94a3b8';
  };

  // Calculate cluster statistics for legend
  const clusterStats = useMemo(() => {
    if (!groupingUsable) {
      return [{
        id: 0,
        label: 'Unpartitioned records',
        color: '#94a3b8',
        count: data.length,
        avgRep: data.reduce((sum, item) => sum + item.representationScore, 0) / Math.max(1, data.length),
      }];
    }
    return clusters.map(c => ({
      ...c,
      count: data.filter(d => d.clusterId === c.id).length,
      avgRep: data.filter(d => d.clusterId === c.id)
        .reduce((sum, d) => sum + d.representationScore, 0) /
        Math.max(1, data.filter(d => d.clusterId === c.id).length)
    }));
  }, [data, clusters, groupingUsable]);

  // Find selected participant for enhanced display
  const selectedParticipant = selectedId ? data.find(p => p.id === selectedId) : null;

  const CustomTooltip = ({ active, payload }: any) => {
    if (active && payload && payload.length) {
      const d = payload[0].payload;
      const clusterInfo = groupingUsable
        ? clusters.find(c => c.id === d.clusterId)
        : { label: 'Unpartitioned', color: '#94a3b8' };
      return (
        <div
          className="bg-slate-900/95 backdrop-blur border border-slate-700 text-white text-xs p-3 rounded-lg shadow-xl z-50"
          style={{ maxWidth: config.tooltipMaxWidth }}
        >
          <div className="flex justify-between items-center mb-2 gap-2">
            <span className="font-bold text-blue-200 truncate">{d.id}</span>
            <div className="flex items-center gap-1.5 flex-shrink-0">
              <span
                className="w-2 h-2 rounded-full"
                style={{ backgroundColor: clusterInfo?.color }}
              />
              <span className="text-[10px] text-slate-400">{clusterInfo?.label}</span>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-1.5 text-[10px] bg-white/10 p-2 rounded mb-2">
            <span className="text-slate-400">Representation:</span>
            <span className={`font-mono font-medium text-right ${d.representationScore < 0.5 ? 'text-red-400' : 'text-green-400'}`}>
              {formatMetric(d.representationScore)}
            </span>
            <span className="text-slate-400">Isolation:</span>
            <span className="font-mono text-right text-slate-300">{formatMetric(d.semanticIsolation)}</span>
          </div>
          <p className="text-slate-300 leading-relaxed line-clamp-2 italic">
            "{d.originalText}"
          </p>
        </div>
      );
    }
    return null;
  };

  // Dynamic point size based on representation score and dataset size
  // At 200+ points, reduce sizes to prevent overlap; at 500+, further reduce
  const scaleFactor = data.length > 500 ? 0.35 : data.length > 200 ? 0.55 : 1;
  const getPointSize = (score: number) => {
    const baseSize = isMobile ? 50 : isCompact ? 70 : 100;
    return (baseSize + (score * (isMobile ? 100 : 200))) * scaleFactor;
  };

  // Dynamic opacity for large datasets
  const pointOpacity = data.length > 500 ? 0.45 : data.length > 200 ? 0.6 : 0.85;
  const fadedOpacity = data.length > 500 ? 0.1 : data.length > 200 ? 0.15 : 0.35;

  // Dynamic margins based on size
  const margins = {
    top: isCompact ? 25 : 35,
    right: isCompact ? 25 : 45,
    bottom: isCompact ? 25 : 35,
    left: isCompact ? 25 : 45
  };

  return (
    <div ref={containerRef} className="w-full relative bg-gradient-to-br from-slate-50 to-slate-100 rounded-lg border border-slate-200 shadow-inner" style={{ height: '380px' }}>
      {/* Legend */}
      <div className={`absolute z-10 bg-white/95 rounded-lg backdrop-blur-sm border border-slate-200 shadow-md ${isMobile ? 'top-2 right-2 p-2' : 'top-3 right-3 p-3'
        }`}>
        <div className="flex items-center justify-between gap-2 mb-2 border-b border-slate-100 pb-1.5">
          <span className={`font-semibold text-slate-600 uppercase tracking-wider ${isMobile ? 'text-[8px]' : 'text-[10px]'
            }`}>
            Semantic Groups <InfoIcon metricKey="clusters" size="sm" />
          </span>
          <span className="text-[9px] text-slate-400">{data.length} points</span>
        </div>
        <div className="space-y-1">
          {clusterStats.map(c => (
            <div
              key={c.id}
              className={`flex items-center justify-between gap-3 cursor-pointer hover:bg-slate-50 px-1 py-0.5 rounded transition-colors ${isMobile ? 'text-[10px]' : 'text-xs'
                }`}
            >
              <div className="flex items-center gap-1.5">
                <span
                  className={`rounded-full shadow-sm flex-shrink-0 ${isMobile ? 'w-2 h-2' : 'w-2.5 h-2.5'}`}
                  style={{ backgroundColor: c.color }}
                />
                <span className="text-slate-700 font-medium">{c.label}</span>
              </div>
              <span className="text-slate-400 text-[10px]">({c.count})</span>
            </div>
          ))}
        </div>
      </div>

      <div className={`absolute z-10 left-3 top-11 max-w-[290px] rounded-lg border px-2.5 py-2 text-[10px] leading-relaxed shadow-sm ${
        clusteringDiagnostics?.usableForDownstream
          ? 'border-emerald-200 bg-emerald-50/95 text-emerald-900'
          : 'border-amber-200 bg-amber-50/95 text-amber-900'
      }`}>
        {clusteringDiagnostics?.usableForDownstream ? (
          <>
            Exploratory partition passed internal gates: k={clusteringDiagnostics.selectedK}, full-space silhouette={clusteringDiagnostics.silhouette?.toFixed(2)}, stability={clusteringDiagnostics.stability?.toFixed(2)}, neighborhood coherence={clusteringDiagnostics.neighborhoodAgreement?.toFixed(2)}, method agreement={clusteringDiagnostics.methodAgreement?.toFixed(2)}{clusteringDiagnostics.projectionMethod !== 'none' ? `, projection r=${clusteringDiagnostics.projectionDistanceCorrelation.toFixed(2)}` : ''}. Review source text before interpreting groups.
          </>
        ) : (
          <>
            {clusteringDiagnostics?.candidateDiagnostics.length
              ? 'No partition met all internal checks. This does not mean participants agree. Open Network details → Clustering checks for candidate scores.'
              : clusteringDiagnostics?.reason || 'This saved result has no clustering diagnostics. Rerun the analysis to obtain them.'}
          </>
        )}
      </div>

      {/* Selected participant info */}
      {selectedParticipant && !isMobile && (
        <div className="absolute bottom-3 left-3 z-10 bg-white/95 rounded-lg border border-blue-200 shadow-md p-2 max-w-[200px]">
          <div className="text-[10px] text-blue-600 font-bold mb-1">Selected: {selectedParticipant.id}</div>
          <div className="text-[10px] text-slate-600 line-clamp-2">
            "{selectedParticipant.originalText}"
          </div>
        </div>
      )}

      {/* Chart instructions */}
      {!isMobile && (
        <div className="absolute top-3 left-3 z-10 text-[10px] text-slate-500 bg-white/80 px-2 py-1.5 rounded flex items-center gap-1">
          <span>Click points to select • Size = representation score</span>
          <InfoIcon metricKey="semanticSpace" />
        </div>
      )}

      <ResponsiveContainer width="100%" height="100%">
        <ScatterChart margin={margins}>
          <XAxis
            type="number"
            dataKey="semanticCoords.x"
            name="Dimension 1"
            hide
            domain={['auto', 'auto']}
          />
          <YAxis
            type="number"
            dataKey="semanticCoords.y"
            name="Dimension 2"
            hide
            domain={['auto', 'auto']}
          />
          <ZAxis
            dataKey="representationScore"
            range={isMobile ? [40, 180] : isCompact ? [50, 250] : [60, 350]}
            domain={[0, 1]}
          />

          {/* Center Reference Crosshair */}
          <ReferenceLine x={0} stroke="#cbd5e1" strokeDasharray="4 4" strokeWidth={1} />
          <ReferenceLine y={0} stroke="#cbd5e1" strokeDasharray="4 4" strokeWidth={1} />

          <Tooltip content={<CustomTooltip />} cursor={{ strokeDasharray: '3 3', stroke: '#94a3b8' }} />
          <Scatter
            name="Participants"
            data={data}
            // recharts types the click payload as ScatterPointItem, which does not
            // declare our custom row fields; narrow to the shape we actually supply.
            onClick={(d) => { const id = (d as unknown as { id?: string }).id; if (id) onSelect(id); }}
            cursor="pointer"
          >
            {data.map((entry, index) => (
              <Cell
                key={`cell-${index}`}
                fill={getColor(entry.clusterId)}
                stroke={entry.id === selectedId ? '#1e40af' : '#fff'}
                strokeWidth={entry.id === selectedId ? 3 : data.length > 500 ? 0.5 : 1.5}
                opacity={selectedId && selectedId !== entry.id ? fadedOpacity : pointOpacity}
              />
            ))}
          </Scatter>
        </ScatterChart>
      </ResponsiveContainer>

      {/* Axis labels */}
      {!isCompact && (
        <>
          <div className="absolute bottom-1 left-1/2 transform -translate-x-1/2 text-[10px] text-slate-400 font-medium">
            PCA Component 1 (max variance direction) →
          </div>
          <div className="absolute left-1 top-1/2 transform -translate-y-1/2 -rotate-90 text-[10px] text-slate-400 font-medium">
            PCA Component 2 →
          </div>
        </>
      )}
    </div>
  );
};
