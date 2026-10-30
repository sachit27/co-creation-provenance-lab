import React, { useId, useMemo, useState } from 'react';
import type { LanguageFidelity, ParticipantAnalysis, TransformationType } from '../../types';
import { buildSynthesisTrace } from '../../services/synthesisTrace';

export interface SynthesisTraceProps {
  participants: ParticipantAnalysis[];
  summarySentences: string[];
  languageFidelity?: LanguageFidelity;
  selectedId?: string | null;
  onSelectParticipant?: (id: string | null) => void;
  illustrative?: boolean;
  title?: string;
}
const labels: Record<TransformationType, string> = {
  preserved: 'Meaning retained', softened: 'Force softened', sanitized: 'Demand neutralized',
  abstracted: 'Specific detail generalized', target_shifted: 'Target changed',
  target_uncertain: 'Target uncertain', dropped: 'No aligned summary span', unassessed: 'Unassessed',
};
const tones: Record<TransformationType, string> = {
  preserved: 'border-emerald-200 bg-emerald-50 text-emerald-900',
  softened: 'border-amber-200 bg-amber-50 text-amber-900', sanitized: 'border-rose-200 bg-rose-50 text-rose-900',
  abstracted: 'border-amber-200 bg-amber-50 text-amber-900', target_shifted: 'border-rose-200 bg-rose-50 text-rose-900',
  target_uncertain: 'border-slate-200 bg-slate-50 text-slate-700', dropped: 'border-rose-200 bg-rose-50 text-rose-900',
  unassessed: 'border-slate-200 bg-slate-50 text-slate-700',
};
const PAGE_SIZE = 12;

export const SynthesisTrace: React.FC<SynthesisTraceProps> = ({
  participants, summarySentences, languageFidelity, selectedId, onSelectParticipant,
  illustrative = false, title = 'Follow the evidence through the summary',
}) => {
  const id = useId();
  const [localId, setLocalId] = useState<string | null>(null);
  const [query, setQuery] = useState('');
  const [page, setPage] = useState(0);
  const [sentenceIndex, setSentenceIndex] = useState<number | null>(null);
  const records = useMemo(() => buildSynthesisTrace(participants, summarySentences, languageFidelity), [participants, summarySentences, languageFidelity]);
  const activeId = onSelectParticipant ? selectedId : localId;
  const selected = records.find(record => record.participant.id === activeId) ?? records[0];
  const select = (participantId: string) => {
    setLocalId(participantId);
    onSelectParticipant?.(participantId);
    setSentenceIndex(null);
  };
  const filtered = records.filter(record => `${record.participant.id} ${record.participant.group ?? ''} ${record.participant.originalText}`.toLowerCase().includes(query.toLowerCase()));
  const lastPage = Math.max(0, Math.ceil(filtered.length / PAGE_SIZE) - 1);
  const currentPage = Math.min(page, lastPage);
  const visible = filtered.slice(currentPage * PAGE_SIZE, (currentPage + 1) * PAGE_SIZE);
  const related = new Set(selected?.links.map(link => link.sentenceIndex) ?? []);
  selected?.mappings.forEach(mapping => { if (mapping.summarySentenceIndex != null) related.add(mapping.summarySentenceIndex); });
  const sentenceChoices = sentenceIndex === null ? summarySentences.map((_, index) => index) : [sentenceIndex];
  const shownSentences = sentenceChoices.filter(index => index >= 0 && index < summarySentences.length).slice(0, PAGE_SIZE);
  const mappings = selected?.mappings.filter(mapping => sentenceIndex === null || mapping.summarySentenceIndex === sentenceIndex || mapping.summarySentenceIndex == null) ?? [];

  const overviewRecords = [...(selected ? [selected] : []), ...records.filter(record => record !== selected)].slice(0, 10);
  const overviewSentenceIndices = [...new Set([...(sentenceIndex == null ? [] : [sentenceIndex]), ...related, ...summarySentences.map((_, index) => index)])].filter(index => index >= 0 && index < summarySentences.length).slice(0, 6);
  const overviewSentences = overviewSentenceIndices.map(index => summarySentences[index]);
  const sideUnits = records.flatMap(record => record.mappings).filter(mapping => mapping.type === 'dropped' || mapping.type === 'unassessed');
  const selectedNeedsReview = selected?.mappings.some(mapping => mapping.type !== 'preserved') ?? false;
  const selectedReviewUnassessed = selected?.mappings.some(mapping => mapping.type === 'unassessed') ?? false;
  const sourceY = (index: number) => 25 + index * (110 / Math.max(1, overviewRecords.length - 1));
  const targetY = (index: number) => 25 + index * (110 / Math.max(1, overviewSentences.length - 1));

  return (
    <section aria-labelledby={`${id}-title`} className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
      <div className="border-b border-slate-200 bg-gradient-to-r from-indigo-50 via-white to-amber-50 px-5 py-5 sm:px-6">
        <div className="mb-2 flex flex-wrap items-center gap-2 text-[10px] font-bold uppercase tracking-wider">
          <span className="rounded-full border border-indigo-200 bg-white px-2 py-1 text-indigo-800">Inputs → Synthesis → Review</span>
          <span className="text-slate-500">{illustrative ? 'Hand-authored illustrative example' : `${participants.length} source records · current audit`}</span>
        </div>
        <h3 id={`${id}-title`} className="text-lg font-bold tracking-tight text-slate-900">{title}</h3>
        <p className="mt-1 max-w-3xl text-xs leading-relaxed text-slate-600">Select a contribution, follow its possible links, and compare the actual wording. Similarity suggests where to look; it cannot establish that an idea survived the summary.</p>
      </div>
      <div className="border-b border-slate-200 bg-slate-950 px-5 py-4 text-white sm:px-6">
        <div className="mb-2 flex justify-between gap-4 text-[10px] font-semibold uppercase tracking-wider text-slate-300"><span>Many contributions</span><span>Fewer summary sentences</span></div>
        <svg viewBox="0 0 640 205" role="img" aria-label="Candidate semantic connections converge from source records to summary sentences. A separate dashed path leads to review when the selected contribution has a model-coded concern or an unassessed source unit." className="h-44 w-full overflow-visible">
          <defs><linearGradient id={`${id}-thread`}><stop stopColor="#818cf8" /><stop offset="1" stopColor="#67e8f9" /></linearGradient></defs>
          {overviewRecords.flatMap((record, sourceIndex) => record.links.filter(link => overviewSentenceIndices.includes(link.sentenceIndex)).map(link => <path key={`${record.participant.id}-${link.sentenceIndex}`} d={`M 70 ${sourceY(sourceIndex)} C 240 ${sourceY(sourceIndex)}, 380 ${targetY(overviewSentenceIndices.indexOf(link.sentenceIndex))}, 570 ${targetY(overviewSentenceIndices.indexOf(link.sentenceIndex))}`} fill="none" stroke={`url(#${id}-thread)`} strokeWidth={selected?.participant.id === record.participant.id ? 2.5 : 1} opacity={selected?.participant.id === record.participant.id ? .95 : .16} className="transition-[opacity,stroke-width] duration-200 motion-reduce:transition-none" />))}
          {selectedNeedsReview && <path d="M 70 25 C 255 25, 370 174, 570 174" fill="none" stroke={selectedReviewUnassessed ? '#94a3b8' : '#fbbf24'} strokeWidth="2" strokeDasharray="5 5" aria-hidden="true" />}
          {overviewRecords.map((record, index) => <g key={record.participant.id}><circle cx="70" cy={sourceY(index)} r={selected?.participant.id === record.participant.id ? 5 : 3} fill={selected?.participant.id === record.participant.id ? '#c7d2fe' : '#64748b'} /><text x="57" y={sourceY(index) + 3} textAnchor="end" fontSize="9" fill="#cbd5e1">{record.participant.id.slice(0, 9)}</text></g>)}
          {overviewSentences.map((_, index) => <g key={index}><rect x="570" y={targetY(index) - 7} width="30" height="14" rx="4" fill={related.has(overviewSentenceIndices[index]) ? '#a5f3fc' : '#334155'} /><text x="585" y={targetY(index) + 3} textAnchor="middle" fontSize="9" fill={related.has(overviewSentenceIndices[index]) ? '#164e63' : '#cbd5e1'}>S{overviewSentenceIndices[index] + 1}</text></g>)}
          <rect x="552" y="163" width="66" height="22" rx="6" fill={selectedNeedsReview ? '#78350f' : '#334155'} stroke={selectedNeedsReview ? '#fbbf24' : '#64748b'} strokeDasharray="4 3" />
          <text x="585" y="177" textAnchor="middle" fontSize="9" fill="#fef3c7">Review</text>
        </svg>
        <div className="flex flex-wrap items-center justify-between gap-2 border-t border-slate-700 pt-3 text-[10px] text-slate-300"><span>Candidate links · select a contribution below to follow its threads{records.length > 10 || summarySentences.length > 6 ? ' · spotlight subset: up to 10 records and 6 sentences' : ''}</span><span className="rounded-lg border border-dashed border-amber-300/50 bg-amber-100/10 px-2 py-1 text-amber-100">Separate review channel: {sideUnits.filter(unit => unit.type === 'dropped').length} no aligned span · {sideUnits.filter(unit => unit.type === 'unassessed').length} unassessed{!languageFidelity?.sourceMappings ? ' · census unavailable' : ''}</span></div>
      </div>
      <div className="grid divide-y divide-slate-200 lg:grid-cols-[1fr_1fr_1.05fr] lg:divide-x lg:divide-y-0">
        <div className="min-w-0 p-4 sm:p-5">
          <h4 className="mb-1 flex items-center gap-2 text-sm font-bold text-slate-900"><span className="rounded bg-indigo-100 px-2 py-1 text-xs text-indigo-800">01</span> Original contributions</h4>
          <p className="mb-3 text-[11px] text-slate-500">Choose whose words to follow.</p>
          <label className="sr-only" htmlFor={`${id}-search`}>Search contributions</label>
          <input id={`${id}-search`} type="search" value={query} onChange={event => { setQuery(event.target.value); setPage(0); }} placeholder="Search words, record, or group" className="mb-3 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs focus:outline-none focus:ring-2 focus:ring-indigo-500" />
          <div className="max-h-[410px] space-y-2 overflow-y-auto p-1" role="group" aria-label="Choose a contribution">
            {visible.map(({ participant }) => (
              <button key={participant.id} type="button" aria-pressed={selected?.participant.id === participant.id} onClick={() => select(participant.id)} className={`w-full rounded-xl border p-3 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 ${selected?.participant.id === participant.id ? 'border-indigo-400 bg-indigo-50 shadow-sm' : 'border-slate-200 bg-white hover:border-indigo-300'}`}>
                <span className="mb-1.5 flex flex-wrap items-center justify-between gap-1 text-[10px] font-semibold text-indigo-800"><span>{participant.id}</span><span>{participant.group ?? 'Group unspecified'}</span></span>
                <span className="block text-xs leading-relaxed text-slate-800">“{participant.originalText.length > 230 ? `${participant.originalText.slice(0, 230)}…` : participant.originalText}”</span>
              </button>
            ))}
            {!visible.length && <p className="py-6 text-xs text-slate-500">No matching contributions.</p>}
          </div>
          {filtered.length > PAGE_SIZE && <div className="mt-3 flex items-center justify-between gap-2 text-xs"><button type="button" disabled={currentPage === 0} onClick={() => setPage(currentPage - 1)} className="rounded border px-2 py-1 disabled:opacity-40">Previous</button><span>{currentPage + 1} / {lastPage + 1}</span><button type="button" disabled={currentPage === lastPage} onClick={() => setPage(currentPage + 1)} className="rounded border px-2 py-1 disabled:opacity-40">Next</button></div>}
        </div>
        <div className="min-w-0 bg-slate-50/60 p-4 sm:p-5">
          <h4 className="mb-1 flex items-center gap-2 text-sm font-bold text-slate-900"><span className="rounded bg-slate-200 px-2 py-1 text-xs text-slate-700">02</span> The synthesis</h4>
          <p className="mb-3 text-[11px] text-slate-500">Candidate links are associations, not proven derivation.</p>
          {summarySentences.length > PAGE_SIZE && <><label htmlFor={`${id}-sentence`} className="mb-1 block text-xs text-slate-600">Inspect a summary sentence</label><select id={`${id}-sentence`} value={sentenceIndex ?? ''} onChange={event => setSentenceIndex(event.target.value === '' ? null : Number(event.target.value))} className="mb-3 w-full rounded border border-slate-300 bg-white p-2 text-xs"><option value="">First {PAGE_SIZE} sentences</option>{summarySentences.map((sentence, index) => <option key={index} value={index}>S{index + 1} · {sentence.slice(0, 65)}</option>)}</select></>}
          <div className="max-h-[460px] space-y-3 overflow-y-auto p-1" role="group" aria-label="Summary sentences">
            {shownSentences.map(index => {
              const candidate = selected?.links.find(link => link.sentenceIndex === index);
              const coded = selected?.mappings.some(mapping => mapping.summarySentenceIndex === index && mapping.type !== 'unassessed');
              return <button key={index} type="button" aria-pressed={sentenceIndex === index} onClick={() => setSentenceIndex(sentenceIndex === index ? null : index)} className={`w-full rounded-xl border p-3 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 ${sentenceIndex === index ? 'border-indigo-500 bg-indigo-50 ring-1 ring-indigo-200' : related.has(index) ? 'border-indigo-300 bg-white shadow-sm' : 'border-slate-200 bg-white'}`}><span className="mb-2 block text-[10px] font-bold uppercase tracking-wide text-slate-500">Sentence {index + 1}</span><span className="block text-sm leading-relaxed text-slate-900">{summarySentences[index]}</span><span className="mt-3 block text-[10px] font-medium text-indigo-700">{coded ? 'Source-span assessment available' : candidate ? `Candidate semantic link · ${candidate.similarity.toFixed(2)}` : 'No displayed link from this contribution'}</span></button>;
            })}
            {!summarySentences.length && <p className="py-6 text-xs text-slate-500">No summary sentences available.</p>}
          </div>
        </div>
        <div className="min-w-0 p-4 sm:p-5" aria-live="polite">
          <h4 className="mb-1 flex items-center gap-2 text-sm font-bold text-slate-900"><span className="rounded bg-amber-100 px-2 py-1 text-xs text-amber-900">03</span> What needs review</h4>
          <p className="mb-3 text-[11px] text-slate-500">{selected ? `${selected.participant.id} · ${illustrative ? 'illustrative labels' : selected.mappings.length ? 'model-coded assessments, subject to review' : 'no source-unit assessment available'}` : 'Select a contribution to begin.'}</p>
          <div className="max-h-[460px] space-y-3 overflow-y-auto p-1">
            {selected && <details className="rounded-xl border border-slate-200 bg-white p-3"><summary className="cursor-pointer text-[11px] font-semibold text-slate-700">Inspect exact original wording · {selected.participant.id}</summary><p className="mt-2 whitespace-pre-wrap break-words text-xs leading-relaxed text-slate-800">{selected.participant.originalText}</p></details>}
            {mappings.slice(0, PAGE_SIZE).map((mapping, index) => <div key={mapping.sourceUnitId ?? index} className={`rounded-xl border p-3 ${tones[mapping.type]}`}><p className="text-[11px] font-bold">{labels[mapping.type]}</p><p className="mt-2 text-xs leading-relaxed">“{mapping.rawPhrase}”</p><div className="mt-2 border-t border-current/10 pt-2 text-xs leading-relaxed">{mapping.summaryPhrase ? <>Summary: “{mapping.summaryPhrase}”</> : mapping.type === 'unassessed' ? 'No valid assessment is available for this source unit.' : illustrative ? 'This detail has no aligned summary wording in the example.' : 'The evaluator found no aligned summary span for this source unit.'}</div></div>)}
            {mappings.length > PAGE_SIZE && <p className="text-[11px] text-slate-500">Showing {PAGE_SIZE} of {mappings.length} source-unit assessments. Select a summary sentence to narrow the view.</p>}
            {selected && !mappings.length && <div className="rounded-xl border border-dashed border-slate-300 bg-slate-50 p-4 text-xs leading-relaxed text-slate-600"><strong className="block text-slate-800">No verified transformation assessment</strong><p className="mt-2">{!selected.scoreAvailable ? 'Semantic alignment is unavailable for this contribution.' : selected.links.length ? 'Inspect the candidate links and compare wording directly.' : 'No candidate sentence links are available. This does not establish omission.'}</p><p className="mt-2">Specificity, conditions, disagreement, and urgency need a human reading of the source and summary.</p></div>}
            {illustrative && <p className="text-[11px] leading-relaxed text-slate-500">The example and its labels were written to explain the workflow. They are not results from a model run.</p>}
          </div>
        </div>
      </div>
      <p className="border-t border-slate-200 bg-slate-50 px-5 py-3 text-[11px] leading-relaxed text-slate-500">A close semantic match can still generalize a specific request or leave out a condition. An absent link can also reflect retrieval limits. Review flags are not a verdict on fairness or participant intent.</p>
    </section>
  );
};
