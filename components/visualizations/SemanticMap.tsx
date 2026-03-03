import React, { useMemo } from 'react';
import { ScatterChart, Scatter, XAxis, YAxis, ZAxis, Tooltip, ResponsiveContainer, Cell, ReferenceLine } from 'recharts';
import { ParticipantAnalysis, ClusterData } from '../../types';
import { useResponsiveChart, formatMetric } from '../../hooks/useResponsiveChart';

interface SemanticMapProps {
  data: ParticipantAnalysis[];
  clusters: ClusterData[];
  onSelect: (id: string) => void;
  selectedId: string | null;
}

export const SemanticMap: React.FC<SemanticMapProps> = ({ data, clusters, onSelect, selectedId }) => {
  const { containerRef, isCompact, isMobile, config, width } = useResponsiveChart({ minHeight: 380 });

  const getColor = (clusterId: number) => {
    return clusters.find(c => c.id === clusterId)?.color || '#94a3b8';
  };

  // Calculate cluster statistics for legend
  const clusterStats = useMemo(() => {
    return clusters.map(c => ({
      ...c,
      count: data.filter(d => d.clusterId === c.id).length,
      avgRep: data.filter(d => d.clusterId === c.id)
        .reduce((sum, d) => sum + d.representationScore, 0) /
        Math.max(1, data.filter(d => d.clusterId === c.id).length)
    }));
  }, [data, clusters]);

  // Find selected participant for enhanced display
  const selectedParticipant = selectedId ? data.find(p => p.id === selectedId) : null;

  const CustomTooltip = ({ active, payload }: any) => {
    if (active && payload && payload.length) {
      const d = payload[0].payload;
      const clusterInfo = clusters.find(c => c.id === d.clusterId);
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
            <span className="text-slate-400">Sentiment:</span>
            <span className={`text-right capitalize ${d.sentiment === 'positive' ? 'text-green-400' :
                d.sentiment === 'negative' ? 'text-red-400' : 'text-slate-400'
              }`}>{d.sentiment}</span>
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
            Topic Clusters
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
        <div className="absolute top-3 left-3 z-10 text-[10px] text-slate-500 bg-white/80 px-2 py-1 rounded">
          Click points to select • Size = representation score
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
            onClick={(d) => onSelect(d.id)}
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
            PCA Dimension 1 →
          </div>
          <div className="absolute left-1 top-1/2 transform -translate-y-1/2 -rotate-90 text-[10px] text-slate-400 font-medium">
            PCA Dimension 2 →
          </div>
        </>
      )}
    </div>
  );
};
