import type { VercelRequest, VercelResponse } from './_types';
import { guardBrowserRequest } from './_security';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (!guardBrowserRequest(req, res, ['GET'])) return;
  const authorization = req.headers.authorization;
  if (!authorization?.startsWith('Bearer ') || authorization.length > 500) {
    return res.status(401).json({ error: 'A PublicAI bearer key is required' });
  }
  try {
    const upstream = await fetch('https://api.publicai.co/v1/models', {
      headers: {
        Authorization: authorization,
        'User-Agent': 'co-creation-provenance-tool/1.0',
      },
      signal: AbortSignal.timeout(15_000),
    });
    const body = await upstream.text();
    res.status(upstream.status);
    res.setHeader('Content-Type', upstream.headers.get('content-type') || 'application/json');
    return res.send(body);
  } catch (error) {
    return res.status(502).json({ error: 'PublicAI model discovery failed', details: String(error) });
  }
}
