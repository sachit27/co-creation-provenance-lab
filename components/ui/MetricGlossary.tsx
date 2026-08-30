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
    description: 'A descriptive measure of inequality in valid participant-to-summary semantic-alignment scores. It says nothing about whether equal scores are high or low.',
    implication: '0.0 means equal alignment scores. Larger values mean a more uneven score distribution; they do not establish unfairness, domination, or discrimination.',
    idealRange: 'Interpret with the score distribution and valid-record count',
    formula: 'G = (2·Σ(i·xᵢ))/(n·Σxᵢ) - (n+1)/n',
    thresholdJustification: `The interface bands (< ${ANALYSIS_CONFIG.giniInterpretation.low}, ${ANALYSIS_CONFIG.giniInterpretation.low}–${ANALYSIS_CONFIG.giniInterpretation.moderate}, > ${ANALYSIS_CONFIG.giniInterpretation.moderate}) are descriptive display conventions, not validated decision thresholds.`
  },
  'gap': {
    label: 'Distinct-record Alignment Gap',
    description: 'Difference in mean alignment between the most centroid-distant quartile and the remaining valid records.',
    implication: 'A positive value means the centroid-distant quartile has lower alignment in this run. It does not identify a demographic minority or prove exclusion.',
    idealRange: 'Context dependent',
    formula: 'Gap = Avg(remaining alignment) − Avg(top isolation quartile alignment)',
    thresholdJustification: `The ${ANALYSIS_CONFIG.thresholds.isolationPercentile * 100}% split is an explicit review heuristic, not an outlier test or validated fairness boundary.`
  },
  'diversity': {
    label: 'Input Diversity',
    description: 'Average pairwise semantic distance between all participant inputs. Measures how varied the discussion topics are.',
    implication: 'Larger values mean records are farther apart in the selected embedding space. Scores are model- and corpus-dependent and do not diagnose an echo chamber.',
    idealRange: 'Context and embedding-model dependent',
    formula: 'D = Avg(1 - cos_sim(vᵢ, vⱼ)) for all pairs',
    thresholdJustification: 'No validated universal cutoff is imposed; compare only runs produced in the same embedding space.'
  },
  'isolation': {
    label: 'Semantic Isolation',
    description: 'How far a participant\'s contribution is from the semantic center of all inputs. Measures uniqueness of perspective.',
    implication: 'High isolation means a record is far from the majority-weighted centroid. It may be a distinct perspective, a coherent minority cluster, or noise.',
    idealRange: 'Context dependent',
    formula: 'Isolation = 1 - cos_sim(embedding, global_centroid)',
    thresholdJustification: `The top ${ANALYSIS_CONFIG.thresholds.isolationPercentile * 100}% are surfaced as review candidates. This percentile is a heuristic, not a statistical outlier claim.`
  },
  'leverage': {
    label: 'Centroid Sensitivity (LOO Z-Score)',
    description: 'Leave-one-out geometry: how much removing a record shifts the source-space centroid, standardized across observed records.',
    implication: 'A large value is a geometric sensitivity flag. It does not measure social power, authorship, or causal influence on the summary.',
    idealRange: 'Descriptive; inspect large shifts',
    formula: 'Z = (shift - μ) / σ, where shift = 1 - cos_sim(centroid, LOO_centroid)',
    thresholdJustification: `The ${ANALYSIS_CONFIG.thresholds.anomalyZThreshold}σ display marker is a review convention, not a p-value or significance test.`
  },
  'representation': {
    label: 'Representation Score',
    description: 'Maximum non-negative cosine similarity between a source record and any summary sentence in one embedding space.',
    implication: 'It measures strongest semantic association—not entailment, factual support, affective preservation, agreement, or causal use.',
    idealRange: 'Use embedding-tier-specific provisional bands',
    formula: 'Rep = max(cos_sim(input_emb, sentence_emb)) for all summary sentences',
    thresholdJustification: 'Dense and TF-IDF cosine distributions differ. Only the TF-IDF low boundary has limited tuning on the included synthetic omission benchmark; other bands remain provisional.'
  },
  'atRisk': {
    label: 'Below Review Marker',
    description: 'Count of valid records whose strongest source-to-summary sentence cosine falls below the embedding-tier-specific review marker.',
    implication: 'These records warrant evidence inspection. The marker does not prove omission, exclusion, or harm.',
    idealRange: 'Descriptive; report the marker, embedding tier, and valid n',
    formula: 'Flag if representation score < tier-specific atRisk marker',
    thresholdJustification: 'The dense marker is provisional. The TF-IDF marker has limited tuning on the bundled synthetic omission benchmark and is not externally validated.'
  },
  'matching': {
    label: 'Matching Threshold',
    description: 'Minimum similarity score used to display a source–summary association candidate.',
    implication: 'Edges below the selected cutoff are hidden; the cutoff does not make displayed edges significant, causal, or verified derivations.',
    idealRange: `> ${ANALYSIS_CONFIG.thresholds.matchingThreshold}`,
    formula: 'Match = cos_sim > threshold',
    thresholdJustification: `${ANALYSIS_CONFIG.thresholds.matchingThreshold} is a configurable display/retrieval heuristic. Use threshold sensitivity and embedding-tier context.`
  },
  'clusters': {
    label: 'Semantic Groups',
    description: 'Exploratory geometric groups from repeated spherical K-Means++ on unit-normalized source embeddings. High-dimensional runs use a deterministic signed projection only after a cosine-distance preservation check; the selected result is revalidated in full space.',
    implication: 'Passing these internal checks permits cluster-conditioned exploratory modules, but does not establish natural topics, social groups, or causal strata. Failed runs remain visibly unpartitioned.',
    idealRange: 'No universal ideal number; inspect every diagnostic and the source evidence',
    formula: 'Repeated spherical K-Means++; choose the best eligible k by silhouette, then require full-space silhouette validation',
    thresholdJustification: `Current transparent gates: n ≥ ${ANALYSIS_CONFIG.algorithms.minClusteringSampleSize}, cluster size ≥ ${ANALYSIS_CONFIG.algorithms.minClusterSize}, projected and full-space silhouette ≥ ${ANALYSIS_CONFIG.algorithms.minSilhouette}, resampling ARI ≥ ${ANALYSIS_CONFIG.algorithms.minClusterStability}, neighborhood coherence ≥ ${ANALYSIS_CONFIG.algorithms.minNeighborhoodAgreement}, method agreement ≥ ${ANALYSIS_CONFIG.algorithms.minClusteringMethodAgreement}, and projection-distance correlation ≥ ${ANALYSIS_CONFIG.algorithms.minProjectionDistanceCorrelation}. These are conservative internal release gates, not universal statistical cutoffs.`
  },
  'bootstrap': {
    label: 'Participant-resampling Stability Interval',
    description: 'Seeded percentile range after resampling observed valid records with replacement and recomputing the aggregate.',
    implication: 'Wide ranges show sensitivity to reweighting observed records. Narrow ranges do not establish measurement validity or population representativeness.',
    idealRange: 'Report point, range, valid n, and sampling assumptions',
    formula: 'Percentile range from B resamples of observed records',
    thresholdJustification: `${ANALYSIS_CONFIG.algorithms.bootstrapSamples} resamples reduce Monte Carlo noise. Population interpretation additionally requires a defensible IID sampling frame.`
  },
  'rhetoric': {
    label: 'Rhetoric–Alignment Association',
    description: 'Describes rank association between automated communication-style scores and semantic-alignment scores.',
    implication: 'An association is a prompt for review. It does not isolate rhetoric from topic, language, group, model, or other confounders and cannot establish bias causally.',
    idealRange: 'Interpret coefficient, p-value, valid n, and confounding together',
    formula: 'Spearman rank correlation between composite rhetorical score and representation score',
    thresholdJustification: 'Spearman describes monotonic association; the p-value only tests a narrow null under its assumptions. No coefficient or p-value is treated as proof of systematic bias.'
  },
  'claims': {
    label: 'Claim Evidence Assessment',
    description: 'Decomposes summary sentences into claims, retrieves candidate source passages, and asks an evaluator to classify supported, inferable, unsupported, or unassessed.',
    implication: 'Unsupported is a review flag within retrieved evidence; unassessed and retrieval failures must remain visible. Model-coded support is not proof of factual truth.',
    idealRange: 'No universal pass threshold; inspect every unsupported and unassessed claim',
    formula: 'Supported fraction = supported / assessed claims',
    thresholdJustification: 'Retrieval thresholds select evidence candidates and are not validity cutoffs. Exact passages and assessment coverage are the primary evidence.'
  },
  'tensions': {
    label: 'Tension & Contradiction Mapping',
    description: 'Samples cross-cluster source evidence for possible disagreements and model-codes how verified summary evidence handles each candidate.',
    implication: 'Suppressed, merged, or distorted labels are review candidates. Sampling caps and evaluator error mean the output is not a complete contradiction census.',
    idealRange: 'Inspect exact evidence and unassessed coverage; no universal pass threshold',
    formula: 'Tension handling rate = acknowledged / assessed tension candidates',
    thresholdJustification: 'Cross-cluster sampling and caps are computational design choices, not completeness guarantees. Invalid quotations remain unassessed.'
  },
  'sankey': {
    label: 'Semantic Association Map (Sankey)',
    description: 'Visualizes thresholded source-to-theme membership and theme-to-summary semantic associations with explicit unmatched residuals.',
    implication: 'Residuals mean no stored similarity edge reached the configured cutoff. They do not verify omission, hallucination, derivation, or information flow.',
    idealRange: 'Review associations and residuals; no pass threshold',
    formula: 'Links based on cluster membership (input→theme) and sentence-match similarity ≥ 0.3 (theme→summary)',
    thresholdJustification: 'Aggregation and similarity cutoffs are readability/retrieval choices. Link mass is conserved for display but is not an information quantity.'
  },
  'thresholdSensitivity': {
    label: 'Threshold Sensitivity Analysis',
    description: 'Shows how the number of affected participants changes as you vary the representation and isolation thresholds. Reveals whether results are robust or brittle — highly sensitive to the exact threshold chosen.',
    implication: 'A steep curve near the selected marker means small changes reclassify many records. A flatter local curve only indicates classification stability over the displayed range, not construct validity.',
    idealRange: 'Report the curve; no universal ideal shape',
    formula: 'For each threshold t in [0.1, 1.0]: count participants where score < t (representation) or isolation > t (isolation)',
    thresholdJustification: 'Sweeps 20 evenly spaced cutoffs. A steep curve means classifications depend heavily on the chosen heuristic; report the curve rather than implying one cutoff is correct.'
  },
  'semanticSpace': {
    label: 'Semantic Space (PCA)',
    description: 'A 2D projection of high-dimensional text embeddings using Principal Component Analysis (PCA). Each point represents a participant\'s contribution, positioned so that semantically similar inputs appear close together.',
    implication: 'Nearby points are more similar under the selected representation, subject to projection distortion. Isolation in two dimensions does not establish uniqueness or marginalization. Point size encodes the alignment score.',
    idealRange: 'Descriptive; inspect explained variance and source text',
    formula: 'PCA supplies display coordinates only. Clustering uses normalized embeddings, an audited high-dimensional projection when needed, and full-space validation.',
    thresholdJustification: 'PCA is deterministic for fixed inputs but loses information. Axes are abstract directions and apparent 2-D distances may distort high-dimensional relationships.'
  },
  'similarityNetwork': {
    label: 'Participant Similarity Network',
    description: 'A mutual k-nearest-neighbors graph where an edge exists only when both records rank each other among their top-k cosine neighbors.',
    implication: 'Bridge and peripheral labels describe graph position only. They do not identify facilitators, social influence, unique viewpoints, or natural communities.',
    idealRange: 'Descriptive; no universal modularity or connectivity target',
    formula: 'Mutual k-NN: edge(i,j) iff j in kNN(i) AND i in kNN(j). k = min(5, ceil(sqrt(N))). Metrics: Brandes betweenness O(VE), Newman modularity Q, Watts-Strogatz clustering coefficient.',
    thresholdJustification: 'Mutual k-NN sparsifies the similarity graph; it does not turn retained edges into verified or high-confidence relationships. Modularity is reported descriptively for this constructed graph.'
  },
  'knowledgeGraph': {
    label: 'Knowledge Graph (GraphRAG)',
    description: 'A knowledge graph constructed from participant inputs via LLM-based entity and relationship extraction. Entities are concepts, policies, stakeholders, values, etc. mentioned in participant text. Relationships are semantic connections between entities. Communities are groups of densely connected entities detected via the full Louvain algorithm. Unlike the cluster map (which groups people), this graph maps the conceptual structure of the discussion.',
    implication: 'Communities and relations are model-extracted candidates. Frequency is extraction frequency, not social importance or dominance. Inspect exact source evidence and extraction coverage.',
    idealRange: 'No universal pass threshold; report extraction coverage and failures',
    formula: 'Entity co-extraction: LLM single-pass with gleaning (Microsoft GraphRAG, 2024). Entity resolution: title-case normalization + Levenshtein fuzzy matching + acronym detection. Bidirectional relationship aggregation. Full Louvain: Phase 1 (local moving) + Phase 2 (network contraction), iterated to convergence (Blondel et al., 2008). Q = (1/2m) * Σ[A_ij - (k_i*k_j)/(2m)] * δ(c_i, c_j).',
    thresholdJustification: 'Single-pass model extraction, fuzzy resolution, and Louvain community detection introduce unvalidated errors. Graph structure must be treated as exploratory unless checked against source evidence.'
  },
  'blindspots': {
    label: 'Low-centrality / Low-alignment Quadrant',
    description: 'Records below the median source-network centrality and below the median source-to-summary alignment score.',
    implication: 'This is a median-split review quadrant, not proof that a perspective is unique, absent, or critically harmed.',
    idealRange: 'Descriptive; inspect the records and thresholds',
    formula: 'Blind spot if centrality < median AND representation < median',
    thresholdJustification: 'Median splits guarantee relative partitions and have no external validity threshold. They are used only to organize review.'
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
