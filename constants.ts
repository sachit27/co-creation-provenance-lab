import { ParticipantInput, ThresholdConfig } from './types';

/**
 * Statistical Configuration Constants
 * Central configuration. Unless explicitly marked as calibrated, thresholds are
 * transparent review/display heuristics rather than statistical decision rules.
 */
export const ANALYSIS_CONFIG = {
  /**
   * Default threshold configuration.
   */
  thresholds: {
    /**
     * Representation Target: 0.6
     * Provisional dense-space display target. Cosine distributions are specific
     * to the embedding model and domain; this is not a universal validity cutoff.
     */
    representationTarget: 0.6,

    /**
     * Default retrieval/display threshold for dense semantic associations.
     * It is configurable and does not confer significance or causal meaning.
     */
    matchingThreshold: 0.5,

    /**
     * Review the top quartile of centroid-distance values. This is a fixed
     * ranking heuristic, not Tukey's IQR outlier rule or a hypothesis test.
     */
    isolationPercentile: 0.25,

    /**
     * Complement to isolationPercentile for the descriptive distinct-record gap.
     */
    representationPercentile: 0.75,

    /**
     * Visual review marker for comparatively large standardized values. It is
     * not converted into a p-value or significance claim.
     */
    anomalyZThreshold: 2.0
  } as ThresholdConfig,

  /**
   * Algorithm parameters
   */
  algorithms: {
    /** Maximum power iterations per displayed PCA component. PCA is used only
     * for the two-dimensional map, never as the clustering input. */
    pcaIterations: 100,

    /** Maximum spherical K-Means iterations; convergence normally stops sooner. */
    kmeansIterations: 100,
    /** Independent deterministic K-Means++ starts evaluated for each k. */
    kmeansRestarts: 12,
    /** Participant subsamples used to estimate assignment stability. */
    clusterStabilityRuns: 8,
    /** Fraction retained in each without-replacement stability subsample. */
    clusterSubsampleFraction: 0.8,
    /** Minimum records required before a semantic partition is attempted. */
    minClusteringSampleSize: 6,
    /** Every reported semantic group must contain at least this many records. */
    minClusterSize: 2,
    /**
     * Minimum mean silhouette required to report more than one cluster.
     * Replaces the former `elbowThreshold`: WCSS decreases monotonically with k,
     * so an elbow cut-off is scale-dependent and fired early on gradually
     * structured data (it selected k=2 where 5 themes were planted). Silhouette
     * is an internal separation diagnostic, not proof of a natural partition.
     */
    minSilhouette: 0.25,
    /** Minimum mean adjusted-Rand agreement with deterministic subsample fits. */
    minClusterStability: 0.75,
    /** Minimum fraction of local-neighbour edges retained inside groups. */
    minNeighborhoodAgreement: 0.75,
    /** Agreement with a non-convex single-linkage sensitivity partition. */
    minClusteringMethodAgreement: 0.75,
    /** Maximum working dimensions for deterministic signed feature hashing. */
    maxClusteringDimensions: 128,
    /** Minimum Pearson agreement between sampled full/projection cosine distances. */
    minProjectionDistanceCorrelation: 0.80,

    /** Analytical search ceiling. Display code may simplify the legend, but it
     * must not merge evidence-supported groups merely to meet a five-item UI cap. */
    maxClusters: 12,

    /**
     * Bootstrap replicates for participant-resampling stability intervals.
     * 1,000 gives materially less Monte Carlo noise in percentile endpoints than
     * the previous 200-replicate default while remaining inexpensive for the
     * three scalar statistics computed here.
     */
    bootstrapSamples: 1000,

    /**
     * Representation score weights for the hybrid embedding + concept-overlap score.
     *
     * Neural embedding weight (0.8): When using BGE-M3, Gemini, or Ollama embeddings
     * the embedding captures richer semantic relationships than TF-IDF concept overlap,
     * so it receives a higher weight. This follows the standard practice in multi-feature
     * semantic scoring (e.g., BERTScore, ROUGE-L weighting).
     *
     * Concept overlap weight (0.2): TF-IDF concept overlap acts as a "safety net" that
     * catches keyword-level matches that dense embeddings may compress away. It receives
     * a lower weight because TF-IDF is a sparser, less semantically rich signal.
     *
     * When useLocalVectors = true (no embedding server), both signals are equally crude
     * and the split is set to 50/50 automatically in analysis.ts.
     *
     * To tune: if your domain has highly technical vocabulary that embeddings handle
     * poorly, increase conceptOverlapWeight toward 0.4 and reduce embeddingWeight to 0.6.
     */
    representationWeights: {
      embeddingWeight: 0.8,
      conceptOverlapWeight: 0.2,
    },

    /**
     * Concept fidelity batch size for AI keyword analysis.
     * 5 calls per batch is conservative; increase to 10 if your AI provider
     * has high rate limits (e.g., Groq). Sequential batches prevent thundering herds.
     */
    conceptFidelityBatchSize: 5,
  },

  /**
   * Provider-specific embedding concurrency limits.
   *
   * Higher concurrency = faster embedding at the cost of hitting rate limits.
   * These values are conservative defaults that stay well within each
   * provider's documented RPM (requests per minute) limits.
   */
  providerConcurrency: {
    gemini: 15,     // Conservative client-side batch concurrency; account limits vary
    groq: 25,       // Conservative client-side batch concurrency; account limits vary
    openai: 40,     // Conservative client-side batch concurrency; account limits vary
    claude: 20,     // Completion concurrency only; Claude has no embedding endpoint here
    apertus: 15,    // Conservative default
    ollama: 5,      // Local CPU — avoid OOM / request queue congestion
  } as Record<string, number>,

  /**
   * Gini coefficient interpretation thresholds
   * Based on standard inequality analysis conventions
   */
  giniInterpretation: {
    low: 0.2,      // < 0.2 = low inequality (well-distributed)
    moderate: 0.35, // 0.2-0.35 = moderate inequality
    high: 0.5       // > 0.35 = high inequality, > 0.5 = very high
  },

  /**
   * Representation score interpretation (dense-embedding scale).
   *
   * Retained as the default so every existing consumer keeps working. For
   * tier-aware behaviour prefer `getRepresentationBands(tier)` below.
   */
  representationInterpretation: {
    atRisk: 0.3,    // < 0.3 = stronger evidence-review marker
    low: 0.5,       // < 0.5 = lower alignment review band
    adequate: 0.6,  // provisional middle/upper boundary
    good: 0.7       // provisional high-alignment display boundary
  },

  /**
   * Tier-specific interpretation bands.
   *
   * Representation scores are NOT comparable across embedding tiers. Dense
   * models place related texts at high cosine similarity, whereas the local
   * TF-IDF fallback is sparse and produces systematically lower scores for the
   * same underlying content. Applying one global band to both makes the TF-IDF
   * path flag almost everybody: on the Deliberative Provenance Benchmark the
   * 0.5 "low" cut-off gave 100% recall but as little as 7% precision (38 false
   * positives out of 43 participants).
   *
   * The TF-IDF `low` value is a project-specific development threshold. It and
   * the remaining display bands are provisional and should be recalibrated for
   * the intended corpus, language, and embedding method. Dense bands are also
   * provisional.
   */
  representationInterpretationByTier: {
    dense: { atRisk: 0.30, low: 0.50, adequate: 0.60, good: 0.70, target: 0.60 },
    tfidf: { atRisk: 0.10, low: 0.16, adequate: 0.19, good: 0.22, target: 0.19 },
  }
};

export interface RepresentationBands {
  atRisk: number; low: number; adequate: number; good: number; target: number;
}

/**
 * Returns the interpretation bands appropriate to the embedding tier that
 * produced the scores. Any dense provider (or an unknown/absent tier) uses the
 * dense bands; only the local TF-IDF fallback uses the calibrated low-scale
 * bands.
 */
export const getRepresentationBands = (tier?: string | null): RepresentationBands =>
  tier === 'tfidf'
    ? ANALYSIS_CONFIG.representationInterpretationByTier.tfidf
    : ANALYSIS_CONFIG.representationInterpretationByTier.dense;

export const SAMPLE_DATA: ParticipantInput[] = [
  { id: "Citizen_001", text: "We need more accessible reporting tools. Current forms are too technical for non-scientists." },
  { id: "Citizen_002", text: "Local knowledge about bird migration patterns is being ignored by researchers." },
  { id: "Citizen_003", text: "The mobile app crashes frequently when trying to upload observations in areas with poor connectivity." },
  { id: "Citizen_004", text: "Indigenous community members have valuable ecological knowledge but feel excluded from the process." },
  { id: "Citizen_005", text: "Data validation is too strict - my observations keep getting rejected even though they're accurate." },
  { id: "Citizen_006", text: "More training sessions needed. I don't understand how to identify species correctly." },
  { id: "Citizen_007", text: "The project focuses too much on data quantity over quality of engagement." },
  { id: "Citizen_008", text: "We should have more say in research questions. Scientists decide everything unilaterally." },
  { id: "Citizen_009", text: "Young people are interested but the platform isn't mobile-friendly enough." },
  { id: "Citizen_010", text: "Language barriers prevent non-English speakers from participating fully." },
  { id: "Citizen_011", text: "Recognition for contributors is important. We volunteer our time and expertise." },
  { id: "Citizen_012", text: "The feedback loop is broken - I submit data but never hear if it was useful." },
  { id: "Citizen_013", text: "Privacy concerns about sharing exact locations of sensitive species." },
  { id: "Citizen_014", text: "More diverse participants needed. Current group doesn't represent our community demographics." },
  { id: "Citizen_015", text: "Scientific jargon makes results inaccessible to those who collected the data." },
  { id: "Citizen_016", text: "Seasonal observations are valuable but the project only runs during summer months." },
  { id: "Citizen_017", text: "Local environmental knowledge spans generations but isn't considered 'scientific' enough." },
  { id: "Citizen_018", text: "The project should compensate participants for their time, especially from low-income communities." },
  { id: "Citizen_019", text: "Co-creation means shared decision-making, not just data collection by volunteers." },
  { id: "Citizen_020", text: "Traditional ecological calendars should be integrated with scientific observation protocols." },
  { id: "Citizen_021", text: "I cannot read the small font on the map interface, please add accessibility settings for visually impaired users." },
  { id: "Citizen_022", text: "There is no way to report pollution incidents alongside species data, which misses the context." },
  { id: "Citizen_023", text: "We need an offline mode. I do my best work in the mountains where there is zero signal." },
  { id: "Citizen_024", text: "Why is the data not open source? We collect it, but we have to pay to access the final reports." },
  { id: "Citizen_025", text: "The gamification elements are distracting. I want to contribute to science, not earn badges." },
  { id: "Citizen_026", text: "Local schools want to get involved but the curriculum materials are too complex for children." },
  { id: "Citizen_027", text: "Researchers drop in for a week and leave. We need long-term relationship building with the town." },
  { id: "Citizen_028", text: "Can we track invasive species? That is the biggest issue destroying our local crops right now." },
  { id: "Citizen_029", text: "The automated image recognition AI is biased towards common species and mislabels rare ones." },
  { id: "Citizen_030", text: "Funding should be allocated for local community leaders to organize the fieldwork, not just for university staff." }
];

export const MOCK_SUMMARY = "The community emphasizes the need for more accessible and inclusive tools, noting that technical jargon and strict validation hinder participation. There is a strong call to respect and integrate local and Indigenous ecological knowledge, rather than relying solely on traditional scientific protocols. Participants urge for better feedback loops, mobile-friendly platforms, and recognition of their time. Furthermore, equity concerns regarding language barriers, privacy, and compensation are highlighted as critical for true co-creation.";

// ── Benchmark datasets for calibration ────────────────────────────────────────

/** Diverse-topic synthetic fixture. Outcomes depend on the chosen summary and embedding model. */
export const BENCHMARK_FAIR: ParticipantInput[] = [
  { id: "Fair_01", text: "Public transit frequency needs to increase during off-peak hours to serve shift workers." },
  { id: "Fair_02", text: "More green spaces and pocket parks in the downtown core would improve mental health." },
  { id: "Fair_03", text: "Affordable childcare is the biggest barrier preventing parents from attending public meetings." },
  { id: "Fair_04", text: "Cycling infrastructure should connect residential areas to the waterfront trail safely." },
  { id: "Fair_05", text: "Community gardens on vacant lots could address food insecurity and build social cohesion." },
  { id: "Fair_06", text: "Noise pollution from highway traffic affects sleep quality in the south-end neighbourhoods." },
  { id: "Fair_07", text: "Senior citizens need more accessible public benches and rest areas along walking routes." },
  { id: "Fair_08", text: "Youth employment programs should partner with local businesses for real apprenticeships." },
  { id: "Fair_09", text: "Stormwater management upgrades are overdue — flooding damages basements every spring." },
  { id: "Fair_10", text: "The library should extend evening hours so working families can actually use it." },
  { id: "Fair_11", text: "Small business grants should prioritize immigrant entrepreneurs who face language barriers." },
  { id: "Fair_12", text: "Public art installations can transform underused spaces into vibrant community gathering points." },
  { id: "Fair_13", text: "Sidewalk snow clearing is inconsistent and makes winter walking dangerous for disabled residents." },
  { id: "Fair_14", text: "Mental health crisis response should be separate from police, using trained social workers." },
  { id: "Fair_15", text: "Heritage building preservation maintains our cultural identity while attracting tourism revenue." },
];

/** Dominant-topic synthetic fixture with three deliberately distinct records. */
export const BENCHMARK_UNFAIR: ParticipantInput[] = [
  { id: "Unfair_01", text: "Property taxes are too high. We need immediate reductions to keep homeowners in the city." },
  { id: "Unfair_02", text: "City council spends too much on administrative overhead. Cut the bureaucracy and lower taxes." },
  { id: "Unfair_03", text: "My property tax assessment is unfair. The house down the street pays less for a bigger lot." },
  { id: "Unfair_04", text: "Tax increases are driving families to the suburbs. We need fiscal responsibility." },
  { id: "Unfair_05", text: "The tax rate has gone up every year for a decade. When does it stop?" },
  { id: "Unfair_06", text: "Stop wasting tax money on bike lanes nobody uses. Fix the potholes instead." },
  { id: "Unfair_07", text: "Taxes should be frozen for seniors on fixed incomes. They built this community." },
  { id: "Unfair_08", text: "Every new spending proposal means higher taxes. The council has no spending discipline." },
  { id: "Unfair_09", text: "Small businesses are crushed by commercial property tax rates. We need relief." },
  { id: "Unfair_10", text: "The municipal budget is bloated. An external audit would find millions in savings." },
  { id: "Unfair_11", text: "My elderly mother cannot afford to heat her home because of the utility surcharge on her tax bill." },
  { id: "Unfair_12", text: "Tax dollars should stay in the neighbourhood that generates them, not be redistributed downtown." },
  // These deliberately off-topic records test whether a tax-focused summary omits them:
  { id: "Unfair_13", text: "We need a women's shelter on the east side. The nearest one is 45 minutes away by bus." },
  { id: "Unfair_14", text: "Refugee families have no translation services at city hall. They cannot access basic services." },
  { id: "Unfair_15", text: "The Indigenous burial ground near the new development site must be protected by law immediately." },
];

/** Map of sample dataset IDs to their data and descriptions */
export const SAMPLE_DATASETS: Record<string, { data: ParticipantInput[]; label: string; description: string; expectedGini: string }> = {
  citizen: { data: SAMPLE_DATA, label: 'Citizen Science Feedback', description: '30 diverse citizen science perspectives', expectedGini: '~0.30' },
  fair: { data: BENCHMARK_FAIR, label: 'Diverse-topic fixture', description: '15 synthetic urban-planning contributions spanning distinct topics', expectedGini: 'summary/model dependent' },
  unfair: { data: BENCHMARK_UNFAIR, label: 'Dominant-topic fixture', description: '12 tax-focused and 3 deliberately distinct synthetic contributions', expectedGini: 'summary/model dependent' },
};
