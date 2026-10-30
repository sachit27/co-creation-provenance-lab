import type { IncomingMessage, ServerResponse } from 'node:http';
import { changeStatus, configureSurvey, createSession, exportSession, getSession, joinSession, LiveError, publicView, publish, saveReviewDecisions, submit, submitFeedback } from './sessionStore';
import { liveHealth } from './network';

const send = (res: ServerResponse, status: number, body: unknown) => {
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
    'X-Content-Type-Options': 'nosniff',
    'Referrer-Policy': 'no-referrer',
  });
  res.end(JSON.stringify(body));
};

const sendDownload = (res: ServerResponse, code: string, body: unknown) => {
  const date = new Date().toISOString().slice(0, 10);
  res.writeHead(200, {
    'Content-Type': 'application/json; charset=utf-8',
    'Content-Disposition': `attachment; filename="live-session-${code}-${date}.json"`,
    'Cache-Control': 'no-store',
    'X-Content-Type-Options': 'nosniff',
    'Referrer-Policy': 'no-referrer',
  });
  res.end(JSON.stringify(body, null, 2));
};

async function readBody(req: IncomingMessage): Promise<any> {
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const part of req) {
    const chunk = Buffer.from(part);
    size += chunk.length;
    if (size > 5_000_000) throw new LiveError('Request is too large.', 413);
    chunks.push(chunk);
  }
  try {
    const body = JSON.parse(Buffer.concat(chunks).toString('utf8'));
    if (!body || typeof body !== 'object' || Array.isArray(body)) throw new Error('Invalid body');
    return body;
  }
  catch { throw new LiveError('Invalid JSON request.', 400); }
}

const bearer = (req: IncomingMessage) => {
  const value = req.headers.authorization;
  return value?.startsWith('Bearer ') ? value.slice(7) : undefined;
};
const participant = (req: IncomingMessage) => {
  const value = req.headers['x-participant-token'];
  return typeof value === 'string' ? value : undefined;
};

export async function handleLiveApi(req: IncomingMessage, res: ServerResponse, listenAddress?: string | { address: string } | null): Promise<boolean> {
  let route: string;
  try { route = new URL(req.url || '/', 'http://localhost').pathname; }
  catch { send(res, 400, { error: 'Invalid request URL.' }); return true; }
  if (!route.startsWith('/api/live/')) return false;
  try {
    if (route === '/api/live/health' && req.method === 'GET') {
      send(res, 200, liveHealth(req.socket.localPort, typeof listenAddress === 'object' ? listenAddress?.address : listenAddress)); return true;
    }
    if (route === '/api/live/sessions' && req.method === 'POST') {
      const body = await readBody(req);
      const { session, hostToken } = createSession(String(body.title || ''), String(body.prompt || ''));
      send(res, 201, { ...publicView(session), hostToken }); return true;
    }
    const match = /^\/api\/live\/sessions\/([A-Z2-9]{10})(?:\/(join|submission|status|publish|review|feedback|survey|export))?$/.exec(route);
    if (!match) throw new LiveError('Endpoint not found.', 404);
    const session = getSession(match[1]);
    const action = match[2];
    if (!action && req.method === 'GET') {
      send(res, 200, publicView(session, participant(req), bearer(req))); return true;
    }
    if (action === 'join' && req.method === 'POST') {
      const joined = joinSession(session);
      send(res, 201, joined); return true;
    }
    if (action === 'submission' && req.method === 'PUT') {
      const body = await readBody(req);
      const own = submit(session, participant(req), String(body.text || ''));
      send(res, 200, { id: own.id, submittedAt: own.submittedAt }); return true;
    }
    if (action === 'status' && req.method === 'POST') {
      const body = await readBody(req);
      if (body.status !== 'open' && body.status !== 'closed') throw new LiveError('Invalid session status.', 400);
      changeStatus(session, bearer(req), body.status);
      send(res, 200, publicView(session, undefined, bearer(req))); return true;
    }
    if (action === 'publish' && req.method === 'POST') {
      const body = await readBody(req);
      publish(session, bearer(req), body);
      send(res, 200, publicView(session, undefined, bearer(req))); return true;
    }
    if (action === 'feedback' && req.method === 'PUT') {
      const body = await readBody(req);
      const saved = submitFeedback(session, participant(req), body);
      send(res, 200, { feedback: saved }); return true;
    }
    if (action === 'review' && req.method === 'PUT') {
      const body = await readBody(req);
      saveReviewDecisions(session, bearer(req), body);
      send(res, 200, publicView(session, undefined, bearer(req))); return true;
    }
    if (action === 'survey' && req.method === 'PUT') {
      const body = await readBody(req);
      configureSurvey(session, bearer(req), body);
      send(res, 200, publicView(session, undefined, bearer(req))); return true;
    }
    if (action === 'export' && req.method === 'GET') {
      sendDownload(res, session.code, exportSession(session, bearer(req))); return true;
    }
    throw new LiveError('Endpoint not found.', 404);
  } catch (error) {
    const status = error instanceof LiveError ? error.status : 500;
    if (status === 500) console.error('[live]', error);
    send(res, status, { error: error instanceof LiveError ? error.message : 'Server error.' });
    return true;
  }
}
