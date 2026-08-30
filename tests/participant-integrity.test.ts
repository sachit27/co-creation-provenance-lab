import {
  VERIFICATION_CANONICALIZATION,
  VERIFICATION_RESPONSE_SCHEMA,
  canonicalizeVerificationJson,
  createVerificationRequest,
  generateVerificationHTML,
  sha256Digest,
  validateParticipantResponse,
} from '../tests/.modules/services/participantVerification.ts';
import {
  canonicalizeProvenanceJson,
  verifyProvenanceRecordIntegrity,
} from '../tests/.modules/services/provenanceExport.ts';
import type { AnalysisResult } from '../tests/.modules/types.ts';

let pass = 0;
let fail = 0;
const check = (name: string, condition: boolean, detail = '') => {
  if (condition) { pass++; console.log(`  PASS  ${name}`); }
  else { fail++; console.log(`  FAIL  ${name} ${detail}`); }
};

const data = {
  summary: 'A bound summary with <script>unsafe()</script>.',
  config: {
    datasetName: 'Integrity study',
    summaryMethod: 'ai',
    summaryProvenance: { origin: 'generated-in-run' },
  },
  runManifest: { runId: 'run-integrity-001' },
} as unknown as AnalysisResult;

console.log('\n[1] Canonicalization and request construction');
check('object key order is stable', canonicalizeVerificationJson({ b: 2, a: 1 }) === canonicalizeVerificationJson({ a: 1, b: 2 }));
const request = await createVerificationRequest(data, 7);
check('request has a cryptographic ID', request.requestId.length >= 16);
check('request is bound to run', request.runId === 'run-integrity-001');
check('request is bound to summary', request.summaryDigest === await sha256Digest(data.summary));
check('expiry follows issue time', Date.parse(request.expiresAt) > Date.parse(request.issuedAt));

console.log('\n[2] Privacy-minimal offline page');
const html = await generateVerificationHTML(data);
check('summary HTML is escaped', !html.includes('<script>unsafe()</script>') && html.includes('&lt;script&gt;unsafe()&lt;/script&gt;'));
check('request schema is embedded', html.includes('participant-verification-request-v3'));
check('identity limitation is explicit', html.includes('cannot send responses or verify identity'));
check('no participant roster is embedded', !html.includes('participant-001') && html.includes('No participant roster'));

const response = {
  responseId: 'response-integrity-0001',
  participantId: 'P01',
  verdict: 'partial',
  comment: 'One issue was omitted.',
  submittedAt: new Date(Date.parse(request.issuedAt) + 1_000).toISOString(),
};
const envelope = {
  schemaVersion: VERIFICATION_RESPONSE_SCHEMA,
  request,
  response,
  integrity: {
    algorithm: 'SHA-256',
    canonicalization: VERIFICATION_CANONICALIZATION,
    payloadDigest: await sha256Digest(canonicalizeVerificationJson({ request, response })),
    assurance: 'corruption-and-binding-check-only',
  },
};
const context = {
  runId: data.runManifest!.runId,
  datasetName: data.config.datasetName,
  summary: data.summary,
  participantIds: ['P01', 'P02'],
};

console.log('\n[3] Bound response validation');
const valid = await validateParticipantResponse(envelope, context);
check('valid bound response is accepted', valid.feedback?.participantId === 'P01' && valid.feedback.bindingVerified === true, valid.errors.join('; '));
const tampered = structuredClone(envelope);
tampered.response.comment = 'Changed after export';
const tamperResult = await validateParticipantResponse(tampered, context);
check('tampered payload is rejected', tamperResult.feedback === null && tamperResult.errors.some(error => error.includes('payload digest')));
const wrongSummary = await validateParticipantResponse(envelope, { ...context, summary: 'Different summary' });
check('summary mismatch is rejected', wrongSummary.errors.some(error => error.includes('different summary')));
const outsider = structuredClone(envelope);
outsider.response.participantId = 'OUTSIDER';
outsider.integrity.payloadDigest = await sha256Digest(canonicalizeVerificationJson({ request: outsider.request, response: outsider.response }));
const outsiderResult = await validateParticipantResponse(outsider, context);
check('unknown participant is rejected', outsiderResult.errors.some(error => error.includes('not in this analysis')));
const duplicate = await validateParticipantResponse(envelope, { ...context, existingResponseIds: [response.responseId] });
check('duplicate response ID is rejected', duplicate.errors.some(error => error.includes('already imported')));
const late = structuredClone(envelope);
late.response.submittedAt = new Date(Date.parse(request.expiresAt) + 1).toISOString();
late.integrity.payloadDigest = await sha256Digest(canonicalizeVerificationJson({ request: late.request, response: late.response }));
const lateResult = await validateParticipantResponse(late, context);
check('post-expiry response is rejected', lateResult.errors.some(error => error.includes('after the request expired')));

console.log('\n[4] Unsigned provenance integrity manifest');
const recordBody = { '@type': 'prov:Bundle', 'cprov:unsigned': true, '@graph': [{ '@id': 'example' }] };
const recordDigest = await sha256Digest(canonicalizeProvenanceJson(recordBody));
const record = {
  ...recordBody,
  'cprov:integrityManifest': {
    'cprov:algorithm': 'SHA-256',
    'cprov:canonicalization': 'cprov-canonical-json-v1',
    'cprov:recordDigest': recordDigest,
  },
};
check('unchanged record verifies', (await verifyProvenanceRecordIntegrity(record)).valid);
const changedRecord = structuredClone(record);
changedRecord['@graph'][0]['@id'] = 'modified';
check('changed record fails verification', !(await verifyProvenanceRecordIntegrity(changedRecord)).valid);
check('record remains explicitly unsigned', record['cprov:unsigned'] === true);

console.log(`\n${fail === 0 ? 'ALL CHECKS PASSED' : 'FAILURES PRESENT'} — passed ${pass}, failed ${fail}`);
process.exit(fail === 0 ? 0 : 1);
