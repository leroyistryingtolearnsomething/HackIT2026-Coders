/* Anthropic Claude via the official @anthropic-ai/sdk (paid, prepaid credits). */
import Anthropic from '@anthropic-ai/sdk';

export function anthropicProvider(client, model) {
  return {
    name: 'anthropic',
    model,

    /* messages: [{ role: 'user' | 'assistant', content }]; image: { mediaType, base64 } for the last message. */
    async reply({ system, context, messages, image, signal, onText }) {
      const msgs = messages.map(m => ({ role: m.role, content: m.content }));
      if (image) {
        const last = msgs[msgs.length - 1];
        last.content = [
          { type: 'image', source: { type: 'base64', media_type: image.mediaType, data: image.base64 } },
          { type: 'text', text: last.content }
        ];
      }

      const stream = client.beta.messages.stream({
        model,
        max_tokens: 8000, // replies are short; this caps cost if something goes wrong
        output_config: { effort: 'low' }, // chat answers don't need deep reasoning
        // If a safety classifier declines, Anthropic re-runs the request on its recommended fallback model.
        betas: ['server-side-fallback-2026-07-01'],
        fallbacks: 'default',
        system: [
          { type: 'text', text: system, cache_control: { type: 'ephemeral' } }, // identical every time, so cached
          { type: 'text', text: context }
        ],
        messages: msgs
      });
      signal.addEventListener('abort', () => stream.abort());
      stream.on('text', onText);

      const message = await stream.finalMessage();
      const u = message.usage || {};
      return {
        stopReason: message.stop_reason === 'refusal' ? 'refusal' : message.stop_reason === 'max_tokens' ? 'max_tokens' : 'end',
        usage: { input: u.input_tokens, output: u.output_tokens, cached: u.cache_read_input_tokens }
      };
    },

    isAbort: err => err instanceof Anthropic.APIUserAbortError,

    describeError(err) {
      if (err instanceof Anthropic.AuthenticationError || err instanceof Anthropic.PermissionDeniedError) {
        return 'The assistant isn’t set up correctly (the server’s Anthropic API key was not accepted).';
      }
      if (err instanceof Anthropic.RateLimitError) return 'The assistant is busy right now. Please try again in a minute.';
      return null;
    }
  };
}

export const createAnthropicClient = () => new Anthropic(); // reads ANTHROPIC_API_KEY from the environment
