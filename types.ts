
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
export type FeedbackLabel = 'accurate' | 'missed' | 'distorted';

export interface ParticipantInput {
  id: string;
  text: string;
  group?: StakeholderGroup; // Optional stakeholder group for group equity analysis
}

export type SummarizationStrategy = 'balanced' | 'diversity' | 'consensus';
export type ModelType = string; 
export type AIProvider = 'gemini' | 'ollama' | 'groq';

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
  embeddingModel: string;
  runLOO: boolean;
  summaryMethod: 'ai' | 'extractive' | 'manual';
  manualSummaryText?: string;
  // New config options
  thresholds?: ThresholdConfig;
  enableNLI?: boolean;           // Enable intent preservation via NLI
  enableAnomalyDetection?: boolean;
  enableGroupAnalysis?: boolean;
  runStrategyComparison?: boolean;
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
  metrics: DiversityMetrics;
  avgRepresentation: number;
  recommendation?: string;
}

// Language equity analysis
export interface LanguageEquityReport {
  hasMultipleLanguages: boolean;
  languageCounts: Record<string, number>; // language code → count
  languageRepresentation: Record<string, number>; // language code → avg representation score
  hasEquityIssue: boolean; // true if non-English inputs are statistically underrepresented vs English
  underrepresentedLanguages: string[];
  /** Permutation test p-value for the gap between English and non-English scores.
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

// ─── Feature #3: Bias Source Attribution ──────────────────────────────────────

/**
 * The primary diagnosed reason a participant's voice is underrepresented.
 *
 * embedding_gap    — The embedding model performs poorly on this input's language/script.
 * topical_uniqueness — The perspective is genuinely novel; no other participant reinforced it.
 * summarizer_bias  — The LLM omitted the perspective despite detectable semantic relevance.
 * phrasing_mismatch — The participant expresses mainstream ideas in non-standard phrasing.
 */
export type BiasAttributionCause =
  | 'embedding_gap'
  | 'topical_uniqueness'
  | 'summarizer_bias'
  | 'phrasing_mismatch';

export interface BiasAttributionFactor {
  cause: BiasAttributionCause;
  /** 0–1 confidence that this cause applies, based on observable evidence */
  confidence: number;
  /** Human-readable explanation of the evidence for this cause */
  evidence: string;
}

export interface BiasAttribution {
  primaryCause: BiasAttributionCause;
  /** All detected factors, sorted by confidence descending */
  factors: BiasAttributionFactor[];
  /** Concrete, actionable recommendation for the facilitator */
  actionableIntervention: string;
}

// ─── Feature #4: Feedback Calibration Analytics ───────────────────────────────

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
  calibrationScore: number;
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
  summarySentenceSentiments: { score: number; label: 'positive' | 'neutral' | 'negative' }[]; // New Audit Metric
  participants: ParticipantAnalysis[];
  metrics: DiversityMetrics;
  clusters: ClusterData[];
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
  embeddingTierUsed?: 'bge-m3' | 'ollama' | 'gemini' | 'tfidf'; // Which tier was active for this analysis
  languageAnalysis?: LanguageEquityReport; // Language equity across participant inputs
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
  // How the average representation of ALL OTHER participants changes when this one is removed.
  // Positive = removing them improves others' representation (they were pulling away from mainstream).
  // Negative = removing them hurts others' representation (they were anchoring cohesion).
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
  predictedImpact: number; // Estimated representation improvement
}

// Participant Feedback
export interface ParticipantFeedback {
  participantId: string;
  label: FeedbackLabel;
  comment?: string;
  timestamp: number;
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
  sentiment: 'positive' | 'neutral' | 'negative';
  keywords: string[];
  group?: StakeholderGroup;  // Inherited from ParticipantInput
  // New fields for enhanced features
  intentPreservation?: IntentPreservation;
  anomalyFlags?: AnomalyFlags;
  counterfactualSuggestions?: CounterfactualSuggestion[];
  feedback?: ParticipantFeedback;
  // Methodological transparency
  embeddingTier?: 'bge-m3' | 'ollama' | 'gemini' | 'tfidf'; // Which embedding model scored this participant
  detectedLanguage?: string; // Detected script/language of the input text
  // Feature #3: computed on-the-fly in UI for participants with score < 0.6
  biasAttribution?: BiasAttribution;
}

export interface DiversityMetrics {
  giniCoefficient: number;
  inputDiversity: number;
  coverageUniformity: number;
  distinctRepresentationGap: number;
  totalParticipants: number;
}

export interface ClusterData {
  id: number;
  label: string;
  color: string;
}

export interface MetricDefinition {
  label: string;
  description: string;
  implication: string;
  idealRange: string;
  formula?: string;              // Mathematical formula if applicable
  thresholdJustification?: string; // Statistical justification for thresholds
}
