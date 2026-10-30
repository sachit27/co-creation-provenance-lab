import type { AnalysisResult, AuditReviewDecision } from '../types';
import { getRepresentationBands } from '../constants.ts';

export interface ReviewIssue {
  id: string;
  kind: 'alignment' | 'language' | 'claim' | 'tension';
  title: string;
  explanation: string;
  sources: Array<{ id: string; text: string }>;
  summaryText: string | null;
}

/** Suggestions for human inspection; never automatic findings of unfairness. */
export function buildReviewQueue(data: AnalysisResult): ReviewIssue[] {
  const issues: ReviewIssue[] = [];
  const source = (id: string) => data.participants.find(p => p.id === id);
  const threshold = data.config.thresholds?.matchingThreshold ?? getRepresentationBands(data.embeddingTierUsed).low;
  for (const p of data.participants) {
    if (p.embeddingFailed || p.alignmentUnavailableReason || !Number.isFinite(p.representationScore)) continue;
    if (p.representationScore >= threshold) continue;
    const match = [...p.sentenceMatches].filter(m => Number.isFinite(m.similarity) && data.summarySentences[m.sentenceIndex]).sort((a,b) => b.similarity-a.similarity)[0];
    issues.push({ id: `alignment:${p.id}`, kind: 'alignment', title: 'Lower source-to-summary similarity', explanation: `Strongest-sentence score ${p.representationScore.toFixed(2)} is below the configured review reference (${threshold.toFixed(2)}). This does not establish omission.`, sources: [{ id: p.id, text: p.originalText }], summaryText: match ? data.summarySentences[match.sentenceIndex] : null });
  }
  if (data.languageFidelity?.methodVersion === 'language-transformation-v2-source-census') {
    for (const [index, mapping] of (data.languageFidelity.sourceMappings ?? []).entries()) {
      const p = source(mapping.participantId);
      if (!p || !mapping.alignmentAssessed || !mapping.rawPhrase || !p.originalText.includes(mapping.rawPhrase)) continue;
      if (!['softened','sanitized','abstracted','target_shifted','dropped'].includes(mapping.type)) continue;
      if (mapping.type !== 'dropped' && (!mapping.summaryPhrase || !data.summary.includes(mapping.summaryPhrase))) continue;
      issues.push({ id: `language:${mapping.participantId}:${mapping.sourceUnitId ?? index}`, kind: 'language', title: mapping.type === 'dropped' ? 'Possible missing source idea' : 'Possible change in meaning or emphasis', explanation: `The language evaluator classified this source unit as “${mapping.type}”. Check the wording and context before confirming a concern.`, sources: [{ id: p.id, text: mapping.rawPhrase }], summaryText: mapping.summaryPhrase });
    }
  }
  for (const claim of data.claimAttribution?.claims ?? []) {
    if (!['unsupported','contradicted','unassessed'].includes(claim.supportLevel) || !claim.claimText || !Number.isInteger(claim.sentenceIndex) || !data.summarySentences[claim.sentenceIndex]) continue;
    issues.push({ id: `claim:${claim.claimIndex}`, kind: 'claim', title: claim.supportLevel === 'unassessed' ? 'Claim assessment incomplete' : claim.supportLevel === 'unsupported' ? 'Claim needs supporting evidence' : 'Possible source–summary contradiction', explanation: `The claim evaluator returned “${claim.supportLevel}” for its extracted claim: “${claim.claimText}”. Read the parent summary sentence below. An unassessed claim is not an unsupported claim; retrieved passages are candidates, not proof.`, sources: claim.evidence.filter(e => source(e.participantId)?.originalText.includes(e.passage)).map(e => ({ id: e.participantId, text: e.passage })), summaryText: data.summarySentences[claim.sentenceIndex] });
  }
  for (const [index, pair] of (data.tensionAnalysis?.pairs ?? []).entries()) {
    if (!['acknowledged','suppressed','merged','absent','distorted','unassessed'].includes(pair.summaryHandling)) continue;
    if (![pair.claimA,pair.claimB].every(c => !!c.text && source(c.participantId)?.originalText.includes(c.text))) continue;
    issues.push({ id: `tension:${index}`, kind: 'tension', title: pair.summaryHandling === 'unassessed' ? 'Tension candidate needs verification' : pair.summaryHandling === 'acknowledged' ? 'Verify a model-detected tension' : 'Competing views need a closer look', explanation: `${pair.tensionDescription} Automated summary-handling label: ${pair.summaryHandling}. Verify whether the views conflict before assessing how the summary handles them.`, sources: [pair.claimA,pair.claimB].map(c => ({ id: c.participantId, text: c.text })), summaryText: pair.summaryEvidence && data.summary.includes(pair.summaryEvidence) ? pair.summaryEvidence : null });
  }
  return issues;
}

export function saveReviewDecision(decisions: AuditReviewDecision[], decision: AuditReviewDecision): AuditReviewDecision[] {
  return [...decisions.filter(item => item.issueId !== decision.issueId), decision];
}

export function compareSourceScores(before: AnalysisResult, after: AnalysisResult) {
  const a = before.runManifest?.actualEmbedding;
  const b = after.runManifest?.actualEmbedding;
  const sameSources = before.participants.length === after.participants.length && before.participants.every(p => after.participants.some(q => p.id === q.id && p.originalText === q.originalText));
  const comparable = !!a && !!b && a.provider === b.provider && a.model === b.model && sameSources;
  const changes = comparable ? after.participants.flatMap(p => {
    const previous = before.participants.find(q => q.id === p.id)!;
    if ([p, previous].some(q => q.embeddingFailed || q.alignmentUnavailableReason || !Number.isFinite(q.representationScore))) return [];
    return [{ id: p.id, text: p.originalText, before: previous.representationScore, after: p.representationScore, change: p.representationScore - previous.representationScore }];
  }) : [];
  return { comparable, sameSources, changes };
}

/** Word-level common prefix/suffix highlighting; no semantic inference. */
export function changedWords(before: string, after: string) {
  const a = before.split(/(\s+)/), b = after.split(/(\s+)/);
  let prefix = 0, suffix = 0;
  while (prefix < Math.min(a.length,b.length) && a[prefix] === b[prefix]) prefix++;
  while (suffix < Math.min(a.length,b.length)-prefix && a[a.length-1-suffix] === b[b.length-1-suffix]) suffix++;
  const parts = (tokens: string[]) => ({ start: tokens.slice(0,prefix).join(''), changed: tokens.slice(prefix,tokens.length-suffix).join(''), end: suffix ? tokens.slice(-suffix).join('') : '' });
  return { before: parts(a), after: parts(b) };
}

/** Restore annotations only when source text and summary exactly match. */
export function restoreReviewDecisions(current: AnalysisResult, saved: unknown): AuditReviewDecision[] {
  if (!saved || typeof saved !== 'object') throw new Error('Choose an exported audit JSON file.');
  const record = saved as AnalysisResult;
  if ((current.runManifest?.runId && record.runManifest?.runId !== current.runManifest.runId) || record.summary !== current.summary || !Array.isArray(record.participants) || record.participants.length !== current.participants.length ||
      !current.participants.every(p => record.participants.some(q => q.id === p.id && q.originalText === p.originalText))) {
    throw new Error('These notes belong to a different summary or source collection. Open the matching audit first.');
  }
  const allowed = new Set(buildReviewQueue(current).map(issue => issue.id));
  const seen = new Set<string>();
  if (!Array.isArray(record.reviewDecisions)) throw new Error('This file has no review decisions.');
  return record.reviewDecisions.map(d => {
    if (!d || !allowed.has(d.issueId) || seen.has(d.issueId) || !['unresolved','confirmed','dismissed'].includes(d.status) ||
        typeof d.note !== 'string' || d.note.length > 4000 || !Number.isFinite(Date.parse(d.updatedAt))) {
      throw new Error('The file contains invalid decisions or issues that differ from this audit.');
    }
    seen.add(d.issueId);
    return { issueId: d.issueId, status: d.status, note: d.note, updatedAt: d.updatedAt };
  });
}

/** Bounded word-level LCS diff for reading edits; never a semantic judgment. */
export function wordDiffSegments(before: string, after: string) {
  const a = before.match(/\s+|[^\s]+/g) ?? [], b = after.match(/\s+|[^\s]+/g) ?? [];
  type Segment = { text: string; changed: boolean };
  if ((a.length + 1) * (b.length + 1) > 1_000_000) {
    const spans = changedWords(before, after);
    const segments = (span: { start: string; changed: string; end: string }): Segment[] => [
      {text:span.start,changed:false},{text:span.changed,changed:true},{text:span.end,changed:false},
    ].filter(s=>s.text.length>0);
    return { before: segments(spans.before), after: segments(spans.after), detailed: false };
  }
  const columns=b.length+1, table=new Uint16Array((a.length+1)*columns);
  for(let i=a.length-1;i>=0;i--) for(let j=b.length-1;j>=0;j--) table[i*columns+j]=a[i]===b[j] ? table[(i+1)*columns+j+1]+1 : Math.max(table[(i+1)*columns+j],table[i*columns+j+1]);
  const left:Segment[]=[],right:Segment[]=[];
  const append=(target:Segment[],text:string,changed:boolean)=>{const last=target.at(-1);if(last&&last.changed===changed)last.text+=text;else target.push({text,changed});};
  let i=0,j=0;
  while(i<a.length||j<b.length) {
    if(i<a.length&&j<b.length&&a[i]===b[j]){append(left,a[i++],false);append(right,b[j++],false);}
    else if(j<b.length&&(i===a.length||table[i*columns+j+1]>=table[(i+1)*columns+j])) append(right,b[j++],true);
    else append(left,a[i++],true);
  }
  return {before:left,after:right,detailed:true};
}
