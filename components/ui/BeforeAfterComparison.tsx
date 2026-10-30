import React from 'react';
import type { AnalysisResult } from '../../types';
import { wordDiffSegments, compareSourceScores } from '../../services/auditReview';

type SourceChange = ReturnType<typeof compareSourceScores>['changes'][number];
type SummarySide = ReturnType<typeof wordDiffSegments>['before'];

interface ComparisonProps {
  before: AnalysisResult;
  after: AnalysisResult;
  onClose?: () => void;
  onAdopt?: () => void;
}

const wordCount = (value: string) => value.trim() ? value.trim().split(/\s+/).length : 0;

function SummaryTextCard({ title, segments, added }: { title: string; segments: SummarySide; added: boolean }) {
  return (
    <div>
      <h3 className="text-sm font-semibold mb-2 text-slate-700">{title}</h3>
      <div className="rounded-xl border border-slate-200 bg-slate-50 p-4 text-sm leading-relaxed whitespace-pre-wrap max-h-80 overflow-auto">
        {segments.map((segment, index) => segment.changed
          ? <mark key={index} className={added ? 'bg-indigo-100 text-slate-900' : 'bg-amber-100 text-slate-900'}>{segment.text}</mark>
          : <React.Fragment key={index}>{segment.text}</React.Fragment>)}
      </div>
    </div>
  );
}

function AlignmentGroup({ title, rows }: { title: string; rows: SourceChange[] }) {
  return (
    <div className="rounded-xl border border-slate-200 p-4">
      <h3 className="text-sm font-semibold text-slate-800 mb-3">{title}</h3>
      {!rows.length
        ? <p className="text-sm text-slate-500">None among valid paired scores.</p>
        : rows.slice(0, 5).map(source => (
          <details key={source.id} className="py-2 border-t border-slate-100">
            <summary className="cursor-pointer text-sm flex-wrap text-slate-700">
              {source.id} · {source.before.toFixed(2)} → {source.after.toFixed(2)}{' '}
              <span className="font-semibold">({source.change > 0 ? '+' : ''}{source.change.toFixed(2)})</span>
            </summary>
            <p className="text-sm text-slate-600 mt-2 whitespace-pre-wrap">{source.text}</p>
          </details>
        ))}
    </div>
  );
}

export function BeforeAfterComparison({ before, after, onClose, onAdopt }: ComparisonProps) {
  const comparison = compareSourceScores(before, after);
  const wording = wordDiffSegments(before.summary, after.summary);
  const beforeWords = wordCount(before.summary);
  const afterWords = wordCount(after.summary);
  const increased = comparison.changes.filter(source => source.change > 0.005).sort((a, b) => b.change - a.change);
  const decreased = comparison.changes.filter(source => source.change < -0.005).sort((a, b) => a.change - b.change);

  return (
    <section aria-label="Revision comparison" className="rounded-2xl border border-slate-200 bg-white overflow-hidden">
      <div className="p-5 border-b border-slate-200 flex flex-wrap justify-between gap-3">
        <div>
          <h2 className="text-lg font-bold text-slate-900">Review the revised summary</h2>
          <p className="text-sm text-slate-600 mt-1">Compare the wording and inspect whose alignment changed before adopting it.</p>
        </div>
        {onClose && <button aria-label="Close revision comparison" onClick={onClose} className="text-sm text-slate-600 underline">Close comparison</button>}
      </div>
      <div className="p-5 space-y-5">
        <p className="rounded-lg border border-slate-200 bg-slate-50 p-3 text-sm text-slate-700">
          Summary length: {beforeWords} → {afterWords} words.{' '}
          {beforeWords !== afterWords
            ? 'This comparison does not control for length; a longer summary has more space to include source material.'
            : 'Equal word counts do not by themselves make this a controlled experiment.'}
        </p>
        <div className="grid md:grid-cols-2 gap-4">
          <SummaryTextCard title="Previous summary" segments={wording.before} added={false} />
          <SummaryTextCard title="Revised summary" segments={wording.after} added />
        </div>
        <p className="text-xs text-slate-500">
          {wording.detailed
            ? 'Highlighting shows wording changes; it does not assess changes in meaning.'
            : 'For long texts, highlighting marks the changed span between shared opening and closing words; unchanged words inside that span may also be highlighted.'}
        </p>
        {!comparison.comparable ? (
          <p className="rounded-lg bg-amber-50 p-4 text-sm text-amber-900">
            Score changes are unavailable: the recorded embedding methods or source collections differ, or method metadata is missing. Compare the wording directly.
          </p>
        ) : (
          <>
            <p className="text-sm text-slate-600">
              {comparison.changes.length} valid paired source scores · {increased.length} increased · {decreased.length} decreased.
              Changes smaller than 0.005 are grouped as unchanged. Similarity is not a measure of satisfaction or preserved meaning.
            </p>
            <div className="grid md:grid-cols-2 gap-4">
              <AlignmentGroup title="Largest alignment increases" rows={increased} />
              <AlignmentGroup title="Largest alignment decreases" rows={decreased} />
            </div>
          </>
        )}
        <p className="text-xs text-slate-500">
          {after.enrichmentStatus === 'complete'
            ? 'Core scores and advanced assessments were run separately for this revision. Automated labels still need evidence review.'
            : 'Core scores have been recalculated. Advanced source-language, claim, and tension assessments must be run again for the revised wording; earlier assessments are not carried forward.'}
        </p>
        {onAdopt && <button onClick={onAdopt} className="rounded-lg bg-indigo-600 px-4 py-3 text-sm text-white font-semibold">Use this revision in the audit</button>}
      </div>
    </section>
  );
}

export default BeforeAfterComparison;
