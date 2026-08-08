/**
 * Unified AI Completion Router
 *
 * Single source of truth for routing LLM completion calls to the
 * user's selected AI provider. Every service that needs an LLM
 * completion should import `generateCompletion` from here instead
 * of implementing its own provider switch.
 */

import { AnalysisConfig } from '../types';
import { generateCompletion as generateGeminiCompletion } from './gemini';
import { generateOllamaCompletion } from './ollama';
import { generateGroqCompletion } from './groq';
import { generateOpenAICompletion } from './openai';
import { generateClaudeCompletion } from './claude';
import { generateApertusCompletion } from './apertus';

const COMPLETION_TIMEOUT_MS = 120_000; // 2 minutes — generous for large prompts on slow models

/**
 * Wraps a promise with a timeout. Rejects with a clear error if the
 * provider does not respond within the limit.
 */
const withTimeout = <T>(promise: Promise<T>, ms: number, provider: string): Promise<T> => {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(
      () => reject(new Error(`[${provider}] Completion timed out after ${ms / 1000}s`)),
      ms
    );
    promise.then(
      (v) => { clearTimeout(timer); resolve(v); },
      (e) => { clearTimeout(timer); reject(e); }
    );
  });
};

export const generateCompletion = async (
  prompt: string,
  system: string,
  config: AnalysisConfig
): Promise<string> => {
  // Inject domain context into system prompt when provided.
  // This adapts all downstream LLM calls (summarization, sentiment,
  // keyword extraction, fidelity analysis) to the user's domain
  // without requiring per-service changes.
  const effectiveSystem = config.domainContext?.trim()
    ? `${system}\n\nDomain Context: The source material comes from the following domain — ${config.domainContext.trim()}. Adapt your analysis, terminology, and interpretation to this domain.`
    : system;

  const provider = config.aiProvider || 'gemini';
  let completionPromise: Promise<string>;

  if (provider === 'ollama') completionPromise = generateOllamaCompletion(prompt, effectiveSystem, config.model);
  else if (provider === 'groq') completionPromise = generateGroqCompletion(prompt, effectiveSystem, config.model);
  else if (provider === 'openai') completionPromise = generateOpenAICompletion(prompt, effectiveSystem, config.model);
  else if (provider === 'claude') completionPromise = generateClaudeCompletion(prompt, effectiveSystem, config.model);
  else if (provider === 'apertus') completionPromise = generateApertusCompletion(prompt, effectiveSystem, config.model);
  else completionPromise = generateGeminiCompletion(prompt, effectiveSystem, config.model);

  return withTimeout(completionPromise, COMPLETION_TIMEOUT_MS, provider);
};
