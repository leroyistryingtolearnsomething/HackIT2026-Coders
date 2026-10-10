/* Picks the AI service for the assistant from server/.env (AI_PROVIDER + its API key). */
import { geminiProvider, createGeminiClient } from './gemini.js';
import { anthropicProvider, createAnthropicClient } from './anthropic.js';
import { seaLionProvider, withFallback } from './sealion.js';

export { geminiProvider, anthropicProvider, seaLionProvider, withFallback };

/* Translating posts: SEA-LION when its key is set (it's trained on Southeast Asian
   languages), with the assistant's service as backup. Gemini uses its lighter, faster
   model for this simple work. */
export function createTranslator(config) {
  const backup = config.aiProvider === 'gemini' && config.assistantEnabled
    ? geminiProvider(createGeminiClient(process.env.GEMINI_API_KEY), config.translateModel)
    : createAssistant(config);
  if (!config.seaLionEnabled) return backup;
  return withFallback(seaLionProvider(process.env.SEALION_API_KEY, config.seaLionModel), backup);
}

export function createAssistant(config) {
  if (!config.assistantEnabled) return null;
  if (config.aiProvider === 'gemini') return geminiProvider(createGeminiClient(process.env.GEMINI_API_KEY), config.assistantModel);
  if (config.aiProvider === 'anthropic') return anthropicProvider(createAnthropicClient(), config.assistantModel);
  return null;
}
