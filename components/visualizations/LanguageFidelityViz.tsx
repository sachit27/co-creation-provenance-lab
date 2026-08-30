import React, { useState } from 'react';
import { AffectiveFidelity, LanguageFidelity, PhraseMapping, TransformationType } from '../../types';
import { AffectiveFidelityViz } from './AffectiveFidelityViz';

interface LanguageFidelityVizProps {
  data: LanguageFidelity;
  affectiveFidelity?: AffectiveFidelity;
}

const TYPE_CONFIG: Record<TransformationType, { label: string; color: string; bg: string; description: string }> = {
  preserved: { label: 'Preserved', color: '#059669', bg: '#d1fae5', description: 'Meaning, specificity, and force kept' },
  softened: { label: 'Softened', color: '#d97706', bg: '#fef3c7', description: 'Topic kept but force reduced' },
  sanitized: { label: 'Sanitized', color: '#dc2626', bg: '#fee2e2', description: 'Accusation or demand neutralized' },
  abstracted: { label: 'Abstracted', color: '#7c3aed', bg: '#ede9fe', description: 'Concrete experience made general' },
  target_shifted: { label: 'Target shifted', color: '#be123c', bg: '#fff1f2', description: 'Summary span evaluates a different topic or aspect' },
  target_uncertain: { label: 'Target uncertain', color: '#a16207', bg: '#fefce8', description: 'Evaluator returned a valid span but abstained on target comparability' },
  dropped: { label: 'Dropped', color: '#6b7280', bg: '#f3f4f6', description: 'Evaluator completed the unit and found no summary alignment' },
  unassessed: { label: 'Unassessed', color: '#64748b', bg: '#f8fafc', description: 'Missing, malformed, or unverifiable evaluator output' },
};

const TYPES: TransformationType[] = ['preserved', 'softened', 'sanitized', 'abstracted', 'target_shifted', 'target_uncertain', 'dropped', 'unassessed'];

export const LanguageFidelityViz: React.FC<LanguageFidelityVizProps> = ({ data, affectiveFidelity }) => {
  const [expandedSentence, setExpandedSentence] = useState<number | null>(null);
  const [activeView, setActiveView] = useState<'transformation' | 'affective'>('transformation');
  const isSourceCensus = data.methodVersion === 'language-transformation-v2-source-census';
  const countFor = (type: TransformationType) => data.overallCounts[type] ?? 0;
  const totalMappings = TYPES.reduce((sum, type) => sum + countFor(type), 0);

  const MappingRow = ({ mapping, index }: { mapping: PhraseMapping; index: number }) => (
    <div
      key={`${mapping.sourceUnitId ?? mapping.participantId}-${index}`}
      className="grid items-center gap-2 rounded-lg border p-2.5 md:grid-cols-[1fr_auto_1fr]"
      style={{ borderColor: `${TYPE_CONFIG[mapping.type].color}40`, backgroundColor: `${TYPE_CONFIG[mapping.type].bg}60` }}
    >
      <div className="min-w-0">
        <div className="mb-0.5 text-[10px] font-medium text-slate-400">{mapping.participantId} · verified source span</div>
        <div className="text-xs font-medium leading-relaxed text-slate-800">“{mapping.rawPhrase}”</div>
      </div>
      <div className="text-center">
        <div className="text-lg" style={{ color: TYPE_CONFIG[mapping.type].color }} aria-hidden="true">→</div>
        <span className="text-[9px] font-bold uppercase" style={{ color: TYPE_CONFIG[mapping.type].color }}>{TYPE_CONFIG[mapping.type].label}</span>
      </div>
      <div className="min-w-0">
        {mapping.summaryPhrase
          ? <div className="text-xs leading-relaxed text-slate-700">“{mapping.summaryPhrase}”</div>
          : <div className="text-xs italic text-slate-400">{mapping.type === 'unassessed' ? 'No valid assessment returned' : 'No summary alignment returned'}</div>}
        {mapping.targetRelation && (
          <div className="mt-1 text-[9px] text-slate-400">Target relation: {mapping.targetRelation}</div>
        )}
      </div>
    </div>
  );

  const SentenceCard = ({ sentence }: { sentence: LanguageFidelity['sentences'][number] }) => {
    const isExpanded = expandedSentence === sentence.sentenceIndex;
    const total = Object.values(sentence.counts).reduce((sum, count) => sum + count, 0);
    if (total === 0) return null;

    return (
      <div className="overflow-hidden rounded-lg border border-slate-200 transition-colors hover:border-slate-300">
        <button
          type="button"
          onClick={() => setExpandedSentence(isExpanded ? null : sentence.sentenceIndex)}
          className="w-full p-4 text-left transition-colors hover:bg-slate-50/50"
          aria-expanded={isExpanded}
        >
          <div className="flex items-start gap-3">
            <span className="mt-0.5 flex-shrink-0 rounded bg-slate-100 px-1.5 py-0.5 text-[10px] font-bold text-slate-400">S{sentence.sentenceIndex + 1}</span>
            <div className="min-w-0 flex-1">
              <p className="line-clamp-2 text-sm leading-relaxed text-slate-700">“{sentence.sentenceText}”</p>
              {total > 0 && (
                <>
                  <div className="mt-2 flex h-2.5 overflow-hidden rounded-full border border-slate-100">
                    {TYPES.map(type => (sentence.counts[type] ?? 0) > 0 && (
                      <div key={type} style={{ width: `${(sentence.counts[type] ?? 0) / total * 100}%`, backgroundColor: TYPE_CONFIG[type].color }} />
                    ))}
                  </div>
                  <div className="mt-1.5 flex flex-wrap gap-2">
                    {TYPES.map(type => (sentence.counts[type] ?? 0) > 0 && (
                      <span key={type} className="text-[10px] font-medium" style={{ color: TYPE_CONFIG[type].color }}>
                        {sentence.counts[type] ?? 0} {TYPE_CONFIG[type].label.toLowerCase()}
                      </span>
                    ))}
                  </div>
                </>
              )}
            </div>
            <span className="flex-shrink-0 text-sm text-slate-400" aria-hidden="true">{isExpanded ? '−' : '+'}</span>
          </div>
        </button>

        {isExpanded && sentence.mappings.length > 0 && (
          <div className="space-y-2.5 border-t border-slate-100 bg-slate-50/50 p-4">
            {sentence.mappings.map((mapping, index) => <MappingRow key={`${mapping.sourceUnitId ?? mapping.participantId}-${index}`} mapping={mapping} index={index} />)}
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="space-y-4">
      <div className="flex gap-1 rounded-lg bg-slate-100 p-1" role="tablist" aria-label="Fidelity analysis views">
        <button
          type="button"
          role="tab"
          aria-selected={activeView === 'transformation'}
          onClick={() => setActiveView('transformation')}
          className={`flex-1 rounded-md px-3 py-1.5 text-xs font-medium transition-all ${activeView === 'transformation' ? 'bg-white text-slate-800 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
        >
          Transformation Analysis
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={activeView === 'affective'}
          onClick={() => setActiveView('affective')}
          className={`flex-1 rounded-md px-3 py-1.5 text-xs font-medium transition-all ${activeView === 'affective' ? 'bg-white text-slate-800 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
        >
          Affective Fidelity
        </button>
      </div>

      {activeView === 'affective' && <AffectiveFidelityViz data={affectiveFidelity} />}

      {activeView === 'transformation' && (
        <>
          {!isSourceCensus && (
            <div className="rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
              This archived result predates the complete source-census method. Its transformation percentage and omission labels are not shown because they are not comparable with current runs. Re-run the analysis to assess every source unit and expose evaluator failures.
            </div>
          )}
          {isSourceCensus && totalMappings > 0 ? (
            <div>
              <div className="mb-2 flex items-center justify-between">
                <div>
                  <div className="text-sm font-semibold text-slate-700">Automated transformation census</div>
                  <div className="text-[10px] text-slate-500">Every sentence-like source unit is inventoried before alignment.</div>
                </div>
                <div className="text-right">
                  <div className="text-sm font-bold text-slate-700">{data.fidelityScore === null ? 'Unavailable' : `${(data.fidelityScore * 100).toFixed(0)}% preserved`}</div>
                  <div className="text-[10px] text-slate-500">
                    {data.preservedParticipantEquivalent == null || data.assessedParticipantEquivalent == null
                      ? 'participant-balanced, among assessed units'
                      : `${data.preservedParticipantEquivalent.toFixed(2)}/${data.assessedParticipantEquivalent} participant-equivalent units`}
                  </div>
                </div>
              </div>
              <div className="mb-2 flex flex-wrap gap-3 text-[10px] text-slate-500">
                <span>Output completeness: {data.assessmentCoverageRate == null ? 'unavailable' : `${(data.assessmentCoverageRate * 100).toFixed(0)}%`}</span>
                <span>Complete outputs: {data.completedSourceUnitCount ?? data.assessedSourceUnitCount ?? 0}/{data.totalSourceUnitCount ?? totalMappings}</span>
                <span>Preservation-eligible units: {data.assessedSourceUnitCount ?? 0}</span>
                <span>Evaluator: {data.evaluator ? `${data.evaluator.provider} / ${data.evaluator.model}` : 'not recorded'}</span>
              </div>
              <div className="flex h-8 overflow-hidden rounded-lg border border-slate-200">
                {TYPES.map(type => {
                  const count = countFor(type);
                  if (count === 0) return null;
                  const percentage = count / totalMappings * 100;
                  return (
                    <div key={type} className="flex items-center justify-center text-[10px] font-bold" title={`${TYPE_CONFIG[type].label}: ${count}`} style={{ width: `${percentage}%`, backgroundColor: TYPE_CONFIG[type].bg, color: TYPE_CONFIG[type].color }}>
                      {percentage >= 8 ? `${percentage.toFixed(0)}%` : ''}
                    </div>
                  );
                })}
              </div>
            </div>
          ) : isSourceCensus ? (
            <div className="rounded-lg border border-slate-200 bg-slate-50 p-6 text-center text-sm text-slate-500">
              No source units were available for transformation assessment.
            </div>
          ) : null}

          {isSourceCensus && <div className="rounded-lg border border-slate-200 bg-slate-50 p-3">
            <div className="mb-2 text-[10px] font-bold uppercase tracking-wide text-slate-400">Transformation types</div>
            <div className="grid grid-cols-2 gap-2 md:grid-cols-3 lg:grid-cols-6">
              {TYPES.map(type => (
                <div key={type} className="flex items-start gap-1.5">
                  <span className="mt-1 h-2 w-2 flex-shrink-0 rounded-sm" style={{ backgroundColor: TYPE_CONFIG[type].color }} />
                  <div><div className="text-[11px] font-semibold" style={{ color: TYPE_CONFIG[type].color }}>{TYPE_CONFIG[type].label}</div><div className="text-[10px] leading-tight text-slate-500">{TYPE_CONFIG[type].description}</div></div>
                </div>
              ))}
            </div>
          </div>}

          {isSourceCensus && <div className="space-y-3">
            <div className="text-sm font-semibold text-slate-700">Per-sentence analysis</div>
            {data.sentences.map(sentence => <SentenceCard key={sentence.sentenceIndex} sentence={sentence} />)}
          </div>}

          {isSourceCensus && (data.unmappedMappings?.length ?? 0) > 0 && (
            <details className="rounded-lg border border-slate-200 bg-slate-50 p-3">
              <summary className="cursor-pointer text-sm font-semibold text-slate-700">
                Source units without a verified summary span ({data.unmappedMappings?.length})
              </summary>
              <div className="mt-3 space-y-2.5">
                {data.unmappedMappings?.map((mapping, index) => <MappingRow key={`${mapping.sourceUnitId ?? mapping.participantId}-${index}`} mapping={mapping} index={index} />)}
              </div>
            </details>
          )}

          {isSourceCensus && data.limitations && (
            <div className="rounded-lg border border-slate-200 bg-white p-3 text-[10px] leading-relaxed text-slate-500">
              <div className="mb-1 font-bold uppercase tracking-wide text-slate-400">Interpretation limits</div>
              <ul className="list-disc space-y-1 pl-4">{data.limitations.map(limit => <li key={limit}>{limit}</li>)}</ul>
            </div>
          )}
        </>
      )}
    </div>
  );
};
