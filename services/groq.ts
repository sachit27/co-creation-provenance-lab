/**
 * Groq Cloud Service
 *
 * Groq provides a free tier (no credit card required) with access to
 * open-source models at very high speed. Free limits: ~14,400 requests/day.
 *
 * Get a free API key at: https://console.groq.com
 *
 * Uses the OpenAI-compatible chat completions API.
 * NOTE: Groq does not provide an embeddings endpoint, so the tool falls back
 * to its standard embedding chain (BGE-M3 → TF-IDF) for Groq sessions.
 */

const GROQ_API_URL = 'https://api.groq.com/openai/v1';
const GROQ_KEY_STORAGE = 'cprov_groq_key';

// Build-time key from env (local dev via vite.config.ts — never present in production)
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

// ── Free models available on Groq ────────────────────────────────────────────

/**
 * Static fallback — used when the API call fails or key is missing.
 */
export const GROQ_FREE_MODELS = [
  'llama-3.3-70b-versatile',
  'llama-3.1-8b-instant',
  'llama3-70b-8192',
  'llama3-8b-8192',
  'gemma2-9b-it',
  'mixtral-8x7b-32768',
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
      !id.includes('tts')
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

export const generateGroqCompletion = async (
  prompt: string,
  systemInstruction: string,
  model: string
): Promise<string> => {
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
      temperature: 0.5,
      max_tokens: 4096,
    }),
  });

  if (!response.ok) {
    const err = await response.text();
    if (response.status === 429 || err.toLowerCase().includes('rate limit') || err.toLowerCase().includes('quota')) {
      throw new Error('[QUOTA] Groq rate limit reached. Wait a minute and try again, or switch to Gemini.');
    }
    throw new Error(`Groq API error (${response.status}): ${err}`);
  }

  const data = await response.json();
  return data.choices?.[0]?.message?.content || '';
};
