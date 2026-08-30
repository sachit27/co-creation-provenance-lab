import React, { useMemo, useRef, useState } from 'react';
import { ParticipantAnalysis, ParticipantFeedback, FeedbackCalibration } from '../../types';
import { getRepresentationBands } from '../../constants';
import { validateParticipantResponse } from '../../services/participantVerification';

interface FeedbackAnalyticsProps {
  feedbacks: Map<string, ParticipantFeedback>;
  participants: ParticipantAnalysis[];
  totalParticipants: number;
  runId: string | null;
  datasetName: string;
  summary: string;
  onImportResponses: (feedbacks: Map<string, ParticipantFeedback>) => void;
}

// ─── Spearman rank correlation ────────────────────────────────────────────────

const rank = (values: number[]): number[] => {
  const indexed = values.map((v, i) => ({ v, i })).sort((a, b) => a.v - b.v);
  const ranks = new Array(values.length);
  for (let i = 0; i < indexed.length;) {
    let end = i + 1;
    while (end < indexed.length && indexed[end].v === indexed[i].v) end++;
    const midrank = ((i + 1) + end) / 2;
    for (let j = i; j < end; j++) ranks[indexed[j].i] = midrank;
    i = end;
  }
  return ranks;
};

const spearman = (xs: number[], ys: number[]): number | null => {
  const n = xs.length;
  if (n < 3) return null;
  const rx = rank(xs);
  const ry = rank(ys);
  const mean = (arr: number[]) => arr.reduce((a, b) => a + b, 0) / n;
  const mx = mean(rx);
  const my = mean(ry);
  const num = rx.reduce((s, r, i) => s + (r - mx) * (ry[i] - my), 0);
  const denX = Math.sqrt(rx.reduce((s, r) => s + (r - mx) ** 2, 0));
  const denY = Math.sqrt(ry.reduce((s, r) => s + (r - my) ** 2, 0));
  if (denX * denY === 0) return null;
  return num / (denX * denY);
};

// ─── Descriptive participant-response comparison ─────────────────────────────

const computeCalibration = (
  feedbacks: Map<string, ParticipantFeedback>,
  participants: ParticipantAnalysis[]
): FeedbackCalibration => {
  const bands = getRepresentationBands(participants[0]?.embeddingTier);
  const representationTarget = bands.target;
  const lowThreshold = bands.low;

  const entries = Array.from(feedbacks.entries())
    .map(([id, fb]) => {
      const p = participants.find(p => p.id === id);
      return p ? { id, score: p.representationScore, label: fb.label } : null;
    })
    .filter(Boolean) as { id: string; score: number; label: string }[];

  if (entries.length === 0) {
    return { agreementRate: 0, falsePositives: [], falseNegatives: [], totalFeedbacks: 0, calibrationScore: null, indeterminateCount: 0 };
  }

  const decisive = entries.filter(e =>
    e.label !== 'partial' && (e.score >= representationTarget || e.score < lowThreshold)
  );
  const agreed = decisive.filter(e =>
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

  // Ordinal coding is used for rank correlation only; it is not an interval scale.
  const VALENCE: Record<string, number> = { accurate: 1, partial: 0.5, missed: 0, distorted: -0.5 };
  const scores = entries.map(e => e.score);
  const valences = entries.map(e => VALENCE[e.label] ?? 0);
  const calibrationScore = spearman(scores, valences);

  return {
    agreementRate: decisive.length > 0 ? agreed / decisive.length : 0,
    falsePositives,
    falseNegatives,
    totalFeedbacks: entries.length,
    calibrationScore,
    indeterminateCount: entries.length - decisive.length,
  };
};

// ─── Import handler ───────────────────────────────────────────────────────────

const parseLegacyVerificationExport = (
  json: unknown,
  runId: string | null,
  datasetName: string,
  participantIds: Set<string>,
): { feedback: ParticipantFeedback | null; warning?: string; error?: string } => {
  if (typeof json !== 'object' || json === null) return { feedback: null, error: 'The JSON root is invalid.' };
  const data = json as Record<string, unknown>;
  if (data.schemaVersion !== 'participant-response-v2') return { feedback: null, error: 'Unsupported participant-response schema.' };
  if (data.runId !== runId || data.datasetName !== datasetName) return { feedback: null, error: 'Legacy response belongs to a different analysis run or dataset.' };
  const responses = Array.isArray(data.responses) ? data.responses : [];

  // Verdict mapping from participantVerification.ts HTML output
  const VERDICT_MAP: Record<string, ParticipantFeedback['label']> = {
    yes: 'accurate',
    partial: 'partial',
    no: 'distorted',
    // Also accept in-app labels directly
    accurate: 'accurate',
    missed: 'missed',
    distorted: 'distorted',
  };

  if (responses.length !== 1) return { feedback: null, error: 'A participant response file must contain exactly one response.' };
  for (const r of responses) {
    if (typeof r !== 'object' || r === null) continue;
    const resp = r as Record<string, unknown>;
    const id = String(resp.participantId ?? resp.id ?? '');
    const verdict = String(resp.verdict ?? resp.label ?? '');
    const mappedLabel = VERDICT_MAP[verdict];
    if (!id || !mappedLabel || !participantIds.has(id)) return { feedback: null, error: 'Participant ID or verdict is invalid for this analysis.' };
    return { feedback: {
      participantId: id,
      label: mappedLabel,
      comment: typeof resp.comment === 'string' ? resp.comment : undefined,
      timestamp: typeof resp.timestamp === 'number'
        ? resp.timestamp
        : typeof resp.timestamp === 'string' && Number.isFinite(Date.parse(resp.timestamp))
        ? Date.parse(resp.timestamp)
        : NaN,
      bindingVerified: false,
    }, warning: 'Imported a legacy v2 response. Its run and participant fields matched, but it has no summary digest, expiry, response ID, or integrity digest.' };
  }
  return { feedback: null, error: 'No response was found.' };
};

// ─── Component ────────────────────────────────────────────────────────────────

export const FeedbackAnalytics: React.FC<FeedbackAnalyticsProps> = ({
  feedbacks,
  participants,
  totalParticipants,
  runId,
  datasetName,
  summary,
  onImportResponses,
}) => {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [importStatus, setImportStatus] = useState<{ kind: 'success' | 'warning' | 'error'; text: string } | null>(null);

  const calibration = useMemo(
    () => computeCalibration(feedbacks, participants),
    [feedbacks, participants]
  );

  const scoreBands = getRepresentationBands(participants[0]?.embeddingTier);
  // Preserve the middle band instead of forcing every non-high score into low.
  const matrixData = useMemo(() => {
    const rows = {
      high: { accurate: 0, partial: 0, missed: 0, distorted: 0 },
      middle: { accurate: 0, partial: 0, missed: 0, distorted: 0 },
      low: { accurate: 0, partial: 0, missed: 0, distorted: 0 },
    };
    feedbacks.forEach((fb, id) => {
      const p = participants.find(p => p.id === id);
      if (!p) return;
      const band = p.representationScore >= scoreBands.target
        ? 'high'
        : p.representationScore < scoreBands.low ? 'low' : 'middle';
      if (fb.label in rows[band]) rows[band][fb.label as keyof typeof rows.high]++;
    });
    return rows;
  }, [feedbacks, participants, scoreBands.target, scoreBands.low]);

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const text = await file.text();
      const json = JSON.parse(text);
      const schemaVersion = typeof json === 'object' && json !== null
        ? String((json as Record<string, unknown>).schemaVersion ?? '') : '';
      let imported: ParticipantFeedback | null = null;
      let warning: string | undefined;
      if (schemaVersion === 'participant-response-v3') {
        const validation = await validateParticipantResponse(json, {
          runId,
          datasetName,
          summary,
          participantIds: participants.map(participant => participant.id),
          existingResponseIds: Array.from(feedbacks.values()).flatMap(feedback => feedback.responseId ? [feedback.responseId] : []),
        });
        if (!validation.feedback) {
          setImportStatus({ kind: 'error', text: validation.errors.join(' ') || 'Response validation failed.' });
          return;
        }
        imported = validation.feedback;
        warning = validation.warnings.join(' ') || undefined;
      } else {
        const legacy = parseLegacyVerificationExport(
          json, runId, datasetName, new Set(participants.map(participant => participant.id)),
        );
        if (!legacy.feedback || !Number.isFinite(legacy.feedback.timestamp)) {
          setImportStatus({ kind: 'error', text: legacy.error ?? 'Legacy response has an invalid timestamp.' });
          return;
        }
        imported = legacy.feedback;
        warning = legacy.warning;
      }

      const merged = new Map(feedbacks);
      const existing = merged.get(imported.participantId);
      if (existing && existing.timestamp >= imported.timestamp) {
        setImportStatus({ kind: 'error', text: 'A response for this participant with the same or a later submission time is already loaded.' });
        return;
      }
      merged.set(imported.participantId, imported);
      onImportResponses(merged);
      setImportStatus(warning
        ? { kind: 'warning', text: warning }
        : { kind: 'success', text: 'Response imported after run, summary, expiry, participant, duplicate-ID, and SHA-256 integrity checks.' });
    } catch (error) {
      setImportStatus({ kind: 'error', text: `Could not import the response: ${error instanceof Error ? error.message : 'invalid JSON file'}` });
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
          <span className="text-xs font-bold text-slate-700 uppercase tracking-wider">Participant Response Comparison</span>
        </div>
        <span className="text-[10px] font-bold px-2 py-0.5 rounded-full border text-slate-600 bg-slate-50 border-slate-200">
          Descriptive · n={calibration.totalFeedbacks}
        </span>
      </div>

      {/* Descriptive rank association */}
      <div className="bg-slate-50 rounded-lg p-2.5 border border-slate-200">
        <div className="flex items-center justify-between mb-1">
          <span className="text-[11px] text-slate-500">Score–response rank association (Spearman ρ)</span>
          <span className="text-sm font-bold text-slate-700">
            {calibration.calibrationScore === null ? '—' : calibration.calibrationScore.toFixed(2)}
          </span>
        </div>
        <p className="text-[10px] text-slate-400 mt-1">
          {calibration.calibrationScore !== null
            ? `${Math.round(calibration.agreementRate * 100)}% directional agreement among decisive high/low cases. This is a descriptive comparison, not validation or calibration.`
            : 'Rank association requires at least 3 responses with score and label variation.'}
          {calibration.indeterminateCount ? ` · ${calibration.indeterminateCount} middle-band/partial case(s) reported separately` : ''}
        </p>
      </div>

      {/* Agreement matrix */}
      <div>
        <div className="text-[11px] font-semibold text-slate-500 mb-1.5 uppercase tracking-wide">Responses by score band</div>
        <table className="w-full text-[11px] border border-slate-200 rounded overflow-hidden">
          <thead>
            <tr className="bg-slate-100 text-slate-600">
              <th className="p-1.5 text-left font-medium">Score Band</th>
              <th className="p-1.5 text-center font-medium text-green-600">Accurate</th>
              <th className="p-1.5 text-center font-medium text-blue-600">Partial</th>
              <th className="p-1.5 text-center font-medium text-amber-600">Missed</th>
              <th className="p-1.5 text-center font-medium text-red-600">Distorted</th>
            </tr>
          </thead>
          <tbody>
            <tr className="border-t border-slate-200 bg-green-50/30">
              <td className="p-1.5 text-slate-600">High (≥{scoreBands.target.toFixed(2)})</td>
              <td className="p-1.5 text-center font-bold text-green-700">{matrixData.high.accurate}</td>
              <td className="p-1.5 text-center font-bold text-blue-600">{matrixData.high.partial}</td>
              <td className="p-1.5 text-center font-bold text-amber-600">{matrixData.high.missed}</td>
              <td className="p-1.5 text-center font-bold text-red-600">{matrixData.high.distorted}</td>
            </tr>
            <tr className="border-t border-slate-200 bg-slate-50">
              <td className="p-1.5 text-slate-600">Middle</td>
              <td className="p-1.5 text-center">{matrixData.middle.accurate}</td>
              <td className="p-1.5 text-center">{matrixData.middle.partial}</td>
              <td className="p-1.5 text-center">{matrixData.middle.missed}</td>
              <td className="p-1.5 text-center">{matrixData.middle.distorted}</td>
            </tr>
            <tr className="border-t border-slate-200 bg-red-50/20">
              <td className="p-1.5 text-slate-600">Low (&lt;{scoreBands.low.toFixed(2)})</td>
              <td className="p-1.5 text-center font-bold text-amber-600">{matrixData.low.accurate}</td>
              <td className="p-1.5 text-center font-bold text-blue-600">{matrixData.low.partial}</td>
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
        <span className="text-[11px] text-slate-500 whitespace-nowrap">{coverage}/{totalParticipants} responses</span>
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
          v3 files are accepted only when their analysis binding and integrity checks pass. This does not authenticate identity.
        </p>
        {importStatus && (
          <p role="status" className={`mt-2 rounded border p-2 text-[10px] ${
            importStatus.kind === 'success' ? 'border-green-200 bg-green-50 text-green-800'
              : importStatus.kind === 'warning' ? 'border-amber-200 bg-amber-50 text-amber-800'
              : 'border-red-200 bg-red-50 text-red-800'
          }`}>{importStatus.text}</p>
        )}
      </div>
    </div>
  );
};

export default FeedbackAnalytics;
