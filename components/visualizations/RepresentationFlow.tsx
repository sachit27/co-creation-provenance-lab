import React, { useEffect, useMemo, useState } from 'react';
import { ParticipantAnalysis } from '../../types';

interface ContributionLineageProps {
  data: ParticipantAnalysis[];
  sentences: string[];
  selectedId?: string | null;
  onSelectParticipant?: (id: string | null) => void;
}

const PAGE_SIZE = 10;

export const ContributionLineage: React.FC<ContributionLineageProps> = ({ data, sentences, selectedId, onSelectParticipant }) => {
  const [localSelection, setLocalSelection] = useState<string | null>(null);
  const [sentenceIndex, setSentenceIndex] = useState<number | null>(null);
  const [query, setQuery] = useState('');
  const [page, setPage] = useState(0);
  const selection = onSelectParticipant ? selectedId : localSelection;
  const select = (id: string | null) => {
    if (onSelectParticipant) onSelectParticipant(id);
    else setLocalSelection(id);
    setSentenceIndex(null);
  };
  // Validate candidates before drawing; a missing score is not a zero score.
  const matchesFor = (p: ParticipantAnalysis) => p.sentenceMatches.filter(m =>
    Number.isInteger(m.sentenceIndex) && m.sentenceIndex >= 0 && m.sentenceIndex < sentences.length &&
    Number.isFinite(m.similarity) && m.similarity >= -1 && m.similarity <= 1
  ).sort((a, b) => b.similarity - a.similarity);
  const filtered = useMemo(() => {
    const term = query.trim().toLocaleLowerCase();
    return data.filter(p => `${p.id} ${p.originalText}`.toLocaleLowerCase().includes(term));
  }, [data, query]);
  const pages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const safePage = Math.min(page, pages - 1);
  const visible = filtered.slice(safePage * PAGE_SIZE, (safePage + 1) * PAGE_SIZE);
  const selected = data.find(p => p.id === selection);
  const selectedMatches = selected ? matchesFor(selected) : [];
  const activeSentence = sentenceIndex ?? selectedMatches[0]?.sentenceIndex ?? null;
  const comparison = selectedMatches.find(m => m.sentenceIndex === activeSentence);

  // Selections from another audit view remain visible in this view.
  useEffect(() => {
    if (!selection) return;
    const index = data.findIndex(p => p.id === selection);
    if (index >= 0) { setQuery(''); setPage(Math.floor(index / PAGE_SIZE)); }
  }, [selection, data]);

  const height = Math.max(visible.length * 58, sentences.length * 60, 280);
  const sourceY = (index: number) => (index + 0.5) * height / Math.max(visible.length, 1);
  const targetY = (index: number) => (index + 0.5) * height / Math.max(sentences.length, 1);
  const buttonClass = 'min-w-0 overflow-hidden rounded-lg border px-3 py-2 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 focus-visible:ring-offset-2';

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <label className="block w-full sm:max-w-sm text-sm font-medium text-slate-700">
          Find a contribution
          <input type="search" value={query} onChange={e => { setQuery(e.target.value); setPage(0); }} placeholder="Search by ID or words in the original text" className="mt-1.5 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-normal focus:outline-none focus:ring-2 focus:ring-indigo-500" />
        </label>
        <p className="text-xs text-slate-500">{data.length} contributions · {sentences.length} summary sentences</p>
      </div>

      <div className="rounded-xl border border-slate-200 overflow-hidden">
        <div className="flex flex-wrap justify-between gap-2 bg-slate-50 px-4 py-3 text-xs text-slate-600 border-b border-slate-200">
          <span>Select a contribution, then a summary sentence.</span>
          <span><span className="inline-block w-5 h-0.5 bg-indigo-500 align-middle mr-2" />Highlighted lines belong to your selection</span>
        </div>
        {visible.length === 0 ? <p className="p-8 text-center text-sm text-slate-500">No contributions match your search.</p> : (
          <><div className="sm:hidden p-3 space-y-3">
            <label className="block text-sm font-medium text-slate-700">Summary sentence
              <select value={activeSentence ?? ''} onChange={e => setSentenceIndex(e.target.value === '' ? null : Number(e.target.value))} className="block mt-2 w-full min-w-0 rounded-lg border border-slate-300 p-2 text-sm">
                <option value="">Choose a sentence</option>{sentences.map((_, index) => <option value={index} key={index}>Sentence {index + 1}</option>)}
              </select>
            </label>
            <p className="text-xs text-slate-500">Choose an original contribution. Its wording and the selected summary sentence appear below.</p>
            <div className="max-h-60 overflow-y-auto space-y-2">{visible.map(p => <button type="button" key={p.id} aria-pressed={selection === p.id} onClick={() => select(p.id)} className={`${buttonClass} block w-full ${selection === p.id ? 'border-indigo-400 bg-indigo-50 text-indigo-900' : 'border-slate-200 bg-white text-slate-700'}`}><span className="block text-xs font-semibold">{p.id}</span><span className="block text-sm line-clamp-2">{p.originalText}</span></button>)}</div>
          </div>
          <div className="hidden sm:block overflow-auto max-h-[440px]">
            <div className="min-w-[640px] p-4">
              <div className="grid grid-cols-[minmax(0,1fr)_minmax(0,0.65fr)_minmax(0,1.3fr)] gap-0 mb-3 text-xs font-semibold text-slate-500">
                <span>Original contributions</span><span className="text-center font-normal">Similarity links</span><span>Summary sentences</span>
              </div>
              <div className="relative grid grid-cols-[minmax(0,1fr)_minmax(0,0.65fr)_minmax(0,1.3fr)]" style={{ height }}>
                <div className="min-w-0 flex flex-col justify-around gap-1">
                  {visible.map(p => <button type="button" key={p.id} aria-pressed={selection === p.id} onClick={() => select(selection === p.id ? null : p.id)} className={`${buttonClass} h-12 ${selection === p.id ? 'border-indigo-400 bg-indigo-50 text-indigo-900' : 'border-slate-200 bg-white text-slate-700 hover:border-indigo-300'}`}>
                    <span className="block text-xs font-semibold truncate">{p.id}</span>
                    <span className="block truncate text-xs text-slate-500">{p.originalText}</span>
                  </button>)}
                </div>
                <svg viewBox={`0 0 200 ${height}`} preserveAspectRatio="none" className="w-full h-full" aria-hidden="true">
                  {visible.flatMap((p, index) => matchesFor(p).map((m, i) => {
                    const active = selection ? p.id === selection && (sentenceIndex === null || m.sentenceIndex === sentenceIndex) : sentenceIndex === m.sentenceIndex;
                    const focused = !!selection || sentenceIndex !== null;
                    return <path key={`${p.id}-${m.sentenceIndex}-${i}`} d={`M 0 ${sourceY(index)} C 90 ${sourceY(index)}, 110 ${targetY(m.sentenceIndex)}, 200 ${targetY(m.sentenceIndex)}`} fill="none" stroke={active ? '#6366f1' : '#94a3b8'} strokeWidth={active ? 2.5 : 1} opacity={active ? 0.85 : focused ? 0.1 : 0.3} vectorEffect="non-scaling-stroke" />;
                  }))}
                </svg>
                <div className="min-w-0 flex flex-col justify-around gap-1">
                  {sentences.map((sentence, index) => <button type="button" key={index} aria-pressed={activeSentence === index} onClick={() => setSentenceIndex(index)} className={`${buttonClass} min-h-12 ${activeSentence === index ? 'border-indigo-400 bg-indigo-50 text-indigo-900' : 'border-slate-200 text-slate-700 hover:border-indigo-300'}`} style={{ maxHeight: height / Math.max(sentences.length, 1) - 4 }}>
                    <span className="block text-xs font-semibold mb-0.5">Sentence {index + 1}</span><span className="block text-xs leading-relaxed line-clamp-2">{sentence}</span>
                  </button>)}
                </div>
              </div>
            </div>
          </div></>
        )}
        <div className="flex items-center justify-between gap-2 border-t border-slate-200 bg-slate-50 px-4 py-3 text-xs text-slate-600">
          <span>{filtered.length ? `${safePage * PAGE_SIZE + 1}–${Math.min((safePage + 1) * PAGE_SIZE, filtered.length)} of ${filtered.length} contributions${query ? ' matching search' : ''}` : '0 contributions'}</span>
          <div className="flex gap-2"><button type="button" disabled={safePage === 0} onClick={() => setPage(safePage - 1)} className="rounded border border-slate-300 px-3 py-2 hover:bg-white disabled:opacity-40">Previous</button><button type="button" disabled={safePage >= pages - 1} onClick={() => setPage(safePage + 1)} className="rounded border border-slate-300 px-3 py-2 hover:bg-white disabled:opacity-40">Next</button></div>
        </div>
      </div>

      <section aria-label="Compare original and summary wording" className="rounded-xl border border-indigo-100 bg-indigo-50/40 p-4 md:p-5">
        <div className="flex flex-wrap justify-between items-center gap-2 mb-4"><h3 className="text-sm font-semibold text-slate-900">Compare the actual wording</h3>{selected && <button type="button" onClick={() => select(null)} className="text-xs text-indigo-700 underline underline-offset-4">Clear selection</button>}</div>
        <div className="grid md:grid-cols-2 gap-5">
          <div><p className="text-xs font-semibold text-slate-500 mb-2">Original contribution{selected ? ` · ${selected.id}` : ''}</p><p className="text-sm leading-relaxed text-slate-800 whitespace-pre-wrap">{selected?.originalText ?? 'Choose a contribution above to read it in full.'}</p></div>
          <div><p className="text-xs font-semibold text-slate-500 mb-2">{activeSentence !== null ? `Summary · Sentence ${activeSentence + 1}` : 'Summary sentence'}</p><p className="text-sm leading-relaxed text-slate-800 whitespace-pre-wrap">{activeSentence !== null ? sentences[activeSentence] : 'Select a sentence to compare its wording with the original.'}</p>{selected && <p className="mt-3 text-xs text-indigo-800">{comparison ? `Text similarity: ${comparison.similarity.toFixed(2)} · This score does not establish whether the meaning was preserved.` : 'No recorded similarity link for this pair. This alone does not establish omission.'}</p>}</div>
        </div>
        <p className="mt-4 pt-3 border-t border-indigo-100 text-xs leading-relaxed text-slate-600">Look for what is included, softened, or missing. Links guide your review; they do not prove agreement, influence, or fair representation.</p>
      </section>
    </div>
  );
};
