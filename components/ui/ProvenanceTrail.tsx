import React, { useState, useMemo } from 'react';
import { AnalysisResult } from '../../types';
import { Card } from './Card';

/**
 * Sentence-to-source semantic association view.
 *
 * For each summary sentence, shows which participant inputs have stored matches,
 * ranked by cosine similarity. This is the inverse of the per-participant
 * sentenceMatches view — pivoted to sentence → sources.
 *
 * These are retrieval candidates, not observed citations, derivations, or proof
 * that a source shaped a sentence.
 */

interface ProvenanceTrailProps {
    data: AnalysisResult;
    onSelectParticipant?: (id: string) => void;
}

interface SentenceSource {
    participantId: string;
    originalText: string;
    similarity: number;
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
                if (match) {
                    sources.push({
                        participantId: p.id,
                        originalText: p.originalText,
                        similarity: match.similarity,
                    });
                }
            }

            // Sort by similarity descending
            sources.sort((a, b) => b.similarity - a.similarity);

            return {
                sentence,
                index: sIdx,
                sources,
            };
        });
    }, [data]);

    if (sentenceProvenance.length === 0) {
        return (
            <Card>
                <div className="text-center py-8 text-slate-400">
                    <p className="text-lg mb-2">No sentence–source matches available</p>
                    <p className="text-sm">Run an analysis to generate similarity-based retrieval candidates.</p>
                </div>
            </Card>
        );
    }

    // Coverage stats
    const totalParticipants = data.participants.length;
    const citedParticipants = new Set(
        sentenceProvenance.flatMap(sp => sp.sources.map(s => s.participantId))
    );
    const uncitedCount = totalParticipants - citedParticipants.size;

    const displayedSentences = showAll ? sentenceProvenance : sentenceProvenance.slice(0, 10);

    return (
        <div className="space-y-4">
            {/* Header Stats */}
            <div className="grid grid-cols-3 gap-3">
                <Card className="border-l-4 border-l-indigo-500">
                    <div className="text-xs text-slate-500 uppercase font-bold tracking-wider">Summary Sentences</div>
                    <div className="text-2xl font-bold text-slate-800 mt-1">{sentenceProvenance.length}</div>
                </Card>
                <Card className="border-l-4 border-l-green-500">
                    <div className="text-xs text-slate-500 uppercase font-bold tracking-wider">Matched Source Records</div>
                    <div className="text-2xl font-bold text-green-700 mt-1">{citedParticipants.size}</div>
                    <div className="text-xs text-slate-400 mt-1">of {totalParticipants} participants</div>
                </Card>
                <Card className={`border-l-4 ${uncitedCount > 0 ? 'border-l-red-500' : 'border-l-green-500'}`}>
                    <div className="text-xs text-slate-500 uppercase font-bold tracking-wider">No Stored Match</div>
                    <div className={`text-2xl font-bold mt-1 ${uncitedCount > 0 ? 'text-red-600' : 'text-green-700'}`}>{uncitedCount}</div>
                    {uncitedCount > 0 && <div className="text-xs text-red-400 mt-1">No edge above the run threshold; inspect manually</div>}
                </Card>
            </div>

            {/* Sentence-by-sentence semantic-association candidates */}
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
                                        <span className="text-[10px] text-slate-400">
                                            {sp.sources.length} semantic candidate{sp.sources.length !== 1 ? 's' : ''}
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
                                    <div className="text-sm text-slate-400 italic py-2">No source record has a stored match above the run threshold. This does not prove the sentence is unsourced.</div>
                                ) : (
                                    sp.sources.slice(0, 8).map((source, idx) => (
                                        <div
                                            key={`${source.participantId}-${idx}`}
                                            onClick={() => onSelectParticipant?.(source.participantId)}
                                            className="flex items-start gap-3 p-3 rounded-lg bg-slate-50 hover:bg-slate-100 cursor-pointer transition-colors group"
                                        >
                                            <div className="flex-shrink-0 rounded border border-slate-300 bg-slate-100 px-2 py-1 text-[10px] font-bold text-slate-700">
                                                cosine {source.similarity.toFixed(3)}
                                            </div>
                                            <div className="flex-1 min-w-0">
                                                <div className="flex items-center gap-2 mb-0.5">
                                                    <span className="text-xs font-semibold text-slate-600">
                                                        {source.participantId}
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
