import React, { useMemo, useRef } from 'react';
import { ParticipantAnalysis, ParticipantFeedback, FeedbackCalibration } from '../../types';
import { ANALYSIS_CONFIG } from '../../constants';

interface FeedbackAnalyticsProps {
  feedbacks: Map<string, ParticipantFeedback>;
  participants: ParticipantAnalysis[];
  totalParticipants: number;
  onImportResponses: (feedbacks: Map<string, ParticipantFeedback>) => void;
}

// ─── Spearman rank correlation ────────────────────────────────────────────────

const rank = (values: number[]): number[] => {
  const indexed = values.map((v, i) => ({ v, i })).sort((a, b) => a.v - b.v);
  const ranks = new Array(values.length);
  for (let i = 0; i < indexed.length; i++) {
    ranks[indexed[i].i] = i + 1;
  }
  return ranks;
};

const spearman = (xs: number[], ys: number[]): number => {
  const n = xs.length;
  if (n < 3) return 0;
  const rx = rank(xs);
  const ry = rank(ys);
  const mean = (arr: number[]) => arr.reduce((a, b) => a + b, 0) / n;
  const mx = mean(rx);
  const my = mean(ry);
  const num = rx.reduce((s, r, i) => s + (r - mx) * (ry[i] - my), 0);
  const denX = Math.sqrt(rx.reduce((s, r) => s + (r - mx) ** 2, 0));
  const denY = Math.sqrt(ry.reduce((s, r) => s + (r - my) ** 2, 0));
  if (denX * denY === 0) return 0;
  return num / (denX * denY);
};

// ─── Calibration computation ─────────────────────────────────────────────────

const computeCalibration = (
  feedbacks: Map<string, ParticipantFeedback>,
  participants: ParticipantAnalysis[]
): FeedbackCalibration => {
  const { representationTarget, } = ANALYSIS_CONFIG.thresholds;
  const { low: lowThreshold } = ANALYSIS_CONFIG.representationInterpretation;

  const entries = Array.from(feedbacks.entries())
    .map(([id, fb]) => {
      const p = participants.find(p => p.id === id);
      return p ? { id, score: p.representationScore, label: fb.label } : null;
    })
    .filter(Boolean) as { id: string; score: number; label: string }[];

  if (entries.length === 0) {
    return { agreementRate: 0, falsePositives: [], falseNegatives: [], totalFeedbacks: 0, calibrationScore: 0 };
  }

  // Agreement: "accurate" with high score OR "missed"/"distorted" with low score
  const agreed = entries.filter(e =>
    (e.label === 'accurate' && e.score >= representationTarget) ||
    ((e.label === 'missed' || e.label === 'distorted') && e.score < lowThreshold)
  ).length;

  // False positives: high score but participant says missed/distorted
  const falsePositives = entries
    .filter(e => e.score >= representationTarget && (e.label === 'missed' || e.label === 'distorted'))
    .map(e => e.id);

  // False negatives: low score but participant says accurate
  const falseNegatives = entries
    .filter(e => e.score < lowThreshold && e.label === 'accurate')
    .map(e => e.id);

  // Spearman: scores vs valence ranks (accurate=1, missed=0, distorted=-0.5)
  const VALENCE: Record<string, number> = { accurate: 1, missed: 0, distorted: -0.5 };
  const scores = entries.map(e => e.score);
  const valences = entries.map(e => VALENCE[e.label] ?? 0);
  const calibrationScore = spearman(scores, valences);

  return {
    agreementRate: agreed / entries.length,
    falsePositives,
    falseNegatives,
    totalFeedbacks: entries.length,
    calibrationScore,
  };
};

// ─── Import handler ───────────────────────────────────────────────────────────

const parseVerificationExport = (
  json: unknown
): Map<string, ParticipantFeedback> => {
  const result = new Map<string, ParticipantFeedback>();
  if (typeof json !== 'object' || json === null) return result;
  const data = json as Record<string, unknown>;
  const responses = Array.isArray(data.responses) ? data.responses : [];

  // Verdict mapping from participantVerification.ts HTML output
  const VERDICT_MAP: Record<string, ParticipantFeedback['label']> = {
    yes: 'accurate',
    partial: 'missed',
    no: 'distorted',
    // Also accept in-app labels directly
    accurate: 'accurate',
    missed: 'missed',
    distorted: 'distorted',
  };

  for (const r of responses) {
    if (typeof r !== 'object' || r === null) continue;
    const resp = r as Record<string, unknown>;
    const id = String(resp.participantId ?? resp.id ?? '');
    const verdict = String(resp.verdict ?? resp.label ?? '');
    const mappedLabel = VERDICT_MAP[verdict];
    if (!id || !mappedLabel) continue;
    result.set(id, {
      participantId: id,
      label: mappedLabel,
      comment: typeof resp.comment === 'string' ? resp.comment : undefined,
      timestamp: typeof resp.timestamp === 'number' ? resp.timestamp : Date.now(),
    });
  }
  return result;
};

// ─── Component ────────────────────────────────────────────────────────────────

export const FeedbackAnalytics: React.FC<FeedbackAnalyticsProps> = ({
  feedbacks,
  participants,
  totalParticipants,
  onImportResponses,
}) => {
  const fileInputRef = useRef<HTMLInputElement>(null);

  const calibration = useMemo(
    () => computeCalibration(feedbacks, participants),
    [feedbacks, participants]
  );

  const calibrationLabel = calibration.calibrationScore > 0.6
    ? { text: 'Good', color: 'text-green-600 bg-green-50 border-green-200' }
    : calibration.calibrationScore > 0.3
    ? { text: 'Fair', color: 'text-amber-600 bg-amber-50 border-amber-200' }
    : { text: 'Poor', color: 'text-red-600 bg-red-50 border-red-200' };

  // Agreement matrix: rows = score band (high ≥0.6 / low <0.5), cols = feedback label
  const matrixData = useMemo(() => {
    const { representationTarget } = ANALYSIS_CONFIG.thresholds;
    const { low: lowThreshold } = ANALYSIS_CONFIG.representationInterpretation;

    const rows = { high: { accurate: 0, missed: 0, distorted: 0 }, low: { accurate: 0, missed: 0, distorted: 0 } };
    feedbacks.forEach((fb, id) => {
      const p = participants.find(p => p.id === id);
      if (!p) return;
      const band = p.representationScore >= representationTarget ? 'high' : 'low';
      if (fb.label in rows[band]) rows[band][fb.label as keyof typeof rows.high]++;
    });
    return rows;
  }, [feedbacks, participants]);

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const text = await file.text();
      const json = JSON.parse(text);
      const imported = parseVerificationExport(json);
      if (imported.size === 0) {
        alert('No valid participant responses found in the file. Ensure it is the exported JSON from the participant verification page.');
        return;
      }
      // Merge with existing feedbacks
      const merged = new Map(feedbacks);
      imported.forEach((fb, id) => merged.set(id, fb));
      onImportResponses(merged);
    } catch {
      alert('Could not parse the file. Please select the JSON export from the participant verification page.');
    }
    // Reset input
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const coverage = feedbacks.size;
  const coveragePct = Math.round((coverage / totalParticipants) * 100);

  return (
    <div className="space-y-3">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-teal-600">
            <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" /><polyline points="22 4 12 14.01 9 11.01" />
          </svg>
          <span className="text-xs font-bold text-slate-700 uppercase tracking-wider">Validation Analytics</span>
        </div>
        <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${calibrationLabel.color}`}>
          Algorithm Calibration: {calibrationLabel.text}
        </span>
      </div>

      {/* Calibration score */}
      <div className="bg-slate-50 rounded-lg p-2.5 border border-slate-200">
        <div className="flex items-center justify-between mb-1">
          <span className="text-[11px] text-slate-500">Human–Algorithm Agreement (Spearman ρ)</span>
          <span className={`text-sm font-bold ${calibration.calibrationScore > 0.6 ? 'text-green-600' : calibration.calibrationScore > 0.3 ? 'text-amber-600' : 'text-red-600'}`}>
            {calibration.calibrationScore.toFixed(2)}
          </span>
        </div>
        <div className="h-2 bg-slate-200 rounded-full overflow-hidden">
          <div
            className={`h-full rounded-full transition-all ${calibration.calibrationScore > 0.6 ? 'bg-green-500' : calibration.calibrationScore > 0.3 ? 'bg-amber-500' : 'bg-red-500'}`}
            style={{ width: `${Math.max(0, calibration.calibrationScore) * 100}%` }}
          />
        </div>
        <p className="text-[10px] text-slate-400 mt-1">
          {calibration.agreementRate > 0
            ? `${Math.round(calibration.agreementRate * 100)}% of feedbacks align with algorithmic scores`
            : 'Rank correlation between representation scores and human validation labels'}
        </p>
      </div>

      {/* Agreement matrix */}
      <div>
        <div className="text-[11px] font-semibold text-slate-500 mb-1.5 uppercase tracking-wide">Agreement Matrix</div>
        <table className="w-full text-[11px] border border-slate-200 rounded overflow-hidden">
          <thead>
            <tr className="bg-slate-100 text-slate-600">
              <th className="p-1.5 text-left font-medium">Score Band</th>
              <th className="p-1.5 text-center font-medium text-green-600">Accurate</th>
              <th className="p-1.5 text-center font-medium text-amber-600">Missed</th>
              <th className="p-1.5 text-center font-medium text-red-600">Distorted</th>
            </tr>
          </thead>
          <tbody>
            <tr className="border-t border-slate-200 bg-green-50/30">
              <td className="p-1.5 text-slate-600">High (≥0.6)</td>
              <td className="p-1.5 text-center font-bold text-green-700">{matrixData.high.accurate}</td>
              <td className="p-1.5 text-center font-bold text-amber-600">{matrixData.high.missed}</td>
              <td className="p-1.5 text-center font-bold text-red-600">{matrixData.high.distorted}</td>
            </tr>
            <tr className="border-t border-slate-200 bg-red-50/20">
              <td className="p-1.5 text-slate-600">Low (&lt;0.5)</td>
              <td className="p-1.5 text-center font-bold text-amber-600">{matrixData.low.accurate}</td>
              <td className="p-1.5 text-center font-bold text-green-700">{matrixData.low.missed}</td>
              <td className="p-1.5 text-center font-bold text-green-700">{matrixData.low.distorted}</td>
            </tr>
          </tbody>
        </table>
        <p className="text-[10px] text-slate-400 mt-1">Green cells = algorithm and human agree. Off-diagonal cells warrant investigation.</p>
      </div>

      {/* Disagreements */}
      {(calibration.falsePositives.length > 0 || calibration.falseNegatives.length > 0) && (
        <div className="space-y-1.5">
          {calibration.falsePositives.length > 0 && (
            <div className="bg-amber-50 border border-amber-200 rounded p-2">
              <div className="text-[10px] font-bold text-amber-700 mb-1">
                Score says "well-represented" but participant says "missed"
              </div>
              <div className="flex flex-wrap gap-1">
                {calibration.falsePositives.map(id => (
                  <span key={id} className="text-[10px] bg-amber-100 text-amber-800 px-1.5 py-0.5 rounded">{id}</span>
                ))}
              </div>
            </div>
          )}
          {calibration.falseNegatives.length > 0 && (
            <div className="bg-blue-50 border border-blue-200 rounded p-2">
              <div className="text-[10px] font-bold text-blue-700 mb-1">
                Score says "underrepresented" but participant says "accurate"
              </div>
              <div className="flex flex-wrap gap-1">
                {calibration.falseNegatives.map(id => (
                  <span key={id} className="text-[10px] bg-blue-100 text-blue-800 px-1.5 py-0.5 rounded">{id}</span>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Coverage */}
      <div className="flex items-center gap-2">
        <div className="flex-1 h-1.5 bg-slate-200 rounded-full overflow-hidden">
          <div
            className="h-full bg-teal-500 rounded-full transition-all"
            style={{ width: `${coveragePct}%` }}
          />
        </div>
        <span className="text-[11px] text-slate-500 whitespace-nowrap">{coverage}/{totalParticipants} validated</span>
      </div>

      {/* Import button */}
      <div>
        <input
          ref={fileInputRef}
          type="file"
          accept=".json"
          className="hidden"
          onChange={handleFileChange}
        />
        <button
          onClick={() => fileInputRef.current?.click()}
          className="w-full flex items-center justify-center gap-2 py-2 px-3 bg-teal-50 hover:bg-teal-100 border border-teal-200 text-teal-700 text-xs font-medium rounded-lg transition-colors"
        >
          <svg xmlns="http://www.w3.org/2000/svg" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
            <polyline points="17 8 12 3 7 8" />
            <line x1="12" y1="3" x2="12" y2="15" />
          </svg>
          Import Participant Responses (JSON)
        </button>
        <p className="text-[10px] text-slate-400 text-center mt-1">
          Import JSON exported from the participant verification page
        </p>
      </div>
    </div>
  );
};

export default FeedbackAnalytics;
