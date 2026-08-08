import React, { useState, useMemo } from 'react';
import { SankeyData, SankeyNode, SankeyLink, TransformationType } from '../../types';

interface Props {
  data: SankeyData;
}

const TRANSFORM_COLORS: Record<TransformationType, string> = {
  preserved: '#059669',
  softened: '#d97706',
  sanitized: '#dc2626',
  abstracted: '#7c3aed',
  dropped: '#6b7280',
};

const TRANSFORM_LABELS: Record<TransformationType, string> = {
  preserved: 'Preserved',
  softened: 'Softened',
  sanitized: 'Sanitized',
  abstracted: 'Abstracted',
  dropped: 'Dropped',
};

const NODE_W = 16;
const NODE_GAP = 5;

interface LayoutNode extends SankeyNode {
  x: number; y: number; h: number;
}

interface LayoutLink extends SankeyLink {
  sy0: number; sy1: number; ty0: number; ty1: number;
}

export const ProvenanceSankeyViz: React.FC<Props> = ({ data }) => {
  const [hovered, setHovered] = useState<string | null>(null);
  const [selectedNode, setSelectedNode] = useState<string | null>(null);
  const [showInfo, setShowInfo] = useState(false);

  // Separate real links from orphan/phantom markers
  const realLinks = useMemo(() => data.links.filter(l => l.source !== l.target), [data.links]);
  const orphanThemes = useMemo(() => new Set(data.links.filter(l => l.isOrphan).map(l => l.source)), [data.links]);
  const phantomSummaries = useMemo(() => new Set(data.links.filter(l => l.isPhantom).map(l => l.source)), [data.links]);

  // Group nodes by column
  const columns = useMemo(() => {
    const cols: Record<string, SankeyNode[]> = { input: [], theme: [], summary: [] };
    for (const n of data.nodes) cols[n.column].push(n);
    return cols;
  }, [data.nodes]);

  // Responsive layout: compute dimensions based on content
  const inputCount = columns.input.length;
  const themeCount = columns.theme.length;
  const summaryCount = columns.summary.length;
  const maxCol = Math.max(inputCount, themeCount, summaryCount);

  // Dynamic sizing: grow height with node count, but set reasonable bounds
  const PAD = { top: 45, bottom: 25, left: 160, right: 180 };
  const W = 900;
  const H = Math.max(300, Math.min(1200, maxCol * 32 + PAD.top + PAD.bottom));
  const plotW = W - PAD.left - PAD.right;
  const plotH = H - PAD.top - PAD.bottom;

  // Column X positions — leave room for labels on both sides
  const COL_X = { input: PAD.left, theme: PAD.left + plotW * 0.42, summary: PAD.left + plotW * 0.84 };

  // Layout computation
  const { layoutNodes, layoutLinks } = useMemo(() => {
    const nodeMap = new Map<string, LayoutNode>();

    for (const col of ['input', 'theme', 'summary'] as const) {
      const colNodes = columns[col];
      const x = COL_X[col];
      const totalValue = colNodes.reduce((s, n) => s + n.value, 0) || 1;
      const totalGap = Math.max(0, (colNodes.length - 1)) * NODE_GAP;
      const availH = plotH - totalGap;

      let yOffset = PAD.top;
      for (const node of colNodes) {
        const h = Math.max(12, (node.value / totalValue) * availH);
        nodeMap.set(node.id, { ...node, x, y: yOffset, h });
        yOffset += h + NODE_GAP;
      }

      // Center vertically
      const usedH = yOffset - NODE_GAP - PAD.top;
      if (usedH < plotH) {
        const shift = (plotH - usedH) / 2;
        for (const node of colNodes) {
          const ln = nodeMap.get(node.id)!;
          ln.y += shift;
        }
      }
    }

    // Pre-compute totals per node for link stacking
    const sourceTotals = new Map<string, number>();
    const targetTotals = new Map<string, number>();
    for (const link of realLinks) {
      sourceTotals.set(link.source, (sourceTotals.get(link.source) || 0) + link.value);
      targetTotals.set(link.target, (targetTotals.get(link.target) || 0) + link.value);
    }

    const sourceOffsets = new Map<string, number>();
    const targetOffsets = new Map<string, number>();

    const lLinks: LayoutLink[] = [];
    for (const link of realLinks) {
      const sNode = nodeMap.get(link.source);
      const tNode = nodeMap.get(link.target);
      if (!sNode || !tNode) continue;

      const sTotal = sourceTotals.get(link.source) || 1;
      const tTotal = targetTotals.get(link.target) || 1;
      const sOff = sourceOffsets.get(link.source) || 0;
      const tOff = targetOffsets.get(link.target) || 0;

      const sh = (link.value / sTotal) * sNode.h;
      const th = (link.value / tTotal) * tNode.h;

      lLinks.push({
        ...link,
        sy0: sNode.y + sOff,
        sy1: sNode.y + sOff + sh,
        ty0: tNode.y + tOff,
        ty1: tNode.y + tOff + th,
      });

      sourceOffsets.set(link.source, sOff + sh);
      targetOffsets.set(link.target, tOff + th);
    }

    return { layoutNodes: nodeMap, layoutLinks: lLinks };
  }, [columns, realLinks, plotH, COL_X]);

  // Bezier path
  const linkPath = (link: LayoutLink): string => {
    const sNode = layoutNodes.get(link.source);
    const tNode = layoutNodes.get(link.target);
    if (!sNode || !tNode) return '';
    const sx = sNode.x + NODE_W;
    const tx = tNode.x;
    const midX = (sx + tx) / 2;
    return `M${sx},${link.sy0} C${midX},${link.sy0} ${midX},${link.ty0} ${tx},${link.ty0} L${tx},${link.ty1} C${midX},${link.ty1} ${midX},${link.sy1} ${sx},${link.sy1} Z`;
  };

  // Highlight logic
  const connectedNodes = useMemo(() => {
    const target = selectedNode || hovered;
    if (!target) return null;
    const connected = new Set<string>([target]);
    for (const l of realLinks) {
      if (l.source === target || l.target === target) {
        connected.add(l.source);
        connected.add(l.target);
      }
    }
    return connected;
  }, [selectedNode, hovered, realLinks]);

  const dimNode = (id: string) => connectedNodes ? !connectedNodes.has(id) : false;
  const dimLink = (link: SankeyLink) => connectedNodes ? (!connectedNodes.has(link.source) && !connectedNodes.has(link.target)) : false;
  const hlLink = (link: SankeyLink) => connectedNodes ? (connectedNodes.has(link.source) || connectedNodes.has(link.target)) : false;

  // Label truncation based on available space
  const truncLabel = (label: string, col: 'input' | 'theme' | 'summary') => {
    const max = col === 'summary' ? 55 : col === 'input' ? 22 : 28;
    return label.length > max ? label.slice(0, max - 1) + '\u2026' : label;
  };

  return (
    <div className="space-y-3">
      {/* Header with info */}
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div className="flex flex-wrap gap-3 text-xs text-slate-600">
          <span><strong className="text-slate-800">{inputCount}</strong> input{inputCount !== 1 ? 's' : ''}</span>
          <span><strong className="text-slate-800">{themeCount}</strong> theme{themeCount !== 1 ? 's' : ''}</span>
          <span><strong className="text-slate-800">{summaryCount}</strong> sentence{summaryCount !== 1 ? 's' : ''}</span>
          {orphanThemes.size > 0 && (
            <span className="text-red-600 flex items-center gap-1">
              <span className="w-2 h-2 rounded-full bg-red-500" />
              {orphanThemes.size} dropped
            </span>
          )}
          {phantomSummaries.size > 0 && (
            <span className="text-purple-600 flex items-center gap-1">
              <span className="w-2 h-2 rounded-full bg-purple-500" />
              {phantomSummaries.size} unsourced
            </span>
          )}
        </div>
        <button onClick={() => setShowInfo(!showInfo)} className="text-slate-400 hover:text-slate-600 transition-colors" title="How to read this diagram">
          <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10" /><line x1="12" y1="16" x2="12" y2="12" /><line x1="12" y1="8" x2="12.01" y2="8" /></svg>
        </button>
      </div>

      {showInfo && (
        <div className="text-xs text-slate-600 bg-blue-50 border border-blue-200 rounded-lg p-3 space-y-1">
          <p><strong>How to read:</strong> This Sankey diagram shows how information flows from participant inputs (left) through semantic themes (middle) into summary sentences (right).</p>
          <p><strong>Band width</strong> shows how much content flows along each path. <strong>Band color</strong> shows the transformation type (preserved, softened, sanitized, abstracted, or dropped).</p>
          <p><strong>Dropped themes</strong> (red dashed border) are topics present in inputs but absent from the summary. <strong>Unsourced sentences</strong> (purple dashed border) are summary content with no clear origin in the inputs.</p>
          <p><strong>Hover</strong> a node to highlight its connections. <strong>Click</strong> for details. When inputs are grouped by cluster, each input node represents multiple participants.</p>
        </div>
      )}

      {/* SVG diagram */}
      <div className="overflow-x-auto border border-slate-200 rounded-lg bg-white">
        <svg viewBox={`0 0 ${W} ${H}`} className="w-full" style={{ minHeight: Math.min(H, 500) }} preserveAspectRatio="xMidYMid meet">
          {/* Column headers */}
          <text x={COL_X.input + NODE_W / 2} y={PAD.top - 16} textAnchor="start" fill="#475569" fontSize={10} fontWeight="bold">Participant Inputs</text>
          <text x={COL_X.theme + NODE_W / 2} y={PAD.top - 16} textAnchor="start" fill="#475569" fontSize={10} fontWeight="bold">Semantic Themes</text>
          <text x={COL_X.summary + NODE_W / 2} y={PAD.top - 16} textAnchor="start" fill="#475569" fontSize={10} fontWeight="bold">Summary Sentences</text>

          {/* Links — render before nodes so nodes sit on top */}
          {layoutLinks.map((link, i) => {
            const d = dimLink(link);
            const h = hlLink(link);
            const color = link.transformationType ? TRANSFORM_COLORS[link.transformationType] : (layoutNodes.get(link.source)?.color || '#94a3b8');
            return (
              <path
                key={i}
                d={linkPath(link)}
                fill={color}
                opacity={d ? 0.04 : h ? 0.55 : 0.18}
                className="transition-opacity duration-100"
              >
                <title>{layoutNodes.get(link.source)?.label} → {layoutNodes.get(link.target)?.label}{link.transformationType ? ` (${TRANSFORM_LABELS[link.transformationType]})` : ''} — {link.value} connection{link.value !== 1 ? 's' : ''}</title>
              </path>
            );
          })}

          {/* Nodes */}
          {Array.from(layoutNodes.values()).map(node => {
            const isDim = dimNode(node.id);
            const isOrphan = orphanThemes.has(node.id);
            const isPhantom = phantomSummaries.has(node.id);
            const isActive = hovered === node.id || selectedNode === node.id;

            // Label position: input labels to the left, others to the right
            const labelX = node.column === 'input' ? node.x - 6 : node.x + NODE_W + 6;
            const labelAnchor = node.column === 'input' ? 'end' as const : 'start' as const;
            const fontSize = node.h >= 22 ? 9.5 : node.h >= 14 ? 8 : 7;

            return (
              <g key={node.id}
                onMouseEnter={() => setHovered(node.id)}
                onMouseLeave={() => setHovered(null)}
                onClick={() => setSelectedNode(selectedNode === node.id ? null : node.id)}
                className="cursor-pointer"
              >
                <rect
                  x={node.x} y={node.y} width={NODE_W} height={node.h} rx={3}
                  fill={node.color || '#64748b'}
                  opacity={isDim ? 0.15 : 1}
                  stroke={isOrphan ? '#dc2626' : isPhantom ? '#7c3aed' : isActive ? '#1e293b' : 'rgba(255,255,255,0.5)'}
                  strokeWidth={isOrphan || isPhantom ? 2 : isActive ? 2 : 0.5}
                  strokeDasharray={isOrphan || isPhantom ? '4 2' : 'none'}
                  className="transition-all duration-100"
                />
                {node.h >= 10 && (
                  <text
                    x={labelX} y={node.y + node.h / 2 + 3}
                    textAnchor={labelAnchor}
                    fill={isDim ? '#cbd5e1' : '#334155'}
                    fontSize={fontSize}
                    className="pointer-events-none select-none"
                  >
                    {truncLabel(node.label, node.column)}
                  </text>
                )}
              </g>
            );
          })}
        </svg>
      </div>

      {/* Legend */}
      <div className="space-y-2">
        <div className="flex flex-wrap gap-x-4 gap-y-1.5 text-[11px] text-slate-600">
          <span className="text-[10px] font-bold text-slate-500 uppercase mr-1">Link color (transformation):</span>
          {Object.entries(TRANSFORM_COLORS).map(([type, color]) => (
            <div key={type} className="flex items-center gap-1.5">
              <span className="w-4 h-2 rounded-sm" style={{ backgroundColor: color }} />
              {TRANSFORM_LABELS[type as TransformationType]}
            </div>
          ))}
          <div className="flex items-center gap-1.5 text-red-600">
            <span className="w-3 h-3 border-2 border-dashed border-red-400 rounded-sm" />
            Dropped theme
          </div>
          <div className="flex items-center gap-1.5 text-purple-600">
            <span className="w-3 h-3 border-2 border-dashed border-purple-400 rounded-sm" />
            Unsourced sentence
          </div>
        </div>
        <div className="flex flex-wrap gap-x-4 gap-y-1.5 text-[11px] text-slate-600">
          <span className="text-[10px] font-bold text-slate-500 uppercase mr-1">Summary node color (epistemic basis):</span>
          <div className="flex items-center gap-1.5">
            <span className="w-3 h-3 rounded-sm" style={{ backgroundColor: '#059669' }} />
            Explicit
          </div>
          <div className="flex items-center gap-1.5">
            <span className="w-3 h-3 rounded-sm" style={{ backgroundColor: '#2563eb' }} />
            Inferred
          </div>
          <div className="flex items-center gap-1.5">
            <span className="w-3 h-3 rounded-sm" style={{ backgroundColor: '#d97706' }} />
            Extrapolated
          </div>
          <div className="flex items-center gap-1.5">
            <span className="w-3 h-3 rounded-sm" style={{ backgroundColor: '#7c3aed' }} />
            Speculative
          </div>
          <div className="flex items-center gap-1.5">
            <span className="w-3 h-3 rounded-sm" style={{ backgroundColor: '#64748b' }} />
            Unclassified
          </div>
        </div>
      </div>

      {/* Selected node detail */}
      {selectedNode && (() => {
        const node = layoutNodes.get(selectedNode);
        if (!node) return null;
        const incoming = realLinks.filter(l => l.target === selectedNode);
        const outgoing = realLinks.filter(l => l.source === selectedNode);
        return (
          <div className="p-3 bg-slate-50 rounded-lg border border-slate-200 text-xs">
            <div className="flex items-center gap-2 mb-1.5">
              <span className="w-3 h-3 rounded" style={{ backgroundColor: node.color || '#64748b' }} />
              <span className="text-sm font-semibold text-slate-800">{node.label}</span>
              <span className="text-[10px] text-slate-400 uppercase">{node.column}</span>
              {orphanThemes.has(node.id) && <span className="text-[10px] text-red-600 font-bold px-1.5 py-0.5 bg-red-50 rounded">DROPPED</span>}
              {phantomSummaries.has(node.id) && <span className="text-[10px] text-purple-600 font-bold px-1.5 py-0.5 bg-purple-50 rounded">UNSOURCED</span>}
            </div>
            {incoming.length > 0 && (
              <div className="text-slate-600 mt-1">
                <span className="font-medium text-slate-700">Sources ({incoming.length}):</span>{' '}
                {incoming.slice(0, 8).map(l => layoutNodes.get(l.source)?.label || l.source).join(' · ')}
                {incoming.length > 8 && ` and ${incoming.length - 8} more`}
              </div>
            )}
            {outgoing.length > 0 && (
              <div className="text-slate-600 mt-1">
                <span className="font-medium text-slate-700">Targets ({outgoing.length}):</span>{' '}
                {outgoing.slice(0, 8).map(l => layoutNodes.get(l.target)?.label || l.target).join(' · ')}
                {outgoing.length > 8 && ` and ${outgoing.length - 8} more`}
              </div>
            )}
          </div>
        );
      })()}
    </div>
  );
};
