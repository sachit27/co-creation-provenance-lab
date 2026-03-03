/**
 * Apertus Service — Swiss National AI (ETH Zurich / EPFL / CSCS)
 *
 * Apertus is Switzerland's first open-source, multilingual LLM, trained on
 * 15 trillion tokens across 1,800+ languages including underrepresented
 * languages like Swiss German and Romansh. Released under Apache 2.0.
 *
 * Accessed via PublicAI's OpenAI-compatible API:
 *   https://api.publicai.co/v1/chat/completions
 *
 * Available models:
 *   - swiss-ai/apertus-8b-instruct   (efficient, individual use)
 *   - swiss-ai/apertus-70b-instruct  (highest quality, research/commercial)
 *
 * Note: Apertus does not provide a dedicated embedding endpoint.
 * The tool will fall back to BGE-M3 → TF-IDF for embeddings.
 *
 * Get a free API key at: https://publicai.co
 *
 * References:
 * - Swiss National AI Initiative: https://swiss-ai.org
 * - Model card: https://huggingface.co/swiss-ai
 */

// Vite dev proxy path: /api/apertus/* → https://api.publicai.co/v1/*
// Node.js adds the required User-Agent header server-side (browsers can't).
const VITE_PROXY_PATH = '/api/apertus';
const APERTUS_BASE_STORAGE = 'cprov_apertus_base';

/**
 * Returns the active Apertus API base URL.
 * Defaults to the Vite proxy path so local dev works with zero config.
 * On Vercel the proxy doesn’t exist and the user must override this
 * via setApertusApiBase() with the direct API URL.
 */
const getApiBase = (): string =>
    sessionStorage.getItem(APERTUS_BASE_STORAGE) || VITE_PROXY_PATH;

export const setApertusApiBase = (url: string): void => {
    const trimmed = url.trim().replace(/\/$/, '');
    if (trimmed) sessionStorage.setItem(APERTUS_BASE_STORAGE, trimmed);
    else sessionStorage.removeItem(APERTUS_BASE_STORAGE);
};

const APERTUS_KEY_STORAGE = 'cprov_apertus_key';

// Build-time key from env (local dev — never present in Vercel production)
const buildTimeKey = (process.env as any).PUBLICAI_API_KEY || '';

// ── API key management ────────────────────────────────────────────────────────

export const setApertusApiKey = (key: string): void => {
    if (key.trim()) {
        sessionStorage.setItem(APERTUS_KEY_STORAGE, key.trim());
    } else {
        sessionStorage.removeItem(APERTUS_KEY_STORAGE);
    }
};

export const getApertusApiKey = (): string =>
    sessionStorage.getItem(APERTUS_KEY_STORAGE) || buildTimeKey;

export const isApertusKeyFromEnv = (): boolean =>
    !sessionStorage.getItem(APERTUS_KEY_STORAGE) && !!buildTimeKey;

export const checkApertusConnection = (): boolean => !!getApertusApiKey();

// ── Available models ──────────────────────────────────────────────────────────

export const APERTUS_MODELS = [
    'swiss-ai/apertus-8b-instruct',   // Efficient, suitable for individuals
    'swiss-ai/apertus-70b-instruct',  // Highest quality, research/commercial
];

// ── Chat completion (OpenAI-compatible) ──────────────────────────────────────

export const generateApertusCompletion = async (
    prompt: string,
    systemInstruction: string,
    model: string
): Promise<string> => {
    const key = getApertusApiKey();
    if (!key) throw new Error('Apertus API key not set. Get a free key at publicai.co.');

    let response: Response;
    try {
        response = await fetch(`${getApiBase()}/chat/completions`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${key}`,
                // PublicAI REQUIRES a User-Agent header to prevent bot spam.
                // Requests without it are blocked (returns 403/network error).
                'User-Agent': 'co-creation-provenance-tool/1.0',
            },
            body: JSON.stringify({
                model,
                messages: [
                    { role: 'system', content: systemInstruction },
                    { role: 'user', content: prompt },
                ],
                temperature: 0.8,   // Swiss-AI recommended default
                top_p: 0.9,         // Swiss-AI recommended default
                max_tokens: 2048,   // Generous limit for multi-paragraph summaries
            }),
        });
    } catch (networkErr) {
        // CORS or network-level failure (e.g., browser blocking cross-origin request)
        throw new Error(
            `Apertus network error — the PublicAI API may not allow direct browser requests (CORS). ` +
            `Consider using a server-side proxy or the Vite proxy in local dev. Details: ${networkErr}`
        );
    }

    if (!response.ok) {
        const err = await response.text();
        if (response.status === 429) {
            throw new Error('[QUOTA] Apertus rate limit reached (20 req/min during Swiss AI Weeks). Wait a moment and try again.');
        }
        if (response.status === 401 || response.status === 403) {
            throw new Error(`Apertus auth error (${response.status}): check your PublicAI API key at platform.publicai.co.`);
        }
        throw new Error(`Apertus API error (${response.status}): ${err}`);
    }

    const data = await response.json();
    const content = data.choices?.[0]?.message?.content;
    if (!content) {
        throw new Error(`Apertus returned an empty response. Model: ${model}. Raw: ${JSON.stringify(data)}`);
    }
    return content;
};
