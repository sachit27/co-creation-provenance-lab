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

export const generateCompletion = async (
  prompt: string,
  system: string,
  config: AnalysisConfig
): Promise<string> => {
  if (config.aiProvider === 'ollama') return await generateOllamaCompletion(prompt, system, config.model);
  if (config.aiProvider === 'groq') return await generateGroqCompletion(prompt, system, config.model);
  if (config.aiProvider === 'openai') return await generateOpenAICompletion(prompt, system, config.model);
  if (config.aiProvider === 'claude') return await generateClaudeCompletion(prompt, system, config.model);
  if (config.aiProvider === 'apertus') return await generateApertusCompletion(prompt, system, config.model);
  return await generateGeminiCompletion(prompt, system, config.model);
};
