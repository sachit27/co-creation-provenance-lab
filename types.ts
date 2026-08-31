
// === New Types for Enhanced Features ===

// ─── Column Selection & Multi-Question Analysis ───────────────────────────────

export type ColumnSuggestedType = 'id' | 'text' | 'group' | 'empty';

export interface ColumnInfo {
  index: number;
  header: string;
  headerShort: string;        // Truncated to 60 chars for display
  nonEmptyCount: number;
  totalCount: number;
  sampleValues: string[];     // Up to 3 non-empty sample values
  suggestedType: ColumnSuggestedType;
}

export interface ColumnSelection {
  idColumnIndex: number;        // -1 = none
  textColumnIndices: number[];  // At least one required
  groupColumnIndex: number;     // -1 = none
}

export type MultiColumnMode = 'combined' | 'per_question';

export interface QuestionAnalysis {
  columnIndex: number;
  questionLabel: string;
  participantCount: number;
  result: AnalysisResult;       // Forward ref — AnalysisResult defined below
}

// ─────────────────────────────────────────────────────────────────────────────

export type StakeholderGroup = 'community' | 'expert' | 'youth' | 'government' | 'business' | 'other';
export type EntailmentLabel = 'entails' | 'neutral' | 'contradicts';
export type FeedbackLabel = 'accurate' | 'partial' | 'missed' | 'distorted';

export interface ParticipantInput {
  id: string;
  text: string;
  group?: StakeholderGroup; // Optional stakeholder group for group equity analysis
  /**
   * Optional evidentiary answer segments. `context` (for example a survey
   * question) helps interpretation but is not itself treated as participant
   * testimony in source-census metrics.
   */
  sourceSegments?: Array<{ text: string; context?: string }>;
}

export type SummarizationStrategy = 'balanced' | 'diversity' | 'consensus';
export type ModelType = string;
export type AIProvider = 'gemini' | 'ollama' | 'groq' | 'openai' | 'claude' | 'apertus';

export interface CompletionUsage {
  inputTokens?: number;
  outputTokens?: number;
  totalTokens?: number;
}

/** Provider-returned execution facts for one completion. Fields are optional
 * because providers expose different response envelopes. */
export interface CompletionMetadata {
  provider: AIProvider;
  /** Application role for this call; assigned by the run orchestrator. */
  role?: 'generator' | 'evaluator' | 'auxiliary';
  requestedModel: string;
  returnedModel?: string;
  responseId?: string;
  requestId?: string;
  createdAt: string;
  finishReason?: string;
  /** Provider-supplied refusal text/category when a refused call is recorded. */
  refusal?: string;
  usage?: CompletionUsage;
  effectiveParameters: {
    temperature: number | null;
    maxOutputTokens?: number;
    reasoningEffort?: string;
    topP?: number;
    /** Provider-enforced response envelope when supported. */
    responseFormat?: 'text' | 'json' | 'json-schema';
    /** Whether a provider-side hidden/reasoning channel was enabled. */
    thinking?: boolean;
  };
}

export interface CompletionResult {
  text: string;
  metadata: CompletionMetadata;
}

export interface CompletionFailure extends Error {
  completionMetadata?: CompletionMetadata;
}

/** Declared authorship/origin of the summary being audited. Never inferred. */
export type SummaryOrigin =
  | 'generated-in-run'
  | 'algorithmic-extractive'
  | 'human-authored'
  | 'ai-generated-external'
  | 'ai-assisted'
  | 'mixed'
  | 'unknown';

export interface DeclaredSummaryProvenance {
  origin: SummaryOrigin;
  /** Provider/model that created an externally supplied summary, when known. */
  provider?: string;
  model?: string;
  generatedAt?: string;
  notes?: string;
}

/**
 * Where to generate embeddings — independent of the completion provider.
 * 'bge-m3'  : Local Xenova BGE-M3 transformer (requires server running)
 * 'openai'  : OpenAI text-embedding-3-small/large (requires API key)
 * 'gemini'  : Google Gemini Embedding (requires API key)
 * 'ollama'  : Ollama embedding model (requires Ollama running)
 * 'tfidf'   : Local TF-IDF bag-of-words — always available, no API needed
 */
export type EmbeddingProvider = 'bge-m3' | 'openai' | 'gemini' | 'ollama' | 'tfidf';

// Threshold configuration for customizable analysis
export interface ThresholdConfig {
  representationTarget: number;   // Default: 0.6
  matchingThreshold: number;      // Default: 0.45
  isolationPercentile: number;    // Default: 0.25 (top 25% are "isolated")
  representationPercentile: number; // Default: 0.75 (bottom 75% for gap calculation)
  anomalyZThreshold: number;      // Default: 2.0 (for outlier detection)
}

export interface AnalysisConfig {
  datasetName: string;
  strategy: SummarizationStrategy;
  aiProvider: AIProvider;
  model: ModelType;
  /** Optional provider used for model-coded audits. Undefined reuses aiProvider. */
  evaluatorProvider?: AIProvider;
  /** Optional evaluator model. Undefined reuses the configured generator model. */
  evaluatorModel?: ModelType;
  /** Internal per-run observer; omitted from stored/exported public config. */
  completionMetadataSink?: (metadata: CompletionMetadata) => void;
  /** Internal cancellation signal for in-flight model-coded work. It is never
   * stored or exported as part of the public run configuration. */
  completionAbortSignal?: AbortSignal;
  embeddingModel: string;       // Model name within the embedding provider
  embeddingProvider: EmbeddingProvider; // Which service generates embeddings
  runLOO: boolean;
  summaryMethod: 'ai' | 'extractive' | 'manual';
  manualSummaryText?: string;
  /** User-declared provenance for an existing/manual summary. */
  summaryProvenance?: DeclaredSummaryProvenance;
  // New config options
  thresholds?: ThresholdConfig;
  enableNLI?: boolean;
  enableAnomalyDetection?: boolean;
  enableGroupAnalysis?: boolean;
  runStrategyComparison?: boolean;
  wordLimit?: number;
  /** Optional domain context injected into LLM prompts to adapt analysis
   *  for specific domains (e.g., legal, finance, healthcare, policy).
   *  Example: "These are witness depositions from a civil rights case." */
  domainContext?: string;
}

// Group Equity Metrics
export interface GroupEquityMetrics {
  groupId: StakeholderGroup;
  participantCount: number;
  avgRepresentation: number;
  avgIsolation: number;
}

export interface InterGroupAnalysis {
  groupMetrics: GroupEquityMetrics[];
  interGroupGini: number;
  representationGapMatrix: Record<string, Record<string, number>>; // Group-to-group representation gaps
  /** Tier-specific provisional bands used for display/review, not fairness thresholds. */
  reviewBands?: { atRisk: number; low: number; target: number };
}

// Uncertainty Quantification
export interface UncertaintyMetrics {
  giniCI: { lower: number; upper: number; point: number };
  avgRepresentationCI: { lower: number; upper: number; point: number };
  gapCI: { lower: number; upper: number; point: number };
  bootstrapSamples: number;
}

// Threshold Sensitivity
export interface ThresholdSensitivityPoint {
  threshold: number;
  metricValue: number;
  affectedCount: number;
}

export interface ThresholdSensitivityAnalysis {
  representationCurve: ThresholdSensitivityPoint[];
  isolationCurve: ThresholdSensitivityPoint[];
}

// Strategy Comparison
export interface StrategyComparisonResult {
  strategy: SummarizationStrategy;
  summary: string;
  metrics?: DiversityMetrics;
  avgRepresentation: number | null;
  status: 'complete' | 'failed';
  isCurrentSummary?: boolean;
  error?: string;
  recommendation?: string;
}

// Language equity analysis
export interface LanguageEquityReport {
  hasMultipleLanguages: boolean;
  languageCounts: Record<string, number>; // language code → count
  languageRepresentation: Record<string, number>; // language code → avg representation score
  /** Legacy field name: true when a script/language alignment review flag fires; not a causal equity finding. */
  hasEquityIssue: boolean;
  underrepresentedLanguages: string[];
  /** Holm-adjusted permutation p-value for a flagged comparison.
   *  null when sample sizes are too small for a meaningful test (< 3 per group). */
  pValue?: number | null;
}

// ─── Feature #1: Facilitation Co-Pilot ────────────────────────────────────────

export interface FacilitationWorkshopExercise {
  title: string;
  description: string;
  targetGroup?: string;
}

export interface FacilitationGapBrief {
  gapBrief: string;
  followUpQuestions: string[];
  workshopExercises: FacilitationWorkshopExercise[];
  generatedAt: number;
  modelUsed: string;
}

// ─── Feedback Calibration Analytics ──────────────────────────────────────────

export interface FeedbackCalibration {
  /** Fraction of feedbacks where the label aligns with the expected direction of the score */
  agreementRate: number;
  /** Participant IDs: score >= 0.6 (well-represented) but feedback = "missed" or "distorted" */
  falsePositives: string[];
  /** Participant IDs: score < 0.5 (underrepresented) but feedback = "accurate" */
  falseNegatives: string[];
  totalFeedbacks: number;
  /**
   * Spearman rank correlation between representation score and feedback valence
   * (accurate=1, missed=0, distorted=-0.5).
   * Range −1 to 1; higher = algorithm and humans agree.
   */
  calibrationScore: number | null;
  /** Feedback cases outside the prespecified high and low score bands. */
  indeterminateCount?: number;
}

// ─── Feature #5: What-If Simulation ──────────────────────────────────────────

export type WhatIfScenarioType = 'add_voices' | 'reweight_group';

export interface WhatIfScenario {
  type: WhatIfScenarioType;
  /** Target cluster ID (for add_voices) */
  clusterId?: number;
  /** Target stakeholder group (for reweight_group) */
  groupId?: StakeholderGroup;
  /** Number of synthetic voices to add (1–10, for add_voices) */
  additionalCount?: number;
  /** Score multiplier for the target group (1.1–2.0, for reweight_group) */
  weightBoost?: number;
}

export interface WhatIfResult {
  scenario: WhatIfScenario;
  projectedGini: number;
  projectedAvgRep: number;
  projectedBlindSpots: number;
  projectedAtRisk: number;
  deltaGini: number;
  deltaAvgRep: number;
  deltaBlindSpots: number;
  deltaAtRisk: number;
  /** Plain-language summary of the simulated outcome */
  description: string;
}

export interface AnalysisResult {
  config: AnalysisConfig;
  summary: string;
  summarySentences: string[];
  /** Legacy-only coarse sentiment labels. New runs leave this empty. */
  summarySentenceSentiments: { score: number; label: 'positive' | 'neutral' | 'negative' }[];
  participants: ParticipantAnalysis[];
  metrics: DiversityMetrics;
  clusters: ClusterData[];
  /** Validation record for the run-specific semantic partition. Legacy runs may omit it. */
  clusteringDiagnostics?: ClusteringDiagnostics;
  sensitivityAnalysis?: SensitivityResult[];
  bridgingOpportunities?: BridgingSuggestion[];
  conceptAnalysis?: ConceptFidelityResult;
  // New fields for enhanced features
  groupAnalysis?: InterGroupAnalysis;
  uncertaintyMetrics?: UncertaintyMetrics;
  thresholdSensitivity?: ThresholdSensitivityAnalysis;
  strategyComparison?: StrategyComparisonResult[];
  // For summary revision feature
  inputEmbeddings?: number[][];
  // Methodological transparency
  embeddingTierUsed?: EmbeddingProvider; // Which tier was active for this analysis
  languageAnalysis?: LanguageEquityReport; // Exploratory script/language alignment comparison
  enrichmentStatus?: 'pending' | 'complete' | 'partial' | 'cancelled' | 'failed';
  /** Per-stage execution state makes partial results and failures explicit. */
  enrichmentStages?: Partial<Record<EnrichmentStageName, EnrichmentStageRecord>>;
  networkGraph?: NetworkGraph; // Participant semantic similarity network
  languageFidelity?: LanguageFidelity; // Phase 2: how raw language was transformed in summary
  affectiveFidelity?: AffectiveFidelity; // Phase 2: model-estimated affect/stance fidelity on verified spans
  // Phase 2: advanced provenance features
  rhetoricalBias?: RhetoricalBiasAnalysis;
  claimAttribution?: ClaimAttribution;
  tensionAnalysis?: TensionAnalysis;
  sankeyData?: SankeyData;
  knowledgeGraph?: KnowledgeGraph;
  /** Execution facts recorded at run time. This is an unsigned audit log. */
  runManifest?: {
    runId: string;
    startedAt: string;
    completedAt: string;
    requestedSummaryMethod: AnalysisConfig['summaryMethod'];
    actualSummaryMethod: AnalysisConfig['summaryMethod'];
    requestedGenerator?: { provider: AIProvider; model: string };
    actualGenerator?: { provider: AIProvider; model: string };
    requestedEvaluator?: { provider: AIProvider; model: string };
    actualEvaluator?: { provider: AIProvider; model: string };
    requestedEmbedding: { provider: EmbeddingProvider; model: string };
    actualEmbedding: { provider: EmbeddingProvider; model: string };
    /** Provider-returned execution facts, in call order. Prompt/output text is never stored here. */
    completionCalls?: CompletionMetadata[];
    fallbackEvents: string[];
    softwareVersion: string;
  };
}

export type EnrichmentStageName = 'language' | 'affect' | 'claims' | 'tensions' | 'knowledgeGraph' | 'sankey';

export interface EnrichmentStageRecord {
  status: 'pending' | 'complete' | 'failed' | 'skipped' | 'cancelled';
  message?: string;
}

// ── Language Fidelity Analysis ────────────────────────────────────────────────

export type TransformationType = 'preserved' | 'softened' | 'sanitized' | 'abstracted' | 'target_shifted' | 'target_uncertain' | 'dropped' | 'unassessed';

/**
 * Epistemic classification for summary claims.
 * Adapted from assertion classification literature (ACL 2024):
 * - explicit:      Directly stated in the source text — verifiable fact
 * - inferred:      Reasonable derivation from source evidence
 * - extrapolated:  Requires external knowledge beyond what sources provide
 * - speculative:   Forward-looking or model-generated claim with no source basis
 */
export type EpistemicClass = 'explicit' | 'inferred' | 'extrapolated' | 'speculative';

export interface PhraseMapping {
  participantId: string;
  /** Collision-free identifier for the inventoried source unit within this run. */
  sourceUnitId?: string;
  /** Position of the sentence-like source unit within the participant contribution. */
  sourceUnitIndex?: number;
  rawPhrase: string;
  summaryPhrase: string | null;
  type: TransformationType;
  /** False when the evaluator omitted the unit or returned unverifiable output. */
  alignmentAssessed?: boolean;
  /** Non-evidentiary context such as the survey question for this source span. */
  sourceContext?: string;
  /** Whether the source and summary phrases refer to the same target/aspect. */
  targetRelation?: TargetRelation;
  /** Actual sentence containing summaryPhrase (it may differ from the sentence being audited). */
  summarySentenceIndex?: number | null;
}

export interface SentenceFidelity {
  sentenceIndex: number;
  sentenceText: string;
  counts: Record<TransformationType, number>;
  mappings: PhraseMapping[];
  /** Epistemic classification of the claim made in this sentence */
  epistemicClass?: EpistemicClass;
  /** Brief explanation of why this epistemic label was assigned */
  epistemicExplanation?: string;
}

export interface LanguageFidelity {
  /** New runs use a complete source-first census; absent on archived legacy results. */
  methodVersion?: 'language-transformation-v2-source-census';
  /** Time at which the automated transformation assessment completed. */
  generatedAt?: string;
  sentences: SentenceFidelity[];
  overallCounts: Record<TransformationType, number>;
  /** Participant-balanced preservation fraction, conditional on assessed units. */
  fidelityScore: number | null;
  /** Complete source census, including explicit dropped and unassessed units. */
  sourceMappings?: PhraseMapping[];
  /** Source units with no verified summary span, shown separately from per-sentence mappings. */
  unmappedMappings?: PhraseMapping[];
  totalSourceUnitCount?: number;
  /** Valid evaluator outputs, including explicit target uncertainty. */
  completedSourceUnitCount?: number;
  assessedSourceUnitCount?: number;
  /** Sum of each participant's within-participant preservation fraction. */
  preservedParticipantEquivalent?: number;
  /** Number of participants contributing at least one assessed unit to fidelityScore. */
  assessedParticipantEquivalent?: number;
  /** Participant-balanced fraction of inventoried units receiving a valid assessment. */
  assessmentCoverageRate?: number | null;
  evaluator?: {
    provider: AIProvider;
    model: string;
    requestedTemperature: 0;
    promptVersion: 'language-transformation-v2-source-census';
    completionCalls?: CompletionMetadata[];
  };
  limitations?: string[];
  /** Participants for whom every source unit was assessed and every unit was absent. */
  summaryDroppedParticipantIds: string[];
}

// ── Affective Fidelity Analysis ──────────────────────────────────────────────

/**
 * A constrained, deliberately coarse affect taxonomy. The eight named
 * families follow Plutchik; `other` avoids forcing culturally/domain-specific
 * expressions into an ill-fitting family. An empty array means no expressed
 * emotion was detected — never that the speaker has no emotion.
 */
export type AffectEmotion =
  | 'joy' | 'trust' | 'fear' | 'surprise'
  | 'sadness' | 'disgust' | 'anger' | 'anticipation'
  | 'other';

export type AffectValence = -2 | -1 | 0 | 1 | 2;
export type AffectLevel = 0 | 1 | 2 | 3;
export type AffectStance = 'support' | 'oppose' | 'mixed' | 'none' | 'uncertain';
export type TargetRelation = 'same' | 'different' | 'uncertain';

/** A pointwise reading of one text span; it contains no comparison judgment. */
export interface AffectProfile {
  valence: AffectValence;
  intensity: AffectLevel;
  /** Deliberation-specific extension: how strongly the span calls for timely action. */
  urgency: AffectLevel;
  emotions: AffectEmotion[];
  stance: AffectStance;
  /** Short textual referent/aspect toward which valence and stance are expressed. */
  target: string;
  /** Model-reported certainty, used only as an exclusion screen; it is not calibrated probability. */
  certainty: number;
}

export type AffectiveTransition =
  | 'preserved'
  | 'attenuated'
  | 'amplified'
  | 'mixed'
  | 'polarity_shifted'
  | 'stance_shifted'
  | 'emotion_shifted'
  | 'target_shifted'
  | 'omitted'
  | 'unassessed'
  | 'uncertain';

export interface AffectiveTransitionFlags {
  valenceMagnitudeDelta: number;
  intensityDelta: number;
  urgencyDelta: number;
  polarityReversed: boolean;
  /** False when either pointwise profile abstained on stance. */
  stanceAssessed: boolean;
  stanceChanged: boolean;
  emotionSetChanged: boolean;
  /** Literal profile labels differ; this is a review flag, not a semantic target verdict. */
  profileTargetLabelsDiffer: boolean;
  attenuatedDimensions: Array<'valence' | 'intensity' | 'urgency'>;
  amplifiedDimensions: Array<'valence' | 'intensity' | 'urgency'>;
}

export interface AffectiveFidelityCase {
  participantId: string;
  /** Zero-based source-unit index within the participant's source census. */
  mappingSentenceIndex: number;
  summarySentenceIndex: number | null;
  sourceSpan: string;
  sourceContext?: string;
  summarySpan: string | null;
  targetRelation: TargetRelation;
  alignmentAssessed: boolean;
  sourceProfile: AffectProfile | null;
  summaryProfile: AffectProfile | null;
  transition: AffectiveTransition;
  flags: AffectiveTransitionFlags;
  sourceAffectBearing: boolean;
  unitWeight: number;
  comparable: boolean;
  exclusionReason?: 'invalid_span' | 'missing_profile' | 'low_certainty' | 'uncertain_target' | 'alignment_unassessed';
}

export interface AffectiveSensitivityPoint {
  label: 'inclusive' | 'primary' | 'conservative';
  minCertainty: number;
  materialDifference: 1 | 2;
  comparableAffectBearingCount: number;
  attenuatedCount: number;
  comparableAffectBearingWeight: number;
  attenuatedWeight: number;
  attenuationRate: number | null;
}

export interface AffectiveFidelity {
  methodVersion: 'affective-fidelity-v2-source-census';
  generatedAt: string;
  evaluator: {
    provider: AIProvider;
    model: string;
    requestedTemperature: 0;
    /** null when the selected model does not support a temperature parameter. */
    effectiveTemperature: 0 | null;
    reasoningEffort?: string;
    promptVersion: 'affect-profile-v2-source-census';
    completionCalls?: CompletionMetadata[];
  };
  thresholds: {
    minCertainty: number;
    materialDifference: 1;
  };
  cases: AffectiveFidelityCase[];
  stageCounts: {
    totalSourceUnits: number;
    sourceProfileReturned: number;
    sourceProfileAboveCertainty: number;
    sourceAffectBearing: number;
    alignmentAssessedAffectBearing: number;
    sameTargetAlignedAffectBearing: number;
    summaryProfileReturned: number;
    comparableAffectBearing: number;
  };
  /** Participant-balanced source-profile return rate over the complete census. */
  sourceProfileCompletionRate: number | null;
  sourceProfileCompletedWeight: number;
  sourceCensusParticipantWeight: number;
  counts: Record<AffectiveTransition, number>;
  comparableCount: number;
  comparableAffectBearingCount: number;
  sourceAffectBearingCount: number;
  representedAffectBearingCount: number;
  comparableAffectBearingWeight: number;
  sourceAffectBearingWeight: number;
  assessedSourceAffectBearingWeight: number;
  representedAffectBearingWeight: number;
  /** Participant-balanced denominator with a verified same-target summary span. */
  profileEligibleAffectBearingWeight: number;
  /** Participant-balanced numerator whose source and summary profiles both passed screens. */
  profileComparableAffectBearingWeight: number;
  /** Participant-balanced numerator used by attenuationRate. */
  attenuatedWeight: number;
  attenuationRate: number | null;
  affectiveCoverageRate: number | null;
  /** Profile comparability among aligned same-target affect-bearing units. */
  profileComparabilityRate: number | null;
  sensitivity: AffectiveSensitivityPoint[];
  /** Machine-readable cautions that must travel with exported results. */
  limitations: string[];
}

export interface NetworkNode {
  id: string;
  clusterId: number;
  representationScore: number;
  semanticIsolation: number;
  x: number;
  y: number;
}

export interface NetworkEdge {
  source: string;
  target: string;
  weight: number; // Cosine similarity
}

export interface NetworkGraph {
  nodes: NetworkNode[];
  edges: NetworkEdge[];
  k: number; // The k value used for mutual-kNN
  analysis?: NetworkAnalysis; // Graph-level metrics computed post-construction
}

// ── Network Graph Analysis Metrics ─────────────────────────────────────────────

export interface NodeMetrics {
  id: string;
  degree: number;                    // Number of mutual-kNN edges
  weightedDegree: number;            // Sum of edge weights (strength)
  clusteringCoefficient: number;     // Fraction of neighbors that are also neighbors of each other
  betweennessCentrality: number;     // Fraction of shortest paths passing through this node
  isBridge: boolean;                 // Has edges to multiple clusters
  crossClusterEdges: number;         // Count of edges to nodes in different clusters
  intraClusterEdges: number;         // Count of edges to nodes in same cluster
}

export interface NetworkAnalysis {
  nodeMetrics: Record<string, NodeMetrics>;
  // Global metrics
  modularity: number;                // Newman's Q — how well clusters match network structure (-1 to 1)
  density: number;                   // Fraction of possible edges that exist
  avgClusteringCoefficient: number;  // Global transitivity measure
  connectedComponents: number;       // Number of disconnected subgraphs
  avgDegree: number;
  bridgeNodes: string[];             // IDs of cross-cluster connector nodes
  hubNodes: string[];                // IDs of high-degree nodes (top 10% or degree > 2*avg)
  peripheralNodes: string[];         // IDs of degree-0 or degree-1 nodes
}

export interface ConceptFidelityResult {
  preservedConcepts: string[];
  droppedConcepts: string[];
  addedConcepts: string[];
  fidelityScore: number;
  participantMap: Record<string, { kept: string[], dropped: string[] }>;
}

export interface BridgingSuggestion {
  participantId: string;
  issue: string;
  suggestion: string;
  facilitationPrompt: string; // New Actionable Feature
}

export interface SensitivityResult {
  participantId: string;
  shiftScore: number;
  semanticDelta: number;
  // Descriptive deviation of this participant's semantic-alignment estimate
  // from the observed mean. This is not a leave-one-out summary effect.
  representationDelta?: number;
}

export interface SentenceMatch {
  sentenceIndex: number;
  similarity: number;
}

// Intent Preservation via NLI
export interface IntentPreservation {
  label: EntailmentLabel;
  confidence: number;
  explanation?: string;
}

// Anomaly Detection Flags
export interface AnomalyFlags {
  isKeywordStuffing: boolean;
  isCopyPaste: boolean;
  isOutlierCluster: boolean;
  anomalyScore: number;    // Composite 0-1 score
  reasons: string[];
}

// Counterfactual Suggestions
export interface CounterfactualSuggestion {
  type: 'keyword_emphasis' | 'phrasing_alignment' | 'tone_adjustment';
  suggestion: string;
  /** Deprecated: no effect size is shown without actually rescoring a revision. */
  predictedImpact?: number;
}

// Participant Feedback
export interface ParticipantFeedback {
  participantId: string;
  label: FeedbackLabel;
  comment?: string;
  timestamp: number;
  /** Opaque identifier from a participant-response export; used for import deduplication. */
  responseId?: string;
  /** Verification request that the response was bound to. */
  requestId?: string;
  /** True only when local hashes, run/summary binding, expiry, and roster membership validated. */
  bindingVerified?: boolean;
}

export interface ParticipantAnalysis {
  id: string;
  originalText: string;
  representationScore: number;
  semanticIsolation: number;
  semanticCoords: { x: number; y: number };
  clusterId: number;
  // We now store ALL significant matches, not just the top one
  sentenceMatches: SentenceMatch[];
  topSentenceMatchIndex: number; // Kept for backward compat in other views
  /** Legacy-only coarse sentiment label; not used as a fidelity measure. */
  sentiment?: 'positive' | 'neutral' | 'negative';
  keywords: string[];
  group?: StakeholderGroup;  // Inherited from ParticipantInput
  // New fields for enhanced features
  intentPreservation?: IntentPreservation;
  anomalyFlags?: AnomalyFlags;
  counterfactualSuggestions?: CounterfactualSuggestion[];
  feedback?: ParticipantFeedback;
  // Methodological transparency
  embeddingTier?: EmbeddingProvider; // Which embedding model scored this participant
  detectedLanguage?: string; // Detected script/language of the input text
  /** True when the embedding API returned a zero vector or threw an error.
   *  When true, representationScore is unreliable and must NOT be included
   *  in aggregate metrics (Gini, avgRep, distinctGap). Displayed as a warning
   *  badge in the UI instead of a numeric score. */
  embeddingFailed?: boolean;
  /** True when a selected extractive source was scored only against the
   *  remainder of the summary, excluding its own verbatim sentence(s). */
  alignmentLeaveSelfOut?: boolean;
  /** Why an alignment score could not be computed comparably. */
  alignmentUnavailableReason?: 'no-independent-extractive-summary';
  rhetoricalProfile?: RhetoricalProfile;
}

export interface DiversityMetrics {
  giniCoefficient: number;
  inputDiversity: number;
  /** @deprecated Derived metric: always equals `1 - giniCoefficient`. Use giniCoefficient directly. */
  /** Legacy complement of Gini. Unavailable when every retrieval score is zero,
   * because equal non-coverage must not be presented as perfect coverage. */
  coverageUniformity: number | null;
  distinctRepresentationGap: number;
  totalParticipants: number;
  /** Number of participants with valid embeddings included in aggregate metrics (Gini, avg rep). */
  scoredParticipants?: number;
}

export interface ClusterData {
  id: number;
  label: string;
  color: string;
}

export interface ClusteringCandidateDiagnostic {
  k: number;
  silhouette: number;
  /** Full-space validation silhouette; null when the candidate failed an earlier gate. */
  fullSpaceSilhouette: number | null;
  restartStability: number;
  subsampleStability: number;
  neighborhoodAgreement: number;
  methodAgreement: number;
  minimumClusterSize: number;
  clusterSizes: number[];
  inertia: number;
  eligible: boolean;
  rejectionReasons: string[];
}

/**
 * Diagnostics for exploratory semantic grouping. `usableForDownstream` is the
 * single gate for cluster-conditioned attribution, facilitation, tension, and
 * score-simulation paths. It does not make groups causal, social, or validated topics.
 */
export interface ClusteringDiagnostics {
  methodVersion: 'spherical-kmeans-stability-v1' | 'spherical-kmeans-stability-v2';
  status: 'available' | 'unavailable';
  usableForDownstream: boolean;
  reason: string;
  sampleSize: number;
  inputDimensions: number;
  analysisDimensions: number;
  projectionMethod: 'none' | 'deterministic-signed-feature-hash';
  projectionDistanceCorrelation: number;
  selectedK: number;
  silhouette: number | null;
  stability: number | null;
  neighborhoodAgreement: number | null;
  /** ARI agreement with a same-k hierarchical sensitivity partition. Version
   * 2 uses deterministic cosine average linkage; version 1 used single linkage. */
  methodAgreement: number | null;
  clusterSizes: number[];
  candidateDiagnostics: ClusteringCandidateDiagnostic[];
  distanceMetric: 'cosine';
  normalized: true;
  restarts: number;
  stabilityRuns: number;
  thresholds: {
    minimumSampleSize: number;
    minimumClusterSize: number;
    minimumSilhouette: number;
    minimumStability: number;
    minimumNeighborhoodAgreement: number;
    minimumMethodAgreement: number;
    minimumProjectionDistanceCorrelation: number;
  };
  limitations: string[];
}

export interface MetricDefinition {
  label: string;
  description: string;
  implication: string;
  idealRange: string;
  formula?: string;              // Mathematical formula if applicable
  thresholdJustification?: string; // Statistical justification for thresholds
}

// ── Rhetorical Influence Analysis ──────────────────────────────────────────────

export interface RhetoricalProfile {
  assertiveness: number;       // 0–1: imperative verbs, demands, strong modals vs hedges
  register: 'formal' | 'colloquial' | 'mixed';
  evidentiality: number;       // 0–1: citations, data references, statistics
  emotionalIntensity: number;  // 0–1: urgency markers, strong adjectives, exclamation
  compositeScore: number;      // unvalidated weighted marker composite
}

export interface RhetoricalBiasAnalysis {
  profiles: Array<{
    participantId: string;
    profile: RhetoricalProfile;
    representationScore: number;
  }>;
  correlation: number;           // Spearman rank correlation
  pValue: number;                // seeded Monte Carlo permutation p-value
  hasBias: boolean;              // legacy name: exploratory |rho|/p review rule
  regressionLine: { slope: number; intercept: number };
}

// ── Claim-Level Attribution (Atomic Provenance) ───────────────────────────────

export type ClaimSupportLevel = 'supported' | 'inferrable' | 'unsupported' | 'contradicted' | 'unassessed';

export interface AtomicClaim {
  claimIndex: number;
  sentenceIndex: number;
  claimText: string;
  supportLevel: ClaimSupportLevel;
  evidence: Array<{
    participantId: string;
    passage: string;
    similarity: number;
  }>;
}

export interface ClaimAttribution {
  claims: AtomicClaim[];
  supportedCount: number;
  inferrableCount: number;
  unsupportedCount: number;
  contradictedCount: number;
  unassessedCount: number;
  attributionScore: number | null;  // directly supported fraction among assessed claims
}

// ── Tension & Contradiction Mapping ───────────────────────────────────────────

export type TensionHandling = 'acknowledged' | 'suppressed' | 'merged' | 'distorted' | 'unassessed';

export interface TensionPair {
  claimA: { participantId: string; text: string; clusterId: number };
  claimB: { participantId: string; text: string; clusterId: number };
  tensionDescription: string;
  summaryHandling: TensionHandling;
  summaryEvidence: string | null;
}

export interface TensionAnalysis {
  /** Whether candidate sampling used a validated semantic partition. */
  basis?: 'stable-semantic-groups' | 'unavailable';
  unavailableReason?: string;
  pairs: TensionPair[];
  tensionFidelityScore: number | null;  // fraction acknowledged among assessed pairs
  suppressedCount: number;
  acknowledgedCount: number;
  mergedCount: number;
  distortedCount: number;
  unassessedCount: number;
  clusterTensions: Array<{
    clusterA: number;
    clusterB: number;
    tensionCount: number;
    dominantHandling: TensionHandling;
  }>;
}

// ── GraphRAG Knowledge Graph ─────────────────────────────────────────────────

/**
 * An entity extracted from participant text via LLM-based entity extraction.
 * Follows KGGen (2025) 3-stage pipeline: extract → aggregate → cluster.
 */
export interface KGEntity {
  /** Normalized title-case name (e.g., "Data Privacy") */
  name: string;
  /** Entity type from ontology (e.g., "Concept", "Organization", "Person") */
  type: string;
  /** Concise third-person description */
  description: string;
  /** IDs of participants whose text mentions this entity */
  sourceParticipants: string[];
  /** Number of times this entity was extracted across all inputs */
  frequency: number;
  /** Whether this entity concept appears in the summary (provenance link) */
  summaryPresence?: 'present' | 'absent' | 'partial';
  /** True if this entity bridges two or more communities (cross-cutting theme) */
  isBridge?: boolean;
  /** Community ID assigned by community detection (-1 if unassigned) */
  communityId: number;
}

/**
 * A directed relationship between two entities, extracted via LLM.
 * Binary relation decomposition (LightRAG, EMNLP 2025).
 */
export interface KGRelationship {
  /** Source entity name (matches KGEntity.name) */
  source: string;
  /** Target entity name (matches KGEntity.name) */
  target: string;
  /** Verb-phrase relationship type (e.g., "threatens", "enables", "requires") */
  relationshipType: string;
  /** Concise description of the relationship */
  description: string;
  /** Strength 1–10 (from LLM assessment) */
  strength: number;
  /** Relationship keywords for search (comma-separated) */
  keywords: string;
  /** ID of the participant whose text sourced this relationship */
  sourceParticipantId: string;
}

/**
 * A community detected via modularity-optimizing community detection
 * on the knowledge graph. Analogous to GraphRAG communities (Microsoft, 2024).
 */
export interface KGCommunity {
  id: number;
  /** Human-readable label derived from top entities */
  label: string;
  /** Entity names belonging to this community */
  entityNames: string[];
  /** Brief summary of what this community represents */
  summary: string;
  /** Average relationship strength within community */
  cohesion: number;
  /** Participant IDs that contributed entities to this community */
  participantIds: string[];
}

/**
 * Complete knowledge graph constructed via GraphRAG pipeline.
 * Stored in AnalysisResult after Phase 2 enrichment.
 */
export interface KnowledgeGraph {
  entities: KGEntity[];
  relationships: KGRelationship[];
  communities: KGCommunity[];
  /** Global metrics */
  metrics: {
    entityCount: number;
    relationshipCount: number;
    communityCount: number;
    /** Newman modularity Q of the community partition */
    modularity: number;
    /** Average entities per community */
    avgCommunitySize: number;
    /** Fraction of participants with at least one entity in the graph */
    participantCoverage: number;
  };
}

// ── Provenance Sankey Flow ────────────────────────────────────────────────────

export interface SankeyNode {
  id: string;
  column: 'input' | 'theme' | 'summary';
  label: string;
  value: number;
  clusterId?: number;
  color?: string;
}

export interface SankeyLink {
  source: string;
  target: string;
  value: number;
  transformationType?: TransformationType;
  isOrphan?: boolean;
  isPhantom?: boolean;
  isLoss?: boolean;
}

export interface SankeyData {
  nodes: SankeyNode[];
  links: SankeyLink[];
  aggregationLevel: 'individual' | 'cluster' | 'super-cluster';
}
