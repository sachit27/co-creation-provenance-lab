import type { ParticipantInput, ThresholdConfig } from './types';

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
     * A reported hard partition must have positive mean silhouette: on average,
     * records are closer to their own group than the nearest alternative group.
     * No stronger universal cut-off is claimed. Robustness is screened by the
     * resampling, neighbourhood and method-agreement checks below.
     */
    minSilhouette: 0,
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
    /** Legacy projection settings retained to interpret saved v1-v3 reports.
     * Version 4 fits new partitions in the original embedding space. */
    maxClusteringDimensions: 128,
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
  // Synthetic municipal consultation about urban nature-based solutions. ID
  // prefixes preserve a planted answer key for regression tests only; they are
  // never supplied to the unsupervised clustering algorithm.
  { id: "Heat_01", text: "For urban heat and tree canopy planning, heatwaves make the walk to the station unbearable. Continuous rows of mature shade trees along the main walking routes would cool the pavement and protect older residents." },
  { id: "Heat_02", text: "For urban heat and tree canopy planning, bus stops, playgrounds, and school entrances need shade trees. These are the places where children and transit users wait in direct summer sun." },
  { id: "Heat_03", text: "For urban heat and tree canopy planning, the lowest-income blocks have the least canopy and the highest surface temperatures. Street-tree investment should begin in these heat-exposed neighbourhoods rather than the already leafy districts." },
  { id: "Heat_04", text: "For urban heat and tree canopy planning, large connected tree pits would give shade trees enough soil and water to survive. Small sealed pits produce weak canopy and little cooling." },
  { id: "Heat_05", text: "For urban heat and tree canopy planning, new shade trees should be drought tolerant and diverse enough to withstand hotter summers, pests, and water restrictions. A single species could fail across the whole avenue." },
  { id: "Heat_06", text: "For urban heat and tree canopy planning, tree roots are lifting narrow pavements near the clinic. Root-friendly surfaces and adequate soil should preserve accessible paths without removing the cooling canopy." },
  { id: "Heat_07", text: "For urban heat and tree canopy planning, dense apartment blocks have little room for large trees. Green roofs, climbing plants, and vegetated courtyards could provide cooling where street planting is constrained." },
  { id: "Heat_08", text: "For urban heat and tree canopy planning, the city should monitor shade, summer surface temperature, tree survival, and canopy growth. Counting saplings does not show whether heat exposure actually falls." },
  { id: "Heat_09", text: "For urban heat and tree canopy planning, mature shade trees should be retained during redevelopment. Replacement saplings take decades to provide equivalent cooling, so permits need stronger canopy protections." },
  { id: "Heat_10", text: "For urban heat, tree canopy, equitable access, and community stewardship, residents could co-design shaded walking routes and care for new street trees. Paid neighbourhood stewards would connect heat protection, canopy maintenance, and local employment." },

  { id: "Water_01", text: "For stormwater and flood resilience planning, rain gardens beside streets could capture runoff before it reaches overloaded drains. They should be placed first around homes and underpasses that flood after intense storms." },
  { id: "Water_02", text: "For stormwater and flood resilience planning, vegetated bioswales can slow and filter runoff before it reaches the river. Their inlets must prevent leaves and litter from blocking the flow." },
  { id: "Water_03", text: "For stormwater and flood resilience planning, restoring the riverside wetland would create space for floodwater during major storms. Building on that low ground would remove a natural flood buffer." },
  { id: "Water_04", text: "For stormwater and flood resilience planning, permeable paving would let rainfall soak into the soil. It should be combined with planted retention areas rather than treated as a decorative surface." },
  { id: "Water_05", text: "For stormwater and flood resilience planning, the buried stream should be reopened and reconnected to its floodplain. A restored channel could reduce flood peaks and improve water quality." },
  { id: "Water_06", text: "For stormwater and flood resilience planning, the community-garden plots occupy the only feasible flood-storage basin. Every plot should be removed so the entire site can become a stormwater retention area." },
  { id: "Water_07", text: "For stormwater and flood resilience planning, rain gardens fail when sediment, rubbish, and invasive plants are not cleared. The flood plan needs a funded inspection and maintenance schedule." },
  { id: "Water_08", text: "For stormwater and flood resilience planning, households should receive grants for rain barrels and small infiltration gardens. Many distributed actions could reduce pressure on the drainage network." },
  { id: "Water_09", text: "For stormwater and flood resilience planning, water-depth markers and sensors could show whether wetlands and retention basins work during storms. Flood-prone residents should help interpret the results." },
  { id: "Water_10", text: "For stormwater, flood resilience, urban biodiversity, and native habitat, a connected wetland corridor could store runoff and create habitat for amphibians and water birds. Flood management and ecological recovery should be planned together." },

  { id: "Habitat_01", text: "For urban biodiversity and native habitat planning, small parks should form connected wildlife corridors between the river, woodland, and railway edge. Isolated flower beds are not enough." },
  { id: "Habitat_02", text: "For urban biodiversity and native habitat planning, pollinator meadows should provide food for bees and butterflies from spring through autumn. Pesticides should be excluded from these habitats." },
  { id: "Habitat_03", text: "For urban biodiversity and native habitat planning, dead wood, hollow trees, and leaf litter should remain in quieter parks. These features provide nesting and overwintering habitat." },
  { id: "Habitat_04", text: "For urban biodiversity and native habitat planning, a wet meadow beside the river would support insects, amphibians, and ground-nesting birds. Seasonal flooding should be treated as part of the habitat." },
  { id: "Habitat_05", text: "For urban biodiversity and native habitat planning, frequent mowing removes flowers and shelter. A mosaic of paths and taller meadow zones would retain access while supporting wildlife." },
  { id: "Habitat_06", text: "For urban biodiversity and native habitat planning, invasive plants need careful removal followed by native restoration. Clearing vegetation without replanting would damage habitat and invite reinvasion." },
  { id: "Habitat_07", text: "For urban biodiversity and native habitat planning, quiet refuges are essential for vulnerable wildlife. Public maps must hide precise nest sites and sensitive-species coordinates to prevent disturbance and collection." },
  { id: "Habitat_08", text: "For urban biodiversity and native habitat planning, public schemes should use locally appropriate native species and avoid ornamental plants that offer little food or shelter. Ecological function should guide procurement." },
  { id: "Habitat_09", text: "For urban biodiversity and native habitat planning, bird, bat, pollinator, and vegetation surveys are needed before and after restoration. Monitoring should cover several seasons." },
  { id: "Habitat_10", text: "For urban biodiversity, native habitat, and community stewardship, schools and neighbourhood groups could care for pollinator gardens while learning to identify native plants and insects." },

  { id: "Stewardship_01", text: "For equitable access and community stewardship, residents should choose the locations and designs of new green spaces before plans are finalized. Local knowledge can reveal unsafe paths and overlooked needs." },
  { id: "Stewardship_02", text: "For equitable access and community stewardship, nature-based projects need paid local stewards rather than unpaid volunteers alone. Green maintenance jobs should include young people and excluded residents." },
  { id: "Stewardship_03", text: "For equitable access and community stewardship, parks and river paths need step-free entrances, seating, clear signs, and accessible toilets. Green space provides little benefit when disabled residents cannot use it." },
  { id: "Stewardship_04", text: "For equitable access and community stewardship, greening must not raise rents and displace the people it should benefit. Housing protections should accompany park and riverfront improvements." },
  { id: "Stewardship_05", text: "For equitable access and community stewardship, tenants, children, older residents, and minority-language communities should vote on project priorities before budgets and sites are fixed." },
  { id: "Stewardship_06", text: "For equitable access and community stewardship, the community-garden plots must remain in their current location and must not become flood storage. Families depend on the whole site for food and social support." },
  { id: "Stewardship_07", text: "For equitable access and community stewardship, residents need full evidence to scrutinize conservation decisions. Every wildlife observation should be released as unredacted open data with its precise coordinates." },
  { id: "Stewardship_08", text: "For equitable access and community stewardship, the city should publish a long-term maintenance budget before opening parks, rain gardens, or tree pits. Pilot projects should not deteriorate after grants end." },
  { id: "Stewardship_09", text: "For equitable access and community stewardship, a public dashboard should show which neighbourhood proposals were funded, what work was completed, and how benefits were measured. Residents need a route to report problems." },
  { id: "Stewardship_10", text: "For equitable access, community stewardship, stormwater, and flood resilience, paid neighbourhood teams could maintain rain gardens in flood-prone low-income blocks and report blocked inlets after storms." }
];

export const MOCK_SUMMARY = "Participants proposed nature-based solutions for urban heat, flooding, biodiversity, and equitable access. Heat priorities included mature shade trees, resilient planting, green roofs, accessible pavements, and monitoring of canopy and temperature. Stormwater proposals included rain gardens, bioswales, permeable paving, wetlands, stream restoration, household infiltration, and funded maintenance. Biodiversity priorities included connected native habitat, pollinator meadows, varied mowing, dead wood, sensitive-species protection, and seasonal monitoring. Residents also requested co-design, accessible green space, paid stewardship, anti-displacement protections, transparent budgets, and public feedback. Some proposals conflict over the future of community-garden land and whether precise rare-species locations should be public.";

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
  citizen: { data: SAMPLE_DATA, label: 'Nature-Based Solutions Consultation', description: '40 synthetic contributions on urban heat, stormwater, biodiversity, and equitable stewardship', expectedGini: 'summary/model dependent' },
  fair: { data: BENCHMARK_FAIR, label: 'Diverse-topic fixture', description: '15 synthetic urban-planning contributions spanning distinct topics', expectedGini: 'summary/model dependent' },
  unfair: { data: BENCHMARK_UNFAIR, label: 'Dominant-topic fixture', description: '12 tax-focused and 3 deliberately distinct synthetic contributions', expectedGini: 'summary/model dependent' },
};
