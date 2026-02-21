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
    description: 'Groups of participants whose contributions are semantically similar. Identified using K-Means clustering with automatic cluster count selection.',
    implication: 'Clusters represent distinct discussion themes. A well-functioning co-creation should have representation from all major clusters.',
    idealRange: '2-5 clusters (interpretable)',
    formula: 'K-Means on PCA-reduced embeddings with elbow method',
    thresholdJustification: `Max ${ANALYSIS_CONFIG.algorithms.maxClusters} clusters ensures interpretability (rule of thumb: k << √(n/2)). Elbow threshold of ${ANALYSIS_CONFIG.algorithms.elbowThreshold * 100}% stops when adding clusters gives diminishing returns.`
  },
  'bootstrap': {
    label: 'Bootstrap Confidence Interval',
    description: 'Statistical uncertainty estimate derived by resampling participants with replacement. Shows the range where the true metric value likely falls.',
    implication: 'Wide confidence intervals indicate high uncertainty in the metric. Narrow intervals mean the estimate is stable.',
    idealRange: '95% CI',
    formula: '95% CI from B bootstrap samples',
    thresholdJustification: `${ANALYSIS_CONFIG.algorithms.bootstrapSamples} bootstrap samples provides stable CI estimates. Standard error of bootstrap ~ 1/√B, so 200 samples gives ~7% error in CI width.`
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
