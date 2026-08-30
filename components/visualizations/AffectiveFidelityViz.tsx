import React, { useMemo, useState } from 'react';
import { AffectProfile, AffectiveFidelity, AffectiveTransition } from '../../types';

interface AffectiveFidelityVizProps {
  data?: AffectiveFidelity;
}

const STATUS: Record<AffectiveTransition, { label: string; color: string; bg: string; description: string }> = {
  preserved: { label: 'Preserved', color: '#047857', bg: '#ecfdf5', description: 'No material affect, urgency, emotion, or stance change' },
  attenuated: { label: 'Attenuated', color: '#b45309', bg: '#fffbeb', description: 'At least one dimension decreased by a full ordinal level' },
  amplified: { label: 'Amplified', color: '#1d4ed8', bg: '#eff6ff', description: 'At least one dimension increased by a full ordinal level' },
  mixed: { label: 'Mixed change', color: '#7c3aed', bg: '#f5f3ff', description: 'Some dimensions decreased while others increased' },
  polarity_shifted: { label: 'Polarity shift', color: '#be123c', bg: '#fff1f2', description: 'Valence changed from positive to negative or vice versa' },
  stance_shifted: { label: 'Stance shift', color: '#be123c', bg: '#fff1f2', description: 'Support, opposition, mixed, or no stance changed' },
  emotion_shifted: { label: 'Emotion-family shift', color: '#be123c', bg: '#fff1f2', description: 'The expressed broad emotion families changed' },
  target_shifted: { label: 'Target changed', color: '#be123c', bg: '#fff1f2', description: 'Source and summary evaluate different topics or aspects' },
  omitted: { label: 'Omitted', color: '#475569', bg: '#f8fafc', description: 'The verified source span has no mapped summary span' },
  unassessed: { label: 'Alignment unassessed', color: '#64748b', bg: '#f1f5f9', description: 'The automated alignment step failed or returned invalid evidence' },
  uncertain: { label: 'Uncertain', color: '#64748b', bg: '#f8fafc', description: 'Missing, low-certainty, or target-uncertain evidence' },
};

const ORDER: AffectiveTransition[] = [
  'preserved', 'attenuated', 'amplified', 'mixed', 'polarity_shifted',
  'stance_shifted', 'emotion_shifted', 'target_shifted', 'omitted', 'unassessed', 'uncertain',
];

const pct = (value: number | null): string => value === null ? '—' : `${(value * 100).toFixed(0)}%`;
const equivalentUnits = (value: number): string => Number.isInteger(value) ? String(value) : value.toFixed(2);

const profileSummary = (profile: AffectProfile | null) => {
  if (!profile) return <span className="italic text-slate-400">No valid profile</span>;
  const valence = ['Strong negative', 'Negative', 'Neutral', 'Positive', 'Strong positive'][profile.valence + 2];
  return (
    <div className="space-y-1.5">
      <div className="flex flex-wrap gap-1">
        <span className="rounded bg-slate-100 px-1.5 py-0.5">{valence}</span>
        <span className="rounded bg-slate-100 px-1.5 py-0.5">Intensity {profile.intensity}/3</span>
        <span className="rounded bg-slate-100 px-1.5 py-0.5">Urgency {profile.urgency}/3</span>
        <span className="rounded bg-slate-100 px-1.5 py-0.5">Stance: {profile.stance}</span>
      </div>
      <div><span className="font-medium text-slate-500">Target:</span> {profile.target}</div>
      <div>
        <span className="font-medium text-slate-500">Emotion families:</span>{' '}
        {profile.emotions.length > 0 ? profile.emotions.join(', ') : 'none expressed'}
        <span className="ml-2 text-slate-400">certainty {profile.certainty.toFixed(2)}</span>
      </div>
    </div>
  );
};

export const AffectiveFidelityViz: React.FC<AffectiveFidelityVizProps> = ({ data }) => {
  const [filter, setFilter] = useState<AffectiveTransition | 'all'>('all');

  const visibleCases = useMemo(() => {
    if (!data) return [];
    return filter === 'all' ? data.cases : data.cases.filter(item => item.transition === filter);
  }, [data, filter]);

  if (!data) {
    return (
      <div className="rounded-lg border border-slate-200 bg-slate-50 p-6 text-center">
        <div className="text-sm font-semibold text-slate-700">Affective fidelity was not computed for this analysis</div>
        <p className="mx-auto mt-1 max-w-2xl text-xs leading-relaxed text-slate-500">
          Legacy and offline results are not converted from coarse sentiment labels. Re-run enrichment with an AI provider
          to create verified, pointwise affect profiles; missing evidence is intentionally not treated as neutral.
        </p>
      </div>
    );
  }

  if (data.cases.length === 0) {
    return (
      <div className="rounded-lg border border-slate-200 bg-slate-50 p-6 text-center text-sm text-slate-600">
        No source units were available for assessment. No affective claim is made.
      </div>
    );
  }

  const attenuationCases = data.cases.filter(item =>
    item.comparable && item.sourceAffectBearing && item.flags.attenuatedDimensions.length > 0
  );
  const amplificationCases = data.cases.filter(item =>
    item.comparable && item.sourceAffectBearing && item.flags.amplifiedDimensions.length > 0
  );
  const attenuationCount = attenuationCases.length;
  const attenuationWeight = data.attenuatedWeight ?? attenuationCases.reduce((sum, item) => sum + (item.unitWeight ?? 1), 0);
  const shiftCount = (data.counts.polarity_shifted ?? 0) + (data.counts.stance_shifted ?? 0) +
    (data.counts.emotion_shifted ?? 0) + (data.counts.target_shifted ?? 0);
  const notComparable = data.cases.filter(item => !item.comparable).length;
  const stageCounts = data.stageCounts ?? {
    totalSourceUnits: data.cases.length,
    sourceProfileReturned: data.cases.filter(item => !!item.sourceProfile).length,
    sourceProfileAboveCertainty: data.cases.filter(item => !!item.sourceProfile && item.sourceProfile.certainty >= data.thresholds.minCertainty).length,
    sourceAffectBearing: data.sourceAffectBearingCount,
    alignmentAssessedAffectBearing: data.cases.filter(item => item.sourceAffectBearing && item.exclusionReason !== 'alignment_unassessed').length,
    sameTargetAlignedAffectBearing: data.representedAffectBearingCount,
    summaryProfileReturned: data.cases.filter(item => item.sourceAffectBearing && !!item.summaryProfile).length,
    comparableAffectBearing: data.comparableAffectBearingCount,
  };

  return (
    <div className="space-y-5">
      <div className="rounded-lg border border-indigo-200 bg-indigo-50/50 p-4">
        <div className="text-sm font-semibold text-indigo-950">Automated Affective Fidelity</div>
        <p className="mt-1 text-xs leading-relaxed text-indigo-900/75">
          Inventories every sentence-like source unit first, aligns each unit to an exact summary span or an explicit
          unassessed/omitted state, then compares separately produced pointwise profiles. It measures expressed language—not a
          participant's internal emotional state—and remains an exploratory, unvalidated automated audit.
        </p>
      </div>

      <div className="grid grid-cols-2 gap-2 md:grid-cols-5">
        {[
          ['Comparable affective/evaluative', data.comparableAffectBearingCount, '#0f172a'],
          ['With attenuation', attenuationCount, '#b45309'],
          ['With amplification', amplificationCases.length, '#1d4ed8'],
          ['Shifted target/polarity/stance/emotion', shiftCount, '#be123c'],
          ['Not comparable', notComparable, '#64748b'],
        ].map(([label, value, color]) => (
          <div key={String(label)} className="rounded-lg border border-slate-200 p-3 text-center">
            <div className="text-xl font-bold" style={{ color: String(color) }}>{value}</div>
            <div className="mt-0.5 text-[10px] font-semibold leading-tight text-slate-500">{label}</div>
          </div>
        ))}
      </div>
      <p className="-mt-3 text-[10px] text-slate-500">These cards are descriptive and not a partition: attenuation/amplification flags can coexist with a primary shift label.</p>

      <div className="rounded-lg border border-slate-200 bg-white p-3">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <div className="text-xs font-semibold text-slate-700">Source-profile completion over the full census</div>
          <div className="text-sm font-bold text-slate-800">
            {pct(data.sourceProfileCompletionRate ?? null)} · {equivalentUnits(data.sourceProfileCompletedWeight ?? 0)}/{equivalentUnits(data.sourceCensusParticipantWeight ?? 0)} participant-equivalent units
          </div>
        </div>
        <div className="mt-2 grid grid-cols-2 gap-1 text-[10px] text-slate-500 sm:grid-cols-4 lg:grid-cols-8">
          {[
            ['Source units', stageCounts.totalSourceUnits],
            ['Profile returned', stageCounts.sourceProfileReturned],
            ['Above certainty', stageCounts.sourceProfileAboveCertainty],
            ['Affect/evaluation', stageCounts.sourceAffectBearing],
            ['Alignment assessed', stageCounts.alignmentAssessedAffectBearing],
            ['Same-target aligned', stageCounts.sameTargetAlignedAffectBearing],
            ['Summary profile', stageCounts.summaryProfileReturned],
            ['Comparable', stageCounts.comparableAffectBearing],
          ].map(([label, value]) => (
            <div key={String(label)} className="rounded bg-slate-50 px-2 py-1.5 text-center">
              <div className="font-bold text-slate-700">{value}</div><div>{label}</div>
            </div>
          ))}
        </div>
        <p className="mt-2 text-[10px] text-slate-500">Later rates are conditional subsets of this pipeline; a high attenuation or coverage percentage does not compensate for low upstream completion.</p>
      </div>

      <div className="grid gap-3 md:grid-cols-3">
        <div className="rounded-lg border border-amber-200 bg-amber-50 p-4">
          <div className="text-xs font-semibold text-amber-900">Attenuation among mappings comparable on the scored dimensions</div>
          <div className="mt-1 flex items-baseline gap-2">
            <span className="text-2xl font-bold text-amber-800">{pct(data.attenuationRate)}</span>
            <span className="text-xs text-amber-800/70">
              {equivalentUnits(attenuationWeight)}/{equivalentUnits(data.comparableAffectBearingWeight)} participant-equivalent units
            </span>
          </div>
          <p className="mt-1 text-[10px] leading-relaxed text-amber-900/65">
            A decrease of at least one ordinal level in valence magnitude, intensity, or urgency. No “good/poor” threshold is imposed.
          </p>
        </div>
        <div className="rounded-lg border border-slate-200 bg-slate-50 p-4">
          <div className="text-xs font-semibold text-slate-700">Affective/evaluative source-unit coverage</div>
          <div className="mt-1 flex items-baseline gap-2">
            <span className="text-2xl font-bold text-slate-800">{pct(data.affectiveCoverageRate)}</span>
            <span className="text-xs text-slate-500">
              {equivalentUnits(data.representedAffectBearingWeight)}/{equivalentUnits(data.assessedSourceAffectBearingWeight)} assessed participant-equivalent units
            </span>
          </div>
          <p className="mt-1 text-[10px] leading-relaxed text-slate-500">
            Exact same-target summary alignment among high-certainty, successfully source-profiled affect/evaluation-bearing
            units whose alignment was assessed. Summary-profile failures do not reduce this rate. Coverage does not imply faithful affective expression.
          </p>
        </div>
        <div className="rounded-lg border border-slate-200 bg-slate-50 p-4">
          <div className="text-xs font-semibold text-slate-700">Pointwise profile comparability</div>
          <div className="mt-1 flex items-baseline gap-2">
            <span className="text-2xl font-bold text-slate-800">{pct(data.profileComparabilityRate)}</span>
            <span className="text-xs text-slate-500">
              {equivalentUnits(data.profileComparableAffectBearingWeight)}/{equivalentUnits(data.profileEligibleAffectBearingWeight)} aligned participant-equivalent units
            </span>
          </div>
          <p className="mt-1 text-[10px] leading-relaxed text-slate-500">
            Both source and summary affect profiles passed the certainty screen. Individual dimensions can still abstain (for example, stance); these are flagged and never called fully preserved.
          </p>
        </div>
      </div>

      <div>
        <div className="mb-2 text-[10px] font-bold uppercase tracking-wide text-slate-400">Evidence status</div>
        <div className="flex flex-wrap gap-1.5" role="group" aria-label="Filter affective fidelity evidence">
          <button
            type="button"
            onClick={() => setFilter('all')}
            aria-pressed={filter === 'all'}
            className={`rounded-full border px-2.5 py-1 text-[10px] font-semibold ${filter === 'all' ? 'border-slate-700 bg-slate-800 text-white' : 'border-slate-200 bg-white text-slate-600'}`}
          >
            All ({data.cases.length})
          </button>
          {ORDER.filter(status => data.counts[status] > 0).map(status => (
            <button
              key={status}
              type="button"
              onClick={() => setFilter(status)}
              aria-pressed={filter === status}
              className="rounded-full border px-2.5 py-1 text-[10px] font-semibold"
              style={{
                borderColor: STATUS[status].color,
                backgroundColor: filter === status ? STATUS[status].color : STATUS[status].bg,
                color: filter === status ? '#fff' : STATUS[status].color,
              }}
              title={STATUS[status].description}
            >
              {STATUS[status].label} ({data.counts[status]})
            </button>
          ))}
        </div>
      </div>

      <div className="max-h-[520px] space-y-2 overflow-y-auto pr-1" aria-live="polite">
        {visibleCases.map((item, index) => {
          const config = STATUS[item.transition];
          const changed = [
            ...item.flags.attenuatedDimensions.map(dimension => `${dimension} ↓`),
            ...item.flags.amplifiedDimensions.map(dimension => `${dimension} ↑`),
          ];
          return (
            <article key={`${item.participantId}-${item.mappingSentenceIndex}-${index}`} className="rounded-lg border p-3" style={{ borderColor: `${config.color}45`, backgroundColor: `${config.bg}80` }}>
              <div className="mb-2 flex flex-wrap items-center gap-2">
                <span className="rounded bg-white/80 px-1.5 py-0.5 text-[10px] font-bold text-slate-500">{item.participantId}</span>
                <span className="rounded px-1.5 py-0.5 text-[10px] font-bold" style={{ backgroundColor: config.bg, color: config.color }}>{config.label}</span>
                {changed.length > 0 && <span className="text-[10px] text-slate-500">{changed.join(' · ')}</span>}
                {!item.flags.stanceAssessed && <span className="text-[10px] text-slate-500">stance unassessed</span>}
                {item.flags.profileTargetLabelsDiffer && <span className="rounded bg-amber-100 px-1.5 py-0.5 text-[10px] font-semibold text-amber-800">profile target labels differ · review</span>}
                {item.exclusionReason && <span className="text-[10px] text-slate-400">excluded: {item.exclusionReason.replace('_', ' ')}</span>}
              </div>
              <div className="grid gap-3 md:grid-cols-2">
                <div>
                  <div className="mb-1 text-[9px] font-bold uppercase tracking-wide text-slate-400">Verified source span</div>
                  <blockquote className="rounded border border-slate-200 bg-white p-2 text-xs leading-relaxed text-slate-800">“{item.sourceSpan}”</blockquote>
                  <div className="mt-2 text-[10px] text-slate-600">{profileSummary(item.sourceProfile)}</div>
                </div>
                <div>
                  <div className="mb-1 text-[9px] font-bold uppercase tracking-wide text-slate-400">Verified summary span</div>
                  {item.summarySpan
                    ? <blockquote className="rounded border border-slate-200 bg-white p-2 text-xs leading-relaxed text-slate-800">“{item.summarySpan}”</blockquote>
                    : <div className="rounded border border-dashed border-slate-300 bg-white/70 p-2 text-xs italic text-slate-400">No mapped summary span</div>}
                  <div className="mt-2 text-[10px] text-slate-600">{profileSummary(item.summaryProfile)}</div>
                </div>
              </div>
            </article>
          );
        })}
      </div>

      <details className="rounded-lg border border-slate-200 bg-slate-50 p-3">
        <summary className="cursor-pointer text-xs font-semibold text-slate-700">Method, sensitivity, and limitations</summary>
        <div className="mt-3 space-y-3 text-xs text-slate-600">
          <p>
            Evaluator: <span className="font-medium">{data.evaluator.provider} / {data.evaluator.model}</span> · requested temperature {data.evaluator.requestedTemperature ?? 0} · effective temperature {data.evaluator.effectiveTemperature === null ? 'unsupported/not sent' : data.evaluator.effectiveTemperature ?? 'legacy unknown'}{data.evaluator.reasoningEffort ? ` · reasoning effort ${data.evaluator.reasoningEffort}` : ''} · prompt {data.evaluator.promptVersion}.
            Primary screen: certainty ≥ {data.thresholds.minCertainty}; material change ≥ {data.thresholds.materialDifference} ordinal level.
          </p>
          <div className="overflow-x-auto">
            <table className="w-full border-collapse text-left text-[11px]">
              <thead><tr className="border-b border-slate-200"><th className="py-1 pr-3">Sensitivity</th><th className="py-1 pr-3">Screen</th><th className="py-1 pr-3">Raw comparable cases</th><th className="py-1">Weighted attenuation</th></tr></thead>
              <tbody>{data.sensitivity.map(point => (
                <tr key={point.label} className="border-b border-slate-100">
                  <td className="py-1.5 pr-3 capitalize">{point.label}</td>
                  <td className="py-1.5 pr-3">certainty ≥ {point.minCertainty}; Δ ≥ {point.materialDifference}</td>
                  <td className="py-1.5 pr-3">{point.comparableAffectBearingCount}</td>
                  <td className="py-1.5">{equivalentUnits(point.attenuatedWeight ?? point.attenuatedCount)}/{equivalentUnits(point.comparableAffectBearingWeight ?? point.comparableAffectBearingCount)} ({pct(point.attenuationRate)})</td>
                </tr>
              ))}</tbody>
            </table>
          </div>
          <ul className="list-disc space-y-1 pl-5">
            {data.limitations.map(item => <li key={item}>{item}</li>)}
          </ul>
        </div>
      </details>
    </div>
  );
};
