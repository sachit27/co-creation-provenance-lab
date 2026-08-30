import type { VercelRequest, VercelResponse } from './_types';

/**
 * Apply the minimum browser-facing controls shared by the Gemini proxy routes.
 *
 * CORS is not authentication: a non-browser client can forge Origin. Deployments
 * that fund a shared Gemini key still need platform-level authentication and rate
 * limiting. This guard prevents another website from silently spending that key
 * through a visitor's browser and rejects unexpectedly large request bodies.
 */
export const guardBrowserRequest = (
  req: VercelRequest,
  res: VercelResponse,
  methods: string[],
): boolean => {
  res.setHeader('Vary', 'Origin');
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('X-Content-Type-Options', 'nosniff');

  const origin = typeof req.headers.origin === 'string' ? req.headers.origin : '';
  const forwardedHost = req.headers['x-forwarded-host'];
  const host = (Array.isArray(forwardedHost) ? forwardedHost[0] : forwardedHost)
    || req.headers.host
    || '';
  const configuredOrigin = process.env.GEMINI_PROXY_ORIGIN?.replace(/\/$/, '') || '';

  let allowedOrigin = '';
  if (origin) {
    try {
      const parsed = new URL(origin);
      const sameHost = parsed.host === host;
      const explicitlyAllowed = configuredOrigin && origin.replace(/\/$/, '') === configuredOrigin;
      if (!sameHost && !explicitlyAllowed) {
        res.status(403).json({ error: 'Origin not allowed' });
        return false;
      }
      allowedOrigin = origin;
    } catch {
      res.status(400).json({ error: 'Invalid Origin header' });
      return false;
    }
  }

  if (allowedOrigin) res.setHeader('Access-Control-Allow-Origin', allowedOrigin);
  res.setHeader('Access-Control-Allow-Methods', [...methods, 'OPTIONS'].join(', '));
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') {
    res.status(204).end();
    return false;
  }
  if (!req.method || !methods.includes(req.method)) {
    res.setHeader('Allow', methods.join(', '));
    res.status(405).json({ error: 'Method not allowed' });
    return false;
  }
  return true;
};

export const isSafeGeminiModelId = (value: unknown): value is string =>
  typeof value === 'string'
  && value.length > 0
  && value.length <= 120
  && /^[A-Za-z0-9._:-]+$/.test(value);

/**
 * Shared-key Gemini proxying is disabled by default. CORS cannot protect a
 * funded server key from direct clients, so an operator must explicitly opt in
 * and place authenticated quota enforcement in front of these functions.
 */
export const guardSharedGeminiProxy = (res: VercelResponse): boolean => {
  if (process.env.GEMINI_PROXY_ENABLED !== 'true') {
    res.status(503).json({
      error: 'Shared Gemini proxy is disabled. Use a user-supplied key or an authenticated organization gateway.',
    });
    return false;
  }
  return true;
};
