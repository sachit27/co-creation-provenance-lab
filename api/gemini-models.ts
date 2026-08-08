/**
 * Vercel Serverless Function: Gemini Models List
 *
 * Fetches available models from the Gemini API and categorises them
 * into generation (generateContent) and embedding (embedContent) lists.
 */

import type { VercelRequest, VercelResponse } from '@vercel/node';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  // CORS
  res.setHeader('Access-Control-Allow-Origin', req.headers.origin || '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(204).end();
  }

  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    return res.status(500).json({ error: 'API key not configured' });
  }

  try {
    const url = `https://generativelanguage.googleapis.com/v1beta/models?key=${apiKey}`;
    const response = await fetch(url);

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
