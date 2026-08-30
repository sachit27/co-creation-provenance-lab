import React, { useState, useMemo } from 'react';
import { AnalysisResult, WhatIfScenario, WhatIfResult, StakeholderGroup } from '../../types';
import { runWhatIfSimulation, getBaselineMetrics } from '../../services/whatIfSimulation';

interface WhatIfSimulatorProps {
  data: AnalysisResult;
}

const DeltaCard: React.FC<{
  label: string;
  baseline: number | string;
  projected: number | string;
  delta: number;
  format?: 'decimal' | 'percent' | 'count';
  invertGood?: boolean;
}> = ({ label, baseline, projected, delta, format = 'decimal' }) => {
  const fmt = (v: number | string) => {
    if (typeof v === 'string') return v;
    if (format === 'percent') return `${Math.round(v * 100)}%`;
    if (format === 'count') return Math.round(v).toString();
    return v.toFixed(3);
  };

  const isNeutral = Math.abs(delta) <= 0.005;
  const colorClass = isNeutral ? 'text-slate-500' : 'text-indigo-600';
  const bgClass = 'bg-slate-50';
  const borderClass = 'border-slate-200';

  return (
    <div className={`rounded-lg border p-3 ${bgClass} ${borderClass}`}>
      <div className="text-[10px] font-bold text-slate-500 uppercase tracking-wide mb-1.5">{label}</div>
      <div className="flex items-end justify-between">
        <div>
          <div className="text-xs text-slate-400">{fmt(baseline)}</div>
          <div className="text-lg font-bold text-slate-800">{fmt(projected)}</div>
        </div>
        <div className={`text-sm font-bold ${colorClass}`}>
          {isNeutral ? '—' : (delta > 0 ? '+' : '')}{format === 'decimal' ? delta.toFixed(3) : format === 'percent' ? `${Math.round(delta * 100)}pp` : Math.round(delta).toString()}
        </div>
      </div>
    </div>
  );
};

export const WhatIfSimulator: React.FC<WhatIfSimulatorProps> = ({ data }) => {
  const [scenarioType, setScenarioType] = useState<'add_voices' | 'reweight_group'>('add_voices');
  const [selectedCluster, setSelectedCluster] = useState<number>(data.clusters[0]?.id ?? 0);
  const [additionalCount, setAdditionalCount] = useState(5);
  const [selectedGroup, setSelectedGroup] = useState<StakeholderGroup>('community');
  const [weightBoost, setWeightBoost] = useState(1.5);
  const [result, setResult] = useState<WhatIfResult | null>(null);
  const [simulationError, setSimulationError] = useState<string | null>(null);

  const baseline = useMemo(() => getBaselineMetrics(data), [data]);

  // Cluster options with stats
  const clusterOptions = useMemo(() => data.clusters.map(cluster => {
    const members = data.participants.filter(p => p.clusterId === cluster.id);
    const avgRep = members.length > 0
      ? members.reduce((s, p) => s + p.representationScore, 0) / members.length
      : 0;
    return { ...cluster, memberCount: members.length, avgRep };
  }), [data]);

  // Group options (only if group data exists)
  const groupOptions = useMemo(() => {
    const groups = new Set(data.participants.map(p => p.group).filter(Boolean));
    return Array.from(groups) as StakeholderGroup[];
  }, [data]);

  const handleRunSimulation = () => {
    const scenario: WhatIfScenario = scenarioType === 'add_voices'
      ? { type: 'add_voices', clusterId: selectedCluster, additionalCount }
      : { type: 'reweight_group', groupId: selectedGroup, weightBoost };
    try {
      setSimulationError(null);
      setResult(runWhatIfSimulation(data, scenario));
    } catch (error) {
      setResult(null);
      setSimulationError(error instanceof Error ? error.message : 'Simulation unavailable.');
    }
  };

  return (
    <div className="space-y-5">
      {simulationError && (
        <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs text-amber-800">
          {simulationError}
        </div>
      )}
      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <h3 className="text-sm font-bold text-slate-800">Arithmetic Assumption Explorer</h3>
          <p className="text-xs text-slate-500 mt-0.5">
            Recalculate descriptive score summaries under explicit mechanical assumptions. This is not an intervention forecast.
          </p>
        </div>
        <div className="flex items-center gap-1.5 bg-amber-50 border border-amber-200 px-2.5 py-1 rounded-full">
          <svg xmlns="http://www.w3.org/2000/svg" width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-amber-600">
            <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" /><line x1="12" y1="9" x2="12" y2="13" /><line x1="12" y1="17" x2="12.01" y2="17" />
          </svg>
          <span className="text-[10px] font-semibold text-amber-700">Not causal or predictive</span>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        {/* Controls */}
        <div className="space-y-4">
          {/* Scenario type */}
          <div>
            <label className="text-xs font-semibold text-slate-600 block mb-2">Scenario Type</label>
            <div className="grid grid-cols-2 gap-2">
              {[
                { id: 'add_voices', label: 'Append Synthetic Scores', desc: 'Resample observed cluster-score marginals' },
                { id: 'reweight_group', label: 'Multiply Scores', desc: 'Arithmetic stress test for one group' },
              ].map(opt => (
                <button
                  key={opt.id}
                  onClick={() => setScenarioType(opt.id as 'add_voices' | 'reweight_group')}
                  className={`text-left p-3 rounded-lg border text-xs transition-colors ${
                    scenarioType === opt.id
                      ? 'bg-indigo-50 border-indigo-300 text-indigo-800'
                      : 'bg-white border-slate-200 text-slate-600 hover:bg-slate-50'
                  }`}
                >
                  <div className="font-semibold">{opt.label}</div>
                  <div className="text-[10px] text-slate-400 mt-0.5">{opt.desc}</div>
                </button>
              ))}
            </div>
          </div>

          {scenarioType === 'add_voices' && (
            <>
              <div>
                <label className="text-xs font-semibold text-slate-600 block mb-2">Target Cluster</label>
                <select
                  value={selectedCluster}
                  onChange={e => setSelectedCluster(Number(e.target.value))}
                  className="w-full text-xs border border-slate-200 rounded-lg px-3 py-2 bg-white text-slate-700 focus:outline-none focus:ring-2 focus:ring-indigo-300"
                >
                  {clusterOptions.map(c => (
                    <option key={c.id} value={c.id}>
                      {c.label} — {c.memberCount} members, avg rep {c.avgRep.toFixed(2)}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="text-xs font-semibold text-slate-600 block mb-1">
                  Additional Voices: <span className="text-indigo-600 font-bold">{additionalCount}</span>
                </label>
                <input
                  type="range"
                  min={1}
                  max={10}
                  value={additionalCount}
                  onChange={e => setAdditionalCount(Number(e.target.value))}
                  className="w-full accent-indigo-600"
                />
                <div className="flex justify-between text-[10px] text-slate-400 mt-0.5">
                  <span>1</span><span>5</span><span>10</span>
                </div>
              </div>
              <p className="text-[11px] text-slate-400 bg-slate-50 rounded-lg p-2 border border-slate-200">
                Synthetic score and centrality values are independently sampled from fitted Normal marginals. This deliberately simplified arithmetic does not model new testimony, recruitment, re-summarization, or uncertainty.
              </p>
            </>
          )}

          {scenarioType === 'reweight_group' && (
            <>
              {groupOptions.length === 0 ? (
                <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 text-xs text-amber-700">
                  No stakeholder groups detected. Assign groups in the participant input to use this scenario.
                </div>
              ) : (
                <>
                  <div>
                    <label className="text-xs font-semibold text-slate-600 block mb-2">Target Group</label>
                    <select
                      value={selectedGroup}
                      onChange={e => setSelectedGroup(e.target.value as StakeholderGroup)}
                      className="w-full text-xs border border-slate-200 rounded-lg px-3 py-2 bg-white text-slate-700 focus:outline-none focus:ring-2 focus:ring-indigo-300"
                    >
                      {groupOptions.map(g => (
                        <option key={g} value={g}>{g}</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="text-xs font-semibold text-slate-600 block mb-1">
                      Score Multiplier: <span className="text-indigo-600 font-bold">{weightBoost.toFixed(1)}×</span>
                      <span className="text-slate-400 font-normal ml-1">(+{Math.round((weightBoost - 1) * 100)}%)</span>
                    </label>
                    <input
                      type="range"
                      min={1.1}
                      max={2.0}
                      step={0.1}
                      value={weightBoost}
                      onChange={e => setWeightBoost(Number(e.target.value))}
                      className="w-full accent-indigo-600"
                    />
                    <div className="flex justify-between text-[10px] text-slate-400 mt-0.5">
                      <span>+10%</span><span>+50%</span><span>+100%</span>
                    </div>
                  </div>
                  <p className="text-[11px] text-slate-400 bg-slate-50 rounded-lg p-2 border border-slate-200">
                    Mechanically multiplies existing retrieval indicators (capped at 1.0). It does not model an intervention or change the summary.
                  </p>
                </>
              )}
            </>
          )}

          <button
            onClick={handleRunSimulation}
            disabled={scenarioType === 'reweight_group' && groupOptions.length === 0}
            className="w-full bg-indigo-600 hover:bg-indigo-700 disabled:bg-slate-300 disabled:cursor-not-allowed text-white text-sm font-semibold py-2.5 px-4 rounded-lg transition-colors flex items-center justify-center gap-2"
          >
            <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <polygon points="5 3 19 12 5 21 5 3" />
            </svg>
            Recalculate Assumption
          </button>
        </div>

        {/* Results */}
        <div>
          {result ? (
            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-2">
                <DeltaCard
                  label="Gini Coefficient"
                  baseline={baseline.gini}
                  projected={result.projectedGini}
                  delta={result.deltaGini}
                  format="decimal"
                  invertGood
                />
                <DeltaCard
                  label="Avg Representation"
                  baseline={baseline.avgRep}
                  projected={result.projectedAvgRep}
                  delta={result.deltaAvgRep}
                  format="decimal"
                />
                <DeltaCard
                  label="Blind Spots"
                  baseline={baseline.blindSpots}
                  projected={result.projectedBlindSpots}
                  delta={result.deltaBlindSpots}
                  format="count"
                  invertGood
                />
                <DeltaCard
                  label="At-Risk Voices"
                  baseline={baseline.atRisk}
                  projected={result.projectedAtRisk}
                  delta={result.deltaAtRisk}
                  format="count"
                  invertGood
                />
              </div>

              {/* Plain-language result */}
              <div className="bg-indigo-50 border border-indigo-200 rounded-lg p-3">
                <p className="text-xs text-indigo-800 leading-relaxed">{result.description}</p>
              </div>

              {/* Representation distribution: Before vs After (simple bar) */}
              <div>
                <div className="text-[11px] font-semibold text-slate-500 mb-1.5 uppercase tracking-wide">Representation Distribution</div>
                <div className="space-y-1.5">
                  {(['Before', 'After'] as const).map((label) => {
                    const avgRep = label === 'Before' ? baseline.avgRep : result.projectedAvgRep;
                    const gini = label === 'Before' ? baseline.gini : result.projectedGini;
                    return (
                      <div key={label} className="flex items-center gap-2">
                        <span className="text-[11px] text-slate-500 w-10">{label}</span>
                        <div className="flex-1 h-4 bg-slate-100 rounded-full overflow-hidden relative">
                          <div
                            className={`h-full rounded-full transition-all ${
                              label === 'After' ? 'bg-indigo-500' : 'bg-slate-400'
                            }`}
                            style={{ width: `${avgRep * 100}%` }}
                          />
                        </div>
                        <span className="text-[11px] text-slate-600 w-24 text-right">
                          avg {avgRep.toFixed(3)} · Gini {gini.toFixed(3)}
                        </span>
                      </div>
                    );
                  })}
                </div>
              </div>

              <p className="text-[10px] text-slate-400 italic">
                Baseline values (Before) may differ slightly from the main dashboard due to median-based blind spot recalculation.
              </p>
            </div>
          ) : (
            <div className="h-full min-h-[200px] flex flex-col items-center justify-center text-center bg-slate-50 rounded-xl border border-slate-200 border-dashed p-6">
              <svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1" strokeLinecap="round" strokeLinejoin="round" className="text-slate-300 mb-3">
                <polygon points="5 3 19 12 5 21 5 3" />
              </svg>
              <p className="text-sm text-slate-400">Configure an assumption and recalculate the descriptive arithmetic.</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default WhatIfSimulator;
