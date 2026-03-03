import React, { useState, useMemo } from 'react';
import { AnalysisResult } from '../../types';
import { Card } from './Card';

/**
 * Citation Provenance Trail
 *
 * For each summary sentence, shows which participant inputs contributed to it,
 * ranked by cosine similarity. This is the inverse of the per-participant
 * sentenceMatches view — pivoted to sentence → sources.
 *
 * Why this matters: it creates an auditable trail showing exactly which voices
 * shaped each part of the summary, and which were silent.
 */

interface ProvenanceTrailProps {
    data: AnalysisResult;
    onSelectParticipant?: (id: string) => void;
}

interface SentenceSource {
    participantId: string;
    originalText: string;
    similarity: number;
    sentiment: string;
}

export const ProvenanceTrail: React.FC<ProvenanceTrailProps> = ({ data, onSelectParticipant }) => {
    const [expandedSentence, setExpandedSentence] = useState<number | null>(0);
    const [showAll, setShowAll] = useState(false);

    // Pivot: for each summary sentence, collect all participant contributions ranked by similarity
    const sentenceProvenance = useMemo(() => {
        if (!data.summarySentences || data.summarySentences.length === 0) return [];

        return data.summarySentences.map((sentence, sIdx) => {
            const sources: SentenceSource[] = [];

            for (const p of data.participants) {
                if (!p.sentenceMatches) continue;
                const match = p.sentenceMatches.find(m => m.sentenceIndex === sIdx);
                if (match && match.similarity > 0.1) {
                    sources.push({
                        participantId: p.id,
                        originalText: p.originalText,
                        similarity: match.similarity,
                        sentiment: p.sentiment || 'neutral',
                    });
                }
            }

            // Sort by similarity descending
            sources.sort((a, b) => b.similarity - a.similarity);

            const strongSources = sources.filter(s => s.similarity >= 0.5);
            const moderateSources = sources.filter(s => s.similarity >= 0.3 && s.similarity < 0.5);
            const weakSources = sources.filter(s => s.similarity < 0.3);

            return {
                sentence,
                index: sIdx,
                sources,
                strongCount: strongSources.length,
                moderateCount: moderateSources.length,
                weakCount: weakSources.length,
                sentiment: sentence.length > 0 ? data.summarySentenceSentiments?.[sIdx] : undefined,
            };
        });
    }, [data]);

    if (sentenceProvenance.length === 0) {
        return (
            <Card>
                <div className="text-center py-8 text-slate-400">
                    <p className="text-lg mb-2">No provenance data available</p>
                    <p className="text-sm">Run an analysis to generate the citation provenance trail.</p>
                </div>
            </Card>
        );
    }

    // Coverage stats
    const totalParticipants = data.participants.length;
    const citedParticipants = new Set(
        sentenceProvenance.flatMap(sp => sp.sources.filter(s => s.similarity >= 0.4).map(s => s.participantId))
    );
    const uncitedCount = totalParticipants - citedParticipants.size;

    const displayedSentences = showAll ? sentenceProvenance : sentenceProvenance.slice(0, 10);

    const getBadgeColor = (sim: number) => {
        if (sim >= 0.7) return 'bg-green-100 text-green-800 border-green-200';
        if (sim >= 0.5) return 'bg-blue-100 text-blue-800 border-blue-200';
        if (sim >= 0.3) return 'bg-amber-100 text-amber-800 border-amber-200';
        return 'bg-slate-100 text-slate-600 border-slate-200';
    };

    const getBadgeLabel = (sim: number) => {
        if (sim >= 0.7) return 'Strong';
        if (sim >= 0.5) return 'Good';
        if (sim >= 0.3) return 'Weak';
        return 'Marginal';
    };

    return (
        <div className="space-y-4">
            {/* Header Stats */}
            <div className="grid grid-cols-3 gap-3">
                <Card className="border-l-4 border-l-indigo-500">
                    <div className="text-xs text-slate-500 uppercase font-bold tracking-wider">Summary Sentences</div>
                    <div className="text-2xl font-bold text-slate-800 mt-1">{sentenceProvenance.length}</div>
                </Card>
                <Card className="border-l-4 border-l-green-500">
                    <div className="text-xs text-slate-500 uppercase font-bold tracking-wider">Cited Voices</div>
                    <div className="text-2xl font-bold text-green-700 mt-1">{citedParticipants.size}</div>
                    <div className="text-xs text-slate-400 mt-1">of {totalParticipants} participants</div>
                </Card>
                <Card className={`border-l-4 ${uncitedCount > 0 ? 'border-l-red-500' : 'border-l-green-500'}`}>
                    <div className="text-xs text-slate-500 uppercase font-bold tracking-wider">Uncited Voices</div>
                    <div className={`text-2xl font-bold mt-1 ${uncitedCount > 0 ? 'text-red-600' : 'text-green-700'}`}>{uncitedCount}</div>
                    {uncitedCount > 0 && <div className="text-xs text-red-400 mt-1">Not reflected in any sentence</div>}
                </Card>
            </div>

            {/* Sentence-by-sentence provenance */}
            <div className="space-y-3">
                {displayedSentences.map((sp) => (
                    <Card key={sp.index} className="overflow-hidden hover:shadow-md transition-shadow">
                        <button
                            onClick={() => setExpandedSentence(expandedSentence === sp.index ? null : sp.index)}
                            className="w-full text-left"
                        >
                            <div className="flex items-start gap-3">
                                <div className="flex-shrink-0 w-8 h-8 rounded-full bg-indigo-100 text-indigo-700 flex items-center justify-center text-sm font-bold mt-0.5">
                                    {sp.index + 1}
                                </div>
                                <div className="flex-1 min-w-0">
                                    <p className="text-sm text-slate-800 leading-relaxed font-medium">{sp.sentence}</p>
                                    <div className="flex items-center gap-2 mt-2 flex-wrap">
                                        {sp.strongCount > 0 && (
                                            <span className="text-[10px] bg-green-100 text-green-700 px-2 py-0.5 rounded-full font-semibold">
                                                {sp.strongCount} strong match{sp.strongCount !== 1 ? 'es' : ''}
                                            </span>
                                        )}
                                        {sp.moderateCount > 0 && (
                                            <span className="text-[10px] bg-amber-100 text-amber-700 px-2 py-0.5 rounded-full font-semibold">
                                                {sp.moderateCount} weak
                                            </span>
                                        )}
                                        <span className="text-[10px] text-slate-400">
                                            {sp.sources.length} total source{sp.sources.length !== 1 ? 's' : ''}
                                        </span>
                                        <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
                                            className={`text-slate-400 transition-transform ml-auto ${expandedSentence === sp.index ? 'rotate-180' : ''}`}>
                                            <polyline points="6 9 12 15 18 9" />
                                        </svg>
                                    </div>
                                </div>
                            </div>
                        </button>

                        {/* Expanded: show source citations */}
                        {expandedSentence === sp.index && (
                            <div className="mt-4 pt-3 border-t border-slate-100 space-y-2">
                                {sp.sources.length === 0 ? (
                                    <div className="text-sm text-slate-400 italic py-2">No participant inputs matched this sentence significantly.</div>
                                ) : (
                                    sp.sources.slice(0, 8).map((source, idx) => (
                                        <div
                                            key={`${source.participantId}-${idx}`}
                                            onClick={() => onSelectParticipant?.(source.participantId)}
                                            className="flex items-start gap-3 p-3 rounded-lg bg-slate-50 hover:bg-slate-100 cursor-pointer transition-colors group"
                                        >
                                            <div className={`flex-shrink-0 text-[10px] font-bold px-2 py-1 rounded border ${getBadgeColor(source.similarity)}`}>
                                                {(source.similarity * 100).toFixed(0)}%
                                            </div>
                                            <div className="flex-1 min-w-0">
                                                <div className="flex items-center gap-2 mb-0.5">
                                                    <span className="text-xs font-semibold text-slate-600">
                                                        {source.participantId}
                                                    </span>
                                                    <span className={`text-[9px] px-1.5 rounded ${source.sentiment === 'positive' ? 'bg-green-100 text-green-600' :
                                                            source.sentiment === 'negative' ? 'bg-red-100 text-red-600' :
                                                                'bg-slate-100 text-slate-500'
                                                        }`}>
                                                        {source.sentiment}
                                                    </span>
                                                    <span className={`text-[9px] font-semibold ${source.similarity >= 0.7 ? 'text-green-600' :
                                                            source.similarity >= 0.5 ? 'text-blue-600' :
                                                                'text-amber-600'
                                                        }`}>
                                                        {getBadgeLabel(source.similarity)}
                                                    </span>
                                                </div>
                                                <p className="text-xs text-slate-600 leading-relaxed line-clamp-2 group-hover:line-clamp-none transition-all">
                                                    "{source.originalText}"
                                                </p>
                                            </div>
                                        </div>
                                    ))
                                )}
                                {sp.sources.length > 8 && (
                                    <div className="text-xs text-slate-400 text-center py-1">
                                        + {sp.sources.length - 8} more sources
                                    </div>
                                )}
                            </div>
                        )}
                    </Card>
                ))}
            </div>

            {sentenceProvenance.length > 10 && !showAll && (
                <button
                    onClick={() => setShowAll(true)}
                    className="w-full text-center text-sm text-indigo-600 hover:text-indigo-700 font-medium py-2"
                >
                    Show all {sentenceProvenance.length} sentences →
                </button>
            )}
        </div>
    );
};
