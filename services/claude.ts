/**
 * Anthropic Claude Service
 *
 * Uses Anthropic's live Models API when a key is available and a current,
 * conservative static fallback when it is not.
 * Note: Claude does not provide an embeddings endpoint.
 * The tool will fall back to BGE-M3 → TF-IDF for embeddings when using Claude.
 *
 * CORS note: Anthropic's API requires the `anthropic-dangerous-direct-browser-access: true`
 * header for direct browser calls (their policy for consenting developers).
 * Direct browser access exposes the user-supplied key to the browser runtime;
 * deployments must assess this against their threat model and provider policy.
 *
 * Get a key at: https://console.anthropic.com/keys
 */

import type { CompletionResult } from '../types';

const CLAUDE_API_URL = 'https://api.anthropic.com/v1';
const CLAUDE_API_VERSION = '2023-06-01';
const CLAUDE_KEY_STORAGE = 'cprov_claude_key';

// Browser builds replace this with an empty string; Node scripts may use their own environment.
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

export const verifyClaudeConnection = async (): Promise<boolean> => {
    const key = getClaudeApiKey();
    if (!key) return false;
    try {
        const response = await fetch(`${CLAUDE_API_URL}/models`, {
            headers: {
                'x-api-key': key,
                'anthropic-version': CLAUDE_API_VERSION,
                'anthropic-dangerous-direct-browser-access': 'true',
            },
            signal: AbortSignal.timeout(10_000),
        });
        return response.ok;
    } catch {
        return false;
    }
};

// ── Available models ──────────────────────────────────────────────────────────

/**
 * Fallback catalogue, used before a key is entered or if the Models API is
 * unreachable. Verified against Anthropic's published model overview.
 *
 * `claude-mythos-5` is deliberately excluded: it is invitation-only under
 * Project Glasswing, so listing it would offer most users a model they cannot
 * call.
 *
 * Live discovery remains authoritative for account-specific availability.
 */
export const CLAUDE_MODELS = [
    'claude-sonnet-4-6',            // Balanced default
    'claude-opus-4-8',
    'claude-fable-5',
    'claude-haiku-4-5-20251001',    // Fastest, cheapest
];

// API 2023-06-01 preserves custom sampling for older models; Claude 4.7+
// rejects sampling parameters even on that version.
export const supportsClaudeTemperature = (model: string): boolean =>
    !/^claude-(?:(?:opus|sonnet|haiku)-(?:[5-9]|4-(?:[7-9]|[1-9]\d))(?:-|$)|fable-)/.test(model);

export const parseClaudeModelCatalog = (payload: unknown): string[] => {
    if (typeof payload !== 'object' || payload === null || !('data' in payload)) return [];
    const entries = (payload as { data?: unknown }).data;
    if (!Array.isArray(entries)) return [];
    return entries
        .map(item => typeof item === 'object' && item !== null && 'id' in item ? String((item as { id: unknown }).id) : '')
        .filter(id => id.startsWith('claude-'));
};

/**
 * Fetch the live model list once a key is present.
 *
 * Anthropic exposes GET /v1/models, so the picker does not have to rely on a
 * catalogue baked into the build — which goes stale every time a new model
 * ships. Falls back to CLAUDE_MODELS on any failure.
 */
export const fetchClaudeModels = async (): Promise<string[]> => {
    const key = getClaudeApiKey();
    if (!key) return CLAUDE_MODELS;

    try {
        const response = await fetch(`${CLAUDE_API_URL}/models?limit=1000`, {
            headers: {
                'x-api-key': key,
                'anthropic-version': CLAUDE_API_VERSION,
                'anthropic-dangerous-direct-browser-access': 'true',
            },
            signal: AbortSignal.timeout(10_000),
        });
        if (!response.ok) return CLAUDE_MODELS;

        const ids = parseClaudeModelCatalog(await response.json());
        if (ids.length === 0) return CLAUDE_MODELS;

        // Keep the balanced fallback first when the account offers it, then
        // retain Anthropic's most-recent-first order for the live remainder.
        return [...new Set([
            ...CLAUDE_MODELS.filter(id => ids.includes(id)),
            ...ids,
        ])];
    } catch {
        return CLAUDE_MODELS;
    }
};

// ── Chat completion ───────────────────────────────────────────────────────────

export const generateClaudeCompletionResult = async (
    prompt: string,
    systemInstruction: string,
    model: string,
    temperature: number = 0.5,
    signal?: AbortSignal,
): Promise<CompletionResult> => {
    const key = getClaudeApiKey();
    if (!key) throw new Error('Claude API key not set. Enter your key in the configuration panel.');

    const supportsTemperature = supportsClaudeTemperature(model);
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
            ...(supportsTemperature ? { temperature } : {}),
        }),
        signal: signal ?? AbortSignal.timeout(120_000),
    });

    if (!response.ok) {
        const err = await response.text();
        if (response.status === 429 || err.toLowerCase().includes('rate_limit') || err.toLowerCase().includes('overloaded')) {
            throw new Error('[QUOTA] Claude rate limit reached. Wait a moment and try again, or switch to another provider.');
        }
        throw new Error(`Claude API error (${response.status}). Check the selected model, API key, and account access.`);
    }

    const data = await response.json();
    if (data.stop_reason === 'refusal') {
        const error = new Error('[REFUSAL] Claude declined the completion.') as Error & { completionMetadata?: CompletionResult['metadata'] };
        error.completionMetadata = {
            provider: 'claude', requestedModel: model, returnedModel: data.model,
            responseId: data.id, requestId: response.headers.get('request-id') || undefined,
            createdAt: new Date().toISOString(), finishReason: 'refusal', refusal: 'refusal',
            effectiveParameters: { temperature: supportsTemperature ? temperature : null, maxOutputTokens: 4096 },
        };
        throw error;
    }
    const content = (Array.isArray(data.content) ? data.content : [])
        .filter((block: unknown) => typeof block === 'object' && block !== null && (block as { type?: string }).type === 'text')
        .map((block: unknown) => String((block as { text?: unknown }).text ?? ''))
        .join('');
    if (!content) {
        throw new Error(`Claude returned no text (stop reason: ${data.stop_reason ?? 'unknown'}).`);
    }
    return {
        text: content,
        metadata: {
            provider: 'claude',
            requestedModel: model,
            returnedModel: typeof data.model === 'string' ? data.model : undefined,
            responseId: typeof data.id === 'string' ? data.id : undefined,
            requestId: response.headers.get('request-id') || undefined,
            createdAt: new Date().toISOString(),
            finishReason: typeof data.stop_reason === 'string' ? data.stop_reason : undefined,
            usage: data.usage ? {
                inputTokens: data.usage.input_tokens,
                outputTokens: data.usage.output_tokens,
                totalTokens: typeof data.usage.input_tokens === 'number' && typeof data.usage.output_tokens === 'number'
                    ? data.usage.input_tokens + data.usage.output_tokens
                    : undefined,
            } : undefined,
            effectiveParameters: { temperature: supportsTemperature ? temperature : null, maxOutputTokens: 4096 },
        },
    };
};

export const generateClaudeCompletion = async (...args: Parameters<typeof generateClaudeCompletionResult>): Promise<string> =>
    (await generateClaudeCompletionResult(...args)).text;
