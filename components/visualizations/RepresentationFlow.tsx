import React, { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
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
  // Keep one valid candidate per sentence; failed embeddings supply no evidence.
  const matchesFor = (p: ParticipantAnalysis) => {
    if (p.embeddingFailed || p.alignmentUnavailableReason) return [];
    const candidates = new Map<number, number>();
    for (const match of p.sentenceMatches) {
      if (!Number.isInteger(match.sentenceIndex) || match.sentenceIndex < 0 || match.sentenceIndex >= sentences.length
        || !Number.isFinite(match.similarity) || match.similarity < -1 || match.similarity > 1) continue;
      candidates.set(match.sentenceIndex, Math.max(candidates.get(match.sentenceIndex) ?? -1, match.similarity));
    }
    return [...candidates].map(([sentenceIndex, similarity]) => ({ sentenceIndex, similarity })).sort((a, b) => b.similarity - a.similarity);
  };
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
  const diagramRef = useRef<HTMLDivElement>(null);
  const sourceRefs = useRef(new Map<string, HTMLButtonElement>());
  const targetRefs = useRef(new Map<number, HTMLButtonElement>());
  const [geometry, setGeometry] = useState({ height: 400, sources: {} as Record<string, number>, targets: {} as Record<number, number> });
  // Full text determines row heights. Measure actual button centers so ribbons
  // stay aligned after wrapping, resizing, zooming, or font loading.
  useLayoutEffect(() => {
    const diagram = diagramRef.current;
    if (!diagram) return;
    const measure = () => {
      const bounds = diagram.getBoundingClientRect();
      if (!bounds.height || !bounds.width) return;
      const center = (element: HTMLElement) => { const row = element.getBoundingClientRect(); return row.top - bounds.top + row.height / 2; };
      setGeometry({ height: bounds.height,
        sources: Object.fromEntries([...sourceRefs.current].map(([id, element]) => [id, center(element)])),
        targets: Object.fromEntries([...targetRefs.current].map(([id, element]) => [id, center(element)])),
      });
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(diagram);
    for (const element of [...sourceRefs.current.values(), ...targetRefs.current.values()]) observer.observe(element);
    return () => observer.disconnect();
  }, [data, sentences, safePage, query]);

  // Selections from another audit view remain visible in this view.
  useEffect(() => {
    if (!selection) return;
    const index = data.findIndex(p => p.id === selection);
    if (index >= 0) { setQuery(''); setPage(Math.floor(index / PAGE_SIZE)); }
  }, [selection, data]);

  const buttonClass = 'min-w-0 shrink-0 rounded-lg border px-3 py-2 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 focus-visible:ring-offset-2';

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
          <span>Select a contribution to see all its recorded sentence matches.</span>
          <span><span className="inline-block w-5 h-0.5 bg-indigo-500 align-middle mr-2" />Indigo: selected links · gold: other links</span>
        </div>
        {visible.length === 0 ? <p className="p-8 text-center text-sm text-slate-500">No contributions match your search.</p> : (
          <><div className="sm:hidden p-3 space-y-3">
            <label className="block text-sm font-medium text-slate-700">Summary sentence
              <select value={activeSentence ?? ''} onChange={e => setSentenceIndex(e.target.value === '' ? null : Number(e.target.value))} className="block mt-2 w-full min-w-0 rounded-lg border border-slate-300 p-2 text-sm">
                <option value="">Choose a sentence</option>{sentences.map((_, index) => <option value={index} key={index}>Sentence {index + 1}</option>)}
              </select>
            </label>
            <p className="text-xs text-slate-500">Choose an original contribution. Its complete wording and all recorded summary matches appear below.</p>
            <div className="max-h-60 overflow-y-auto space-y-2">{visible.map(p => <button type="button" key={p.id} aria-pressed={selection === p.id} onClick={() => select(p.id)} className={`${buttonClass} block w-full ${selection === p.id ? 'border-indigo-400 bg-indigo-50 text-indigo-900' : 'border-slate-200 bg-white text-slate-700'}`}><span className="block text-xs font-semibold">{p.id}</span><span className="block text-sm line-clamp-2">{p.originalText}</span></button>)}</div>
          </div>
          <div className="hidden sm:block overflow-auto max-h-[440px]">
            <div className="min-w-[640px] p-4">
              <div className="grid grid-cols-[minmax(0,1fr)_minmax(0,0.65fr)_minmax(0,1.3fr)] gap-0 mb-3 text-xs font-semibold text-slate-500">
                <span>Original contributions</span><span className="text-center font-normal">Similarity links</span><span>Summary sentences</span>
              </div>
              <div ref={diagramRef} className="relative grid grid-cols-[minmax(0,1fr)_minmax(0,0.65fr)_minmax(0,1.3fr)]" style={{ minHeight: 400 }}>
                <div className="min-w-0 flex flex-col justify-around gap-2">
                  {visible.map(p => <button type="button" key={p.id} ref={element => { if (element) sourceRefs.current.set(p.id, element); else sourceRefs.current.delete(p.id); }} aria-pressed={selection === p.id} onClick={() => select(selection === p.id ? null : p.id)} className={`${buttonClass} ${selection === p.id ? 'border-indigo-400 bg-indigo-50 text-indigo-900' : 'border-slate-200 bg-white text-slate-700 hover:border-indigo-300'}`}>
                    <span className="block text-xs font-semibold">{p.id}</span>
                    <span className="block whitespace-pre-wrap text-xs leading-relaxed text-slate-600">{p.originalText}</span>
                  </button>)}
                </div>
                <div className="relative"><svg viewBox={`0 0 200 ${geometry.height}`} preserveAspectRatio="none" className="absolute inset-0 w-full h-full" aria-hidden="true">
                  {visible.flatMap((p, index) => matchesFor(p).map((m, i) => {
                    const active = selection ? p.id === selection : sentenceIndex === m.sentenceIndex;
                    const focused = !!selection || sentenceIndex !== null;
                    if (geometry.sources[p.id] === undefined || geometry.targets[m.sentenceIndex] === undefined) return null;
                    return <path key={`${p.id}-${m.sentenceIndex}-${i}`} d={`M 0 ${geometry.sources[p.id]} C 90 ${geometry.sources[p.id]}, 110 ${geometry.targets[m.sentenceIndex]}, 200 ${geometry.targets[m.sentenceIndex]}`} fill="none" stroke={active ? '#4f46e5' : '#ca8a04'} strokeWidth={active ? 2.5 : 1.4} opacity={active ? 0.95 : focused ? 0.55 : 0.75} vectorEffect="non-scaling-stroke" />;
                  }))}
                </svg></div>
                <div className="min-w-0 flex flex-col justify-around gap-2">
                  {sentences.map((sentence, index) => <button type="button" key={index} ref={element => { if (element) targetRefs.current.set(index, element); else targetRefs.current.delete(index); }} aria-pressed={activeSentence === index} onClick={() => setSentenceIndex(index)} className={`${buttonClass} min-h-12 ${activeSentence === index ? 'border-indigo-400 bg-indigo-50 text-indigo-900' : 'border-slate-200 text-slate-700 hover:border-indigo-300'}`}>
                    <span className="block text-xs font-semibold mb-0.5">Sentence {index + 1}</span><span className="block whitespace-pre-wrap text-xs leading-relaxed">{sentence}</span>
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
          <div className="space-y-3">
            <p className="text-xs font-semibold text-slate-500">{selected ? `${selectedMatches.length} recorded summary ${selectedMatches.length === 1 ? 'match' : 'matches'} · all shown below` : 'Summary wording'}</p>
            {selectedMatches.map(match => <article key={match.sentenceIndex} className={`rounded-lg border p-3 ${activeSentence === match.sentenceIndex ? 'border-indigo-300 bg-white' : 'border-slate-200 bg-white/70'}`}>
              <p className="text-xs font-semibold text-slate-500 mb-2">Summary · Sentence {match.sentenceIndex + 1}</p>
              <p className="text-sm leading-relaxed text-slate-800 whitespace-pre-wrap">{sentences[match.sentenceIndex]}</p>
              <p className="mt-2 text-xs text-indigo-800">Text similarity: {match.similarity.toFixed(2)}</p>
            </article>)}
            {activeSentence !== null && !selectedMatches.some(match => match.sentenceIndex === activeSentence) && <article className="rounded-lg border border-slate-200 bg-white p-3">
              <p className="text-xs font-semibold text-slate-500 mb-2">Summary · Sentence {activeSentence + 1}</p>
              <p className="text-sm leading-relaxed text-slate-800 whitespace-pre-wrap">{sentences[activeSentence]}</p>
              {selected && <p className="mt-2 text-xs text-slate-600">No recorded similarity link for this pair. This alone does not establish omission.</p>}
            </article>}
            {activeSentence === null && selectedMatches.length === 0 && <p className="text-sm text-slate-600">{selected ? 'This contribution has no valid recorded sentence matches. You can still select any summary sentence to compare the wording.' : 'Choose a contribution to read all its recorded summary matches, or select a sentence.'}</p>}
            {selected && <p className="text-xs text-slate-600">Similarity scores do not establish whether the meaning was preserved.</p>}
          </div>
        </div>
        <p className="mt-4 pt-3 border-t border-indigo-100 text-xs leading-relaxed text-slate-600">Look for what is included, softened, or missing. Links guide your review; they do not prove agreement, influence, or fair representation.</p>
      </section>
    </div>
  );
};
