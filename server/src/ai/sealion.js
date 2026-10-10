/* SEA-LION (AI Singapore), a model trained for Southeast Asian languages, used for translating
   posts into 华语, Malay and Tamil. Free key from playground.sea-lion.ai (API Key Manager).
   Its API speaks the OpenAI chat format, so plain fetch is enough. The free tier allows about
   10 requests a minute, so the translator falls back to Gemini when SEA-LION is busy. */
const BASE_URL = 'https://api.sea-lion.ai/v1';

export function seaLionProvider(apiKey, model, { fetchImpl = fetch } = {}) {
  return {
    name: 'sea-lion',
    model,

    /* Same shape as the Gemini and Claude providers; the reply arrives in one piece. */
    async reply({ system, context, messages, signal, onText }) {
      const res = await fetchImpl(`${BASE_URL}/chat/completions`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model,
          messages: [{ role: 'system', content: `${system}\n\n${context}` }, ...messages],
          temperature: 0.2
        }),
        signal
      });
      if (!res.ok) {
        const err = new Error(`SEA-LION answered ${res.status}`);
        err.status = res.status;
        throw err;
      }
      const data = await res.json();
      const choice = data.choices && data.choices[0];
      const text = choice && choice.message && choice.message.content;
      if (!text) throw new Error('SEA-LION sent an empty reply');
      onText(text);
      return {
        stopReason: choice.finish_reason === 'length' ? 'max_tokens' : 'end',
        usage: { input: data.usage?.prompt_tokens, output: data.usage?.completion_tokens }
      };
    },

    isAbort: err => err && err.name === 'AbortError',
    describeError: () => null
  };
}

/* Try the first provider; if it fails (busy, rate-limited, down), ask the second instead. */
export function withFallback(primary, backup) {
  if (!backup) return primary;
  return {
    name: `${primary.name} (backup: ${backup.name})`,
    model: primary.model,
    async reply(args) {
      let text = '';
      try {
        const result = await primary.reply({ ...args, onText: t => { text += t; } });
        if (result.stopReason === 'end') { args.onText(text); return result; }
        console.warn(`[translate] ${primary.name} stopped early (${result.stopReason}), using ${backup.name}`);
      } catch (err) {
        if (args.signal && args.signal.aborted) throw err;
        console.warn(`[translate] ${primary.name} failed (${err.status || err.message}), using ${backup.name}`);
      }
      return backup.reply(args);
    },
    isAbort: err => primary.isAbort(err) || backup.isAbort(err),
    describeError: err => primary.describeError(err) || backup.describeError(err)
  };
}
