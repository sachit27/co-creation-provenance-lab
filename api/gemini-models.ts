/**
 * Vercel Serverless Function: Gemini Models List
 *
 * Fetches available models from the Gemini API and categorises them
 * into generation (generateContent) and embedding (embedContent) lists.
 */

import type { VercelRequest, VercelResponse } from './_types';
import { guardBrowserRequest, guardSharedGeminiProxy } from './_security';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (!guardBrowserRequest(req, res, ['GET'])) return;
  if (!guardSharedGeminiProxy(res)) return;

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    return res.status(500).json({ error: 'API key not configured' });
  }

  try {
    const generation: string[] = [];
    const embedding: string[] = [];
    const seenPages = new Set<string>();
    let pageToken = '';

    do {
      const url = new URL('https://generativelanguage.googleapis.com/v1beta/models');
      url.searchParams.set('key', apiKey);
      url.searchParams.set('pageSize', '1000');
      if (pageToken) url.searchParams.set('pageToken', pageToken);
      const response = await fetch(url.toString(), { signal: AbortSignal.timeout(15_000) });

      if (!response.ok) {
        return res.status(response.status).json({
          error: `Gemini API error: ${response.status}`,
        });
      }

      const data = await response.json();
      const models: any[] = Array.isArray(data.models) ? data.models : [];

      for (const m of models) {
        const methods: string[] = m.supportedGenerationMethods || [];
        const id: string = m.name?.replace('models/', '') || '';
        if (!id) continue;

        if (methods.includes('generateContent')) generation.push(id);
        if (methods.includes('embedContent')) embedding.push(id);
      }

      pageToken = typeof data.nextPageToken === 'string' ? data.nextPageToken : '';
      if (pageToken && seenPages.has(pageToken)) throw new Error('Repeated model catalog page');
      seenPages.add(pageToken);
    } while (pageToken);

    return res.status(200).json({ generation: [...new Set(generation)], embedding: [...new Set(embedding)] });
  } catch {
    // Upstream exceptions can contain the request URL, including its API key.
    return res.status(500).json({ error: 'Gemini request failed. Please retry or check the server configuration.' });
  }
}
