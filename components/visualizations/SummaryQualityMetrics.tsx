import React, { useMemo } from 'react';
import { AnalysisResult } from '../../types';
import { useResponsiveChart, formatMetric } from '../../hooks/useResponsiveChart';

interface SummaryQualityMetricsProps {
  data: AnalysisResult;
}

// Calculate Flesch Reading Ease score (simplified)
const calculateReadability = (text: string): number => {
  const sentences = text.split(/[.!?]+/).filter(s => s.trim().length > 0);
  const words = text.split(/\s+/).filter(w => w.length > 0);
  const syllables = words.reduce((count, word) => {
    // Simple syllable estimation
    const vowels = word.toLowerCase().match(/[aeiouy]+/g);
    return count + (vowels ? vowels.length : 1);
  }, 0);

  if (sentences.length === 0 || words.length === 0) return 50;

  const avgSentenceLength = words.length / sentences.length;
  const avgSyllablesPerWord = syllables / words.length;

  // Flesch Reading Ease formula
  const score = 206.835 - (1.015 * avgSentenceLength) - (84.6 * avgSyllablesPerWord);
  return Math.max(0, Math.min(100, score));
};

// Calculate semantic coverage - what percentage of input themes are touched
const calculateSemanticCoverage = (participants: any[], representationScores: number[]): number => {
  const covered = representationScores.filter(s => s >= 0.5).length;
  return (covered / representationScores.length) * 100;
};

// Calculate compression ratio
const calculateCompressionRatio = (inputs: string[], summary: string): number => {
  const inputLength = inputs.reduce((sum, t) => sum + t.length, 0);
  const summaryLength = summary.length;
  return summaryLength / inputLength;
};

// Calculate sentiment alignment
const calculateSentimentAlignment = (data: AnalysisResult): number => {
  if (!data.summarySentenceSentiments || data.summarySentenceSentiments.length === 0) {
    return 0.5;
  }

  let alignedCount = 0;
  let totalChecks = 0;

  data.participants.forEach(p => {
    const matchedSentimentInfo = data.summarySentenceSentiments[p.topSentenceMatchIndex];
    if (matchedSentimentInfo) {
      totalChecks++;
      if (p.sentiment === matchedSentimentInfo.label) {
        alignedCount++;
      }
    }
  });

  return totalChecks > 0 ? alignedCount / totalChecks : 0.5;
};

const getScoreColor = (score: number, inverted: boolean = false): string => {
  const normalized = inverted ? 1 - score : score;
  if (normalized >= 0.7) return 'text-green-600';
  if (normalized >= 0.5) return 'text-amber-600';
  return 'text-red-600';
};

const getReadabilityLabel = (score: number): string => {
  if (score >= 70) return 'Easy';
  if (score >= 50) return 'Moderate';
  if (score >= 30) return 'Difficult';
  return 'Very Difficult';
};

interface MetricCardProps {
  label: string;
  value: string | number;
  subtext: string;
  status: 'good' | 'moderate' | 'poor';
  icon: string;
}

const MetricCard: React.FC<MetricCardProps> = ({ label, value, subtext, status, icon }) => {
  const statusColors = {
    good: 'border-green-200 bg-green-50',
    moderate: 'border-amber-200 bg-amber-50',
    poor: 'border-red-200 bg-red-50'
  };

  const textColors = {
    good: 'text-green-700',
    moderate: 'text-amber-700',
    poor: 'text-red-700'
  };

  return (
    <div className={`rounded-lg border p-3 ${statusColors[status]}`}>
      <div className="flex items-start justify-between mb-1">
        <span className="text-[10px] font-bold text-slate-600 uppercase tracking-wider">
          {label}
        </span>
        <span className="text-lg">{icon}</span>
      </div>
      <div className={`text-xl font-bold ${textColors[status]}`}>{value}</div>
      <div className="text-[10px] text-slate-500 mt-1">{subtext}</div>
    </div>
  );
};

export const SummaryQualityMetrics: React.FC<SummaryQualityMetricsProps> = ({ data }) => {
  const { containerRef, isCompact, isMobile } = useResponsiveChart({ minHeight: 350 });

  const metrics = useMemo(() => {
    const inputTexts = data.participants.map(p => p.originalText);
    const repScores = data.participants.map(p => p.representationScore);

    const readability = calculateReadability(data.summary);
    const semanticCoverage = calculateSemanticCoverage(data.participants, repScores);
    const compressionRatio = calculateCompressionRatio(inputTexts, data.summary);
    const sentimentAlignment = calculateSentimentAlignment(data);

    // Word count stats
    const summaryWords = data.summary.split(/\s+/).length;
    const avgInputWords = inputTexts.reduce((sum, t) => sum + t.split(/\s+/).length, 0) / inputTexts.length;
    const sentenceCount = data.summarySentences.length;

    // Diversity of representation
    const uniqueClusters = new Set(data.participants.map(p => p.clusterId)).size;
    const clustersRepresented = new Set(
      data.participants.filter(p => p.representationScore >= 0.5).map(p => p.clusterId)
    ).size;

    return {
      readability,
      readabilityLabel: getReadabilityLabel(readability),
      semanticCoverage,
      compressionRatio,
      sentimentAlignment,
      summaryWords,
      avgInputWords,
      sentenceCount,
      uniqueClusters,
      clustersRepresented,
      clusterCoverage: (clustersRepresented / uniqueClusters) * 100
    };
  }, [data]);

  return (
    <div ref={containerRef} className="w-full flex flex-col gap-4 p-2" style={{ minHeight: '400px' }}>
      {/* Header */}
      <div>
        <h3 className="text-sm font-bold text-slate-700">Summary Quality Analysis</h3>
        <p className="text-[10px] text-slate-500 mt-0.5">
          NLP diagnostics evaluating readability, coverage, and fidelity
        </p>
      </div>

      {/* Metric Cards Grid */}
      <div className={`grid gap-3 ${isMobile ? 'grid-cols-2' : 'grid-cols-3'}`}>
        <MetricCard
          label="Readability"
          value={metrics.readabilityLabel}
          subtext={`Flesch score: ${formatMetric(metrics.readability, 0)}/100`}
          status={metrics.readability >= 50 ? 'good' : metrics.readability >= 30 ? 'moderate' : 'poor'}
          icon="📖"
        />

        <MetricCard
          label="Semantic Coverage"
          value={`${formatMetric(metrics.semanticCoverage, 0)}%`}
          subtext={`Inputs with score ≥0.5`}
          status={metrics.semanticCoverage >= 70 ? 'good' : metrics.semanticCoverage >= 50 ? 'moderate' : 'poor'}
          icon="🎯"
        />

        <MetricCard
          label="Compression"
          value={`${formatMetric(metrics.compressionRatio * 100, 0)}%`}
          subtext={`${metrics.summaryWords} words from ${data.participants.length} inputs`}
          status={metrics.compressionRatio <= 0.3 ? 'good' : metrics.compressionRatio <= 0.5 ? 'moderate' : 'poor'}
          icon="📊"
        />

        <MetricCard
          label="Tone Alignment"
          value={`${formatMetric(metrics.sentimentAlignment * 100, 0)}%`}
          subtext="Sentiment match rate"
          status={metrics.sentimentAlignment >= 0.7 ? 'good' : metrics.sentimentAlignment >= 0.5 ? 'moderate' : 'poor'}
          icon="🎭"
        />

        <MetricCard
          label="Topic Coverage"
          value={`${metrics.clustersRepresented}/${metrics.uniqueClusters}`}
          subtext={`${formatMetric(metrics.clusterCoverage, 0)}% clusters represented`}
          status={metrics.clusterCoverage >= 80 ? 'good' : metrics.clusterCoverage >= 60 ? 'moderate' : 'poor'}
          icon="🗂️"
        />

        <MetricCard
          label="Structure"
          value={`${metrics.sentenceCount}`}
          subtext={`sentences, ~${formatMetric(metrics.summaryWords / metrics.sentenceCount, 0)} words each`}
          status={metrics.sentenceCount >= 3 ? 'good' : 'moderate'}
          icon="📝"
        />
      </div>

      {/* Overall Quality Score */}
      <div className="bg-slate-100 rounded-lg p-4">
        <div className="flex items-center justify-between mb-2">
          <span className="text-sm font-semibold text-slate-700">Overall Quality Score</span>
          <span className={`text-2xl font-bold ${
            (metrics.semanticCoverage + metrics.sentimentAlignment * 100 + metrics.clusterCoverage) / 3 >= 65
              ? 'text-green-600'
              : 'text-amber-600'
          }`}>
            {formatMetric((metrics.semanticCoverage + metrics.sentimentAlignment * 100 + metrics.clusterCoverage) / 3, 0)}%
          </span>
        </div>
        <div className="h-3 bg-slate-200 rounded-full overflow-hidden">
          <div
            className={`h-full rounded-full transition-all ${
              (metrics.semanticCoverage + metrics.sentimentAlignment * 100 + metrics.clusterCoverage) / 3 >= 65
                ? 'bg-green-500'
                : 'bg-amber-500'
            }`}
            style={{ width: `${(metrics.semanticCoverage + metrics.sentimentAlignment * 100 + metrics.clusterCoverage) / 3}%` }}
          />
        </div>
        <div className="flex justify-between text-[10px] text-slate-500 mt-1">
          <span>Coverage + Alignment + Topic Balance</span>
          <span>Target: ≥65%</span>
        </div>
      </div>

      {/* Recommendations */}
      <div className="bg-blue-50 border border-blue-200 rounded-lg p-3">
        <div className="text-[10px] font-bold text-blue-700 uppercase mb-2">Recommendations</div>
        <ul className="space-y-1.5 text-xs text-blue-800">
          {metrics.semanticCoverage < 70 && (
            <li className="flex items-start gap-1.5">
              <span className="text-blue-500">•</span>
              <span>Low semantic coverage ({formatMetric(metrics.semanticCoverage, 0)}%). Consider using diversity-focused summarization to capture more perspectives.</span>
            </li>
          )}
          {metrics.sentimentAlignment < 0.6 && (
            <li className="flex items-start gap-1.5">
              <span className="text-blue-500">•</span>
              <span>Tone misalignment detected. Some emotional valences may not be preserved accurately.</span>
            </li>
          )}
          {metrics.clusterCoverage < 80 && (
            <li className="flex items-start gap-1.5">
              <span className="text-blue-500">•</span>
              <span>Some topic clusters are underrepresented. Review blind spot analysis for missed themes.</span>
            </li>
          )}
          {metrics.readability < 50 && (
            <li className="flex items-start gap-1.5">
              <span className="text-blue-500">•</span>
              <span>Summary may be difficult to read (Flesch: {formatMetric(metrics.readability, 0)}). Consider simpler phrasing.</span>
            </li>
          )}
          {metrics.semanticCoverage >= 70 && metrics.sentimentAlignment >= 0.6 && metrics.clusterCoverage >= 80 && (
            <li className="flex items-start gap-1.5">
              <span className="text-green-500">✓</span>
              <span>Summary quality looks good across all dimensions.</span>
            </li>
          )}
        </ul>
      </div>
    </div>
  );
};

export default SummaryQualityMetrics;
