/**
 * Vercel Serverless Function: Gemini Embedding Proxy
 *
 * Keeps the API key server-side so it's never exposed to the browser.
 */

import type { VercelRequest, VercelResponse } from '@vercel/node';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  // CORS
  res.setHeader('Access-Control-Allow-Origin', req.headers.origin || '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(204).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    return res.status(500).json({ error: 'API key not configured' });
  }

  try {
    const { text, model = 'text-embedding-004' } = req.body;

    if (!text) {
      return res.status(400).json({ error: 'Missing text parameter' });
    }

    const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:embedContent?key=${apiKey}`;

    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        content: { parts: [{ text }] },
      }),
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
