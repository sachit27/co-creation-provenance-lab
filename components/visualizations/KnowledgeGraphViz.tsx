/**
 * KnowledgeGraphViz — Interactive Knowledge Graph Visualization
 *
 * Renders the GraphRAG-constructed knowledge graph as a force-directed graph.
 * - Nodes: entities, sized by frequency, colored by community OR summary presence
 * - Edges: relationships, weighted by strength
 * - Bridge entities (cross-community connectors) shown with a distinctive ring
 * - Summary cross-reference: shows which concepts made it into the summary
 */

import React, { useCallback, useMemo, useRef, useState, useEffect } from 'react';
import ForceGraph2D from 'react-force-graph-2d';
import { KnowledgeGraph, KGCommunity, ClusterData } from '../../types';
import { InfoIcon } from '../ui/MetricGlossary';

interface KnowledgeGraphVizProps {
  knowledgeGraph: KnowledgeGraph;
  clusters: ClusterData[];
  onSelectParticipant?: (id: string) => void;
}

interface GraphNode {
  id: string;
  name: string;
  type: string;
  description: string;
  frequency: number;
  communityId: number;
  sourceParticipants: string[];
  summaryPresence: 'present' | 'absent' | 'partial' | undefined;
  isBridge: boolean;
  color: string;
  val: number;
}

interface GraphLink {
  source: string;
  target: string;
  relationshipType: string;
  description: string;
  strength: number;
}

type ColorMode = 'community' | 'provenance';

// Community palette
const COMMUNITY_COLORS = [
  '#6366f1', '#f59e0b', '#10b981', '#ef4444',
  '#8b5cf6', '#06b6d4', '#f97316', '#ec4899',
];

// Summary presence palette
const PROVENANCE_COLORS: Record<string, string> = {
  present: '#10b981',   // green — concept captured in summary
  partial: '#f59e0b',   // amber — partially mentioned
  absent: '#ef4444',    // red — concept missing from summary
  unknown: '#94a3b8',   // gray — no summary cross-reference data
};

export const KnowledgeGraphViz: React.FC<KnowledgeGraphVizProps> = ({
  knowledgeGraph,
  clusters,
  onSelectParticipant,
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const fgRef = useRef<any>(null);
  const [selectedCommunity, setSelectedCommunity] = useState<number | null>(null);
  const [showInterpretation, setShowInterpretation] = useState(false);
  const [hoveredNode, setHoveredNode] = useState<string | null>(null);
  const [showEdgeLabels, setShowEdgeLabels] = useState(false);
  const [minFrequency, setMinFrequency] = useState(1);
  const [colorMode, setColorMode] = useState<ColorMode>('community');

  const { entities, relationships, communities, metrics } = knowledgeGraph;

  // Check if provenance data is available
  const hasProvenanceData = useMemo(() =>
    entities.some(e => e.summaryPresence !== undefined),
    [entities]
  );

  const maxFrequency = useMemo(() => Math.max(...entities.map(e => e.frequency), 1), [entities]);

  useEffect(() => {
    if (entities.length > 60) setMinFrequency(2);
    else setMinFrequency(1);
  }, [entities.length]);

  const communityColorMap = useMemo(() => {
    const map = new Map<number, string>();
    communities.forEach((c, i) => map.set(c.id, COMMUNITY_COLORS[i % COMMUNITY_COLORS.length]));
    return map;
  }, [communities]);

  // Provenance stats
  const provenanceStats = useMemo(() => {
    if (!hasProvenanceData) return null;
    const present = entities.filter(e => e.summaryPresence === 'present').length;
    const partial = entities.filter(e => e.summaryPresence === 'partial').length;
    const absent = entities.filter(e => e.summaryPresence === 'absent').length;
    const bridges = entities.filter(e => e.isBridge).length;
    const droppedBridges = entities.filter(e => e.isBridge && e.summaryPresence === 'absent').length;
    return { present, partial, absent, bridges, droppedBridges };
  }, [entities, hasProvenanceData]);

  // Build filtered graph data
  const graphData = useMemo(() => {
    let filtered = entities.filter(e => e.frequency >= minFrequency);
    if (selectedCommunity !== null) {
      filtered = filtered.filter(e => e.communityId === selectedCommunity);
    }

    const nodeNameSet = new Set(filtered.map(e => e.name));

    const nodes: GraphNode[] = filtered.map(e => {
      const communityColor = communityColorMap.get(e.communityId) || '#94a3b8';
      const provenanceColor = PROVENANCE_COLORS[e.summaryPresence || 'unknown'];
      return {
        id: e.name,
        name: e.name,
        type: e.type,
        description: e.description,
        frequency: e.frequency,
        communityId: e.communityId,
        sourceParticipants: e.sourceParticipants,
        summaryPresence: e.summaryPresence,
        isBridge: e.isBridge || false,
        color: colorMode === 'provenance' && hasProvenanceData ? provenanceColor : communityColor,
        val: Math.max(3, Math.min(10, e.frequency * 1.5 + 2)),
      };
    });

    const links: GraphLink[] = relationships
      .filter(r => nodeNameSet.has(r.source) && nodeNameSet.has(r.target))
      .map(r => ({
        source: r.source,
        target: r.target,
        relationshipType: r.relationshipType,
        description: r.description,
        strength: r.strength,
      }));

    return { nodes, links };
  }, [entities, relationships, selectedCommunity, communityColorMap, minFrequency, colorMode, hasProvenanceData]);

  useEffect(() => {
    if (fgRef.current && graphData.nodes.length > 0) {
      const timer = setTimeout(() => fgRef.current?.zoomToFit(300, 50), 600);
      return () => clearTimeout(timer);
    }
  }, [graphData]);

  // Node renderer
  const drawNode = useCallback((node: any, ctx: CanvasRenderingContext2D, globalScale: number) => {
    const gn = node as GraphNode;
    const size = gn.val;
    const isHovered = hoveredNode === gn.id;
    const isDimmed = selectedCommunity !== null && gn.communityId !== selectedCommunity;

    ctx.save();
    ctx.globalAlpha = isDimmed ? 0.15 : (isHovered ? 1.0 : 0.85);

    // Bridge indicator: outer ring
    if (gn.isBridge && !isDimmed) {
      ctx.beginPath();
      ctx.arc(node.x, node.y, size + 2.5 / globalScale, 0, Math.PI * 2);
      ctx.strokeStyle = '#f59e0b';
      ctx.lineWidth = 1.8 / globalScale;
      ctx.setLineDash([3 / globalScale, 2 / globalScale]);
      ctx.stroke();
      ctx.setLineDash([]);
    }

    // Absent-from-summary indicator: X pattern behind node (in provenance mode)
    if (colorMode === 'provenance' && gn.summaryPresence === 'absent' && !isDimmed) {
      ctx.beginPath();
      ctx.arc(node.x, node.y, size + 1.5 / globalScale, 0, Math.PI * 2);
      ctx.strokeStyle = '#fca5a5';
      ctx.lineWidth = 1.5 / globalScale;
      ctx.stroke();
    }

    // Node circle
    ctx.beginPath();
    ctx.arc(node.x, node.y, size, 0, Math.PI * 2);
    ctx.fillStyle = gn.color;
    ctx.fill();

    if (isHovered) {
      ctx.strokeStyle = '#1e293b';
      ctx.lineWidth = 1.5 / globalScale;
      ctx.stroke();
    }

    // Label
    const shouldShowLabel = isHovered || (globalScale > 1.0) || (gn.frequency >= 3 && globalScale > 0.5);
    if (shouldShowLabel && !isDimmed) {
      const fontSize = isHovered ? Math.max(10, 12 / globalScale) : Math.max(7, 9 / globalScale);
      ctx.globalAlpha = isHovered ? 1 : 0.8;
      ctx.font = `${isHovered ? 'bold ' : ''}${fontSize}px sans-serif`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'top';

      const textWidth = ctx.measureText(gn.name).width;
      ctx.fillStyle = 'rgba(255,255,255,0.85)';
      ctx.fillRect(node.x - textWidth / 2 - 1, node.y + size + 1, textWidth + 2, fontSize + 2);

      ctx.fillStyle = '#1e293b';
      ctx.fillText(gn.name, node.x, node.y + size + 2);
    }

    ctx.restore();
  }, [hoveredNode, selectedCommunity, colorMode]);

  // Link renderer
  const drawLink = useCallback((link: any, ctx: CanvasRenderingContext2D, globalScale: number) => {
    const source = link.source;
    const target = link.target;
    if (!source?.x || !target?.x) return;

    const sourceComm = (source as any).communityId;
    const targetComm = (target as any).communityId;
    const isCross = sourceComm !== targetComm;

    const isHoveredEndpoint = hoveredNode === source.id || hoveredNode === target.id;
    ctx.save();
    ctx.globalAlpha = isHoveredEndpoint ? 0.9 : (isCross ? 0.4 : 0.55);

    ctx.beginPath();
    ctx.moveTo(source.x, source.y);
    ctx.lineTo(target.x, target.y);
    ctx.strokeStyle = isHoveredEndpoint ? '#3b82f6' : (isCross ? '#d97706' : '#64748b');
    ctx.lineWidth = Math.max(0.5, (link.strength || 5) / 10 * 2.5) / globalScale;
    if (isCross && !isHoveredEndpoint) ctx.setLineDash([4 / globalScale, 2 / globalScale]);
    ctx.stroke();
    ctx.setLineDash([]);

    if (showEdgeLabels && globalScale > 1.5) {
      const midX = (source.x + target.x) / 2;
      const midY = (source.y + target.y) / 2;
      const fontSize = Math.max(6, 8 / globalScale);
      ctx.font = `${fontSize}px sans-serif`;
      ctx.textAlign = 'center';
      ctx.fillStyle = '#475569';
      ctx.globalAlpha = 0.75;
      ctx.fillText(link.relationshipType || '', midX, midY - 2 / globalScale);
    }

    ctx.restore();
  }, [showEdgeLabels, hoveredNode]);

  // Tooltip with provenance info
  const nodeTooltip = useCallback((node: any) => {
    const gn = node as GraphNode;
    const commLabel = communities.find(c => c.id === gn.communityId)?.label || 'Unassigned';
    const presenceLabel = gn.summaryPresence === 'present' ? '&#10003; In summary'
      : gn.summaryPresence === 'partial' ? '&#9679; Partially in summary'
      : gn.summaryPresence === 'absent' ? '&#10007; Absent from summary'
      : '';
    const presenceColor = gn.summaryPresence === 'present' ? '#10b981'
      : gn.summaryPresence === 'partial' ? '#f59e0b'
      : gn.summaryPresence === 'absent' ? '#ef4444' : '#94a3b8';
    const bridgeLabel = gn.isBridge ? '<div style="color:#f59e0b;font-size:10px;margin-top:2px;">&#9733; Bridge entity (connects communities)</div>' : '';

    return `<div style="background:#1e293b;color:white;padding:8px 12px;border-radius:6px;font-size:12px;max-width:280px;line-height:1.4;">
      <div style="font-weight:600;font-size:13px;margin-bottom:3px;">${gn.name}</div>
      <div style="color:#94a3b8;font-size:11px;">${gn.type}</div>
      <div style="margin:4px 0;">${gn.description}</div>
      <div style="color:#94a3b8;font-size:11px;">Mentioned ${gn.frequency}x by ${gn.sourceParticipants.length} participant${gn.sourceParticipants.length !== 1 ? 's' : ''}</div>
      <div style="color:#94a3b8;font-size:11px;">Community: ${commLabel}</div>
      ${presenceLabel ? `<div style="color:${presenceColor};font-size:11px;margin-top:3px;font-weight:500;">${presenceLabel}</div>` : ''}
      ${bridgeLabel}
    </div>`;
  }, [communities]);

  const MetricBadge: React.FC<{ label: string; value: string | number; detail?: string; highlight?: boolean }> = ({ label, value, detail, highlight }) => (
    <div className={`rounded-lg px-3 py-2 text-center ${highlight ? 'bg-red-50 ring-1 ring-red-200' : 'bg-slate-50'}`} title={detail}>
      <div className="text-[10px] text-slate-500 uppercase tracking-wide">{label}</div>
      <div className={`text-sm font-semibold ${highlight ? 'text-red-700' : 'text-slate-800'}`}>{value}</div>
    </div>
  );

  // Interpretation with provenance insights
  const interpretation = useMemo(() => {
    const insights: string[] = [];

    if (metrics.modularity > 0.4) {
      insights.push(`Strong community structure (Q=${metrics.modularity.toFixed(3)}). Participant perspectives form ${metrics.communityCount} distinct thematic groups with clear boundaries.`);
    } else if (metrics.modularity > 0.2) {
      insights.push(`Moderate community structure (Q=${metrics.modularity.toFixed(3)}). Themes are somewhat distinct but share cross-cutting connections.`);
    } else {
      insights.push(`Weak community structure (Q=${metrics.modularity.toFixed(3)}). Perspectives are highly interconnected with overlapping themes.`);
    }

    const covPct = (metrics.participantCoverage * 100).toFixed(0);
    if (metrics.participantCoverage < 0.8) {
      insights.push(`${covPct}% participant coverage. ${(100 - Number(covPct))}% of voices use abstract language not captured by entity extraction.`);
    } else {
      insights.push(`${covPct}% participant coverage — nearly all voices are represented in the concept graph.`);
    }

    // Provenance insights
    if (provenanceStats) {
      const total = provenanceStats.present + provenanceStats.partial + provenanceStats.absent;
      if (total > 0) {
        const capturedPct = ((provenanceStats.present + provenanceStats.partial) / total * 100).toFixed(0);
        const absentPct = (provenanceStats.absent / total * 100).toFixed(0);
        insights.push(`Summary captures ${capturedPct}% of extracted concepts. ${provenanceStats.absent} concepts (${absentPct}%) are absent from the summary — switch to "Summary Presence" view to identify them.`);

        if (provenanceStats.droppedBridges > 0) {
          const droppedBridgeNames = entities
            .filter(e => e.isBridge && e.summaryPresence === 'absent')
            .map(e => `"${e.name}"`).slice(0, 3).join(', ');
          insights.push(`${provenanceStats.droppedBridges} cross-cutting bridge concept${provenanceStats.droppedBridges > 1 ? 's are' : ' is'} missing from the summary: ${droppedBridgeNames}. Bridge concepts connect separate discussion themes and are often the first to be dropped during summarization.`);
        }
      }

      if (provenanceStats.bridges > 0) {
        insights.push(`${provenanceStats.bridges} bridge entities span multiple communities — these cross-cutting themes represent nuanced connections between otherwise separate conversations.`);
      }
    }

    if (communities.length > 1) {
      const sizes = communities.map(c => c.entityNames.length);
      const maxSize = Math.max(...sizes);
      const minSize = Math.min(...sizes);
      if (maxSize > minSize * 3) {
        const largest = communities.find(c => c.entityNames.length === maxSize);
        insights.push(`Theme imbalance: "${largest?.label}" dominates with ${maxSize} entities vs ${minSize} in the smallest.`);
      }
    }

    const topEntities = [...entities].sort((a, b) => b.frequency - a.frequency).slice(0, 3);
    if (topEntities.length > 0) {
      insights.push(`Core entities: ${topEntities.map(e => `"${e.name}" (${e.frequency}x)`).join(', ')}.`);
    }

    return insights;
  }, [metrics, communities, relationships, entities, provenanceStats]);

  return (
    <div className="space-y-3">
      {/* Controls */}
      <div className="flex flex-wrap items-center gap-2 text-xs">
        {/* Color mode toggle */}
        {hasProvenanceData && (
          <div className="flex rounded-md overflow-hidden border border-slate-200 mr-2">
            <button
              onClick={() => setColorMode('community')}
              className={`px-2.5 py-1 text-[11px] font-medium transition-colors ${colorMode === 'community' ? 'bg-indigo-100 text-indigo-700' : 'bg-white text-slate-500 hover:bg-slate-50'}`}
            >
              Communities
            </button>
            <button
              onClick={() => setColorMode('provenance')}
              className={`px-2.5 py-1 text-[11px] font-medium transition-colors ${colorMode === 'provenance' ? 'bg-indigo-100 text-indigo-700' : 'bg-white text-slate-500 hover:bg-slate-50'}`}
            >
              Summary Presence
            </button>
          </div>
        )}

        {/* Community filter (only in community mode) */}
        {colorMode === 'community' && (
          <>
            <span className="text-slate-500 font-medium">Filter:</span>
            <button
              onClick={() => setSelectedCommunity(null)}
              className={`px-2 py-1 rounded ${selectedCommunity === null ? 'bg-indigo-100 text-indigo-700 font-medium' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'}`}
            >All</button>
            {communities.slice(0, 8).map(c => (
              <button
                key={c.id}
                onClick={() => setSelectedCommunity(prev => prev === c.id ? null : c.id)}
                className={`px-2 py-1 rounded flex items-center gap-1 ${selectedCommunity === c.id ? 'ring-2 ring-offset-1 ring-indigo-400 bg-slate-100' : 'bg-slate-50 hover:bg-slate-100'}`}
                title={c.summary}
              >
                <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: communityColorMap.get(c.id) }} />
                <span className="truncate max-w-[100px]">{c.label.split(',')[0]}</span>
              </button>
            ))}
            {communities.length > 8 && (
              <span className="text-slate-400">+{communities.length - 8} more</span>
            )}
          </>
        )}

        {/* Frequency filter */}
        {maxFrequency > 2 && (
          <div className="flex items-center gap-1.5 ml-auto">
            <span className="text-slate-500">Min freq:</span>
            <input
              type="range"
              min={1}
              max={Math.min(maxFrequency, 10)}
              value={minFrequency}
              onChange={(e) => setMinFrequency(Number(e.target.value))}
              className="w-16 h-3 accent-indigo-500"
            />
            <span className="text-slate-700 font-medium w-4">{minFrequency}</span>
          </div>
        )}

        <label className="flex items-center gap-1 text-slate-500">
          <input
            type="checkbox"
            checked={showEdgeLabels}
            onChange={() => setShowEdgeLabels(!showEdgeLabels)}
            className="w-3 h-3 accent-indigo-500"
          />
          Labels
        </label>

        <InfoIcon metricKey="knowledgeGraph" size="sm" />
      </div>

      {/* Metrics */}
      <div className="flex flex-wrap gap-2">
        <MetricBadge label="Entities" value={metrics.entityCount} />
        <MetricBadge label="Relationships" value={metrics.relationshipCount} />
        <MetricBadge label="Communities" value={metrics.communityCount} />
        <MetricBadge label="Modularity" value={metrics.modularity.toFixed(3)} detail="Newman Q — community structure strength. >0.3 = significant." />
        <MetricBadge label="Coverage" value={`${(metrics.participantCoverage * 100).toFixed(0)}%`} detail="Participants with at least one entity." />
        {provenanceStats && (
          <>
            <MetricBadge label="In Summary" value={provenanceStats.present} detail="Concepts that appear in the AI-generated summary." />
            <MetricBadge
              label="Absent"
              value={provenanceStats.absent}
              detail="Concepts from participant inputs missing from the summary."
              highlight={provenanceStats.absent > 0}
            />
            {provenanceStats.bridges > 0 && (
              <MetricBadge label="Bridges" value={provenanceStats.bridges} detail="Entities connecting multiple communities — cross-cutting themes." />
            )}
          </>
        )}
        {!provenanceStats && graphData.nodes.length < entities.length && (
          <MetricBadge label="Visible" value={`${graphData.nodes.length}/${entities.length}`} detail="Entities shown after frequency filter." />
        )}
      </div>

      {/* Graph */}
      <div ref={containerRef} className="w-full border border-slate-200 rounded-lg overflow-hidden bg-white" style={{ height: 450 }}>
        {graphData.nodes.length > 0 ? (
          <ForceGraph2D
            ref={fgRef}
            graphData={graphData}
            nodeCanvasObject={drawNode}
            linkCanvasObject={drawLink}
            nodeLabel={nodeTooltip}
            nodeId="id"
            onNodeHover={(node: any) => setHoveredNode(node?.id || null)}
            onNodeClick={(node: any) => {
              const gn = node as GraphNode;
              if (gn.sourceParticipants.length === 1 && onSelectParticipant) {
                onSelectParticipant(gn.sourceParticipants[0]);
              }
            }}
            width={containerRef.current?.clientWidth || 800}
            height={450}
            d3AlphaDecay={0.02}
            d3VelocityDecay={0.3}
            cooldownTicks={150}
            linkDirectionalParticles={0}
            enablePointerInteraction={true}
          />
        ) : (
          <div className="flex items-center justify-center h-full text-sm text-slate-400">
            No entities match the current filter. Try lowering the minimum frequency.
          </div>
        )}
      </div>

      {/* Legend */}
      <div className="flex flex-wrap gap-x-4 gap-y-1 text-[11px] text-slate-500">
        {colorMode === 'community' ? (
          <>
            {communities.slice(0, 8).map(c => (
              <span key={c.id} className="flex items-center gap-1">
                <span className="w-2 h-2 rounded-full" style={{ backgroundColor: communityColorMap.get(c.id) }} />
                {c.label.split(',').slice(0, 2).join(', ')}
                <span className="text-slate-400">({c.entityNames.length})</span>
              </span>
            ))}
          </>
        ) : (
          <>
            <span className="flex items-center gap-1">
              <span className="w-2 h-2 rounded-full" style={{ backgroundColor: PROVENANCE_COLORS.present }} />
              In summary
            </span>
            <span className="flex items-center gap-1">
              <span className="w-2 h-2 rounded-full" style={{ backgroundColor: PROVENANCE_COLORS.partial }} />
              Partially mentioned
            </span>
            <span className="flex items-center gap-1">
              <span className="w-2 h-2 rounded-full" style={{ backgroundColor: PROVENANCE_COLORS.absent }} />
              Absent from summary
            </span>
          </>
        )}
        <span className="flex items-center gap-1 ml-1">
          <span className="w-3 border-t border-dashed border-amber-500" />
          {colorMode === 'community' ? 'cross-community' : 'bridge entity'}
        </span>
      </div>

      {/* Purpose */}
      <div className="text-xs text-slate-500 bg-slate-50 rounded-lg px-3 py-2 leading-relaxed">
        <span className="font-medium text-slate-700">What this shows: </span>
        The knowledge graph maps <em>concepts and their relationships</em> as mentioned by participants.
        {hasProvenanceData
          ? <> Use the <strong>Summary Presence</strong> view to see which concepts were captured (green),
            partially mentioned (amber), or dropped (red) from the summary. Bridge entities (dashed amber ring)
            connect separate thematic communities — these cross-cutting ideas are often the first to be lost during summarization.</>
          : <> Unlike the cluster map (which groups <em>people</em>), this graph reveals the
            <em>conceptual structure</em> of the discussion — which ideas connect, which are central vs. peripheral,
            and where cross-cutting ideas bridge separate conversations.</>
        }
      </div>

      {/* Interpretation */}
      <button
        onClick={() => setShowInterpretation(!showInterpretation)}
        className="text-xs text-indigo-600 hover:text-indigo-800 flex items-center gap-1"
      >
        <svg className={`w-3 h-3 transition-transform ${showInterpretation ? 'rotate-90' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
        </svg>
        Interpretation
      </button>
      {showInterpretation && (
        <div className="space-y-1.5 pl-4 border-l-2 border-indigo-200">
          {interpretation.map((insight, i) => (
            <p key={i} className="text-xs text-slate-600 leading-relaxed">{insight}</p>
          ))}
          <p className="text-[10px] text-slate-400 mt-1.5 italic">
            Entity extraction via LLM co-extraction + gleaning (Microsoft GraphRAG, 2024). Fuzzy entity resolution via Levenshtein + substring matching. Full Louvain community detection (Blondel et al., 2008).
          </p>
        </div>
      )}
    </div>
  );
};
