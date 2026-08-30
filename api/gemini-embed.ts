/**
 * Vercel Serverless Function: Gemini Embedding Proxy
 *
 * Keeps the API key server-side so it's never exposed to the browser.
 */

import type { VercelRequest, VercelResponse } from './_types';
import { guardBrowserRequest, guardSharedGeminiProxy, isSafeGeminiModelId } from './_security';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (!guardBrowserRequest(req, res, ['POST'])) return;
  if (!guardSharedGeminiProxy(res)) return;

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    return res.status(500).json({ error: 'API key not configured' });
  }

  try {
    const { text, model = 'gemini-embedding-001' } = req.body ?? {};

    if (typeof text !== 'string' || text.length === 0 || text.length > 100_000) {
      return res.status(400).json({ error: 'text must be a non-empty string of at most 100,000 characters' });
    }
    if (!isSafeGeminiModelId(model)) {
      return res.status(400).json({ error: 'Invalid Gemini model identifier' });
    }

    const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:embedContent?key=${apiKey}`;

    const preparedText = model === 'gemini-embedding-2'
      ? `task: sentence similarity | query: ${text}`
      : text;
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        content: { parts: [{ text: preparedText }] },
        outputDimensionality: 768,
        ...(model === 'gemini-embedding-001' ? { taskType: 'SEMANTIC_SIMILARITY' } : {}),
      }),
      signal: AbortSignal.timeout(55_000),
    });

    if (!response.ok) {
      const err = await response.text();
      return res.status(response.status).json({
        error: `Gemini API error: ${response.status}`,
        details: err,
      });
    }

    const data = await response.json();
    const values = data?.embedding?.values || [];

    return res.status(200).json({ values });
  } catch (error: any) {
    return res.status(500).json({ error: error.message });
  }
}
