/**
 * Anthropic Claude Service
 *
 * Supports Claude 3.5 Sonnet, Claude 3 Opus, Claude 3 Haiku.
 * Note: Claude does not provide an embeddings endpoint.
 * The tool will fall back to BGE-M3 → TF-IDF for embeddings when using Claude.
 *
 * CORS note: Anthropic's API requires the `anthropic-dangerous-direct-browser-access: true`
 * header for direct browser calls (their policy for consenting developers).
 * This is safe for a self-hosted / research tool where the user enters their own key.
 *
 * Get a key at: https://console.anthropic.com/keys
 */

const CLAUDE_API_URL = 'https://api.anthropic.com/v1';
const CLAUDE_API_VERSION = '2023-06-01';
const CLAUDE_KEY_STORAGE = 'cprov_claude_key';

// Build-time key from env (local dev via vite.config.ts — never present in production)
const buildTimeKey = (process.env as any).ANTHROPIC_API_KEY || '';

// ── API key management ────────────────────────────────────────────────────────

export const setClaudeApiKey = (key: string): void => {
    if (key.trim()) {
        sessionStorage.setItem(CLAUDE_KEY_STORAGE, key.trim());
    } else {
        sessionStorage.removeItem(CLAUDE_KEY_STORAGE);
    }
};

export const getClaudeApiKey = (): string =>
    sessionStorage.getItem(CLAUDE_KEY_STORAGE) || buildTimeKey;

export const isClaudeKeyFromEnv = (): boolean =>
    !sessionStorage.getItem(CLAUDE_KEY_STORAGE) && !!buildTimeKey;

export const checkClaudeConnection = (): boolean => !!getClaudeApiKey();

// ── Available models ──────────────────────────────────────────────────────────

export const CLAUDE_MODELS = [
    'claude-sonnet-4-6',            // Latest, best quality/speed balance
    'claude-opus-4-6',              // Most powerful
    'claude-haiku-4-5-20251001',    // Fastest, cheapest
    'claude-3-5-sonnet-20241022',   // Previous generation
    'claude-3-5-haiku-20241022',    // Previous generation (fast)
];

// ── Chat completion ───────────────────────────────────────────────────────────

export const generateClaudeCompletion = async (
    prompt: string,
    systemInstruction: string,
    model: string
): Promise<string> => {
    const key = getClaudeApiKey();
    if (!key) throw new Error('Claude API key not set. Enter your key in the configuration panel.');

    const response = await fetch(`${CLAUDE_API_URL}/messages`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'x-api-key': key,
            'anthropic-version': CLAUDE_API_VERSION,
            // Required for direct browser access (user-consented research use)
            'anthropic-dangerous-direct-browser-access': 'true',
        },
        body: JSON.stringify({
            model,
            system: systemInstruction,
            messages: [{ role: 'user', content: prompt }],
            max_tokens: 4096,
            temperature: 0.5,
        }),
    });

    if (!response.ok) {
        const err = await response.text();
        if (response.status === 429 || err.toLowerCase().includes('rate_limit') || err.toLowerCase().includes('overloaded')) {
            throw new Error('[QUOTA] Claude rate limit reached. Wait a moment and try again, or switch to another provider.');
        }
        throw new Error(`Claude API error (${response.status}): ${err}`);
    }

    const data = await response.json();
    return data.content?.[0]?.text || '';
};
