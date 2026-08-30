/**
 * Apertus Service — Swiss National AI (ETH Zurich / EPFL / CSCS)
 *
 * Apertus is Switzerland's multilingual, open-weight model family. Hosting,
 * privacy, limits, and
 * pricing are properties of the selected deployment (PublicAI here), not of
 * the model weights themselves.
 *
 * Accessed via PublicAI's OpenAI-compatible API:
 *   https://api.publicai.co/v1/chat/completions
 *
 * The catalog is discovered from PublicAI's authenticated /v1/models endpoint.
 *
 * Note: Apertus does not provide a dedicated embedding endpoint.
 * The tool will fall back to BGE-M3 → TF-IDF for embeddings.
 *
 * Obtain an API key and review current terms at: https://publicai.co
 *
 * References:
 * - Swiss National AI Initiative: https://swiss-ai.org
 * - Model card: https://huggingface.co/swiss-ai
 */

import type { CompletionResult } from '../types';

// Vite dev proxy path: /api/apertus/* → https://api.publicai.co/v1/*
// Node.js adds the required User-Agent header server-side (browsers can't).
const VITE_PROXY_PATH = '/api/apertus';
const APERTUS_BASE_STORAGE = 'cprov_apertus_base';

/**
 * Returns the active Apertus API base URL.
 * A custom base is optional. The default route uses the Vite proxy in
 * development and a BYOK Vercel relay in production.
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
    'swiss-ai/apertus-v1.5-8b',
];

const hasCustomBase = (): boolean => !!sessionStorage.getItem(APERTUS_BASE_STORAGE);

const modelsUrl = (): string => {
    if (hasCustomBase()) return `${getApiBase()}/models`;
    return (import.meta as any).env?.DEV ? `${VITE_PROXY_PATH}/models` : '/api/apertus-models';
};

const completionUrl = (): string => {
    if (hasCustomBase()) return `${getApiBase()}/chat/completions`;
    return (import.meta as any).env?.DEV ? `${VITE_PROXY_PATH}/chat/completions` : '/api/apertus-complete';
};

export interface PublicAIModelInfo {
    id: string;
    contextLength?: number;
    inputPrice?: number;
    outputPrice?: number;
}

export const parsePublicAIModelCatalog = (payload: unknown): PublicAIModelInfo[] => {
    if (typeof payload !== 'object' || payload === null || !('data' in payload)) return [];
    const entries = (payload as { data?: unknown }).data;
    if (!Array.isArray(entries)) return [];
    return entries
        .filter((model: any) => typeof model?.id === 'string' && /apertus/i.test(model.id))
        .map((model: any) => ({
            id: model.id,
            contextLength: Number.isFinite(model.context_length) ? model.context_length : undefined,
            inputPrice: Number.isFinite(model.pricing?.input) ? model.pricing.input : undefined,
            outputPrice: Number.isFinite(model.pricing?.output) ? model.pricing.output : undefined,
        }));
};

export const fetchApertusModels = async (): Promise<PublicAIModelInfo[]> => {
    const key = getApertusApiKey();
    if (!key) return [];
    const response = await fetch(modelsUrl(), {
        headers: { Authorization: `Bearer ${key}` },
        signal: AbortSignal.timeout(10_000),
    });
    if (!response.ok) throw new Error(`PublicAI model discovery failed (${response.status})`);
    return parsePublicAIModelCatalog(await response.json());
};

export const verifyApertusConnection = async (): Promise<boolean> => {
    try {
        return (await fetchApertusModels()).length > 0;
    } catch {
        return false;
    }
};

// ── Chat completion (OpenAI-compatible) ──────────────────────────────────────

export const generateApertusCompletionResult = async (
    prompt: string,
    systemInstruction: string,
    model: string,
    temperature: number = 0.5,
    signal?: AbortSignal,
): Promise<CompletionResult> => {
    const key = getApertusApiKey();
    if (!key) throw new Error('Apertus API key not set. Review access options at publicai.co.');

    let response: Response;
    try {
        response = await fetch(completionUrl(), {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${key}`,
            },
            body: JSON.stringify({
                model,
                messages: [
                    { role: 'system', content: systemInstruction },
                    { role: 'user', content: prompt },
                ],
                temperature,
                top_p: 0.9,
                max_tokens: 4096,
            }),
            signal: signal ?? AbortSignal.timeout(120_000),
        });
    } catch (networkErr) {
        if ((networkErr as Error)?.name === 'AbortError' || (networkErr as Error)?.name === 'TimeoutError') throw networkErr;
        throw new Error(
            `Apertus/PublicAI network error. Check the deployment relay or custom API base. Details: ${networkErr}`
        );
    }

    if (!response.ok) {
        const err = await response.text();
        if (response.status === 429) {
            throw new Error('[QUOTA] PublicAI rate limit reached. Limits depend on the active plan; wait or review the PublicAI account limits.');
        }
        if (response.status === 401 || response.status === 403) {
            throw new Error(`Apertus auth error (${response.status}): check your PublicAI API key at platform.publicai.co.`);
        }
        throw new Error(`Apertus API error (${response.status}): ${err}`);
    }

    const data = await response.json();
    const choice = data.choices?.[0];
    if (choice?.message?.refusal || choice?.finish_reason === 'content_filter') {
        const refusal = choice?.message?.refusal ? String(choice.message.refusal) : 'content_filter';
        const error = new Error(`[REFUSAL] Apertus/PublicAI declined the completion${choice?.message?.refusal ? `: ${choice.message.refusal}` : '.'}`) as Error & { completionMetadata?: CompletionResult['metadata'] };
        error.completionMetadata = {
            provider: 'apertus', requestedModel: model, returnedModel: data.model,
            responseId: data.id, requestId: response.headers.get('x-request-id') || response.headers.get('request-id') || undefined,
            createdAt: typeof data.created === 'number' ? new Date(data.created * 1000).toISOString() : new Date().toISOString(),
            finishReason: choice?.finish_reason, refusal,
            effectiveParameters: { temperature, maxOutputTokens: 4096, topP: 0.9 },
        };
        throw error;
    }
    const content = choice?.message?.content;
    if (!content) {
        throw new Error(`Apertus returned an empty response. Model: ${model}. Raw: ${JSON.stringify(data)}`);
    }
    return {
        text: content,
        metadata: {
            provider: 'apertus',
            requestedModel: model,
            returnedModel: typeof data.model === 'string' ? data.model : undefined,
            responseId: typeof data.id === 'string' ? data.id : undefined,
            requestId: response.headers.get('x-request-id') || response.headers.get('request-id') || undefined,
            createdAt: typeof data.created === 'number' ? new Date(data.created * 1000).toISOString() : new Date().toISOString(),
            finishReason: typeof choice?.finish_reason === 'string' ? choice.finish_reason : undefined,
            usage: data.usage ? {
                inputTokens: data.usage.prompt_tokens,
                outputTokens: data.usage.completion_tokens,
                totalTokens: data.usage.total_tokens,
            } : undefined,
            effectiveParameters: { temperature, maxOutputTokens: 4096, topP: 0.9 },
        },
    };
};

export const generateApertusCompletion = async (...args: Parameters<typeof generateApertusCompletionResult>): Promise<string> =>
    (await generateApertusCompletionResult(...args)).text;
