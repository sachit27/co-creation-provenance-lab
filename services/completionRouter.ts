/**
 * Unified AI Completion Router
 *
 * Single source of truth for routing LLM completion calls to the
 * user's selected AI provider. Every service that needs an LLM
 * completion should import `generateCompletion` from here instead
 * of implementing its own provider switch.
 */

import { AnalysisConfig, CompletionResult } from '../types';
import { generateCompletionResult as generateGeminiCompletion } from './gemini';
import { generateOllamaCompletionResult } from './ollama';
import { generateGroqCompletionResult } from './groq';
import { generateOpenAICompletionResult } from './openai';
import { generateClaudeCompletionResult } from './claude';
import { generateApertusCompletionResult } from './apertus';

const COMPLETION_TIMEOUT_MS = 120_000; // 2 minutes — generous for large prompts on slow models

export interface CompletionOptions {
  /** Defaults to 0.5 for existing generation calls. Evaluation calls should use 0. */
  temperature?: number;
  /** Receives provider-returned execution facts after a successful call. */
  onMetadata?: (metadata: CompletionResult['metadata']) => void;
  /** Ask providers that support constrained decoding to return valid JSON. */
  responseFormat?: 'text' | 'json';
  /** Provider-enforced JSON Schema when supported. Ollama receives it through
   * its documented `format` field; other adapters retain prompt validation. */
  jsonSchema?: Record<string, unknown>;
  /** Cancels the provider request. Used by background enrichment and other
   * long-running workflows; the router also composes a 120-second call limit. */
  signal?: AbortSignal;
}

export const composeRequestSignal = (external?: AbortSignal): AbortSignal => {
  const timeout = AbortSignal.timeout(COMPLETION_TIMEOUT_MS);
  if (!external) return timeout;
  if (external.aborted) return external;
  if (typeof AbortSignal.any === 'function') return AbortSignal.any([external, timeout]);

  // Compatibility fallback for browsers without AbortSignal.any().
  const controller = new AbortController();
  const abort = (event: Event) => controller.abort((event.target as AbortSignal).reason);
  external.addEventListener('abort', abort, { once: true });
  timeout.addEventListener('abort', abort, { once: true });
  return controller.signal;
};

export const generateCompletionResult = async (
  prompt: string,
  system: string,
  config: AnalysisConfig,
  options: CompletionOptions = {},
): Promise<CompletionResult> => {
  // Inject domain context into system prompt when provided.
  // This adapts all downstream LLM calls (summarization, sentiment,
  // keyword extraction, fidelity analysis) to the user's domain
  // without requiring per-service changes.
  const effectiveSystem = config.domainContext?.trim()
    ? `${system}\n\nDomain Context: The source material comes from the following domain — ${config.domainContext.trim()}. Adapt your analysis, terminology, and interpretation to this domain.`
    : system;

  const provider = config.aiProvider || 'gemini';
  const temperature = options.temperature ?? 0.5;
  const requestSignal = composeRequestSignal(options.signal ?? config.completionAbortSignal);
  let completionPromise: Promise<CompletionResult>;

  if (provider === 'ollama') completionPromise = generateOllamaCompletionResult(
    prompt,
    effectiveSystem,
    config.model,
    temperature,
    options.jsonSchema ?? options.responseFormat ?? 'text',
    requestSignal,
  );
  else if (provider === 'groq') completionPromise = generateGroqCompletionResult(prompt, effectiveSystem, config.model, temperature, requestSignal);
  else if (provider === 'openai') completionPromise = generateOpenAICompletionResult(prompt, effectiveSystem, config.model, temperature, requestSignal);
  else if (provider === 'claude') completionPromise = generateClaudeCompletionResult(prompt, effectiveSystem, config.model, temperature, requestSignal);
  else if (provider === 'apertus') completionPromise = generateApertusCompletionResult(prompt, effectiveSystem, config.model, temperature, requestSignal);
  else completionPromise = generateGeminiCompletion(prompt, effectiveSystem, config.model, temperature, requestSignal);

  try {
    const result = await completionPromise;
    config.completionMetadataSink?.(result.metadata);
    options.onMetadata?.(result.metadata);
    return result;
  } catch (error) {
    const metadata = (error as { completionMetadata?: CompletionResult['metadata'] })?.completionMetadata;
    if (metadata) {
      config.completionMetadataSink?.(metadata);
      options.onMetadata?.(metadata);
    }
    throw error;
  }
};

/** Backward-compatible text-only API used by existing analysis modules. */
export const generateCompletion = async (...args: Parameters<typeof generateCompletionResult>): Promise<string> =>
  (await generateCompletionResult(...args)).text;
