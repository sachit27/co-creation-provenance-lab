import { ParticipantInput, ThresholdConfig } from './types';

/**
 * Statistical Configuration Constants
 * All thresholds are documented with statistical justification
 */
export const ANALYSIS_CONFIG = {
  /**
   * Default threshold configuration with statistical justifications
   */
  thresholds: {
    /**
     * Representation Target: 0.6
     * Justification: Based on semantic similarity literature, cosine similarity > 0.6
     * indicates "similar" content (Mihalcea & Tarau, 2004). This is the median
     * threshold used in text similarity benchmarks.
     */
    representationTarget: 0.6,

    /**
     * Matching Threshold: 0.5 (changed from 0.45)
     * Justification: Standard threshold for "related" content in semantic similarity.
     * Values < 0.5 typically indicate weak or no semantic relationship.
     * This follows the common practice in IR systems.
     */
    matchingThreshold: 0.5,

    /**
     * Isolation Percentile: 0.25 (top quartile)
     * Justification: Uses the statistical convention of quartiles (Q1, Q2, Q3).
     * The top 25% most isolated participants are flagged, following the
     * interquartile range (IQR) convention for identifying outliers.
     */
    isolationPercentile: 0.25,

    /**
     * Representation Gap Percentile: 0.75 (bottom three quartiles)
     * Justification: Complementary to isolation percentile. Compares the
     * top quartile (distinct) against the bottom three quartiles (majority).
     * This is a standard approach in inequality analysis.
     */
    representationPercentile: 0.75,

    /**
     * Anomaly Z-Threshold: 2.0
     * Justification: Standard statistical convention. Z > 2 corresponds to
     * approximately 95th percentile (p < 0.05), commonly used to identify
     * statistically significant outliers.
     */
    anomalyZThreshold: 2.0
  } as ThresholdConfig,

  /**
   * Algorithm parameters
   */
  algorithms: {
    /**
     * PCA iterations for power method
     * Justification: 10 iterations typically achieve convergence for the
     * dominant eigenvector within machine precision for most embedding spaces.
     */
    pcaIterations: 10,

    /**
     * K-Means iterations
     * Justification: 15 iterations is sufficient for convergence in most cases.
     * Lloyd's algorithm typically converges in O(k * n * d * i) time.
     */
    kmeansIterations: 15,

    /**
     * K-Means elbow threshold
     * Justification: 15% improvement threshold. If adding another cluster
     * reduces within-cluster variance by less than 15%, we've reached
     * diminishing returns. Based on the elbow method heuristic.
     */
    elbowThreshold: 0.15,

    /**
     * Maximum clusters
     * Justification: Limited to 5 for interpretability. More clusters
     * reduce within-cluster variance but increase cognitive load.
     * Rule of thumb: k << sqrt(n/2)
     */
    maxClusters: 5,

    /**
     * Bootstrap samples for uncertainty quantification
     * Justification: 200 samples provides stable CI estimates.
     * Standard error of bootstrap estimate ~ 1/sqrt(B).
     */
    bootstrapSamples: 200,

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
    gemini: 15,     // Free tier: 1,500 RPM
    groq: 25,       // Free tier: 30 RPM burst-friendly
    openai: 40,     // Standard: 3,000 RPM
    claude: 20,     // Standard: 1,000 RPM (no embeddings, but for completions)
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
   * Representation score interpretation
   */
  representationInterpretation: {
    atRisk: 0.3,    // < 0.3 = at risk of being completely missed
    low: 0.5,       // 0.3-0.5 = underrepresented
    adequate: 0.6,  // 0.5-0.6 = marginally represented
    good: 0.7       // > 0.7 = well represented
  }
};

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

/** Balanced consultation — diverse topics, ~equal voice weights. Expected Gini ≤ 0.25 */
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

/** Majority-dominated consultation — one topic dominates, minority voices drowned out. Expected Gini ≥ 0.45 */
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
  // These minority voices will likely be underrepresented in a summary dominated by tax complaints:
  { id: "Unfair_13", text: "We need a women's shelter on the east side. The nearest one is 45 minutes away by bus." },
  { id: "Unfair_14", text: "Refugee families have no translation services at city hall. They cannot access basic services." },
  { id: "Unfair_15", text: "The Indigenous burial ground near the new development site must be protected by law immediately." },
];

/** Map of sample dataset IDs to their data and descriptions */
export const SAMPLE_DATASETS: Record<string, { data: ParticipantInput[]; label: string; description: string; expectedGini: string }> = {
  citizen: { data: SAMPLE_DATA, label: 'Citizen Science Feedback', description: '30 diverse citizen science perspectives', expectedGini: '~0.30' },
  fair: { data: BENCHMARK_FAIR, label: '✅ Balanced Consultation', description: '15 diverse urban planning topics (benchmark: Gini ≤ 0.25)', expectedGini: '≤ 0.25' },
  unfair: { data: BENCHMARK_UNFAIR, label: '⚠️ Majority-Dominated', description: '15 inputs where one topic dominates (benchmark: Gini ≥ 0.45)', expectedGini: '≥ 0.45' },
};
