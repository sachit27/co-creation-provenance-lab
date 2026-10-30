// Disposable HTTP load check. Run against a live server with an isolated LIVE_DATA_DIR.
const origin = process.env.STRESS_ORIGIN || 'http://127.0.0.1:5198';
const request = async (path, method = 'GET', body, headers = {}) => {
  const started = performance.now();
  const response = await fetch(origin + path, {
    method, headers: { ...(body ? { 'Content-Type': 'application/json' } : {}), ...headers },
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await response.json();
  return { status: response.status, data, ms: performance.now() - started };
};
const requireOk = (result, label) => {
  if (result.status < 200 || result.status >= 300) throw Error(`${label}: ${result.status} ${JSON.stringify(result.data)}`);
  return result.data;
};
const created = requireOk(await request('/api/live/sessions', 'POST', { title: 'Disposable stress test', prompt: 'What should the summary represent?' }), 'create');
const path = `/api/live/sessions/${created.code}`;
const host = { Authorization: `Bearer ${created.hostToken}` };
const codes = [];
const joined = await Promise.all(Array.from({ length: 200 }, () => request(`${path}/join`, 'POST')));
joined.forEach((result, index) => codes.push(requireOk(result, `join ${index}`).participantToken));
requireOk(await request(`${path}/status`, 'POST', { status: 'open' }, host), 'open');
const submissions = await Promise.all(codes.map((token, index) => request(`${path}/submission`, 'PUT', { text: `Contribution ${index + 1}: I ${index % 2 ? 'oppose' : 'support'} this proposal for different reasons.` }, { 'X-Participant-Token': token })));
submissions.forEach((result, index) => requireOk(result, `submit ${index}`));
const views = await Promise.all(codes.map(token => request(path, 'GET', undefined, { 'X-Participant-Token': token })));
views.forEach((result, index) => {
  const view = requireOk(result, `view ${index}`);
  if (view.count !== 200 || view.own?.id !== `P${String(index + 1).padStart(3, '0')}` || view.submissions) throw Error(`participant privacy ${index}`);
});
const publicView = requireOk(await request(path), 'public view');
if (publicView.submissions || publicView.own) throw Error('public privacy');
const closed = requireOk(await request(`${path}/status`, 'POST', { status: 'closed' }, host), 'close');
const scores = Object.fromEntries(Array.from({ length: 200 }, (_, index) => [`P${String(index + 1).padStart(3, '0')}`, .4 + index / 1000]));
const matches = Object.fromEntries(Object.keys(scores).map(id => [id, 'Both support and opposition were expressed.']));
const stale = await request(`${path}/publish`, 'POST', { summary: 'Both support and opposition were expressed.', method: 'manual', averageAlignment: .5, gini: .05, validCount: 200, scores, matches, sourceRevision: closed.revision - 1 }, host);
if (stale.status !== 409) throw Error('stale revision accepted');
const first = requireOk(await request(`${path}/publish`, 'POST', { summary: 'Both support and opposition were expressed.', method: 'manual', averageAlignment: .5, gini: .05, validCount: 200, scores, matches, sourceRevision: closed.revision }, host), 'publish');
if (first.result?.versionId !== 'summary-v1') throw Error('publication version');
const denied = await request(`${path}/export`);
if (denied.status !== 403) throw Error('public export accessible');
const survey = requireOk(await request(`${path}/survey`, 'PUT', { enabled: true }, host), 'open survey');
const feedback = await Promise.all(codes.map((token, index) => request(`${path}/feedback`, 'PUT', { responses: { coverage: index % 5 + 1 }, auditExposureBeforeResponse: 'summary_only' }, { 'X-Participant-Token': token })));
feedback.forEach((result, index) => requireOk(result, `feedback ${index}`));
const hostView = requireOk(await request(path, 'GET', undefined, host), 'host view');
if (hostView.feedbackCount !== 200 || hostView.feedbackSummary.coverage.validN !== 200) throw Error('feedback count');
const revision = requireOk(await request(`${path}/publish`, 'POST', { summary: 'Both support and opposition were expressed. Some participants raised distinct concerns.', method: 'manual', averageAlignment: .5, gini: .05, validCount: 200, scores, matches: Object.fromEntries(Object.keys(scores).map(id => [id, 'Both support and opposition were expressed.'])), sourceRevision: hostView.revision, revisionNote: 'Preserved distinct concerns.' }, host), 'revision');
if (revision.result?.versionId !== 'summary-v2') throw Error('revision version');
const exported = requireOk(await request(`${path}/export`, 'GET', undefined, host), 'export');
if (exported.participants?.length !== 200 || exported.publications?.length !== 2 || exported.participantFeedback?.length !== 200) throw Error('export completeness');
if (JSON.stringify(exported).includes(created.hostToken) || codes.some(token => JSON.stringify(exported).includes(token))) throw Error('export token leak');
const latencies = [...joined, ...submissions, ...views, ...feedback].map(item => item.ms).sort((a,b) => a-b);
console.log(JSON.stringify({ code: created.code, concurrentParticipants: 200, requests: latencies.length, medianMs: Math.round(latencies[Math.floor(latencies.length/2)]), p95Ms: Math.round(latencies[Math.floor(latencies.length*.95)]), maxMs: Math.round(latencies.at(-1)), revisions: 2, feedback: 200, passed: true }));
