/**
 * Vercel Serverless Function: Gemini Health Check
 *
 * Returns whether the Gemini API key is configured server-side.
 */

import type { VercelRequest, VercelResponse } from '@vercel/node';

export default function handler(req: VercelRequest, res: VercelResponse) {
  const apiKey = process.env.GEMINI_API_KEY;

  res.setHeader('Access-Control-Allow-Origin', req.headers.origin || '*');
  res.setHeader('Content-Type', 'application/json');

  res.status(200).json({
    available: !!apiKey && apiKey !== 'PLACEHOLDER_API_KEY',
    provider: 'gemini-proxy',
  });
}
