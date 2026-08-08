import { AnalysisResult } from '../types';
import { ANALYSIS_CONFIG } from '../constants';
import { generateOverallInsight, generateRecommendations } from './plainLanguage';

/**
 * Report Export Service
 *
 * Generates a downloadable HTML report that can be printed as PDF.
 * Uses print-friendly CSS for professional output.
 */

export interface ReportData {
  title: string;
  date: string;
  dataset: string;
  strategy: string;
  model: string;
  overallScore: number;
  totalParticipants: number;
  wellRepresented: number;
  atRiskCount: number;
  blindSpotCount: number;
  gini: number;
  equityGap: number;
  summary: string;
  insight: string;
  recommendations: string[];
  atRiskParticipants: { id: string; text: string; score: number }[];
  missedPerspectives: { id: string; text: string; score: number; keywords: string[] }[];
}

/**
 * Generate report data from analysis result
 */
export const generateReportData = (data: AnalysisResult): ReportData => {
  const participants = data.participants;
  const total = participants.length;
  const { representationTarget } = ANALYSIS_CONFIG.thresholds;

  const avgScore = participants.reduce((sum, p) => sum + p.representationScore, 0) / total;
  const wellRepresented = participants.filter(p => p.representationScore >= representationTarget).length;

  // At Risk: fixed threshold < 0.3 (consistent with constants and all other displays)
  const { atRisk: atRiskThreshold } = ANALYSIS_CONFIG.representationInterpretation;
  const sortedScores = participants.map(p => p.representationScore).sort((a, b) => a - b);
  const atRiskParticipants = participants.filter(p => p.representationScore < atRiskThreshold);

  // Blind spots: median-based (consistent with BlindSpotPlot)
  const centralityScores = participants.map(p => 1 - p.semanticIsolation).sort((a, b) => a - b);
  const repScores = [...sortedScores];
  const mid = Math.floor(total / 2);
  const medianCentrality = centralityScores[mid];
  const medianRep = repScores[mid];
  const blindSpots = participants.filter(p => {
    const centrality = 1 - p.semanticIsolation;
    return centrality < medianCentrality && p.representationScore < medianRep;
  });

  // Calculate overall score
  const coverageScore = wellRepresented / total;
  const equityScore = 1 - data.metrics.giniCoefficient;
  const overallScore = Math.round((avgScore * 0.4 + coverageScore * 0.3 + equityScore * 0.3) * 100);

  // Get underrepresented for missed perspectives (below median)
  const underrepresented = participants
    .filter(p => p.representationScore < medianRep)
    .sort((a, b) => a.representationScore - b.representationScore);

  return {
    title: 'AI Summary Representation Audit',
    date: new Date().toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    }),
    dataset: data.config.datasetName,
    strategy: data.config.strategy,
    model: data.config.model,
    overallScore,
    totalParticipants: total,
    wellRepresented,
    atRiskCount: atRiskParticipants.length,
    blindSpotCount: blindSpots.length,
    gini: data.metrics.giniCoefficient,
    equityGap: data.metrics.distinctRepresentationGap,
    summary: data.summary,
    insight: generateOverallInsight(participants, data.metrics),
    recommendations: generateRecommendations(participants, data.metrics),
    atRiskParticipants: atRiskParticipants.map(p => ({
      id: p.id,
      text: p.originalText,
      score: p.representationScore
    })),
    missedPerspectives: underrepresented.slice(0, 10).map(p => ({
      id: p.id,
      text: p.originalText,
      score: p.representationScore,
      keywords: p.keywords || []
    }))
  };
};

/**
 * Generate HTML report content
 */
export const generateReportHTML = (reportData: ReportData): string => {
  const statusColor = reportData.overallScore >= 75 ? '#16a34a' :
    reportData.overallScore >= 55 ? '#d97706' : '#dc2626';

  const statusLabel = reportData.overallScore >= 75 ? 'GOOD' :
    reportData.overallScore >= 55 ? 'MODERATE' : 'NEEDS ATTENTION';

  return `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${reportData.title}</title>
  <style>
    * {
      margin: 0;
      padding: 0;
      box-sizing: border-box;
    }
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      line-height: 1.6;
      color: #1e293b;
      background: white;
      padding: 40px;
      max-width: 800px;
      margin: 0 auto;
    }
    .header {
      border-bottom: 3px solid #3b82f6;
      padding-bottom: 20px;
      margin-bottom: 30px;
    }
    .header h1 {
      font-size: 24px;
      color: #0f172a;
      margin-bottom: 5px;
    }
    .header .meta {
      color: #64748b;
      font-size: 14px;
    }
    .score-card {
      background: linear-gradient(135deg, #f8fafc 0%, #f1f5f9 100%);
      border: 1px solid #e2e8f0;
      border-radius: 12px;
      padding: 24px;
      margin-bottom: 30px;
      display: flex;
      justify-content: space-between;
      align-items: center;
    }
    .score-card .score {
      font-size: 48px;
      font-weight: bold;
      color: ${statusColor};
    }
    .score-card .label {
      font-size: 14px;
      font-weight: bold;
      color: ${statusColor};
      text-transform: uppercase;
    }
    .score-card .stats {
      text-align: right;
    }
    .score-card .stat {
      margin-bottom: 5px;
    }
    .score-card .stat-value {
      font-weight: bold;
      font-size: 18px;
    }
    .score-card .stat-label {
      font-size: 12px;
      color: #64748b;
    }
    .section {
      margin-bottom: 30px;
    }
    .section h2 {
      font-size: 16px;
      text-transform: uppercase;
      letter-spacing: 0.5px;
      color: #475569;
      border-bottom: 1px solid #e2e8f0;
      padding-bottom: 8px;
      margin-bottom: 15px;
    }
    .insight-box {
      background: #f0f9ff;
      border-left: 4px solid #3b82f6;
      padding: 15px;
      margin-bottom: 20px;
      font-size: 14px;
    }
    .recommendations {
      background: #f0fdf4;
      border: 1px solid #bbf7d0;
      border-radius: 8px;
      padding: 15px;
    }
    .recommendations ul {
      margin-left: 20px;
    }
    .recommendations li {
      margin-bottom: 8px;
      font-size: 14px;
    }
    .summary-box {
      background: #fafafa;
      border: 1px solid #e2e8f0;
      border-radius: 8px;
      padding: 20px;
      font-style: italic;
      color: #475569;
    }
    .participant-list {
      font-size: 13px;
    }
    .participant-item {
      background: #fef2f2;
      border: 1px solid #fecaca;
      border-radius: 6px;
      padding: 12px;
      margin-bottom: 10px;
    }
    .participant-item .header {
      display: flex;
      justify-content: space-between;
      border: none;
      padding: 0;
      margin: 0 0 8px 0;
    }
    .participant-item .id {
      font-weight: bold;
      color: #991b1b;
    }
    .participant-item .score {
      font-size: 12px;
      background: #fecaca;
      padding: 2px 8px;
      border-radius: 4px;
      color: #991b1b;
    }
    .participant-item .text {
      color: #64748b;
    }
    .metrics-grid {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 15px;
    }
    .metric-card {
      background: #f8fafc;
      border: 1px solid #e2e8f0;
      border-radius: 8px;
      padding: 15px;
    }
    .metric-card .value {
      font-size: 24px;
      font-weight: bold;
      color: #0f172a;
    }
    .metric-card .label {
      font-size: 12px;
      color: #64748b;
      text-transform: uppercase;
    }
    .footer {
      margin-top: 40px;
      padding-top: 20px;
      border-top: 1px solid #e2e8f0;
      font-size: 11px;
      color: #94a3b8;
      text-align: center;
    }
    @media print {
      body {
        padding: 20px;
      }
      .section {
        page-break-inside: avoid;
      }
    }
  </style>
</head>
<body>
  <div class="header">
    <h1>${reportData.title}</h1>
    <div class="meta">
      Generated: ${reportData.date} | Dataset: ${reportData.dataset} | Strategy: ${reportData.strategy}
    </div>
  </div>

  <div class="score-card">
    <div>
      <div class="score">${reportData.overallScore}</div>
      <div class="label">${statusLabel}</div>
    </div>
    <div class="stats">
      <div class="stat">
        <span class="stat-value">${reportData.wellRepresented}/${reportData.totalParticipants}</span>
        <span class="stat-label"> Well Represented</span>
      </div>
      <div class="stat">
        <span class="stat-value">${reportData.atRiskCount}</span>
        <span class="stat-label"> At Risk</span>
      </div>
      <div class="stat">
        <span class="stat-value">${reportData.blindSpotCount}</span>
        <span class="stat-label"> Blind Spots</span>
      </div>
    </div>
  </div>

  <div class="section">
    <h2>Key Finding</h2>
    <div class="insight-box">
      ${reportData.insight}
    </div>
  </div>

  <div class="section">
    <h2>Metrics Overview</h2>
    <div class="metrics-grid">
      <div class="metric-card">
        <div class="value">${reportData.gini.toFixed(3)}</div>
        <div class="label">Gini Coefficient (Inequality)</div>
      </div>
      <div class="metric-card">
        <div class="value">${(reportData.equityGap * 100).toFixed(0)}%</div>
        <div class="label">Equity Gap</div>
      </div>
    </div>
  </div>

  ${reportData.recommendations.length > 0 ? `
  <div class="section">
    <h2>Recommendations</h2>
    <div class="recommendations">
      <ul>
        ${reportData.recommendations.map(r => `<li>${r}</li>`).join('')}
      </ul>
    </div>
  </div>
  ` : ''}

  ${reportData.atRiskParticipants.length > 0 ? `
  <div class="section">
    <h2>At-Risk Participants (${reportData.atRiskParticipants.length})</h2>
    <div class="participant-list">
      ${reportData.atRiskParticipants.map(p => `
        <div class="participant-item">
          <div class="header">
            <span class="id">${p.id}</span>
            <span class="score">${(p.score * 100).toFixed(0)}% match</span>
          </div>
          <div class="text">"${p.text}"</div>
        </div>
      `).join('')}
    </div>
  </div>
  ` : ''}

  <div class="section">
    <h2>AI-Generated Summary</h2>
    <div class="summary-box">
      ${reportData.summary}
    </div>
  </div>

  <div class="footer">
    Generated by Co-Creation Provenance Lab | Model: ${reportData.model}
    <br>
    This report provides an automated analysis of AI summarization fairness.
    Human review is recommended for final decisions.
  </div>
</body>
</html>
  `.trim();
};

/**
 * Export report as downloadable HTML file
 */
export const downloadReport = (data: AnalysisResult): void => {
  const reportData = generateReportData(data);
  const html = generateReportHTML(reportData);

  const blob = new Blob([html], { type: 'text/html' });
  const url = URL.createObjectURL(blob);

  const a = document.createElement('a');
  a.href = url;
  a.download = `representation-audit-${reportData.dataset.replace(/\s+/g, '-').toLowerCase()}-${new Date().toISOString().split('T')[0]}.html`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
};

/**
 * Open report in new window for printing as PDF
 */
export const printReport = (data: AnalysisResult): void => {
  const reportData = generateReportData(data);
  const html = generateReportHTML(reportData);

  const printWindow = window.open('', '_blank');
  if (printWindow) {
    printWindow.document.write(html);
    printWindow.document.close();
    printWindow.focus();
    // Delay print to allow styles to load
    setTimeout(() => {
      printWindow.print();
    }, 250);
  }
};

export default {
  generateReportData,
  generateReportHTML,
  downloadReport,
  printReport
};
