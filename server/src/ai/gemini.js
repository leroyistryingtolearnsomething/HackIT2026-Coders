/* Google Gemini (free tier available at aistudio.google.com) via the official @google/genai SDK. */
import { GoogleGenAI, ApiError } from '@google/genai';

// Gemini stops with these when its safety filters block a reply.
const BLOCKED = new Set(['SAFETY', 'PROHIBITED_CONTENT', 'BLOCKLIST', 'SPII', 'IMAGE_SAFETY']);

// The free tier often answers 503 "high demand" for a few seconds; these are worth retrying.
const BUSY = new Set([500, 503, 504]);
const RETRY_DELAYS_MS = [800, 2000];   // after the 1st and 2nd failed attempt on a model
const FALLBACK_MODEL = 'gemini-flash-lite-latest'; // lighter model, tried when the main one stays busy

const isBusy = err => err instanceof ApiError && BUSY.has(err.status);

function wait(ms, signal) {
  return new Promise((resolve, reject) => {
    const t = setTimeout(resolve, ms);
    signal.addEventListener('abort', () => { clearTimeout(t); reject(Object.assign(new Error('aborted'), { name: 'AbortError' })); }, { once: true });
  });
}

export function geminiProvider(client, model, { retryDelays = RETRY_DELAYS_MS } = {}) {
  const models = model === FALLBACK_MODEL ? [model] : [model, FALLBACK_MODEL];

  return {
    name: 'gemini',
    model,

    /* messages: [{ role: 'user' | 'assistant', content }]; image: { mediaType, base64 } for the last message. */
    async reply({ system, context, messages, image, signal, onText }) {
      const contents = messages.map(m => ({
        role: m.role === 'assistant' ? 'model' : 'user',
        parts: [{ text: m.content }]
      }));
      if (image) contents[contents.length - 1].parts.unshift({ inlineData: { mimeType: image.mediaType, data: image.base64 } });

      let lastError;
      for (const name of models) {
        for (let attempt = 0; attempt <= retryDelays.length; attempt++) {
          let sentText = false;
          try {
            const stream = await client.models.generateContentStream({
              model: name,
              contents,
              config: {
                systemInstruction: `${system}\n\n${context}`,
                maxOutputTokens: 8192, // replies are short; this caps runaway output
                abortSignal: signal
              }
            });

            let finish = null, blocked = false, usage = {};
            for await (const chunk of stream) {
              if (chunk.promptFeedback && chunk.promptFeedback.blockReason) blocked = true;
              const text = chunk.text;
              if (text) { sentText = true; onText(text); }
              const reason = chunk.candidates && chunk.candidates[0] && chunk.candidates[0].finishReason;
              if (reason) finish = reason;
              if (chunk.usageMetadata) usage = chunk.usageMetadata;
            }
            return {
              stopReason: blocked || BLOCKED.has(finish) ? 'refusal' : finish === 'MAX_TOKENS' ? 'max_tokens' : 'end',
              usage: { input: usage.promptTokenCount, output: usage.candidatesTokenCount, cached: usage.cachedContentTokenCount },
              model: name
            };
          } catch (err) {
            // Only retry when it's a busy signal and the resident hasn't seen any of this reply yet.
            if (sentText || !isBusy(err) || signal.aborted) throw err;
            lastError = err;
            console.warn(`[assistant] gemini ${name} busy (${err.status}), attempt ${attempt + 1}`);
            if (attempt < retryDelays.length) await wait(retryDelays[attempt], signal);
          }
        }
      }
      throw lastError;
    },

    isAbort: err => err && err.name === 'AbortError',

    describeError(err) {
      if (err instanceof ApiError) {
        if (BUSY.has(err.status)) return 'The free AI service is very busy right now. Please try again in a minute, or ask a volunteer.';
        if (err.status === 429) return 'The free AI limit has been reached for now. Please try again in a minute, or ask a volunteer.';
        if ([400, 401, 403].includes(err.status) && /api key|permission|unauthori[sz]ed/i.test(err.message)) {
          return 'The assistant isn’t set up correctly (the server’s Gemini API key was not accepted).';
        }
      }
      return null;
    }
  };
}

export const createGeminiClient = apiKey => new GoogleGenAI({ apiKey });
