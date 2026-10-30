import React, { useCallback, useEffect, useMemo, useState } from 'react';
import QRCode from 'qrcode';
import { AnalysisConfig, AnalysisResult, AuditReviewDecision, ParticipantInput } from '../../types';
import { runAnalysis } from '../../services/analysis';
import { ConfigPanel } from '../ui/ConfigPanel';
import { BrandLogo } from '../ui/BrandLogo';
import { livePollingDelay } from '../../live/polling';
import { AuditReviewQueue } from '../ui/AuditReviewQueue';
import { BeforeAfterComparison } from '../ui/BeforeAfterComparison';
import { LiveSessionGuide } from './LiveSessionGuide';
import { isPopulationScopeClaim } from '../../services/claimAttribution';

type Status = 'waiting' | 'open' | 'closed' | 'published';
type FeedbackItem = string;
type FeedbackAnswer = 1 | 2 | 3 | 4 | 5 | 'cannot_judge' | 'not_applicable' | 'prefer_not_to_answer' | 'not_shown';
interface SurveyItem { id: string; prompt: string; anchors: [string, string, string, string, string]; origin: 'built-in' | 'custom'; construct: string }
interface SurveyDefinition { version: number; digest: string; locale: string; items: SurveyItem[]; createdAt: string }
interface FeedbackRecord {
  submissionId: string; instrumentVersion: number; responses: Record<string, FeedbackAnswer>;
  comment?: string; submittedAt: string;
}
interface FeedbackMetric { validN: number; mean: number | null; distribution: Record<string, number>; missing: Record<string, number> }
interface SessionView {
  code: string; title: string; prompt: string; status: Status; revision: number; count: number;
  submissions?: Array<{ id: string; text: string; submittedAt: string }>;
  own?: { id: string; text: string; submittedAt: string };
  feedbackCount?: number;
  feedbackSummary?: Record<string, FeedbackMetric>;
  survey?: { enabled: boolean; definition: SurveyDefinition };
  publicationCount?: number;
  result?: { summary: string; method: string; averageAlignment: number | null; gini: number | null;
    validCount: number; publishedAt: string; themes?: Array<{ clusterId: number; label: string; size: number }>;
    versionId?: string; survey?: { enabled: boolean; definition?: SurveyDefinition };
    analysisRecord?: AnalysisResult; previousAnalysisRecord?: AnalysisResult; reviewRevision?: number;
    ownAlignment?: number | null; ownMatch?: string | null; ownTheme?: { clusterId: number; label: string; size: number } | null;
    ownFeedback?: FeedbackRecord | null;
    constellation?: {
      projection: 'pca-2d'; projectionNote: string; groupingUsable: boolean; groupingNote: string; privacyNote: string;
      summarySentences: string[];
      nodes: Array<{ id: string; x: number; y: number; alignment: number | null; comparable: boolean; clusterId: number | null; matchSentenceIndex: number | null; isOwn: boolean; previousAlignment: number | null }>;
      similarityLinks: Array<{ sourceId: string; targetId: string; similarity: number }>;
    };
  };
}

const FEEDBACK_ITEMS: SurveyItem[] = [
  { id: 'coverage', prompt: 'How much of what mattered most in your contribution is included?', anchors: ['None', 'A little', 'Some', 'Most', 'All'], origin: 'built-in', construct: 'perceived-summary-coverage' },
  { id: 'meaning', prompt: 'Where included, how accurately does the summary convey what you meant?', anchors: ['Not at all', 'Slightly', 'Moderately', 'Very', 'Completely accurately'], origin: 'built-in', construct: 'perceived-meaning-accuracy' },
  { id: 'emphasis', prompt: 'How well does the emphasis reflect what mattered most to you?', anchors: ['Not at all', 'Slightly', 'Moderately', 'Very', 'Completely well'], origin: 'built-in', construct: 'perceived-emphasis' },
  { id: 'voice', prompt: 'How much opportunity did you have to express your views?', anchors: ['None', 'A little', 'Some', 'Most', 'All I needed'], origin: 'built-in', construct: 'perceived-voice-opportunity' },
  { id: 'fairness', prompt: 'How fairly did the facilitation treat different viewpoints?', anchors: ['Not at all', 'Slightly', 'Moderately', 'Very', 'Completely fairly'], origin: 'built-in', construct: 'perceived-process-fairness' },
  { id: 'understanding', prompt: 'How much did the session help you understand other viewpoints?', anchors: ['Not at all', 'A little', 'Somewhat', 'Quite a lot', 'A great deal'], origin: 'built-in', construct: 'perceived-understanding' },
];

const api = async <T,>(url: string, init?: RequestInit): Promise<T> => {
  const response = await fetch(url, { cache: 'no-store', ...init });
  const body = await response.json();
  if (!response.ok) throw new Error(body.error || 'The session request failed.');
  return body as T;
};
const base = (code: string) => `/api/live/sessions/${code}`;
const hostKey = (code: string) => `provenance-live-host-${code}`;
const participantKey = (code: string) => `provenance-live-participant-${code}`;
const json = () => ({ 'Content-Type': 'application/json' });
const formatScore = (value: number | null | undefined) => value == null ? 'Unavailable' : value.toFixed(2);

export const LiveExperience: React.FC<{ onOpenDashboard: (result: AnalysisResult, code: string) => void }> = ({ onOpenDashboard }) => {
  const params = new URLSearchParams(window.location.search);
  const routeCode = params.get('host') || params.get('live');
  const [code, setCode] = useState(routeCode === 'new' ? '' : (routeCode || '').toUpperCase());
  const [isHost, setIsHost] = useState(Boolean(params.get('host')));
  const [available, setAvailable] = useState<boolean | null>(null);
  const [session, setSession] = useState<SessionView | null>(null);
  const [title, setTitle] = useState('');
  const [prompt, setPrompt] = useState('');
  const [joinCode, setJoinCode] = useState('');
  const [draft, setDraft] = useState('');
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [busy, setBusy] = useState(false);
  const [analysis, setAnalysis] = useState<AnalysisResult | null>(null);
  const [analysisRevision, setAnalysisRevision] = useState<number | null>(null);
  const [progress, setProgress] = useState('');
  const [qrDataUrl, setQrDataUrl] = useState('');
  const [feedbackResponses, setFeedbackResponses] = useState<Partial<Record<FeedbackItem, FeedbackAnswer>>>({});
  const [feedbackComment, setFeedbackComment] = useState('');
  const [detailsRevealed, setDetailsRevealed] = useState(false);
  const [surveyDraft, setSurveyDraft] = useState<SurveyItem[]>(FEEDBACK_ITEMS);
  const [summaryDraft, setSummaryDraft] = useState('');
  const [revisionNote, setRevisionNote] = useState('');
  const [localOnly, setLocalOnly] = useState(false);
  const [joinOrigin, setJoinOrigin] = useState(window.location.origin);
  const [recoveryKey, setRecoveryKey] = useState('');

  useEffect(() => {
    if (!isHost && session?.status !== 'open') setNotice('');
  }, [isHost, session?.status]);

  useEffect(() => {
    const saved = session?.result?.ownFeedback;
    if (!saved) return;
    setFeedbackResponses(saved.responses);
    setFeedbackComment(saved.comment || '');
  }, [session?.result?.ownFeedback?.submittedAt]);

  useEffect(() => {
    if (session?.survey?.definition.items) setSurveyDraft(session.survey.definition.items);
  }, [session?.survey?.definition.digest]);

  useEffect(() => {
    if (session?.result?.summary && !analysis) setSummaryDraft(session.result.summary);
  }, [session?.result?.versionId, session?.result?.publishedAt]);

  const validJoinOrigin = useMemo(() => {
    try {
      const parsed = new URL(joinOrigin);
      return ['http:', 'https:'].includes(parsed.protocol) && !parsed.username && !parsed.password && parsed.origin === joinOrigin.replace(/\/$/, '');
    } catch { return false; }
  }, [joinOrigin]);
  const joinUrl = useMemo(() => code && validJoinOrigin ? `${joinOrigin.replace(/\/$/, '')}${import.meta.env.BASE_URL}?live=${code}` : '', [code, joinOrigin, validJoinOrigin]);
  const tokenHeaders = useCallback(() => isHost
    ? { Authorization: `Bearer ${sessionStorage.getItem(hostKey(code)) || ''}` }
    : { 'X-Participant-Token': sessionStorage.getItem(participantKey(code)) || '' }, [code, isHost]);

  useEffect(() => {
    api<{ available: boolean; suggestedOrigin?: string | null; localOnly?: boolean }>('/api/live/health').then(health => {
      setAvailable(true); setLocalOnly(!!health.localOnly);
      if (['localhost', '127.0.0.1'].includes(window.location.hostname) && health.suggestedOrigin) setJoinOrigin(health.suggestedOrigin);
    }).catch(() => setAvailable(false));
  }, []);

  const refresh = useCallback(async () => {
    if (!code || !available) return;
    const view = await api<SessionView>(base(code), { headers: tokenHeaders() });
    setSession(view);
    if (view.own && !document.activeElement?.matches('textarea')) setDraft(view.own.text);
  }, [code, available, tokenHeaders]);

  useEffect(() => {
    if (!code || !available) return;
    let stopped = false;
    let timeout: number | undefined;

    const schedule = () => {
      if (stopped) return;
      timeout = window.setTimeout(poll, livePollingDelay(
        document.visibilityState,
        session?.status,
        Boolean(session?.result?.ownFeedback),
      ));
    };
    const poll = async () => {
      try { await refresh(); }
      catch (e) {
        if (isHost && e instanceof Error && e.message === 'Facilitator access required.') {
          sessionStorage.removeItem(hostKey(code));
          setSession(null);
        }
        if (!session) setError(e instanceof Error ? e.message : 'The session could not be refreshed.');
      } finally { schedule(); }
    };
    const onVisibilityChange = () => {
      if (timeout !== undefined) window.clearTimeout(timeout);
      if (document.visibilityState === 'visible') void poll();
      else schedule();
    };

    void poll();
    document.addEventListener('visibilitychange', onVisibilityChange);
    return () => {
      stopped = true;
      if (timeout !== undefined) window.clearTimeout(timeout);
      document.removeEventListener('visibilitychange', onVisibilityChange);
    };
  }, [code, available, refresh, isHost, session?.status, Boolean(session?.result?.ownFeedback)]);

  useEffect(() => {
    if (!joinUrl) return;
    QRCode.toDataURL(joinUrl, { width: 220, margin: 2, errorCorrectionLevel: 'M' })
      .then(setQrDataUrl).catch(() => setQrDataUrl(''));
  }, [joinUrl]);

  const act = async (work: () => Promise<void>) => {
    setBusy(true); setError(''); setNotice('');
    try { await work(); await refresh(); }
    catch (e) { setError(e instanceof Error ? e.message : 'Something went wrong.'); }
    finally { setBusy(false); }
  };

  const create = () => act(async () => {
    const created = await api<SessionView & { hostToken: string }>('/api/live/sessions', {
      method: 'POST', headers: json(), body: JSON.stringify({ title, prompt }),
    });
    sessionStorage.setItem(hostKey(created.code), created.hostToken);
    setRecoveryKey(created.hostToken);
    window.history.replaceState(null, '', `${import.meta.env.BASE_URL}?host=${created.code}`);
    setIsHost(true); setCode(created.code); setSession(created);
    setNotice('Session created. Share the join link, then open input when ready.');
  });

  const reclaimHost = async () => {
    const candidate = recoveryKey.trim();
    if (!/^[A-Za-z0-9_-]{40,64}$/.test(candidate)) { setError('Enter the facilitator recovery key exactly as it was shown.'); return; }
    setBusy(true); setError('');
    try {
      const view = await api<SessionView>(base(code), { headers: { Authorization: `Bearer ${candidate}` } });
      if (!view.submissions) throw new Error('That recovery key is not valid for this session.');
      sessionStorage.setItem(hostKey(code), candidate);
      setSession(view);
      setNotice('Facilitator access restored for this tab.');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Access could not be restored.');
    } finally { setBusy(false); }
  };

  const join = () => act(async () => {
    const joined = await api<{ participantToken: string }>(`${base(code)}/join`, { method: 'POST' });
    sessionStorage.setItem(participantKey(code), joined.participantToken);
    setNotice(session?.status === 'open' ? 'You joined. Input is open now.' : 'You joined. Input will open when the facilitator starts it.');
  });

  const submitInput = () => act(async () => {
    await api(`${base(code)}/submission`, {
      method: 'PUT', headers: { ...json(), ...tokenHeaders() }, body: JSON.stringify({ text: draft }),
    });
    setNotice('Your contribution was saved. You can edit it until input closes.');
  });

  const submitParticipantFeedback = () => act(async () => {
    await api(`${base(code)}/feedback`, {
      method: 'PUT', headers: { ...json(), ...tokenHeaders() },
      body: JSON.stringify({
        responses: feedbackResponses,
        comment: feedbackComment,
        auditExposureBeforeResponse: detailsRevealed ? 'metrics_shown' : 'summary_only',
      }),
    });
    setDetailsRevealed(true);
    setNotice('Thank you. Your feedback was saved and can still be updated.');
  });

  const downloadSession = async () => {
    setBusy(true); setError('');
    try {
      const response = await fetch(`${base(code)}/export`, { headers: tokenHeaders(), cache: 'no-store' });
      if (!response.ok) {
        const body = await response.json();
        throw new Error(body.error || 'The export failed.');
      }
      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `live-session-${code}-${new Date().toISOString().slice(0, 10)}.json`;
      link.click();
      URL.revokeObjectURL(url);
      setNotice('Session record downloaded.');
    } catch (e) { setError(e instanceof Error ? e.message : 'The export failed.'); }
    finally { setBusy(false); }
  };

  const setStatus = (status: 'open' | 'closed') => act(async () => {
    await api(`${base(code)}/status`, {
      method: 'POST', headers: { ...json(), ...tokenHeaders() }, body: JSON.stringify({ status }),
    });
    setAnalysis(null); setAnalysisRevision(null);
    setNotice(status === 'open' ? 'Input is open.' : 'Input is closed. Review contributions before analysis.');
  });

  const run = async (inputs: ParticipantInput[], config: AnalysisConfig) => {
    if (!session || (session.status !== 'closed' && session.status !== 'published')) return;
    setBusy(true); setError(''); setProgress('Starting audit…');
    const sourceRevision = session.revision;
    try {
      const result = await runAnalysis(inputs, config, setProgress);
      setAnalysis(result); setAnalysisRevision(sourceRevision);
      setSummaryDraft(result.summary);
      setProgress('Audit ready. Review the summary and measures before publishing.');
    } catch (e) { setError(e instanceof Error ? e.message : 'Audit failed.'); }
    finally { setBusy(false); }
  };

  const saveSurvey = (enabled: boolean) => act(async () => {
    await api(`${base(code)}/survey`, {
      method: 'PUT', headers: { ...json(), ...tokenHeaders() }, body: JSON.stringify({ enabled, items: surveyDraft }),
    });
    setNotice(enabled ? 'Survey saved and opened for participants.' : 'Survey saved and kept closed.');
  });

  const addSurveyItem = () => setSurveyDraft(previous => [...previous, {
    id: `custom_${Date.now().toString(36)}`, prompt: 'Your question',
    anchors: ['Not at all', 'A little', 'Somewhat', 'Very much', 'Completely'],
    origin: 'custom', construct: 'facilitator-defined-unspecified',
  }]);

  const runRevisedSummary = () => {
    if (!session?.submissions || !summaryDraft.trim()) return;
    const previousOrigin = analysis?.config.summaryProvenance?.origin
      ?? session.result?.analysisRecord?.config.summaryProvenance?.origin;
    const revisesAIDraft = previousOrigin === 'generated-in-run' || previousOrigin === 'ai-generated-external'
      || previousOrigin === 'ai-assisted' || previousOrigin === 'mixed'
      || analysis?.config.summaryMethod === 'ai'
      || session.result?.analysisRecord?.config.summaryMethod === 'ai';
    void run(session.submissions.map(s => ({ id: s.id, text: s.text })), {
      ...(analysis?.config || { datasetName: session.title, strategy: 'balanced', aiProvider: 'gemini', model: 'not-used', embeddingProvider: 'tfidf', embeddingModel: 'tfidf', runLOO: true }),
      summaryMethod: 'manual', manualSummaryText: summaryDraft,
      summaryProvenance: {
        origin: revisesAIDraft ? 'ai-assisted' : 'human-authored',
        notes: revisionNote || (revisesAIDraft ? 'Facilitator revision of an AI draft' : 'Facilitator revision'),
      },
    });
  };

  const runLocalBaseline = () => {
    if (!session?.submissions) return;
    void run(session.submissions.map(s => ({ id: s.id, text: s.text })), {
      datasetName: session.title, strategy: 'balanced', aiProvider: 'gemini', model: 'not-used',
      embeddingProvider: 'tfidf', embeddingModel: 'tfidf', runLOO: true,
      summaryMethod: 'extractive', summaryProvenance: { origin: 'algorithmic-extractive' },
    });
  };

  const publishAudit = () => act(async () => {
    if (!analysis || analysisRevision == null) throw new Error('Run the audit first.');
    const valid = analysis.participants.filter(p => !p.embeddingFailed && !p.alignmentUnavailableReason && Number.isFinite(p.representationScore));
    const scores = Object.fromEntries(analysis.participants.map(p => [p.id,
      !p.embeddingFailed && !p.alignmentUnavailableReason && Number.isFinite(p.representationScore) ? p.representationScore : null]));
    const matches = Object.fromEntries(analysis.participants.map(p => {
      const sentence = !p.embeddingFailed && !p.alignmentUnavailableReason
        ? analysis.summarySentences[p.topSentenceMatchIndex] : null;
      return [p.id, sentence && analysis.summary.includes(sentence) ? sentence : null];
    }));
    const themesUsable = analysis.clusteringDiagnostics?.usableForDownstream === true;
    const themeSizes = new Map<number, number>();
    analysis.participants.forEach(p => themeSizes.set(p.clusterId, (themeSizes.get(p.clusterId) || 0) + 1));
    const themes = themesUsable ? analysis.clusters.map(cluster => ({
      clusterId: cluster.id, label: cluster.label, size: themeSizes.get(cluster.id) || 0,
    })).filter(theme => theme.size > 0) : [];
    const participantThemes = themesUsable ? Object.fromEntries(analysis.participants.map(p => {
      const theme = themes.find(item => item.clusterId === p.clusterId);
      return [p.id, theme || { clusterId: p.clusterId, label: `Theme ${p.clusterId + 1}`, size: themeSizes.get(p.clusterId) || 1 }];
    })) : undefined;
    const constellation = {
      projection: 'pca-2d' as const,
      nodes: analysis.participants.map(participant => ({
        submissionId: participant.id,
        x: participant.semanticCoords.x,
        y: participant.semanticCoords.y,
        alignment: !participant.embeddingFailed && !participant.alignmentUnavailableReason && Number.isFinite(participant.representationScore)
          ? participant.representationScore : null,
        comparable: !participant.embeddingFailed && !participant.alignmentUnavailableReason && Number.isFinite(participant.representationScore),
        clusterId: themesUsable ? participant.clusterId : null,
        matchSentenceIndex: !participant.embeddingFailed && !participant.alignmentUnavailableReason &&
          Number.isInteger(participant.topSentenceMatchIndex) && participant.topSentenceMatchIndex >= 0 && participant.topSentenceMatchIndex < analysis.summarySentences.length
          ? participant.topSentenceMatchIndex : null,
      })),
      similarityLinks: (analysis.networkGraph?.edges || []).map(edge => ({
        sourceId: edge.source, targetId: edge.target, similarity: edge.weight,
      })),
      summarySentences: analysis.summarySentences,
      groupingUsable: themesUsable,
    };
    const manifest = analysis.runManifest;
    await api(`${base(code)}/publish`, {
      method: 'POST', headers: { ...json(), ...tokenHeaders() },
      body: JSON.stringify({
        summary: analysis.summary,
        method: `${analysis.runManifest?.actualSummaryMethod || analysis.config.summaryMethod} summary · ${analysis.embeddingTierUsed || analysis.config.embeddingProvider} alignment`,
        averageAlignment: valid.length ? valid.reduce((sum, p) => sum + p.representationScore, 0) / valid.length : null,
        gini: valid.length ? analysis.metrics.giniCoefficient : null,
        validCount: valid.length, scores, matches, themes, participantThemes, constellation,
        analysisMetadata: {
          runId: manifest?.runId,
          softwareVersion: manifest?.softwareVersion,
          summaryOrigin: analysis.config.summaryProvenance?.origin || (analysis.config.summaryMethod === 'ai' ? 'generated-in-run' : 'algorithmic-extractive'),
          requestedSummaryMethod: manifest?.requestedSummaryMethod || analysis.config.summaryMethod,
          actualSummaryMethod: manifest?.actualSummaryMethod || analysis.config.summaryMethod,
          strategy: analysis.config.strategy,
          requestedGenerator: manifest?.requestedGenerator,
          actualGenerator: manifest?.actualGenerator,
          requestedEmbedding: manifest?.requestedEmbedding || { provider: analysis.config.embeddingProvider, model: analysis.config.embeddingModel },
          actualEmbedding: manifest?.actualEmbedding || { provider: analysis.embeddingTierUsed || analysis.config.embeddingProvider, model: analysis.config.embeddingModel },
          thresholds: analysis.config.thresholds,
        },
        analysisRecord: analysis,
        revisionNote: revisionNote.trim() || undefined,
        sourceRevision: analysisRevision,
      }),
    });
    setAnalysis(null); setAnalysisRevision(null); setProgress('');
    setNotice('Results published to participant phones.');
  });

  if (available === null) return <main className="min-h-screen grid place-items-center text-slate-600">Connecting to live sessions…</main>;
  if (!available) return <LiveSessionGuide />;
  if (isHost && code && !sessionStorage.getItem(hostKey(code))) return <main className="min-h-screen p-6 grid place-items-center"><div className="max-w-lg w-full bg-white p-8 rounded-2xl border border-slate-200"><h1 className="text-2xl font-bold">Reclaim facilitator access</h1><p className="mt-3 text-slate-600">Enter the recovery key shown when this session was created. Treat it like a password.</p><label className="block mt-5 font-medium" htmlFor="recovery-key">Facilitator recovery key</label><input id="recovery-key" type="password" autoComplete="off" value={recoveryKey} onChange={event => setRecoveryKey(event.target.value)} className="w-full mt-2 p-3 rounded-lg border border-slate-300 font-mono" /><button disabled={busy || !recoveryKey.trim()} onClick={() => void reclaimHost()} className="mt-4 w-full px-4 py-2 rounded-lg bg-indigo-700 text-white font-semibold disabled:opacity-50">Restore access</button>{error && <p className="mt-4 p-3 rounded-lg bg-red-50 text-red-800" role="alert">{error}</p>}<a className="text-indigo-700 underline inline-block mt-5" href={`${import.meta.env.BASE_URL}?live=${code}`}>Open participant view</a></div></main>;

  return <main className="min-h-screen bg-slate-50 text-slate-900 flex flex-col">
    <div className="max-w-5xl mx-auto px-4 py-6 md:py-10">
      <header className="flex flex-wrap items-center justify-between gap-3 mb-8">
        <a href={import.meta.env.BASE_URL} aria-label="Back to Provenance Lab" className="rounded-lg focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500"><BrandLogo size="md" subtitle="Source-to-Summary Audit Engine" /></a>
        <span className="inline-flex items-center gap-2 rounded-full border border-indigo-200 bg-indigo-50 px-3 py-1.5 text-sm font-medium text-indigo-800"><span className="h-2 w-2 rounded-full bg-indigo-500" />Live session {code || 'setup'}</span>
      </header>
      {!code ? <section className="max-w-xl mx-auto bg-white rounded-2xl border border-slate-200 shadow-sm p-6 md:p-8">
        <div className="uppercase tracking-widest text-xs font-semibold text-indigo-700">Facilitator</div>
        <h1 className="text-3xl font-bold mt-2">Create a live session</h1>
        <p className="text-slate-600 mt-2">Participants join on their phones. You control when input opens, closes, and when results become visible.</p>
        <label className="block mt-6 font-medium" htmlFor="live-title">Session title</label>
        <input id="live-title" className="w-full mt-2 p-3 rounded-lg border border-slate-300" maxLength={120} value={title} onChange={e => setTitle(e.target.value)} placeholder="Neighborhood planning workshop" />
        <label className="block mt-5 font-medium" htmlFor="live-prompt">Question for participants</label>
        <textarea id="live-prompt" className="w-full mt-2 p-3 rounded-lg border border-slate-300 min-h-28" maxLength={500} value={prompt} onChange={e => setPrompt(e.target.value)} placeholder="What should the summary capture?" />
        <button disabled={busy || !title.trim() || !prompt.trim()} onClick={create} className="mt-6 px-5 py-3 rounded-lg bg-indigo-700 text-white font-semibold disabled:opacity-50">Create session</button>
        <div className="border-t border-slate-200 mt-8 pt-6"><h2 className="font-bold text-lg">Have a session code?</h2><div className="flex gap-2 mt-3"><input aria-label="Session code" className="min-w-0 flex-1 p-3 rounded-lg border border-slate-300 font-mono uppercase" value={joinCode} maxLength={10} onChange={e => setJoinCode(e.target.value.toUpperCase().replace(/[^A-Z2-9]/g, ''))} placeholder="10-character code" /><button disabled={joinCode.length !== 10} onClick={() => { window.history.replaceState(null, '', `${import.meta.env.BASE_URL}?live=${joinCode}`); setIsHost(false); setCode(joinCode); }} className="px-4 py-2 rounded-lg border border-indigo-300 text-indigo-800 font-semibold disabled:opacity-50">Join</button></div></div>
      </section> : <>
        {session ? <>
          <div className="flex flex-wrap items-start justify-between gap-4"><div><div className="uppercase tracking-widest text-xs font-semibold text-indigo-700">{isHost ? 'Facilitator console' : 'Participant view'}</div><h1 className="text-3xl font-bold mt-1">{session.title}</h1><p className="text-slate-600 mt-2 max-w-2xl">{session.prompt}</p></div><span className="px-3 py-1 rounded-full bg-indigo-100 text-indigo-800 font-semibold capitalize" role="status">{session.status === 'open' ? 'Input open' : session.status === 'closed' ? 'Input closed' : session.status === 'published' ? 'Results published' : 'Waiting to start'}</span></div>
          {error && <p className="mt-5 p-3 rounded-lg bg-red-50 text-red-800" role="alert">{error}</p>}
          {notice && <p className="mt-5 p-3 rounded-lg bg-emerald-50 text-emerald-800" role="status">{notice}</p>}
          {isHost ? <div className="grid lg:grid-cols-[300px_1fr] gap-6 mt-7">
            <aside className="bg-white rounded-2xl border border-slate-200 p-5 h-fit"><h2 className="font-bold text-lg">Invite participants</h2>{localOnly && <p role="alert" className="mt-3 rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900">This server is available only on this computer. Phones cannot join yet. To test over shared Wi-Fi, restart the session server with HOST=0.0.0.0 and use its network address.</p>}{qrDataUrl && <img src={qrDataUrl} alt={`QR code for ${joinUrl}`} className="mx-auto my-4 w-52 h-52" />}<p className="text-sm text-slate-600">Scan the QR code or open the link. The code is <strong className="font-mono">{code}</strong>.</p><label className="block mt-3 text-xs font-semibold text-slate-700" htmlFor="join-url-origin">Join URL host</label><input id="join-url-origin" type="url" value={joinOrigin} onChange={event => setJoinOrigin(event.target.value)} className={`w-full mt-1 p-2 rounded-lg border text-xs ${validJoinOrigin ? 'border-slate-300' : 'border-red-400'}`} aria-invalid={!validJoinOrigin} aria-describedby="join-url-help" /><p id="join-url-help" className={`mt-1 text-xs ${validJoinOrigin ? 'text-slate-500' : 'text-red-700'}`}>{validJoinOrigin ? 'Use an address phones can reach on the same Wi-Fi. A detected local address is selected when available.' : 'Enter only an origin such as http://192.168.1.20:5173.'}</p><div className="mt-3 break-all text-xs text-indigo-700">{joinUrl}</div><button disabled={!joinUrl} onClick={() => navigator.clipboard.writeText(joinUrl).then(() => setNotice('Join link copied.')).catch(() => setError('Copy failed. Select the link above.'))} className="mt-3 w-full p-2 rounded-lg border border-indigo-300 text-indigo-700 font-semibold disabled:opacity-50">Copy join link</button><details className="mt-4 border-t border-slate-200 pt-3"><summary className="cursor-pointer text-sm font-semibold">Facilitator recovery key</summary><p className="mt-2 text-xs text-slate-600">Save this private key in case the tab closes. Anyone with it can control the session.</p><div className="mt-2 break-all rounded bg-slate-100 p-2 font-mono text-xs">{recoveryKey || sessionStorage.getItem(hostKey(code))}</div><button onClick={() => navigator.clipboard.writeText(recoveryKey || sessionStorage.getItem(hostKey(code)) || '').then(() => setNotice('Recovery key copied.')).catch(() => setError('Copy failed. Select the key above.'))} className="mt-2 w-full p-2 rounded-lg border border-slate-300 text-sm font-semibold">Copy recovery key</button></details><p className="mt-5 text-sm"><strong>{session.count}</strong> contribution{session.count === 1 ? '' : 's'} received</p><p className="mt-2 text-xs text-slate-500">Updates automatically and slows down when tabs are hidden. Names are not collected; a person can submit one editable response per browser tab.</p></aside>
            <div className="space-y-6">
              <section className="bg-white rounded-2xl border border-slate-200 p-5"><h2 className="text-xl font-bold">Session controls</h2><p className="text-sm text-slate-600 mt-1">Input and result publication are separate decisions.</p><div className="flex flex-wrap gap-3 mt-4">{(session.status === 'waiting' || session.status === 'closed') && <button disabled={busy} onClick={() => setStatus('open')} className="px-4 py-2 bg-indigo-700 text-white rounded-lg font-semibold disabled:opacity-50">{session.status === 'closed' ? 'Reopen input' : 'Open input'}</button>}{session.status === 'open' && <button disabled={busy} onClick={() => setStatus('closed')} className="px-4 py-2 bg-slate-900 text-white rounded-lg font-semibold disabled:opacity-50">Close input</button>}<button disabled={busy} onClick={() => void downloadSession()} className="px-4 py-2 rounded-lg border border-slate-300 text-slate-800 font-semibold disabled:opacity-50">Download session data</button></div><p className="mt-3 text-xs text-slate-500">The JSON record contains session events, contributions, published provenance, and participant feedback. Access tokens are excluded.</p></section>
              <details className="bg-white rounded-2xl border border-slate-200 p-5">
                <summary className="cursor-pointer font-semibold text-indigo-800">Optional participant survey{session.survey?.enabled ? ' · Open' : ''}</summary>
                <div className="mt-4"><SurveyEditor items={surveyDraft} setItems={setSurveyDraft} enabled={session.survey?.enabled || false} busy={busy} onSave={saveSurvey} onAdd={addSurveyItem} /></div>
              </details>
              <section className="bg-white rounded-2xl border border-slate-200 p-5"><h2 className="text-xl font-bold">Contributions</h2><p className="text-sm text-slate-600 mt-1">Visible only to the facilitator until results are published.</p>{session.submissions?.length ? <ol className="mt-4 space-y-3">{session.submissions.map(s => <li key={s.id} className="border border-slate-200 rounded-lg p-3"><span className="text-xs font-bold text-indigo-700">{s.id}</span><p className="whitespace-pre-wrap text-sm mt-1">{s.text}</p></li>)}</ol> : <p className="text-slate-500 mt-4">No contributions yet.</p>}</section>
              {(session.status === 'closed' || session.status === 'published') && <section className="bg-white rounded-2xl border border-slate-200 p-5">
                <h2 className="text-xl font-bold">{session.status === 'published' ? 'Revise the summary' : 'Analyze closed input'}</h2>
                <p className="text-sm text-slate-600 mt-1">Write or paste the summary you want to audit, or generate a draft with AI. Review the result before publishing it to participants.</p>
                {session.count < 3 ? <p className="mt-4 text-amber-800">The audit requires at least 3 contributions.</p> : <>
                  <label className="block text-sm font-medium mt-5" htmlFor="live-summary-draft">Your summary draft</label>
                  <textarea id="live-summary-draft" value={summaryDraft} onChange={event => setSummaryDraft(event.target.value)} className="w-full mt-2 min-h-40 p-3 rounded-lg border border-slate-300 bg-white" placeholder="Write or paste a summary of the contributions…" />
                  <label className="block text-sm font-medium mt-3" htmlFor="live-revision-note">Revision note (optional)</label>
                  <input id="live-revision-note" value={revisionNote} onChange={event => setRevisionNote(event.target.value)} maxLength={300} className="w-full mt-2 p-3 rounded-lg border border-slate-300 bg-white" placeholder="What changed and why?" />
                  <button disabled={busy || !summaryDraft.trim() || (analysisRevision === session.revision && summaryDraft.trim() === analysis?.summary.trim())} onClick={runRevisedSummary} className="mt-4 px-4 py-2 rounded-lg bg-indigo-700 text-white font-semibold disabled:opacity-50">{analysis ? 'Audit revised summary' : 'Audit this summary'}</button>
                  <p className="mt-2 text-xs text-slate-500">A manual summary uses local text similarity unless you select another alignment provider in advanced settings.</p>
                  <details className="mt-5 border-t border-slate-200 pt-4">
                    <summary className="cursor-pointer font-semibold text-indigo-800">Generate with AI · advanced settings</summary>
                    <p className="mt-3 text-sm text-slate-600">Choose your provider and enter its API key, then select AI Model as the summary method. Running analysis generates and audits a draft here for review.</p>
                    <ConfigPanel key={`${code}-${session.revision}-${session.status}`} initialInputs={session.submissions?.map(s => ({ id: s.id, text: s.text }))} initialDatasetName={session.title} initialSummaryMethod="ai" onRun={run} />
                  </details>
                  <details className="mt-5 border-t border-slate-200 pt-4">
                    <summary className="cursor-pointer font-semibold text-slate-700">Compare with a local extractive baseline</summary>
                    <p className="mt-3 text-sm text-slate-600">This comparison selects source sentences using a deterministic algorithm. It does not generate an AI synthesis and needs no API key. Running it replaces your summary draft for review.</p>
                    <button disabled={busy} onClick={runLocalBaseline} className="mt-3 px-4 py-2 rounded-lg border border-slate-300 text-slate-800 font-semibold disabled:opacity-50">Run extractive comparison</button>
                  </details>
                </>}
                {progress && <p className="mt-4 text-sm" role="status">{progress}</p>}
                {analysis && <div className="mt-5 p-4 border border-indigo-200 rounded-xl bg-indigo-50">
                  <h3 className="font-bold">Review audit before publishing</h3>
                  <p className="mt-2 text-sm">Summary method: {analysis.config.summaryMethod === 'extractive' ? 'Local extractive comparison' : analysis.config.summaryMethod === 'manual' ? 'Manual summary' : 'AI-generated draft'} · Valid alignment scores: {analysis.metrics.scoredParticipants ?? analysis.participants.length} / {analysis.participants.length} · Gini: {formatScore(analysis.metrics.giniCoefficient)}</p>
                  <p className="mt-2 text-xs text-slate-600">Edits must be audited again before publication. Earlier published versions remain in the export.</p>
                  {isPopulationScopeClaim(analysis.summary) && <p role="alert" className="mt-3 rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm text-amber-950">
                    Check broad agreement or prevalence wording in this summary against all relevant contributions before publishing. A few retrieved passages or similarity scores cannot establish consensus or a majority. Revise and rerun the audit if the wording is unsupported.
                  </p>}
                  <AuditReviewQueue data={analysis} onChange={decisions => setAnalysis(previous => previous ? { ...previous, reviewDecisions: decisions } : previous)} onRevise={() => document.getElementById('live-summary-draft')?.focus()} />
                  <div className="flex flex-wrap gap-3 mt-4">
                    <button onClick={() => onOpenDashboard(analysis, code)} className="px-4 py-2 rounded-lg border border-indigo-300 text-indigo-800 font-semibold">Inspect full audit</button>
                    <button disabled={busy || analysisRevision !== session.revision || summaryDraft.trim() !== analysis.summary.trim()} onClick={publishAudit} className="px-4 py-2 rounded-lg bg-emerald-700 text-white font-semibold disabled:opacity-50">{session.status === 'published' ? 'Publish revised version' : 'Publish to phones'}</button>
                  </div>
                </div>}
              </section>}
              {session.status === 'published' && <><Results result={session.result} />{session.result?.analysisRecord && <>
                <PublishedAuditReview key={`${session.result.versionId}:${session.result.publishedAt}`} code={code} result={session.result} headers={tokenHeaders} onSaved={setSession} onRevise={() => document.getElementById('live-summary-draft')?.focus()} />
                {session.result.previousAnalysisRecord && <BeforeAfterComparison before={session.result.previousAnalysisRecord} after={session.result.analysisRecord} />}
                <button onClick={() => onOpenDashboard(session.result!.analysisRecord!, code)} className="px-4 py-2 rounded-lg border border-indigo-300 text-indigo-800 font-semibold">Open published full audit</button>
              </>}<FacilitatorFeedback items={session.survey?.definition.items || []} enabled={session.survey?.enabled || false} summary={session.feedbackSummary} responseCount={session.feedbackCount || 0} invitedCount={session.count} /></>}
            </div>
          </div> : <div className="max-w-xl mx-auto mt-7 space-y-5"><section className="bg-white rounded-2xl border border-slate-200 p-6"><h2 className="text-xl font-bold">Your contribution</h2><p className="text-sm text-slate-600 mt-1">Your text goes to the facilitator’s session server and may be sent to the analysis provider the facilitator selects. Other participants cannot read your raw response here. Published summaries may quote or reveal details from it; published visual data can include pseudonymous per-contribution scores and relationships. Do not include details you do not wish to share.</p>{!session.own && !sessionStorage.getItem(participantKey(code)) && session.status !== 'published' && <button disabled={busy} onClick={join} className="mt-5 px-4 py-2 rounded-lg bg-indigo-700 text-white font-semibold">Join session</button>}{session.status === 'open' && sessionStorage.getItem(participantKey(code)) && <><label className="block font-medium mt-5" htmlFor="live-contribution">Your response</label><textarea id="live-contribution" maxLength={4000} value={draft} onChange={e => setDraft(e.target.value)} className="w-full mt-2 p-3 rounded-lg border border-slate-300 min-h-44" placeholder="Write your view in your own words" /><div className="flex items-center justify-between mt-2 text-xs text-slate-500"><span>You can edit until input closes.</span><span>{draft.length}/4000</span></div><button disabled={busy || !draft.trim()} onClick={submitInput} className="mt-4 px-4 py-2 rounded-lg bg-indigo-700 text-white font-semibold disabled:opacity-50">{session.own ? 'Save changes' : 'Submit response'}</button></>}{session.own && session.status !== 'open' && <div className="mt-5 rounded-lg bg-emerald-50 p-4"><p className="font-semibold text-emerald-800">Response received ({session.own.id})</p><p className="mt-2 whitespace-pre-wrap text-sm">{session.own.text}</p></div>}{session.status === 'waiting' && <p className="mt-5 text-slate-600">The facilitator will open input shortly.</p>}{session.status === 'closed' && <p className="mt-5 text-slate-600">Input is closed. The facilitator is reviewing the responses.</p>}</section>{session.status === 'published' && (session.own ? <ParticipantResults result={session.result} busy={busy} responses={feedbackResponses} setResponses={setFeedbackResponses} comment={feedbackComment} setComment={setFeedbackComment} detailsRevealed={detailsRevealed} setDetailsRevealed={setDetailsRevealed} onSubmit={submitParticipantFeedback} /> : <><Results result={session.result} /><p className="p-4 rounded-xl bg-slate-100 text-slate-700 text-sm">Personal provenance is available only in the browser tab that submitted a contribution.</p></>)}</div>}
        </> : <p className="mt-7 text-slate-600">Loading session…</p>}
      </>}
      {error && !session && <p className="max-w-xl mx-auto mt-5 p-3 bg-red-50 text-red-800 rounded-lg" role="alert">{error}</p>}
    </div>
    <footer className="mt-auto border-t border-slate-200 bg-white/80 px-4 py-5 text-center text-sm text-slate-500">
      <a href="mailto:sachitmahajan90@gmail.com" className="font-medium text-indigo-700 hover:underline">Contact: Sachit Mahajan</a>
    </footer>
  </main>;
};

const PublishedAuditReview: React.FC<{
  code: string; result: NonNullable<SessionView['result']>; headers: () => HeadersInit;
  onSaved: (view: SessionView) => void; onRevise: () => void;
}> = ({ code, result, headers, onSaved, onRevise }) => {
  const [record, setRecord] = useState(result.analysisRecord!);
  const [revision, setRevision] = useState(result.reviewRevision || 0);
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');
  useEffect(() => {
    // Polling must not replace a pending decision or its unsaved retry state.
    if (!dirty && !saving && (result.reviewRevision || 0) > revision && result.analysisRecord) {
      setRecord(result.analysisRecord);
      setRevision(result.reviewRevision || 0);
    }
  }, [result.analysisRecord, result.reviewRevision, dirty, saving, revision]);
  const save = async (decisions: AuditReviewDecision[]) => {
    setRecord(previous => ({ ...previous, reviewDecisions: decisions }));
    setDirty(true); setSaving(true); setMessage('Saving private review notes…');
    try {
      const view = await api<SessionView>(`${base(code)}/review`, {
        method: 'PUT', headers: { ...json(), ...headers() },
        body: JSON.stringify({ versionId: result.versionId, publishedAt: result.publishedAt, reviewRevision: revision, decisions }),
      });
      setRecord(view.result!.analysisRecord!);
      setRevision(view.result!.reviewRevision || 0);
      setDirty(false); setMessage('Private review notes saved. Included in the facilitator export.');
      onSaved(view);
    } catch (error) { setMessage(error instanceof Error ? error.message : 'Review notes could not be saved.'); }
    finally { setSaving(false); }
  };
  return <section className="bg-white rounded-2xl border border-slate-200 p-5">
    <p className="text-sm text-slate-600 mb-3">Review notes are private to the facilitator and saved separately for each published version.</p>
    <fieldset disabled={saving}><AuditReviewQueue data={record} onChange={decisions => void save(decisions)} onRevise={onRevise} /></fieldset>
    {message && <p className="mt-3 text-sm" role={dirty && !saving ? 'alert' : 'status'}>{message}</p>}
    {dirty && !saving && <div className="flex flex-wrap gap-3 mt-3">
      <button onClick={() => void save(record.reviewDecisions || [])} className="px-4 py-2 rounded-lg border border-indigo-300 text-indigo-800 font-semibold">Retry saving review notes</button>
      <button onClick={() => { setRecord(result.analysisRecord!); setRevision(result.reviewRevision || 0); setDirty(false); setMessage('Current server notes loaded.'); }} className="px-4 py-2 rounded-lg border border-slate-300 font-semibold">Reload saved notes</button>
    </div>}
  </section>;
};

const Results: React.FC<{ result?: SessionView['result'] }> = ({ result }) => {
  if (!result) return null;
  return <>
    <section className="bg-white rounded-2xl border border-slate-200 p-5"><h2 className="text-xl font-bold">Published results</h2><p className="mt-2 text-sm text-slate-600">{result.method}</p><p className="mt-4 whitespace-pre-wrap">{result.summary}</p><div className="grid grid-cols-2 gap-3 mt-5 text-sm"><div className="p-3 bg-slate-50 rounded-lg"><strong>Mean alignment</strong><div>{formatScore(result.averageAlignment)}</div></div><div className="p-3 bg-slate-50 rounded-lg"><strong>Gini inequality</strong><div>{formatScore(result.gini)}</div></div></div><p className="mt-4 text-xs text-slate-500">Measures use {result.validCount} valid source scores. Similarity cannot establish authorship, agreement, or causal influence.</p></section>
  </>;
};

const ParticipantResults: React.FC<{
  result?: SessionView['result']; busy: boolean;
  responses: Partial<Record<FeedbackItem, FeedbackAnswer>>;
  setResponses: React.Dispatch<React.SetStateAction<Partial<Record<FeedbackItem, FeedbackAnswer>>>>;
  comment: string; setComment: (value: string) => void;
  detailsRevealed: boolean; setDetailsRevealed: (value: boolean) => void; onSubmit: () => void;
}> = ({ result, busy, responses, setResponses, comment, setComment, detailsRevealed, setDetailsRevealed, onSubmit }) => {
  if (!result) return null;
  const saved = result.ownFeedback;
  const survey = result.survey;
  if (!survey?.enabled || !survey.definition) return <><section className="bg-white rounded-2xl border border-slate-200 p-5"><div className="uppercase tracking-widest text-xs font-semibold text-indigo-700">Published summary</div><h2 className="text-xl font-bold mt-1">What the facilitator published</h2><p className="mt-2 text-sm text-slate-600">{result.method}</p><p className="mt-4 whitespace-pre-wrap leading-relaxed">{result.summary}</p></section><PersonalProvenance result={result} /></>;
  const surveyItems = survey.definition.items;
  const showDetails = detailsRevealed || Boolean(saved);
  const hiddenByCoverage = responses.coverage === 1 && surveyItems.some(item => item.id === 'coverage' && item.origin === 'built-in');
  return <>
    <section className="bg-white rounded-2xl border border-slate-200 p-5">
      <div className="uppercase tracking-widest text-xs font-semibold text-indigo-700">Published summary</div>
      <h2 className="text-xl font-bold mt-1">What the facilitator published</h2>
      <p className="mt-2 text-sm text-slate-600">{result.method}</p>
      <p className="mt-4 whitespace-pre-wrap leading-relaxed">{result.summary}</p>
    </section>
    <section className="bg-white rounded-2xl border border-slate-200 p-5">
      <h2 className="text-xl font-bold">How was this experience for you?</h2>
      <p className="mt-2 text-sm text-slate-600">These optional questions record your perception. Each item is reported separately; this pilot questionnaire is not a validated scale.</p>
      {saved && <p className="mt-3 p-3 rounded-lg bg-emerald-50 text-emerald-800 text-sm" role="status">Feedback saved. You may update it below.</p>}
      <div className="mt-5 space-y-6">
        {surveyItems.filter(item => !(hiddenByCoverage && (item.id === 'meaning' || item.id === 'emphasis'))).map(item => <fieldset key={item.id}>
          <legend className="font-medium text-sm">{item.prompt}</legend>
          <div className="grid grid-cols-5 gap-1.5 mt-2" aria-label={`${item.anchors[0]} to ${item.anchors[4]}`}>
            {[1, 2, 3, 4, 5].map(value => <label key={value} className={`cursor-pointer rounded-lg border p-2 text-center text-sm ${responses[item.id] === value ? 'border-indigo-700 bg-indigo-50 text-indigo-900 font-bold' : 'border-slate-200'}`}><input className="sr-only" type="radio" name={`feedback-${item.id}`} checked={responses[item.id] === value} onChange={() => setResponses(previous => ({ ...previous, [item.id]: value as FeedbackAnswer }))} /><span>{value}</span></label>)}
          </div>
          <div className="grid grid-cols-5 gap-1 text-[10px] text-slate-500 mt-1">{item.anchors.map((anchor, index) => <span key={anchor} className={index === 4 ? 'text-right' : index === 0 ? '' : 'text-center'}>{anchor}</span>)}</div>
          <select aria-label={`Alternative response for: ${item.prompt}`} className="mt-2 text-xs rounded-md border border-slate-300 p-2 bg-white" value={typeof responses[item.id] === 'string' ? String(responses[item.id]) : ''} onChange={event => setResponses(previous => ({ ...previous, [item.id]: event.target.value ? event.target.value as FeedbackAnswer : undefined }))}>
            <option value="">Optional alternative…</option><option value="cannot_judge">Cannot judge</option><option value="not_applicable">Not applicable</option><option value="prefer_not_to_answer">Prefer not to answer</option>
          </select>
        </fieldset>)}
      </div>
      <label className="block font-medium text-sm mt-6" htmlFor="live-feedback-comment">What should be corrected, added, or handled differently?</label>
      <textarea id="live-feedback-comment" maxLength={2000} value={comment} onChange={event => setComment(event.target.value)} className="w-full mt-2 p-3 rounded-lg border border-slate-300 min-h-24" />
      <div className="flex flex-wrap gap-3 mt-4"><button disabled={busy || (!Object.keys(responses).length && !comment.trim())} onClick={onSubmit} className="px-4 py-2 rounded-lg bg-indigo-700 text-white font-semibold disabled:opacity-50">{saved ? 'Update feedback' : 'Save feedback'}</button>{!showDetails && <button onClick={() => setDetailsRevealed(true)} className="px-4 py-2 rounded-lg border border-slate-300 text-slate-700 font-semibold">Continue without rating</button>}</div>
      <p className="mt-3 text-xs text-slate-500">No answer is preselected. Skipped and nonnumeric answers are kept separate from low ratings.</p>
    </section>
    {showDetails && <PersonalProvenance result={result} />}
  </>;
};

const PersonalProvenance: React.FC<{ result: NonNullable<SessionView['result']> }> = ({ result }) => <section className="bg-white rounded-2xl border border-slate-200 p-5">
  <div className="uppercase tracking-widest text-xs font-semibold text-indigo-700">Your provenance view</div>
  <h2 className="text-xl font-bold mt-1">How your response connects</h2>
  {result.ownMatch ? <div className="mt-5 grid gap-3">
    <div className="rounded-xl border border-slate-200 p-4"><p className="text-xs font-bold text-slate-500 uppercase tracking-wide">Your submitted source</p><p className="mt-2 text-sm">The response shown above is compared with each sentence in the published summary.</p></div>
    <div aria-hidden="true" className="mx-auto h-8 border-l-2 border-dashed border-indigo-300" />
    <div className="rounded-xl border-2 border-indigo-200 bg-indigo-50 p-4"><p className="text-xs font-bold text-indigo-700 uppercase tracking-wide">Closest summary sentence</p><p className="mt-2">“{result.ownMatch}”</p></div>
  </div> : <p className="mt-4 p-3 rounded-lg bg-amber-50 text-amber-900 text-sm">No comparable summary sentence was available for your source.</p>}
  {result.ownAlignment !== undefined && <div className="mt-5"><div className="flex justify-between text-sm"><strong>Strongest sentence similarity</strong><span>{formatScore(result.ownAlignment)}</span></div>{result.ownAlignment != null && <div className="h-3 bg-slate-100 rounded-full mt-2 overflow-hidden" role="img" aria-label={`Similarity ${formatScore(result.ownAlignment)} on a zero to one scale`}><div className="h-full bg-indigo-600 rounded-full" style={{ width: `${Math.max(0, Math.min(1, result.ownAlignment)) * 100}%` }} /></div>}<p className="mt-2 text-xs text-slate-500">This is semantic similarity on a 0–1 scale. It is not a probability or a judgment that your meaning was preserved.</p></div>}
  {result.ownTheme ? <div className="mt-5 p-4 rounded-xl bg-violet-50 text-violet-950"><strong>Provisional theme: {result.ownTheme.label}</strong><p className="mt-1 text-sm">{result.ownTheme.size} contribution{result.ownTheme.size === 1 ? '' : 's'} had similar language patterns. Similar wording may still express opposing positions, and this is not a social category.</p></div> : <p className="mt-5 text-sm text-slate-600">No theme partition met the analysis checks for this session. This does not establish agreement.</p>}
  {result.themes && result.themes.length > 0 && <div className="mt-6"><h3 className="font-bold">Theme overview</h3><ul className="mt-3 space-y-3">{result.themes.map(theme => <li key={theme.clusterId}><div className="flex justify-between text-sm"><span>{theme.label}</span><span>{theme.size}</span></div><div className="h-2 bg-slate-100 rounded-full mt-1"><div className="h-full bg-violet-500 rounded-full" style={{ width: `${100 * theme.size / Math.max(1, result.themes!.reduce((sum, item) => sum + item.size, 0))}%` }} /></div></li>)}</ul></div>}
  <p className="mt-5 text-xs text-slate-500">Measures use {result.validCount} valid source scores. Similarity cannot establish authorship, agreement, satisfaction, or causal influence.</p>
</section>;

const SurveyEditor: React.FC<{
  items: SurveyItem[]; setItems: React.Dispatch<React.SetStateAction<SurveyItem[]>>;
  enabled: boolean; busy: boolean; onSave: (enabled: boolean) => void; onAdd: () => void;
}> = ({ items, setItems, enabled, busy, onSave, onAdd }) => {
  const update = (index: number, changes: Partial<SurveyItem>) => setItems(previous => previous.map((item, itemIndex) => itemIndex === index ? { ...item, ...changes } : item));
  const move = (index: number, direction: -1 | 1) => setItems(previous => {
    const target = index + direction;
    if (target < 0 || target >= previous.length) return previous;
    const next = [...previous]; [next[index], next[target]] = [next[target], next[index]]; return next;
  });
  return <section className="bg-white rounded-2xl border border-slate-200 p-5">
    <div className="flex flex-wrap items-start justify-between gap-3"><div><h2 className="text-xl font-bold">Participant survey</h2><p className="text-sm text-slate-600 mt-1">Start from the six-question pilot, edit it, or add your own 1–5 items. Participants can answer once results are published and you switch the survey on.</p></div><span className={`px-3 py-1 rounded-full text-xs font-bold ${enabled ? 'bg-emerald-100 text-emerald-800' : 'bg-slate-100 text-slate-700'}`}>{enabled ? 'Open' : 'Closed'}</span></div>
    <details className="mt-4"><summary className="cursor-pointer font-semibold text-indigo-800">Customize questions</summary><div className="mt-4 space-y-4">{items.map((item, index) => <div key={item.id} className="rounded-xl border border-slate-200 p-4"><div className="flex gap-2 justify-between"><label className="flex-1 text-sm font-medium">Question {index + 1}<input value={item.prompt} maxLength={300} onChange={event => update(index, { prompt: event.target.value, origin: item.origin === 'built-in' ? 'built-in' : 'custom' })} className="block w-full mt-1 p-2.5 rounded-lg border border-slate-300" /></label><div className="flex gap-1 items-start"><button aria-label={`Move question ${index + 1} up`} disabled={index === 0} onClick={() => move(index, -1)} className="min-w-11 min-h-11 rounded-lg border disabled:opacity-30">↑</button><button aria-label={`Move question ${index + 1} down`} disabled={index === items.length - 1} onClick={() => move(index, 1)} className="min-w-11 min-h-11 rounded-lg border disabled:opacity-30">↓</button><button aria-label={`Remove question ${index + 1}`} disabled={items.length === 1} onClick={() => setItems(previous => previous.filter((_, itemIndex) => itemIndex !== index))} className="min-w-11 min-h-11 rounded-lg border text-red-700 disabled:opacity-30">×</button></div></div><div className="grid sm:grid-cols-5 gap-2 mt-3">{item.anchors.map((anchor, anchorIndex) => <label key={anchorIndex} className="text-[11px] text-slate-500">{anchorIndex + 1}<input value={anchor} maxLength={80} onChange={event => { const anchors = [...item.anchors] as SurveyItem['anchors']; anchors[anchorIndex] = event.target.value; update(index, { anchors }); }} className="block w-full mt-1 p-2 rounded border border-slate-300 text-sm text-slate-900" /></label>)}</div><p className="mt-2 text-[11px] text-slate-500">{item.origin === 'custom' ? 'Facilitator-authored; construct unspecified.' : 'Built-in pilot item; wording changes create a new version.'}</p></div>)}<button disabled={items.length >= 12} onClick={onAdd} className="px-4 py-2 rounded-lg border border-indigo-300 text-indigo-800 font-semibold disabled:opacity-50">Add custom question</button></div></details>
    <div className="flex flex-wrap gap-3 mt-5"><button disabled={busy} onClick={() => onSave(true)} className="px-4 py-2 rounded-lg bg-emerald-700 text-white font-semibold disabled:opacity-50">Save and open survey</button><button disabled={busy} onClick={() => onSave(false)} className="px-4 py-2 rounded-lg border border-slate-300 text-slate-800 font-semibold disabled:opacity-50">Save and keep closed</button></div>
    <p className="mt-3 text-xs text-slate-500">Changing wording or order creates a new instrument version. Existing responses stay bound to the version participants saw.</p>
  </section>;
};

const FacilitatorFeedback: React.FC<{ items: SurveyItem[]; enabled: boolean; summary?: Record<string, FeedbackMetric>; responseCount: number; invitedCount: number }> = ({ items, enabled, summary, responseCount, invitedCount }) => !enabled && responseCount === 0 ? null : <section className="bg-white rounded-2xl border border-slate-200 p-5">
  <h2 className="text-xl font-bold">Participant feedback</h2>
  {!enabled && <p className="mt-2 p-3 rounded-lg bg-slate-50 text-slate-700 text-sm">Survey closed. Participants can still view their provenance details.</p>}
  <p className="mt-1 text-sm text-slate-600">{responseCount} of {invitedCount} submitted contributors responded. Means use valid 1–5 answers for each item; missing and nonnumeric answers are excluded, not scored as zero.</p>
  {summary && <div className="mt-4 space-y-3">{items.map(item => { const metric = summary[item.id]; return <div key={item.id} className="grid grid-cols-[1fr_auto] gap-3 items-center"><div><div className="text-sm font-medium">{item.prompt}</div><div className="h-2 bg-slate-100 rounded-full mt-1 overflow-hidden">{metric?.mean != null && <div className="h-full bg-emerald-600" style={{ width: `${metric.mean / 5 * 100}%` }} />}</div></div><div className="text-right"><strong>{metric?.mean == null ? '—' : metric.mean.toFixed(1)}</strong><div className="text-[11px] text-slate-500">n={metric?.validN || 0}</div></div></div>; })}</div>}
  <p className="mt-4 text-xs text-slate-500">These are optional self-reports from respondents and are not a population estimate or a validated composite score.</p>
</section>;
