import React, { useState, useEffect, useRef, useCallback } from 'react';
import { AnalysisResult, ParticipantInput, AnalysisConfig, QuestionAnalysis, ColumnInfo, ColumnSelection, SummaryOrigin } from './types';
import { runAnalysis, runCoreAnalysis, enrichAnalysisResult } from './services/analysis';
import { Card } from './components/ui/Card';
import { ConfigPanel } from './components/ui/ConfigPanel';
import { ProcessingState } from './components/ui/ProcessingState';
import { InfoIcon } from './components/ui/MetricGlossary';
import { ThresholdSensitivityMini, ThresholdImpactBadges } from './components/visualizations/ThresholdSensitivityMini';
import { FeedbackPanel, FeedbackSummary } from './components/ui/FeedbackPanel';
import { ExecutiveSummary } from './components/ui/ExecutiveSummary';
import { MissedPerspectives } from './components/ui/MissedPerspectives';
import { StrategyComparison } from './components/ui/StrategyComparison';
import { downloadReport } from './services/reportExport';
import { downloadProvenanceRecord } from './services/provenanceExport';
import { downloadVerificationPage } from './services/participantVerification';
import { BeforeAfterComparison } from './components/ui/BeforeAfterComparison';
import { FeedbackAnalytics } from './components/ui/FeedbackAnalytics';
import { FacilitationCoPilotPanel } from './components/ui/FacilitationCoPilotPanel';
import { CausalAttributionPanel } from './components/ui/CausalAttributionPanel';
import {
  runCausalAttribution, estimateAttributionCost, BUDGET_PRESETS, CLUSTER_LEVEL_THRESHOLD,
  type CausalAttributionResult, type BudgetPreset,
} from './services/causalAttribution';
// WhatIfSimulator removed — hypothetical feature
import { ProvenanceTrail } from './components/ui/ProvenanceTrail';
import { ParticipantFeedback, FacilitationGapBrief, SummarizationStrategy } from './types';
import { preprocessWithSelections, PreprocessResult } from './services/dataPreprocessor';
import { OnboardingOverlay } from './components/ui/OnboardingOverlay';
import { ANALYSIS_CONFIG, getRepresentationBands } from './constants';
import {
  selectRevisionCandidates,
  type RevisionTargetMode,
} from './services/revisionTargeting';

// The dashboard contains many mutually exclusive visualization tabs. Loading
// them on demand keeps charting and force-graph code out of the initial app
// entry while preserving the same named-export component APIs.
const SemanticMap = React.lazy(() => import('./components/visualizations/SemanticMap').then(m => ({ default: m.SemanticMap })));
const RepresentationBar = React.lazy(() => import('./components/visualizations/RepresentationBar').then(m => ({ default: m.RepresentationBar })));
const ContributionLineage = React.lazy(() => import('./components/visualizations/RepresentationFlow').then(m => ({ default: m.ContributionLineage })));
const BlindSpotPlot = React.lazy(() => import('./components/visualizations/BlindSpotPlot').then(m => ({ default: m.BlindSpotPlot })));
const SimilarityNetwork = React.lazy(() => import('./components/visualizations/SimilarityNetwork').then(m => ({ default: m.SimilarityNetwork })));
const LanguageFidelityViz = React.lazy(() => import('./components/visualizations/LanguageFidelityViz').then(m => ({ default: m.LanguageFidelityViz })));
const RhetoricalInfluenceViz = React.lazy(() => import('./components/visualizations/RhetoricalInfluenceViz').then(m => ({ default: m.RhetoricalInfluenceViz })));
const ClaimAttributionViz = React.lazy(() => import('./components/visualizations/ClaimAttributionViz').then(m => ({ default: m.ClaimAttributionViz })));
const TensionNetworkViz = React.lazy(() => import('./components/visualizations/TensionNetworkViz').then(m => ({ default: m.TensionNetworkViz })));
const ProvenanceSankeyViz = React.lazy(() => import('./components/visualizations/ProvenanceSankeyViz').then(m => ({ default: m.ProvenanceSankeyViz })));
const KnowledgeGraphViz = React.lazy(() => import('./components/visualizations/KnowledgeGraphViz').then(m => ({ default: m.KnowledgeGraphViz })));
const SensitivityChart = React.lazy(() => import('./components/visualizations/SensitivityChart').then(m => ({ default: m.SensitivityChart })));
const GroupEquityChart = React.lazy(() => import('./components/visualizations/GroupEquityChart').then(m => ({ default: m.GroupEquityChart })));
const UncertaintyViz = React.lazy(() => import('./components/visualizations/UncertaintyViz').then(m => ({ default: m.UncertaintyViz })));

// Error boundary — prevents one crashing visualization from white-screening the entire app
class VizErrorBoundary extends React.Component<{ children: React.ReactNode; tabName?: string }, { hasError: boolean; error?: Error }> {
  constructor(props: { children: React.ReactNode; tabName?: string }) {
    super(props);
    this.state = { hasError: false };
  }
  static getDerivedStateFromError(error: Error) {
    return { hasError: true, error };
  }
  componentDidCatch(error: Error, info: React.ErrorInfo) {
    console.error(`[VizErrorBoundary] ${this.props.tabName || 'Unknown'} crashed:`, error, info);
  }
  render() {
    if (this.state.hasError) {
      return (
        <div className="p-8 text-center text-slate-500">
          <div className="text-lg font-semibold text-red-600 mb-2">Visualization Error</div>
          <div className="text-sm mb-4">The {this.props.tabName || 'visualization'} encountered an error and could not render.</div>
          <div className="text-xs text-slate-400 bg-slate-50 p-3 rounded font-mono">{this.state.error?.message}</div>
          <button className="mt-4 px-4 py-2 bg-blue-600 text-white rounded-lg text-sm hover:bg-blue-700" onClick={() => this.setState({ hasError: false })}>
            Retry
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}

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
  Graph: () => <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="5" cy="6" r="2" /><circle cx="19" cy="6" r="2" /><circle cx="12" cy="18" r="2" /><line x1="6.7" y1="7.5" x2="10.8" y2="16.2" /><line x1="17.3" y1="7.5" x2="13.2" y2="16.2" /><line x1="7" y1="6" x2="17" y2="6" /></svg>
};

type ViewState = 'setup' | 'processing' | 'dashboard' | 'error';
/**
 * Sidebar navigation grouped into macro-workspaces.
 *
 * The flat list of 16 analyses required the user to already know which view
 * answers their question. Grouping by *decision* — what does the summary look
 * like, who is in the discussion, where did contributions go, how were they
 * transformed — lets a facilitator drill in progressively instead of scanning
 * every option. Only the workspace containing the active tab is expanded.
 *
 * `visible` and `pending` keep the previous conditional behaviour: views whose
 * data has not been produced stay hidden, and views awaiting Phase 2 enrichment
 * keep their pulsing indicator.
 */
interface NavItem {
  id: TabState;
  label: string;
  icon: keyof typeof Icons | 'citation';
  visible?: (data: AnalysisResult | null) => boolean;
  pending?: (data: AnalysisResult | null, isEnriching: boolean) => boolean;
}

interface Workspace {
  id: string;
  label: string;
  hint: string;
  items: NavItem[];
}

const WORKSPACES: Workspace[] = [
  {
    id: 'triage',
    label: 'Overview & Triage',
    hint: 'Start here: how even is representation overall?',
    items: [
      { id: 'stats', label: 'Inclusion Metrics', icon: 'Bar' },
      { id: 'blindspot', label: 'Alignment Quadrants', icon: 'Eye' },
      { id: 'uncertainty', label: 'Uncertainty', icon: 'Activity' },
      { id: 'groups', label: 'Group Comparison', icon: 'Users', visible: d => !!d?.groupAnalysis },
    ],
  },
  {
    id: 'spaces',
    label: 'Participant & Topic Spaces',
    hint: 'Who is in the discussion, and who sits apart?',
    items: [
      { id: 'map', label: 'Discussion Map', icon: 'Map' },
      { id: 'similarity', label: 'Similarity Network', icon: 'Graph' },
      { id: 'knowledge', label: 'Knowledge Graph', icon: 'Network',
        pending: (d, e) => e && !d?.knowledgeGraph },
    ],
  },
  {
    id: 'trace',
    label: 'Associations & Evidence',
    hint: 'What automated evidence links sources and summary text?',
    items: [
      { id: 'flow', label: 'Contribution Matches', icon: 'Flow' },
      { id: 'sankey', label: 'Association Map', icon: 'Layers', pending: (_d, e) => e },
      { id: 'claims', label: 'Claim Evidence', icon: 'CheckSquare', pending: (_d, e) => e },
      { id: 'provenance', label: 'Sentence–Source Similarity', icon: 'citation' },
    ],
  },
  {
    id: 'audit',
    label: 'Discourse & Counterfactual Audit',
    hint: 'How was language transformed, and whose input mattered?',
    items: [
      { id: 'fidelity', label: 'Source-unit Transformation', icon: 'Flow', pending: (_d, e) => e },
      { id: 'tensions', label: 'Tension Mapping', icon: 'Network', pending: (_d, e) => e },
      { id: 'rhetoric', label: 'Rhetoric–Alignment Association', icon: 'User' },
      { id: 'sensitivity', label: 'Sensitivity (LOO)', icon: 'Zap' },
      { id: 'strategies', label: 'Compare Strategies', icon: 'Layers',
        visible: d => !!d?.strategyComparison && d.strategyComparison.length > 0 },
    ],
  },
];

/** Which workspace owns a given tab (used to auto-expand on tab change). */
const workspaceForTab = (tab: TabState): string =>
  WORKSPACES.find(w => w.items.some(it => it.id === tab))?.id ?? WORKSPACES[0].id;

type TabState = 'map' | 'blindspot' | 'flow' | 'sankey' | 'stats' | 'sensitivity' | 'groups' | 'uncertainty' | 'strategies' | 'provenance' | 'similarity' | 'fidelity' | 'claims' | 'tensions' | 'rhetoric' | 'knowledge';

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
  const [revisionOrigin, setRevisionOrigin] = useState<SummaryOrigin>('human-authored');
  const [revisionTargetMode, setRevisionTargetMode] = useState<RevisionTargetMode>('below-threshold');
  const [revisionThreshold, setRevisionThreshold] = useState(ANALYSIS_CONFIG.thresholds.matchingThreshold);
  const [revisionMaxCandidates, setRevisionMaxCandidates] = useState(8);
  const [revisionInstruction, setRevisionInstruction] = useState('');
  const [revisionError, setRevisionError] = useState<string | null>(null);
  const [revisionTargetingNote, setRevisionTargetingNote] = useState<string | null>(null);
  const [isGeneratingDraft, setIsGeneratingDraft] = useState(false);
  const [isApplyingRevision, setIsApplyingRevision] = useState(false);
  // Feature #1: Facilitation Co-Pilot
  const [facilitationPlan, setFacilitationPlan] = useState<FacilitationGapBrief | null>(null);
  const [isGeneratingPlan, setIsGeneratingPlan] = useState(false);
  const [showFacilitationPanel, setShowFacilitationPanel] = useState(false);

  // Stochastic counterfactual utility attribution — opt-in due to cost.
  // Only the workspace containing the active tab starts expanded.
  const [expandedWorkspaces, setExpandedWorkspaces] = useState<Set<string>>(
    () => new Set([workspaceForTab('map')])
  );
  const toggleWorkspace = useCallback((id: string) => {
    setExpandedWorkspaces(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  }, []);
  const [missedCollapsed, setMissedCollapsed] = useState(false);
  const [showCausalPanel, setShowCausalPanel] = useState(false);
  const [causalPreset, setCausalPreset] = useState<BudgetPreset>('standard');
  const [causalResult, setCausalResult] = useState<CausalAttributionResult | null>(null);
  const [isRunningCausal, setIsRunningCausal] = useState(false);
  const [causalProgress, setCausalProgress] = useState('');
  const [causalError, setCausalError] = useState<string | null>(null);
  const causalAbortRef = useRef<AbortController | null>(null);
  // Phase 2 enrichment state (language fidelity runs in background after dashboard renders)
  const [isEnriching, setIsEnriching] = useState(false);
  const [enrichProgressMsg, setEnrichProgressMsg] = useState('');
  const enrichmentAbortRef = useRef<AbortController | null>(null);
  const [enrichmentNoticeDismissed, setEnrichmentNoticeDismissed] = useState(false);
  const analysisGenRef = useRef(0); // incremented on each new analysis; guards stale Phase 2 updates
  // Mobile sidebar
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const closeSidebar = useCallback(() => setSidebarOpen(false), []);

  const revisionSelection = data
    ? selectRevisionCandidates(data.participants, {
        mode: revisionTargetMode,
        threshold: revisionThreshold,
        maxCandidates: revisionMaxCandidates,
        instruction: revisionInstruction,
      })
    : null;

  useEffect(() => () => {
    enrichmentAbortRef.current?.abort();
    causalAbortRef.current?.abort();
  }, []);

  // Load pre-computed demo data on startup (if available)
  useEffect(() => {
    fetch(`${import.meta.env.BASE_URL}demo-result.json`)
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
    setRevisionOrigin('human-authored');
    setRevisionTargetMode('below-threshold');
    setRevisionThreshold(data.config.thresholds?.matchingThreshold ?? ANALYSIS_CONFIG.thresholds.matchingThreshold);
    setRevisionMaxCandidates(8);
    setRevisionInstruction('');
    setRevisionError(null);
    setRevisionTargetingNote(null);
    setShowRevisionEditor(true);
  };

  /** Ask AI to generate a draft revision (fills the editor textarea). */
  const handleGenerateAIDraft = async () => {
    if (!data) return;
    setIsGeneratingDraft(true);
    setRevisionError(null);
    try {
      const { generateRevisedSummary } = await import('./services/summaryRevision');
      const draft = await generateRevisedSummary(data, data.config, {
        mode: revisionTargetMode,
        threshold: revisionThreshold,
        maxCandidates: revisionMaxCandidates,
        instruction: revisionInstruction,
      });
      setRevisionDraft(draft.text);
      setRevisionOrigin('ai-assisted');
      setRevisionTargetingNote(draft.targetingNote);
    } catch (e: any) {
      console.error('AI draft failed:', e);
      setRevisionError(e?.message || 'AI draft generation failed.');
    } finally {
      setIsGeneratingDraft(false);
    }
  };

  /** Apply the current editor content and recompute scores for comparison. */
  const handleApplyRevision = async () => {
    if (!data || !revisionDraft.trim()) return;
    setIsApplyingRevision(true);
    try {
      const { recomputeWithNewSummary } = await import('./services/summaryRevision');
      const revised = await recomputeWithNewSummary(
        data,
        revisionDraft.trim(),
        data.config,
        setProgressMsg,
        revisionOrigin,
        revisionOrigin === 'ai-assisted' || revisionOrigin === 'mixed'
          ? revisionTargetingNote ?? undefined
          : undefined,
      );
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

  /**
   * Runs counterfactual Shapley attribution. Regenerates the summary with
   * contributions withheld, so it requires an AI provider and real model calls.
   * Cost is disclosed in the panel before the user starts.
   */
  const handleRunCausalAttribution = useCallback(async () => {
    if (!data) return;
    const inputs = data.participants.map(p => ({ id: p.id, text: p.originalText, group: p.group }));
    if (inputs.length > CLUSTER_LEVEL_THRESHOLD && data.clusteringDiagnostics?.usableForDownstream !== true) {
      setCausalResult(null);
      setCausalProgress('');
      setCausalError(
        `Cluster-level utility attribution is unavailable: ${data.clusteringDiagnostics?.reason || 'this run has no validated semantic partition.'}`,
      );
      return;
    }
    setIsRunningCausal(true);
    setCausalError(null);
    setCausalProgress('Preparing…');
    const controller = new AbortController();
    causalAbortRef.current = controller;
    try {
      const spec = BUDGET_PRESETS.find(p => p.id === causalPreset);
      const res = await runCausalAttribution(inputs, data.config, {
        exact: causalPreset === 'exact',
        samples: spec?.samples ?? 30,
        // Ceiling scales with the chosen budget instead of a fixed 200, which
        // silently truncated the Thorough preset.
        maxEvaluations: causalPreset === 'exact' ? undefined : (spec?.samples ?? 30) * 14,
        // Cluster-level attribution keeps cost tractable on larger consultations.
        // Cluster-level attribution above CLUSTER_LEVEL_THRESHOLD contributions.
        // Measured on a game with differentiated themes: cluster-level reached
        // rank stability 0.90-1.00 at 10-20 permutations using ~30 evaluations,
        // while individual-level attribution never converged even at 270
        // evaluations. Individual phi is only reportable for small groups.
        clusterAssignments: inputs.length > CLUSTER_LEVEL_THRESHOLD && data.clusteringDiagnostics?.usableForDownstream === true
          ? data.participants.map(p => p.clusterId)
          : undefined,
        signal: controller.signal,
        onProgress: (msg) => setCausalProgress(msg),
      });
      setCausalResult(res);
      setCausalProgress('');
    } catch (e: any) {
      if (e?.name === 'AbortError') setCausalError('Attribution cancelled.');
      else setCausalError(e?.message || 'Counterfactual utility attribution failed.');
    } finally {
      setIsRunningCausal(false);
      causalAbortRef.current = null;
    }
  }, [data, causalPreset]);

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
    const gen = ++analysisGenRef.current;
    causalAbortRef.current?.abort();
    enrichmentAbortRef.current?.abort();
    enrichmentAbortRef.current = null;
    setViewState('processing');
    setErrorMsg('');
    setData(null);
    setQuestionResults(null);
    setActiveQuestion(0);
    setSelectedParticipant(null);
    setFeedbacks(new Map());
    setRevisedData(null);
    setShowRevisionEditor(false);
    setRevisionDraft('');
    setFacilitationPlan(null);
    setShowFacilitationPanel(false);
    setCausalResult(null);
    setCausalError(null);
    setShowCausalPanel(false);
    setIsRunningCausal(false);
    setIsEnriching(false);
    setEnrichProgressMsg('');
    setEnrichmentNoticeDismissed(false);
    setIsDemo(false);

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

          if (gen !== analysisGenRef.current) return;

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
        // Renders the dashboard immediately without waiting for language fidelity.
        const coreResult = await runCoreAnalysis(inputs, config, (msg) => setProgressMsg(msg));

        if (gen !== analysisGenRef.current) return; // a newer analysis was started — discard

        setData(coreResult);
        setViewState('dashboard');
        setIsEnriching(true);
        setEnrichProgressMsg('');
        const enrichmentController = new AbortController();
        enrichmentAbortRef.current = enrichmentController;

        // Phase 2 runs in the background. The shared abort signal reaches every
        // provider completion so cancellation releases local/cloud resources,
        // rather than merely suppressing stale React state updates.
        enrichAnalysisResult(coreResult, inputs, config, (msg) => {
          if (gen !== analysisGenRef.current) return;
          setEnrichProgressMsg(msg);
        }, enrichmentController.signal).then(enriched => {
          if (gen !== analysisGenRef.current) return;
          setData(enriched);
          setIsEnriching(false);
          enrichmentAbortRef.current = null;
          if (enriched.enrichmentStatus === 'complete') {
            setEnrichProgressMsg('');
          } else if (enriched.enrichmentStatus === 'cancelled') {
            setEnrichProgressMsg('Deep analysis cancelled. Completed stages were retained; remaining stages are marked cancelled.');
          } else {
            const failed = Object.entries(enriched.enrichmentStages ?? {})
              .filter(([, stage]) => stage?.status === 'failed')
              .map(([name]) => name)
              .join(', ');
            setEnrichProgressMsg(`Deep analysis finished with unavailable stages${failed ? `: ${failed}` : ''}. Core and completed results were retained.`);
          }
        }).catch((error) => {
          if (gen !== analysisGenRef.current) return;
          console.error('[Enrichment] Unexpected orchestration failure:', error);
          setIsEnriching(false);
          enrichmentAbortRef.current = null;
          setData(current => current ? { ...current, enrichmentStatus: 'failed' } : current);
          setEnrichProgressMsg('Deep analysis failed unexpectedly. Core results remain available.');
        });
        return; // Phase 2 runs asynchronously — nothing more to do in startAnalysis
      }
    } catch (e: any) {
      if (gen !== analysisGenRef.current) return;
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

  const MetricsBanner = ({ metrics, participants, uncertaintyMetrics, embeddingTier }: { metrics: any, participants: any[], uncertaintyMetrics?: any, embeddingTier?: string }) => {
    const validParticipants = participants.filter((participant: any) => !participant.embeddingFailed && !participant.alignmentUnavailableReason);
    const avgScore = validParticipants.reduce((acc: number, p: any) => acc + p.representationScore, 0) / Math.max(1, validParticipants.length);
    const bands = getRepresentationBands(embeddingTier);
    const atRiskCount = validParticipants.filter((p: any) => p.representationScore < bands.atRisk).length;

    // Format CI if available
    const formatCI = (ci: { lower: number; upper: number } | undefined) => {
      if (!ci) return null;
      return `[${ci.lower.toFixed(2)}, ${ci.upper.toFixed(2)}]`;
    };

    return (
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        <Card className="border-l-4 border-l-blue-500 hover:shadow-md transition-shadow metric-card" allowOverflow={true}>
          <div className="text-slate-500 text-xs uppercase font-bold tracking-wider flex items-center">
            Avg Representation <InfoIcon metricKey="representation" />
          </div>
          <div className="text-2xl font-bold mt-1 text-blue-700">
            {avgScore.toFixed(2)}
          </div>
          <div className="text-xs mt-1 flex items-center gap-1 flex-wrap">
            <span className="px-1 rounded bg-blue-50 text-blue-700">
              Provisional reference: {'>'}{bands.target}
            </span>
            {uncertaintyMetrics?.avgRepresentationCI && (
              <span className="text-slate-400 text-[10px]">
                resampling range: {formatCI(uncertaintyMetrics.avgRepresentationCI)}
              </span>
            )}
          </div>
        </Card>
        <Card className="border-l-4 border-l-purple-500 hover:shadow-md transition-shadow metric-card" allowOverflow={true}>
          <div className="text-slate-500 text-xs uppercase font-bold tracking-wider flex items-center">
            Gini Coefficient <InfoIcon metricKey="gini" />
          </div>
          <div className="text-2xl font-bold mt-1 text-purple-700">
            {metrics.giniCoefficient.toFixed(3)}
          </div>
          <div className="text-xs text-slate-500 mt-1 flex items-center gap-1 flex-wrap">
            <span>Descriptive spread of valid alignment scores</span>
          </div>
        </Card>
        <Card className="border-l-4 border-l-amber-500 hover:shadow-md transition-shadow metric-card" allowOverflow={true}>
          <div className="text-slate-500 text-xs uppercase font-bold tracking-wider flex items-center">
            Distinct-record Gap <InfoIcon metricKey="gap" />
          </div>
          <div className="text-2xl font-bold mt-1 text-amber-700">
            {metrics.distinctRepresentationGap.toFixed(2)}
          </div>
          <div className="text-xs text-slate-500 mt-1">
            Mean difference for the centroid-distant quartile
          </div>
        </Card>
        <Card className="border-l-4 border-l-teal-500 hover:shadow-md transition-shadow metric-card" allowOverflow={true}>
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
                {atRiskCount} below review marker <InfoIcon metricKey="atRisk" />
              </span>
            ) : (
              <span className="bg-slate-100 text-slate-700 px-1.5 rounded">None below marker</span>
            )}
            <span className="text-slate-400">Div: {metrics.inputDiversity.toFixed(2)}</span>
          </div>
        </Card>
      </div>
    );
  };

  if (viewState === 'setup') {
    return (
      <div className="min-h-screen setup-bg p-6 md:p-8 view-transition">
        <OnboardingOverlay />
        <div className="max-w-6xl mx-auto">
          <div className="text-center mb-8 animate-fadeIn">
            <div className="logo-glow inline-block mb-5">
              <img src={`${import.meta.env.BASE_URL}logo.png`} alt="Co-Creation Provenance Lab" className="h-20 w-20 mx-auto rounded-2xl animate-float" />
            </div>
            <h1 className="text-4xl font-extrabold text-slate-800 tracking-tight animate-fadeIn stagger-1">Co-Creation Provenance Lab</h1>
            <p className="text-lg text-slate-500 mt-3 max-w-2xl mx-auto animate-fadeIn stagger-2">Inspect execution provenance, semantic alignment, evidence gaps, and model-coded transformations in AI-assisted synthesis.</p>
          </div>
          <div className="animate-fadeIn stagger-3">
            <ConfigPanel onRun={startAnalysis} />
          </div>
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
      <div className="min-h-screen bg-slate-50 flex items-center justify-center p-8 view-transition">
        <div className="bg-white p-8 rounded-2xl shadow-xl max-w-lg w-full text-center border border-slate-200 animate-scaleIn">
          {isQuota ? (
            <>
              <div className="w-16 h-16 bg-amber-100 rounded-full flex items-center justify-center mx-auto mb-4 text-3xl">🚫</div>
              <h2 className="text-xl font-bold text-slate-800 mb-2">API Quota Exhausted</h2>
              <p className="text-slate-500 mb-5">{displayMsg}</p>
              <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 mb-6 text-left space-y-1.5">
                <p className="text-sm font-semibold text-amber-800 mb-2">What you can do:</p>
                <ul className="text-sm text-amber-700 space-y-1.5 list-disc list-inside">
                  <li>Switch to another verified provider or account with available quota</li>
                  <li>Switch to <strong>Local Ollama</strong> on a host you control</li>
                  <li>Wait and retry according to the provider account's current quota window</li>
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

  // Helper: set tab and close sidebar on mobile
  // Count shown on the collapsed "What was missed" header, using the same
  // tier-aware band as the underlying panel so the number cannot disagree.
  const missedCount = data
    ? data.participants.filter(p =>
        !p.embeddingFailed && !p.alignmentUnavailableReason &&
        p.representationScore < getRepresentationBands(data.embeddingTierUsed).low).length
    : 0;

  const switchTab = (tab: TabState) => {
    setActiveTab(tab);
    // Keep the owning workspace open. Several views switch tabs
    // programmatically (e.g. "View Details"), so the target must not land
    // inside a collapsed group where the user cannot see where they are.
    setExpandedWorkspaces(prev => {
      const owner = workspaceForTab(tab);
      if (prev.has(owner)) return prev;
      const next = new Set(prev);
      next.add(owner);
      return next;
    });
    closeSidebar();
  };

  return (
    <div className="min-h-screen flex flex-col md:flex-row bg-slate-50 view-transition">
      {/* Mobile hamburger button */}
      <button
        onClick={() => setSidebarOpen(!sidebarOpen)}
        className="md:hidden fixed top-3 left-3 z-30 bg-slate-900/90 backdrop-blur text-white p-2.5 rounded-xl shadow-lg btn-hover"
        aria-label="Toggle navigation"
      >
        <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          {sidebarOpen
            ? <><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></>
            : <><line x1="3" y1="6" x2="21" y2="6" /><line x1="3" y1="12" x2="21" y2="12" /><line x1="3" y1="18" x2="21" y2="18" /></>
          }
        </svg>
      </button>

      {/* Mobile backdrop */}
      {sidebarOpen && (
        <div className="md:hidden fixed inset-0 bg-black/50 z-10 sidebar-overlay" onClick={closeSidebar} />
      )}

      {/* Sidebar */}
      <aside className={`
        fixed inset-y-0 left-0 z-20 w-72 bg-slate-900 text-slate-300 flex-shrink-0 flex flex-col shadow-2xl
        transform transition-transform duration-300 ease-in-out
        ${sidebarOpen ? 'translate-x-0' : '-translate-x-full'}
        md:sticky md:top-0 md:h-screen md:translate-x-0 md:w-64
      `}>
        <div className="p-5 border-b border-slate-800 flex-shrink-0">
          <div className="flex items-center gap-2.5 mb-1">
            <img src={`${import.meta.env.BASE_URL}logo.png`} alt="" className="h-8 w-8 rounded-lg flex-shrink-0" />
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

        {/* min-h-0 is required: flex items default to min-height:auto, so without it
            the nav grows to its content height instead of scrolling, pushing the
            footer actions out of view. */}
        <nav className="p-3 space-y-1 flex-1 min-h-0 overflow-y-auto sidebar-scroll">
          {WORKSPACES.map(ws => {
            const items = ws.items.filter(it => !it.visible || it.visible(data));
            if (items.length === 0) return null;
            const isOpen = expandedWorkspaces.has(ws.id);
            const containsActive = items.some(it => it.id === activeTab);
            const pendingCount = items.filter(it => it.pending?.(data, isEnriching)).length;

            return (
              <div key={ws.id} className="mb-1">
                <button
                  onClick={() => toggleWorkspace(ws.id)}
                  aria-expanded={isOpen}
                  aria-controls={`ws-${ws.id}`}
                  title={ws.hint}
                  className={`w-full flex items-center gap-2 px-3 py-2 rounded-lg text-[11px] font-bold uppercase tracking-wide transition-colors ${
                    containsActive ? 'text-blue-300' : 'text-slate-500 hover:text-slate-300'
                  } hover:bg-slate-800/60`}
                >
                  <svg
                    xmlns="http://www.w3.org/2000/svg" width="10" height="10" viewBox="0 0 24 24"
                    fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"
                    className={`flex-shrink-0 transition-transform duration-200 ${isOpen ? 'rotate-90' : ''}`}
                    aria-hidden="true"
                  >
                    <path d="M9 18l6-6-6-6" />
                  </svg>
                  <span className="flex-1 text-left">{ws.label}</span>
                  {!isOpen && containsActive && (
                    <span className="w-1.5 h-1.5 rounded-full bg-blue-400 flex-shrink-0" aria-label="contains active view" />
                  )}
                  {!isOpen && pendingCount > 0 && (
                    <span className="w-1.5 h-1.5 rounded-full bg-indigo-400 animate-pulse flex-shrink-0" aria-label="analyses still running" />
                  )}
                </button>

                {isOpen && (
                  <div id={`ws-${ws.id}`} className="mt-1 space-y-1">
                    {items.map(it => {
                      const Icon = it.icon === 'citation' ? null : Icons[it.icon as keyof typeof Icons];
                      return (
                        <button
                          key={it.id}
                          onClick={() => switchTab(it.id)}
                          aria-current={activeTab === it.id ? 'page' : undefined}
                          className={`nav-item w-full flex items-center gap-3 px-4 py-2.5 rounded-lg text-sm font-medium transition-all ${
                            activeTab === it.id
                              ? 'active bg-blue-600 text-white shadow-lg shadow-blue-900/50'
                              : 'hover:bg-slate-800 text-slate-400'
                          }`}
                        >
                          {Icon ? <Icon /> : <span aria-hidden="true">📜</span>}
                          {it.label}
                          {it.pending?.(data, isEnriching) && (
                            <span className="ml-auto w-1.5 h-1.5 rounded-full bg-indigo-400 animate-pulse flex-shrink-0" />
                          )}
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          })}
        </nav>

        <div className="p-3 border-t border-slate-800 space-y-1.5 flex-shrink-0 max-h-[45vh] overflow-y-auto sidebar-scroll">
          <button onClick={() => { analysisGenRef.current++; causalAbortRef.current?.abort(); enrichmentAbortRef.current?.abort(); enrichmentAbortRef.current = null; setIsDemo(false); setViewState('setup'); setData(null); setQuestionResults(null); setFeedbacks(new Map()); setRevisedData(null); setShowRevisionEditor(false); setFacilitationPlan(null); setCausalResult(null); setIsEnriching(false); setEnrichProgressMsg(''); setEnrichmentNoticeDismissed(false); closeSidebar(); }} className="w-full bg-slate-800 hover:bg-slate-700 text-white py-2 px-4 rounded-lg flex items-center justify-center gap-2 transition-colors text-sm font-medium border border-slate-700 group btn-hover">
            <Icons.Refresh /> <span className="group-hover:text-blue-200 transition-colors">New Analysis</span>
          </button>
          {data && (
            <button
              onClick={() => downloadReport(data)}
              className="w-full bg-blue-800/50 hover:bg-blue-700 text-blue-200 hover:text-white py-2 px-4 rounded-lg flex items-center justify-center gap-2 transition-colors text-xs font-medium border border-blue-700/50 btn-hover"
              title="Download a comprehensive HTML report for stakeholders"
            >
              📊 Export Report
            </button>
          )}
          {data && (
            <button
              onClick={() => { void downloadProvenanceRecord(data); }}
              className="w-full bg-slate-800/50 hover:bg-slate-700 text-slate-400 hover:text-white py-2 px-4 rounded-lg flex items-center justify-center gap-2 transition-colors text-xs font-medium border border-slate-700/50 btn-hover"
              title="Download an unsigned W3C PROV-O-aligned audit record (JSON-LD)"
            >
              📜 Provenance (JSON-LD)
            </button>
          )}
          {data && (
            <button
              onClick={() => {
                void downloadVerificationPage(data).catch(error => {
                  console.error('Participant-response page export failed:', error);
                  alert(`Participant-response page export failed: ${error instanceof Error ? error.message : 'unknown error'}`);
                });
              }}
              className="w-full bg-slate-800/50 hover:bg-slate-700 text-slate-400 hover:text-white py-2 px-4 rounded-lg flex items-center justify-center gap-2 transition-colors text-xs font-medium border border-slate-700/50 btn-hover"
              title="Download an offline, run-bound participant-response page (identity is not authenticated)"
            >
              ✅ Verification Page
            </button>
          )}
          {data && (
            <button
              onClick={handleGenerateFacilitationPlan}
              disabled={isGeneratingPlan}
              className="w-full bg-emerald-800/60 hover:bg-emerald-700 disabled:opacity-50 disabled:cursor-wait text-emerald-200 hover:text-white py-2 px-4 rounded-lg flex items-center justify-center gap-2 transition-colors text-xs font-medium border border-emerald-700/50 btn-hover"
              title="Generate facilitation plan with follow-up questions and workshop exercises"
            >
              {isGeneratingPlan ? (
                <>
                  <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="animate-spin"><path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 12" /><path d="M3 3v9h9" /></svg>
                  Generating...
                </>
              ) : (
                '🧭 Facilitation Co-Pilot'
              )}
            </button>
          )}
          {data && data.config?.summaryMethod === 'ai' && (
            <button
              onClick={() => setShowCausalPanel(v => !v)}
              className="w-full bg-indigo-900/50 hover:bg-indigo-800 text-indigo-200 hover:text-white py-2 px-4 rounded-lg flex items-center justify-center gap-2 transition-colors text-xs font-medium border border-indigo-700/50 btn-hover"
              title="Estimate counterfactual utility by regenerating summaries with inputs withheld (uses many model calls; not causal identification)"
            >
              🎯 Counterfactual Attribution
            </button>
          )}
          {data && !isDemo && (
            <button onClick={exportDemoData} className="w-full bg-slate-800/50 hover:bg-slate-700 text-slate-400 hover:text-white py-2 px-4 rounded-lg flex items-center justify-center gap-2 transition-colors text-xs font-medium border border-slate-700/50 btn-hover">
              Export Demo Data
            </button>
          )}
        </div>
      </aside>

      {/* Main Content */}
      <main className="flex-1 p-4 pt-14 md:pt-4 md:p-8 relative">
        {data && (
          <div className="max-w-7xl mx-auto space-y-6">

            {/* Demo Mode Banner */}
            {isDemo && (
              <div className="bg-gradient-to-r from-blue-600 to-indigo-600 text-white rounded-xl p-4 shadow-lg flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <span className="text-2xl">🔬</span>
                  <div>
                    <div className="font-bold text-sm">Interactive Demo</div>
                    <div className="text-blue-100 text-xs">
                      {data.runManifest
                        ? `Pre-computed full application run of ${data.participants.length} source records from ${data.config.datasetName || 'the bundled tutorial dataset'} · embedding: ${data.runManifest.actualEmbedding.model} · generator: ${data.runManifest.actualGenerator?.model ?? 'non-generative'} · evaluator: ${data.runManifest.actualEvaluator?.model ?? 'unavailable'}.`
                        : `Pre-computed archived analysis of ${data.participants.length} source records from ${data.config.datasetName || 'the bundled tutorial dataset'} using ${data.config.embeddingModel ?? data.embeddingTierUsed ?? 'an archived embedding method'}; newer enrichment modules may be unavailable.`}
                    </div>
                  </div>
                </div>
                <button
                  onClick={() => { setIsDemo(false); setViewState('setup'); closeSidebar(); }}
                  className="bg-white/20 hover:bg-white/30 text-white text-sm font-medium py-2 px-4 rounded-lg transition-colors whitespace-nowrap btn-hover"
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
                      setFeedbacks(new Map());
                      setRevisedData(null);
                      setShowRevisionEditor(false);
                      setFacilitationPlan(null);
                      setShowFacilitationPanel(false);
                      setCausalResult(null);
                      setCausalError(null);
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

            {/* Descriptive script-group alignment alert; not a causal bias finding. */}
            {data.languageAnalysis?.hasEquityIssue && (
              <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 flex items-start gap-3">
                <span className="text-xl flex-shrink-0">🌐</span>
                <div>
                  <div className="font-bold text-amber-800 text-sm">Language–Alignment Review Flag</div>
                  <p className="text-amber-700 text-xs mt-1">
                    Non-Latin-script input groups ({data.languageAnalysis.underrepresentedLanguages.join(', ').toUpperCase()})
                    have lower semantic-alignment scores than English-labelled inputs in this run
                    {data.languageAnalysis.pValue != null
                      ? ` (Holm-adjusted permutation p = ${data.languageAnalysis.pValue.toFixed(3)})`
                      : ' (sample too small for the permutation test)'}. Automated language labels, topic, group composition, and the embedding model are confounded, so this does not establish language bias. Consider a multilingual embedding model and inspect the affected records manually.
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
                      <strong>Review trade-offs:</strong> A revision can improve some retrieval indicators while weakening others, especially under a fixed word limit. These scores are not zero-sum and are not a fairness verdict. Inspect the text and evidence before adopting a revision.
                    </p>
                  </div>

                  {/* Explicit target selection for AI-assisted drafts */}
                  <div className="rounded-xl border border-indigo-200 bg-indigo-50/60 p-4 space-y-4">
                    <div>
                      <div className="text-sm font-semibold text-slate-800">AI draft targeting</div>
                      <p className="mt-1 text-xs leading-relaxed text-slate-600">
                        Choose which records the model should inspect. This selection controls the draft only; it does not change the completed audit or turn a retrieval score into a finding.
                      </p>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                      <label className="block">
                        <span className="text-xs font-medium text-slate-700">Selection rule</span>
                        <select
                          value={revisionTargetMode}
                          onChange={event => {
                            setRevisionTargetMode(event.target.value as RevisionTargetMode);
                            setRevisionError(null);
                          }}
                          className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-700"
                        >
                          <option value="below-threshold">Below a chosen score</option>
                          <option value="lowest-ranked">Lowest-scoring records</option>
                        </select>
                      </label>

                      {revisionTargetMode === 'below-threshold' ? (
                        <label className="block md:col-span-1">
                          <span className="flex items-center justify-between text-xs font-medium text-slate-700">
                            <span>Score cutoff</span>
                            <span className="font-mono">{revisionThreshold.toFixed(2)}</span>
                          </span>
                          <input
                            type="range"
                            min="0"
                            max="1"
                            step="0.01"
                            value={revisionThreshold}
                            onChange={event => {
                              setRevisionThreshold(Number(event.target.value));
                              setRevisionError(null);
                            }}
                            className="mt-3 w-full accent-indigo-600"
                          />
                          <span className="mt-1 block text-[10px] text-slate-500">
                            Run threshold: {(data.config.thresholds?.matchingThreshold ?? ANALYSIS_CONFIG.thresholds.matchingThreshold).toFixed(2)}
                          </span>
                        </label>
                      ) : (
                        <div className="rounded-lg border border-indigo-100 bg-white/70 px-3 py-2 text-xs leading-relaxed text-slate-600">
                          This deliberately reviews the lowest-scoring eligible records even when none falls below the run threshold.
                        </div>
                      )}

                      <label className="block">
                        <span className="text-xs font-medium text-slate-700">Maximum records sent</span>
                        <input
                          type="number"
                          min="1"
                          max="12"
                          step="1"
                          value={revisionMaxCandidates}
                          onChange={event => {
                            const value = Number(event.target.value);
                            if (Number.isFinite(value)) {
                              setRevisionMaxCandidates(Math.min(12, Math.max(1, Math.round(value))));
                              setRevisionError(null);
                            }
                          }}
                          className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-700"
                        />
                        <span className="mt-1 block text-[10px] text-slate-500">Limited to 12 to bound prompt size and review scope.</span>
                      </label>
                    </div>

                    <label className="block">
                      <span className="text-xs font-medium text-slate-700">Facilitator instruction <span className="font-normal text-slate-400">(optional)</span></span>
                      <textarea
                        value={revisionInstruction}
                        onChange={event => setRevisionInstruction(event.target.value)}
                        rows={2}
                        maxLength={600}
                        className="mt-1 w-full resize-y rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-700 outline-none focus:ring-2 focus:ring-indigo-400"
                        placeholder="For example: preserve the disagreement about costs and add any missing implementation constraints."
                      />
                    </label>

                    <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                      <div className="text-xs text-slate-600">
                        {revisionSelection && revisionSelection.candidates.length > 0 ? (
                          <>
                            <span className="font-semibold text-indigo-800">
                              {revisionSelection.candidates.length} record{revisionSelection.candidates.length === 1 ? '' : 's'} selected
                            </span>
                            {revisionTargetMode === 'below-threshold'
                              ? `; ${revisionSelection.matchingCount} match the rule among ${revisionSelection.eligibleCount} eligible records`
                              : ` from ${revisionSelection.eligibleCount} eligible records`}
                            <span className="mt-1 block text-slate-500">
                              {revisionSelection.candidates.map(participant => participant.id).join(', ')}
                            </span>
                          </>
                        ) : (
                          <span className="font-medium text-amber-700">
                            No record matches this rule. Raise the cutoff or choose Lowest-scoring records.
                          </span>
                        )}
                      </div>
                      <button
                        onClick={handleGenerateAIDraft}
                        disabled={isGeneratingDraft || !revisionSelection?.candidates.length}
                        title="Generate an AI-assisted revision from the explicitly selected review candidates"
                        className="flex flex-shrink-0 items-center justify-center gap-1.5 rounded-lg bg-slate-800 px-4 py-2 text-xs font-medium text-white transition-colors hover:bg-slate-700 disabled:cursor-not-allowed disabled:opacity-40"
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

                    {revisionError && (
                      <div role="alert" className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">
                        <span className="font-semibold">AI draft generation failed:</span> {revisionError}
                      </div>
                    )}
                  </div>

                  {/* Textarea + controls */}
                  <div>
                    <div className="flex items-center justify-between mb-2">
                      <label className="text-sm font-semibold text-slate-700">Summary Text</label>
                      <button
                        onClick={() => {
                          setRevisionDraft(data.summary);
                          setRevisionOrigin('human-authored');
                          setRevisionError(null);
                          setRevisionTargetingNote(null);
                        }}
                        className="text-xs text-slate-500 hover:text-slate-700 border border-slate-200 rounded px-2.5 py-1 hover:bg-slate-50 transition-colors"
                      >
                        Reset to Original
                      </button>
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
                    <div className="mt-2 flex items-center gap-2 text-xs text-slate-600">
                      <span className="font-medium">Declared revision origin:</span>
                      <select
                        value={revisionOrigin}
                        onChange={event => setRevisionOrigin(event.target.value as SummaryOrigin)}
                        className="rounded border border-slate-200 bg-white px-2 py-1"
                      >
                        <option value="human-authored">Human-authored edit</option>
                        <option value="ai-assisted">AI-assisted edit</option>
                        <option value="mixed">Mixed / multiple authors</option>
                        <option value="unknown">Unknown</option>
                      </select>
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

            {/* Causal (Shapley) Attribution Panel */}
            {showCausalPanel && data && (
              <CausalAttributionPanel
                participants={data.participants}
                result={causalResult}
                estimate={estimateAttributionCost(data.participants.length, {
                  exact: causalPreset === 'exact',
                  samples: BUDGET_PRESETS.find(p => p.id === causalPreset)?.samples ?? 30,
                  clusterAssignments: data.participants.length > CLUSTER_LEVEL_THRESHOLD && data.clusteringDiagnostics?.usableForDownstream === true
                    ? data.participants.map(p => p.clusterId) : undefined,
                })}
                preset={causalPreset}
                onPresetChange={setCausalPreset}
                isRunning={isRunningCausal}
                progress={causalProgress}
                error={causalError || (
                  data.participants.length > CLUSTER_LEVEL_THRESHOLD && data.clusteringDiagnostics?.usableForDownstream !== true
                    ? `Cluster-level utility attribution is unavailable: ${data.clusteringDiagnostics?.reason || 'this run has no validated semantic partition.'}`
                    : null
                )}
                onRun={handleRunCausalAttribution}
                onCancel={() => causalAbortRef.current?.abort()}
                onClose={() => setShowCausalPanel(false)}
                onSelectParticipant={setSelectedParticipant}
              />
            )}

            {/* What Was Missed — collapsible.
                Kept on the dashboard rather than moved behind a modal: "who was
                missed" is the question this tool exists to answer, and the
                Executive Summary only gives counts, not the actual contributions.
                Collapsing (open by default) keeps it prominent without pushing
                the interactive workspaces below the fold on smaller screens. */}
            <details className="group" open={!missedCollapsed} onToggle={e => setMissedCollapsed(!(e.currentTarget as HTMLDetailsElement).open)}>
              <summary className="cursor-pointer list-none flex items-center gap-2 py-2 text-sm font-semibold text-slate-700 hover:text-slate-900">
                <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none"
                     stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"
                     className="transition-transform duration-200 group-open:rotate-90 flex-shrink-0" aria-hidden="true">
                  <path d="M9 18l6-6-6-6" />
                </svg>
                Semantic alignment review
                {missedCount > 0 && (
                  <span className="ml-1 px-2 py-0.5 rounded-full bg-amber-100 text-amber-800 text-xs font-bold">
                    {missedCount}
                  </span>
                )}
                <span className="ml-auto text-xs font-normal text-slate-400 group-open:hidden">show</span>
              </summary>
              <div className="mt-2">
                <MissedPerspectives
                  participants={data.participants}
                  clusters={data.clusters}
                  summarySentences={data.summarySentences}
                  onSelectParticipant={setSelectedParticipant}
                />
              </div>
            </details>

            {/* Detailed Metrics (collapsible for experts) */}
            <details className="group">
              <summary className="cursor-pointer text-sm font-medium text-slate-500 hover:text-slate-700 flex items-center gap-2 py-2">
                <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="transition-transform group-open:rotate-90">
                  <polyline points="9 18 15 12 9 6" />
                </svg>
                Show Detailed Metrics
              </summary>
              <div className="pt-4">
                <MetricsBanner metrics={data.metrics} participants={data.participants} uncertaintyMetrics={data.uncertaintyMetrics} embeddingTier={data.embeddingTierUsed} />
              </div>
            </details>


            <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">

              {/* Left Column (Viz) — tab transitions via key remount */}
              <div className="xl:col-span-2 space-y-6" key={activeTab}>
              <VizErrorBoundary tabName={activeTab}>
                <React.Suspense fallback={(
                  <div className="flex h-48 items-center justify-center text-sm text-slate-500" role="status" aria-live="polite">
                    Loading visualization…
                  </div>
                )}>
                <div className="tab-content">

                  {activeTab === 'map' && (
                    <Card title="Semantic Space" subtitle="Approximate 2-D projection; colors appear only as a validated exploratory partition and are never topic or causal labels." className="border-t-4 border-t-blue-500" expandable>
                      <SemanticMap
                        data={data.participants}
                        clusters={data.clusters}
                        clusteringDiagnostics={data.clusteringDiagnostics}
                        selectedId={selectedParticipant}
                        onSelect={setSelectedParticipant}
                      />
                    </Card>
                  )}


                  {activeTab === 'blindspot' && (
                    <Card title="Alignment Review Quadrants" subtitle="A descriptive median split of source-network centrality and source-to-summary alignment." className="border-t-4 border-t-red-500" expandable>
                      <BlindSpotPlot data={data.participants} onSelect={setSelectedParticipant} selectedId={selectedParticipant} />
                    </Card>
                  )}

                  {activeTab === 'similarity' && !data.networkGraph && (
                    <Card title="Participant Similarity Network"><div className="flex items-center justify-center h-48 text-slate-400 text-sm">Network graph data not available.</div></Card>
                  )}
                  {activeTab === 'similarity' && data.networkGraph && (
                    <Card title="Participant Similarity Network" subtitle="Mutual k-NN graph — edges connect participants whose embeddings are mutually among each other's top-k nearest neighbors." className="border-t-4 border-t-violet-500" expandable>
                      <div style={{ height: 600 }}>
                        <SimilarityNetwork
                          networkGraph={data.networkGraph}
                          clusters={data.clusters}
                          clusteringDiagnostics={data.clusteringDiagnostics}
                          onSelect={setSelectedParticipant}
                          selectedId={selectedParticipant}
                        />
                      </div>
                    </Card>
                  )}

                  {activeTab === 'knowledge' && (
                    data?.knowledgeGraph ? (
                      <Card title="Knowledge Graph" subtitle="Entity-relationship graph constructed via GraphRAG pipeline — LLM-based extraction with community detection (Louvain modularity optimization)." className="border-t-4 border-t-indigo-500" expandable>
                        <KnowledgeGraphViz
                          knowledgeGraph={data.knowledgeGraph}
                          clusters={data.clusters}
                          onSelectParticipant={setSelectedParticipant}
                        />
                      </Card>
                    ) : (
                      <Card title="Knowledge Graph" subtitle="Building knowledge graph from participant inputs..." className="border-t-4 border-t-indigo-500">
                        <div className="flex items-center gap-2 text-sm text-slate-500 py-8 justify-center">
                          <svg className="animate-spin h-4 w-4 text-indigo-500" fill="none" viewBox="0 0 24 24">
                            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
                          </svg>
                          {isEnriching ? 'Extracting entities and relationships via GraphRAG...' : 'Knowledge graph will be available after enrichment completes.'}
                        </div>
                      </Card>
                    )
                  )}

                  {activeTab === 'flow' && (
                    <Card title="Contribution-to-Sentence Matches" subtitle="Similarity associations for review; they do not measure causal influence or verified derivation." className="border-t-4 border-t-blue-500" expandable>
                      <ContributionLineage
                        data={data.participants}
                        sentences={data.summarySentences}
                        selectedId={selectedParticipant}
                        onSelectParticipant={setSelectedParticipant}
                      />
                    </Card>
                  )}

                  {activeTab === 'fidelity' && (
                    data.languageFidelity ? (
                      <Card title="Language & Affective Fidelity" subtitle="Model-coded source-to-summary transformations, plus target-aware affect, urgency, emotion-family, and stance review with explicit abstentions." className="border-t-4 border-t-orange-500" expandable>
                        <LanguageFidelityViz data={data.languageFidelity} affectiveFidelity={data.affectiveFidelity} />
                      </Card>
                    ) : (
                    <Card title="Source-unit Transformation" subtitle="Inventorying source units and assessing verified summary alignments..." className="border-t-4 border-t-orange-500">
                        <div className="flex items-center justify-center gap-2 text-sm text-slate-500 py-12">
                          <svg className="animate-spin h-4 w-4 text-orange-500 flex-shrink-0" fill="none" viewBox="0 0 24 24">
                            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
                          </svg>
                          Running the source-unit transformation census in the background...
                        </div>
                      </Card>
                    )
                  )}

                  {activeTab === 'claims' && (
                    data.claimAttribution ? (
                      <Card title="Claim Evidence Review" subtitle="Retrieved source passages and model-coded support labels for each summary claim; candidates remain subject to review." className="border-t-4 border-t-indigo-500" expandable>
                        <ClaimAttributionViz data={data.claimAttribution} summarySentences={data.summarySentences} />
                      </Card>
                    ) : (
                      <Card title="Claim Evidence Review" subtitle="Decomposing the summary into claims and retrieving candidate source passages..." className="border-t-4 border-t-indigo-500">
                        <div className="flex items-center justify-center gap-2 text-sm text-slate-500 py-12">
                          <svg className="animate-spin h-4 w-4 text-indigo-500 flex-shrink-0" fill="none" viewBox="0 0 24 24">
                            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
                          </svg>
                          Running claim attribution analysis in background...
                        </div>
                      </Card>
                    )
                  )}

                  {activeTab === 'tensions' && (
                    data.tensionAnalysis ? (
                      <Card title="Sampled Tension Review" subtitle="Model-coded handling of sampled disagreement candidates, with missing and unverifiable outputs retained." className="border-t-4 border-t-red-500" expandable>
                        <TensionNetworkViz data={data.tensionAnalysis} clusters={data.clusters} />
                      </Card>
                    ) : (
                      <Card title="Sampled Tension Review" subtitle="Sampling and assessing disagreement candidates across a validated computational partition..." className="border-t-4 border-t-red-500">
                        <div className="flex items-center justify-center gap-2 text-sm text-slate-500 py-12">
                          <svg className="animate-spin h-4 w-4 text-red-500 flex-shrink-0" fill="none" viewBox="0 0 24 24">
                            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
                          </svg>
                          Running tension analysis in background...
                        </div>
                      </Card>
                    )
                  )}

                  {activeTab === 'rhetoric' && !data.rhetoricalBias && (
                    <Card title="Rhetoric–Alignment Association"><div className="flex items-center justify-center h-48 text-slate-400 text-sm">Rhetorical association data not available.</div></Card>
                  )}
                  {activeTab === 'rhetoric' && data.rhetoricalBias && (
                    <Card title="Rhetoric–Alignment Association" subtitle="Descriptive rank association between automated communication-style scores and semantic alignment. Confounding is not controlled; this is not causal evidence of bias." className="border-t-4 border-t-amber-500" expandable>
                      <RhetoricalInfluenceViz data={data.rhetoricalBias} onSelectParticipant={(id) => setSelectedParticipant(id)} />
                    </Card>
                  )}

                  {activeTab === 'sankey' && (
                    data.sankeyData ? (
                      <Card title="Conserved Semantic Association Map" subtitle="Source-record-equivalent links through themes, with explicit no-match residuals. Not observed provenance." className="border-t-4 border-t-teal-500" expandable>
                        <ProvenanceSankeyViz data={data.sankeyData} selectedParticipantId={selectedParticipant} />
                      </Card>
                    ) : (
                      <Card title="Semantic Association Map" subtitle="Building the association diagram..." className="border-t-4 border-t-teal-500">
                        <div className="flex items-center justify-center gap-2 text-sm text-slate-500 py-12">
                          <svg className="animate-spin h-4 w-4 text-teal-500 flex-shrink-0" fill="none" viewBox="0 0 24 24">
                            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
                          </svg>
                          Building semantic associations in background...
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
                    <Card title="Stakeholder Group Comparison" subtitle="Comparing valid semantic-alignment scores across declared groups; no causal or fairness inference." className="border-t-4 border-t-indigo-500" expandable>
                      <GroupEquityChart data={data.groupAnalysis} />
                    </Card>
                  )}

                  {activeTab === 'uncertainty' && data.uncertaintyMetrics && (
                    <Card title="Resampling Stability" subtitle="Participant-resampling intervals for descriptive metrics (95% percentile interval)." className="border-t-4 border-t-purple-500" expandable>
                      <UncertaintyViz data={data.uncertaintyMetrics} />
                      {data.thresholdSensitivity && (
                        <div className="mt-4 border-t pt-4">
                          <div className="text-sm font-semibold text-slate-700 mb-2">Threshold Sensitivity <InfoIcon metricKey="thresholdSensitivity" /></div>
                          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            <div className="bg-slate-50 rounded-lg p-3">
                              <div className="text-[10px] text-slate-500 uppercase font-bold mb-1">Representation Threshold Impact <InfoIcon metricKey="representation" /></div>
                              <ThresholdSensitivityMini
                                data={data.thresholdSensitivity}
                                currentThreshold={0.6}
                                thresholdType="representation"
                              />
                              <ThresholdImpactBadges
                                thresholds={{
                                  representationTarget: ANALYSIS_CONFIG.thresholds.representationTarget,
                                  matchingThreshold: ANALYSIS_CONFIG.thresholds.matchingThreshold,
                                }}
                                representationScores={data.participants.map(p => p.representationScore)}
                              />
                            </div>
                            <div className="bg-slate-50 rounded-lg p-3">
                              <div className="text-[10px] text-slate-500 uppercase font-bold mb-1">Isolation Threshold Impact <InfoIcon metricKey="isolation" /></div>
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
                    <Card title="Sentence–Source Semantic Associations" subtitle="Similarity-based retrieval candidates for review—not citations, derivations, or observed influence." className="border-t-4 border-t-indigo-500" expandable>
                      <ProvenanceTrail data={data} onSelectParticipant={setSelectedParticipant} />
                    </Card>
                  )}
                </div>{/* /tab-content */}
                </React.Suspense>
                </VizErrorBoundary>

                <Card
                  title="Summary"
                  /*
                   * Provenance-accurate caption.
                   *
                   * Previously this always read "Model: <config.model>", which
                   * asserted a generating model even for extractive runs (where
                   * a deterministic algorithm produced the text) and for pasted
                   * summaries (where no model of ours was involved at all).
                   * That is a false provenance claim in the most prominent
                   * place in the app, and it contradicted the distinction the
                   * PROV-O export already makes. The evaluator is also named
                   * separately when one is configured, since it is a different
                   * model doing a different job.
                   */
                  subtitle={(() => {
                    const cfg = data.config;
                    const evaluator = cfg.evaluatorModel?.trim();
                    const evaluatorProvider = cfg.evaluatorProvider ?? cfg.aiProvider;
                    const evaluatorSuffix = evaluator && evaluator !== cfg.model
                      ? ` | Evaluator: ${evaluatorProvider} / ${evaluator}`
                      : evaluatorProvider !== cfg.aiProvider
                        ? ` | Evaluator provider: ${evaluatorProvider}`
                      : '';
                    if (cfg.summaryMethod === 'extractive') {
                      return `Source: deterministic extractive algorithm (no generative model)${evaluatorSuffix}`;
                    }
                    if (cfg.summaryMethod === 'manual') {
                      const declared = cfg.summaryProvenance?.model?.trim();
                      return declared
                        ? `Source: user-supplied text, declared as ${declared} (unverified)${evaluatorSuffix}`
                        : `Source: user-supplied text, origin not declared${evaluatorSuffix}`;
                    }
                    return `Generated in run with configured model: ${cfg.model}${evaluatorSuffix}`;
                  })()}
                  className="bg-white border border-slate-200 shadow-sm"
                >
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
                                {p.embeddingTier && (
                                  <div className="flex justify-between items-center p-2.5 bg-white border border-slate-100 rounded shadow-sm">
                                    <span className="text-[11px] font-semibold text-slate-500 uppercase">Embedding Tier</span>
                                    <span className="font-bold text-sm text-blue-600 font-mono">{p.embeddingTier}</span>
                                  </div>
                                )}
                                {p.detectedLanguage && p.detectedLanguage !== 'un' && p.detectedLanguage !== 'la' && (
                                  <div className="flex justify-between items-center p-2.5 bg-white border border-slate-100 rounded shadow-sm">
                                    <span className="text-[11px] font-semibold text-slate-500 uppercase">Language</span>
                                    <span className="font-bold text-sm text-indigo-600 font-mono">{p.detectedLanguage.toUpperCase()}</span>
                                  </div>
                                )}
                              </div>

                              <div className="mt-4">
                                <div className="text-xs font-bold text-slate-400 uppercase mb-2">Primary Summary Link</div>
                                <div className="text-xs text-slate-600 bg-amber-50 p-3 rounded border border-amber-100">
                                  "{p.topSentenceMatchIndex < data.summarySentences.length ? data.summarySentences[p.topSentenceMatchIndex] : 'N/A'}"
                                </div>
                              </div>

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
                        <div className="mt-3">
                          <FeedbackAnalytics
                            feedbacks={feedbacks}
                            participants={data.participants}
                            totalParticipants={data.participants.length}
                            runId={data.runManifest?.runId ?? null}
                            datasetName={data.config.datasetName}
                            summary={data.summary}
                            onImportResponses={handleImportParticipantResponses}
                          />
                        </div>
                      </div>
                      <div className="flex-1 overflow-y-auto pr-2" style={{ scrollbarWidth: 'thin' }}>
                        {[...data.participants]
                          .sort((a, b) => a.representationScore - b.representationScore)
                          .map(p => (
                            <div
                              key={p.id}
                              onClick={() => setSelectedParticipant(p.id)}
                              className="group p-3 mb-2 bg-white border border-slate-100 rounded-lg cursor-pointer hover:border-blue-400 participant-item"
                            >
                              <div className="flex items-center gap-3 mb-1">
                                <div className={`w-2 h-6 rounded-full flex-shrink-0 ${p.representationScore < 0.4 ? 'bg-red-400' : p.representationScore < 0.7 ? 'bg-orange-400' : 'bg-green-400'}`}></div>
                                <div className="font-semibold text-sm text-slate-700 group-hover:text-blue-600 flex-1">{p.id}</div>
                                {p.detectedLanguage && p.detectedLanguage !== 'en' && p.detectedLanguage !== 'un' && p.detectedLanguage !== 'la' && (
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

      {/* Phase 2 enrichment status bar */}
      {(isEnriching || (!enrichmentNoticeDismissed && !!data && ['partial', 'cancelled', 'failed'].includes(data.enrichmentStatus ?? ''))) && (
        <div className={`fixed bottom-0 left-0 right-0 backdrop-blur-sm border-t px-4 py-2 text-xs flex items-center gap-2 z-40 enrichment-bar ${isEnriching ? 'bg-indigo-50/95 border-indigo-200 text-indigo-700' : 'bg-amber-50/95 border-amber-200 text-amber-800'}`}>
          {isEnriching && (
            <svg className="animate-spin h-3 w-3 flex-shrink-0" fill="none" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
            </svg>
          )}
          <span className="flex-1">{enrichProgressMsg || 'Running deep analysis in background (fidelity, claims, tensions)...'}</span>
          {isEnriching ? (
            <button type="button" onClick={() => enrichmentAbortRef.current?.abort()} className="rounded border border-indigo-300 bg-white px-2 py-1 font-semibold hover:bg-indigo-100">
              Cancel deep analysis
            </button>
          ) : (
            <button type="button" onClick={() => setEnrichmentNoticeDismissed(true)} className="rounded border border-amber-300 bg-white px-2 py-1 font-semibold hover:bg-amber-100">
              Dismiss
            </button>
          )}
        </div>
      )}
    </div>
  );
}
