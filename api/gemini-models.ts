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
    const url = `https://generativelanguage.googleapis.com/v1beta/models?key=${apiKey}`;
    const response = await fetch(url, { signal: AbortSignal.timeout(15_000) });

    if (!response.ok) {
      const err = await response.text();
      return res.status(response.status).json({
        error: `Gemini API error: ${response.status}`,
        details: err,
      });
    }

    const data = await response.json();
    const models: any[] = data.models || [];

    const generation: string[] = [];
    const embedding: string[] = [];

    for (const m of models) {
      const methods: string[] = m.supportedGenerationMethods || [];
      const id: string = m.name?.replace('models/', '') || '';
      if (!id) continue;

      if (methods.includes('generateContent')) {
        generation.push(id);
      }
      if (methods.includes('embedContent')) {
        embedding.push(id);
      }
    }

    return res.status(200).json({ generation, embedding });
  } catch (error: any) {
    return res.status(500).json({ error: error.message });
  }
}
