import React, { useState, useEffect, useRef } from 'react';
import { AnalysisResult, ParticipantInput, AnalysisConfig, QuestionAnalysis, ColumnInfo, ColumnSelection } from './types';
import { runAnalysis, runCoreAnalysis, enrichAnalysisResult } from './services/analysis';
import { Card } from './components/ui/Card';
import { SemanticMap } from './components/visualizations/SemanticMap';
import { RepresentationBar } from './components/visualizations/RepresentationBar';
import { ContributionLineage } from './components/visualizations/RepresentationFlow';
import { ConceptDistortion } from './components/visualizations/ConceptDistortion';
import { BlindSpotPlot } from './components/visualizations/BlindSpotPlot';
import { SimilarityNetwork } from './components/visualizations/SimilarityNetwork';
import { ConfigPanel } from './components/ui/ConfigPanel';
import { SensitivityChart } from './components/visualizations/SensitivityChart';
import { ProcessingState } from './components/ui/ProcessingState';
import { InfoIcon } from './components/ui/MetricGlossary';
import { GroupEquityChart } from './components/visualizations/GroupEquityChart';
import { UncertaintyViz } from './components/visualizations/UncertaintyViz';
import { ThresholdSensitivityMini, ThresholdImpactBadges } from './components/visualizations/ThresholdSensitivityMini';
// SummaryQualityMetrics removed - too complex for users
import { FeedbackPanel, FeedbackSummary } from './components/ui/FeedbackPanel';
import { ExecutiveSummary } from './components/ui/ExecutiveSummary';
import { MissedPerspectives } from './components/ui/MissedPerspectives';
import { StrategyComparison } from './components/ui/StrategyComparison';
import { downloadReport } from './services/reportExport';
import { downloadProvenanceCertificate } from './services/provenanceExport';
import { downloadVerificationPage } from './services/participantVerification';
import { BeforeAfterComparison } from './components/ui/BeforeAfterComparison';
import { BiasAttributionBadge } from './components/ui/BiasAttributionBadge';
import { FeedbackAnalytics } from './components/ui/FeedbackAnalytics';
import { FacilitationCoPilotPanel } from './components/ui/FacilitationCoPilotPanel';
// WhatIfSimulator removed — hypothetical feature
import { ProvenanceTrail } from './components/ui/ProvenanceTrail';
import { interpretGini, interpretEquityGap } from './services/plainLanguage';
import { ParticipantFeedback, FacilitationGapBrief, SummarizationStrategy } from './types';
import { preprocessWithSelections, PreprocessResult } from './services/dataPreprocessor';
import { OnboardingOverlay } from './components/ui/OnboardingOverlay';

// Icons
const Icons = {
  Map: () => <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polygon points="3 6 9 3 15 6 21 3 21 21 15 18 9 21 3 18 3 6" /><line x1="9" y1="3" x2="9" y2="21" /><line x1="15" y1="6" x2="15" y2="18" /></svg>,
  Flow: () => <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="6" y1="3" x2="6" y2="15" /><circle cx="18" cy="6" r="3" /><circle cx="6" cy="18" r="3" /><path d="M18 9a9 9 0 0 1-9 9" /></svg>,
  Bar: () => <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="20" x2="18" y2="10" /><line x1="12" y1="20" x2="12" y2="4" /><line x1="6" y1="20" x2="6" y2="14" /></svg>,
  Zap: () => <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2" /></svg>,
  Tag: () => <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M20.59 13.41l-7.17 7.17a2 2 0 0 1-2.83 0L2 12V2h10l8.59 8.59a2 2 0 0 1 0 2.82z"></path><line x1="7" y1="7" x2="7.01" y2="7"></line></svg>,
  Network: () => <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="18" cy="5" r="3" /><circle cx="6" cy="12" r="3" /><circle cx="18" cy="19" r="3" /><line x1="8.59" y1="13.51" x2="15.42" y2="17.49" /><line x1="15.41" y1="6.51" x2="8.59" y2="10.49" /></svg>,
  Eye: () => <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"></path><circle cx="12" cy="12" r="3"></circle></svg>,
  Refresh: () => <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 12" /><path d="M3 3v9h9" /></svg>,
  Info: () => <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10" /><line x1="12" y1="16" x2="12" y2="12" /><line x1="12" y1="8" x2="12.01" y2="8" /></svg>,
  User: () => <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" /><circle cx="12" cy="7" r="4" /></svg>,
  Users: () => <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" /><circle cx="9" cy="7" r="4" /><path d="M23 21v-2a4 4 0 0 0-3-3.87" /><path d="M16 3.13a4 4 0 0 1 0 7.75" /></svg>,
  Activity: () => <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="22 12 18 12 15 21 9 3 6 12 2 12" /></svg>,
  CheckSquare: () => <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="9 11 12 14 22 4" /><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11" /></svg>,
  Layers: () => <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polygon points="12 2 2 7 12 12 22 7 12 2" /><polyline points="2 17 12 22 22 17" /><polyline points="2 12 12 17 22 12" /></svg>,
  Graph: () => <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="5" cy="6" r="2"/><circle cx="19" cy="6" r="2"/><circle cx="12" cy="18" r="2"/><line x1="6.7" y1="7.5" x2="10.8" y2="16.2"/><line x1="17.3" y1="7.5" x2="13.2" y2="16.2"/><line x1="7" y1="6" x2="17" y2="6"/></svg>
};

type ViewState = 'setup' | 'processing' | 'dashboard' | 'error';
type TabState = 'map' | 'blindspot' | 'flow' | 'stats' | 'sensitivity' | 'concepts' | 'groups' | 'uncertainty' | 'strategies' | 'provenance' | 'similarity';

export default function App() {
  const [viewState, setViewState] = useState<ViewState>('setup');
  const [data, setData] = useState<AnalysisResult | null>(null);
  const [activeTab, setActiveTab] = useState<TabState>('map');
  // Per-question mode state
  const [questionResults, setQuestionResults] = useState<QuestionAnalysis[] | null>(null);
  const [activeQuestion, setActiveQuestion] = useState<number>(0);
  const [selectedParticipant, setSelectedParticipant] = useState<string | null>(null);
  const [progressMsg, setProgressMsg] = useState('Initializing...');
  const [errorMsg, setErrorMsg] = useState('');
  const [feedbacks, setFeedbacks] = useState<Map<string, ParticipantFeedback>>(new Map());
  const [isDemo, setIsDemo] = useState(false);
  const [revisedData, setRevisedData] = useState<AnalysisResult | null>(null);
  const [showRevisionEditor, setShowRevisionEditor] = useState(false);
  const [revisionDraft, setRevisionDraft] = useState('');
  const [isGeneratingDraft, setIsGeneratingDraft] = useState(false);
  const [isApplyingRevision, setIsApplyingRevision] = useState(false);
  // Feature #1: Facilitation Co-Pilot
  const [facilitationPlan, setFacilitationPlan] = useState<FacilitationGapBrief | null>(null);
  const [isGeneratingPlan, setIsGeneratingPlan] = useState(false);
  const [showFacilitationPanel, setShowFacilitationPanel] = useState(false);
  // Phase 2 enrichment state (concept fidelity runs in background after dashboard renders)
  const [isEnriching, setIsEnriching] = useState(false);
  const [enrichProgressMsg, setEnrichProgressMsg] = useState('');
  const analysisGenRef = useRef(0); // incremented on each new analysis; guards stale Phase 2 updates

  // Load pre-computed demo data on startup (if available)
  useEffect(() => {
    fetch('/demo-result.json')
      .then(res => {
        if (!res.ok) throw new Error('No demo data');
        return res.json();
      })
      .then((demoData: AnalysisResult) => {
        // Validate it's a real result, not an empty placeholder
        if (demoData?.participants?.length > 0 && demoData?.metrics && demoData?.summary) {
          setData(demoData);
          setIsDemo(true);
          setViewState('dashboard');
        }
      })
      .catch(() => {
        // No demo data available — stay in setup mode
      });
  }, []);

  // Export current analysis as demo JSON (for generating demo-result.json)
  const exportDemoData = () => {
    if (!data) return;
    // Strip inputEmbeddings to reduce file size
    const { inputEmbeddings, ...exportData } = data as any;
    const json = JSON.stringify(exportData, null, 2);
    const blob = new Blob([json], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'demo-result.json';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  // Feedback handler
  const handleFeedbackSubmit = (feedback: ParticipantFeedback) => {
    setFeedbacks(prev => {
      const newMap = new Map(prev);
      newMap.set(feedback.participantId, feedback);
      return newMap;
    });
  };

  /** Open the interactive revision editor, pre-filled with the current summary. */
  const handleOpenRevisionEditor = () => {
    if (!data) return;
    setRevisionDraft(data.summary);
    setShowRevisionEditor(true);
  };

  /** Ask AI to generate a draft revision (fills the editor textarea). */
  const handleGenerateAIDraft = async () => {
    if (!data) return;
    if (!data.inputEmbeddings?.length) {
      alert('Embeddings are not stored. Re-run the analysis to enable AI-assisted drafting.');
      return;
    }
    setIsGeneratingDraft(true);
    try {
      const { generateRevisedSummary } = await import('./services/summaryRevision');
      const draft = await generateRevisedSummary(data, data.config);
      setRevisionDraft(draft);
    } catch (e: any) {
      console.error('AI draft failed:', e);
      alert(`AI draft generation failed: ${e.message}`);
    } finally {
      setIsGeneratingDraft(false);
    }
  };

  /** Apply the current editor content and recompute scores for comparison. */
  const handleApplyRevision = async () => {
    if (!data || !revisionDraft.trim()) return;
    if (!data.inputEmbeddings?.length) {
      alert('Embeddings are not stored. Re-run the analysis to enable revision comparison.');
      return;
    }
    setIsApplyingRevision(true);
    try {
      const { recomputeWithNewSummary } = await import('./services/summaryRevision');
      const revised = await recomputeWithNewSummary(data, revisionDraft.trim(), data.config, setProgressMsg);
      setRevisedData(revised);
      setShowRevisionEditor(false);
    } catch (e: any) {
      console.error('Revision failed:', e);
      alert(`Revision failed: ${e.message}`);
    } finally {
      setIsApplyingRevision(false);
    }
  };

  /** Generate a facilitation plan using the Co-Pilot service */
  const handleGenerateFacilitationPlan = async () => {
    if (!data) return;
    setIsGeneratingPlan(true);
    setShowFacilitationPanel(true);
    try {
      const { generateFacilitationPlan } = await import('./services/facilitationCoPilot');
      const plan = await generateFacilitationPlan(data, data.config, setProgressMsg);
      setFacilitationPlan(plan);
    } catch (e: any) {
      console.error('Facilitation plan generation failed:', e);
      alert(`Facilitation plan failed: ${e.message}`);
      setShowFacilitationPanel(false);
    } finally {
      setIsGeneratingPlan(false);
    }
  };

  /** Handle import of participant responses from verification HTML export */
  const handleImportParticipantResponses = (merged: Map<string, ParticipantFeedback>) => {
    setFeedbacks(merged);
  };

  const startAnalysis = async (
    inputs: ParticipantInput[],
    config: AnalysisConfig,
    multiQuestion?: { rawCsvText: string; selection: ColumnSelection; columns: ColumnInfo[] }
  ) => {
    setViewState('processing');
    setErrorMsg('');
    setQuestionResults(null);
    setActiveQuestion(0);

    try {
      if (multiQuestion && multiQuestion.selection.textColumnIndices.length > 1) {
        // ── Per-question mode: run one analysis per selected text column ──
        // Each question runs full runAnalysis (both phases) sequentially.
        const perQResults = preprocessWithSelections(
          multiQuestion.rawCsvText,
          multiQuestion.selection,
          'per_question',
          multiQuestion.columns,
        ) as PreprocessResult[];

        const analyses: QuestionAnalysis[] = [];

        for (let i = 0; i < multiQuestion.selection.textColumnIndices.length; i++) {
          const colIdx = multiQuestion.selection.textColumnIndices[i];
          const colInfo = multiQuestion.columns.find(c => c.index === colIdx)!;
          const prep = perQResults[i];

          if (prep.inputs.length < 3) {
            console.warn(`Skipping Q${i + 1} "${colInfo.headerShort}": only ${prep.inputs.length} valid responses`);
            continue;
          }

          setProgressMsg(
            `Analyzing question ${i + 1} of ${multiQuestion.selection.textColumnIndices.length}: ` +
            `"${colInfo.headerShort}" (${prep.inputs.length} responses)…`
          );

          const result = await runAnalysis(
            prep.inputs,
            { ...config, datasetName: `${config.datasetName} — Q${i + 1}` },
            (msg) => setProgressMsg(`[Q${i + 1}/${multiQuestion.selection.textColumnIndices.length}] ${msg}`)
          );

          analyses.push({
            columnIndex: colIdx,
            questionLabel: colInfo.header,
            participantCount: prep.inputs.length,
            result,
          });
        }

        if (analyses.length === 0) throw new Error('No questions had enough responses (minimum 3) to analyze.');

        setQuestionResults(analyses);
        setData(analyses[0].result);
        setActiveQuestion(0);
        setViewState('dashboard');
      } else {
        // ── Standard single / combined mode: staged execution ──
        // Phase 1: core analysis (embeddings, summary, scoring, all pure-math analyses).
        // Renders the dashboard immediately without waiting for concept fidelity.
        const gen = ++analysisGenRef.current;
        const coreResult = await runCoreAnalysis(inputs, config, (msg) => setProgressMsg(msg));

        if (gen !== analysisGenRef.current) return; // a newer analysis was started — discard

        setData(coreResult);
        setViewState('dashboard');
        setIsEnriching(true);
        setEnrichProgressMsg('');

        // Phase 2: concept fidelity runs in background, fills the Concepts tab.
        enrichAnalysisResult(coreResult, inputs, config, (msg) => {
          if (gen !== analysisGenRef.current) return;
          setEnrichProgressMsg(msg);
        }).then(enriched => {
          if (gen !== analysisGenRef.current) return;
          setData(enriched);
          setIsEnriching(false);
          setEnrichProgressMsg('');
        }).catch(() => {
          if (gen !== analysisGenRef.current) return;
          // Enrichment failed — core results remain intact; clear the indicator
          setIsEnriching(false);
          setEnrichProgressMsg('');
        });
        return; // Phase 2 runs asynchronously — nothing more to do in startAnalysis
      }
    } catch (e: any) {
      console.error(e);
      setErrorMsg(e.message || "An unexpected error occurred during analysis.");
      setViewState('error');
    }
  };

  const handleNextParticipant = () => {
    if (!data || !selectedParticipant) return;
    const sorted = [...data.participants].sort((a, b) => a.representationScore - b.representationScore);
    const currIdx = sorted.findIndex(p => p.id === selectedParticipant);
    const nextIdx = (currIdx + 1) % sorted.length;
    setSelectedParticipant(sorted[nextIdx].id);
  };

  const handlePrevParticipant = () => {
    if (!data || !selectedParticipant) return;
    const sorted = [...data.participants].sort((a, b) => a.representationScore - b.representationScore);
    const currIdx = sorted.findIndex(p => p.id === selectedParticipant);
    const prevIdx = (currIdx - 1 + sorted.length) % sorted.length;
    setSelectedParticipant(sorted[prevIdx].id);
  };

  const MetricsBanner = ({ metrics, participants, uncertaintyMetrics }: { metrics: any, participants: any[], uncertaintyMetrics?: any }) => {
    const avgScore = participants.reduce((acc, p) => acc + p.representationScore, 0) / participants.length;
    const atRiskCount = participants.filter((p: any) => p.representationScore < 0.3).length;

    // Format CI if available
    const formatCI = (ci: { lower: number; upper: number } | undefined) => {
      if (!ci) return null;
      return `[${ci.lower.toFixed(2)}, ${ci.upper.toFixed(2)}]`;
    };

    return (
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        <Card className="border-l-4 border-l-blue-500 hover:shadow-md transition-shadow" allowOverflow={true}>
          <div className="text-slate-500 text-xs uppercase font-bold tracking-wider flex items-center">
            Avg Representation <InfoIcon metricKey="representation" />
          </div>
          <div className={`text-2xl font-bold mt-1 ${avgScore >= 0.6 ? 'text-green-600' : avgScore >= 0.5 ? 'text-amber-600' : 'text-red-600'}`}>
            {avgScore.toFixed(2)}
          </div>
          <div className="text-xs mt-1 flex items-center gap-1 flex-wrap">
            <span className={`px-1 rounded ${avgScore >= 0.6 ? 'bg-green-100 text-green-700' : 'bg-amber-100 text-amber-700'}`}>
              Target: {'>'}0.6
            </span>
            {uncertaintyMetrics?.avgRepresentationCI && (
              <span className="text-slate-400 text-[10px]">
                CI: {formatCI(uncertaintyMetrics.avgRepresentationCI)}
              </span>
            )}
          </div>
        </Card>
        <Card className="border-l-4 border-l-purple-500 hover:shadow-md transition-shadow" allowOverflow={true}>
          <div className="text-slate-500 text-xs uppercase font-bold tracking-wider flex items-center">
            Gini Coefficient <InfoIcon metricKey="gini" />
          </div>
          <div className={`text-2xl font-bold mt-1 ${metrics.giniCoefficient <= 0.2 ? 'text-green-600' : metrics.giniCoefficient <= 0.35 ? 'text-amber-600' : 'text-red-600'}`}>
            {metrics.giniCoefficient.toFixed(3)}
          </div>
          <div className="text-xs mt-1 flex items-center gap-1 flex-wrap">
            <span className={`px-1.5 rounded text-[10px] font-medium ${interpretGini(metrics.giniCoefficient).severity === 'good' ? 'bg-green-100 text-green-700' :
              interpretGini(metrics.giniCoefficient).severity === 'moderate' ? 'bg-amber-100 text-amber-700' :
                'bg-red-100 text-red-700'
              }`}>
              {interpretGini(metrics.giniCoefficient).interpretation.split('.')[0]}
            </span>
          </div>
          <div className="text-xs text-slate-500 mt-1 flex items-center gap-1 flex-wrap">
            <span>Inequality {metrics.giniCoefficient <= 0.2 ? '(Low)' : metrics.giniCoefficient <= 0.35 ? '(Moderate)' : '(High)'}</span>
          </div>
        </Card>
        <Card className="border-l-4 border-l-amber-500 hover:shadow-md transition-shadow" allowOverflow={true}>
          <div className="text-slate-500 text-xs uppercase font-bold tracking-wider flex items-center">
            Equity Gap <InfoIcon metricKey="gap" />
          </div>
          <div className={`text-2xl font-bold mt-1 ${Math.abs(metrics.distinctRepresentationGap) <= 0.1 ? 'text-green-600' : 'text-red-600'}`}>
            {metrics.distinctRepresentationGap.toFixed(2)}
          </div>
          <div className="text-xs text-slate-500 mt-1">
            {metrics.distinctRepresentationGap > 0.1 ? '⚠️ Distinct voices underrepresented' : '✓ Balanced coverage'}
          </div>
        </Card>
        <Card className="border-l-4 border-l-teal-500 hover:shadow-md transition-shadow" allowOverflow={true}>
          <div className="text-slate-500 text-xs uppercase font-bold tracking-wider flex items-center">
            Coverage Stats <InfoIcon metricKey="diversity" />
          </div>
          <div className="flex items-baseline gap-2 mt-1">
            <span className="text-2xl font-bold text-slate-800">{participants.length}</span>
            <span className="text-sm text-slate-500">inputs</span>
          </div>
          <div className="text-xs mt-1 flex items-center gap-2 flex-wrap">
            {atRiskCount > 0 ? (
              <span className="bg-red-100 text-red-700 px-1.5 rounded flex items-center gap-1">
                {atRiskCount} at risk <InfoIcon metricKey="atRisk" />
              </span>
            ) : (
              <span className="bg-green-100 text-green-700 px-1.5 rounded">All covered</span>
            )}
            <span className="text-slate-400">Div: {metrics.inputDiversity.toFixed(2)}</span>
          </div>
        </Card>
      </div>
    );
  };

  if (viewState === 'setup') {
    return (
      <div className="min-h-screen bg-slate-50 p-8">
        <OnboardingOverlay />
        <div className="max-w-6xl mx-auto">
          <div className="text-center mb-8">
            <div className="inline-block p-3 rounded-full bg-blue-100 text-blue-600 text-2xl mb-4">🌍</div>
            <h1 className="text-4xl font-extrabold text-slate-800 tracking-tight">Co-Creation Provenance Lab</h1>
            <p className="text-lg text-slate-500 mt-2 max-w-2xl mx-auto">Advanced AI-driven visualization for collaborative decision making. Analyze inclusivity, consensus, and bias in real-time.</p>
          </div>
          <ConfigPanel onRun={startAnalysis} />
        </div>
      </div>
    );
  }

  if (viewState === 'processing') {
    return <ProcessingState message={progressMsg} />;
  }

  if (viewState === 'error') {
    const isQuota = errorMsg.startsWith('[QUOTA]');
    const displayMsg = isQuota ? errorMsg.replace('[QUOTA] ', '') : errorMsg;
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center p-8">
        <div className="bg-white p-8 rounded-2xl shadow-xl max-w-lg w-full text-center border border-slate-200">
          {isQuota ? (
            <>
              <div className="w-16 h-16 bg-amber-100 rounded-full flex items-center justify-center mx-auto mb-4 text-3xl">🚫</div>
              <h2 className="text-xl font-bold text-slate-800 mb-2">API Quota Exhausted</h2>
              <p className="text-slate-500 mb-5">{displayMsg}</p>
              <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 mb-6 text-left space-y-1.5">
                <p className="text-sm font-semibold text-amber-800 mb-2">What you can do:</p>
                <ul className="text-sm text-amber-700 space-y-1.5 list-disc list-inside">
                  <li>Switch to <strong>Groq</strong> — completely free, no credit card required (console.groq.com)</li>
                  <li>Switch to <strong>Local Ollama</strong> — runs on your machine, unlimited usage</li>
                  <li>Wait and try again — Gemini free tier resets daily</li>
                  <li>Enter a different API key with remaining quota</li>
                </ul>
              </div>
            </>
          ) : (
            <>
              <div className="w-16 h-16 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-4 text-red-600 text-2xl">⚠️</div>
              <h2 className="text-xl font-bold text-slate-800 mb-2">Analysis Failed</h2>
              <p className="text-slate-600 mb-6">{displayMsg}</p>
            </>
          )}
          <button
            onClick={() => setViewState('setup')}
            className="bg-slate-800 text-white px-6 py-2 rounded-lg hover:bg-slate-700 transition-colors w-full"
          >
            Back to Configuration
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex flex-col md:flex-row bg-slate-50">
      {/* Sidebar */}
      <aside className="w-full md:w-64 bg-slate-900 text-slate-300 flex-shrink-0 flex flex-col shadow-2xl z-20">
        <div className="p-6 border-b border-slate-800">
          <div className="flex items-center gap-2 mb-1">
            <span className="text-xl">🌍</span>
            <h1 className="text-white font-bold text-lg tracking-tight">Provenance Lab</h1>
          </div>
          <p className="text-xs text-slate-500 font-medium">
            {data?.config.datasetName} • {data?.participants.length} Participants
            {questionResults && questionResults.length > 1 && (
              <span className="block text-blue-400 mt-0.5">Q{activeQuestion + 1} of {questionResults.length} questions</span>
            )}
          </p>
          <div className="mt-4 px-2 py-1 bg-slate-800 rounded text-[10px] font-mono text-blue-300 border border-blue-900/50 flex justify-between">
            <span>Strategy:</span>
            <span className="font-bold">{data?.config.strategy.toUpperCase()}</span>
          </div>
        </div>

        <nav className="p-4 space-y-2 flex-1">
          <div className="text-[10px] font-bold text-slate-500 uppercase px-4 mb-2">Visualizations</div>
          <button onClick={() => setActiveTab('map')} className={`w-full flex items-center gap-3 px-4 py-3 rounded-lg text-sm font-medium transition-all ${activeTab === 'map' ? 'bg-blue-600 text-white shadow-lg shadow-blue-900/50' : 'hover:bg-slate-800 text-slate-400'}`}>
            <Icons.Map /> Discussion Map
          </button>
          <button onClick={() => setActiveTab('blindspot')} className={`w-full flex items-center gap-3 px-4 py-3 rounded-lg text-sm font-medium transition-all ${activeTab === 'blindspot' ? 'bg-blue-600 text-white shadow-lg shadow-blue-900/50' : 'hover:bg-slate-800 text-slate-400'}`}>
            <Icons.Eye /> Blind Spot Plot
          </button>
          <button onClick={() => setActiveTab('similarity')} className={`w-full flex items-center gap-3 px-4 py-3 rounded-lg text-sm font-medium transition-all ${activeTab === 'similarity' ? 'bg-blue-600 text-white shadow-lg shadow-blue-900/50' : 'hover:bg-slate-800 text-slate-400'}`}>
            <Icons.Graph /> Similarity Network
          </button>
          <button onClick={() => setActiveTab('flow')} className={`w-full flex items-center gap-3 px-4 py-3 rounded-lg text-sm font-medium transition-all ${activeTab === 'flow' ? 'bg-blue-600 text-white shadow-lg shadow-blue-900/50' : 'hover:bg-slate-800 text-slate-400'}`}>
            <Icons.Flow /> Contribution Lineage
          </button>

          <div className="text-[10px] font-bold text-slate-500 uppercase px-4 mb-2 mt-4">Auditing</div>
          <button onClick={() => setActiveTab('concepts')} className={`w-full flex items-center gap-3 px-4 py-3 rounded-lg text-sm font-medium transition-all ${activeTab === 'concepts' ? 'bg-blue-600 text-white shadow-lg shadow-blue-900/50' : 'hover:bg-slate-800 text-slate-400'}`}>
            <Icons.Tag /> Concept Fidelity
            {isEnriching && <span className="ml-auto w-1.5 h-1.5 rounded-full bg-indigo-400 animate-pulse flex-shrink-0" />}
          </button>
          <button onClick={() => setActiveTab('sensitivity')} className={`w-full flex items-center gap-3 px-4 py-3 rounded-lg text-sm font-medium transition-all ${activeTab === 'sensitivity' ? 'bg-blue-600 text-white shadow-lg shadow-blue-900/50' : 'hover:bg-slate-800 text-slate-400'}`}>
            <Icons.Zap /> Sensitivity (LOO)
          </button>
          <button onClick={() => setActiveTab('stats')} className={`w-full flex items-center gap-3 px-4 py-3 rounded-lg text-sm font-medium transition-all ${activeTab === 'stats' ? 'bg-blue-600 text-white shadow-lg shadow-blue-900/50' : 'hover:bg-slate-800 text-slate-400'}`}>
            <Icons.Bar /> Inclusion Metrics
          </button>

          <div className="text-[10px] font-bold text-slate-500 uppercase px-4 mb-2 mt-4">Advanced</div>
          {data?.groupAnalysis && (
            <button onClick={() => setActiveTab('groups')} className={`w-full flex items-center gap-3 px-4 py-3 rounded-lg text-sm font-medium transition-all ${activeTab === 'groups' ? 'bg-blue-600 text-white shadow-lg shadow-blue-900/50' : 'hover:bg-slate-800 text-slate-400'}`}>
              <Icons.Users /> Group Equity
            </button>
          )}
          <button onClick={() => setActiveTab('uncertainty')} className={`w-full flex items-center gap-3 px-4 py-3 rounded-lg text-sm font-medium transition-all ${activeTab === 'uncertainty' ? 'bg-blue-600 text-white shadow-lg shadow-blue-900/50' : 'hover:bg-slate-800 text-slate-400'}`}>
            <Icons.Activity /> Uncertainty
          </button>
          {data?.strategyComparison && data.strategyComparison.length > 0 && (
            <button onClick={() => setActiveTab('strategies')} className={`w-full flex items-center gap-3 px-4 py-3 rounded-lg text-sm font-medium transition-all ${activeTab === 'strategies' ? 'bg-blue-600 text-white shadow-lg shadow-blue-900/50' : 'hover:bg-slate-800 text-slate-400'}`}>
              <Icons.Layers /> Compare Strategies
            </button>
          )}
          <button onClick={() => setActiveTab('provenance')} className={`w-full flex items-center gap-3 px-4 py-3 rounded-lg text-sm font-medium transition-all ${activeTab === 'provenance' ? 'bg-blue-600 text-white shadow-lg shadow-blue-900/50' : 'hover:bg-slate-800 text-slate-400'}`}>
            📜 Citation Trail
          </button>
        </nav>

        <div className="p-4 border-t border-slate-800 space-y-2">
          <button onClick={() => { setIsDemo(false); setViewState('setup'); setRevisedData(null); setShowRevisionEditor(false); }} className="w-full bg-slate-800 hover:bg-slate-700 text-white py-2 px-4 rounded-lg flex items-center justify-center gap-2 transition-colors text-sm font-medium border border-slate-700 group">
            <Icons.Refresh /> <span className="group-hover:text-blue-200 transition-colors">New Analysis</span>
          </button>
          {data && (
            <button
              onClick={() => downloadReport(data)}
              className="w-full bg-blue-800/50 hover:bg-blue-700 text-blue-200 hover:text-white py-2 px-4 rounded-lg flex items-center justify-center gap-2 transition-colors text-xs font-medium border border-blue-700/50"
              title="Download a comprehensive HTML report for stakeholders"
            >
              📊 Export Report (HTML)
            </button>
          )}
          {data && (
            <button
              onClick={() => downloadProvenanceCertificate(data)}
              className="w-full bg-slate-800/50 hover:bg-slate-700 text-slate-400 hover:text-white py-2 px-4 rounded-lg flex items-center justify-center gap-2 transition-colors text-xs font-medium border border-slate-700/50"
              title="Download W3C PROV-O audit certificate (JSON-LD)"
            >
              📜 Export Provenance (JSON-LD)
            </button>
          )}
          {data && (
            <button
              onClick={() => downloadVerificationPage(data)}
              className="w-full bg-slate-800/50 hover:bg-slate-700 text-slate-400 hover:text-white py-2 px-4 rounded-lg flex items-center justify-center gap-2 transition-colors text-xs font-medium border border-slate-700/50"
              title="Download standalone HTML page for participant verification"
            >
              ✅ Participant Verification
            </button>
          )}
          {data && (
            <button
              onClick={handleGenerateFacilitationPlan}
              disabled={isGeneratingPlan}
              className="w-full bg-emerald-800/60 hover:bg-emerald-700 disabled:opacity-50 disabled:cursor-wait text-emerald-200 hover:text-white py-2 px-4 rounded-lg flex items-center justify-center gap-2 transition-colors text-xs font-medium border border-emerald-700/50"
              title="Generate facilitation plan with follow-up questions and workshop exercises"
            >
              {isGeneratingPlan ? (
                <>
                  <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="animate-spin"><path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 12" /><path d="M3 3v9h9" /></svg>
                  Generating…
                </>
              ) : (
                '🧭 Facilitation Co-Pilot'
              )}
            </button>
          )}
          {data && !isDemo && (
            <button onClick={exportDemoData} className="w-full bg-slate-800/50 hover:bg-slate-700 text-slate-400 hover:text-white py-2 px-4 rounded-lg flex items-center justify-center gap-2 transition-colors text-xs font-medium border border-slate-700/50">
              Export as Demo Data
            </button>
          )}
        </div>
      </aside>

      {/* Main Content */}
      <main className="flex-1 overflow-y-auto p-4 md:p-8 relative">
        {data && (
          <div className="max-w-7xl mx-auto space-y-6">

            {/* Demo Mode Banner */}
            {isDemo && (
              <div className="bg-gradient-to-r from-blue-600 to-indigo-600 text-white rounded-xl p-4 shadow-lg flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <span className="text-2xl">🔬</span>
                  <div>
                    <div className="font-bold text-sm">Interactive Demo</div>
                    <div className="text-blue-100 text-xs">Pre-computed analysis of 30 citizen science participants using BGE-M3 embeddings. Explore the dashboard below or run your own analysis.</div>
                  </div>
                </div>
                <button
                  onClick={() => { setIsDemo(false); setViewState('setup'); }}
                  className="bg-white/20 hover:bg-white/30 text-white text-sm font-medium py-2 px-4 rounded-lg transition-colors whitespace-nowrap"
                >
                  Try Your Own Data
                </button>
              </div>
            )}

            {/* Question tab selector — shown only in per-question mode */}
            {questionResults && questionResults.length > 1 && (
              <div className="bg-white border border-slate-200 rounded-xl shadow-sm p-1.5 flex gap-1.5 overflow-x-auto">
                {questionResults.map((qa, idx) => (
                  <button
                    key={qa.columnIndex}
                    title={qa.questionLabel}
                    onClick={() => {
                      setActiveQuestion(idx);
                      setData(qa.result);
                      setSelectedParticipant(null);
                    }}
                    className={`flex-shrink-0 flex flex-col items-start px-4 py-3 rounded-lg text-left transition-all text-sm min-w-[160px] max-w-[240px] ${activeQuestion === idx
                      ? 'bg-blue-600 text-white shadow-sm'
                      : 'text-slate-600 hover:bg-slate-100'
                      }`}
                  >
                    <span className={`text-[10px] font-bold uppercase tracking-wide mb-0.5 ${activeQuestion === idx ? 'text-blue-100' : 'text-slate-400'}`}>
                      Q{idx + 1} · {qa.participantCount} responses
                    </span>
                    <span className="text-xs font-medium leading-snug line-clamp-2">
                      {qa.questionLabel.length > 80 ? qa.questionLabel.slice(0, 80) + '…' : qa.questionLabel}
                    </span>
                  </button>
                ))}
              </div>
            )}

            {/* Language equity alert (shown when non-English inputs are underrepresented) */}
            {data.languageAnalysis?.hasEquityIssue && (
              <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 flex items-start gap-3">
                <span className="text-xl flex-shrink-0">🌐</span>
                <div>
                  <div className="font-bold text-amber-800 text-sm">Language Equity Issue Detected</div>
                  <p className="text-amber-700 text-xs mt-1">
                    Non-English inputs ({data.languageAnalysis.underrepresentedLanguages.join(', ').toUpperCase()}) are
                    underrepresented compared to English inputs
                    {data.languageAnalysis.pValue != null
                      ? ` (permutation test p = ${data.languageAnalysis.pValue.toFixed(3)})`
                      : ' (sample too small for significance test — interpret with caution)'}. This may reflect embedding model bias
                    toward English. Consider using BGE-M3 (multilingual) or reviewing these inputs manually.
                  </p>
                </div>
              </div>
            )}

            {/* Executive Summary - The headline view */}
            <ExecutiveSummary
              data={data}
              onViewDetails={(tab) => setActiveTab(tab as TabState)}
              onExportReport={() => downloadReport(data)}
              onRevise={handleOpenRevisionEditor}
            />

            {/* Interactive Revision Editor — opened by "Revise Summary" button */}
            {showRevisionEditor && (
              <div className="bg-white border border-emerald-200 rounded-2xl shadow-lg overflow-hidden">
                <div className="bg-emerald-700 px-6 py-4 flex items-center justify-between">
                  <div>
                    <h3 className="text-white font-bold text-lg">Revise Summary</h3>
                    <p className="text-emerald-100 text-xs mt-0.5">Edit manually or generate an AI draft, then apply to compare metrics side-by-side.</p>
                  </div>
                  <button
                    onClick={() => setShowRevisionEditor(false)}
                    aria-label="Close editor"
                    className="text-emerald-200 hover:text-white transition-colors p-1 rounded"
                  >
                    <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></svg>
                  </button>
                </div>

                <div className="p-6 space-y-4">
                  {/* Trade-off explanation */}
                  <div className="bg-amber-50 border border-amber-200 rounded-lg px-4 py-3 flex items-start gap-2">
                    <span className="text-amber-500 flex-shrink-0 mt-0.5">ℹ️</span>
                    <p className="text-amber-800 text-sm leading-relaxed">
                      <strong>Expected trade-off:</strong> Adding new voices may lower scores for some previously well-captured participants. This is normal — semantic matching is zero-sum across a fixed summary length. Review the before/after comparison after applying to assess the overall impact.
                    </p>
                  </div>

                  {/* Textarea + controls */}
                  <div>
                    <div className="flex items-center justify-between mb-2">
                      <label className="text-sm font-semibold text-slate-700">Summary Text</label>
                      <div className="flex items-center gap-2">
                        <button
                          onClick={() => setRevisionDraft(data.summary)}
                          className="text-xs text-slate-500 hover:text-slate-700 border border-slate-200 rounded px-2.5 py-1 hover:bg-slate-50 transition-colors"
                        >
                          Reset to Original
                        </button>
                        <button
                          onClick={handleGenerateAIDraft}
                          disabled={isGeneratingDraft || !data.inputEmbeddings?.length || data.config.summaryMethod === 'extractive'}
                          title={!data.inputEmbeddings?.length ? 'Re-run analysis to enable AI drafting' : data.config.summaryMethod === 'extractive' ? 'AI draft requires an AI provider' : 'Generate an AI-assisted revision'}
                          className="text-xs bg-slate-800 text-white rounded px-3 py-1 hover:bg-slate-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors flex items-center gap-1.5"
                        >
                          {isGeneratingDraft ? (
                            <>
                              <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="animate-spin"><path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 12" /><path d="M3 3v9h9" /></svg>
                              Generating…
                            </>
                          ) : (
                            '✨ Generate AI Draft'
                          )}
                        </button>
                      </div>
                    </div>
                    <textarea
                      value={revisionDraft}
                      onChange={(e) => setRevisionDraft(e.target.value)}
                      rows={7}
                      className="w-full p-4 border border-slate-200 rounded-lg text-sm text-slate-700 focus:ring-2 focus:ring-emerald-500 outline-none resize-y leading-relaxed"
                      placeholder="Edit the summary here, or use Generate AI Draft to get a starting point…"
                    />
                    <div className="text-xs text-slate-400 mt-1">
                      {revisionDraft.length} chars · {revisionDraft.split(/\s+/).filter(Boolean).length} words
                    </div>
                  </div>

                  {/* Action buttons */}
                  <div className="flex gap-3 justify-end pt-2 border-t border-slate-100">
                    <button
                      onClick={() => setShowRevisionEditor(false)}
                      className="px-4 py-2 text-sm text-slate-600 border border-slate-200 rounded-lg hover:bg-slate-50 transition-colors"
                    >
                      Cancel
                    </button>
                    <button
                      onClick={handleApplyRevision}
                      disabled={isApplyingRevision || !revisionDraft.trim() || revisionDraft === data.summary}
                      className="px-6 py-2 text-sm bg-emerald-600 text-white rounded-lg hover:bg-emerald-500 disabled:opacity-50 disabled:cursor-not-allowed transition-colors flex items-center gap-2 font-medium"
                    >
                      {isApplyingRevision ? (
                        <>
                          <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="animate-spin"><path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 12" /><path d="M3 3v9h9" /></svg>
                          Applying…
                        </>
                      ) : (
                        'Apply & Compare →'
                      )}
                    </button>
                  </div>
                </div>
              </div>
            )}

            {/* Revision Impact — shown after a revision is applied */}
            {revisedData && (
              <BeforeAfterComparison
                before={data}
                after={revisedData}
                onClose={() => setRevisedData(null)}
              />
            )}

            {/* Facilitation Co-Pilot Panel */}
            {showFacilitationPanel && (facilitationPlan || isGeneratingPlan) && (
              <div className="relative">
                {facilitationPlan ? (
                  <FacilitationCoPilotPanel
                    plan={facilitationPlan}
                    isGenerating={isGeneratingPlan}
                    onRegenerate={handleGenerateFacilitationPlan}
                    onClose={() => { setShowFacilitationPanel(false); setFacilitationPlan(null); }}
                  />
                ) : (
                  <div className="bg-white border border-emerald-200 rounded-xl p-6 flex items-center justify-center gap-3 text-emerald-700 shadow-sm">
                    <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="animate-spin"><path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 12" /><path d="M3 3v9h9" /></svg>
                    <span className="text-sm font-medium">Generating facilitation plan…</span>
                  </div>
                )}
              </div>
            )}

            {/* What Was Missed - Actionable output */}
            <MissedPerspectives
              participants={data.participants}
              clusters={data.clusters}
              summarySentences={data.summarySentences}
              onSelectParticipant={setSelectedParticipant}
            />

            {/* Detailed Metrics (collapsible for experts) */}
            <details className="group">
              <summary className="cursor-pointer text-sm font-medium text-slate-500 hover:text-slate-700 flex items-center gap-2 py-2">
                <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="transition-transform group-open:rotate-90">
                  <polyline points="9 18 15 12 9 6" />
                </svg>
                Show Detailed Metrics
              </summary>
              <div className="pt-4">
                <MetricsBanner metrics={data.metrics} participants={data.participants} uncertaintyMetrics={data.uncertaintyMetrics} />
              </div>
            </details>

            {/* Bridging Suggestion Banner (New XAI Feature) */}
            {data.bridgingOpportunities && data.bridgingOpportunities.length > 0 && (
              <div className="bg-gradient-to-r from-indigo-50 to-blue-50 border border-indigo-100 rounded-xl p-4 mb-4 shadow-sm relative overflow-hidden group">
                <div className="absolute right-0 top-0 w-32 h-full bg-gradient-to-l from-white/50 to-transparent"></div>
                <div className="flex items-start gap-4">
                  <div className="bg-indigo-100 p-2 rounded-lg text-2xl">🌉</div>
                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-1">
                      <h3 className="font-bold text-indigo-900">Bridging Opportunities Detected</h3>
                      <div className="text-[10px] bg-indigo-200 text-indigo-800 px-2 py-0.5 rounded-full font-bold uppercase tracking-wider">AI Suggestion</div>
                    </div>
                    <p className="text-sm text-indigo-700/80 mb-3 max-w-3xl">
                      The system identified participants who raised <strong>unique concepts</strong> (high isolation) that were <strong>not included</strong> in the final summary (low representation).
                    </p>

                    <div className="grid grid-cols-1 gap-3">
                      {data.bridgingOpportunities.map((op, i) => (
                        <div key={i} className="bg-white/90 p-3 rounded border border-indigo-100 shadow-sm text-sm hover:bg-white transition-colors cursor-pointer flex flex-col gap-2" onClick={() => setSelectedParticipant(op.participantId)}>
                          <div className="flex justify-between text-xs text-indigo-400 uppercase font-bold tracking-wider">
                            <span>Participant {op.participantId}</span>
                            <span>Facilitation Prompt</span>
                          </div>
                          <div className="italic text-slate-700 font-medium">
                            {op.facilitationPrompt}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              </div>
            )}

            <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">

              {/* Left Column (Viz) */}
              <div className="xl:col-span-2 space-y-6">

                {activeTab === 'map' && (
                  <Card title="Semantic Space" subtitle="Spatial arrangement of contributions. Outliers indicate distinct perspectives." className="border-t-4 border-t-blue-500" expandable>
                    <SemanticMap
                      data={data.participants}
                      clusters={data.clusters}
                      selectedId={selectedParticipant}
                      onSelect={setSelectedParticipant}
                    />
                  </Card>
                )}


                {activeTab === 'blindspot' && (
                  <Card title="Blind Spot Analysis" subtitle="Identifying excluded voices by comparing Centrality vs. Representation." className="border-t-4 border-t-red-500" expandable>
                    <BlindSpotPlot data={data.participants} onSelect={setSelectedParticipant} />
                  </Card>
                )}

                {activeTab === 'similarity' && data.networkGraph && (
                  <Card title="Participant Similarity Network" subtitle="Mutual k-NN graph — edges connect participants whose embeddings are mutually among each other's top-k nearest neighbors." className="border-t-4 border-t-violet-500" expandable>
                    <div style={{ height: 600 }}>
                      <SimilarityNetwork
                        networkGraph={data.networkGraph}
                        clusters={data.clusters}
                        onSelect={setSelectedParticipant}
                        selectedId={selectedParticipant}
                      />
                    </div>
                  </Card>
                )}

                {activeTab === 'flow' && (
                  <Card title="Contribution Lineage" subtitle="Traceability from raw input to summary sentences. Thicker lines indicate stronger semantic influence." className="border-t-4 border-t-blue-500" expandable>
                    <ContributionLineage data={data.participants} sentences={data.summarySentences} />
                  </Card>
                )}

                {activeTab === 'concepts' && (
                  data.conceptAnalysis ? (
                    <Card title="Concept Fidelity Analysis" subtitle="Lexical preservation: Which key concepts survived the summarization?" className="border-t-4 border-t-emerald-500" expandable>
                      <ConceptDistortion data={data.conceptAnalysis} />
                    </Card>
                  ) : (
                    <Card title="Concept Fidelity Analysis" subtitle="Lexical preservation: Which key concepts survived the summarization?" className="border-t-4 border-t-emerald-500">
                      <div className="flex items-center justify-center gap-2 text-sm text-slate-500 py-12">
                        <svg className="animate-spin h-4 w-4 text-indigo-500 flex-shrink-0" fill="none" viewBox="0 0 24 24">
                          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
                        </svg>
                        Running concept fidelity analysis in background…
                      </div>
                    </Card>
                  )
                )}

                {activeTab === 'stats' && (
                  <Card title="Equity Distribution Plot" subtitle="Sorted representation scores. A flat line indicates equal semantic coverage." className="border-t-4 border-t-blue-500" expandable>
                    <RepresentationBar data={data.participants} />
                  </Card>
                )}

                {activeTab === 'sensitivity' && (
                  <Card title="Semantic Leverage (LOO)" subtitle="Which inputs pull the conversation's semantic center the most?" className="border-t-4 border-t-rose-500" expandable>
                    {data.sensitivityAnalysis && data.sensitivityAnalysis.length > 0 ? (
                      <SensitivityChart data={data.sensitivityAnalysis} />
                    ) : (
                      <div className="text-center py-10 text-slate-400">LOO Analysis was disabled in configuration.</div>
                    )}
                  </Card>
                )}

                {activeTab === 'groups' && data.groupAnalysis && (
                  <Card title="Stakeholder Group Equity" subtitle="Comparing representation across different stakeholder groups." className="border-t-4 border-t-indigo-500" expandable>
                    <GroupEquityChart data={data.groupAnalysis} />
                  </Card>
                )}

                {activeTab === 'uncertainty' && data.uncertaintyMetrics && (
                  <Card title="Uncertainty Analysis" subtitle="Bootstrap confidence intervals for key metrics (95% CI)." className="border-t-4 border-t-purple-500" expandable>
                    <UncertaintyViz data={data.uncertaintyMetrics} />
                    {data.thresholdSensitivity && (
                      <div className="mt-4 border-t pt-4">
                        <div className="text-sm font-semibold text-slate-700 mb-2">Threshold Sensitivity</div>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                          <div className="bg-slate-50 rounded-lg p-3">
                            <div className="text-[10px] text-slate-500 uppercase font-bold mb-1">Representation Threshold Impact</div>
                            <ThresholdSensitivityMini
                              data={data.thresholdSensitivity}
                              currentThreshold={0.6}
                              thresholdType="representation"
                            />
                            <ThresholdImpactBadges
                              thresholds={{ representationTarget: 0.6, matchingThreshold: 0.45 }}
                              representationScores={data.participants.map(p => p.representationScore)}
                            />
                          </div>
                          <div className="bg-slate-50 rounded-lg p-3">
                            <div className="text-[10px] text-slate-500 uppercase font-bold mb-1">Isolation Threshold Impact</div>
                            <ThresholdSensitivityMini
                              data={data.thresholdSensitivity}
                              currentThreshold={0.5}
                              thresholdType="isolation"
                            />
                          </div>
                        </div>
                      </div>
                    )}
                  </Card>
                )}

                {activeTab === 'strategies' && data.strategyComparison && (
                  <StrategyComparison
                    comparisons={data.strategyComparison}
                    currentStrategy={data.config.strategy}
                  />
                )}

                {activeTab === 'provenance' && (
                  <Card title="Citation Provenance Trail" subtitle="For each summary sentence, which participant voices shaped it — and which were silent." className="border-t-4 border-t-indigo-500" expandable>
                    <ProvenanceTrail data={data} onSelectParticipant={setSelectedParticipant} />
                  </Card>
                )}

                <Card title="Summary" subtitle={`Model: ${data.config.model} | Method: ${data.config.summaryMethod}`} className="bg-white border border-slate-200 shadow-sm">
                  <div className="prose prose-slate max-w-none p-2">
                    <p className="text-lg leading-relaxed text-slate-700">{data.summary}</p>
                  </div>
                </Card>
              </div>

              {/* Right Column (Details) */}
              <div className="space-y-6">
                <Card title="Details Panel" className="h-[650px] flex flex-col sticky top-6" flexContent={true}>

                  {/* Jump To Selector */}
                  <div className="mb-4 pb-4 border-b border-slate-100">
                    <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1 block">Jump to Participant</label>
                    <select
                      className="w-full text-sm p-2 border border-slate-300 rounded bg-slate-50 focus:ring-2 focus:ring-blue-500 outline-none text-slate-700"
                      value={selectedParticipant || ''}
                      onChange={(e) => setSelectedParticipant(e.target.value || null)}
                    >
                      <option value="">-- Select Participant --</option>
                      {[...data.participants]
                        .sort((a, b) => parseInt(a.id.replace(/[^0-9]/g, '')) - parseInt(b.id.replace(/[^0-9]/g, '')))
                        .map(p => (
                          <option key={p.id} value={p.id}>
                            {p.id} (Rep: {p.representationScore.toFixed(2)})
                          </option>
                        ))}
                    </select>
                  </div>

                  {selectedParticipant ? (
                    <div className="animate-fadeIn flex-1 flex flex-col min-h-0 overflow-hidden">
                      {(() => {
                        const p = data.participants.find(p => p.id === selectedParticipant);
                        const sens = data.sensitivityAnalysis?.find(s => s.participantId === selectedParticipant);

                        if (!p) return null;

                        return (
                          <>
                            <div className="flex items-center justify-between mb-3 flex-shrink-0">
                              <span className="font-bold text-xl text-slate-800">{p.id}</span>
                              <span className="px-2 py-1 rounded-full text-xs font-bold bg-blue-100 text-blue-700 border border-blue-200">
                                Cluster {p.clusterId + 1}
                              </span>
                            </div>

                            <div className="flex-1 overflow-y-auto pr-2" style={{ scrollbarWidth: 'thin' }}>
                              <div className="p-4 bg-slate-50 rounded-lg border border-slate-200 text-slate-700 italic text-sm leading-relaxed mb-4 shadow-inner">
                                "{p.originalText}"
                              </div>

                              {/* Key Concepts */}
                              {p.keywords && p.keywords.length > 0 && (
                                <div className="mb-4 p-3 bg-slate-50 border border-slate-200 rounded-lg">
                                  <div className="text-[10px] font-bold text-slate-500 uppercase mb-1">Key Concepts</div>
                                  <div className="flex flex-wrap gap-1">
                                    {p.keywords.slice(0, 5).map(k => (
                                      <span key={k} className="px-1.5 py-0.5 bg-slate-100 text-slate-700 text-xs rounded border border-slate-200">{k}</span>
                                    ))}
                                  </div>
                                </div>
                              )}

                              <div className="space-y-2">
                                <div className="flex justify-between items-center p-2.5 bg-white border border-slate-100 rounded shadow-sm">
                                  <div className="flex items-center gap-1">
                                    <span className="text-[11px] font-semibold text-slate-500 uppercase">Representation</span>
                                    <InfoIcon metricKey="representation" />
                                  </div>
                                  <span className={`font-bold text-sm ${p.representationScore > 0.6 ? 'text-green-600' : 'text-orange-500'}`}>{p.representationScore.toFixed(2)}</span>
                                </div>
                                <div className="flex justify-between items-center p-2.5 bg-white border border-slate-100 rounded shadow-sm">
                                  <div className="flex items-center gap-1">
                                    <span className="text-[11px] font-semibold text-slate-500 uppercase">Isolation</span>
                                    <InfoIcon metricKey="isolation" />
                                  </div>
                                  <span className={`font-bold text-sm ${p.semanticIsolation > 0.5 ? 'text-purple-600' : 'text-slate-600'}`}>
                                    {p.semanticIsolation.toFixed(2)}
                                  </span>
                                </div>
                                <div className="flex justify-between items-center p-2.5 bg-white border border-slate-100 rounded shadow-sm">
                                  <div className="flex items-center gap-1">
                                    <span className="text-[11px] font-semibold text-slate-500 uppercase">Leverage</span>
                                    <InfoIcon metricKey="leverage" />
                                  </div>
                                  <span className="font-bold text-sm text-slate-700">{sens ? sens.shiftScore.toFixed(2) : 'N/A'}</span>
                                </div>
                                <div className="flex justify-between items-center p-2.5 bg-white border border-slate-100 rounded shadow-sm">
                                  <span className="text-[11px] font-semibold text-slate-500 uppercase">Sentiment</span>
                                  <span className={`font-bold text-sm capitalize ${p.sentiment === 'positive' ? 'text-green-600' : p.sentiment === 'negative' ? 'text-red-500' : 'text-slate-500'}`}>{p.sentiment}</span>
                                </div>
                                {p.embeddingTier && (
                                  <div className="flex justify-between items-center p-2.5 bg-white border border-slate-100 rounded shadow-sm">
                                    <span className="text-[11px] font-semibold text-slate-500 uppercase">Embedding Tier</span>
                                    <span className="font-bold text-sm text-blue-600 font-mono">{p.embeddingTier}</span>
                                  </div>
                                )}
                                {p.detectedLanguage && p.detectedLanguage !== 'un' && (
                                  <div className="flex justify-between items-center p-2.5 bg-white border border-slate-100 rounded shadow-sm">
                                    <span className="text-[11px] font-semibold text-slate-500 uppercase">Language</span>
                                    <span className="font-bold text-sm text-indigo-600 font-mono">{p.detectedLanguage.toUpperCase()}</span>
                                  </div>
                                )}
                              </div>

                              <div className="mt-4">
                                <div className="text-xs font-bold text-slate-400 uppercase mb-2">Primary Summary Link</div>
                                <div className="text-xs text-slate-600 bg-amber-50 p-3 rounded border border-amber-100">
                                  "{data.summarySentences[p.topSentenceMatchIndex]}"
                                </div>
                              </div>

                              {/* Bias Source Attribution — why is this participant underrepresented? */}
                              {p.representationScore < 0.6 && (
                                <div className="mt-4">
                                  <BiasAttributionBadge
                                    participant={p}
                                    allParticipants={data.participants}
                                    summary={data.summary}
                                    summarySentences={data.summarySentences}
                                  />
                                </div>
                              )}

                              {/* Feedback Panel */}
                              <div className="mt-4 pb-2">
                                <FeedbackPanel
                                  participantId={p.id}
                                  currentFeedback={feedbacks.get(p.id)}
                                  onSubmit={handleFeedbackSubmit}
                                />
                              </div>
                            </div>

                            <div className="flex-shrink-0 pt-3 border-t border-slate-100">
                              <div className="grid grid-cols-2 gap-2 mb-2">
                                <button onClick={handlePrevParticipant} className="py-2 text-xs font-medium text-slate-600 border border-slate-200 rounded hover:bg-slate-50">← Previous</button>
                                <button onClick={handleNextParticipant} className="py-2 text-xs font-medium text-slate-600 border border-slate-200 rounded hover:bg-slate-50">Next →</button>
                              </div>
                              <button
                                onClick={() => setSelectedParticipant(null)}
                                className="w-full py-2 text-sm text-blue-600 hover:text-blue-800 border border-blue-200 bg-blue-50 rounded hover:bg-blue-100 transition-colors font-semibold"
                              >
                                Show List
                              </button>
                            </div>
                          </>
                        );
                      })()}
                    </div>
                  ) : (
                    <div className="flex-1 flex flex-col min-h-0 overflow-hidden">
                      <div className="flex-shrink-0 mb-3">
                        <div className="text-sm font-bold text-slate-700 mb-1">All Participants</div>
                        <div className="text-xs text-slate-500 mb-2">Sorted by representation score (low to high)</div>
                        {feedbacks.size > 0 && (
                          <FeedbackSummary
                            feedbacks={feedbacks}
                            totalParticipants={data.participants.length}
                          />
                        )}
                        {feedbacks.size >= 3 && (
                          <div className="mt-3">
                            <FeedbackAnalytics
                              feedbacks={feedbacks}
                              participants={data.participants}
                              totalParticipants={data.participants.length}
                              onImportResponses={handleImportParticipantResponses}
                            />
                          </div>
                        )}
                      </div>
                      <div className="flex-1 overflow-y-auto pr-2" style={{ scrollbarWidth: 'thin' }}>
                        {[...data.participants]
                          .sort((a, b) => a.representationScore - b.representationScore)
                          .map(p => (
                            <div
                              key={p.id}
                              onClick={() => setSelectedParticipant(p.id)}
                              className="group p-3 mb-2 bg-white border border-slate-100 rounded-lg cursor-pointer hover:border-blue-400 hover:shadow-sm transition-all"
                            >
                              <div className="flex items-center gap-3 mb-1">
                                <div className={`w-2 h-6 rounded-full flex-shrink-0 ${p.representationScore < 0.4 ? 'bg-red-400' : p.representationScore < 0.7 ? 'bg-orange-400' : 'bg-green-400'}`}></div>
                                <div className="font-semibold text-sm text-slate-700 group-hover:text-blue-600 flex-1">{p.id}</div>
                                {p.detectedLanguage && p.detectedLanguage !== 'en' && p.detectedLanguage !== 'un' && (
                                  <span className="text-[9px] bg-indigo-100 text-indigo-600 px-1 rounded font-mono flex-shrink-0">
                                    {p.detectedLanguage.toUpperCase()}
                                  </span>
                                )}
                                <div className="text-xs font-mono font-bold text-slate-500 flex-shrink-0">
                                  {p.representationScore.toFixed(2)}
                                </div>
                              </div>
                              <div className="text-xs text-slate-400 line-clamp-2 pl-5">"{p.originalText}"</div>
                            </div>
                          ))}
                      </div>
                    </div>
                  )}
                </Card>
              </div>

            </div>
          </div>
        )}
      </main>

      {/* Phase 2 enrichment status bar — shown while concept fidelity runs in background */}
      {isEnriching && (
        <div className="fixed bottom-0 left-0 right-0 bg-indigo-50 border-t border-indigo-200 px-4 py-1.5 text-xs text-indigo-700 flex items-center gap-2 z-40">
          <svg className="animate-spin h-3 w-3 flex-shrink-0" fill="none" viewBox="0 0 24 24">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
          </svg>
          <span>{enrichProgressMsg || 'Running concept fidelity analysis in background…'}</span>
        </div>
      )}
    </div>
  );
}
