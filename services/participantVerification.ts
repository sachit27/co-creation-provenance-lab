/**
 * Privacy-minimal participant response package.
 *
 * The exported page contains one summary and produces exactly one response. A
 * request is cryptographically bound to the analysis run and summary, and the
 * importer verifies that binding, expiry, participant membership, and payload
 * digest. These controls detect stale, mismatched, duplicate, and corrupted
 * files. They do not authenticate participant identity or prove authorship: a
 * static offline page has no trusted identity provider or facilitator-held key.
 */

import { AnalysisResult, ParticipantFeedback } from '../types';

export const VERIFICATION_RESPONSE_SCHEMA = 'participant-response-v3' as const;
export const VERIFICATION_REQUEST_SCHEMA = 'participant-verification-request-v3' as const;
export const VERIFICATION_CANONICALIZATION = 'cprov-canonical-json-v1' as const;
const DEFAULT_VALIDITY_DAYS = 30;
const MAX_COMMENT_LENGTH = 5000;

export interface VerificationRequest {
  schemaVersion: typeof VERIFICATION_REQUEST_SCHEMA;
  requestId: string;
  issuedAt: string;
  expiresAt: string;
  runId: string | null;
  datasetDigest: string;
  summaryDigest: string;
  requestDigest: string;
}

export interface ParticipantResponsePayload {
  responseId: string;
  participantId: string;
  verdict: 'yes' | 'partial' | 'no';
  comment: string;
  submittedAt: string;
}

export interface ParticipantResponseExport {
  schemaVersion: typeof VERIFICATION_RESPONSE_SCHEMA;
  request: VerificationRequest;
  response: ParticipantResponsePayload;
  integrity: {
    algorithm: 'SHA-256';
    canonicalization: typeof VERIFICATION_CANONICALIZATION;
    payloadDigest: string;
    assurance: 'corruption-and-binding-check-only';
  };
}

export interface VerificationImportContext {
  runId: string | null;
  datasetName: string;
  summary: string;
  participantIds: Iterable<string>;
  existingResponseIds?: Iterable<string>;
}

export interface VerificationImportResult {
  feedback: ParticipantFeedback | null;
  errors: string[];
  warnings: string[];
}

const escHtml = (value: unknown): string => String(value ?? '')
  .replace(/&/g, '&amp;')
  .replace(/</g, '&lt;')
  .replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;')
  .replace(/'/g, '&#39;');

const safeJson = (value: unknown): string => JSON.stringify(value)
  .replace(/</g, '\\u003c')
  .replace(/>/g, '\\u003e')
  .replace(/&/g, '\\u0026');

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

export const canonicalizeVerificationJson = (value: unknown): string => canonicalize(value) ?? 'null';

export const sha256Digest = async (value: string): Promise<string> => {
  if (!globalThis.crypto?.subtle) throw new Error('SHA-256 is unavailable in this environment.');
  const bytes = new TextEncoder().encode(value);
  const digest = await globalThis.crypto.subtle.digest('SHA-256', bytes);
  return `sha256:${Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, '0')).join('')}`;
};

const randomId = (): string => {
  if (globalThis.crypto?.randomUUID) return globalThis.crypto.randomUUID();
  if (!globalThis.crypto?.getRandomValues) throw new Error('A cryptographically secure random-number generator is unavailable.');
  const bytes = globalThis.crypto.getRandomValues(new Uint8Array(16));
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = Array.from(bytes, byte => byte.toString(16).padStart(2, '0')).join('');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
};

const requestDigestInput = (request: Omit<VerificationRequest, 'requestDigest'>) => ({
  schemaVersion: request.schemaVersion,
  requestId: request.requestId,
  issuedAt: request.issuedAt,
  expiresAt: request.expiresAt,
  runId: request.runId,
  datasetDigest: request.datasetDigest,
  summaryDigest: request.summaryDigest,
});

export const createVerificationRequest = async (
  data: AnalysisResult,
  validityDays = DEFAULT_VALIDITY_DAYS,
): Promise<VerificationRequest> => {
  if (!Number.isFinite(validityDays) || validityDays <= 0 || validityDays > 365) {
    throw new Error('Verification validity must be between 1 and 365 days.');
  }
  const issued = new Date();
  const unsigned: Omit<VerificationRequest, 'requestDigest'> = {
    schemaVersion: VERIFICATION_REQUEST_SCHEMA,
    requestId: randomId(),
    issuedAt: issued.toISOString(),
    expiresAt: new Date(issued.getTime() + validityDays * 86_400_000).toISOString(),
    runId: data.runManifest?.runId ?? null,
    datasetDigest: await sha256Digest(data.config.datasetName),
    summaryDigest: await sha256Digest(data.summary),
  };
  return { ...unsigned, requestDigest: await sha256Digest(canonicalizeVerificationJson(requestDigestInput(unsigned))) };
};

const summaryLabel = (data: AnalysisResult): string => {
  const origin = data.config.summaryProvenance?.origin;
  if (origin === 'human-authored') return 'Human-authored summary under review';
  if (origin === 'ai-assisted' || origin === 'mixed') return 'AI-assisted or mixed-authorship summary under review';
  if (origin === 'algorithmic-extractive' || data.config.summaryMethod === 'extractive') return 'Extractive summary under review';
  if (origin === 'generated-in-run' || data.config.summaryMethod === 'ai') return 'Model-generated summary under review';
  return 'Summary under review (origin not declared)';
};

export const generateVerificationHTML = async (data: AnalysisResult): Promise<string> => {
  const request = await createVerificationRequest(data);
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta name="referrer" content="no-referrer">
  <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; script-src 'unsafe-inline'; connect-src 'none'; img-src data:; base-uri 'none'; form-action 'none'">
  <title>Participant response — ${escHtml(data.config.datasetName)}</title>
  <style>
    *,*::before,*::after{box-sizing:border-box} body{font-family:system-ui,-apple-system,sans-serif;background:#f8fafc;color:#1e293b;line-height:1.55;margin:0;padding:24px} main{max-width:760px;margin:auto} h1{font-size:1.45rem;margin:.25rem 0} .meta{color:#64748b;font-size:.875rem}.notice,.summary,.form{border-radius:10px;padding:16px;margin-top:18px}.notice{background:#fff7ed;border:1px solid #fed7aa;color:#9a3412}.summary{background:#eff6ff;border-left:4px solid #2563eb;white-space:pre-wrap}.summary strong{display:block;text-transform:uppercase;letter-spacing:.04em;font-size:.75rem;color:#475569;margin-bottom:8px}.form{background:white;border:1px solid #e2e8f0} label,legend{font-weight:650;font-size:.9rem} input[type=text],textarea{width:100%;margin-top:6px;border:1px solid #94a3b8;border-radius:7px;padding:10px;font:inherit} textarea{min-height:100px;resize:vertical} fieldset{border:0;padding:0;margin:18px 0}.choice{display:block;border:1px solid #cbd5e1;border-radius:8px;padding:10px;margin-top:8px;cursor:pointer}.choice:has(input:checked){border-color:#2563eb;background:#eff6ff} button{border:0;border-radius:8px;background:#0f172a;color:white;font-weight:700;padding:11px 18px;cursor:pointer}button:disabled{opacity:.45;cursor:not-allowed}.status{font-size:.85rem;color:#166534;margin-top:10px}.status.error{color:#b91c1c}footer{color:#64748b;font-size:.75rem;margin-top:24px}@media(max-width:600px){body{padding:14px}}
  </style>
</head>
<body>
<main>
  <header><h1>Participant response</h1><div class="meta">Project: <strong>${escHtml(data.config.datasetName)}</strong> · Request expires ${escHtml(new Date(request.expiresAt).toLocaleDateString())}</div></header>
  <div class="notice"><strong>Manual return required.</strong> This offline file cannot send responses or verify identity. Complete one response, download the JSON, and return it through the agreed secure channel. The facilitator's app can check that the file matches this run and summary, but not who completed it.</div>
  <section class="summary" aria-labelledby="summary-label"><strong id="summary-label">${escHtml(summaryLabel(data))}</strong>${escHtml(data.summary)}</section>
  <form class="form" id="response-form">
    <label for="participant-id">Your assigned participant ID</label>
    <input id="participant-id" name="participantId" type="text" maxlength="200" autocomplete="off" required>
    <fieldset><legend>Does this summary accurately represent your contribution?</legend>
      <label class="choice"><input type="radio" name="verdict" value="yes" required> Yes — captured accurately</label>
      <label class="choice"><input type="radio" name="verdict" value="partial"> Partly — some important content is missing or changed</label>
      <label class="choice"><input type="radio" name="verdict" value="no"> No — missed or distorted my contribution</label>
    </fieldset>
    <label for="comment">Optional explanation</label>
    <textarea id="comment" name="comment" maxlength="${MAX_COMMENT_LENGTH}" placeholder="What was missing or changed? Do not include sensitive information you do not want returned to the facilitator."></textarea>
    <div style="margin-top:16px"><button id="download" type="submit">Download my response (JSON)</button></div>
    <div class="status" id="status" role="status" aria-live="polite"></div>
  </form>
  <footer>No participant roster, source contribution, audit score, or other response is embedded. SHA-256 checks detect mismatches or corruption; they are not a digital signature.</footer>
</main>
<script>
  const REQUEST = ${safeJson(request)};
  const RESPONSE_SCHEMA = ${safeJson(VERIFICATION_RESPONSE_SCHEMA)};
  const CANONICALIZATION = ${safeJson(VERIFICATION_CANONICALIZATION)};
  const canonicalize = (value, inArray = false) => {
    if (value === null) return 'null';
    if (typeof value === 'string' || typeof value === 'boolean') return JSON.stringify(value);
    if (typeof value === 'number') return Number.isFinite(value) ? JSON.stringify(value) : 'null';
    if (Array.isArray(value)) return '[' + value.map(item => canonicalize(item, true) ?? 'null').join(',') + ']';
    if (typeof value === 'object') return '{' + Object.entries(value).filter(([,item]) => item !== undefined && typeof item !== 'function' && typeof item !== 'symbol').sort(([a],[b]) => a < b ? -1 : a > b ? 1 : 0).map(([key,item]) => JSON.stringify(key) + ':' + canonicalize(item)).join(',') + '}';
    return inArray ? 'null' : undefined;
  };
  const sha256 = async value => {
    const bytes = new TextEncoder().encode(value);
    const digest = await crypto.subtle.digest('SHA-256', bytes);
    return 'sha256:' + Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2,'0')).join('');
  };
  const status = document.getElementById('status');
  const button = document.getElementById('download');
  if (!globalThis.crypto?.subtle || !globalThis.crypto?.randomUUID) {
    status.textContent = 'This browser cannot create the cryptographically bound response. Open the file in a current browser.';
    status.className = 'status error'; button.disabled = true;
  } else if (Date.now() > Date.parse(REQUEST.expiresAt)) {
    status.textContent = 'This request has expired. Ask the facilitator for a new response file.';
    status.className = 'status error'; button.disabled = true;
  }
  document.getElementById('response-form').addEventListener('submit', async function(event) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const participantId = String(form.get('participantId') || '').trim();
    const verdict = String(form.get('verdict') || '');
    if (!participantId || !['yes','partial','no'].includes(verdict) || button.disabled) return;
    button.disabled = true;
    try {
      const response = { responseId: crypto.randomUUID(), participantId, verdict, comment: String(form.get('comment') || ''), submittedAt: new Date().toISOString() };
      const output = {
        schemaVersion: RESPONSE_SCHEMA, request: REQUEST, response,
        integrity: { algorithm: 'SHA-256', canonicalization: CANONICALIZATION, payloadDigest: await sha256(canonicalize({request: REQUEST, response})), assurance: 'corruption-and-binding-check-only' }
      };
      const blob = new Blob([JSON.stringify(output, null, 2)], {type:'application/json'});
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement('a'); anchor.href = url; anchor.download = 'participant-response-' + REQUEST.requestId.slice(0,8) + '.json';
      document.body.appendChild(anchor); anchor.click(); anchor.remove(); URL.revokeObjectURL(url);
      status.textContent = 'Response downloaded. Return it to the facilitator; it has not been sent automatically.';
    } catch (error) {
      status.textContent = 'The response could not be created: ' + (error instanceof Error ? error.message : 'unknown error');
      status.className = 'status error'; button.disabled = false;
    }
  });
</script>
</body>
</html>`;
};

const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null && !Array.isArray(value);
const validIsoTime = (value: unknown): value is string => typeof value === 'string' && Number.isFinite(Date.parse(value));

export const validateParticipantResponse = async (
  value: unknown,
  context: VerificationImportContext,
): Promise<VerificationImportResult> => {
  const errors: string[] = [];
  const warnings: string[] = [];
  if (!isRecord(value) || value.schemaVersion !== VERIFICATION_RESPONSE_SCHEMA) {
    return { feedback: null, errors: ['Unsupported or missing participant-response-v3 schema.'], warnings };
  }
  const request = isRecord(value.request) ? value.request : null;
  const response = isRecord(value.response) ? value.response : null;
  const integrity = isRecord(value.integrity) ? value.integrity : null;
  if (!request || !response || !integrity) return { feedback: null, errors: ['Response package is missing request, response, or integrity data.'], warnings };

  const issuedAt = validIsoTime(request.issuedAt) ? Date.parse(request.issuedAt) : NaN;
  const expiresAt = validIsoTime(request.expiresAt) ? Date.parse(request.expiresAt) : NaN;
  const submittedAt = validIsoTime(response.submittedAt) ? Date.parse(response.submittedAt) : NaN;
  if (request.schemaVersion !== VERIFICATION_REQUEST_SCHEMA) errors.push('Verification request schema is invalid.');
  if (typeof request.requestId !== 'string' || request.requestId.length < 16 || request.requestId.length > 200) errors.push('Request ID is invalid.');
  if (!Number.isFinite(issuedAt) || !Number.isFinite(expiresAt) || expiresAt <= issuedAt) errors.push('Request validity dates are invalid.');
  if (!Number.isFinite(submittedAt)) errors.push('Submission time is invalid.');
  if (Number.isFinite(submittedAt) && Number.isFinite(issuedAt) && submittedAt < issuedAt) errors.push('Response predates the verification request.');
  if (Number.isFinite(submittedAt) && Number.isFinite(expiresAt) && submittedAt > expiresAt) errors.push('Response was completed after the request expired.');

  const expectedDatasetDigest = await sha256Digest(context.datasetName);
  const expectedSummaryDigest = await sha256Digest(context.summary);
  if (request.runId !== context.runId) errors.push('Response belongs to a different analysis run.');
  if (request.datasetDigest !== expectedDatasetDigest) errors.push('Response belongs to a different dataset label.');
  if (request.summaryDigest !== expectedSummaryDigest) errors.push('Response was issued for a different summary.');

  if (typeof request.requestDigest === 'string') {
    const requestWithoutDigest = { schemaVersion: request.schemaVersion, requestId: request.requestId, issuedAt: request.issuedAt, expiresAt: request.expiresAt, runId: request.runId, datasetDigest: request.datasetDigest, summaryDigest: request.summaryDigest };
    const expectedRequestDigest = await sha256Digest(canonicalizeVerificationJson(requestWithoutDigest));
    if (request.requestDigest !== expectedRequestDigest) errors.push('Verification request digest does not match its contents.');
  } else errors.push('Verification request digest is missing.');

  const participantId = typeof response.participantId === 'string' ? response.participantId.trim() : '';
  if (!participantId || !new Set(context.participantIds).has(participantId)) errors.push('Participant ID is not in this analysis.');
  const verdict = response.verdict;
  if (verdict !== 'yes' && verdict !== 'partial' && verdict !== 'no') errors.push('Verdict is invalid.');
  const comment = typeof response.comment === 'string' ? response.comment : '';
  if (comment.length > MAX_COMMENT_LENGTH) errors.push(`Comment exceeds ${MAX_COMMENT_LENGTH} characters.`);
  const responseId = typeof response.responseId === 'string' ? response.responseId : '';
  if (responseId.length < 16 || responseId.length > 200) errors.push('Response ID is invalid.');
  if (responseId && new Set(context.existingResponseIds ?? []).has(responseId)) errors.push('This response was already imported.');

  if (integrity.algorithm !== 'SHA-256' || integrity.canonicalization !== VERIFICATION_CANONICALIZATION) errors.push('Unsupported response integrity method.');
  else {
    const expectedPayloadDigest = await sha256Digest(canonicalizeVerificationJson({ request, response }));
    if (integrity.payloadDigest !== expectedPayloadDigest) errors.push('Response payload digest does not match its contents.');
  }

  if (errors.length > 0 || !Number.isFinite(submittedAt) || !participantId || (verdict !== 'yes' && verdict !== 'partial' && verdict !== 'no')) return { feedback: null, errors, warnings };
  const label: ParticipantFeedback['label'] = verdict === 'yes' ? 'accurate' : verdict === 'partial' ? 'partial' : 'distorted';
  return {
    feedback: { participantId, label, comment: comment || undefined, timestamp: submittedAt, responseId, requestId: String(request.requestId), bindingVerified: true },
    errors,
    warnings,
  };
};

export const downloadVerificationPage = async (data: AnalysisResult): Promise<void> => {
  const blob = new Blob([await generateVerificationHTML(data)], { type: 'text/html' });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = `participant-response-${data.config.datasetName.replace(/\s+/g, '-').toLowerCase()}-${new Date().toISOString().split('T')[0]}.html`;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
};
