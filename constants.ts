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
    /** Minimum adjusted-Rand agreement with a same-k cosine average-linkage
     * sensitivity partition. */
    minClusteringMethodAgreement: 0.75,
    /** Maximum deterministic subsample used for the average-linkage
     * method-sensitivity hierarchy, whose exact implementation is cubic. */
    clusterMethodSensitivityMaxSampleSize: 160,
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
  // Synthetic demonstration fixture with four planted themes. The repeated
  // concerns make semantic grouping inspectable; the mixed-theme records at
  // the end of each theme create plausible cross-group connector candidates.
  // ID prefixes preserve the planted answer key for regression tests. They are
  // never supplied to the unsupervised clustering algorithm.
  { id: "Digital_01", text: "Mobile field tools topic: mobile app, offline reporting, digital accessibility, and field technology. The field app needs offline data collection so observations can be saved without mobile coverage and synchronized later." },
  { id: "Digital_02", text: "Mobile field tools topic: mobile app, offline reporting, digital accessibility, and field technology. Photo uploads fail whenever the signal is weak. The mobile app should queue every observation and upload it after connectivity returns." },
  { id: "Digital_03", text: "Mobile field tools topic: mobile app, offline reporting, digital accessibility, and field technology. The map interface needs larger text, screen-reader labels, and high-contrast controls so visually impaired volunteers can report observations." },
  { id: "Digital_04", text: "Mobile field tools topic: mobile app, offline reporting, digital accessibility, and field technology. GPS tracking drains the phone battery during long surveys. A battery-efficient field mode would make mobile monitoring practical." },
  { id: "Digital_05", text: "Mobile field tools topic: mobile app, offline reporting, digital accessibility, and field technology. Automated image recognition often mislabels rare species. The app should let contributors correct a prediction before submitting it." },
  { id: "Digital_06", text: "Mobile field tools topic: mobile app, offline reporting, digital accessibility, and field technology. To standardize reporting, the field form should accept only scientific taxonomy and should reject local species names. Allowing multiple naming systems would make automated validation inconsistent." },
  { id: "Digital_07", text: "Mobile field tools topic: mobile app, offline reporting, digital accessibility, and field technology. The app loses draft observations after a crash. Local recovery and automatic saving are essential for reliable fieldwork." },
  { id: "Digital_08", text: "Mobile field tools topic: mobile app, offline reporting, digital accessibility, and field technology. Sensitive species locations should be blurred automatically on the public map while authorized researchers retain precise coordinates." },
  { id: "Digital_09", text: "Mobile field tools topic: mobile app, offline reporting, digital accessibility, and field technology. A contributor dashboard should show whether each mobile submission passed validation and how the observation was used." },
  { id: "Digital_10", text: "Mobile field tools topic: mobile app, offline reporting, digital accessibility, and field technology. A shared offline portal should queue field observations, synchronize uploads, and let contributors manage consent and approve access to each record. Contributors need record-level feedback, reversible consent, and transparent data access. The portal should link mobile reliability to shared governance decisions." },

  { id: "Governance_01", text: "Community governance topic: consent, shared decisions, participant feedback, and community data rights. Community members should share authority over research questions instead of only collecting data chosen by university scientists." },
  { id: "Governance_02", text: "Community governance topic: consent, shared decisions, participant feedback, and community data rights. Every contributor needs a transparent feedback loop explaining which observations informed the study and why some records were rejected." },
  { id: "Governance_03", text: "Community governance topic: consent, shared decisions, participant feedback, and community data rights. Volunteer expertise should be credited in publications and reports through an agreed contributor recognition policy." },
  { id: "Governance_04", text: "Community governance topic: consent, shared decisions, participant feedback, and community data rights. The project budget should compensate community organizers and low-income participants for the time they contribute." },
  { id: "Governance_05", text: "Community governance topic: consent, shared decisions, participant feedback, and community data rights. Consent must remain reversible. Contributors need a clear process for withdrawing records and sensitive location data." },
  { id: "Governance_06", text: "Community governance topic: consent, shared decisions, participant feedback, and community data rights. Data collected by residents should be available under an open community license instead of being locked behind paid reports." },
  { id: "Governance_07", text: "Community governance topic: consent, shared decisions, participant feedback, and community data rights. A community steering committee should approve research priorities, data access rules, and decisions about publication." },
  { id: "Governance_08", text: "Community governance topic: consent, shared decisions, participant feedback, and community data rights. Researchers need long-term relationships with the town, including regular meetings after a field campaign ends." },
  { id: "Governance_09", text: "Community governance topic: consent, shared decisions, participant feedback, and community data rights. All project data, including exact observation locations and culturally sensitive records, should be openly available under a community license. Restricting access would undermine transparency." },
  { id: "Governance_10", text: "Community governance topic: consent, shared decisions, participant feedback, and community data rights. A shared offline portal should queue field observations, synchronize uploads, and let contributors manage consent and approve access to each record. Contributors need record-level feedback, reversible consent, and transparent data access. The portal should link mobile reliability to shared governance decisions." },

  { id: "Knowledge_01", text: "Local ecological knowledge topic: seasonal evidence, Indigenous expertise, and place-based monitoring. Indigenous indicators of ecosystem health should guide monitoring alongside laboratory measurements and scientific sampling protocols." },
  { id: "Knowledge_02", text: "Local ecological knowledge topic: seasonal evidence, Indigenous expertise, and place-based monitoring. Traditional seasonal calendars record flowering, rainfall, and animal movement patterns that short research projects miss." },
  { id: "Knowledge_03", text: "Local ecological knowledge topic: seasonal evidence, Indigenous expertise, and place-based monitoring. Residents have tracked bird migration routes for decades, and their place-based observations should inform the ecological baseline." },
  { id: "Knowledge_04", text: "Local ecological knowledge topic: seasonal evidence, Indigenous expertise, and place-based monitoring. Farmers can identify the arrival of invasive species through crop damage long before a formal regional survey is published." },
  { id: "Knowledge_05", text: "Local ecological knowledge topic: seasonal evidence, Indigenous expertise, and place-based monitoring. Elders' oral histories describe changes in wetlands and wildlife across generations and should be treated as ecological evidence." },
  { id: "Knowledge_06", text: "Local ecological knowledge topic: seasonal evidence, Indigenous expertise, and place-based monitoring. Fishers understand spawning grounds, currents, and seasonal habitat changes through daily experience on the water." },
  { id: "Knowledge_07", text: "Local ecological knowledge topic: seasonal evidence, Indigenous expertise, and place-based monitoring. Culturally sensitive ecological knowledge and exact observation locations must never be made openly available. Knowledge holders should control any restricted access." },
  { id: "Knowledge_08", text: "Local ecological knowledge topic: seasonal evidence, Indigenous expertise, and place-based monitoring. Local species names and classifications contain ecological distinctions that are lost when the database accepts only scientific taxonomy." },
  { id: "Knowledge_09", text: "Local ecological knowledge topic: seasonal evidence, Indigenous expertise, and place-based monitoring. Place-based monitoring across many seasons can reveal environmental change that a short scientific visit cannot detect." },
  { id: "Knowledge_10", text: "Elders should lead hands-on youth workshops that combine local species names, seasonal ecological calendars, and field identification practice. Place-based knowledge and inclusive volunteer training belong in the same learning process." },

  { id: "Learning_01", text: "Inclusive training topic: education, workshops, volunteer learning, and accessible participation. Hands-on field workshops are needed so new volunteers can practise species identification before collecting research data." },
  { id: "Learning_02", text: "Inclusive training topic: education, workshops, volunteer learning, and accessible participation. Training guides and onboarding sessions should be translated so non-English speakers can participate confidently." },
  { id: "Learning_03", text: "Inclusive training topic: education, workshops, volunteer learning, and accessible participation. Local schools need age-appropriate curriculum materials that let children contribute observations to the science project." },
  { id: "Learning_04", text: "Inclusive training topic: education, workshops, volunteer learning, and accessible participation. Accessible onboarding should use plain language, captions, large print, and demonstrations instead of scientific jargon." },
  { id: "Learning_05", text: "Inclusive training topic: education, workshops, volunteer learning, and accessible participation. Experienced volunteers could mentor new participants during their first surveys and answer identification questions in the field." },
  { id: "Learning_06", text: "Inclusive training topic: education, workshops, volunteer learning, and accessible participation. Practice sessions with reference specimens would help volunteers calibrate observations and understand data-quality checks." },
  { id: "Learning_07", text: "Inclusive training topic: education, workshops, volunteer learning, and accessible participation. Travel reimbursement, childcare, and paid participation are necessary because many residents cannot attend unpaid daytime training. A volunteer-only model would exclude them." },
  { id: "Learning_08", text: "Inclusive training topic: education, workshops, volunteer learning, and accessible participation. Bilingual facilitators should lead community training so language differences do not exclude interested participants." },
  { id: "Learning_09", text: "Inclusive training topic: education, workshops, volunteer learning, and accessible participation. Participants need constructive coaching when a record fails validation rather than receiving a technical error message." },
  { id: "Learning_10", text: "Youth training should pair elders and students in accessible field workshops where local species names, seasonal knowledge, and scientific identification are learned together. Inclusive education should be led by place-based knowledge holders." }
];

export const MOCK_SUMMARY = "Participants want reliable mobile field tools with offline reporting, accessible interfaces, recoverable drafts, transparent validation feedback, and privacy controls for sensitive locations. Community governance proposals call for shared decisions, reversible consent, open community data rights, contributor recognition, compensation, and long-term participant feedback. Local ecological knowledge, including Indigenous expertise, seasonal calendars, local species names, and place-based monitoring, should be respected alongside scientific protocols. Inclusive training should provide multilingual and accessible education, hands-on workshops, mentoring, school materials, childcare, travel support, and opportunities for elders and young volunteers to learn together.";

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
  citizen: { data: SAMPLE_DATA, label: 'Citizen Science Deliberation', description: '40 synthetic contributions with four planted themes and mixed-theme connectors', expectedGini: 'summary/model dependent' },
  fair: { data: BENCHMARK_FAIR, label: 'Diverse-topic fixture', description: '15 synthetic urban-planning contributions spanning distinct topics', expectedGini: 'summary/model dependent' },
  unfair: { data: BENCHMARK_UNFAIR, label: 'Dominant-topic fixture', description: '12 tax-focused and 3 deliberately distinct synthetic contributions', expectedGini: 'summary/model dependent' },
};
