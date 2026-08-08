import React, { useState, useMemo } from 'react';
import { RhetoricalBiasAnalysis } from '../../types';
import { InfoIcon } from '../ui/MetricGlossary';

interface Props {
  data: RhetoricalBiasAnalysis;
  onSelectParticipant?: (id: string) => void;
}

const REGISTER_COLOR = { formal: '#2563eb', colloquial: '#f59e0b', mixed: '#64748b' };
const REGISTER_LABEL = { formal: 'Formal', colloquial: 'Colloquial', mixed: 'Mixed' };

export const RhetoricalInfluenceViz: React.FC<Props> = ({ data, onSelectParticipant }) => {
  const [hovered, setHovered] = useState<string | null>(null);
  const [selectedDimension, setSelectedDimension] = useState<'composite' | 'assertiveness' | 'evidentiality' | 'emotionalIntensity'>('composite');

  const W = 600, H = 400;
  const pad = { top: 30, right: 30, bottom: 50, left: 55 };
  const plotW = W - pad.left - pad.right;
  const plotH = H - pad.top - pad.bottom;

  const dimLabel: Record<string, string> = {
    composite: 'Rhetorical Power (composite)',
    assertiveness: 'Assertiveness',
    evidentiality: 'Evidentiality',
    emotionalIntensity: 'Emotional Intensity',
  };

  const getX = (p: typeof data.profiles[0]) => {
    if (selectedDimension === 'composite') return p.profile.compositeScore;
    return p.profile[selectedDimension];
  };

  // Recompute regression for selected dimension
  // Pearson r for the selected dimension's regression line (distinct from the
  // Spearman ρ reported in the bias badge, which tests rank-order monotonicity).
  const { slope, intercept, pearsonR } = useMemo(() => {
    const xs = data.profiles.map(getX);
    const ys = data.profiles.map(p => p.representationScore);
    const n = xs.length;
    if (n < 2) return { slope: 0, intercept: 0, pearsonR: 0 };
    const mx = xs.reduce((a, b) => a + b, 0) / n;
    const my = ys.reduce((a, b) => a + b, 0) / n;
    let num = 0, dx2 = 0, dy2 = 0;
    for (let i = 0; i < n; i++) {
      const dxi = xs[i] - mx, dyi = ys[i] - my;
      num += dxi * dyi; dx2 += dxi * dxi; dy2 += dyi * dyi;
    }
    const s = dx2 === 0 ? 0 : num / dx2;
    const ic = my - s * mx;
    const r = dx2 === 0 || dy2 === 0 ? 0 : num / Math.sqrt(dx2 * dy2);
    return { slope: s, intercept: ic, pearsonR: r };
  }, [data.profiles, selectedDimension]);

  const toSvgX = (v: number) => pad.left + v * plotW;
  const toSvgY = (v: number) => pad.top + (1 - v) * plotH;

  // Quadrant labels
  const quadrants = [
    { x: 0.25, y: 0.75, label: 'Low Power\nWell Represented', color: '#059669' },
    { x: 0.75, y: 0.75, label: 'High Power\nWell Represented', color: '#2563eb' },
    { x: 0.25, y: 0.25, label: 'Low Power\nUnderrepresented', color: '#dc2626' },
    { x: 0.75, y: 0.25, label: 'High Power\nUnderrepresented', color: '#d97706' },
  ];

  return (
    <div className="space-y-4">
      {/* Bias indicator */}
      <div className={`flex items-center gap-3 p-3 rounded-lg border ${data.hasBias ? 'bg-amber-50 border-amber-200' : 'bg-emerald-50 border-emerald-200'}`}>
        <div className={`w-3 h-3 rounded-full flex-shrink-0 ${data.hasBias ? 'bg-amber-500' : 'bg-emerald-500'}`} />
        <div className="flex-1">
          <div className={`text-sm font-semibold ${data.hasBias ? 'text-amber-800' : 'text-emerald-800'}`}>
            <span className="inline-flex items-center gap-1">Rhetorical Influence <InfoIcon metricKey="rhetoric" /></span>
            {' — '}{data.hasBias
              ? `Rhetorical bias detected (Spearman ρ=${data.correlation.toFixed(2)}, p=${data.pValue.toFixed(3)})`
              : `No significant rhetorical bias (Spearman ρ=${data.correlation.toFixed(2)}, p=${data.pValue.toFixed(3)})`}
          </div>
          <div className="text-xs text-slate-600 mt-0.5">
            {data.hasBias
              ? 'Assertive, formal language correlates with higher representation scores — communication style may influence whose voice is preserved.'
              : 'Representation scores are not significantly correlated with rhetorical style — the summarizer treats different communication styles equitably.'}
          </div>
        </div>
      </div>

      {/* Dimension selector */}
      <div className="flex gap-2 flex-wrap">
        {(['composite', 'assertiveness', 'evidentiality', 'emotionalIntensity'] as const).map(dim => (
          <button
            key={dim}
            onClick={() => setSelectedDimension(dim)}
            className={`px-3 py-1.5 text-xs font-medium rounded-lg border transition-all ${
              selectedDimension === dim
                ? 'bg-blue-600 text-white border-blue-600'
                : 'bg-white text-slate-600 border-slate-200 hover:border-slate-300'
            }`}
          >
            {dimLabel[dim]}
          </button>
        ))}
      </div>

      {/* Scatter plot */}
      <div className="overflow-x-auto">
        <svg viewBox={`0 0 ${W} ${H}`} className="w-full max-w-[700px]" style={{ minWidth: 400 }}>
          {/* Background quadrants */}
          <rect x={pad.left} y={pad.top} width={plotW / 2} height={plotH / 2} fill="#f0fdf4" opacity={0.3} />
          <rect x={pad.left + plotW / 2} y={pad.top} width={plotW / 2} height={plotH / 2} fill="#eff6ff" opacity={0.3} />
          <rect x={pad.left} y={pad.top + plotH / 2} width={plotW / 2} height={plotH / 2} fill="#fef2f2" opacity={0.3} />
          <rect x={pad.left + plotW / 2} y={pad.top + plotH / 2} width={plotW / 2} height={plotH / 2} fill="#fffbeb" opacity={0.3} />

          {/* Quadrant labels */}
          {quadrants.map((q, i) => (
            <text key={i} x={toSvgX(q.x)} y={toSvgY(q.y)} textAnchor="middle" fill={q.color} opacity={0.4} fontSize={9} fontWeight="bold">
              {q.label.split('\n').map((line, li) => (
                <tspan key={li} x={toSvgX(q.x)} dy={li === 0 ? 0 : 12}>{line}</tspan>
              ))}
            </text>
          ))}

          {/* Grid lines */}
          {[0, 0.25, 0.5, 0.75, 1].map(v => (
            <g key={v}>
              <line x1={pad.left} y1={toSvgY(v)} x2={W - pad.right} y2={toSvgY(v)} stroke="#e2e8f0" strokeWidth={0.5} />
              <line x1={toSvgX(v)} y1={pad.top} x2={toSvgX(v)} y2={H - pad.bottom} stroke="#e2e8f0" strokeWidth={0.5} />
              <text x={pad.left - 8} y={toSvgY(v) + 3} textAnchor="end" fill="#94a3b8" fontSize={10}>{v.toFixed(1)}</text>
              <text x={toSvgX(v)} y={H - pad.bottom + 16} textAnchor="middle" fill="#94a3b8" fontSize={10}>{v.toFixed(1)}</text>
            </g>
          ))}

          {/* Midpoint lines */}
          <line x1={toSvgX(0.5)} y1={pad.top} x2={toSvgX(0.5)} y2={H - pad.bottom} stroke="#cbd5e1" strokeDasharray="4 2" strokeWidth={0.8} />
          <line x1={pad.left} y1={toSvgY(0.5)} x2={W - pad.right} y2={toSvgY(0.5)} stroke="#cbd5e1" strokeDasharray="4 2" strokeWidth={0.8} />

          {/* Regression line */}
          {data.profiles.length >= 5 && (
            <line
              x1={toSvgX(0)}
              y1={toSvgY(Math.max(0, Math.min(1, intercept)))}
              x2={toSvgX(1)}
              y2={toSvgY(Math.max(0, Math.min(1, slope + intercept)))}
              stroke={data.hasBias ? '#dc2626' : '#64748b'}
              strokeWidth={2}
              strokeDasharray={data.hasBias ? 'none' : '6 3'}
              opacity={0.6}
            />
          )}

          {/* Data points */}
          {data.profiles.map(p => {
            const x = toSvgX(getX(p));
            const y = toSvgY(p.representationScore);
            const isHovered = hovered === p.participantId;
            return (
              <g key={p.participantId}>
                <circle
                  cx={x} cy={y}
                  r={isHovered ? 7 : 5}
                  fill={REGISTER_COLOR[p.profile.register]}
                  stroke={isHovered ? '#1e293b' : 'white'}
                  strokeWidth={isHovered ? 2 : 1}
                  opacity={hovered && !isHovered ? 0.3 : 0.85}
                  className="transition-all duration-150 cursor-pointer"
                  onMouseEnter={() => setHovered(p.participantId)}
                  onMouseLeave={() => setHovered(null)}
                  onClick={() => onSelectParticipant?.(p.participantId)}
                />
                {isHovered && (
                  <g>
                    <rect
                      x={x + 10} y={y - 48} width={180} height={46}
                      rx={6} fill="white" stroke="#e2e8f0" strokeWidth={1}
                      filter="url(#shadow)"
                    />
                    <text x={x + 18} y={y - 33} fontSize={11} fontWeight="bold" fill="#1e293b">
                      {p.participantId}
                    </text>
                    <text x={x + 18} y={y - 19} fontSize={10} fill="#64748b">
                      {dimLabel[selectedDimension]}: {getX(p).toFixed(2)} | Rep: {p.representationScore.toFixed(2)}
                    </text>
                    <text x={x + 18} y={y - 7} fontSize={10} fill={REGISTER_COLOR[p.profile.register]}>
                      Register: {REGISTER_LABEL[p.profile.register]}
                    </text>
                  </g>
                )}
              </g>
            );
          })}

          {/* Axes labels */}
          <text x={W / 2} y={H - 5} textAnchor="middle" fill="#475569" fontSize={11} fontWeight="600">
            {dimLabel[selectedDimension]}
          </text>
          <text x={14} y={H / 2} textAnchor="middle" fill="#475569" fontSize={11} fontWeight="600"
            transform={`rotate(-90, 14, ${H / 2})`}>
            Representation Score
          </text>

          <defs>
            <filter id="shadow" x="-10%" y="-10%" width="120%" height="120%">
              <feDropShadow dx="0" dy="1" stdDeviation="2" floodOpacity="0.1" />
            </filter>
          </defs>
        </svg>
      </div>

      {/* Legend */}
      <div className="flex flex-wrap gap-4 text-xs text-slate-600">
        {Object.entries(REGISTER_COLOR).map(([reg, color]) => (
          <div key={reg} className="flex items-center gap-1.5">
            <span className="w-3 h-3 rounded-full" style={{ backgroundColor: color }} />
            {REGISTER_LABEL[reg as keyof typeof REGISTER_LABEL]} register
          </div>
        ))}
        <div className="flex items-center gap-1.5">
          <span className="w-6 border-t-2" style={{ borderColor: data.hasBias ? '#dc2626' : '#64748b', borderStyle: data.hasBias ? 'solid' : 'dashed' }} />
          Regression (r={pearsonR.toFixed(2)})
        </div>
      </div>

      {/* Profile breakdown table — top/bottom 5 */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {[
          { title: 'Highest Rhetorical Power', items: [...data.profiles].sort((a, b) => b.profile.compositeScore - a.profile.compositeScore).slice(0, 5) },
          { title: 'Lowest Rhetorical Power', items: [...data.profiles].sort((a, b) => a.profile.compositeScore - b.profile.compositeScore).slice(0, 5) },
        ].map(group => (
          <div key={group.title} className="bg-slate-50 rounded-lg p-3 border border-slate-200">
            <div className="text-[10px] font-bold text-slate-400 uppercase tracking-wide mb-2">{group.title}</div>
            <div className="space-y-1.5">
              {group.items.map(p => (
                <div key={p.participantId} className="flex items-center gap-2 text-xs">
                  <span className="font-medium text-slate-700 w-16 truncate">{p.participantId}</span>
                  <div className="flex-1 h-1.5 bg-slate-200 rounded-full overflow-hidden">
                    <div className="h-full rounded-full" style={{ width: `${p.profile.compositeScore * 100}%`, backgroundColor: REGISTER_COLOR[p.profile.register] }} />
                  </div>
                  <span className="text-slate-500 w-8 text-right">{p.profile.compositeScore.toFixed(2)}</span>
                  <span className="text-slate-400">|</span>
                  <span className={`w-8 text-right font-medium ${p.representationScore >= 0.6 ? 'text-emerald-600' : p.representationScore >= 0.3 ? 'text-amber-600' : 'text-red-600'}`}>
                    {p.representationScore.toFixed(2)}
                  </span>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};
