import React, { useCallback, useMemo, useRef, useEffect, useState } from 'react';
import ForceGraph2D from 'react-force-graph-2d';
import { NetworkGraph, ClusterData, NetworkAnalysis, ClusteringDiagnostics } from '../../types';
import { InfoIcon } from '../ui/MetricGlossary';

const escapeTooltipText = (value: unknown): string => String(value ?? '')
  .replace(/&/g, '&amp;')
  .replace(/</g, '&lt;')
  .replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;')
  .replace(/'/g, '&#39;');

interface SimilarityNetworkProps {
  networkGraph: NetworkGraph;
  clusters: ClusterData[];
  clusteringDiagnostics?: ClusteringDiagnostics;
  onSelect?: (id: string) => void;
  selectedId?: string | null;
}

interface GraphNode {
  id: string;
  clusterId: number;
  representationScore: number;
  semanticIsolation: number;
  color: string;
  val: number;
  degree: number;
  isBridge: boolean;
  isHub: boolean;
  isPeripheral: boolean;
  betweenness: number;
  clusteringCoeff: number;
}

interface GraphLink {
  source: string;
  target: string;
  weight: number;
  isCrossCluster: boolean;
}

type HighlightMode = 'none' | 'bridges' | 'hubs' | 'peripheral';

const formatPct = (v: number) => `${(v * 100).toFixed(0)}%`;
const formatDec = (v: number) => v.toFixed(3);

export const SimilarityNetwork: React.FC<SimilarityNetworkProps> = ({
  networkGraph,
  clusters,
  clusteringDiagnostics,
  onSelect,
  selectedId,
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const fgRef = useRef<any>(null);
  const [highlightMode, setHighlightMode] = useState<HighlightMode>('none');
  const [showMetrics, setShowMetrics] = useState(false);

  const analysis = networkGraph.analysis;
  const groupingUsable = clusteringDiagnostics?.usableForDownstream === true;

  const clusterColorMap = useMemo(() => {
    const map = new Map<number, string>();
    if (groupingUsable) clusters.forEach(c => map.set(c.id, c.color));
    return map;
  }, [clusters, groupingUsable]);

  const clusterIdToNode = useMemo(() => {
    const map = new Map<string, number>();
    networkGraph.nodes.forEach(n => map.set(n.id, n.clusterId));
    return map;
  }, [networkGraph.nodes]);

  const graphData = useMemo(() => {
    const nodes: GraphNode[] = networkGraph.nodes.map(n => {
      const metrics = analysis?.nodeMetrics[n.id];
      const degree = metrics?.degree ?? 0;
      return {
        id: n.id,
        clusterId: n.clusterId,
        representationScore: n.representationScore,
        semanticIsolation: n.semanticIsolation,
        color: clusterColorMap.get(n.clusterId) || '#94a3b8',
        // Size by degree (connectivity) — well-connected nodes are larger
        val: 2 + Math.min(degree, 8) * 0.8,
        degree,
        isBridge: groupingUsable && (analysis?.bridgeNodes.includes(n.id) ?? false),
        isHub: analysis?.hubNodes.includes(n.id) ?? false,
        isPeripheral: analysis?.peripheralNodes.includes(n.id) ?? false,
        betweenness: metrics?.betweennessCentrality ?? 0,
        clusteringCoeff: metrics?.clusteringCoefficient ?? 0,
      };
    });

    const links: GraphLink[] = networkGraph.edges.map(e => ({
      source: e.source,
      target: e.target,
      weight: e.weight,
      isCrossCluster: groupingUsable && clusterIdToNode.get(e.source) !== clusterIdToNode.get(e.target),
    }));

    return { nodes, links };
  }, [networkGraph, clusterColorMap, clusterIdToNode, analysis, groupingUsable]);

  // Zoom to fit on initial load
  useEffect(() => {
    const timer = setTimeout(() => {
      fgRef.current?.zoomToFit(400, 40);
    }, 500);
    return () => clearTimeout(timer);
  }, [graphData]);

  const handleNodeClick = useCallback((node: any) => {
    onSelect?.(node.id);
  }, [onSelect]);

  // Determine if a node should be highlighted given the current mode
  const isHighlighted = useCallback((node: any): boolean => {
    if (highlightMode === 'bridges') return node.isBridge;
    if (highlightMode === 'hubs') return node.isHub;
    if (highlightMode === 'peripheral') return node.isPeripheral;
    return false;
  }, [highlightMode]);

  const isDimmed = useCallback((node: any): boolean => {
    if (highlightMode === 'none') return false;
    return !isHighlighted(node);
  }, [highlightMode, isHighlighted]);

  // Custom node rendering
  const paintNode = useCallback((node: any, ctx: CanvasRenderingContext2D) => {
    const size = node.val || 3;
    const isSelected = node.id === selectedId;
    const dimmed = isDimmed(node);
    const highlighted = isHighlighted(node);

    // Selection ring
    if (isSelected) {
      ctx.beginPath();
      ctx.arc(node.x, node.y, size + 3, 0, 2 * Math.PI);
      ctx.fillStyle = 'rgba(255, 255, 255, 0.9)';
      ctx.fill();
    }

    // Bridge indicator — diamond-shaped outline
    if (highlighted && highlightMode === 'bridges') {
      ctx.save();
      ctx.beginPath();
      ctx.moveTo(node.x, node.y - size - 3);
      ctx.lineTo(node.x + size + 3, node.y);
      ctx.lineTo(node.x, node.y + size + 3);
      ctx.lineTo(node.x - size - 3, node.y);
      ctx.closePath();
      ctx.strokeStyle = '#f59e0b';
      ctx.lineWidth = 2;
      ctx.stroke();
      ctx.restore();
    }

    // Hub indicator — double ring
    if (highlighted && highlightMode === 'hubs') {
      ctx.beginPath();
      ctx.arc(node.x, node.y, size + 3, 0, 2 * Math.PI);
      ctx.strokeStyle = '#8b5cf6';
      ctx.lineWidth = 2;
      ctx.stroke();
    }

    // At-risk indicator ring (rep < 0.3)
    if (node.representationScore < 0.3) {
      ctx.beginPath();
      ctx.arc(node.x, node.y, size + 1, 0, 2 * Math.PI);
      ctx.strokeStyle = '#ef4444';
      ctx.lineWidth = 1.5;
      ctx.stroke();
    }

    // Main circle
    ctx.beginPath();
    ctx.arc(node.x, node.y, size, 0, 2 * Math.PI);
    const baseColor = isSelected ? '#facc15' : node.color;
    ctx.fillStyle = dimmed ? adjustAlpha(baseColor, 0.2) : baseColor;
    ctx.fill();

    // Label for selected or highlighted node
    if (isSelected || (highlighted && !dimmed)) {
      ctx.font = `bold ${isSelected ? 5 : 4}px sans-serif`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'top';
      ctx.fillStyle = '#1e293b';
      ctx.fillText(node.id, node.x, node.y + size + 2);
    }
  }, [selectedId, isDimmed, isHighlighted, highlightMode]);

  // Custom link rendering — cross-cluster edges are dashed & amber
  const paintLink = useCallback((link: any, ctx: CanvasRenderingContext2D) => {
    const source = link.source;
    const target = link.target;
    if (!source.x || !target.x) return;

    const isCross = link.isCrossCluster;
    const bothDimmed = isDimmed(source) && isDimmed(target);

    ctx.beginPath();
    if (isCross) {
      // Dashed line for cross-cluster edges
      ctx.setLineDash([3, 3]);
    }
    ctx.moveTo(source.x, source.y);
    ctx.lineTo(target.x, target.y);

    const baseAlpha = bothDimmed ? 0.05 : (0.15 + link.weight * 0.5);
    if (isCross) {
      ctx.strokeStyle = `rgba(245, 158, 11, ${baseAlpha})`;  // amber
      ctx.lineWidth = 0.8 + link.weight * 1.5;
    } else {
      ctx.strokeStyle = `rgba(148, 163, 184, ${baseAlpha})`;  // slate
      ctx.lineWidth = 0.5 + link.weight * 1.5;
    }
    ctx.stroke();
    ctx.setLineDash([]);
  }, [isDimmed]);

  const nodeTooltip = useCallback((node: any) => {
    const metrics = analysis?.nodeMetrics[node.id];
    const roleLabels: string[] = [];
    if (node.isBridge) roleLabels.push('<span style="color:#f59e0b">Bridge</span>');
    if (node.isHub) roleLabels.push('<span style="color:#8b5cf6">Hub</span>');
    if (node.isPeripheral) roleLabels.push('<span style="color:#94a3b8">Peripheral</span>');
    if (node.representationScore < 0.3) roleLabels.push('<span style="color:#ef4444">At Risk</span>');

    return `<div style="background: #0f172a; color: white; padding: 10px 14px; border-radius: 8px; font-size: 12px; max-width: 260px; line-height: 1.6;">
      <div style="font-weight: bold; margin-bottom: 4px; font-size: 13px;">${escapeTooltipText(node.id)}</div>
      ${roleLabels.length > 0 ? `<div style="margin-bottom: 4px;">${roleLabels.join(' · ')}</div>` : ''}
      <div>Cluster: ${node.clusterId + 1} · Rep: ${(node.representationScore * 100).toFixed(0)}%</div>
      <div>Degree: ${node.degree} · Isolation: ${node.semanticIsolation.toFixed(2)}</div>
      ${metrics ? `<div style="border-top: 1px solid #334155; margin-top: 4px; padding-top: 4px;">
        <div>Betweenness: ${metrics.betweennessCentrality.toFixed(4)}</div>
        <div>Clustering coeff: ${metrics.clusteringCoefficient.toFixed(3)}</div>
        <div>Cross-cluster edges: ${metrics.crossClusterEdges} / ${metrics.degree}</div>
      </div>` : ''}
    </div>`;
  }, [analysis]);

  if (networkGraph.edges.length === 0) {
    return (
      <div className="flex items-center justify-center py-16 text-sm text-slate-500">
        No mutual k-nearest-neighbor links were retained under the current construction. This does not prove the source records are substantively unrelated.
      </div>
    );
  }

  // Count connected vs isolated nodes
  const connectedIds = new Set<string>();
  networkGraph.edges.forEach(e => { connectedIds.add(e.source); connectedIds.add(e.target); });
  const isolatedCount = networkGraph.nodes.length - connectedIds.size;
  const crossClusterEdgeCount = graphData.links.filter(l => l.isCrossCluster).length;

  return (
    <div className="space-y-3">
      {/* Network Metrics Summary */}
      {analysis && (
        <div className="space-y-2">
          {/* Quick stats bar */}
          <div className="flex flex-wrap gap-2">
            <MetricBadge label="Modularity" value={formatDec(analysis.modularity)}
              color="slate"
              tooltip="Newman modularity for this constructed graph; reported descriptively without a universal pass threshold."
            />
            <MetricBadge label="Density" value={formatPct(analysis.density)} color="slate"
              tooltip="Fraction of possible mutual-kNN edges that exist."
            />
            <MetricBadge label="Avg Clustering" value={formatDec(analysis.avgClusteringCoefficient)} color="purple"
              tooltip="Average local transitivity — how cliquish neighborhoods are."
            />
            <MetricBadge label="Components" value={String(analysis.connectedComponents)}
              color={analysis.connectedComponents > 1 ? 'amber' : 'green'}
              tooltip="Disconnected subgraphs under the mutual-kNN construction; omitted edges may still have nonzero similarity."
            />
            <MetricBadge label="Bridges" value={String(analysis.bridgeNodes.length)} color="amber"
              tooltip="Graph nodes with at least one retained cross-cluster edge."
            />
            <MetricBadge label="Peripheral" value={String(analysis.peripheralNodes.length)}
              color={analysis.peripheralNodes.length > 0 ? 'red' : 'green'}
              tooltip="Nodes with 0–1 retained mutual-kNN connections."
            />
          </div>

          {/* Highlight controls + expandable metrics */}
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-[10px] font-bold text-slate-500 uppercase">Highlight:</span>
            {(['none', 'bridges', 'hubs', 'peripheral'] as HighlightMode[]).map(mode => (
              <button key={mode} onClick={() => setHighlightMode(mode)}
                className={`text-[11px] px-2.5 py-1 rounded-full border transition-colors ${
                  highlightMode === mode
                    ? 'bg-slate-800 text-white border-slate-800'
                    : 'bg-white text-slate-600 border-slate-300 hover:border-slate-400'
                }`}
              >
                {mode === 'none' ? 'All' : mode.charAt(0).toUpperCase() + mode.slice(1)}
              </button>
            ))}
            <button onClick={() => setShowMetrics(!showMetrics)}
              className="ml-auto text-[11px] text-indigo-600 hover:text-indigo-800 underline"
            >
              {showMetrics ? 'Hide details' : 'Show details'}
            </button>
          </div>

          {/* Expandable interpretation panel */}
          {showMetrics && (
            <div className="bg-slate-50 rounded-lg border border-slate-200 p-3 text-xs text-slate-700 space-y-2">
              <div className="font-semibold text-slate-800">Network Interpretation</div>
              {groupingUsable
                ? <InterpretModularity Q={analysis.modularity} />
                : <div className="text-amber-700">Cluster-conditioned modularity and bridge interpretations are unavailable because no validated semantic partition exists.</div>}
              <InterpretComponents count={analysis.connectedComponents} total={networkGraph.nodes.length} />
              {groupingUsable && <InterpretBridges bridges={analysis.bridgeNodes} clusters={clusters} nodeMetrics={analysis.nodeMetrics} />}
              {analysis.peripheralNodes.length > 0 && (
                <div>
                  <span className="font-medium text-slate-700">Peripheral graph nodes: </span>
                  {analysis.peripheralNodes.slice(0, 8).join(', ')}
                  {analysis.peripheralNodes.length > 8 && ` (+${analysis.peripheralNodes.length - 8} more)`}
                  {' — these records have few retained mutual-kNN edges; inspect them before inferring uniqueness or undersampling.'}
                </div>
              )}
              {crossClusterEdgeCount > 0 && (
                <div>
                  <span className="font-medium">Cross-cluster edges: </span>
                  {crossClusterEdgeCount} of {networkGraph.edges.length} edges ({formatPct(crossClusterEdgeCount / networkGraph.edges.length)}) connect different clusters
                  {' — '}
                  {crossClusterEdgeCount / networkGraph.edges.length > 0.3
                    ? 'a comparatively large share of retained edges cross the automated cluster labels.'
                    : 'a comparatively small share of retained edges cross the automated cluster labels.'
                  }
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* Force-directed graph */}
      <div ref={containerRef} className="relative w-full overflow-visible" style={{ height: 500 }}>
        <ForceGraph2D
          ref={fgRef}
          graphData={graphData}
          nodeCanvasObject={paintNode}
          nodePointerAreaPaint={(node: any, color: string, ctx: CanvasRenderingContext2D) => {
            const size = node.val || 3;
            ctx.beginPath();
            ctx.arc(node.x, node.y, size + 2, 0, 2 * Math.PI);
            ctx.fillStyle = color;
            ctx.fill();
          }}
          linkCanvasObject={paintLink}
          onNodeClick={handleNodeClick}
          nodeLabel={nodeTooltip}
          cooldownTicks={100}
          warmupTicks={50}
          d3AlphaDecay={0.04}
          d3VelocityDecay={0.3}
          enableZoomInteraction={true}
          enablePanInteraction={true}
          enableNodeDrag={true}
        />

        {/* Legend */}
        <div className="absolute bottom-3 left-3 bg-white/90 backdrop-blur border border-slate-200 rounded-lg p-3 text-xs space-y-1.5 shadow-sm max-w-[280px] max-h-[200px] overflow-y-auto z-10">
          <div className="font-semibold text-slate-700 flex items-center gap-1">
            Mutual k-NN (k={networkGraph.k}) <InfoIcon metricKey="similarityNetwork" />
          </div>
          <div className="text-slate-500">{networkGraph.edges.length} edges · {networkGraph.nodes.length} participants</div>
          {isolatedCount > 0 && (
            <div className="text-red-600">{isolatedCount} unconnected (no mutual neighbors)</div>
          )}
          <div className="flex flex-wrap gap-2 mt-1.5 pt-1.5 border-t border-slate-200">
            {(groupingUsable ? clusters : [{ id: 0, label: 'Unpartitioned records', color: '#94a3b8' }]).map(c => (
              <div key={c.id} className="flex items-center gap-1">
                <span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: c.color }} />
                <span className="text-slate-600">{c.label}</span>
              </div>
            ))}
          </div>
          <div className="space-y-1 pt-1 border-t border-slate-200 mt-1">
            <div className="flex items-center gap-1">
              <span className="w-2.5 h-2.5 rounded-full border-2 border-red-500 bg-transparent" />
              <span className="text-slate-600">At risk (rep &lt; 30%)</span>
            </div>
            {groupingUsable && <div className="flex items-center gap-1">
              <span className="w-4 h-0 border-t-2 border-dashed border-amber-500" />
              <span className="text-slate-600">Cross-group edge</span>
            </div>}
            <div className="flex items-center gap-1">
              <span className="w-4 h-0 border-t border-slate-400" />
              <span className="text-slate-600">Similarity edge</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

// ── Helper components ──────────────────────────────────────────────────────────

const MetricBadge: React.FC<{ label: string; value: string; color: string; tooltip: string }> = ({ label, value, color, tooltip }) => {
  const colorClasses: Record<string, string> = {
    green: 'bg-emerald-50 text-emerald-700 border-emerald-200',
    blue: 'bg-blue-50 text-blue-700 border-blue-200',
    amber: 'bg-amber-50 text-amber-700 border-amber-200',
    red: 'bg-red-50 text-red-700 border-red-200',
    purple: 'bg-purple-50 text-purple-700 border-purple-200',
    slate: 'bg-slate-50 text-slate-700 border-slate-200',
  };
  return (
    <div className={`flex items-center gap-1.5 px-2.5 py-1 rounded-md border text-[11px] ${colorClasses[color] || colorClasses.slate}`} title={tooltip}>
      <span className="font-medium opacity-70">{label}</span>
      <span className="font-bold">{value}</span>
    </div>
  );
};

const InterpretModularity: React.FC<{ Q: number }> = ({ Q }) => {
  return (
    <div>
      <span className="font-medium">Modularity Q = {Q.toFixed(3)}: </span>
      descriptive separation of supplied cluster labels on this mutual-kNN graph. No universal social or thematic interpretation is assumed.
    </div>
  );
};

const InterpretComponents: React.FC<{ count: number; total: number }> = ({ count, total }) => {
  if (count <= 1) return null;
  return (
    <div>
      <span className="font-medium text-amber-700">{count} disconnected components: </span>
      The graph has {count} disconnected subgraphs after mutual-kNN sparsification. This means no retained path connects them, not that every cross-component similarity is zero.
    </div>
  );
};

const InterpretBridges: React.FC<{
  bridges: string[];
  clusters: ClusterData[];
  nodeMetrics: Record<string, { crossClusterEdges: number; betweennessCentrality: number; degree: number }>;
}> = ({ bridges, clusters, nodeMetrics }) => {
  if (bridges.length === 0) {
    return (
      <div>
        <span className="font-medium">No bridge nodes found — </span>
        all retained edges are within automated clusters. This is graph structure, not proof that the themes are isolated.
      </div>
    );
  }
  // Sort bridges by betweenness
  const sorted = [...bridges].sort((a, b) => (nodeMetrics[b]?.betweennessCentrality || 0) - (nodeMetrics[a]?.betweennessCentrality || 0));
  const top = sorted.slice(0, 5);
  return (
    <div>
      <span className="font-medium text-amber-700">Key bridges: </span>
      {top.map(id => `${id} (betw: ${nodeMetrics[id]?.betweennessCentrality.toFixed(3)}, ${nodeMetrics[id]?.crossClusterEdges} cross-edges)`).join('; ')}
      {bridges.length > 5 && ` (+${bridges.length - 5} more)`}
      {' — these records occupy cross-cluster graph positions; mediation capacity requires separate social evidence.'}
    </div>
  );
};

// Helper: parse a CSS color and apply alpha
const adjustAlpha = (color: string, alpha: number): string => {
  // Handle hex
  if (color.startsWith('#')) {
    const r = parseInt(color.slice(1, 3), 16);
    const g = parseInt(color.slice(3, 5), 16);
    const b = parseInt(color.slice(5, 7), 16);
    return `rgba(${r},${g},${b},${alpha})`;
  }
  return color;
};
