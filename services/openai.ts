/**
 * OpenAI Service
 *
 * Supports GPT-4o, GPT-4o-mini, and text-embedding-3-small/large.
 * Uses the OpenAI-compatible REST API directly from the browser.
 * API key is stored only in sessionStorage (cleared when the tab closes).
 *
 * Get a key at: https://platform.openai.com/api-keys
 */

const OPENAI_API_URL = 'https://api.openai.com/v1';
const OPENAI_KEY_STORAGE = 'cprov_openai_key';

// Build-time key from env (local dev via vite.config.ts — never present in production)
const buildTimeKey = (process.env as any).OPENAI_API_KEY || '';

// ── API key management ────────────────────────────────────────────────────────

export const setOpenAIApiKey = (key: string): void => {
    if (key.trim()) {
        sessionStorage.setItem(OPENAI_KEY_STORAGE, key.trim());
    } else {
        sessionStorage.removeItem(OPENAI_KEY_STORAGE);
    }
};

export const getOpenAIApiKey = (): string =>
    sessionStorage.getItem(OPENAI_KEY_STORAGE) || buildTimeKey;

export const isOpenAIKeyFromEnv = (): boolean =>
    !sessionStorage.getItem(OPENAI_KEY_STORAGE) && !!buildTimeKey;

export const checkOpenAIConnection = (): boolean => !!getOpenAIApiKey();

// ── Available models ──────────────────────────────────────────────────────────

/**
 * Static fallback list — used when the API is unreachable or key not set yet.
 * Kept current as of March 2026. The live fetch below supersedes this.
 */
export const OPENAI_CHAT_MODELS = [
    'gpt-4o',
    'gpt-4o-mini',
    'o3-mini',
    'o1',
    'o1-mini',
    'gpt-4-turbo',
    'gpt-4',
    'gpt-3.5-turbo',
];

export const OPENAI_EMBEDDING_MODELS = [
    'text-embedding-3-small',
    'text-embedding-3-large',
    'text-embedding-ada-002',
];

/**
 * Fetches the live list of chat-capable models from the OpenAI API.
 * Filters out fine-tuned, audio, image, moderation, and embedding models.
 * Returns the static fallback list if the call fails (e.g., no key yet).
 */
export const fetchOpenAIChatModels = async (): Promise<string[]> => {
    const key = getOpenAIApiKey();
    if (!key) return OPENAI_CHAT_MODELS;

    try {
        const response = await fetch(`${OPENAI_API_URL}/models`, {
            headers: { Authorization: `Bearer ${key}` },
        });
        if (!response.ok) return OPENAI_CHAT_MODELS;

        const data = await response.json();
        const allModels: string[] = (data.data || []).map((m: any) => m.id as string);

        // Keep only chat/reasoning models — exclude embeddings, audio, image, TTS, moderation
        const chatModels = allModels.filter(id =>
            (id.startsWith('gpt-') || id.startsWith('o1') || id.startsWith('o3') || id.startsWith('o4')) &&
            !id.includes('embed') &&
            !id.includes('audio') &&
            !id.includes('tts') &&
            !id.includes('whisper') &&
            !id.includes('dall-e') &&
            !id.includes('moderation') &&
            !id.includes('instruct') // gpt-3.5-turbo-instruct is completion-only, not chat
        );

        if (chatModels.length === 0) return OPENAI_CHAT_MODELS;

        // Sort: preferred flagship models first, then by date desc
        const priority = ['gpt-4o', 'o3', 'o1', 'gpt-4-turbo', 'gpt-4', 'gpt-3.5'];
        return chatModels.sort((a, b) => {
            const pa = priority.findIndex(p => a.startsWith(p));
            const pb = priority.findIndex(p => b.startsWith(p));
            if (pa !== pb) return (pa === -1 ? 999 : pa) - (pb === -1 ? 999 : pb);
            return b.localeCompare(a); // newer versions (higher dates) first within same family
        });
    } catch {
        return OPENAI_CHAT_MODELS;
    }
};

// ── Chat completion ───────────────────────────────────────────────────────────

export const generateOpenAICompletion = async (
    prompt: string,
    systemInstruction: string,
    model: string
): Promise<string> => {
    const key = getOpenAIApiKey();
    if (!key) throw new Error('OpenAI API key not set. Enter your key in the configuration panel.');

    const response = await fetch(`${OPENAI_API_URL}/chat/completions`, {
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
            throw new Error('[QUOTA] OpenAI rate limit reached. Wait a minute and try again, or switch to another provider.');
        }
        throw new Error(`OpenAI API error (${response.status}): ${err}`);
    }

    const data = await response.json();
    return data.choices?.[0]?.message?.content || '';
};

// ── Embeddings ────────────────────────────────────────────────────────────────

export const generateOpenAIEmbedding = async (
    text: string,
    model: string = 'text-embedding-3-small'
): Promise<number[]> => {
    const key = getOpenAIApiKey();
    if (!key) throw new Error('OpenAI API key not set.');

    const response = await fetch(`${OPENAI_API_URL}/embeddings`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${key}`,
        },
        body: JSON.stringify({ model, input: text }),
    });

    if (!response.ok) {
        const err = await response.text();
        throw new Error(`OpenAI embedding error (${response.status}): ${err}`);
    }

    const data = await response.json();
    return data.data?.[0]?.embedding || [];
};
