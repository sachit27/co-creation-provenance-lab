import { createServer } from 'node:http';
import { readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import { createServer as createViteServer } from 'vite';
import { handleLiveApi } from '../live/http';

const port = Number(process.env.PORT || 5173);
const host = process.env.HOST || '127.0.0.1';
const dev = process.env.LIVE_DEV === '1';
const vite = dev ? await createViteServer({ server: { middlewareMode: true }, appType: 'spa' }) : null;
const root = path.resolve('dist');
const mime: Record<string, string> = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8', '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml', '.png': 'image/png', '.ico': 'image/x-icon',
};

const liveServer = createServer(async (req, res) => {
  if (await handleLiveApi(req, res, liveServer.address())) return;
  if (vite) { vite.middlewares(req, res); return; }
  let pathname: string;
  try { pathname = decodeURIComponent(new URL(req.url || '/', 'http://localhost').pathname); }
  catch { res.writeHead(400); res.end('Invalid request path.'); return; }
  const requested = path.resolve(root, `.${pathname}`);
  const safe = requested === root || requested.startsWith(`${root}${path.sep}`);
  if (!safe) { res.writeHead(403); res.end(); return; }
  let file = requested;
  try { if (!statSync(file).isFile()) file = path.join(root, 'index.html'); }
  catch { file = path.join(root, 'index.html'); }
  try {
    res.writeHead(200, { 'Content-Type': mime[path.extname(file)] || 'application/octet-stream', 'X-Content-Type-Options': 'nosniff', 'Referrer-Policy': 'no-referrer', 'Cache-Control': path.extname(file) === '.html' ? 'no-cache' : 'public, max-age=0, must-revalidate' });
    res.end(readFileSync(file));
  } catch { res.writeHead(404); res.end('Build the app with npm run build first.'); }
}).listen(port, host, () => console.log(`Live Provenance Lab listening on http://${host}:${port}`));
