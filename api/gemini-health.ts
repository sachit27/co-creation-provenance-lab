/**
 * Vercel Serverless Function: Gemini Health Check
 *
 * Returns whether the Gemini API key is configured server-side.
 */

import type { VercelRequest, VercelResponse } from './_types';
import { guardBrowserRequest } from './_security';

export default function handler(req: VercelRequest, res: VercelResponse) {
  if (!guardBrowserRequest(req, res, ['GET'])) return;
  const apiKey = process.env.GEMINI_API_KEY;
  const explicitlyEnabled = process.env.GEMINI_PROXY_ENABLED === 'true';

  res.setHeader('Content-Type', 'application/json');

  res.status(200).json({
    available: explicitlyEnabled && !!apiKey && apiKey !== 'PLACEHOLDER_API_KEY',
    provider: 'gemini-proxy',
    sharedKeyMode: explicitlyEnabled ? 'operator-enabled; requires upstream authentication and quotas' : 'disabled-by-default',
  });
}
