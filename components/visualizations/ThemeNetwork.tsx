import React, { useMemo } from 'react';
import { AnalysisResult } from '../../types';

interface ThemeNetworkProps {
    data: AnalysisResult;
}

interface ThemeEntry {
    label: string;
    count: number;         // How many participants mentioned it
    repScore: number;      // Average representation score
    isBlindSpot: boolean;
}

export const ThemeNetwork: React.FC<ThemeNetworkProps> = ({ data }) => {
    const { coreWords, peripheralWords } = useMemo(() => {
        if (!data || data.participants.length === 0) {
            return { coreWords: [] as ThemeEntry[], peripheralWords: [] as ThemeEntry[] };
        }

        // Identify blind spot participants
        const centralityValues = data.participants
            .map(p => 1 - p.semanticIsolation)
            .sort((a, b) => a - b);
        const medianCentrality =
            centralityValues[Math.floor(centralityValues.length / 2)] ?? 0.5;

        const blindSpotIds = new Set(
            data.participants
                .filter(p => p.representationScore < 0.5 && (1 - p.semanticIsolation) < medianCentrality)
                .map(p => p.id)
        );

        // Aggregate per-keyword stats
        type KwStat = { totalCount: number; repSum: number; wellRepCount: number; blindSpotCount: number };
        const stats = new Map<string, KwStat>();

        data.participants.forEach(p => {
            const kws = p.keywords ?? [];
            const isBs = blindSpotIds.has(p.id);
            const isWellRep = p.representationScore >= 0.6;

            kws.forEach(kw => {
                const s = stats.get(kw) ?? { totalCount: 0, repSum: 0, wellRepCount: 0, blindSpotCount: 0 };
                s.totalCount += 1;
                s.repSum += p.representationScore;
                if (isWellRep) s.wellRepCount += 1;
                if (isBs) s.blindSpotCount += 1;
                stats.set(kw, s);
            });
        });

        // Filter to keywords mentioned by at least 2 participants
        // (lower than before — we want both panels populated)
        const minCount = 2;

        const all: ThemeEntry[] = Array.from(stats.entries())
            .filter(([, s]) => s.totalCount >= minCount)
            .map(([label, s]) => ({
                label,
                count: s.totalCount,
                repScore: s.repSum / s.totalCount,
                isBlindSpot: s.blindSpotCount / s.totalCount > 0.4,
            }))
            .sort((a, b) => b.count - a.count);

        // Split: core = raised more by well-represented voices
        // peripheral = raised more by underrepresented/blind-spot voices
        const core = all
            .filter(t => t.repScore >= 0.55 && !t.isBlindSpot)
            .slice(0, 30);

        const peripheral = all
            .filter(t => t.repScore < 0.55 || t.isBlindSpot)
            .sort((a, b) => Number(b.isBlindSpot) - Number(a.isBlindSpot) || b.count - a.count)
            .slice(0, 30);

        return { coreWords: core, peripheralWords: peripheral };
    }, [data]);

    const maxCount = Math.max(
        ...[...coreWords, ...peripheralWords].map(t => t.count),
        1
    );

    // Font size range: 12 – 36px
    const fontSize = (count: number) => {
        const ratio = count / maxCount;
        return Math.round(12 + ratio * 24);
    };

    // Color for core words: green gradient based on rep score
    const coreColor = (t: ThemeEntry) => {
        if (t.repScore >= 0.75) return { text: '#065f46', bg: '#d1fae5' };
        if (t.repScore >= 0.6) return { text: '#1e40af', bg: '#dbeafe' };
        return { text: '#374151', bg: '#f3f4f6' };
    };

    // Color for peripheral words
    const periColor = (t: ThemeEntry) => {
        if (t.isBlindSpot) return { text: '#991b1b', bg: '#fee2e2' };
        return { text: '#92400e', bg: '#fef3c7' };
    };

    const WordCloud = ({
        words,
        colorFn,
        emptyMsg,
    }: {
        words: ThemeEntry[];
        colorFn: (t: ThemeEntry) => { text: string; bg: string };
        emptyMsg: string;
    }) => {
        if (words.length === 0) {
            return (
                <div className="flex items-center justify-center h-48 text-slate-400 text-sm italic px-8 text-center">
                    {emptyMsg}
                </div>
            );
        }
        return (
            <div className="p-4 flex flex-wrap gap-2.5 items-center content-start" style={{ minHeight: '200px' }}>
                {words.map(w => {
                    const { text, bg } = colorFn(w);
                    return (
                        <span
                            key={w.label}
                            title={`${w.count} participant${w.count !== 1 ? 's' : ''} · avg representation ${(w.repScore * 100).toFixed(0)}%${w.isBlindSpot ? ' · blind spot voice' : ''}`}
                            className="rounded-full px-3 py-1 cursor-default transition-opacity hover:opacity-70 select-none"
                            style={{
                                fontSize: fontSize(w.count),
                                fontWeight: w.count > maxCount * 0.5 ? 700 : w.count > maxCount * 0.25 ? 600 : 500,
                                color: text,
                                backgroundColor: bg,
                                lineHeight: '1.4',
                            }}
                        >
                            {w.label}
                        </span>
                    );
                })}
            </div>
        );
    };

    if (coreWords.length === 0 && peripheralWords.length === 0) {
        return (
            <div className="flex flex-col items-center justify-center h-64 gap-3 text-slate-400">
                <svg xmlns="http://www.w3.org/2000/svg" width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" /></svg>
                <p className="text-sm text-center max-w-xs">
                    Not enough keyword data yet. Upload a dataset and run the analysis to see the theme landscape.
                </p>
            </div>
        );
    }

    return (
        <div className="flex flex-col h-full bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
            {/* Header */}
            <div className="px-5 py-4 border-b border-slate-100 bg-slate-50">
                <h3 className="text-base font-semibold text-slate-800">Theme Landscape</h3>
                <p className="text-xs text-slate-500 mt-0.5">
                    Word size reflects how many participants raised each theme. Hover for details.
                </p>
            </div>

            {/* Two word cloud panels */}
            <div className="flex flex-1 overflow-auto divide-x divide-slate-200">
                {/* Core */}
                <div className="flex-1 flex flex-col min-w-0">
                    <div className="px-4 py-2.5 bg-emerald-50 border-b border-emerald-100 flex items-center gap-2">
                        <span className="text-lg">🟢</span>
                        <div>
                            <div className="text-xs font-bold text-emerald-800 uppercase tracking-wide">Core Themes</div>
                            <div className="text-[10px] text-emerald-600">Captured in the summary · well-represented voices</div>
                        </div>
                    </div>
                    <WordCloud
                        words={coreWords}
                        colorFn={coreColor}
                        emptyMsg="No clearly dominant themes detected with current data."
                    />
                </div>

                {/* Peripheral */}
                <div className="flex-1 flex flex-col min-w-0">
                    <div className="px-4 py-2.5 bg-amber-50 border-b border-amber-100 flex items-center gap-2">
                        <span className="text-lg">🔴</span>
                        <div>
                            <div className="text-xs font-bold text-amber-800 uppercase tracking-wide">At-Risk Themes</div>
                            <div className="text-[10px] text-amber-600">Underrepresented · blind-spot voices · may be missing</div>
                        </div>
                    </div>
                    <WordCloud
                        words={peripheralWords}
                        colorFn={periColor}
                        emptyMsg="No at-risk themes detected — representation looks balanced."
                    />
                </div>
            </div>

            {/* Footer legend */}
            <div className="px-5 py-2.5 border-t border-slate-100 bg-slate-50 flex flex-wrap gap-x-5 gap-y-1 text-[11px] text-slate-500">
                <span><strong>Larger text</strong> = more participants raised it</span>
                <span className="text-emerald-700">■ Dark green = highly represented (≥75%)</span>
                <span className="text-blue-700">■ Blue = represented (60–75%)</span>
                <span className="text-amber-700">■ Amber = underrepresented</span>
                <span className="text-red-700">■ Red = raised primarily by blind-spot voices</span>
            </div>
        </div>
    );
};
