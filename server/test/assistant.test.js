/* The assistant route, tested with fake Claude and Gemini clients so no real API calls (or costs) happen. */
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { ApiError } from '@google/genai';
import { createApp } from '../src/app.js';
import { loadConfig } from '../src/config.js';
import { anthropicProvider, geminiProvider } from '../src/ai/index.js';

const PNG = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=';

/* Mimics the parts of the SDK's MessageStream the route uses. */
function fakeClient({ stopReason = 'end_turn', fail = null } = {}) {
  const fake = {
    calls: [],
    beta: {
      messages: {
        stream(params) {
          fake.calls.push(params);
          const handlers = {};
          return {
            on(event, cb) { handlers[event] = cb; return this; },
            abort() {},
            async finalMessage() {
              if (fail) throw fail;
              handlers.text?.('Don’t tap the link. ');
              handlers.text?.('Check the parcel in the official app.');
              return { stop_reason: stopReason, usage: { input_tokens: 10, output_tokens: 5 }, content: [] };
            }
          };
        }
      }
    }
  };
  return fake;
}

const servers = [];
async function start(overrides) {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'kampung-ai-'));
  const { app, close } = createApp({
    dataDir: tmp, dbFile: ':memory:', uploadsDir: path.join(tmp, 'uploads'),
    autoReply: false, writeLimitPerMinute: 1000, ...overrides
  });
  const server = app.listen(0);
  await new Promise(r => server.once('listening', r));
  servers.push({ server, close, tmp });
  const base = `http://127.0.0.1:${server.address().port}/api`;
  return (url, body, client = 'resident-ai-0001') => fetch(base + url, {
    method: body === undefined ? 'GET' : 'POST',
    headers: { 'X-Client-Id': client, 'Content-Type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body)
  });
}

after(() => {
  for (const s of servers) { s.close(); s.server.closeAllConnections(); s.server.close(); fs.rmSync(s.tmp, { recursive: true, force: true }); }
});

const events = async res => (await res.text()).split('\n\n').filter(Boolean).map(chunk => JSON.parse(chunk.replace(/^data: /, '')));

test('assistant is off without an API key', async () => {
  const call = await start({ assistant: null });
  assert.equal((await (await call('/config')).json()).assistant, false);
  const res = await call('/assistant/chat', { messages: [{ role: 'user', content: 'hi' }] });
  assert.equal(res.status, 503);
});

let fake, call;
before(async () => {
  fake = fakeClient();
  call = await start({ assistant: anthropicProvider(fake, 'claude-opus-5-5'), assistantDailyLimit: 1000 });
});

test('streams a reply and builds a safe, cacheable request', async () => {
  const res = await call('/assistant/chat', {
    lang: 'zh',
    messages: [{ role: 'user', content: 'Got SMS from 91234567 asking $1.99 fee at singpost-redeliver.top' }]
  });
  assert.equal(res.status, 200);
  assert.equal(res.headers.get('content-type'), 'text/event-stream');
  const evs = await events(res);
  assert.equal(evs.filter(e => e.type === 'text').map(e => e.text).join(''), 'Don’t tap the link. Check the parcel in the official app.');
  assert.equal(evs.at(-1).type, 'done');

  const params = fake.calls.at(-1);
  assert.equal(params.model, 'claude-opus-5-5');
  assert.equal(params.fallbacks, 'default');
  assert.deepEqual(params.betas, ['server-side-fallback-2026-07-01']);
  assert.deepEqual(params.system[0].cache_control, { type: 'ephemeral' });
  assert.match(params.system[1].text, /Reply in Simplified Chinese/);
  assert.match(params.system[1].text, /Tampines/); // verified scam waves from the seed data
  assert.match(params.messages[0].content, /\[phone hidden\]/);
});

test('attaches a screenshot to the latest message', async () => {
  await (await call('/assistant/chat', { messages: [{ role: 'user', content: 'Is this real?' }], image: PNG })).text();
  const content = fake.calls.at(-1).messages[0].content;
  assert.equal(content[0].type, 'image');
  assert.equal(content[0].source.media_type, 'image/png');
  assert.equal(content[1].text, 'Is this real?');
});

test('rejects malformed conversations', async () => {
  const bad = [
    { messages: [] },
    { messages: [{ role: 'assistant', content: 'hi' }] },
    { messages: [{ role: 'user', content: 'a' }, { role: 'assistant', content: 'b' }] },
    { messages: [{ role: 'user', content: 'x'.repeat(2001) }] },
    { messages: [{ role: 'user', content: 'hi' }], image: 'data:image/png;base64,' + Buffer.from('not an image').toString('base64') }
  ];
  for (const body of bad) assert.equal((await call('/assistant/chat', body)).status, 400, JSON.stringify(body).slice(0, 60));
});

test('a refusal is turned into a friendly message', async () => {
  const call2 = await start({ assistant: anthropicProvider(fakeClient({ stopReason: 'refusal' }), 'claude-opus-5-5') });
  const evs = await events(await call2('/assistant/chat', { messages: [{ role: 'user', content: 'hi' }] }));
  assert.ok(evs.some(e => e.type === 'refusal'));
});

test('per-resident rate limit', async () => {
  const call3 = await start({ assistant: anthropicProvider(fakeClient(), 'claude-opus-5-5'), assistantPerMinute: 2 });
  const body = { messages: [{ role: 'user', content: 'hi' }] };
  await (await call3('/assistant/chat', body)).text();
  await (await call3('/assistant/chat', body)).text();
  assert.equal((await call3('/assistant/chat', body)).status, 429);
});

/* ---------- Gemini ---------- */

/* Mimics ai.models.generateContentStream from @google/genai. */
function fakeGemini({ finish = 'STOP', blocked = false, fail = null } = {}) {
  const fake = {
    calls: [],
    models: {
      async generateContentStream(params) {
        fake.calls.push(params);
        if (fail) throw fail;
        return (async function* () {
          yield { text: 'Don’t tap the link. ', candidates: [{}] };
          yield {
            text: 'Check in the official app.',
            candidates: [{ finishReason: finish }],
            usageMetadata: { promptTokenCount: 50, candidatesTokenCount: 9 },
            promptFeedback: blocked ? { blockReason: 'SAFETY' } : undefined
          };
        })();
      }
    }
  };
  return fake;
}

test('gemini: streams a reply with the right request shape', async () => {
  const gem = fakeGemini();
  const callG = await start({ assistant: geminiProvider(gem, 'gemini-flash-latest') });
  assert.equal((await (await callG('/config')).json()).assistantProvider, 'gemini');

  const res = await callG('/assistant/chat', {
    lang: 'ms',
    messages: [
      { role: 'user', content: 'Got an SMS asking for a fee, my number is 91234567' },
      { role: 'assistant', content: 'That looks risky.' },
      { role: 'user', content: 'What now?' }
    ],
    image: PNG
  });
  const evs = await events(res);
  assert.equal(evs.filter(e => e.type === 'text').map(e => e.text).join(''), 'Don’t tap the link. Check in the official app.');
  assert.deepEqual(evs.at(-1), { type: 'done', stopReason: 'end' });

  const p = gem.calls.at(-1);
  assert.equal(p.model, 'gemini-flash-latest');
  assert.deepEqual(p.contents.map(c => c.role), ['user', 'model', 'user']);
  assert.match(p.contents[0].parts[0].text, /\[phone hidden\]/);
  assert.equal(p.contents[2].parts[0].inlineData.mimeType, 'image/png'); // screenshot goes with the latest message
  assert.equal(p.contents[2].parts[1].text, 'What now?');
  assert.match(p.config.systemInstruction, /Reply in Malay/);
  assert.match(p.config.systemInstruction, /Kampung Watch assistant/);
  assert.ok(p.config.abortSignal instanceof AbortSignal);
});

test('gemini: a safety block becomes a friendly refusal', async () => {
  const callG = await start({ assistant: geminiProvider(fakeGemini({ finish: 'SAFETY' }), 'gemini-flash-latest') });
  const evs = await events(await callG('/assistant/chat', { messages: [{ role: 'user', content: 'hi' }] }));
  assert.ok(evs.some(e => e.type === 'refusal'));
});

test('gemini: free-tier limit errors are explained', async () => {
  const fail = new ApiError({ message: 'Resource has been exhausted', status: 429 });
  const callG = await start({ assistant: geminiProvider(fakeGemini({ fail }), 'gemini-flash-latest') });
  const evs = await events(await callG('/assistant/chat', { messages: [{ role: 'user', content: 'hi' }] }));
  assert.equal(evs.at(-1).type, 'error');
  assert.match(evs.at(-1).message, /free AI limit/);
});

test('gemini: retries when busy, then falls back to the lighter model', async () => {
  const busy = () => new ApiError({ message: 'This model is currently experiencing high demand.', status: 503 });
  const ok = fakeGemini();
  const calls = [];
  const flaky = {
    models: {
      async generateContentStream(params) {
        calls.push(params.model);
        // the main model is busy every time; the lite model answers
        if (params.model === 'gemini-flash-latest') throw busy();
        return ok.models.generateContentStream(params);
      }
    }
  };
  const callG = await start({ assistant: geminiProvider(flaky, 'gemini-flash-latest', { retryDelays: [1, 1] }) });
  const evs = await events(await callG('/assistant/chat', { messages: [{ role: 'user', content: 'hi' }] }));
  assert.deepEqual(calls, ['gemini-flash-latest', 'gemini-flash-latest', 'gemini-flash-latest', 'gemini-flash-lite-latest']);
  assert.equal(evs.at(-1).type, 'done');
  assert.ok(evs.some(e => e.type === 'text'));
});

test('gemini: explains when every model is busy', async () => {
  const always = { models: { async generateContentStream() { throw new ApiError({ message: 'high demand', status: 503 }); } } };
  const callG = await start({ assistant: geminiProvider(always, 'gemini-flash-latest', { retryDelays: [1] }) });
  const evs = await events(await callG('/assistant/chat', { messages: [{ role: 'user', content: 'hi' }] }));
  assert.equal(evs.at(-1).type, 'error');
  assert.match(evs.at(-1).message, /very busy/);
});

test('provider is picked from server/.env', () => {
  const saved = { ...process.env };
  try {
    for (const k of ['AI_PROVIDER', 'GEMINI_API_KEY', 'ANTHROPIC_API_KEY', 'ASSISTANT_MODEL']) delete process.env[k];
    assert.equal(loadConfig().assistantEnabled, false);

    process.env.GEMINI_API_KEY = 'test-key';
    let c = loadConfig();
    assert.deepEqual([c.aiProvider, c.assistantEnabled, c.assistantModel], ['gemini', true, 'gemini-flash-latest']);

    process.env.AI_PROVIDER = 'anthropic'; // chosen, but its key is missing
    c = loadConfig();
    assert.deepEqual([c.aiProvider, c.assistantEnabled], ['anthropic', false]);

    process.env.ANTHROPIC_API_KEY = 'test-key';
    c = loadConfig();
    assert.deepEqual([c.aiProvider, c.assistantEnabled, c.assistantModel], ['anthropic', true, 'claude-opus-5-5']);
  } finally {
    for (const k of Object.keys(process.env)) if (!(k in saved)) delete process.env[k];
    Object.assign(process.env, saved);
  }
});
