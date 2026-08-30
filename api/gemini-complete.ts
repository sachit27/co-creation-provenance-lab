/**
 * Vercel Serverless Function: Gemini Completion Proxy
 *
 * Keeps the API key server-side so it's never exposed to the browser.
 */

import type { VercelRequest, VercelResponse } from './_types';
import { guardBrowserRequest, guardSharedGeminiProxy, isSafeGeminiModelId } from './_security';

export const config = { maxDuration: 60 };

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (!guardBrowserRequest(req, res, ['POST'])) return;
  if (!guardSharedGeminiProxy(res)) return;

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    return res.status(500).json({ error: 'API key not configured' });
  }

  try {
    const { prompt, systemInstruction, model = 'gemini-3.7-flash', temperature: requestedTemperature = 0.5 } = req.body ?? {};
    const temperature = typeof requestedTemperature === 'number' &&
      Number.isFinite(requestedTemperature) && requestedTemperature >= 0 && requestedTemperature <= 2
      ? requestedTemperature
      : 0.5;

    if (typeof prompt !== 'string' || prompt.length === 0 || prompt.length > 200_000) {
      return res.status(400).json({ error: 'prompt must be a non-empty string of at most 200,000 characters' });
    }
    if (systemInstruction !== undefined && (typeof systemInstruction !== 'string' || systemInstruction.length > 30_000)) {
      return res.status(400).json({ error: 'systemInstruction must be a string of at most 30,000 characters' });
    }
    if (!isSafeGeminiModelId(model)) {
      return res.status(400).json({ error: 'Invalid Gemini model identifier' });
    }

    const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent?key=${apiKey}`;

    const supportsTemperature = !/^gemini-3\.7(?:-|$)/.test(model);
    const body: any = {
      contents: [{ role: 'user', parts: [{ text: prompt }] }],
      generationConfig: { ...(supportsTemperature ? { temperature } : {}), maxOutputTokens: 8192 },
    };

    if (systemInstruction) {
      body.systemInstruction = { parts: [{ text: systemInstruction }] };
    }

    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
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
    const text = data?.candidates?.[0]?.content?.parts?.[0]?.text || '';
    const finishReason = data?.candidates?.[0]?.finishReason;

    if (!text) {
      return res.status(422).json({ error: 'Gemini returned no text', finishReason: finishReason ?? 'unknown' });
    }

    return res.status(200).json({
      text,
      finishReason,
      modelVersion: data?.modelVersion,
      responseId: data?.responseId,
      usageMetadata: data?.usageMetadata,
    });
  } catch (error: any) {
    return res.status(500).json({ error: error.message });
  }
}
