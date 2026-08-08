/**
 * W3C PROV-O Provenance Certificate Export
 *
 * Generates a machine-readable provenance record following the W3C PROV-O
 * ontology (https://www.w3.org/TR/prov-o/) in JSON-LD format.
 *
 * This allows institutions to:
 * - Attach a verifiable audit trail to AI-generated documents
 * - Demonstrate compliance with AI governance requirements (EU AI Act, etc.)
 * - Enable downstream tools to parse and reason about the provenance chain
 *
 * References:
 * - W3C PROV-O: https://www.w3.org/TR/prov-o/
 * - JSON-LD 1.1: https://www.w3.org/TR/json-ld11/
 */

import { AnalysisResult } from '../types';
import { ANALYSIS_CONFIG } from '../constants';

// ─── Certificate generation ───────────────────────────────────────────────────

export const generateProvenanceCertificate = (data: AnalysisResult): Record<string, unknown> => {
  const timestamp = new Date().toISOString();
  const avgRep =
    data.participants.reduce((s, p) => s + p.representationScore, 0) /
    Math.max(1, data.participants.length);

  const { representationTarget } = ANALYSIS_CONFIG.thresholds;
  const { atRisk } = ANALYSIS_CONFIG.representationInterpretation;

  const wellRepresented = data.participants.filter(
    p => p.representationScore >= representationTarget
  ).length;

  const atRiskParticipants = data.participants.filter(
    p => p.representationScore < atRisk
  );

  return {
    '@context': {
      prov: 'http://www.w3.org/ns/prov#',
      xsd: 'http://www.w3.org/2001/XMLSchema#',
      rdfs: 'http://www.w3.org/2000/01/rdf-schema#',
      // Custom Co-Creation Provenance Lab namespace
      cprov: 'https://cocreation-provenance-lab.github.io/ns#',
    },
    '@graph': [

      // ── Activity: The summarisation process ────────────────────────────────
      {
        '@id': 'cprov:SummarisationActivity',
        '@type': 'prov:Activity',
        'prov:startedAtTime': { '@value': timestamp, '@type': 'xsd:dateTime' },
        'rdfs:label': `Co-creation summarisation — ${data.config.datasetName}`,
        'cprov:strategy': data.config.strategy,
        'cprov:summaryMethod': data.config.summaryMethod,
        'cprov:embeddingTier': data.embeddingTierUsed ?? 'unknown',
      },

      // ── Agent: The AI model used ────────────────────────────────────────────
      {
        '@id': `cprov:Agent-${data.config.model.replace(/[^a-zA-Z0-9]/g, '-')}`,
        '@type': ['prov:SoftwareAgent', 'prov:Agent'],
        'rdfs:label': data.config.model,
        'cprov:provider': data.config.aiProvider,
      },

      // ── Entity: The AI-generated summary ──────────────────────────────────
      {
        '@id': 'cprov:Summary',
        '@type': ['prov:Entity', 'cprov:AISummary'],
        'rdfs:label': 'AI-generated summary',
        'prov:value': data.summary,
        'prov:wasGeneratedBy': { '@id': 'cprov:SummarisationActivity' },
        'prov:wasAttributedTo': {
          '@id': `cprov:Agent-${data.config.model.replace(/[^a-zA-Z0-9]/g, '-')}`,
        },
        // Representation audit results
        'cprov:overallRepresentationScore': parseFloat(avgRep.toFixed(4)),
        'cprov:giniCoefficient': parseFloat(
          data.metrics.giniCoefficient.toFixed(4)
        ),
        'cprov:equityGap': parseFloat(
          data.metrics.distinctRepresentationGap.toFixed(4)
        ),
        'cprov:wellRepresentedCount': wellRepresented,
        'cprov:atRiskCount': atRiskParticipants.length,
        'cprov:totalParticipants': data.participants.length,
        'cprov:auditTimestamp': { '@value': timestamp, '@type': 'xsd:dateTime' },
        'cprov:datasetName': data.config.datasetName,
      },

      // ── Entities: Each participant's contribution ─────────────────────────
      ...data.participants.map(p => ({
        '@id': `cprov:Participant-${encodeURIComponent(p.id)}`,
        '@type': ['prov:Entity', 'cprov:ParticipantContribution'],
        'rdfs:label': p.id,
        'prov:value': p.originalText,
        'prov:wasUsedBy': { '@id': 'cprov:SummarisationActivity' },
        // Representation metrics per participant
        'cprov:representationScore': parseFloat(p.representationScore.toFixed(4)),
        'cprov:semanticIsolation': parseFloat(p.semanticIsolation.toFixed(4)),
        'cprov:representationStatus':
          p.representationScore >= representationTarget
            ? 'adequate'
            : p.representationScore < atRisk
            ? 'at-risk'
            : 'underrepresented',
        'cprov:sentiment': p.sentiment,
        'cprov:droppedConcepts': p.keywords ?? [],
        ...(p.group ? { 'cprov:stakeholderGroup': p.group } : {}),
        ...(p.detectedLanguage
          ? { 'cprov:detectedLanguage': p.detectedLanguage }
          : {}),
        ...(p.embeddingTier
          ? { 'cprov:embeddingTier': p.embeddingTier }
          : {}),
      })),

      // ── Provenance links: summary ← participant contributions ─────────────
      ...data.participants.map(p => ({
        '@id': `cprov:Derivation-${encodeURIComponent(p.id)}`,
        '@type': 'prov:Derivation',
        'prov:generatedEntity': { '@id': 'cprov:Summary' },
        'prov:usedEntity': {
          '@id': `cprov:Participant-${encodeURIComponent(p.id)}`,
        },
        'cprov:representationScore': parseFloat(p.representationScore.toFixed(4)),
        'cprov:topMatchedSentenceIndex': p.topSentenceMatchIndex,
      })),

      // ── Optional: Language equity report ──────────────────────────────────
      ...(data.languageAnalysis
        ? [
            {
              '@id': 'cprov:LanguageEquityReport',
              '@type': 'cprov:EquityReport',
              'cprov:hasMultipleLanguages':
                data.languageAnalysis.hasMultipleLanguages,
              'cprov:hasEquityIssue': data.languageAnalysis.hasEquityIssue,
              'cprov:underrepresentedLanguages':
                data.languageAnalysis.underrepresentedLanguages,
              'prov:wasGeneratedBy': { '@id': 'cprov:SummarisationActivity' },
            },
          ]
        : []),

      // ── Uncertainty metrics ─────────────────────────────────────────────
      ...(data.uncertaintyMetrics
        ? [
            {
              '@id': 'cprov:UncertaintyReport',
              '@type': 'cprov:StatisticalReport',
              'cprov:bootstrapSamples': data.uncertaintyMetrics.bootstrapSamples,
              'cprov:giniCI_lower': data.uncertaintyMetrics.giniCI.lower,
              'cprov:giniCI_upper': data.uncertaintyMetrics.giniCI.upper,
              'cprov:avgRepCI_lower':
                data.uncertaintyMetrics.avgRepresentationCI.lower,
              'cprov:avgRepCI_upper':
                data.uncertaintyMetrics.avgRepresentationCI.upper,
              'prov:wasGeneratedBy': { '@id': 'cprov:SummarisationActivity' },
            },
          ]
        : []),
    ],
  };
};

// ─── Download helpers ─────────────────────────────────────────────────────────

export const downloadProvenanceCertificate = (data: AnalysisResult): void => {
  const cert = generateProvenanceCertificate(data);
  const json = JSON.stringify(cert, null, 2);
  const blob = new Blob([json], { type: 'application/ld+json' });
  const url = URL.createObjectURL(blob);

  const a = document.createElement('a');
  a.href = url;
  a.download = `provenance-${data.config.datasetName.replace(/\s+/g, '-').toLowerCase()}-${
    new Date().toISOString().split('T')[0]
  }.jsonld`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
};
