
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
export type AIProvider = 'gemini' | 'ollama' | 'groq' | 'openai' | 'claude' | 'apertus';

/**
 * Where to generate embeddings — independent of the completion provider.
 * 'bge-m3'  : Local Xenova BGE-M3 transformer (requires server running)
 * 'openai'  : OpenAI text-embedding-3-small/large (requires API key)
 * 'gemini'  : Google text-embedding-004 (requires API key)
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
  embeddingModel: string;       // Model name within the embedding provider
  embeddingProvider: EmbeddingProvider; // Which service generates embeddings
  runLOO: boolean;
  summaryMethod: 'ai' | 'extractive' | 'manual';
  manualSummaryText?: string;
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
  embeddingTierUsed?: EmbeddingProvider; // Which tier was active for this analysis
  languageAnalysis?: LanguageEquityReport; // Language equity across participant inputs
  enrichmentStatus?: 'pending' | 'complete'; // Phase 2 concept fidelity completion state
  networkGraph?: NetworkGraph; // Participant semantic similarity network
  languageFidelity?: LanguageFidelity; // Phase 2: how raw language was transformed in summary
  // Phase 2: advanced provenance features
  rhetoricalBias?: RhetoricalBiasAnalysis;
  claimAttribution?: ClaimAttribution;
  tensionAnalysis?: TensionAnalysis;
  sankeyData?: SankeyData;
  knowledgeGraph?: KnowledgeGraph;
}

// ── Language Fidelity Analysis ────────────────────────────────────────────────

export type TransformationType = 'preserved' | 'softened' | 'sanitized' | 'abstracted' | 'dropped';

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
  rawPhrase: string;
  summaryPhrase: string | null;
  type: TransformationType;
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
  sentences: SentenceFidelity[];
  overallCounts: Record<TransformationType, number>;
  fidelityScore: number; // 0–1, proportion preserved (adjusted for cross-sentence presence)
  /** Participant IDs whose key phrases never appear in ANY summary sentence (truly dropped) */
  summaryDroppedParticipantIds: string[];
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
  embeddingTier?: EmbeddingProvider; // Which embedding model scored this participant
  detectedLanguage?: string; // Detected script/language of the input text
  /** True when the embedding API returned a zero vector or threw an error.
   *  When true, representationScore is unreliable and must NOT be included
   *  in aggregate metrics (Gini, avgRep, distinctGap). Displayed as a warning
   *  badge in the UI instead of a numeric score. */
  embeddingFailed?: boolean;
  // Feature #3: computed on-the-fly in UI for participants with score < 0.6
  biasAttribution?: BiasAttribution;
  rhetoricalProfile?: RhetoricalProfile;
}

export interface DiversityMetrics {
  giniCoefficient: number;
  inputDiversity: number;
  /** @deprecated Derived metric: always equals `1 - giniCoefficient`. Use giniCoefficient directly. */
  coverageUniformity: number;
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
  compositeScore: number;      // weighted average = "rhetorical power"
}

export interface RhetoricalBiasAnalysis {
  profiles: Array<{
    participantId: string;
    profile: RhetoricalProfile;
    representationScore: number;
  }>;
  correlation: number;           // Spearman rank correlation
  pValue: number;                // statistical significance
  hasBias: boolean;              // true if correlation positive + significant
  regressionLine: { slope: number; intercept: number };
}

// ── Claim-Level Attribution (Atomic Provenance) ───────────────────────────────

export type ClaimSupportLevel = 'supported' | 'inferrable' | 'unsupported' | 'contradicted';

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
  attributionScore: number;  // (supported + inferrable) / total
}

// ── Tension & Contradiction Mapping ───────────────────────────────────────────

export type TensionHandling = 'acknowledged' | 'suppressed' | 'merged' | 'distorted';

export interface TensionPair {
  claimA: { participantId: string; text: string; clusterId: number };
  claimB: { participantId: string; text: string; clusterId: number };
  tensionDescription: string;
  summaryHandling: TensionHandling;
  summaryEvidence: string | null;
}

export interface TensionAnalysis {
  pairs: TensionPair[];
  tensionFidelityScore: number;  // fraction acknowledged / total
  suppressedCount: number;
  acknowledgedCount: number;
  mergedCount: number;
  distortedCount: number;
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
}

export interface SankeyData {
  nodes: SankeyNode[];
  links: SankeyLink[];
  aggregationLevel: 'individual' | 'cluster' | 'super-cluster';
}
