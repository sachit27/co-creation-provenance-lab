import React, { useMemo } from 'react';
import { AnalysisResult } from '../../types';

interface ThemeNetworkProps {
    data: AnalysisResult;
}

interface ThemeNode {
    label: string;
    count: number;
    avgRepScore: number;
    isBlindSpotDominant: boolean;
}

export const ThemeNetwork: React.FC<ThemeNetworkProps> = ({ data }) => {
    const { coreThemes, peripheralThemes } = useMemo(() => {
        if (!data || data.participants.length === 0) {
            return { coreThemes: [], peripheralThemes: [] };
        }

        const REPRESENTATION_TARGET = 0.6;
        const BLIND_SPOT_THRESHOLD = 0.5;

        // Identify blind spot participant IDs
        const centralityScores = data.participants
            .map(p => 1 - p.semanticIsolation)
            .sort((a, b) => a - b);
        const medianCentrality =
            centralityScores[Math.floor(centralityScores.length / 2)] ?? 0.5;

        const blindSpotIds = new Set(
            data.participants
                .filter(
                    p =>
                        p.representationScore < BLIND_SPOT_THRESHOLD &&
                        1 - p.semanticIsolation < medianCentrality
                )
                .map(p => p.id)
        );

        // Aggregate keyword stats across all participants
        const kwStats = new Map<
            string,
            { count: number; repSum: number; blindSpotCount: number }
        >();

        data.participants.forEach(p => {
            const kws = p.keywords ?? [];
            const isBs = blindSpotIds.has(p.id);
            kws.forEach(kw => {
                const s = kwStats.get(kw) ?? { count: 0, repSum: 0, blindSpotCount: 0 };
                s.count += 1;
                s.repSum += p.representationScore;
                if (isBs) s.blindSpotCount += 1;
                kwStats.set(kw, s);
            });
        });

        // Filter: keyword must appear in at least 2 participants
        const minCount = Math.max(2, Math.floor(data.participants.length * 0.03));

        const all: ThemeNode[] = Array.from(kwStats.entries())
            .filter(([, s]) => s.count >= minCount)
            .map(([label, s]) => ({
                label,
                count: s.count,
                avgRepScore: s.repSum / s.count,
                isBlindSpotDominant: s.blindSpotCount / s.count > 0.5,
            }))
            .sort((a, b) => b.count - a.count);

        // Core: well-represented themes (score >= target)
        const core = all
            .filter(t => t.avgRepScore >= REPRESENTATION_TARGET)
            .slice(0, 12);

        // Peripheral: underrepresented or blind-spot dominated themes
        const peripheral = all
            .filter(t => t.avgRepScore < REPRESENTATION_TARGET)
            .sort((a, b) => {
                // Float blind-spot themes to the top
                const bsDiff = Number(b.isBlindSpotDominant) - Number(a.isBlindSpotDominant);
                return bsDiff !== 0 ? bsDiff : b.count - a.count;
            })
            .slice(0, 12);

        return { coreThemes: core, peripheralThemes: peripheral };
    }, [data]);

    const maxCount = Math.max(
        ...[...coreThemes, ...peripheralThemes].map(t => t.count),
        1
    );

    // Radius: 18–52px based on frequency
    const radius = (count: number) =>
        18 + ((count / maxCount) * 34);

    // Deterministic circle packing in a rectangular region
    // Simple row-by-row placement — no randomness
    const layoutBubbles = (themes: ThemeNode[], width: number, height: number) => {
        const placed: { x: number; y: number; r: number; theme: ThemeNode }[] = [];
        if (themes.length === 0) return placed;

        const radii = themes.map(t => radius(t.count));
        const padding = 8;
        let x = 0;
        let y = 0;
        let rowHeight = 0;

        themes.forEach((theme, i) => {
            const r = radii[i];
            const diameter = r * 2 + padding;
            if (x + diameter > width && x > 0) {
                x = 0;
                y += rowHeight + padding;
                rowHeight = 0;
            }
            placed.push({ x: x + r + padding / 2, y: y + r + padding / 2, r, theme });
            x += diameter;
            if (r * 2 > rowHeight) rowHeight = r * 2;
        });

        return placed;
    };

    const PANEL_W = 460;
    const PANEL_H = 380;

    const coreBubbles = layoutBubbles(coreThemes, PANEL_W, PANEL_H);
    const peripheralBubbles = layoutBubbles(peripheralThemes, PANEL_W, PANEL_H);

    const renderBubble = (
        b: { x: number; y: number; r: number; theme: ThemeNode },
        key: string
    ) => {
        const { x, y, r, theme } = b;
        const fill = theme.isBlindSpotDominant
            ? '#fca5a5'
            : theme.avgRepScore >= 0.7
                ? '#6ee7b7'
                : theme.avgRepScore >= 0.6
                    ? '#93c5fd'
                    : '#fcd34d';
        const stroke = theme.isBlindSpotDominant
            ? '#ef4444'
            : theme.avgRepScore >= 0.7
                ? '#10b981'
                : theme.avgRepScore >= 0.6
                    ? '#3b82f6'
                    : '#f59e0b';
        const textSize = r < 24 ? 9 : r < 34 ? 10 : 11;
        const label = theme.label.length > 12 ? theme.label.slice(0, 11) + '…' : theme.label;

        return (
            <g key={key} className="group cursor-default">
                <circle
                    cx={x} cy={y} r={r}
                    fill={fill} stroke={stroke} strokeWidth={2}
                    opacity={0.88}
                    className="transition-opacity duration-150 group-hover:opacity-100"
                />
                <text
                    x={x} y={y - 3}
                    textAnchor="middle"
                    fontSize={textSize}
                    fontWeight="600"
                    fill="#1e293b"
                    className="pointer-events-none select-none"
                >
                    {label}
                </text>
                <text
                    x={x} y={y + textSize + 1}
                    textAnchor="middle"
                    fontSize={8}
                    fill="#475569"
                    className="pointer-events-none select-none"
                >
                    {theme.count}×
                </text>
                {/* Tooltip on hover via title */}
                <title>
                    {theme.label} ({theme.count} participants, avg rep {(theme.avgRepScore * 100).toFixed(0)}%{theme.isBlindSpotDominant ? ' — blind spot' : ''})
                </title>
            </g>
        );
    };

    if (coreThemes.length === 0 && peripheralThemes.length === 0) {
        return (
            <div className="flex items-center justify-center h-full text-slate-400 text-sm">
                Not enough keyword data to build theme landscape. Run the analysis first.
            </div>
        );
    }

    return (
        <div className="flex flex-col h-full bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
            {/* Header */}
            <div className="px-5 py-4 border-b border-slate-100 bg-slate-50">
                <h3 className="text-base font-semibold text-slate-800">Theme Landscape</h3>
                <p className="text-xs text-slate-500 mt-0.5">
                    Bubble size = how many participants raised the theme. Colors indicate representation status.
                </p>
            </div>

            {/* Legend */}
            <div className="flex flex-wrap gap-4 px-5 py-2 border-b border-slate-100 text-xs text-slate-500">
                <span className="flex items-center gap-1.5">
                    <span className="w-3 h-3 rounded-full bg-emerald-300 border border-emerald-500 inline-block" /> Core (well-represented)
                </span>
                <span className="flex items-center gap-1.5">
                    <span className="w-3 h-3 rounded-full bg-blue-300 border border-blue-500 inline-block" /> Represented
                </span>
                <span className="flex items-center gap-1.5">
                    <span className="w-3 h-3 rounded-full bg-amber-300 border border-amber-500 inline-block" /> Underrepresented
                </span>
                <span className="flex items-center gap-1.5">
                    <span className="w-3 h-3 rounded-full bg-red-300 border border-red-500 inline-block" /> Blind spot voices
                </span>
            </div>

            {/* Two panels side by side */}
            <div className="flex flex-1 overflow-auto divide-x divide-slate-100">
                {/* Core panel */}
                <div className="flex-1 flex flex-col min-w-0">
                    <div className="px-4 py-2 bg-emerald-50 border-b border-emerald-100">
                        <div className="text-xs font-bold text-emerald-800 uppercase tracking-wide">
                            Core Themes
                        </div>
                        <div className="text-[10px] text-emerald-600">
                            Dominant topics captured well in the summary
                        </div>
                    </div>
                    <div className="flex-1 overflow-auto">
                        <svg width={PANEL_W} height={PANEL_H} viewBox={`0 0 ${PANEL_W} ${PANEL_H}`} className="block">
                            {coreBubbles.map((b, i) => renderBubble(b, `core-${i}`))}
                        </svg>
                    </div>
                </div>

                {/* Peripheral panel */}
                <div className="flex-1 flex flex-col min-w-0">
                    <div className="px-4 py-2 bg-amber-50 border-b border-amber-100">
                        <div className="text-xs font-bold text-amber-800 uppercase tracking-wide">
                            Peripheral / At-Risk Themes
                        </div>
                        <div className="text-[10px] text-amber-600">
                            Topics raised by underrepresented or blind-spot voices
                        </div>
                    </div>
                    <div className="flex-1 overflow-auto">
                        <svg width={PANEL_W} height={PANEL_H} viewBox={`0 0 ${PANEL_W} ${PANEL_H}`} className="block">
                            {peripheralBubbles.map((b, i) => renderBubble(b, `peri-${i}`))}
                        </svg>
                    </div>
                </div>
            </div>
        </div>
    );
};
