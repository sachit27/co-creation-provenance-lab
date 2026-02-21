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
    bootstrapSamples: 200
  },

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
