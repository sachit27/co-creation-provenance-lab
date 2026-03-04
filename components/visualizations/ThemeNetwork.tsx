import React, { useEffect, useRef, useState } from 'react';
import * as d3 from 'd3';
import { AnalysisResult, ParticipantAnalysis } from '../../types';

interface ThemeNetworkProps {
    data: AnalysisResult;
}

interface Node extends d3.SimulationNodeDatum {
    id: string;
    name: string;
    count: number;
    avgRepScore: number;
    isBlindSpotDominant: boolean;
    x?: number;
    y?: number;
    fx?: number | null;
    fy?: number | null;
    vx?: number;
    vy?: number;
}

interface Link extends d3.SimulationLinkDatum<Node> {
    source: string | Node;
    target: string | Node;
    weight: number;
}

export const ThemeNetwork: React.FC<ThemeNetworkProps> = ({ data }) => {
    const svgRef = useRef<SVGSVGElement>(null);
    const containerRef = useRef<HTMLDivElement>(null);
    const [dimensions, setDimensions] = useState({ width: 800, height: 600 });
    const [selectedNode, setSelectedNode] = useState<Node | null>(null);

    // Resize observer
    useEffect(() => {
        if (!containerRef.current) return;
        const observer = new ResizeObserver(entries => {
            for (let entry of entries) {
                setDimensions({
                    width: entry.contentRect.width,
                    height: entry.contentRect.height,
                });
            }
        });
        observer.observe(containerRef.current);
        return () => observer.disconnect();
    }, []);

    useEffect(() => {
        if (!data || !svgRef.current || dimensions.width === 0 || data.participants.length === 0) return;

        // 1. Process data to extract nodes and links
        const nodeMap = new Map<string, { count: number; repSum: number; blindSpotSum: number }>();
        const linkMap = new Map<string, number>();

        // Identify blind spot IDs for styling
        const sortedIsolations = [...data.participants].map(p => 1 - p.semanticIsolation).sort((a, b) => a - b);
        const medianCentrality = sortedIsolations[Math.floor(sortedIsolations.length / 2)] || 0.5;

        const blindSpotIds = new Set(
            data.participants
                .filter(p => p.representationScore < 0.5 && (1 - p.semanticIsolation) < medianCentrality)
                .map(p => p.id)
        );

        data.participants.forEach(p => {
            const keywords = p.keywords || [];
            const isBlindSpot = blindSpotIds.has(p.id);

            // Add nodes
            keywords.forEach(kw => {
                const existing = nodeMap.get(kw) || { count: 0, repSum: 0, blindSpotSum: 0 };
                existing.count += 1;
                existing.repSum += p.representationScore;
                if (isBlindSpot) existing.blindSpotSum += 1;
                nodeMap.set(kw, existing);
            });

            // Add links (all pairs in this participant's keywords)
            for (let i = 0; i < keywords.length; i++) {
                for (let j = i + 1; j < keywords.length; j++) {
                    const k1 = keywords[i];
                    const k2 = keywords[j];
                    // Ensure consistent ordering for the edge key
                    const edgeKey = k1 < k2 ? `${k1}___${k2}` : `${k2}___${k1}`;
                    linkMap.set(edgeKey, (linkMap.get(edgeKey) || 0) + 1);
                }
            }
        });

        // Filter out very rare nodes/edges to keep graph readable
        const minNodeCount = Math.max(2, Math.floor(data.participants.length * 0.02)); // At least 2, or 2% of participants

        let nodes: Node[] = Array.from(nodeMap.entries())
            .filter(([_, stats]) => stats.count >= minNodeCount)
            .map(([name, stats]) => ({
                id: name,
                name,
                count: stats.count,
                avgRepScore: stats.repSum / stats.count,
                isBlindSpotDominant: (stats.blindSpotSum / stats.count) > 0.5 // Mostly voiced by blind spots
            }));

        // Keep top 60 nodes max to avoid hairball
        if (nodes.length > 60) {
            nodes = nodes.sort((a, b) => b.count - a.count).slice(0, 60);
        }
        const validNodeIds = new Set(nodes.map(n => n.id));

        const links: Link[] = Array.from(linkMap.entries())
            .map(([key, weight]) => {
                const [source, target] = key.split('___');
                return { source, target, weight };
            })
            .filter(l => validNodeIds.has(l.source as string) && validNodeIds.has(l.target as string) && l.weight >= 2);

        // 2. Render with D3
        const svg = d3.select(svgRef.current);
        svg.selectAll("*").remove(); // Clear previous

        const colorScale = d3.scaleSequential(d3.interpolateYlGnBu).domain([0.2, 0.8]);

        // Size scales
        const maxCount = d3.max(nodes, d => d.count) || 10;
        const radiusScale = d3.scaleSqrt().domain([1, maxCount]).range([6, 25]);
        const maxWeight = d3.max(links, d => d.weight) || 5;
        const strokeScale = d3.scaleLinear().domain([1, maxWeight]).range([1, 6]);

        const zoom = d3.zoom<SVGSVGElement, unknown>()
            .scaleExtent([0.1, 4])
            .on('zoom', (event) => {
                g.attr('transform', event.transform);
            });

        svg.call(zoom);

        const g = svg.append('g');

        // Force simulation
        const simulation = d3.forceSimulation<Node>(nodes)
            .force('link', d3.forceLink<Node, Link>(links).id(d => d.id).distance(d => 100 / Math.sqrt(d.weight)))
            .force('charge', d3.forceManyBody().strength(-200)) // Repel each other
            .force('center', d3.forceCenter(dimensions.width / 2, dimensions.height / 2))
            .force('collide', d3.forceCollide().radius(d => radiusScale((d as Node).count) + 5).iterations(2));

        // Draw links
        const link = g.append('g')
            .selectAll('line')
            .data(links)
            .join('line')
            .attr('stroke', '#9ca3af')
            .attr('stroke-opacity', 0.4)
            .attr('stroke-width', d => strokeScale(d.weight));

        // Draw nodes
        const nodeGroup = g.append('g')
            .selectAll('g')
            .data(nodes)
            .join('g')
            .call(d3.drag<SVGGElement, Node>()
                .on('start', dragstarted)
                .on('drag', dragged)
                .on('end', dragended) as any);

        // Node circles
        nodeGroup.append('circle')
            .attr('r', d => radiusScale(d.count))
            .attr('fill', d => d.isBlindSpotDominant ? '#ef4444' : (d.avgRepScore < 0.5 ? '#f59e0b' : colorScale(d.avgRepScore)))
            .attr('stroke', d => d.isBlindSpotDominant ? '#991b1b' : '#ffffff')
            .attr('stroke-width', 2)
            .attr('class', 'cursor-pointer transition-transform hover:scale-110')
            .on('mouseover', (event, d) => {
                setSelectedNode(d);
                // Fade un-connected
                const connectedNodes = new Set([d.id]);
                link.style('stroke-opacity', l => {
                    if ((l.source as Node).id === d.id) connectedNodes.add((l.target as Node).id);
                    if ((l.target as Node).id === d.id) connectedNodes.add((l.source as Node).id);
                    return ((l.source as Node).id === d.id || (l.target as Node).id === d.id) ? 0.8 : 0.1;
                });
                nodeGroup.style('opacity', n => connectedNodes.has(n.id) ? 1 : 0.2);
            })
            .on('mouseout', () => {
                setSelectedNode(null);
                link.style('stroke-opacity', 0.4);
                nodeGroup.style('opacity', 1);
            });

        // Node labels
        nodeGroup.append('text')
            .text(d => d.name)
            .attr('x', d => radiusScale(d.count) + 5)
            .attr('y', 4)
            .attr('class', 'text-xs font-medium fill-slate-700 pointer-events-none drop-shadow-md')
            .style('display', d => d.count > maxCount * 0.3 || nodes.length < 30 ? 'block' : 'none'); // Only show labels for bigger nodes or small graphs

        simulation.on('tick', () => {
            link
                .attr('x1', d => (d.source as Node).x!)
                .attr('y1', d => (d.source as Node).y!)
                .attr('x2', d => (d.target as Node).x!)
                .attr('y2', d => (d.target as Node).y!);

            nodeGroup
                .attr('transform', d => `translate(${d.x},${d.y})`);
        });

        function dragstarted(event: d3.D3DragEvent<SVGGElement, Node, Node>, d: Node) {
            if (!event.active) simulation.alphaTarget(0.3).restart();
            d.fx = d.x;
            d.fy = d.y;
        }

        function dragged(event: d3.D3DragEvent<SVGGElement, Node, Node>, d: Node) {
            d.fx = event.x;
            d.fy = event.y;
        }

        function dragended(event: d3.D3DragEvent<SVGGElement, Node, Node>, d: Node) {
            if (!event.active) simulation.alphaTarget(0);
            d.fx = null;
            d.fy = null;
        }

        return () => {
            simulation.stop();
        };
    }, [data, dimensions]);

    return (
        <div className="flex flex-col h-full bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
            <div className="p-4 border-b border-slate-100 bg-slate-50 flex justify-between items-center">
                <div>
                    <h3 className="text-lg font-semibold text-slate-800">Theme Co-occurrence Network</h3>
                    <p className="text-sm text-slate-500">
                        How keywords connect. <span className="text-red-500 font-medium">Red</span> = blind spots; <span className="text-amber-500 font-medium">Yellow</span> = underrepresented.
                    </p>
                </div>
            </div>

            <div className="relative flex-1" ref={containerRef}>
                <svg ref={svgRef} className="w-full h-full cursor-grab active:cursor-grabbing" />

                {/* Tooltip Overlay */}
                {selectedNode && (
                    <div className="absolute top-4 left-4 bg-white/90 backdrop-blur-sm p-4 rounded-lg shadow-lg border border-slate-200 pointer-events-none max-w-xs">
                        <h4 className="text-md font-bold text-slate-800 break-words capitalize">{selectedNode.name}</h4>
                        <div className="mt-2 text-sm text-slate-600 space-y-1">
                            <p>Used by: <span className="font-semibold">{selectedNode.count} participants</span></p>
                            <p>Avg Representation: <span className="font-semibold">{(selectedNode.avgRepScore * 100).toFixed(1)}%</span></p>
                            {selectedNode.isBlindSpotDominant && (
                                <p className="text-red-600 font-medium text-xs mt-2 bg-red-50 p-1.5 rounded">
                                    ⚠️ Predominantly voiced by blind spots
                                </p>
                            )}
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
};
