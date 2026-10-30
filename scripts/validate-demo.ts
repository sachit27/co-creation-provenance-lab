/** Offline integrity checks for a demo candidate. No provider calls. */
import { readFile } from 'node:fs/promises';
import { SAMPLE_DATA } from '../constants.ts';
import { buildReviewQueue, compareSourceScores } from '../services/auditReview.ts';
import type { AnalysisResult } from '../types.ts';

const filename = process.argv[2] || 'tmp/demo-result.candidate.json';
const result: AnalysisResult = JSON.parse(await readFile(filename,'utf8'));
const failures: string[] = [];
const check = (condition: unknown, message: string) => { if (!condition) failures.push(message); };
const normal = (s: string) => s.toLocaleLowerCase().replace(/\s+/g,' ').trim();
check(result.participants.length === SAMPLE_DATA.length, 'source census size differs');
check(new Set(result.participants.map(p => p.id)).size === SAMPLE_DATA.length,'duplicate source IDs');
check(SAMPLE_DATA.every(p => result.participants.some(q => p.id === q.id && p.text === q.originalText)), 'source IDs/text differ from tutorial fixture');
check(result.runManifest?.actualEmbedding.provider === 'openai' && result.runManifest.actualEmbedding.model === 'text-embedding-3-small','embedding identity differs');
check(result.config.model === 'gpt-4o-mini' && result.config.evaluatorModel === 'gpt-4o-mini','unexpected configured model');
check(result.enrichmentStatus === 'complete','enrichment incomplete');
check((result.runManifest?.fallbackEvents.length ?? 1) === 0,'fallback occurred');
check(result.languageFidelity?.methodVersion === 'language-transformation-v2-source-census', 'source census method missing');
check(result.affectiveFidelity?.methodVersion === 'affective-fidelity-v2-source-census','affect census method missing');
check(result.clusteringDiagnostics?.methodVersion === 'spherical-kmeans-stability-v4','current clustering diagnostics missing');
check(result.tensionAnalysis?.methodVersion === 'conservative-exact-span-v4','current tension method missing');
check(!result.inputEmbeddings, 'private input embeddings included');
for (const p of result.participants) {
 check(!p.embeddingFailed && !p.alignmentUnavailableReason && Number.isFinite(p.representationScore),'invalid source score: '+p.id);
 for (const match of p.sentenceMatches) check(Number.isInteger(match.sentenceIndex) && !!result.summarySentences[match.sentenceIndex] && Number.isFinite(match.similarity),'invalid sentence candidate: '+p.id);
}
for (const m of result.languageFidelity?.sourceMappings ?? []) {
 const p = result.participants.find(p => p.id === m.participantId);
 check(!!p && !!m.rawPhrase && normal(p.originalText).includes(normal(m.rawPhrase)), 'unverified language source span: '+m.participantId);
 if (m.summaryPhrase) check(normal(result.summary).includes(normal(m.summaryPhrase)), 'unverified summary language span: '+m.participantId);
}
for (const pair of result.tensionAnalysis?.pairs ?? []) {
 for (const c of [pair.claimA,pair.claimB]) check(!!c.text && normal(result.participants.find(p => p.id===c.participantId)?.originalText ?? '').includes(normal(c.text)), 'unverified tension source: '+c.participantId);
 if (pair.summaryEvidence) check(normal(result.summary).includes(normal(pair.summaryEvidence)),'unverified tension summary evidence');
}
for (const claim of result.claimAttribution?.claims ?? []) {
 check(!!claim.claimText && Number.isInteger(claim.sentenceIndex) && !!result.summarySentences[claim.sentenceIndex], 'claim has no valid parent summary sentence');
 for (const evidence of claim.evidence) check(!!evidence.passage && normal(result.participants.find(p=>p.id===evidence.participantId)?.originalText ?? '').includes(normal(evidence.passage)), 'claim evidence not in source: '+evidence.participantId);
}
const language = result.languageFidelity;
check(language?.totalSourceUnitCount === language?.sourceMappings?.length, 'language census count differs from stored units');
check((language?.assessedSourceUnitCount ?? 0) <= (language?.totalSourceUnitCount ?? 0), 'language assessed count exceeds census');
const serialized = JSON.stringify(result);
check(!process.env.OPENAI_API_KEY || !serialized.includes(process.env.OPENAI_API_KEY), 'provider credential included');
const prior = process.argv[3] ? JSON.parse(await readFile(process.argv[3], 'utf8')) as AnalysisResult : null;
if (prior) check(compareSourceScores(prior,result).comparable,'revision score comparison not compatible');
const report = { filename, runId: result.runManifest?.runId, sourceRecords: result.participants.length,
 summarySentences: result.summarySentences.length, summaryWords: result.summary.split(/\s+/).length,
 reviewSuggestions: buildReviewQueue(result).length,
 languageUnits: result.languageFidelity?.totalSourceUnitCount, assessedLanguageUnits: result.languageFidelity?.assessedSourceUnitCount,
 languageAssessmentCoverage: result.languageFidelity?.assessmentCoverageRate,
 tensionPairs: result.tensionAnalysis?.pairs.length,
 revisionComparison: prior ? { validPairs: compareSourceScores(prior,result).changes.length,
  increased: compareSourceScores(prior,result).changes.filter(c=>c.change>0.005).length,
  decreased: compareSourceScores(prior,result).changes.filter(c=>c.change< -0.005).length } : null,
 failures, passed: failures.length === 0 };
console.log(JSON.stringify(report,null,2));
if(failures.length) process.exitCode=1;
