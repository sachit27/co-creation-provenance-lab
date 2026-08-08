import React, { useState, useEffect, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { MetricDefinition } from '../../types';
import { ANALYSIS_CONFIG } from '../../constants';

/**
 * Comprehensive metric definitions with statistical justifications
 * All thresholds are sourced from ANALYSIS_CONFIG for consistency
 */
export const METRIC_DEFINITIONS: Record<string, MetricDefinition> = {
  'gini': {
    label: 'Gini Coefficient',
    description: 'A statistical measure of inequality in how the AI summary represents different participants. Originally developed by Corrado Gini (1912) for income inequality.',
    implication: '0.0 = Perfect equality (everyone represented equally). 1.0 = Maximum inequality (summary reflects only one person).',
    idealRange: `< ${ANALYSIS_CONFIG.giniInterpretation.low} (low inequality)`,
    formula: 'G = (2·Σ(i·xᵢ))/(n·Σxᵢ) - (n+1)/n',
    thresholdJustification: `< ${ANALYSIS_CONFIG.giniInterpretation.low}: Low inequality. ${ANALYSIS_CONFIG.giniInterpretation.low}-${ANALYSIS_CONFIG.giniInterpretation.moderate}: Moderate. > ${ANALYSIS_CONFIG.giniInterpretation.moderate}: High. Based on standard inequality analysis conventions from economics.`
  },
  'gap': {
    label: 'Equity Gap',
    description: 'The difference in average representation scores between "majority" opinions (central views) and "distinct" opinions (outlier/minority views).',
    implication: 'A positive gap means mainstream voices are better represented than unique perspectives. Negative would mean outliers dominate.',
    idealRange: '< 0.1 (balanced)',
    formula: 'Gap = Avg(Majority Rep) - Avg(Distinct Rep)',
    thresholdJustification: `Uses the top ${ANALYSIS_CONFIG.thresholds.isolationPercentile * 100}% most isolated participants as the "distinct" group, based on the interquartile range (IQR) convention for identifying statistical outliers.`
  },
  'diversity': {
    label: 'Input Diversity',
    description: 'Average pairwise semantic distance between all participant inputs. Measures how varied the discussion topics are.',
    implication: 'Low diversity (< 0.3) suggests an "echo chamber" with similar views. High diversity (> 0.6) indicates a rich, multifaceted discussion.',
    idealRange: '0.3 - 0.7 (moderate diversity)',
    formula: 'D = Avg(1 - cos_sim(vᵢ, vⱼ)) for all pairs',
    thresholdJustification: 'Cosine distance ranges from 0 (identical) to 2 (opposite). Values 0.3-0.7 represent typical variation in participatory discussions.'
  },
  'isolation': {
    label: 'Semantic Isolation',
    description: 'How far a participant\'s contribution is from the semantic center of all inputs. Measures uniqueness of perspective.',
    implication: 'High isolation (> 0.5) means this person raised topics others did not discuss. They may be a valuable minority voice or an outlier.',
    idealRange: 'Context dependent',
    formula: 'Isolation = 1 - cos_sim(embedding, global_centroid)',
    thresholdJustification: `Top ${ANALYSIS_CONFIG.thresholds.isolationPercentile * 100}% most isolated participants are flagged as "distinct voices" following the statistical convention of quartiles (Q1/Q3) for outlier detection.`
  },
  'leverage': {
    label: 'Influence Leverage (Z-Score)',
    description: 'Leave-One-Out (LOO) analysis measuring how much removing this participant would shift the semantic center of the discussion.',
    implication: 'High leverage (Z > 2) means this person significantly influences what the group is talking about. They may be a leader or hold disproportionate sway.',
    idealRange: '-2 < Z < 2 (normal range)',
    formula: 'Z = (shift - μ) / σ, where shift = 1 - cos_sim(centroid, LOO_centroid)',
    thresholdJustification: `Z-score > ${ANALYSIS_CONFIG.thresholds.anomalyZThreshold} corresponds to ~95th percentile (p < 0.05), the standard statistical threshold for identifying significant outliers.`
  },
  'representation': {
    label: 'Representation Score',
    description: 'Maximum cosine similarity between a participant\'s input and any sentence in the AI-generated summary. Measures how well the participant\'s voice was captured.',
    implication: 'Score < 0.5 means the participant\'s key points were likely not included. Score > 0.7 means their contribution was well-represented.',
    idealRange: `> ${ANALYSIS_CONFIG.thresholds.representationTarget} (adequate)`,
    formula: 'Rep = max(cos_sim(input_emb, sentence_emb)) for all summary sentences',
    thresholdJustification: `Target of ${ANALYSIS_CONFIG.thresholds.representationTarget} based on semantic similarity literature (Reimers & Gurevych, 2019). Scores > 0.6 indicate "similar" content in text benchmarks.`
  },
  'atRisk': {
    label: 'At-Risk Participants',
    description: 'Participants in the bottom quartile of representation scores whose scores are meaningfully below the group average. These voices are most likely to be lost.',
    implication: 'At-risk participants need special attention from facilitators to ensure their voices are heard in the final outcome.',
    idealRange: '0 (none at risk)',
    formula: 'At Risk if score ≤ min(Q1, mean × 0.7)',
    thresholdJustification: 'Uses percentile-based (bottom quartile) classification capped at 70% of the mean, following the IQR convention for outlier identification (Tukey, 1977). Adapts to each dataset rather than using a fixed cutoff.'
  },
  'matching': {
    label: 'Matching Threshold',
    description: 'Minimum similarity score for a participant-to-summary connection to be considered "significant" rather than noise.',
    implication: 'Connections below this threshold are considered too weak to indicate meaningful representation.',
    idealRange: `> ${ANALYSIS_CONFIG.thresholds.matchingThreshold}`,
    formula: 'Match = cos_sim > threshold',
    thresholdJustification: `${ANALYSIS_CONFIG.thresholds.matchingThreshold} is the standard threshold in Information Retrieval for "related" content. Values below typically indicate weak or no semantic relationship.`
  },
  'clusters': {
    label: 'Topic Clusters',
    description: 'Groups of participants with semantically similar contributions, identified by K-Means clustering on text embeddings. The optimal number of clusters is selected automatically using the elbow method on within-cluster variance.',
    implication: 'Each cluster represents a distinct thematic perspective in the input. The cluster color is consistent across all views (semantic map, Sankey, similarity network). Cluster membership determines theme extraction for the provenance flow.',
    idealRange: '2-5 clusters for interpretability',
    formula: 'K-Means++ (Arthur & Vassilvitskii, 2007) on PCA-reduced embeddings (5 components). Elbow method: stop when WCSS improvement < 15%.',
    thresholdJustification: `K-Means++ gives O(log k) approximation guarantee. PCA preprocessing addresses curse of dimensionality. Max k=${ANALYSIS_CONFIG.algorithms.maxClusters} ensures interpretability (rule of thumb: k << √(n/2)). ${ANALYSIS_CONFIG.algorithms.elbowThreshold * 100}% elbow threshold balances parsimony vs. fit (Thorndike, 1953).`
  },
  'bootstrap': {
    label: 'Bootstrap Confidence Interval',
    description: 'Statistical uncertainty estimate derived by resampling participants with replacement. Shows the range where the true metric value likely falls.',
    implication: 'Wide confidence intervals indicate high uncertainty in the metric. Narrow intervals mean the estimate is stable.',
    idealRange: '95% CI',
    formula: '95% CI from B bootstrap samples',
    thresholdJustification: `${ANALYSIS_CONFIG.algorithms.bootstrapSamples} bootstrap samples provides stable CI estimates. Standard error of bootstrap ~ 1/√B, so 200 samples gives ~7% error in CI width.`
  },
  'rhetoric': {
    label: 'Rhetorical Influence Analysis',
    description: 'Measures whether a participant\'s communication style (assertiveness, formality, evidence use, emotional intensity) correlates with how well they are represented in the summary.',
    implication: 'A significant positive correlation (p < 0.05) means the AI summarizer favors certain rhetorical styles over others — a form of systematic bias independent of content quality.',
    idealRange: 'No significant correlation (p > 0.05)',
    formula: 'Spearman rank correlation between composite rhetorical score and representation score',
    thresholdJustification: 'Uses Spearman (non-parametric) to avoid distributional assumptions. Significance at p < 0.05 with |r| > 0.3 indicates meaningful bias. Lexicon-based scoring follows computational stylistics conventions (Biber, 1988).'
  },
  'claims': {
    label: 'Claim-Level Attribution',
    description: 'Decomposes summary sentences into atomic claims and traces each claim back to source participant text. Inspired by FActScore (Min et al., 2023) methodology for factual precision evaluation.',
    implication: 'A high attribution score (>70%) means most summary claims are grounded in participant input. Unsupported or contradicted claims indicate the AI introduced information not present in the source data.',
    idealRange: '> 70% grounded (supported + inferrable)',
    formula: 'Attribution = (supported + inferrable) / total_claims',
    thresholdJustification: 'TF-IDF overlap ≥ 0.5 = "supported", ≥ 0.3 = "inferrable". Thresholds from keyword-overlap literature (Robertson & Zaragoza, 2009). LLM refinement disambiguates the 0.25–0.55 boundary zone.'
  },
  'tensions': {
    label: 'Tension & Contradiction Mapping',
    description: 'Identifies genuine disagreements between participant groups and evaluates whether the AI summary acknowledges, suppresses, merges, or distorts each tension.',
    implication: 'Suppressed tensions create false consensus. Merged tensions lose nuance. Distorted tensions misrepresent positions. Only acknowledged tensions preserve the deliberative quality of the input.',
    idealRange: '> 50% acknowledged',
    formula: 'Tension Fidelity = acknowledged_count / total_tensions',
    thresholdJustification: 'Uses cross-cluster representative sampling (max 4 per cluster) with LLM-based tension detection. Caps at 25 tension pairs for scalability. Handling classification uses batch LLM evaluation against the summary text.'
  },
  'sankey': {
    label: 'Provenance Flow (Sankey)',
    description: 'Visualizes the three-column flow from participant inputs through semantic themes to summary sentences. Shows how information is aggregated, filtered, and transformed.',
    implication: 'Orphan themes (no outgoing links) indicate perspectives dropped from the summary. Phantom sentences (no incoming links) indicate AI-generated content with no source basis.',
    idealRange: 'No orphans or phantoms',
    formula: 'Links based on cluster membership (input→theme) and sentence-match similarity ≥ 0.3 (theme→summary)',
    thresholdJustification: 'Aggregation thresholds: ≤40 participants = individual nodes, 40–200 = cluster-level, >200 = super-cluster. These ensure the diagram remains readable at any scale.'
  },
  'thresholdSensitivity': {
    label: 'Threshold Sensitivity Analysis',
    description: 'Shows how the number of affected participants changes as you vary the representation and isolation thresholds. Reveals whether results are robust or brittle — highly sensitive to the exact threshold chosen.',
    implication: 'A steep curve at the current threshold means small changes would reclassify many participants. A flat curve means the results are stable regardless of the exact cutoff.',
    idealRange: 'Flat curve near current threshold (robust)',
    formula: 'For each threshold t in [0.1, 1.0]: count participants where score < t (representation) or isolation > t (isolation)',
    thresholdJustification: 'Sweeps 20 evenly-spaced thresholds. The blue dashed line marks the current threshold. Steep slopes indicate sensitivity — consider reporting confidence intervals instead of point estimates.'
  },
  'semanticSpace': {
    label: 'Semantic Space (PCA)',
    description: 'A 2D projection of high-dimensional text embeddings using Principal Component Analysis (PCA). Each point represents a participant\'s contribution, positioned so that semantically similar inputs appear close together.',
    implication: 'Clusters reveal shared themes. Isolated points (far from any cluster) indicate unique perspectives. Point SIZE reflects representation score — small points are underrepresented voices.',
    idealRange: 'Spread across clusters with no extremely isolated points',
    formula: 'PCA projects N-dimensional embeddings (where N=384 for BGE-M3 or 150 for TF-IDF) onto the 2 directions of maximum variance. Clusters identified via K-Means on the full-dimensional embeddings.',
    thresholdJustification: 'PCA preserves global structure and is deterministic (unlike t-SNE/UMAP). The cluster colors match across all views. Axis labels ("Dimension 1/2") represent the principal components — they are abstract directions, not interpretable features.'
  },
  'similarityNetwork': {
    label: 'Participant Similarity Network',
    description: 'A mutual k-Nearest Neighbors graph where an edge exists between two participants only if both rank each other among their top-k most similar contributions (by cosine similarity on text embeddings). This mutual requirement produces sparse, high-confidence connections.',
    implication: 'Bridge nodes (connecting different clusters) are natural mediators. Peripheral nodes (0-1 connections) may hold unique perspectives that need amplification. High modularity means clusters are real semantic communities, not arbitrary groupings.',
    idealRange: 'Modularity > 0.3 (meaningful communities), no disconnected components',
    formula: 'Mutual k-NN: edge(i,j) iff j in kNN(i) AND i in kNN(j). k = min(5, ceil(sqrt(N))). Metrics: Brandes betweenness O(VE), Newman modularity Q, Watts-Strogatz clustering coefficient.',
    thresholdJustification: 'Mutual k-NN (von Luxburg, 2007) is standard for manifold learning and spectral clustering. Mutual requirement filters spurious one-directional similarity. Brandes (2001) betweenness is the standard O(VE) algorithm. Newman (2004) modularity compares intra-cluster edges to a random null model.'
  },
  'knowledgeGraph': {
    label: 'Knowledge Graph (GraphRAG)',
    description: 'A knowledge graph constructed from participant inputs via LLM-based entity and relationship extraction. Entities are concepts, policies, stakeholders, values, etc. mentioned in participant text. Relationships are semantic connections between entities. Communities are groups of densely connected entities detected via the full Louvain algorithm. Unlike the cluster map (which groups people), this graph maps the conceptual structure of the discussion.',
    implication: 'Communities represent coherent thematic clusters that emerge from participant language — richer than keyword aggregation. Cross-community relationships reveal how different themes connect. Entity frequency shows which concepts dominate the discourse. Isolated entities (with no relationships) are automatically filtered to keep the graph clean.',
    idealRange: 'Modularity Q > 0.3 (meaningful community structure), coverage > 80%',
    formula: 'Entity co-extraction: LLM single-pass with gleaning (Microsoft GraphRAG, 2024). Entity resolution: title-case normalization + Levenshtein fuzzy matching + acronym detection. Bidirectional relationship aggregation. Full Louvain: Phase 1 (local moving) + Phase 2 (network contraction), iterated to convergence (Blondel et al., 2008). Q = (1/2m) * Σ[A_ij - (k_i*k_j)/(2m)] * δ(c_i, c_j).',
    thresholdJustification: 'Single-pass co-extraction is efficient for short deliberative texts. Gleaning (Microsoft GraphRAG, 2024) catches 15-30% additional entities. Fuzzy entity resolution (Levenshtein ≤ 2 + substring + acronym detection) handles near-duplicates. Full Louvain with Phase 2 contraction converges better than Phase 1 alone.'
  },
  'blindspots': {
    label: 'Blind Spots',
    description: 'Participants with both low centrality (unique perspective) AND low representation (not captured in summary). These are unique voices the AI completely missed.',
    implication: 'Blind spots represent the most critical gaps: perspectives that are both different from the mainstream AND absent from the summary.',
    idealRange: '0 (no blind spots)',
    formula: 'Blind spot if centrality < median AND representation < median',
    thresholdJustification: 'Uses median-based dual-condition classification. Medians are robust to outliers (Huber, 1981). The quadrant approach identifies participants who are uniquely positioned AND underrepresented.'
  }
};

interface InfoIconProps {
  metricKey: string;
  size?: 'sm' | 'md';
}

export const InfoIcon: React.FC<InfoIconProps> = ({ metricKey, size = 'sm' }) => {
  const [show, setShow] = useState(false);
  const [pinned, setPinned] = useState(false);
  const [position, setPosition] = useState({ top: 0, left: 0 });
  const buttonRef = React.useRef<HTMLButtonElement>(null);
  const tooltipRef = React.useRef<HTMLDivElement>(null);
  const def = METRIC_DEFINITIONS[metricKey];

  if (!def) return null;

  const iconSize = size === 'sm' ? 14 : 16;

  const computePosition = useCallback(() => {
    if (!buttonRef.current) return;
    const rect = buttonRef.current.getBoundingClientRect();
    const tooltipWidth = 320;
    const padding = 12;

    // Vertical: prefer below, flip above if not enough space
    let top = rect.bottom + 8;
    const spaceBelow = window.innerHeight - rect.bottom;
    if (spaceBelow < 250) {
      top = rect.top - 8; // will use transform to flip above
    }

    // Horizontal: center on button, but clamp to viewport
    let left = rect.left + rect.width / 2;
    const halfWidth = tooltipWidth / 2;
    if (left - halfWidth < padding) {
      left = padding + halfWidth;
    } else if (left + halfWidth > window.innerWidth - padding) {
      left = window.innerWidth - padding - halfWidth;
    }

    setPosition({ top, left });
  }, []);

  const handleClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    e.preventDefault();
    if (pinned) {
      setPinned(false);
      setShow(false);
    } else {
      computePosition();
      setPinned(true);
      setShow(true);
    }
  };

  const handleMouseEnter = () => {
    if (!pinned) {
      computePosition();
      setShow(true);
    }
  };

  const handleMouseLeave = () => {
    if (!pinned) {
      setShow(false);
    }
  };

  // Close pinned tooltip on outside click or Escape
  useEffect(() => {
    if (!pinned) return;

    const handleClickOutside = (e: MouseEvent) => {
      if (
        buttonRef.current && !buttonRef.current.contains(e.target as Node) &&
        tooltipRef.current && !tooltipRef.current.contains(e.target as Node)
      ) {
        setPinned(false);
        setShow(false);
      }
    };

    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setPinned(false);
        setShow(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    document.addEventListener('keydown', handleEscape);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('keydown', handleEscape);
    };
  }, [pinned]);

  // Determine if tooltip should appear above
  const spaceBelow = buttonRef.current
    ? window.innerHeight - buttonRef.current.getBoundingClientRect().bottom
    : 999;
  const showAbove = spaceBelow < 250;

  const tooltipContent = show && createPortal(
    <div
      ref={tooltipRef}
      className="fixed w-80 bg-slate-900 text-white text-xs rounded-lg shadow-2xl border border-slate-700"
      style={{
        top: position.top,
        left: position.left,
        transform: showAbove ? 'translate(-50%, -100%)' : 'translateX(-50%)',
        zIndex: 99999,
      }}
      onClick={(e) => e.stopPropagation()}
    >
      {/* Scrollable content area */}
      <div className="p-4 max-h-[70vh] overflow-y-auto" style={{ scrollbarWidth: 'thin' }}>
        {/* Close button for pinned mode */}
        {pinned && (
          <button
            onClick={() => { setPinned(false); setShow(false); }}
            className="absolute top-2 right-2 text-slate-500 hover:text-white transition-colors"
            aria-label="Close"
          >
            <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
          </button>
        )}

        {/* Header */}
        <div className="font-bold mb-2 text-blue-300 text-sm border-b border-slate-700 pb-2 pr-4">{def.label}</div>

        {/* Description */}
        <div className="mb-3 text-slate-300 leading-relaxed">{def.description}</div>

        {/* Implication */}
        <div className="mb-3 bg-slate-800 p-2.5 rounded border border-slate-700">
          <span className="font-bold text-amber-400 text-[10px] uppercase block mb-1">What this means:</span>
          <span className="text-slate-300 leading-relaxed">{def.implication}</span>
        </div>

        {/* Formula (if exists) */}
        {def.formula && (
          <div className="mb-3 bg-slate-800/50 p-2.5 rounded font-mono text-[11px] text-blue-300 border border-slate-700">
            <span className="text-slate-500 block mb-0.5 font-sans text-[10px]">Formula:</span>
            {def.formula}
          </div>
        )}

        {/* Threshold Justification */}
        {def.thresholdJustification && (
          <div className="mb-3 bg-indigo-900/30 p-2.5 rounded border border-indigo-800">
            <span className="font-bold text-indigo-300 text-[10px] uppercase block mb-1">Why this threshold?</span>
            <span className="text-indigo-200 leading-relaxed text-[11px]">{def.thresholdJustification}</span>
          </div>
        )}

        {/* Target */}
        <div className="flex justify-between items-center pt-2 border-t border-slate-700">
          <span className="text-slate-500 text-[10px] uppercase">Target Range:</span>
          <span className="font-mono text-green-400 font-bold">{def.idealRange}</span>
        </div>
      </div>
    </div>,
    document.body
  );

  return (
    <span className="inline-block ml-1.5 align-middle">
      <button
        ref={buttonRef}
        className={`transition-colors cursor-help ${pinned ? 'text-blue-400' : 'text-slate-400 hover:text-blue-500'}`}
        onMouseEnter={handleMouseEnter}
        onMouseLeave={handleMouseLeave}
        onClick={handleClick}
        aria-label={`Info about ${def.label}`}
        type="button"
      >
        <svg xmlns="http://www.w3.org/2000/svg" width={iconSize} height={iconSize} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="16" x2="12" y2="12"/><line x1="12" y1="8" x2="12.01" y2="8"/></svg>
      </button>
      {tooltipContent}
    </span>
  );
};

/**
 * Inline info tooltip for use in metric cards
 */
export const MetricInfo: React.FC<{ metricKey: string; children: React.ReactNode }> = ({ metricKey, children }) => {
  return (
    <span className="inline-flex items-center">
      {children}
      <InfoIcon metricKey={metricKey} />
    </span>
  );
};

export default InfoIcon;
