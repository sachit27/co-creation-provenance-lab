import React, { useCallback, useMemo, useRef, useEffect } from 'react';
import ForceGraph2D from 'react-force-graph-2d';
import { NetworkGraph, ClusterData } from '../../types';

interface SimilarityNetworkProps {
  networkGraph: NetworkGraph;
  clusters: ClusterData[];
  onSelect?: (id: string) => void;
  selectedId?: string | null;
}

interface GraphNode {
  id: string;
  clusterId: number;
  representationScore: number;
  semanticIsolation: number;
  color: string;
  val: number; // node size
}

interface GraphLink {
  source: string;
  target: string;
  weight: number;
}

export const SimilarityNetwork: React.FC<SimilarityNetworkProps> = ({
  networkGraph,
  clusters,
  onSelect,
  selectedId,
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const fgRef = useRef<any>(null);

  const clusterColorMap = useMemo(() => {
    const map = new Map<number, string>();
    clusters.forEach(c => map.set(c.id, c.color));
    return map;
  }, [clusters]);

  const graphData = useMemo(() => {
    const nodes: GraphNode[] = networkGraph.nodes.map(n => ({
      id: n.id,
      clusterId: n.clusterId,
      representationScore: n.representationScore,
      semanticIsolation: n.semanticIsolation,
      color: clusterColorMap.get(n.clusterId) || '#94a3b8',
      // Size inversely proportional to representation: at-risk voices appear larger
      val: 2 + (1 - n.representationScore) * 6,
    }));

    const links: GraphLink[] = networkGraph.edges.map(e => ({
      source: e.source,
      target: e.target,
      weight: e.weight,
    }));

    return { nodes, links };
  }, [networkGraph, clusterColorMap]);

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

  // Custom node rendering with selection highlight
  const paintNode = useCallback((node: any, ctx: CanvasRenderingContext2D) => {
    const size = node.val || 3;
    const isSelected = node.id === selectedId;

    // Selection ring
    if (isSelected) {
      ctx.beginPath();
      ctx.arc(node.x, node.y, size + 2, 0, 2 * Math.PI);
      ctx.fillStyle = 'rgba(255, 255, 255, 0.9)';
      ctx.fill();
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
    ctx.fillStyle = isSelected ? '#facc15' : node.color;
    ctx.fill();

    // Label for selected node
    if (isSelected) {
      ctx.font = 'bold 4px sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'top';
      ctx.fillStyle = '#1e293b';
      ctx.fillText(node.id, node.x, node.y + size + 2);
    }
  }, [selectedId]);

  // Custom link rendering with weight-based opacity
  const paintLink = useCallback((link: any, ctx: CanvasRenderingContext2D) => {
    const source = link.source;
    const target = link.target;
    if (!source.x || !target.x) return;

    ctx.beginPath();
    ctx.moveTo(source.x, source.y);
    ctx.lineTo(target.x, target.y);
    // Opacity scales with similarity weight (0.3–0.8 range for visibility)
    const alpha = 0.15 + link.weight * 0.5;
    ctx.strokeStyle = `rgba(148, 163, 184, ${alpha})`;
    ctx.lineWidth = 0.5 + link.weight * 1.5;
    ctx.stroke();
  }, []);

  const nodeTooltip = useCallback((node: any) => {
    return `<div style="background: #0f172a; color: white; padding: 8px 12px; border-radius: 8px; font-size: 12px; max-width: 220px; line-height: 1.5;">
      <div style="font-weight: bold; margin-bottom: 4px;">${node.id}</div>
      <div>Cluster: ${node.clusterId + 1}</div>
      <div>Representation: ${(node.representationScore * 100).toFixed(0)}%</div>
      <div>Isolation: ${node.semanticIsolation.toFixed(2)}</div>
    </div>`;
  }, []);

  if (networkGraph.edges.length === 0) {
    return (
      <div className="flex items-center justify-center py-16 text-sm text-slate-500">
        No mutual similarity links found — participants' perspectives are highly distinct from each other.
      </div>
    );
  }

  // Count connected vs isolated nodes
  const connectedIds = new Set<string>();
  networkGraph.edges.forEach(e => { connectedIds.add(e.source); connectedIds.add(e.target); });
  const isolatedCount = networkGraph.nodes.length - connectedIds.size;

  return (
    <div ref={containerRef} className="relative w-full" style={{ height: '100%', minHeight: 500 }}>
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
      <div className="absolute bottom-3 left-3 bg-white/90 backdrop-blur border border-slate-200 rounded-lg p-3 text-xs space-y-1.5 shadow-sm">
        <div className="font-semibold text-slate-700 mb-1">Mutual k-NN (k={networkGraph.k})</div>
        <div className="text-slate-500">{networkGraph.edges.length} edges · {networkGraph.nodes.length} participants</div>
        {isolatedCount > 0 && (
          <div className="text-red-600">{isolatedCount} unconnected (no mutual neighbors)</div>
        )}
        <div className="flex flex-wrap gap-2 mt-1.5 pt-1.5 border-t border-slate-200">
          {clusters.map(c => (
            <div key={c.id} className="flex items-center gap-1">
              <span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: c.color }} />
              <span className="text-slate-600">{c.label}</span>
            </div>
          ))}
        </div>
        <div className="flex items-center gap-1 pt-1 border-t border-slate-200 mt-1">
          <span className="w-2.5 h-2.5 rounded-full border-2 border-red-500 bg-transparent" />
          <span className="text-slate-600">At risk (rep &lt; 30%)</span>
        </div>
      </div>
    </div>
  );
};
