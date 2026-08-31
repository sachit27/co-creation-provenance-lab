import { AnalysisResult, SummaryOrigin, CompletionMetadata } from '../types';
import { getRepresentationBands } from '../constants';

/** Privacy-minimal, provenance-first HTML audit report. */
export interface ReportData {
  title: string;
  generatedAt: string;
  dataset: string;
  strategy: string;
  summary: string;
  summaryOrigin: SummaryOrigin;
  declaredProvider?: string;
  declaredModel?: string;
  runId?: string;
  actualGenerator?: string;
  configuredGenerator?: string;
  generatorIdentifierStatus?: string;
  configuredEvaluator?: string;
  evaluatorRelationship?: string;
  actualEmbedding: string;
  fallbackEvents: string[];
  completionCalls: CompletionMetadata[];
  enrichmentStatus?: AnalysisResult['enrichmentStatus'];
  enrichmentStages?: AnalysisResult['enrichmentStages'];
  totalParticipants: number;
  scoredParticipants: number;
  averageRetrievalScore: number | null;
  belowProvisionalReference: Array<{ id: string; score: number }>;
  provisionalReference: number;
  gini: number | null;
  equityGap: number | null;
  clustering?: AnalysisResult['clusteringDiagnostics'];
  affective?: {
    attenuationRate: number | null;
    attenuationNumerator: number;
    attenuationDenominator: number;
    coverageRate: number | null;
    coverageNumerator: number;
    coverageDenominator: number;
    profileComparabilityRate: number | null;
    profileComparableNumerator: number;
    profileEligibleDenominator: number;
    sourceProfileCompletionRate: number | null;
    sourceProfileCompletedNumerator: number;
    sourceCensusDenominator: number;
    stageCounts: AnalysisResult['affectiveFidelity'] extends infer T
      ? T extends { stageCounts: infer S } ? S : never
      : never;
    evaluator: string;
    methodVersion: string;
    limitations: string[];
  };
  languageTransformation?: {
    preservationRate: number | null;
    assessmentCoverageRate: number | null;
    completedUnits: number;
    preservationEligibleUnits: number;
    totalUnits: number;
    preservedParticipantEquivalent: number;
    assessedParticipantEquivalent: number;
    evaluator: string;
    methodVersion: string;
    limitations: string[];
  };
  claims?: {
    supported: number;
    inferrable: number;
    unsupported: number;
    contradicted: number;
    unassessed: number;
    conditionalScore: number | null;
  };
  tensions?: {
    basis?: AnalysisResult['tensionAnalysis'] extends infer T ? T extends { basis?: infer B } ? B : never : never;
    unavailableReason?: string;
    detected: number;
    acknowledged: number;
    suppressed: number;
    merged: number;
    absent: number;
    distorted: number;
    unassessed: number;
    conditionalScore: number | null;
    samplingCoverage?: AnalysisResult['tensionAnalysis'] extends infer T ? T extends { samplingCoverage?: infer S } ? S : never : never;
  };
  limitations: string[];
}

const labelForOrigin = (origin: SummaryOrigin): string => ({
  'generated-in-run': 'AI-generated in this run',
  'algorithmic-extractive': 'Algorithmic extractive summary',
  'human-authored': 'Human-authored summary',
  'ai-generated-external': 'Externally AI-generated summary',
  'ai-assisted': 'AI-assisted summary',
  mixed: 'Mixed-authorship summary',
  unknown: 'Summary of unknown or undeclared origin',
})[origin];

export const generateReportData = (data: AnalysisResult): ReportData => {
  const manifest = data.runManifest;
  const origin = data.config.summaryProvenance?.origin ??
    (data.config.summaryMethod === 'ai' ? 'generated-in-run' :
      data.config.summaryMethod === 'extractive' ? 'algorithmic-extractive' : 'unknown');
  const validParticipants = data.participants.filter(
    participant => !participant.embeddingFailed && !participant.alignmentUnavailableReason
  );
  const bands = getRepresentationBands(data.embeddingTierUsed);
  const averageRetrievalScore = validParticipants.length > 0
    ? validParticipants.reduce((sum, participant) => sum + participant.representationScore, 0) / validParticipants.length
    : null;

  return {
    title: 'Source-to-Summary Audit Record',
    generatedAt: new Date().toISOString(),
    dataset: data.config.datasetName,
    strategy: data.config.strategy,
    summary: data.summary,
    summaryOrigin: origin,
    declaredProvider: data.config.summaryProvenance?.provider,
    declaredModel: data.config.summaryProvenance?.model,
    runId: manifest?.runId,
    actualGenerator: manifest?.actualGenerator
      ? `${manifest.actualGenerator.provider} / ${manifest.actualGenerator.model}`
      : undefined,
    configuredGenerator: manifest?.requestedGenerator
      ? `${manifest.requestedGenerator.provider} / ${manifest.requestedGenerator.model}`
      : undefined,
    generatorIdentifierStatus: manifest?.actualGenerator
      ? 'Provider-returned generator identifier'
      : manifest?.requestedGenerator
        ? 'Configured generator identifier; provider did not return a model identifier'
        : data.config.summaryProvenance?.model
          ? 'User-declared external generator identifier (unverified)'
          : undefined,
    configuredEvaluator: manifest?.actualEvaluator
      ? `${manifest.actualEvaluator.provider} / ${manifest.actualEvaluator.model}`
      : manifest?.requestedEvaluator
        ? `${manifest.requestedEvaluator.provider} / ${manifest.requestedEvaluator.model} (unavailable)`
        : undefined,
    evaluatorRelationship: manifest?.requestedEvaluator
      ? manifest.requestedGenerator
        ? manifest.requestedGenerator.provider !== manifest.requestedEvaluator.provider
          ? 'different provider from generator'
          : manifest.requestedGenerator.model !== manifest.requestedEvaluator.model
            ? 'different model from generator; same provider'
            : 'same configured model as generator'
        : 'summary not generated in this run'
      : undefined,
    actualEmbedding: manifest?.actualEmbedding
      ? `${manifest.actualEmbedding.provider} / ${manifest.actualEmbedding.model}`
      : `${data.embeddingTierUsed ?? data.config.embeddingProvider} / ${data.config.embeddingModel}`,
    fallbackEvents: manifest?.fallbackEvents ?? [],
    completionCalls: manifest?.completionCalls ?? [],
    enrichmentStatus: data.enrichmentStatus,
    enrichmentStages: data.enrichmentStages,
    totalParticipants: data.participants.length,
    scoredParticipants: validParticipants.length,
    averageRetrievalScore,
    belowProvisionalReference: validParticipants
      .filter(participant => participant.representationScore < bands.atRisk)
      .sort((left, right) => left.representationScore - right.representationScore)
      .map(participant => ({ id: participant.id, score: participant.representationScore })),
    provisionalReference: bands.atRisk,
    gini: validParticipants.length >= 2 ? data.metrics.giniCoefficient : null,
    equityGap: validParticipants.length >= 2 ? data.metrics.distinctRepresentationGap : null,
    clustering: data.clusteringDiagnostics,
    affective: data.affectiveFidelity ? {
      attenuationRate: data.affectiveFidelity.attenuationRate,
      attenuationNumerator: data.affectiveFidelity.attenuatedWeight ?? 0,
      attenuationDenominator: data.affectiveFidelity.comparableAffectBearingWeight,
      coverageRate: data.affectiveFidelity.affectiveCoverageRate,
      coverageNumerator: data.affectiveFidelity.representedAffectBearingWeight,
      coverageDenominator: data.affectiveFidelity.assessedSourceAffectBearingWeight,
      profileComparabilityRate: data.affectiveFidelity.profileComparabilityRate,
      profileComparableNumerator: data.affectiveFidelity.profileComparableAffectBearingWeight,
      profileEligibleDenominator: data.affectiveFidelity.profileEligibleAffectBearingWeight,
      sourceProfileCompletionRate: data.affectiveFidelity.sourceProfileCompletionRate,
      sourceProfileCompletedNumerator: data.affectiveFidelity.sourceProfileCompletedWeight,
      sourceCensusDenominator: data.affectiveFidelity.sourceCensusParticipantWeight,
      stageCounts: data.affectiveFidelity.stageCounts,
      evaluator: `${data.affectiveFidelity.evaluator.provider} / ${data.affectiveFidelity.evaluator.model}`,
      methodVersion: data.affectiveFidelity.methodVersion,
      limitations: data.affectiveFidelity.limitations,
    } : undefined,
    languageTransformation: data.languageFidelity?.methodVersion === 'language-transformation-v2-source-census' ? {
      preservationRate: data.languageFidelity.fidelityScore,
      assessmentCoverageRate: data.languageFidelity.assessmentCoverageRate ?? null,
      completedUnits: data.languageFidelity.completedSourceUnitCount ?? data.languageFidelity.assessedSourceUnitCount ?? 0,
      preservationEligibleUnits: data.languageFidelity.assessedSourceUnitCount ?? 0,
      totalUnits: data.languageFidelity.totalSourceUnitCount ?? 0,
      preservedParticipantEquivalent: data.languageFidelity.preservedParticipantEquivalent ?? 0,
      assessedParticipantEquivalent: data.languageFidelity.assessedParticipantEquivalent ?? 0,
      evaluator: data.languageFidelity.evaluator
        ? `${data.languageFidelity.evaluator.provider} / ${data.languageFidelity.evaluator.model}`
        : 'not recorded',
      methodVersion: data.languageFidelity.methodVersion,
      limitations: data.languageFidelity.limitations ?? [],
    } : undefined,
    claims: data.claimAttribution ? {
      supported: data.claimAttribution.supportedCount,
      inferrable: data.claimAttribution.inferrableCount,
      unsupported: data.claimAttribution.unsupportedCount,
      contradicted: data.claimAttribution.contradictedCount,
      unassessed: data.claimAttribution.unassessedCount,
      conditionalScore: data.claimAttribution.attributionScore,
    } : undefined,
    tensions: data.tensionAnalysis ? {
      basis: data.tensionAnalysis.basis,
      unavailableReason: data.tensionAnalysis.unavailableReason,
      detected: data.tensionAnalysis.pairs.length,
      acknowledged: data.tensionAnalysis.acknowledgedCount,
      suppressed: data.tensionAnalysis.suppressedCount,
      merged: data.tensionAnalysis.mergedCount,
      absent: data.tensionAnalysis.absentCount ?? 0,
      distorted: data.tensionAnalysis.distortedCount,
      unassessed: data.tensionAnalysis.unassessedCount,
      conditionalScore: data.tensionAnalysis.tensionFidelityScore,
      samplingCoverage: data.tensionAnalysis.samplingCoverage,
    } : undefined,
    limitations: [
      'This is an unsigned automated audit record, not a certificate, fairness verdict, causal proof, or statistical validation.',
      'The retrieval score is maximum source-to-summary sentence cosine. It is a ranking and review aid, not a probability that a person was represented.',
      'Reference bands are provisional and are not validated decision thresholds for this dataset, language, domain, or embedding model.',
      'Gini and the distinct-voice gap describe the distribution of automated retrieval scores; they do not establish discrimination or systemic bias.',
      'Raw participant text is intentionally excluded from this portable report. Review source evidence only in an access-controlled environment.',
      'Automated model-coded modules require external validation against independently coded data before use as scientific instruments.',
    ],
  };
};

const esc = (value: unknown): string => String(value ?? '')
  .replace(/&/g, '&amp;')
  .replace(/</g, '&lt;')
  .replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;')
  .replace(/'/g, '&#39;');

const pct = (value: number | null): string => value === null ? 'not available' : `${(value * 100).toFixed(1)}%`;
const num = (value: number | null, digits = 3): string => value === null ? 'not available' : value.toFixed(digits);
const unit = (value: number): string => Number.isInteger(value) ? String(value) : value.toFixed(2);
const clusteringComparisonLabel = (methodVersion: string): string =>
  methodVersion === 'spherical-kmeans-stability-v1'
    ? 'same-k cosine single linkage (legacy)'
    : 'same-k cosine average linkage';

export const generateReportHTML = (report: ReportData): string => `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${esc(report.title)}</title><style>
body{font:14px/1.55 system-ui,sans-serif;color:#1e293b;max-width:900px;margin:0 auto;padding:36px}h1{margin:0}h2{font-size:16px;margin-top:30px;border-bottom:1px solid #cbd5e1;padding-bottom:6px}.meta,.note{color:#64748b}.grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(190px,1fr));gap:10px}.card{border:1px solid #cbd5e1;border-radius:8px;padding:12px}.value{font-size:22px;font-weight:700}.summary{white-space:pre-wrap;background:#f8fafc;border:1px solid #cbd5e1;border-radius:8px;padding:16px}.warning{background:#fffbeb;border:1px solid #fcd34d;padding:12px;border-radius:8px}table{width:100%;border-collapse:collapse}th,td{text-align:left;border-bottom:1px solid #e2e8f0;padding:7px}code{font-size:12px}@media print{body{padding:12px}.card{break-inside:avoid}}</style></head><body>
<h1>${esc(report.title)}</h1><p class="meta">Exported ${esc(report.generatedAt)} · Dataset: ${esc(report.dataset)}${report.runId ? ` · Run: <code>${esc(report.runId)}</code>` : ''}</p>
<div class="warning"><strong>Interpretation boundary:</strong> This portable file is an unsigned automated audit record. It deliberately contains no raw participant contributions and provides no overall grade.</div>

<h2>Execution and declared origin</h2><div class="grid">
<div class="card"><div class="value">${esc(labelForOrigin(report.summaryOrigin))}</div><div class="note">Declared summary origin</div></div>
<div class="card"><div class="value">${esc(report.actualGenerator ?? report.configuredGenerator ?? report.declaredModel ?? 'not applicable or unknown')}</div><div class="note">${esc(report.generatorIdentifierStatus ?? 'Generator identifier not available')}</div></div>
<div class="card"><div class="value">${esc(report.configuredEvaluator ?? 'not available')}</div><div class="note">Automated evaluator (provider-returned when available, otherwise configured)${report.evaluatorRelationship ? ` · ${esc(report.evaluatorRelationship)}` : ''}</div></div>
<div class="card"><div class="value">${esc(report.actualEmbedding)}</div><div class="note">Actual embedding method</div></div>
<div class="card"><div class="value">${report.scoredParticipants}/${report.totalParticipants}</div><div class="note">Scored source records</div></div></div>
${report.fallbackEvents.length ? `<p><strong>Fallbacks:</strong></p><ul>${report.fallbackEvents.map(event => `<li>${esc(event)}</li>`).join('')}</ul>` : '<p class="note">No fallback event was recorded.</p>'}
${report.enrichmentStatus && report.enrichmentStatus !== 'complete' ? `<p class="warning"><strong>Deep-analysis status:</strong> ${esc(report.enrichmentStatus)}. Only completed stages should be interpreted.</p>` : ''}
${report.enrichmentStages ? `<p class="note"><strong>Deep-analysis stages:</strong> ${Object.entries(report.enrichmentStages).map(([name, stage]) => `${esc(name)}=${esc(stage?.status)}${stage?.message ? ` (${esc(stage.message)})` : ''}`).join(' · ')}</p>` : ''}
${report.completionCalls.length ? `<details><summary>Provider completion execution facts (${report.completionCalls.length})</summary><table><thead><tr><th>Role</th><th>Provider</th><th>Requested model</th><th>Provider-returned model</th><th>Finish/refusal</th><th>Token usage</th></tr></thead><tbody>${report.completionCalls.map(call => `<tr><td>${esc(call.role ?? 'unspecified')}</td><td>${esc(call.provider)}</td><td>${esc(call.requestedModel)}</td><td>${esc(call.returnedModel ?? 'not returned')}</td><td>${esc(call.refusal ?? call.finishReason ?? 'not returned')}</td><td>${esc(call.usage?.totalTokens ?? 'not returned')}</td></tr>`).join('')}</tbody></table><p class="note">Provider response/request identifiers remain in the machine-readable provenance record.</p></details>` : '<p class="note">No provider completion envelope was recorded (for example, an extractive-only run).</p>'}

<h2>Core descriptive indicators</h2><div class="grid">
<div class="card"><div class="value">${num(report.averageRetrievalScore, 3)}</div><div class="note">Mean maximum-sentence cosine</div></div>
<div class="card"><div class="value">${num(report.gini, 3)}</div><div class="note">Gini of scored retrieval indicators</div></div>
<div class="card"><div class="value">${num(report.equityGap, 3)}</div><div class="note">Centroid-distant quartile score gap</div></div>
<div class="card"><div class="value">${report.belowProvisionalReference.length}</div><div class="note">Below provisional ${report.provisionalReference.toFixed(2)} reference</div></div></div>
${report.belowProvisionalReference.length ? `<table><caption class="note">IDs only; raw text excluded</caption><thead><tr><th>Source ID</th><th>Retrieval indicator</th></tr></thead><tbody>${report.belowProvisionalReference.map(item => `<tr><td>${esc(item.id)}</td><td>${item.score.toFixed(3)}</td></tr>`).join('')}</tbody></table>` : ''}

${report.clustering ? `<h2>Exploratory semantic grouping diagnostics</h2><div class="grid"><div class="card"><div class="value">${report.clustering.usableForDownstream ? `k=${report.clustering.selectedK}` : 'unavailable'}</div><div class="note">${esc(report.clustering.reason)}</div></div><div class="card"><div class="value">${num(report.clustering.silhouette)}</div><div class="note">Full-space cosine silhouette</div></div><div class="card"><div class="value">${num(report.clustering.stability)}</div><div class="note">Participant-subsample adjusted Rand stability</div></div><div class="card"><div class="value">${num(report.clustering.neighborhoodAgreement)}</div><div class="note">Neighborhood coherence</div></div><div class="card"><div class="value">${num(report.clustering.methodAgreement)}</div><div class="note">Adjusted Rand agreement with ${esc(clusteringComparisonLabel(report.clustering.methodVersion))}</div></div></div><p class="note">Method ${esc(report.clustering.methodVersion)} · n=${report.clustering.sampleSize} · input ${report.clustering.inputDimensions} dimensions · analysis ${report.clustering.analysisDimensions} dimensions via ${esc(report.clustering.projectionMethod)} (distance r=${report.clustering.projectionDistanceCorrelation.toFixed(3)}) · group sizes ${esc(report.clustering.clusterSizes.join(', '))}</p><ul>${report.clustering.limitations.map(item => `<li>${esc(item)}</li>`).join('')}</ul>` : '<h2>Exploratory semantic grouping diagnostics</h2><p class="warning">Unavailable: this legacy result contains no clustering validation record. Cluster-conditioned claims must not be made.</p>'}

${report.affective ? `<h2>Exploratory automated affective fidelity</h2><div class="grid"><div class="card"><div class="value">${pct(report.affective.sourceProfileCompletionRate)}</div><div class="note">Source-profile completion · ${unit(report.affective.sourceProfileCompletedNumerator)}/${unit(report.affective.sourceCensusDenominator)} participant-equivalent units</div></div><div class="card"><div class="value">${pct(report.affective.attenuationRate)}</div><div class="note">Attenuation · ${unit(report.affective.attenuationNumerator)}/${unit(report.affective.attenuationDenominator)} participant-equivalent units</div></div><div class="card"><div class="value">${pct(report.affective.coverageRate)}</div><div class="note">Same-target alignment coverage among high-certainty source-profiled affect/evaluation units · ${unit(report.affective.coverageNumerator)}/${unit(report.affective.coverageDenominator)}</div></div><div class="card"><div class="value">${pct(report.affective.profileComparabilityRate)}</div><div class="note">Pointwise profile comparability · ${unit(report.affective.profileComparableNumerator)}/${unit(report.affective.profileEligibleDenominator)}</div></div></div><p class="note">Stage counts: ${Object.entries(report.affective.stageCounts).map(([key, value]) => `${esc(key)}=${value}`).join(' · ')}</p><p class="note">Method ${esc(report.affective.methodVersion)} · Evaluator ${esc(report.affective.evaluator)}</p><ul>${report.affective.limitations.map(item => `<li>${esc(item)}</li>`).join('')}</ul>` : ''}

${report.languageTransformation ? `<h2>Automated source-unit transformation assessment</h2><div class="grid"><div class="card"><div class="value">${pct(report.languageTransformation.preservationRate)}</div><div class="note">Participant-balanced preservation among eligible units · ${unit(report.languageTransformation.preservedParticipantEquivalent)}/${unit(report.languageTransformation.assessedParticipantEquivalent)} participant-equivalent units</div></div><div class="card"><div class="value">${pct(report.languageTransformation.assessmentCoverageRate)}</div><div class="note">Evaluator output completeness · ${report.languageTransformation.completedUnits}/${report.languageTransformation.totalUnits} source units; ${report.languageTransformation.preservationEligibleUnits} preservation-eligible</div></div></div><p class="note">Method ${esc(report.languageTransformation.methodVersion)} · Evaluator ${esc(report.languageTransformation.evaluator)}</p><ul>${report.languageTransformation.limitations.map(item => `<li>${esc(item)}</li>`).join('')}</ul>` : ''}

${report.claims ? `<h2>Automated summary-claim evidence assessment</h2><p>Supported ${report.claims.supported} · Inferrable ${report.claims.inferrable} · Unsupported ${report.claims.unsupported} · Contradicted ${report.claims.contradicted} · Unassessed ${report.claims.unassessed} · Conditional score ${pct(report.claims.conditionalScore)}</p>` : ''}
${report.tensions ? `<h2>Automated sampled tension scan</h2>${report.tensions.basis === 'stable-semantic-groups' ? `<p>${report.tensions.samplingCoverage ? `Screened ${report.tensions.samplingCoverage.screenedRecords}/${report.tensions.samplingCoverage.totalRecords} source records · ` : ''}Detected ${report.tensions.detected} · Acknowledged ${report.tensions.acknowledged} · One-sided ${report.tensions.suppressed} · Flattened ${report.tensions.merged} · Absent ${report.tensions.absent} · Distorted ${report.tensions.distorted} · Unassessed ${report.tensions.unassessed} · Conditional score ${pct(report.tensions.conditionalScore)}</p>` : `<p class="warning">Unavailable: ${esc(report.tensions.unavailableReason || 'no validated semantic partition was available.')}</p>`}` : ''}

<h2>${esc(labelForOrigin(report.summaryOrigin))}</h2><div class="summary">${esc(report.summary)}</div>
<h2>Limitations that travel with this report</h2><ul>${report.limitations.map(item => `<li>${esc(item)}</li>`).join('')}</ul>
<p class="meta">Generated by Co-Creation Provenance Lab. Review source evidence and run provenance before using this output in a decision.</p>
</body></html>`;

export const downloadReport = (data: AnalysisResult): void => {
  const report = generateReportData(data);
  const blob = new Blob([generateReportHTML(report)], { type: 'text/html' });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = `source-summary-audit-${report.dataset.replace(/\s+/g, '-').toLowerCase()}-${new Date().toISOString().split('T')[0]}.html`;
  document.body.appendChild(anchor);
  anchor.click();
  document.body.removeChild(anchor);
  URL.revokeObjectURL(url);
};

export const printReport = (data: AnalysisResult): void => {
  const printWindow = window.open('', '_blank');
  if (!printWindow) return;
  printWindow.document.write(generateReportHTML(generateReportData(data)));
  printWindow.document.close();
  printWindow.focus();
  setTimeout(() => printWindow.print(), 250);
};

export default { generateReportData, generateReportHTML, downloadReport, printReport };
