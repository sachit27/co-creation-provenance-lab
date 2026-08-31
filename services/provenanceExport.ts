/**
 * Unsigned W3C PROV-O audit record with a self-contained SHA-256 integrity
 * manifest. The digest detects changes after export but is not a signature and
 * does not establish the identity of an author, facilitator, or institution.
 *
 * Observed execution provenance is kept separate from model-estimated semantic
 * alignment. The latter is an assessment entity, never asserted as a causal
 * `prov:Derivation`. Source text is represented by SHA-256 digests by default.
 */

import { AnalysisResult, SummaryOrigin } from '../types';
import { getRepresentationBands } from '../constants';

const sha256 = async (value: string): Promise<string> => {
  if (!globalThis.crypto?.subtle) {
    throw new Error('SHA-256 is unavailable in this browser; provenance export was not created.');
  }
  const digest = await globalThis.crypto.subtle.digest('SHA-256', new TextEncoder().encode(value));
  return `sha256:${Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, '0')).join('')}`;
};

const canonicalize = (value: unknown, inArray = false): string | undefined => {
  if (value === null) return 'null';
  if (typeof value === 'string' || typeof value === 'boolean') return JSON.stringify(value);
  if (typeof value === 'number') return Number.isFinite(value) ? JSON.stringify(value) : 'null';
  if (Array.isArray(value)) return `[${value.map(item => canonicalize(item, true) ?? 'null').join(',')}]`;
  if (typeof value === 'object') {
    const entries = Object.entries(value as Record<string, unknown>)
      .filter(([, item]) => item !== undefined && typeof item !== 'function' && typeof item !== 'symbol')
      .sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0)
      .map(([key, item]) => `${JSON.stringify(key)}:${canonicalize(item)}`);
    return `{${entries.join(',')}}`;
  }
  return inArray ? 'null' : undefined;
};

/** Stable JSON serialization used only by this application's integrity manifest. */
export const canonicalizeProvenanceJson = (value: unknown): string => canonicalize(value) ?? 'null';

export interface ProvenanceIntegrityResult {
  valid: boolean;
  reason?: string;
  expectedDigest?: string;
  actualDigest?: string;
}

// Collision-free for arbitrary Unicode strings (unlike replacing '%' in a URI
// encoding, which made literal "-25" collide with an encoded percent sign).
const safeId = (value: string): string => Array.from(value)
  .map(character => `u${character.codePointAt(0)!.toString(16).padStart(6, '0')}`)
  .join('');

const originType = (origin: SummaryOrigin): string => {
  switch (origin) {
    case 'generated-in-run': return 'cprov:GeneratedSummary';
    case 'algorithmic-extractive': return 'cprov:ExtractiveSummary';
    case 'human-authored': return 'cprov:HumanAuthoredSummary';
    case 'ai-generated-external': return 'cprov:ExternallyGeneratedAISummary';
    case 'ai-assisted': return 'cprov:AIAssistedSummary';
    case 'mixed': return 'cprov:MixedAuthorshipSummary';
    default: return 'cprov:OriginUnknownSummary';
  }
};

export const generateProvenanceRecord = async (data: AnalysisResult): Promise<Record<string, unknown>> => {
  const exportedAt = new Date().toISOString();
  const manifest = data.runManifest;
  const origin = data.config.summaryProvenance?.origin ?? (
    data.config.summaryMethod === 'ai' ? 'generated-in-run'
      : data.config.summaryMethod === 'extractive' ? 'algorithmic-extractive'
      : 'unknown'
  );
  const bands = getRepresentationBands(data.embeddingTierUsed);
  const validParticipants = data.participants.filter(
    participant => !participant.embeddingFailed && !participant.alignmentUnavailableReason
  );
  const avgRepresentation = validParticipants.length > 0
    ? validParticipants.reduce((sum, participant) => sum + participant.representationScore, 0) / validParticipants.length
    : null;
  const contributionNodes = await Promise.all(data.participants.map(async participant => ({
    '@id': `cprov:Contribution-${safeId(participant.id)}`,
    '@type': ['prov:Entity', 'cprov:ParticipantContribution'],
    'rdfs:label': participant.id,
    'cprov:contentDigest': await sha256(participant.originalText),
    'cprov:digestAlgorithm': 'SHA-256',
    ...(participant.group ? { 'cprov:stakeholderGroup': participant.group } : {}),
  })));
  const contributionRefs = contributionNodes.map(node => ({ '@id': node['@id'] }));
  const summaryDigest = await sha256(data.summary);
  const runId = manifest?.runId ?? `legacy-${summaryDigest.slice(-16)}`;
  const generationActivityId = `cprov:SummaryGeneration-${safeId(runId)}`;
  const auditActivityId = `cprov:AlignmentAudit-${safeId(runId)}`;
  const claimActivityId = `cprov:ClaimEvidenceAudit-${safeId(runId)}`;
  const tensionActivityId = `cprov:TensionAudit-${safeId(runId)}`;
  const isGeneratedInRun = origin === 'generated-in-run' || origin === 'algorithmic-extractive';
  const evaluator = manifest?.actualEvaluator ?? data.affectiveFidelity?.evaluator ?? data.languageFidelity?.evaluator;
  const generator = manifest?.actualGenerator ?? manifest?.requestedGenerator;
  const evaluatorAgentId = `cprov:Evaluator-${safeId(runId)}`;
  const evaluatorRelationship = evaluator
    ? manifest?.requestedGenerator && manifest?.requestedEvaluator
      ? manifest.requestedGenerator.provider !== manifest.requestedEvaluator.provider
        ? 'different provider from generator'
        : manifest.requestedGenerator.model !== manifest.requestedEvaluator.model
          ? 'different model from generator; same provider'
          : 'same configured model as generator'
      : 'summary not generated in this run'
    : 'not recorded';

  const affectiveNodes: Record<string, unknown>[] = data.affectiveFidelity ? [
    {
      '@id': `cprov:AffectiveAudit-${safeId(runId)}`,
      '@type': ['prov:Activity', 'cprov:AutomatedAffectiveFidelityAudit'],
      'prov:used': [{ '@id': `cprov:SourceCollection-${safeId(runId)}` }, { '@id': 'cprov:Summary' }],
      'cprov:methodVersion': data.affectiveFidelity.methodVersion,
      ...(evaluator ? { 'prov:wasAssociatedWith': { '@id': evaluatorAgentId } } : {}),
      'cprov:evaluatorGeneratorRelationship': evaluatorRelationship,
      'prov:endedAtTime': { '@value': data.affectiveFidelity.generatedAt, '@type': 'xsd:dateTime' },
      'cprov:evaluatorProvider': data.affectiveFidelity.evaluator.provider,
      'cprov:evaluatorModel': data.affectiveFidelity.evaluator.model,
      'cprov:requestedTemperature': data.affectiveFidelity.evaluator.requestedTemperature,
      'cprov:effectiveTemperature': data.affectiveFidelity.evaluator.effectiveTemperature,
      'cprov:promptVersion': data.affectiveFidelity.evaluator.promptVersion,
      'cprov:minCertaintyScreen': data.affectiveFidelity.thresholds.minCertainty,
      'cprov:materialDifferenceOrdinalLevels': data.affectiveFidelity.thresholds.materialDifference,
      'cprov:limitations': data.affectiveFidelity.limitations,
    },
    {
      '@id': `cprov:AffectiveReport-${safeId(runId)}`,
      '@type': ['prov:Entity', 'cprov:AutomatedAffectiveFidelityReport'],
      'prov:wasGeneratedBy': { '@id': `cprov:AffectiveAudit-${safeId(runId)}` },
      'cprov:attenuationRate': data.affectiveFidelity.attenuationRate,
      'cprov:attenuationParticipantEquivalentNumerator': data.affectiveFidelity.attenuatedWeight,
      'cprov:comparableParticipantEquivalentDenominator': data.affectiveFidelity.comparableAffectBearingWeight,
      'cprov:coverageRate': data.affectiveFidelity.affectiveCoverageRate,
      'cprov:coverageParticipantEquivalentNumerator': data.affectiveFidelity.representedAffectBearingWeight,
      'cprov:assessedParticipantEquivalentDenominator': data.affectiveFidelity.assessedSourceAffectBearingWeight,
      'cprov:sourceProfileCompletionRate': data.affectiveFidelity.sourceProfileCompletionRate,
      'cprov:sourceProfileCompletedParticipantEquivalentNumerator': data.affectiveFidelity.sourceProfileCompletedWeight,
      'cprov:sourceCensusParticipantEquivalentDenominator': data.affectiveFidelity.sourceCensusParticipantWeight,
      'cprov:stageCounts': data.affectiveFidelity.stageCounts,
      'cprov:profileComparabilityRate': data.affectiveFidelity.profileComparabilityRate,
      'cprov:profileComparableParticipantEquivalentNumerator': data.affectiveFidelity.profileComparableAffectBearingWeight,
      'cprov:profileEligibleParticipantEquivalentDenominator': data.affectiveFidelity.profileEligibleAffectBearingWeight,
    },
    ...await Promise.all(data.affectiveFidelity.cases.map(async (item, index) => ({
      '@id': `cprov:AffectiveCase-${safeId(runId)}-${index}`,
      '@type': ['prov:Entity', 'cprov:AutomatedAffectiveFidelityCase'],
      'prov:wasGeneratedBy': { '@id': `cprov:AffectiveAudit-${safeId(runId)}` },
      'cprov:assessesContribution': { '@id': `cprov:Contribution-${safeId(item.participantId)}` },
      'cprov:sourceSpanDigest': await sha256(item.sourceSpan),
      ...(item.sourceContext ? { 'cprov:nonEvidentiarySourceContextDigest': await sha256(item.sourceContext) } : {}),
      ...(item.summarySpan ? { 'cprov:summarySpanDigest': await sha256(item.summarySpan) } : {}),
      'cprov:sourceUnitIndex': item.mappingSentenceIndex,
      'cprov:summarySentenceIndex': item.summarySentenceIndex,
      'cprov:targetRelation': item.targetRelation,
      'cprov:alignmentAssessed': item.alignmentAssessed,
      'cprov:transition': item.transition,
      'cprov:comparable': item.comparable,
      'cprov:sourceAffectBearing': item.sourceAffectBearing,
      'cprov:exclusionReason': item.exclusionReason ?? null,
      'cprov:transitionFlags': item.flags,
      'cprov:sourceProfile': item.sourceProfile,
      'cprov:summaryProfile': item.summaryProfile,
      'cprov:sourceCensusUnitWeight': item.unitWeight,
    }))),
  ] : [];

  const languageNodes: Record<string, unknown>[] = data.languageFidelity?.methodVersion === 'language-transformation-v2-source-census' ? [
    {
      '@id': `cprov:LanguageTransformationAudit-${safeId(runId)}`,
      '@type': ['prov:Activity', 'cprov:AutomatedLanguageTransformationAudit'],
      'prov:used': [{ '@id': `cprov:SourceCollection-${safeId(runId)}` }, { '@id': 'cprov:Summary' }],
      'cprov:methodVersion': data.languageFidelity.methodVersion,
      ...(evaluator ? { 'prov:wasAssociatedWith': { '@id': evaluatorAgentId } } : {}),
      'cprov:evaluatorGeneratorRelationship': evaluatorRelationship,
      ...(data.languageFidelity.generatedAt ? {
        'prov:endedAtTime': { '@value': data.languageFidelity.generatedAt, '@type': 'xsd:dateTime' },
      } : {}),
      'cprov:evaluatorProvider': data.languageFidelity.evaluator?.provider,
      'cprov:evaluatorModel': data.languageFidelity.evaluator?.model,
      'cprov:requestedTemperature': data.languageFidelity.evaluator?.requestedTemperature,
      'cprov:promptVersion': data.languageFidelity.evaluator?.promptVersion,
      'cprov:limitations': data.languageFidelity.limitations ?? [],
    },
    {
      '@id': `cprov:LanguageTransformationReport-${safeId(runId)}`,
      '@type': ['prov:Entity', 'cprov:AutomatedLanguageTransformationReport'],
      'prov:wasGeneratedBy': { '@id': `cprov:LanguageTransformationAudit-${safeId(runId)}` },
      'cprov:conditionalParticipantBalancedPreservationRate': data.languageFidelity.fidelityScore,
      'cprov:preservedParticipantEquivalentNumerator': data.languageFidelity.preservedParticipantEquivalent ?? null,
      'cprov:assessedParticipantEquivalentDenominator': data.languageFidelity.assessedParticipantEquivalent ?? null,
      'cprov:assessmentCoverageRate': data.languageFidelity.assessmentCoverageRate ?? null,
      'cprov:completedSourceUnitCount': data.languageFidelity.completedSourceUnitCount ?? null,
      'cprov:assessedSourceUnitCount': data.languageFidelity.assessedSourceUnitCount ?? null,
      'cprov:totalSourceUnitCount': data.languageFidelity.totalSourceUnitCount ?? null,
    },
    ...await Promise.all((data.languageFidelity.sourceMappings ?? []).map(async (mapping, index) => ({
      '@id': `cprov:LanguageTransformationCase-${safeId(runId)}-${index}`,
      '@type': ['prov:Entity', 'cprov:AutomatedLanguageTransformationCase'],
      'prov:wasGeneratedBy': { '@id': `cprov:LanguageTransformationAudit-${safeId(runId)}` },
      'cprov:assessesContribution': { '@id': `cprov:Contribution-${safeId(mapping.participantId)}` },
      'cprov:sourceUnitId': mapping.sourceUnitId,
      'cprov:sourceUnitIndex': mapping.sourceUnitIndex,
      'cprov:sourceSpanDigest': await sha256(mapping.rawPhrase),
      ...(mapping.sourceContext ? {
        'cprov:nonEvidentiaryContextDigest': await sha256(mapping.sourceContext),
        'cprov:contextRole': 'interpretive context; not participant testimony',
      } : {}),
      ...(mapping.summaryPhrase ? { 'cprov:summarySpanDigest': await sha256(mapping.summaryPhrase) } : {}),
      'cprov:summarySentenceIndex': mapping.summarySentenceIndex ?? null,
      'cprov:transformationType': mapping.type,
      'cprov:targetRelation': mapping.targetRelation ?? 'uncertain',
      'cprov:alignmentAssessed': mapping.alignmentAssessed ?? false,
    }))),
  ] : [];

  const claimNodes: Record<string, unknown>[] = data.claimAttribution ? [
    {
      '@id': claimActivityId,
      '@type': ['prov:Activity', 'cprov:AutomatedClaimEvidenceAudit'],
      'prov:used': [{ '@id': `cprov:SourceCollection-${safeId(runId)}` }, { '@id': 'cprov:Summary' }],
      ...(evaluator ? { 'prov:wasAssociatedWith': { '@id': evaluatorAgentId } } : {}),
      'cprov:evaluatorGeneratorRelationship': evaluatorRelationship,
    },
    {
      '@id': `cprov:ClaimEvidenceReport-${safeId(runId)}`,
      '@type': ['prov:Entity', 'cprov:AutomatedClaimEvidenceReport'],
      'prov:wasGeneratedBy': { '@id': claimActivityId },
      'cprov:conditionalAttributionScore': data.claimAttribution.attributionScore,
      'cprov:unassessedCount': data.claimAttribution.unassessedCount,
    },
    ...await Promise.all(data.claimAttribution.claims.map(async claim => ({
      '@id': `cprov:SummaryClaim-${safeId(runId)}-${claim.claimIndex}`,
      '@type': ['prov:Entity', 'cprov:AutomatedClaimEvidenceAssessment'],
      'prov:wasGeneratedBy': { '@id': claimActivityId },
      'cprov:claimText': claim.claimText,
      'cprov:summarySentenceIndex': claim.sentenceIndex,
      'cprov:supportLevel': claim.supportLevel,
      'cprov:evidence': await Promise.all(claim.evidence.map(async evidence => ({
        'cprov:contribution': { '@id': `cprov:Contribution-${safeId(evidence.participantId)}` },
        'cprov:passageDigest': await sha256(evidence.passage),
        'cprov:retrievalSimilarity': evidence.similarity,
      }))),
    }))),
  ] : [];

  const tensionNodes: Record<string, unknown>[] = data.tensionAnalysis ? [
    {
      '@id': tensionActivityId,
      '@type': ['prov:Activity', 'cprov:AutomatedTensionAudit'],
      'prov:used': [{ '@id': `cprov:SourceCollection-${safeId(runId)}` }, { '@id': 'cprov:Summary' }],
      ...(evaluator ? { 'prov:wasAssociatedWith': { '@id': evaluatorAgentId } } : {}),
      'cprov:evaluatorGeneratorRelationship': evaluatorRelationship,
    },
    {
      '@id': `cprov:TensionScan-${safeId(runId)}`,
      '@type': ['prov:Entity', 'cprov:AutomatedSampledTensionScan'],
      'prov:wasGeneratedBy': { '@id': tensionActivityId },
      'cprov:conditionalFidelityScore': data.tensionAnalysis.tensionFidelityScore,
      'cprov:unassessedCount': data.tensionAnalysis.unassessedCount,
      'cprov:samplingBasis': data.tensionAnalysis.basis ?? 'legacy-unvalidated',
      ...(data.tensionAnalysis.samplingCoverage ? { 'cprov:samplingCoverage': data.tensionAnalysis.samplingCoverage } : {}),
      ...(data.tensionAnalysis.unavailableReason ? { 'cprov:unavailableReason': data.tensionAnalysis.unavailableReason } : {}),
    },
    ...await Promise.all(data.tensionAnalysis.pairs.map(async (pair, index) => ({
      '@id': `cprov:TensionCase-${safeId(runId)}-${index}`,
      '@type': ['prov:Entity', 'cprov:AutomatedTensionCase'],
      'prov:wasGeneratedBy': { '@id': tensionActivityId },
      'cprov:claimAContribution': { '@id': `cprov:Contribution-${safeId(pair.claimA.participantId)}` },
      'cprov:claimBContribution': { '@id': `cprov:Contribution-${safeId(pair.claimB.participantId)}` },
      'cprov:claimADigest': await sha256(pair.claimA.text),
      'cprov:claimBDigest': await sha256(pair.claimB.text),
      'cprov:summaryHandling': pair.summaryHandling,
      ...(pair.tensionType ? { 'cprov:tensionType': pair.tensionType } : {}),
      ...(pair.summaryEvidence ? { 'cprov:summaryEvidenceDigest': await sha256(pair.summaryEvidence) } : {}),
    }))),
  ] : [];

  const graph: Record<string, unknown>[] = [
    {
      '@id': `cprov:SourceCollection-${safeId(runId)}`,
      '@type': ['prov:Entity', 'prov:Collection', 'cprov:ConsultationInputCollection'],
      'rdfs:label': data.config.datasetName,
      'prov:hadMember': contributionRefs,
      'cprov:participantCount': data.participants.length,
    },
    ...contributionNodes,
    {
      '@id': 'cprov:Summary',
      '@type': ['prov:Entity', originType(origin)],
      'rdfs:label': 'Summary under audit',
      'prov:value': data.summary,
      'cprov:contentDigest': summaryDigest,
      'cprov:digestAlgorithm': 'SHA-256',
      'cprov:declaredOrigin': origin,
      ...(data.config.summaryProvenance?.provider ? { 'cprov:declaredProvider': data.config.summaryProvenance.provider } : {}),
      ...(data.config.summaryProvenance?.model ? { 'cprov:declaredModel': data.config.summaryProvenance.model } : {}),
      ...(data.config.summaryProvenance?.generatedAt ? {
        'prov:generatedAtTime': { '@value': data.config.summaryProvenance.generatedAt, '@type': 'xsd:dateTime' },
      } : {}),
      ...(isGeneratedInRun ? { 'prov:wasGeneratedBy': { '@id': generationActivityId } } : {}),
    },
    ...(isGeneratedInRun ? [{
      '@id': generationActivityId,
      '@type': ['prov:Activity', 'cprov:SummaryGenerationActivity'],
      'rdfs:label': origin === 'algorithmic-extractive' ? 'Centroid-based extractive summarisation' : 'Model-based summarisation',
      'prov:used': { '@id': `cprov:SourceCollection-${safeId(runId)}` },
      ...(manifest?.startedAt ? { 'prov:startedAtTime': { '@value': manifest.startedAt, '@type': 'xsd:dateTime' } } : {}),
      ...(manifest?.completedAt ? { 'prov:endedAtTime': { '@value': manifest.completedAt, '@type': 'xsd:dateTime' } } : {}),
      'cprov:method': data.config.summaryMethod,
      'cprov:strategy': data.config.strategy,
      ...(generator ? { 'prov:wasAssociatedWith': { '@id': `cprov:Generator-${safeId(runId)}` } } : {}),
    }] : []),
    ...(generator ? [{
      '@id': `cprov:Generator-${safeId(runId)}`,
      '@type': ['prov:Agent', 'prov:SoftwareAgent'],
      'rdfs:label': generator.model,
      'cprov:provider': generator.provider,
      'cprov:modelIdentifierStatus': manifest?.actualGenerator
        ? 'provider-returned identifier'
        : 'configured identifier; provider-returned identifier unavailable',
    }] : []),
    ...(evaluator ? [{
      '@id': evaluatorAgentId,
      '@type': ['prov:Agent', 'prov:SoftwareAgent'],
      'rdfs:label': evaluator.model,
      'cprov:provider': evaluator.provider,
      'cprov:modelIdentifierStatus': manifest?.actualEvaluator ? 'provider-returned identifier' : 'configured identifier',
      'cprov:relationshipToGenerator': evaluatorRelationship,
    }] : []),
    {
      '@id': auditActivityId,
      '@type': ['prov:Activity', 'cprov:AutomatedAlignmentAudit'],
      'rdfs:label': 'Automated semantic-alignment audit',
      'prov:used': [
        { '@id': `cprov:SourceCollection-${safeId(runId)}` },
        { '@id': 'cprov:Summary' },
      ],
      ...(manifest?.startedAt ? { 'prov:startedAtTime': { '@value': manifest.startedAt, '@type': 'xsd:dateTime' } } : {}),
      ...(manifest?.completedAt ? { 'prov:endedAtTime': { '@value': manifest.completedAt, '@type': 'xsd:dateTime' } } : {}),
      'cprov:embeddingProvider': manifest?.actualEmbedding.provider ?? data.embeddingTierUsed ?? 'unknown',
      'cprov:embeddingModel': manifest?.actualEmbedding.model ?? data.config.embeddingModel,
      'cprov:scoreSemantics': 'heuristic semantic alignment; not probability, entailment, observed use, or causal derivation',
    },
    {
      '@id': `cprov:AuditReport-${safeId(runId)}`,
      '@type': ['prov:Entity', 'cprov:AutomatedEvaluationReport'],
      'prov:wasGeneratedBy': { '@id': auditActivityId },
      'cprov:averageRepresentation': avgRepresentation,
      'cprov:giniDispersion': data.metrics.giniCoefficient,
      'cprov:distinctRepresentationGap': data.metrics.distinctRepresentationGap,
      'cprov:scoredParticipants': data.metrics.scoredParticipants ?? validParticipants.length,
      'cprov:totalParticipants': data.metrics.totalParticipants,
      'cprov:thresholdBand': bands,
      'cprov:enrichmentStatus': data.enrichmentStatus ?? 'not-recorded',
      ...(data.enrichmentStages ? { 'cprov:enrichmentStages': data.enrichmentStages } : {}),
      ...(data.clusteringDiagnostics ? {
        'cprov:semanticGroupingDiagnostics': data.clusteringDiagnostics,
      } : {
        'cprov:semanticGroupingDiagnostics': {
          status: 'unavailable',
          reason: 'Legacy result contains no validated clustering diagnostics.',
          usableForDownstream: false,
        },
      }),
    },
    ...data.participants.map(participant => ({
      '@id': `cprov:AlignmentAssessment-${safeId(participant.id)}`,
      '@type': ['prov:Entity', 'cprov:EstimatedSemanticAlignment'],
      'prov:wasGeneratedBy': { '@id': auditActivityId },
      'cprov:assessesContribution': { '@id': `cprov:Contribution-${safeId(participant.id)}` },
      'cprov:assessesSummary': { '@id': 'cprov:Summary' },
      'cprov:representationScore': participant.embeddingFailed ? null : participant.representationScore,
      'cprov:semanticDistinctiveness': participant.semanticIsolation,
      'cprov:topMatchedSentenceIndex': participant.topSentenceMatchIndex,
      'cprov:embeddingFailed': !!participant.embeddingFailed,
      'cprov:leaveSelfOutAlignment': !!participant.alignmentLeaveSelfOut,
    })),
    ...(manifest?.completionCalls ?? []).map((call, index) => ({
      '@id': `cprov:Completion-${safeId(runId)}-${index}`,
      '@type': ['prov:Activity', 'cprov:ModelCompletionActivity'],
      'cprov:provider': call.provider,
      ...(call.role ? { 'cprov:applicationRole': call.role } : {}),
      'cprov:requestedModel': call.requestedModel,
      ...(call.returnedModel ? { 'cprov:providerReturnedModel': call.returnedModel } : {}),
      ...(call.responseId ? { 'cprov:responseId': call.responseId } : {}),
      ...(call.requestId ? { 'cprov:requestId': call.requestId } : {}),
      ...(call.finishReason ? { 'cprov:finishReason': call.finishReason } : {}),
      ...(call.usage ? { 'cprov:usage': call.usage } : {}),
      'cprov:effectiveParameters': call.effectiveParameters,
      'prov:endedAtTime': { '@value': call.createdAt, '@type': 'xsd:dateTime' },
    })),
    ...affectiveNodes,
    ...languageNodes,
    ...claimNodes,
    ...tensionNodes,
  ];

  const unsignedRecord: Record<string, unknown> = {
    '@context': {
      prov: 'http://www.w3.org/ns/prov#',
      xsd: 'http://www.w3.org/2001/XMLSchema#',
      rdfs: 'http://www.w3.org/2000/01/rdf-schema#',
      cprov: 'urn:co-creation-provenance:',
    },
    '@id': `cprov:Record-${safeId(runId)}`,
    '@type': 'prov:Bundle',
    'cprov:recordGeneratedAt': { '@value': exportedAt, '@type': 'xsd:dateTime' },
    'cprov:unsigned': true,
    'cprov:integrityScope': 'SHA-256 content digests detect later content changes; they do not authenticate an author or signer.',
    'cprov:softwareVersion': manifest?.softwareVersion ?? 'legacy-result-unknown',
    'cprov:fallbackEvents': manifest?.fallbackEvents ?? [],
    '@graph': graph,
  };
  const recordDigest = await sha256(canonicalizeProvenanceJson(unsignedRecord));
  return {
    ...unsignedRecord,
    'cprov:integrityManifest': {
      'cprov:algorithm': 'SHA-256',
      'cprov:canonicalization': 'cprov-canonical-json-v1',
      'cprov:digestScope': 'entire JSON object excluding cprov:integrityManifest',
      'cprov:recordDigest': recordDigest,
      'cprov:assurance': 'change-detection only; unsigned and unauthenticated',
    },
  };
};

/** Verify the local integrity manifest without implying signer authentication. */
export const verifyProvenanceRecordIntegrity = async (value: unknown): Promise<ProvenanceIntegrityResult> => {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    return { valid: false, reason: 'Record must be a JSON object.' };
  }
  const { ['cprov:integrityManifest']: manifestValue, ...digestScope } = value as Record<string, unknown>;
  if (typeof manifestValue !== 'object' || manifestValue === null || Array.isArray(manifestValue)) {
    return { valid: false, reason: 'Integrity manifest is missing.' };
  }
  const manifest = manifestValue as Record<string, unknown>;
  if (manifest['cprov:algorithm'] !== 'SHA-256' || manifest['cprov:canonicalization'] !== 'cprov-canonical-json-v1') {
    return { valid: false, reason: 'Unsupported integrity algorithm or canonicalization.' };
  }
  const expectedDigest = manifest['cprov:recordDigest'];
  if (typeof expectedDigest !== 'string') return { valid: false, reason: 'Record digest is missing.' };
  const actualDigest = await sha256(canonicalizeProvenanceJson(digestScope));
  return actualDigest === expectedDigest
    ? { valid: true, expectedDigest, actualDigest }
    : { valid: false, reason: 'Record contents do not match the integrity manifest.', expectedDigest, actualDigest };
};

/** @deprecated Kept as an API alias; the result is explicitly not a certificate. */
export const generateProvenanceCertificate = generateProvenanceRecord;

export const downloadProvenanceRecord = async (data: AnalysisResult): Promise<void> => {
  const record = await generateProvenanceRecord(data);
  const blob = new Blob([JSON.stringify(record, null, 2)], { type: 'application/ld+json' });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = `provenance-record-${data.config.datasetName.replace(/\s+/g, '-').toLowerCase()}-${new Date().toISOString().split('T')[0]}.jsonld`;
  document.body.appendChild(anchor);
  anchor.click();
  document.body.removeChild(anchor);
  URL.revokeObjectURL(url);
};

/** @deprecated Use downloadProvenanceRecord. */
export const downloadProvenanceCertificate = downloadProvenanceRecord;
