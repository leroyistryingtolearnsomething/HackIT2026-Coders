/* Translating what residents write, tested with a fake AI provider so no real API calls happen. */
import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createApp } from '../src/app.js';
import { parseReply } from '../src/routes/translate.js';

/* Answers every batch with "[zh] <text>", like a provider streaming a JSON array. */
function fakeProvider({ reply } = {}) {
  const fake = {
    name: 'fake',
    calls: [],
    async reply({ messages, onText }) {
      const list = JSON.parse(messages[0].content);
      fake.calls.push(list);
      onText(reply ? reply(list) : '```json\n' + JSON.stringify(list.map(s => `[zh] ${s}`)) + '\n```');
      return { stopReason: 'end', usage: {} };
    },
    isAbort: () => false,
    describeError: () => null
  };
  return fake;
}

const servers = [];
async function start(overrides) {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'kampung-tr-'));
  const { app, close } = createApp({
    dataDir: tmp, dbFile: ':memory:', uploadsDir: path.join(tmp, 'uploads'),
    autoReply: false, writeLimitPerMinute: 1000, ...overrides
  });
  const server = app.listen(0);
  await new Promise(r => server.once('listening', r));
  servers.push({ server, close, tmp });
  const base = `http://127.0.0.1:${server.address().port}/api`;
  return async body => {
    const res = await fetch(base + '/translate', {
      method: 'POST',
      headers: { 'X-Client-Id': 'resident-tr-0001', 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    });
    return { status: res.status, data: await res.json() };
  };
}

after(() => {
  for (const s of servers) { s.close(); s.server.closeAllConnections(); s.server.close(); fs.rmSync(s.tmp, { recursive: true, force: true }); }
});

test('translates once, then serves the saved translation', async () => {
  const ai = fakeProvider();
  const call = await start({ assistant: ai });
  const first = await call({ lang: 'zh', texts: ['Is this SMS real?', '', 'Is this SMS real?'] });
  assert.equal(first.status, 200);
  assert.deepEqual(first.data.translations, ['[zh] Is this SMS real?', '', '[zh] Is this SMS real?']);
  assert.deepEqual(ai.calls, [['Is this SMS real?']]); // duplicates and blanks aren't sent

  const again = await call({ lang: 'zh', texts: ['Is this SMS real?'] });
  assert.deepEqual(again.data.translations, ['[zh] Is this SMS real?']);
  assert.equal(ai.calls.length, 1); // came from the database
});

test('a bad AI reply leaves the original (null) instead of failing', async () => {
  const call = await start({ assistant: fakeProvider({ reply: () => 'Sorry, I cannot.' }) });
  const res = await call({ lang: 'ta', texts: ['Hello'] });
  assert.equal(res.status, 200);
  assert.deepEqual(res.data.translations, [null]);
});

test('checks the request and needs the AI service', async () => {
  const call = await start({ assistant: fakeProvider() });
  assert.equal((await call({ lang: 'fr', texts: ['Hi'] })).status, 400);
  assert.equal((await call({ lang: 'zh', texts: [] })).status, 400);
  assert.equal((await call({ lang: 'zh', texts: ['x'.repeat(4001)] })).status, 400);

  const off = await start({ assistant: null });
  assert.equal((await off({ lang: 'zh', texts: ['Hi'] })).status, 503);
  assert.deepEqual((await off({ lang: 'zh', texts: [' '] })).data.translations, [' ']); // nothing to translate
});

test('parseReply accepts a fenced JSON array of the right length only', () => {
  assert.deepEqual(parseReply('```json\n["a","b"]\n```', 2), ['a', 'b']);
  assert.throws(() => parseReply('["a"]', 2));
  assert.throws(() => parseReply('not json', 1));
});
