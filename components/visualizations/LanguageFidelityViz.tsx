import React, { useState, useMemo } from 'react';
import { LanguageFidelity, TransformationType, EpistemicClass, ParticipantAnalysis } from '../../types';

interface LanguageFidelityVizProps {
  data: LanguageFidelity;
  participants?: ParticipantAnalysis[];
  summarySentenceSentiments?: { score: number; label: 'positive' | 'neutral' | 'negative' }[];
  summarySentences?: string[];
}

const TYPE_CONFIG: Record<TransformationType, { label: string; color: string; bg: string; description: string }> = {
  preserved: { label: 'Preserved', color: '#059669', bg: '#d1fae5', description: 'Language and intensity kept faithfully' },
  softened: { label: 'Softened', color: '#d97706', bg: '#fef3c7', description: 'Topic kept but emotional intensity reduced' },
  sanitized: { label: 'Sanitized', color: '#dc2626', bg: '#fee2e2', description: 'Accusation or demand replaced with neutral framing' },
  abstracted: { label: 'Abstracted', color: '#7c3aed', bg: '#ede9fe', description: 'Concrete experience replaced with abstract category' },
  dropped: { label: 'Dropped', color: '#6b7280', bg: '#f3f4f6', description: 'Key concept absent from this sentence' },
};

const TYPES: TransformationType[] = ['preserved', 'softened', 'sanitized', 'abstracted', 'dropped'];

const EPISTEMIC_CONFIG: Record<EpistemicClass, { label: string; color: string; bg: string; icon: string; description: string }> = {
  explicit: { label: 'Explicit', color: '#059669', bg: '#d1fae5', icon: '✓', description: 'Directly stated in or closely paraphrases source text' },
  inferred: { label: 'Inferred', color: '#2563eb', bg: '#dbeafe', icon: '↗', description: 'Reasonable derivation or synthesis from source evidence' },
  extrapolated: { label: 'Extrapolated', color: '#d97706', bg: '#fef3c7', icon: '↝', description: 'Requires external knowledge beyond what sources provide' },
  speculative: { label: 'Speculative', color: '#7c3aed', bg: '#ede9fe', icon: '?', description: 'Forward-looking or model-generated with no clear source basis' },
};

const EPISTEMIC_TYPES: EpistemicClass[] = ['explicit', 'inferred', 'extrapolated', 'speculative'];

// ── Sentiment helpers ──────────────────────────────────────────────────────────

type SentimentLabel = 'positive' | 'neutral' | 'negative';
const SENTIMENT_LABELS: SentimentLabel[] = ['positive', 'neutral', 'negative'];
const SENTIMENT_DISPLAY: Record<SentimentLabel, { label: string; color: string }> = {
  positive: { label: 'Positive', color: '#059669' },
  neutral:  { label: 'Neutral',  color: '#6b7280' },
  negative: { label: 'Negative', color: '#dc2626' },
};

type SmoothedDirection = 'preserved' | 'smoothed' | 'amplified' | 'shifted';

interface EmotionCase {
  participantId: string;
  participantSentiment: SentimentLabel;
  summarySentiment: SentimentLabel;
  direction: SmoothedDirection;
  participantText: string;
  summaryText: string;
  sentenceIndex: number;
}

export const LanguageFidelityViz: React.FC<LanguageFidelityVizProps> = ({ data, participants, summarySentenceSentiments, summarySentences }) => {
  const [expandedSentence, setExpandedSentence] = useState<number | null>(null);
  const [activeView, setActiveView] = useState<'bars' | 'emotion'>('bars');
  // For drillable matrix: which cell is selected (row-col key)
  const [selectedCell, setSelectedCell] = useState<string | null>(null);

  const totalMappings = Object.values(data.overallCounts).reduce((a, b) => a + b, 0);

  // ── Emotion smoothing computation ──────────────────────────────────────────
  const emotionData = useMemo(() => {
    if (!participants || !summarySentenceSentiments || summarySentenceSentiments.length === 0) return null;

    const matrix: Record<SentimentLabel, Record<SentimentLabel, number>> = {
      positive: { positive: 0, neutral: 0, negative: 0 },
      neutral:  { positive: 0, neutral: 0, negative: 0 },
      negative: { positive: 0, neutral: 0, negative: 0 },
    };

    const cases: EmotionCase[] = [];
    const sentimentRank: Record<SentimentLabel, number> = { negative: -1, neutral: 0, positive: 1 };
    let overriddenCount = 0;

    for (const p of participants) {
      const summSent = summarySentenceSentiments[p.topSentenceMatchIndex];
      if (!summSent || !p.sentiment) continue;

      const pLabel = p.sentiment;
      let sLabel = summSent.label;

      // High-similarity guard: when the participant's content is closely matched
      // to the summary sentence (repScore > 0.7), a sentiment label flip is almost
      // certainly a classifier artifact (e.g. "critical" = "essential" scored as negative).
      // Treat these as preserved rather than reporting a false shift.
      if (pLabel !== sLabel && p.representationScore > 0.7) {
        sLabel = pLabel; // Override — the summary faithfully reproduced this content
        overriddenCount++;
      }

      matrix[pLabel][sLabel]++;

      let direction: SmoothedDirection;
      if (pLabel === sLabel) {
        direction = 'preserved';
      } else if (Math.abs(sentimentRank[sLabel]) < Math.abs(sentimentRank[pLabel])) {
        direction = 'smoothed';
      } else if (Math.abs(sentimentRank[sLabel]) > Math.abs(sentimentRank[pLabel])) {
        direction = 'amplified';
      } else {
        direction = 'shifted';
      }

      cases.push({
        participantId: p.id,
        participantSentiment: pLabel,
        summarySentiment: sLabel,
        direction,
        participantText: p.originalText,
        summaryText: summarySentences?.[p.topSentenceMatchIndex] || '',
        sentenceIndex: p.topSentenceMatchIndex,
      });
    }

    const totalCases = cases.length;
    const smoothedCount = cases.filter(c => c.direction === 'smoothed').length;
    const amplifiedCount = cases.filter(c => c.direction === 'amplified').length;
    const preservedCount = cases.filter(c => c.direction === 'preserved').length;
    const shiftedCount = cases.filter(c => c.direction === 'shifted').length;

    // Group cases by cell key for drilldown
    const cellCases: Record<string, EmotionCase[]> = {};
    for (const c of cases) {
      const key = `${c.participantSentiment}-${c.summarySentiment}`;
      if (!cellCases[key]) cellCases[key] = [];
      cellCases[key].push(c);
    }

    return { matrix, cases, cellCases, totalCases, smoothedCount, amplifiedCount, preservedCount, shiftedCount, overriddenCount };
  }, [participants, summarySentenceSentiments, summarySentences]);

  if (totalMappings === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-64 gap-3 text-slate-400">
        <svg xmlns="http://www.w3.org/2000/svg" width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
          <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
          <polyline points="14 2 14 8 20 8" />
          <line x1="16" y1="13" x2="8" y2="13" />
          <line x1="16" y1="17" x2="8" y2="17" />
        </svg>
        <p className="text-sm text-center max-w-xs">
          Language fidelity analysis requires an AI provider. No transformation data available.
        </p>
      </div>
    );
  }

  // ── Overall Stacked Bar ──────────────────────────────────────────────────────
  const OverallBar = () => (
    <div className="mb-6">
      <div className="flex items-center justify-between mb-2">
        <div className="text-sm font-semibold text-slate-700">Overall Language Fidelity</div>
        <div className="text-sm font-bold" style={{ color: data.fidelityScore >= 0.5 ? '#059669' : data.fidelityScore >= 0.25 ? '#d97706' : '#dc2626' }}>
          {(data.fidelityScore * 100).toFixed(0)}% preserved
        </div>
      </div>
      <div className="flex h-8 rounded-lg overflow-hidden border border-slate-200">
        {TYPES.map(type => {
          const count = data.overallCounts[type];
          if (count === 0) return null;
          const pct = (count / totalMappings) * 100;
          return (
            <div key={type} title={`${TYPE_CONFIG[type].label}: ${count} (${pct.toFixed(0)}%)`}
              className="flex items-center justify-center text-[10px] font-bold transition-all hover:opacity-80"
              style={{ width: `${pct}%`, backgroundColor: TYPE_CONFIG[type].bg, color: TYPE_CONFIG[type].color, minWidth: pct > 3 ? undefined : '2px' }}>
              {pct >= 8 ? `${pct.toFixed(0)}%` : ''}
            </div>
          );
        })}
      </div>
      <div className="flex flex-wrap gap-3 mt-2">
        {TYPES.map(type => {
          const count = data.overallCounts[type];
          if (count === 0) return null;
          return (
            <div key={type} className="flex items-center gap-1.5 text-[11px] text-slate-600">
              <span className="w-2.5 h-2.5 rounded-sm" style={{ backgroundColor: TYPE_CONFIG[type].color }} />
              {TYPE_CONFIG[type].label} ({count})
            </div>
          );
        })}
      </div>
    </div>
  );

  // ── Emotion Smoothing Viz ──────────────────────────────────────────────────
  const EmotionSmoothingViz = () => {
    if (!emotionData) {
      return (
        <div className="flex flex-col items-center justify-center h-48 gap-2 text-slate-400">
          <svg xmlns="http://www.w3.org/2000/svg" width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
            <circle cx="12" cy="12" r="10" /><path d="M8 14s1.5 2 4 2 4-2 4-2" /><line x1="9" y1="9" x2="9.01" y2="9" /><line x1="15" y1="9" x2="15.01" y2="9" />
          </svg>
          <p className="text-xs text-center max-w-xs">Emotion smoothing data requires sentiment analysis for both participants and summary sentences.</p>
        </div>
      );
    }

    const { matrix, cellCases, totalCases, smoothedCount, amplifiedCount, preservedCount, shiftedCount, overriddenCount } = emotionData;

    let maxCell = 0;
    for (const row of SENTIMENT_LABELS) {
      for (const col of SENTIMENT_LABELS) {
        if (matrix[row][col] > maxCell) maxCell = matrix[row][col];
      }
    }
    if (maxCell === 0) maxCell = 1;

    const getCellStyle = (row: SentimentLabel, col: SentimentLabel, count: number, isSelected: boolean): React.CSSProperties => {
      const base: React.CSSProperties = { cursor: count > 0 ? 'pointer' : 'default' };
      if (isSelected) {
        base.outline = '2px solid #3b82f6';
        base.outlineOffset = '-1px';
      }
      if (count === 0) return { ...base, backgroundColor: '#f8fafc' };
      const intensity = Math.min(1, count / maxCell);
      if (row === col) {
        return { ...base, backgroundColor: `rgba(5, 150, 105, ${0.1 + intensity * 0.5})` };
      }
      const rowRank = Math.abs({ negative: -1, neutral: 0, positive: 1 }[row]);
      const colRank = Math.abs({ negative: -1, neutral: 0, positive: 1 }[col]);
      if (colRank < rowRank) {
        return { ...base, backgroundColor: `rgba(217, 119, 6, ${0.1 + intensity * 0.6})` };
      }
      if (colRank > rowRank) {
        return { ...base, backgroundColor: `rgba(37, 99, 235, ${0.1 + intensity * 0.5})` };
      }
      return { ...base, backgroundColor: `rgba(220, 38, 38, ${0.1 + intensity * 0.5})` };
    };

    const directionColor: Record<SmoothedDirection, string> = {
      preserved: '#059669', smoothed: '#d97706', amplified: '#2563eb', shifted: '#dc2626',
    };
    const directionLabel: Record<SmoothedDirection, string> = {
      preserved: 'Preserved', smoothed: 'Smoothed', amplified: 'Amplified', shifted: 'Polarity Shifted',
    };

    const smoothingRate = totalCases > 0 ? (smoothedCount / totalCases * 100) : 0;

    const selectedCases = selectedCell ? (cellCases[selectedCell] || []) : [];
    const selectedRow = selectedCell?.split('-')[0] as SentimentLabel | undefined;
    const selectedCol = selectedCell?.split('-')[1] as SentimentLabel | undefined;

    return (
      <div className="space-y-4">
        {/* Summary stats */}
        <div className="grid grid-cols-4 gap-3">
          {([
            { label: 'Preserved', count: preservedCount, color: '#059669', desc: 'Same tone in summary' },
            { label: 'Smoothed', count: smoothedCount, color: '#d97706', desc: 'Moved toward neutral' },
            { label: 'Amplified', count: amplifiedCount, color: '#2563eb', desc: 'Intensified in summary' },
            { label: 'Shifted', count: shiftedCount, color: '#dc2626', desc: 'Polarity reversed' },
          ] as const).map(stat => (
            <div key={stat.label} className="text-center p-3 rounded-lg border border-slate-200">
              <div className="text-lg font-bold" style={{ color: stat.color }}>{stat.count}</div>
              <div className="text-[10px] font-bold uppercase" style={{ color: stat.color }}>{stat.label}</div>
              <div className="text-[9px] text-slate-500 mt-0.5">{stat.desc}</div>
            </div>
          ))}
        </div>

        {/* Smoothing rate */}
        <div className="flex items-center gap-3 p-3 rounded-lg border" style={{
          borderColor: smoothingRate > 30 ? '#d97706' : '#e2e8f0',
          backgroundColor: smoothingRate > 30 ? '#fffbeb' : '#f8fafc',
        }}>
          <div className="flex-shrink-0 w-12 h-12 rounded-full border-4 flex items-center justify-center text-sm font-bold" style={{
            borderColor: smoothingRate > 30 ? '#d97706' : smoothingRate > 15 ? '#6b7280' : '#059669',
            color: smoothingRate > 30 ? '#d97706' : smoothingRate > 15 ? '#6b7280' : '#059669',
          }}>
            {smoothingRate.toFixed(0)}%
          </div>
          <div>
            <div className="text-sm font-semibold text-slate-700">Emotion Smoothing Rate</div>
            <div className="text-xs text-slate-500">
              {smoothingRate > 30
                ? 'High smoothing detected — the summary significantly moderates emotional tone from inputs'
                : smoothingRate > 15
                ? 'Moderate smoothing — some emotional intensity is reduced in the summary'
                : 'Low smoothing — the summary preserves participant emotional tone well'}
            </div>
          </div>
        </div>

        {/* Classifier correction disclosure */}
        {overriddenCount > 0 && (
          <div className="text-[10px] text-slate-400 italic px-1">
            Note: {overriddenCount} participant{overriddenCount !== 1 ? 's' : ''} with high representation scores
            (&gt;0.7) had mismatched sentiment labels corrected — when the summary closely
            paraphrases the input, label disagreement is treated as a classifier artifact.
          </div>
        )}

        {/* Interactive confusion matrix */}
        <div>
          <div className="text-[10px] font-bold text-slate-400 uppercase tracking-wide mb-1">
            Sentiment Transition Matrix — Click a cell to see details
          </div>
          <div className="text-[10px] text-slate-500 mb-3">
            Rows = participant input tone. Columns = matched summary sentence tone. Click any cell to inspect the actual text.
          </div>
          <div className="inline-block">
            {/* Column header */}
            <div className="grid gap-1" style={{ gridTemplateColumns: '100px repeat(3, 90px)' }}>
              <div className="p-2 text-[9px] text-slate-400 text-right">
                <span className="block uppercase font-bold">Participant</span>
                <span className="block uppercase font-bold">↓ / Summary →</span>
              </div>
              {SENTIMENT_LABELS.map(col => (
                <div key={col} className="p-2 text-center">
                  <div className="text-[11px] font-bold" style={{ color: SENTIMENT_DISPLAY[col].color }}>
                    {SENTIMENT_DISPLAY[col].label}
                  </div>
                </div>
              ))}
            </div>
            {/* Matrix rows */}
            {SENTIMENT_LABELS.map(row => (
              <div key={row} className="grid gap-1" style={{ gridTemplateColumns: '100px repeat(3, 90px)' }}>
                <div className="p-2 text-right flex items-center justify-end">
                  <span className="text-[11px] font-bold" style={{ color: SENTIMENT_DISPLAY[row].color }}>
                    {SENTIMENT_DISPLAY[row].label}
                  </span>
                </div>
                {SENTIMENT_LABELS.map(col => {
                  const count = matrix[row][col];
                  const pct = totalCases > 0 ? (count / totalCases * 100) : 0;
                  const cellKey = `${row}-${col}`;
                  const isSelected = selectedCell === cellKey;
                  return (
                    <div
                      key={col}
                      className="p-2 rounded-lg flex items-center justify-center transition-all hover:ring-2 hover:ring-blue-300"
                      style={getCellStyle(row, col, count, isSelected)}
                      onClick={() => count > 0 && setSelectedCell(isSelected ? null : cellKey)}
                      title={`${SENTIMENT_DISPLAY[row].label} → ${SENTIMENT_DISPLAY[col].label}: ${count} participants — click to see details`}
                    >
                      {count > 0 ? (
                        <div className="text-center">
                          <div className="text-base font-bold text-slate-800">{count}</div>
                          <div className="text-[9px] text-slate-600">{pct.toFixed(0)}%</div>
                        </div>
                      ) : (
                        <div className="text-[10px] text-slate-300">—</div>
                      )}
                    </div>
                  );
                })}
              </div>
            ))}
          </div>
          <div className="flex flex-wrap gap-4 mt-3 text-[10px] text-slate-500">
            <span className="flex items-center gap-1"><span className="w-3 h-3 rounded-sm" style={{ backgroundColor: 'rgba(5, 150, 105, 0.4)' }} /> Preserved</span>
            <span className="flex items-center gap-1"><span className="w-3 h-3 rounded-sm" style={{ backgroundColor: 'rgba(217, 119, 6, 0.4)' }} /> Smoothed (toward neutral)</span>
            <span className="flex items-center gap-1"><span className="w-3 h-3 rounded-sm" style={{ backgroundColor: 'rgba(37, 99, 235, 0.4)' }} /> Amplified (away from neutral)</span>
            <span className="flex items-center gap-1"><span className="w-3 h-3 rounded-sm" style={{ backgroundColor: 'rgba(220, 38, 38, 0.4)' }} /> Polarity shifted</span>
          </div>
        </div>

        {/* Drilldown panel — shows actual text when a cell is clicked */}
        {selectedCell && selectedRow && selectedCol && selectedCases.length > 0 && (
          <div className="border border-blue-200 rounded-lg bg-blue-50/30 overflow-hidden">
            <div className="px-4 py-3 border-b border-blue-200 bg-blue-50 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="text-xs font-bold px-2 py-0.5 rounded" style={{
                  backgroundColor: SENTIMENT_DISPLAY[selectedRow].color + '18',
                  color: SENTIMENT_DISPLAY[selectedRow].color,
                }}>{SENTIMENT_DISPLAY[selectedRow].label}</span>
                <svg width="16" height="12" viewBox="0 0 16 12" fill="none">
                  <path d="M2 6h12m-3-3l3 3-3 3" stroke="#64748b" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
                <span className="text-xs font-bold px-2 py-0.5 rounded" style={{
                  backgroundColor: SENTIMENT_DISPLAY[selectedCol].color + '18',
                  color: SENTIMENT_DISPLAY[selectedCol].color,
                }}>{SENTIMENT_DISPLAY[selectedCol].label}</span>
                <span className="text-xs text-slate-500 ml-2">
                  {selectedCases.length} participant{selectedCases.length !== 1 ? 's' : ''}
                  {selectedCases[0] && (
                    <span className="ml-1 font-medium" style={{ color: directionColor[selectedCases[0].direction] }}>
                      ({directionLabel[selectedCases[0].direction]})
                    </span>
                  )}
                </span>
              </div>
              <button onClick={() => setSelectedCell(null)} className="text-slate-400 hover:text-slate-600 p-1 rounded hover:bg-blue-100">
                <svg width="14" height="14" viewBox="0 0 14 14" fill="none"><path d="M10.5 3.5l-7 7m0-7l7 7" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" /></svg>
              </button>
            </div>
            <div className="divide-y divide-blue-100 max-h-[400px] overflow-y-auto">
              {selectedCases.map((c, i) => (
                <div key={i} className="p-4 hover:bg-blue-50/50 transition-colors">
                  <div className="flex items-center gap-2 mb-2">
                    <span className="text-[10px] font-bold text-slate-400 bg-slate-100 px-1.5 py-0.5 rounded">{c.participantId}</span>
                    <span className="text-[9px] font-bold uppercase px-1.5 py-0.5 rounded" style={{
                      backgroundColor: directionColor[c.direction] + '18',
                      color: directionColor[c.direction],
                    }}>{directionLabel[c.direction]}</span>
                  </div>
                  <div className="grid grid-cols-[1fr_auto_1fr] gap-3 items-start">
                    {/* Participant input */}
                    <div>
                      <div className="text-[9px] font-bold uppercase text-slate-400 mb-1 flex items-center gap-1">
                        Participant Input
                        <span className="px-1 py-0.5 rounded text-[8px]" style={{
                          backgroundColor: SENTIMENT_DISPLAY[c.participantSentiment].color + '18',
                          color: SENTIMENT_DISPLAY[c.participantSentiment].color,
                        }}>{c.participantSentiment}</span>
                      </div>
                      <div className="text-xs text-slate-700 leading-relaxed bg-white rounded p-2 border border-slate-200">
                        "{c.participantText.length > 300 ? c.participantText.slice(0, 300) + '...' : c.participantText}"
                      </div>
                    </div>
                    {/* Arrow */}
                    <div className="flex flex-col items-center justify-center pt-5 gap-0.5">
                      <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
                        <path d="M5 12h14m-5-5l5 5-5 5" stroke={directionColor[c.direction]} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                      </svg>
                    </div>
                    {/* Summary sentence */}
                    <div>
                      <div className="text-[9px] font-bold uppercase text-slate-400 mb-1 flex items-center gap-1">
                        Summary Sentence
                        <span className="text-[8px] text-slate-400">S{c.sentenceIndex + 1}</span>
                        <span className="px-1 py-0.5 rounded text-[8px]" style={{
                          backgroundColor: SENTIMENT_DISPLAY[c.summarySentiment].color + '18',
                          color: SENTIMENT_DISPLAY[c.summarySentiment].color,
                        }}>{c.summarySentiment}</span>
                      </div>
                      <div className="text-xs text-slate-700 leading-relaxed bg-white rounded p-2 border border-slate-200">
                        "{c.summaryText}"
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    );
  };

  // ── Per-Sentence Card ──────────────────────────────────────────────────────
  const SentenceCard = ({ sentence }: { sentence: typeof data.sentences[0] }) => {
    const isExpanded = expandedSentence === sentence.sentenceIndex;
    const total = Object.values(sentence.counts).reduce((a, b) => a + b, 0);
    if (total === 0 && !sentence.epistemicClass) return null;

    return (
      <div className="border border-slate-200 rounded-lg overflow-hidden hover:border-slate-300 transition-colors">
        <button
          onClick={() => setExpandedSentence(isExpanded ? null : sentence.sentenceIndex)}
          className="w-full text-left p-4 hover:bg-slate-50/50 transition-colors"
        >
          <div className="flex items-start gap-3">
            <span className="text-[10px] font-bold text-slate-400 bg-slate-100 px-1.5 py-0.5 rounded mt-0.5 flex-shrink-0">
              S{sentence.sentenceIndex + 1}
            </span>
            <div className="flex-1 min-w-0">
              <p className="text-sm text-slate-700 leading-relaxed line-clamp-2">"{sentence.sentenceText}"</p>
              {sentence.epistemicClass && (
                <span className="inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full mt-1.5"
                  style={{ backgroundColor: EPISTEMIC_CONFIG[sentence.epistemicClass].bg, color: EPISTEMIC_CONFIG[sentence.epistemicClass].color }}
                  title={sentence.epistemicExplanation || EPISTEMIC_CONFIG[sentence.epistemicClass].description}>
                  {EPISTEMIC_CONFIG[sentence.epistemicClass].icon} {EPISTEMIC_CONFIG[sentence.epistemicClass].label}
                </span>
              )}
              <div className="flex h-2.5 rounded-full overflow-hidden mt-2 border border-slate-100">
                {TYPES.map(type => {
                  const count = sentence.counts[type];
                  if (count === 0) return null;
                  const pct = (count / total) * 100;
                  return <div key={type} style={{ width: `${pct}%`, backgroundColor: TYPE_CONFIG[type].color }} className="transition-all" />;
                })}
              </div>
              <div className="flex gap-2 mt-1.5">
                {TYPES.map(type => {
                  const count = sentence.counts[type];
                  if (count === 0) return null;
                  return (
                    <span key={type} className="text-[10px] font-medium" style={{ color: TYPE_CONFIG[type].color }}>
                      {count} {TYPE_CONFIG[type].label.toLowerCase()}
                    </span>
                  );
                })}
              </div>
            </div>
            <span className="text-slate-400 text-sm flex-shrink-0">{isExpanded ? '-' : '+'}</span>
          </div>
        </button>

        {isExpanded && sentence.mappings.length > 0 && (
          <div className="border-t border-slate-100 bg-slate-50/50 p-4 space-y-2.5">
            <div className="grid grid-cols-[1fr_auto_1fr] gap-2 text-[10px] font-bold text-slate-400 uppercase tracking-wide px-1 mb-1">
              <span>Raw Participant Language</span><span></span><span>Summary Language</span>
            </div>
            {sentence.mappings.map((m, i) => (
              <div key={i} className="grid grid-cols-[1fr_auto_1fr] gap-2 items-center p-2.5 rounded-lg border"
                style={{ borderColor: TYPE_CONFIG[m.type].color + '40', backgroundColor: TYPE_CONFIG[m.type].bg + '60' }}>
                <div className="min-w-0">
                  <div className="text-[10px] text-slate-400 font-medium mb-0.5">{m.participantId}</div>
                  <div className="text-xs text-slate-800 font-medium leading-relaxed">"{m.rawPhrase}"</div>
                </div>
                <div className="flex flex-col items-center gap-0.5 px-2">
                  <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
                    <path d="M4 10h12m-4-4l4 4-4 4" stroke={TYPE_CONFIG[m.type].color} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                  <span className="text-[9px] font-bold uppercase" style={{ color: TYPE_CONFIG[m.type].color }}>{TYPE_CONFIG[m.type].label}</span>
                </div>
                <div className="min-w-0">
                  {m.summaryPhrase ? (
                    <div className="text-xs text-slate-700 leading-relaxed">"{m.summaryPhrase}"</div>
                  ) : (
                    <div className="text-xs text-slate-400 italic">Not present in summary</div>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    );
  };

  // ── View Toggle ────────────────────────────────────────────────────────────
  const viewTabs: Array<{ key: typeof activeView; label: string; available: boolean }> = [
    { key: 'bars', label: 'Transformation Analysis', available: true },
    { key: 'emotion', label: 'Emotion Smoothing', available: !!emotionData },
  ];

  return (
    <div className="space-y-4">
      <OverallBar />

      {/* View toggle */}
      <div className="flex gap-1 bg-slate-100 p-1 rounded-lg">
        {viewTabs.filter(t => t.available).map(tab => (
          <button key={tab.key} onClick={() => setActiveView(tab.key)}
            className={`flex-1 px-3 py-1.5 rounded-md text-xs font-medium transition-all ${
              activeView === tab.key ? 'bg-white text-slate-800 shadow-sm' : 'text-slate-500 hover:text-slate-700'
            }`}>
            {tab.label}
          </button>
        ))}
      </div>

      {/* Bars view */}
      {activeView === 'bars' && (
        <>
          <div className="bg-slate-50 rounded-lg p-3 border border-slate-200">
            <div className="text-[10px] font-bold text-slate-400 uppercase tracking-wide mb-2">Transformation Types</div>
            <div className="grid grid-cols-2 md:grid-cols-5 gap-2">
              {TYPES.map(type => (
                <div key={type} className="flex items-start gap-1.5">
                  <span className="w-2 h-2 rounded-sm mt-1 flex-shrink-0" style={{ backgroundColor: TYPE_CONFIG[type].color }} />
                  <div>
                    <div className="text-[11px] font-semibold" style={{ color: TYPE_CONFIG[type].color }}>{TYPE_CONFIG[type].label}</div>
                    <div className="text-[10px] text-slate-500 leading-tight">{TYPE_CONFIG[type].description}</div>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Epistemic Profile */}
          {(() => {
            const epistemicCounts: Record<EpistemicClass, number> = { explicit: 0, inferred: 0, extrapolated: 0, speculative: 0 };
            for (const s of data.sentences) { if (s.epistemicClass) epistemicCounts[s.epistemicClass]++; }
            const totalEpistemic = Object.values(epistemicCounts).reduce((a, b) => a + b, 0);
            if (totalEpistemic === 0) return null;
            return (
              <div className="bg-slate-50 rounded-lg p-3 border border-slate-200">
                <div className="text-[10px] font-bold text-slate-400 uppercase tracking-wide mb-2">Epistemic Profile — Claim Evidence Basis</div>
                <div className="flex h-6 rounded-lg overflow-hidden border border-slate-200 mb-2">
                  {EPISTEMIC_TYPES.map(type => {
                    const count = epistemicCounts[type];
                    if (count === 0) return null;
                    const pct = (count / totalEpistemic) * 100;
                    return (
                      <div key={type} title={`${EPISTEMIC_CONFIG[type].label}: ${count} sentence${count !== 1 ? 's' : ''} (${pct.toFixed(0)}%)`}
                        className="flex items-center justify-center text-[10px] font-bold transition-all hover:opacity-80"
                        style={{ width: `${pct}%`, backgroundColor: EPISTEMIC_CONFIG[type].bg, color: EPISTEMIC_CONFIG[type].color, minWidth: pct > 3 ? undefined : '2px' }}>
                        {pct >= 12 ? `${EPISTEMIC_CONFIG[type].icon} ${pct.toFixed(0)}%` : ''}
                      </div>
                    );
                  })}
                </div>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
                  {EPISTEMIC_TYPES.map(type => {
                    const count = epistemicCounts[type];
                    if (count === 0) return null;
                    return (
                      <div key={type} className="flex items-start gap-1.5">
                        <span className="w-2 h-2 rounded-sm mt-1 flex-shrink-0" style={{ backgroundColor: EPISTEMIC_CONFIG[type].color }} />
                        <div>
                          <div className="text-[11px] font-semibold" style={{ color: EPISTEMIC_CONFIG[type].color }}>{EPISTEMIC_CONFIG[type].label} ({count})</div>
                          <div className="text-[10px] text-slate-500 leading-tight">{EPISTEMIC_CONFIG[type].description}</div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })()}

          <div className="space-y-3">
            <div className="text-sm font-semibold text-slate-700">Per-Sentence Analysis</div>
            {data.sentences.map(s => <SentenceCard key={s.sentenceIndex} sentence={s} />)}
          </div>
        </>
      )}

      {/* Emotion smoothing view */}
      {activeView === 'emotion' && <EmotionSmoothingViz />}
    </div>
  );
};
