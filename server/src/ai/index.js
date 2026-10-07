/* Picks the AI service for the assistant from server/.env (AI_PROVIDER + its API key). */
import { geminiProvider, createGeminiClient } from './gemini.js';
import { anthropicProvider, createAnthropicClient } from './anthropic.js';

export { geminiProvider, anthropicProvider };

export function createAssistant(config) {
  if (!config.assistantEnabled) return null;
  if (config.aiProvider === 'gemini') return geminiProvider(createGeminiClient(process.env.GEMINI_API_KEY), config.assistantModel);
  if (config.aiProvider === 'anthropic') return anthropicProvider(createAnthropicClient(), config.assistantModel);
  return null;
}
