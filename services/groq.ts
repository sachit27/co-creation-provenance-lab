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

export const GROQ_FREE_MODELS = [
  'llama-3.3-70b-versatile',   // Best quality, 32K context
  'llama-3.1-8b-instant',      // Fastest, 131K context
  'gemma2-9b-it',              // Google Gemma 9B
  'mixtral-8x7b-32768',        // Mixtral, 32K context
];

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
      max_tokens: 1024,
    }),
  });

  if (!response.ok) {
    const err = await response.text();
    throw new Error(`Groq API error (${response.status}): ${err}`);
  }

  const data = await response.json();
  return data.choices?.[0]?.message?.content || '';
};
