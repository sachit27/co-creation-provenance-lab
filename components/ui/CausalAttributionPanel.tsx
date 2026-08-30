import React, { useMemo, useState } from 'react';
import { ParticipantAnalysis } from '../../types';
import {
  CausalAttributionResult, correlateWithRepresentation, CostEstimate,
  BUDGET_PRESETS, isExactAvailable, EXACT_MAX_PLAYERS, computeEquivalenceTiers,
  type BudgetPreset,
} from '../../services/causalAttribution';

interface CausalAttributionPanelProps {
  participants: ParticipantAnalysis[];
  result: CausalAttributionResult | null;
  estimate: CostEstimate;
  isRunning: boolean;
  progress: string;
  error: string | null;
  onRun: () => void;
  onCancel: () => void;
  /** Selected compute budget, and setter (lifted so App owns the run config). */
  preset: BudgetPreset;
  onPresetChange: (p: BudgetPreset) => void;
  onClose: () => void;
  onSelectParticipant?: (id: string) => void;
}

const fmt = (v: number, d = 3) => (v >= 0 ? '+' : '') + v.toFixed(d);

/**
 * Stochastic counterfactual utility attribution panel.
 *
 * This is the expensive intervention-style counterpart to the similarity
 * scores shown elsewhere: it regenerates the summary with contributions withheld
 * rather than inferring influence from embedding proximity. The panel always
 * shows cost before running, and always shows uncertainty with the results.
 */
export const CausalAttributionPanel: React.FC<CausalAttributionPanelProps> = ({
  participants, result, estimate, isRunning, progress, error,
  onRun, onCancel, onClose, onSelectParticipant, preset, onPresetChange,
}) => {
  const [showAll, setShowAll] = useState(false);

  const rows = useMemo(() => {
    if (!result) return [];
    const byId = new Map<string, ParticipantAnalysis>(
      participants.map(p => [p.id, p] as [string, ParticipantAnalysis])
    );
    return result.participantIds
      .map((id, i) => ({
        id,
        phi: result.values[i],
        se: result.standardErrors[i],
        normalised: result.normalised[i],
        representation: byId.get(id)?.representationScore,
        text: byId.get(id)?.originalText ?? (result.granularity === 'cluster' ? 'Cluster-level unit; no individual value is inferred.' : ''),
        noisy: result.indistinguishableFromZero.includes(id),
      }))
      .sort((a, b) => b.phi - a.phi);
  }, [result, participants]);

  const spearman = useMemo(() => {
    if (!result || result.granularity === 'cluster') return NaN;
    const byId = new Map<string, number>(
      participants.map(p => [p.id, p.representationScore] as [string, number])
    );
    return correlateWithRepresentation(
      result.values,
      result.participantIds.map(id => byId.get(id) ?? 0)
    );
  }, [result, participants]);

  // Statistical equivalence tiers: contributions are only separated when their
  // estimates differ by more than the combined uncertainty. This avoids
  // presenting sampling noise as a ranking.
  const tierOf = useMemo(() => {
    const m = new Map<string, { tier: number; size: number; zero: boolean }>();
    if (!result) return m;
    const tiers = computeEquivalenceTiers(result.participantIds, result.values, result.standardErrors);
    tiers.forEach(t => t.participantIds.forEach(id =>
      m.set(id, { tier: t.tier, size: t.participantIds.length, zero: t.indistinguishableFromZero })));
    return m;
  }, [result]);
  const tierCount = useMemo(() => new Set([...tierOf.values()].map(t => t.tier)).size, [tierOf]);

  const visible = showAll ? rows : rows.slice(0, 12);
  const maxAbs = Math.max(...rows.map(r => Math.abs(r.phi)), 1e-9);

  return (
    <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-5 space-y-4">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h3 className="text-base font-semibold text-slate-800">Counterfactual Utility Attribution</h3>
          <p className="text-xs text-slate-500 mt-1 max-w-2xl">
            Estimates model-output sensitivity by <strong>withholding inputs</strong>: contributions are withheld, the
            summary is regenerated, and the change in how well it represents everyone is attributed
            back using a Shapley-style game. This is not causal identification: model sampling,
            prompt order, and the chosen utility function remain part of the result.
          </p>
        </div>
        <button onClick={onClose} className="text-slate-400 hover:text-slate-600 text-sm" aria-label="Close panel">✕</button>
      </div>

      {/* Compute budget. Monte Carlo error falls as 1/sqrt(m), so this is an
          explicit cost/precision dial rather than a hidden constant. */}
      {!isRunning && (
        <div className="space-y-2">
          <div className="text-xs font-semibold text-slate-600">Compute budget</div>
          <div className="flex flex-wrap gap-1.5" role="radiogroup" aria-label="Compute budget">
            {BUDGET_PRESETS.map(p => (
              <button
                key={p.id}
                role="radio"
                aria-checked={preset === p.id}
                onClick={() => onPresetChange(p.id)}
                title={p.description}
                className={`px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors ${
                  preset === p.id
                    ? 'bg-indigo-600 text-white border-indigo-600'
                    : 'bg-white text-slate-600 border-slate-300 hover:bg-slate-50'
                }`}
              >
                {p.label}
                <span className={`ml-1.5 ${preset === p.id ? 'text-indigo-200' : 'text-slate-400'}`}>
                  {p.samples}&times;
                </span>
              </button>
            ))}
            {isExactAvailable(participants.length) && (
              <button
                role="radio"
                aria-checked={preset === 'exact'}
                onClick={() => onPresetChange('exact')}
                title={`Enumerates all 2^${participants.length} coalitions. No sampling error, but the most expensive option.`}
                className={`px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors ${
                  preset === 'exact'
                    ? 'bg-slate-800 text-white border-slate-800'
                    : 'bg-white text-slate-600 border-slate-300 hover:bg-slate-50'
                }`}
              >
                Exact
              </button>
            )}
          </div>
          <p className="text-[11px] text-slate-500">
            {BUDGET_PRESETS.find(p => p.id === preset)?.description ??
              'Every coalition is enumerated: no sampling error, highest cost.'}
            {!isExactAvailable(participants.length) && (
              <> Exact enumeration is unavailable above {EXACT_MAX_PLAYERS} contributions (it doubles in cost with each additional one).</>
            )}
          </p>
        </div>
      )}

      {/* Cost disclosure — always shown before running */}
      {!result && !isRunning && (
        <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs text-amber-900">
          <div className="font-semibold mb-1">Before you run this</div>
          <p>{estimate.note}</p>
          <p className="mt-1">
            Worst case: <strong>{estimate.maxCompletions}</strong> summarisation calls
            {estimate.maxEmbeddingCalls > 0 && <> and ~<strong>{estimate.maxEmbeddingCalls}</strong> embedding calls</>}.
          </p>
          <p className="mt-1">Each coalition is regenerated <strong>{estimate.generationsPerCoalition}</strong> times so one stochastic draw is never treated as a fixed game value.</p>
        </div>
      )}

      {error && (
        <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-xs text-red-800">{error}</div>
      )}

      <div className="flex items-center gap-2">
        {!isRunning ? (
          <button
            onClick={onRun}
            className="px-3 py-2 rounded-lg bg-indigo-600 text-white text-sm font-medium hover:bg-indigo-700"
          >
            {result ? 'Re-run attribution' : 'Run counterfactual attribution'}
          </button>
        ) : (
          <>
            <span className="text-sm text-slate-600">{progress || 'Running…'}</span>
            <button onClick={onCancel} className="px-3 py-1.5 rounded-lg border border-slate-300 text-sm hover:bg-slate-50">
              Cancel
            </button>
          </>
        )}
      </div>

      {result && (
        <>
          {/* Diagnostics */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-xs">
            <div className="rounded-lg bg-slate-50 border border-slate-200 p-2">
              <div className="text-slate-500">Summaries generated</div>
              <div className="text-slate-800 font-semibold text-sm">{result.summariesGenerated}</div>
            </div>
            <div className="rounded-lg bg-slate-50 border border-slate-200 p-2">
              <div className="text-slate-500">Permutations</div>
              <div className="text-slate-800 font-semibold text-sm">{result.samplesUsed}</div>
            </div>
            <div className="rounded-lg bg-slate-50 border border-slate-200 p-2">
              <div className="text-slate-500" title="Agreement between estimates from two independent halves of the sampled permutations. This measures whether the ORDER of the table is stable, which is what a reader actually relies on.">
                Ranking stability
              </div>
              {(() => {
                const rs = result.rankStability;
                const label = Number.isNaN(rs) ? 'n/a'
                  : rs >= 0.9 ? 'Stable'
                  : rs >= 0.7 ? 'Mostly stable'
                  : 'Provisional';
                const tone = Number.isNaN(rs) ? 'text-slate-500'
                  : rs >= 0.9 ? 'text-green-700'
                  : rs >= 0.7 ? 'text-amber-700'
                  : 'text-rose-700';
                return (
                  <div className={`font-semibold text-sm ${tone}`}>
                    {label}
                    {!Number.isNaN(rs) && <span className="font-normal text-slate-400 ml-1">ρ={rs.toFixed(2)}</span>}
                  </div>
                );
              })()}
            </div>
            <div className="rounded-lg bg-slate-50 border border-slate-200 p-2">
              <div className="text-slate-500" title="Rank correlation between counterfactual utility estimates and the similarity-based score">
                Agreement with score
              </div>
              <div className="text-slate-800 font-semibold text-sm">
                {Number.isNaN(spearman) ? 'n/a' : `ρ = ${spearman.toFixed(2)}`}
              </div>
            </div>
          </div>

          {/* Headline interpretation */}
          <div className="rounded-lg border border-slate-200 bg-slate-50 p-3 text-xs text-slate-700 space-y-1">
            <p><strong>Granularity:</strong> {result.granularity === 'cluster' ? 'clusters only; no participant-level values were inferred' : 'individual contributions'}.</p>
            <p className="text-slate-500">
              Each coalition value averages {result.generationsPerCoalition} model generations. The observed mean/max within-coalition utility ranges were{' '}
              {result.coalitionUtilityVariability.meanRange.toFixed(3)}/{result.coalitionUtilityVariability.maximumRange.toFixed(3)}.
              Reported SE still reflects permutation sampling only; it does not propagate uncertainty in that finite generation mean, provider updates, or evaluator error.
            </p>
            {!result.converged && (
              <p>
                <strong>Treat this ranking as provisional.</strong>{' '}
                {(100 * result.convergedFraction).toFixed(0)}% of contributions have individually
                resolved estimates
                {!Number.isNaN(result.rankStability) && <>, and two independent halves of the sample
                agree on the order at ρ = {result.rankStability.toFixed(2)}
                {!Number.isNaN(result.topKAgreement) && <> (sharing {(100 * result.topKAgreement).toFixed(0)}% of the top five)</>}</>}.
                A higher compute budget will tighten both; note that halving the error costs about
                four times as many model calls.
              </p>
            )}
            {result.converged && (
              <p>
                <strong>Estimates are stable.</strong> {(100 * result.convergedFraction).toFixed(0)}% of
                contributions have resolved estimates and the two half-samples agree on the ordering
                {!Number.isNaN(result.rankStability) && <> at ρ = {result.rankStability.toFixed(2)}</>}.
              </p>
            )}
            {!Number.isNaN(spearman) && (
              <p>
                Counterfactual utility and the semantic-alignment retrieval score agree at ρ = {spearman.toFixed(2)}.
                {spearman < 0.5
                  ? ' Weak agreement: the two model-dependent indicators rank units differently in this run.'
                  : ' Reasonable agreement: the two model-dependent indicators rank units similarly in this run.'}
              </p>
            )}
            {result.indistinguishableFromZero.length > 0 && (
              <p>
                {result.indistinguishableFromZero.length} unit(s) are unresolved from zero under permutation-sampling error alone
                (|φ| &lt; 2·SE). This is not a statistical null test and excludes model-generation uncertainty.
              </p>
            )}
            {tierCount > 0 && (
              <p>
                Units fall into <strong>{tierCount} permutation-uncertainty
                {tierCount === 1 ? ' group' : ' groups'}</strong>. Within a group the differences are
                smaller than the uncertainty, so the order shown there is not meaningful —
                {tierCount === 1
                  ? ' on this run no contribution is separable from any other.'
                  : ' compare across groups, not within them.'}
              </p>
            )}
            <p className="text-slate-500">
              Low estimated utility is not the same as low entitlement: a contribution may duplicate others,
              or be out of scope. Treat φ as evidence for review, not a verdict.
            </p>
          </div>

          {/* Ranked table */}
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <caption className="sr-only">Units ordered by estimated counterfactual utility for the summary</caption>
              <thead>
                <tr className="text-slate-500 border-b border-slate-200">
                  <th scope="col" className="text-left py-1.5 pr-2" title="Statistical equivalence group: contributions in the same group are not distinguishable from one another">Group</th>
                  <th scope="col" className="text-left py-1.5 pr-2">ID</th>
                  <th scope="col" className="text-left py-1.5 pr-2">Utility φ</th>
                  <th scope="col" className="text-left py-1.5 pr-2">± SE</th>
                  <th scope="col" className="text-left py-1.5 pr-2">Alignment score</th>
                  <th scope="col" className="text-left py-1.5">Contribution</th>
                </tr>
              </thead>
              <tbody>
                {visible.map((r, i) => (
                  <tr
                    key={r.id}
                    className="border-b border-slate-100 hover:bg-slate-50 cursor-pointer"
                    onClick={() => result.granularity === 'participant' && onSelectParticipant?.(r.id)}
                  >
                    <td className="py-1.5 pr-2">
                      {(() => {
                        const t = tierOf.get(r.id);
                        if (!t) return <span className="text-slate-400">–</span>;
                        return (
                          <span
                            className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-semibold bg-slate-100 text-slate-600"
                            title={t.size > 1
                              ? `Tied with ${t.size - 1} other contribution(s) — order within this group is noise`
                              : 'Statistically separated from the others'}
                          >
                            {t.zero ? '~0' : `T${t.tier + 1}`}
                            {t.size > 1 && <span className="ml-1 font-normal text-slate-400">×{t.size}</span>}
                          </span>
                        );
                      })()}
                    </td>
                    <td className="py-1.5 pr-2 font-mono text-slate-700">{r.id}</td>
                    <td className="py-1.5 pr-2">
                      <div className="flex items-center gap-1.5">
                        <span className={`font-semibold ${r.phi >= 0 ? 'text-indigo-700' : 'text-rose-700'}`}>
                          {fmt(r.phi)}
                        </span>
                        <span
                          aria-hidden="true"
                          className={`inline-block h-1.5 rounded ${r.phi >= 0 ? 'bg-indigo-400' : 'bg-rose-400'}`}
                          style={{ width: `${Math.max(2, (Math.abs(r.phi) / maxAbs) * 48)}px` }}
                        />
                        {r.noisy && <span className="text-[10px] text-slate-400" title="Within noise of zero">~0</span>}
                      </div>
                    </td>
                    <td className="py-1.5 pr-2 text-slate-500">{Number.isNaN(r.se) ? '—' : r.se.toFixed(3)}</td>
                    <td className="py-1.5 pr-2 text-slate-600">{r.representation === undefined ? '—' : r.representation.toFixed(3)}</td>
                    <td className="py-1.5 text-slate-600 truncate max-w-md" title={r.text}>{r.text}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {rows.length > 12 && (
            <button onClick={() => setShowAll(s => !s)} className="text-xs text-indigo-600 hover:text-indigo-800 font-medium">
              {showAll ? 'Show top 12 only' : `Show all ${rows.length}`}
            </button>
          )}
        </>
      )}
    </div>
  );
};

export default CausalAttributionPanel;
