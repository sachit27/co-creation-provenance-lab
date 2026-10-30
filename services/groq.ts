/**
 * Groq Cloud Service
 *
 * Groq exposes hosted completion models through an OpenAI-compatible API.
 * Available models, quotas, retention, and pricing depend on the account.
 *
 * Get a free API key at: https://console.groq.com
 *
 * Uses the OpenAI-compatible chat completions API.
 * NOTE: Groq does not provide an embeddings endpoint, so the tool falls back
 * to its standard embedding chain (BGE-M3 → TF-IDF) for Groq sessions.
 */

import type { CompletionResult } from '../types';
import { sanitizeProviderErrorText } from './providerErrors';

const GROQ_API_URL = 'https://api.groq.com/openai/v1';
const GROQ_KEY_STORAGE = 'cprov_groq_key';

// Browser builds replace this with an empty string; Node scripts may use their own environment.
const buildTimeKey = process.env.GROQ_API_KEY || '';

// ── API key management (sessionStorage — cleared when tab is closed) ──────────

export const setGroqApiKey = (key: string): void => {
  if (key.trim()) {
    sessionStorage.setItem(GROQ_KEY_STORAGE, key.trim());
  } else {
    sessionStorage.removeItem(GROQ_KEY_STORAGE);
  }
};

/** Returns browser-entered key first, then falls back to build-time env key. */
export const getGroqApiKey = (): string =>
  sessionStorage.getItem(GROQ_KEY_STORAGE) || buildTimeKey;

/** True when the active key is from the environment (not browser-entered). */
export const isGroqKeyFromEnv = (): boolean =>
  !sessionStorage.getItem(GROQ_KEY_STORAGE) && !!buildTimeKey;

export const checkGroqConnection = (): boolean => !!getGroqApiKey();

export const verifyGroqConnection = async (): Promise<boolean> => {
  const key = getGroqApiKey();
  if (!key) return false;
  try {
    const response = await fetch(`${GROQ_API_URL}/models`, {
      headers: { Authorization: `Bearer ${key}` },
    });
    return response.ok;
  } catch {
    return false;
  }
};

// ── Free models available on Groq ────────────────────────────────────────────

/**
 * Static fallback — used when the API call fails or key is missing.
 */
export const GROQ_FREE_MODELS = [
  'openai/gpt-oss-20b',
  'openai/gpt-oss-120b',
];

/**
 * Fetches the live model list from Groq's OpenAI-compatible /models endpoint.
 * Filters to chat-capable models only (excludes whisper, embed, guard models).
 * Falls back to the static list on any error.
 */
export const fetchGroqModels = async (): Promise<string[]> => {
  const key = getGroqApiKey();
  if (!key) return GROQ_FREE_MODELS;

  try {
    const response = await fetch(`${GROQ_API_URL}/models`, {
      headers: { Authorization: `Bearer ${key}` },
    });
    if (!response.ok) return GROQ_FREE_MODELS;

    const data = await response.json();
    const allModels: string[] = (data.data || []).map((m: any) => m.id as string);

    // Filter out non-chat models (whisper transcription, guard, vision-only, etc.)
    const chatModels = allModels.filter(id =>
      !id.includes('whisper') &&
      !id.includes('guard') &&
      !id.includes('embed') &&
      !id.includes('tts') &&
      !id.includes('orpheus')
    );

    if (chatModels.length === 0) return GROQ_FREE_MODELS;

    // Sort: largest (most capable) first — Groq names include param count (70b > 8b)
    return chatModels.sort((a, b) => {
      const getSize = (s: string) => {
        const m = s.match(/(\d+)b/i);
        return m ? parseInt(m[1]) : 0;
      };
      return getSize(b) - getSize(a) || a.localeCompare(b);
    });
  } catch {
    return GROQ_FREE_MODELS;
  }
};

// ── Chat completion ───────────────────────────────────────────────────────────

export const generateGroqCompletionResult = async (
  prompt: string,
  systemInstruction: string,
  model: string,
  temperature: number = 0.5,
  signal?: AbortSignal,
): Promise<CompletionResult> => {
  const key = getGroqApiKey();
  if (!key) throw new Error('Groq API key not set. Enter your key in the configuration panel.');

  const response = await fetch(`${GROQ_API_URL}/chat/completions`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${key}`,
    },
    body: JSON.stringify({
      model,
      messages: [
        { role: 'system', content: systemInstruction },
        { role: 'user', content: prompt },
      ],
      temperature,
      max_tokens: 4096,
    }),
    signal: signal ?? AbortSignal.timeout(120_000),
  });

  if (!response.ok) {
    const err = await response.text();
    if (response.status === 429 || err.toLowerCase().includes('rate limit') || err.toLowerCase().includes('quota')) {
      throw new Error('[QUOTA] Groq rate limit reached. Wait a minute and try again, or switch to Gemini.');
    }
    throw new Error(`Groq API error (${response.status}). Check the selected model, API key, and account access.`);
  }

  const data = await response.json();
  const choice = data.choices?.[0];
  if (choice?.message?.refusal || choice?.finish_reason === 'content_filter') {
    const refusal = choice?.message?.refusal ? sanitizeProviderErrorText(choice.message.refusal, key) : 'content_filter';
    const error = new Error(`[REFUSAL] Groq declined the completion${choice?.message?.refusal ? `: ${sanitizeProviderErrorText(choice.message.refusal, key)}` : '.'}`) as Error & { completionMetadata?: CompletionResult['metadata'] };
    error.completionMetadata = {
      provider: 'groq', requestedModel: model, returnedModel: data.model,
      responseId: data.id, requestId: response.headers.get('x-request-id') || undefined,
      createdAt: typeof data.created === 'number' ? new Date(data.created * 1000).toISOString() : new Date().toISOString(),
      finishReason: choice?.finish_reason, refusal,
      effectiveParameters: { temperature, maxOutputTokens: 4096 },
    };
    throw error;
  }
  const content = choice?.message?.content;
  if (typeof content !== 'string' || content.length === 0) {
    throw new Error(`Groq returned no text (finish reason: ${choice?.finish_reason ?? 'unknown'}).`);
  }
  return {
    text: content,
    metadata: {
      provider: 'groq',
      requestedModel: model,
      returnedModel: typeof data.model === 'string' ? data.model : undefined,
      responseId: typeof data.id === 'string' ? data.id : undefined,
      requestId: response.headers.get('x-request-id') || undefined,
      createdAt: typeof data.created === 'number' ? new Date(data.created * 1000).toISOString() : new Date().toISOString(),
      finishReason: typeof choice?.finish_reason === 'string' ? choice.finish_reason : undefined,
      usage: data.usage ? {
        inputTokens: data.usage.prompt_tokens,
        outputTokens: data.usage.completion_tokens,
        totalTokens: data.usage.total_tokens,
      } : undefined,
      effectiveParameters: { temperature, maxOutputTokens: 4096 },
    },
  };
};

export const generateGroqCompletion = async (...args: Parameters<typeof generateGroqCompletionResult>): Promise<string> =>
  (await generateGroqCompletionResult(...args)).text;
