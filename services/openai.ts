/**
 * OpenAI Service
 *
 * Uses a live account model catalog with a conservative current fallback and
 * supports the text-embedding-3 family.
 * Uses the OpenAI-compatible REST API directly from the browser.
 * API key is stored only in sessionStorage (cleared when the tab closes).
 *
 * Get a key at: https://platform.openai.com/api-keys
 */

import type { CompletionResult } from '../types';
import { sanitizeProviderErrorText } from './providerErrors';

const OPENAI_API_URL = 'https://api.openai.com/v1';
const OPENAI_KEY_STORAGE = 'cprov_openai_key';

// Browser builds replace this with an empty string; Node scripts may use their own environment.
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
    (typeof sessionStorage !== 'undefined' ? sessionStorage.getItem(OPENAI_KEY_STORAGE) : null) || buildTimeKey;

export const isOpenAIKeyFromEnv = (): boolean =>
    !(typeof sessionStorage !== 'undefined' && sessionStorage.getItem(OPENAI_KEY_STORAGE)) && !!buildTimeKey;

export const checkOpenAIConnection = (): boolean => !!getOpenAIApiKey();

export const verifyOpenAIConnection = async (): Promise<boolean> => {
    const key = getOpenAIApiKey();
    if (!key) return false;
    try {
        const response = await fetch(`${OPENAI_API_URL}/models`, {
            headers: { Authorization: `Bearer ${key}` },
        });
        return response.ok;
    } catch {
        return false;
    }
};

// ── Available models ──────────────────────────────────────────────────────────

/**
 * Static fallback list — used when the API is unreachable or key not set yet.
 * Current first-party model-family fallback as of August 2026. The live
 * account catalog below remains authoritative for availability.
 */
export const OPENAI_CHAT_MODELS = [
    'gpt-5.6-luna',
    'gpt-5.6-terra',
    'gpt-5.6-sol',
    'gpt-4.1-mini',
    'gpt-4.1',
];

export const OPENAI_EMBEDDING_MODELS = [
    'text-embedding-3-small',
    'text-embedding-3-large',
    'text-embedding-ada-002',
];

/** Reasoning families require completion-token limits and omit sampling controls. */
export const isOpenAIReasoningModel = (id: string): boolean =>
    /^gpt-[56](?:[.-]|$)/.test(id) || /^o[134](?:-|$)/.test(id);

/** Conservative compatibility screen for this adapter's text-only Chat Completions call. */
export const isOpenAIChatModelId = (id: string): boolean =>
    (id.startsWith('gpt-') || /^o[134](?:-|$)/.test(id)) &&
    !/(embed|audio|realtime|transcrib|tts|whisper|image|dall-e|moderation|search|deep-research|computer-use|codex|sora|video|instruct)/i.test(id);

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
        const chatModels = allModels.filter(isOpenAIChatModelId);

        if (chatModels.length === 0) return OPENAI_CHAT_MODELS;

        // Sort: preferred flagship models first, then by date desc
        const priority = ['gpt-5.6-luna', 'gpt-5.6-terra', 'gpt-5.6-sol', 'gpt-4.1-mini', 'gpt-4.1'];
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

export const generateOpenAICompletionResult = async (
    prompt: string,
    systemInstruction: string,
    model: string,
    temperature: number = 0.5,
    signal?: AbortSignal,
): Promise<CompletionResult> => {
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
            ...(isOpenAIReasoningModel(model)
                ? { reasoning_effort: 'low', max_completion_tokens: 4096 }
                : { temperature, max_tokens: 4096 }),
        }),
        signal: signal ?? AbortSignal.timeout(120_000),
    });

    if (!response.ok) {
        const err = await response.text();
        if (response.status === 429 || err.toLowerCase().includes('rate limit') || err.toLowerCase().includes('quota')) {
            throw new Error('[QUOTA] OpenAI rate limit reached. Wait a minute and try again, or switch to another provider.');
        }
        throw new Error(`OpenAI API error (${response.status}). Check the selected model, API key, and account access.`);
    }

    const data = await response.json();
    const choice = data.choices?.[0];
    if (choice?.message?.refusal) {
        const error = new Error(`[REFUSAL] OpenAI declined the completion: ${sanitizeProviderErrorText(choice.message.refusal, key)}`) as Error & { completionMetadata?: CompletionResult['metadata'] };
        error.completionMetadata = {
            provider: 'openai', requestedModel: model, returnedModel: data.model,
            responseId: data.id, requestId: response.headers.get('x-request-id') || undefined,
            createdAt: typeof data.created === 'number' ? new Date(data.created * 1000).toISOString() : new Date().toISOString(),
            finishReason: choice?.finish_reason, refusal: sanitizeProviderErrorText(choice.message.refusal, key),
            effectiveParameters: isOpenAIReasoningModel(model)
                ? { temperature: null, maxOutputTokens: 4096, reasoningEffort: 'low' }
                : { temperature, maxOutputTokens: 4096 },
        };
        throw error;
    }
    if (choice?.finish_reason === 'content_filter') {
        const error = new Error('[REFUSAL] OpenAI blocked the completion through its content filter.') as Error & { completionMetadata?: CompletionResult['metadata'] };
        error.completionMetadata = {
            provider: 'openai', requestedModel: model, returnedModel: data.model,
            responseId: data.id, requestId: response.headers.get('x-request-id') || undefined,
            createdAt: typeof data.created === 'number' ? new Date(data.created * 1000).toISOString() : new Date().toISOString(),
            finishReason: 'content_filter', refusal: 'content_filter',
            effectiveParameters: isOpenAIReasoningModel(model)
                ? { temperature: null, maxOutputTokens: 4096, reasoningEffort: 'low' }
                : { temperature, maxOutputTokens: 4096 },
        };
        throw error;
    }
    const content = choice?.message?.content;
    if (typeof content !== 'string' || content.length === 0) {
        throw new Error(`OpenAI returned no text (finish reason: ${choice?.finish_reason ?? 'unknown'}).`);
    }
    const reasoningModel = isOpenAIReasoningModel(model);
    return {
        text: content,
        metadata: {
            provider: 'openai',
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
            effectiveParameters: reasoningModel
                ? { temperature: null, maxOutputTokens: 4096, reasoningEffort: 'low' }
                : { temperature, maxOutputTokens: 4096 },
        },
    };
};

/** Backward-compatible text-only completion API. */
export const generateOpenAICompletion = async (...args: Parameters<typeof generateOpenAICompletionResult>): Promise<string> =>
    (await generateOpenAICompletionResult(...args)).text;

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
        signal: AbortSignal.timeout(60_000),
    });

    if (!response.ok) {
        throw new Error(`OpenAI embedding error (${response.status}). Check the embedding model, API key, and account access.`);
    }

    const data = await response.json();
    return data.data?.[0]?.embedding || [];
};
