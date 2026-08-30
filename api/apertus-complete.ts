import type { VercelRequest, VercelResponse } from './_types';
import { guardBrowserRequest } from './_security';

const safeModelId = (value: unknown): value is string =>
  typeof value === 'string'
  && value.length > 0
  && value.length <= 180
  && /^[A-Za-z0-9._:/-]+$/.test(value);

export const config = { maxDuration: 120 };

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (!guardBrowserRequest(req, res, ['POST'])) return;
  const authorization = req.headers.authorization;
  if (!authorization?.startsWith('Bearer ') || authorization.length > 500) {
    return res.status(401).json({ error: 'A PublicAI bearer key is required' });
  }
  const { model, messages, temperature = 0.2, top_p = 0.9, max_tokens = 4096 } = req.body ?? {};
  if (!safeModelId(model)) return res.status(400).json({ error: 'Invalid PublicAI model identifier' });
  if (!Array.isArray(messages) || messages.length < 1 || messages.length > 20) {
    return res.status(400).json({ error: 'messages must contain 1–20 chat messages' });
  }
  let totalCharacters = 0;
  for (const message of messages) {
    if (!message || !['system', 'user', 'assistant'].includes(message.role) || typeof message.content !== 'string') {
      return res.status(400).json({ error: 'Invalid chat message' });
    }
    totalCharacters += message.content.length;
  }
  if (totalCharacters > 230_000) return res.status(413).json({ error: 'Chat payload is too large' });

  try {
    const upstream = await fetch('https://api.publicai.co/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: authorization,
        'User-Agent': 'co-creation-provenance-tool/1.0',
      },
      body: JSON.stringify({ model, messages, temperature, top_p, max_tokens }),
      signal: AbortSignal.timeout(110_000),
    });
    const body = await upstream.text();
    res.status(upstream.status);
    res.setHeader('Content-Type', upstream.headers.get('content-type') || 'application/json');
    return res.send(body);
  } catch (error) {
    return res.status(502).json({ error: 'PublicAI completion failed', details: String(error) });
  }
}
