import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createApp } from '../src/app.js';

const CODE = 'test-code';
const MUM = 'resident-mum-0001';
const SON = 'resident-son-0002';
const STRANGER = 'resident-xxx-0003';
const ESCALATE_MS = 150;

let server, base, close, tmp, volunteerToken;

async function call(method, url, { body, client = MUM, token } = {}) {
  const headers = { 'X-Client-Id': client };
  if (body !== undefined) headers['Content-Type'] = 'application/json';
  if (token) headers.Authorization = 'Bearer ' + token;
  const res = await fetch(base + url, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) });
  const data = res.status === 204 ? null : await res.json();
  return { status: res.status, data };
}

const wait = ms => new Promise(r => setTimeout(r, ms));

before(async () => {
  tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'kampung-pause-'));
  ({ app: server, close } = createApp({
    dataDir: tmp, dbFile: ':memory:', uploadsDir: path.join(tmp, 'uploads'),
    volunteerCode: CODE, usingDefaultCode: false, autoReply: false, writeLimitPerMinute: 1000,
    pauseEscalateMs: ESCALATE_MS, assistant: null
  }));
  server = server.listen(0);
  await new Promise(r => server.once('listening', r));
  base = `http://127.0.0.1:${server.address().port}/api`;
  const login = await call('POST', '/volunteer/login', { body: { name: 'Mei', role: 'RC Volunteer', area: 'Tampines', code: CODE } });
  volunteerToken = login.data.token;
});

after(() => {
  close();
  server.closeAllConnections();
  server.close();
  fs.rmSync(tmp, { recursive: true, force: true });
});

let inviteCode, circleId;

test('set up a Circle and join it with the code', async () => {
  const bad = await call('POST', '/circles', { body: { name: 'Mdm Tan', town: 'Atlantis' } });
  assert.equal(bad.status, 400);

  const made = await call('POST', '/circles', { body: { name: 'Mdm Tan', town: 'Tampines' } });
  assert.equal(made.status, 201);
  inviteCode = made.data.mine.inviteCode;
  circleId = made.data.mine.id;
  assert.match(inviteCode, /^[A-Z2-9]{6}$/);

  assert.equal((await call('POST', '/circles/join', { body: { code: inviteCode, name: 'Me', relation: 'Son' } })).status, 400, 'cannot join own circle');
  assert.equal((await call('POST', '/circles/join', { client: SON, body: { code: 'ZZZZZZ', name: 'Wei Ming', relation: 'Son' } })).status, 404);

  // Codes are forgiving about case and spacing, as they're read out over the phone.
  const spaced = inviteCode.slice(0, 3).toLowerCase() + ' ' + inviteCode.slice(3);
  const joined = await call('POST', '/circles/join', { client: SON, body: { code: spaced, name: 'Wei Ming', relation: 'Son' } });
  assert.equal(joined.status, 201);
  assert.equal(joined.data.guarding.length, 1);
  assert.equal(joined.data.guarding[0].name, 'Mdm Tan');

  const mine = await call('GET', '/circles/me');
  assert.deepEqual(mine.data.mine.members.map(m => m.name), ['Wei Ming']);
});

test('Pause alerts the Circle, and a Circle member steps in', async () => {
  const p = await call('POST', '/pauses', { body: { signs: ['pay', 'secret'], caller: 'Police or a government officer' } });
  assert.equal(p.status, 201);
  assert.equal(p.data.stage, 'circle');
  assert.equal(p.data.name, 'Mdm Tan');
  assert.deepEqual(p.data.signs, ['pay', 'secret']);

  // A second tap returns the same open Pause.
  const again = await call('POST', '/pauses');
  assert.equal(again.data.id, p.data.id);

  // Strangers and volunteers can't see it while it's with the Circle.
  assert.equal((await call('GET', '/pauses/' + p.data.id, { client: STRANGER })).status, 404);
  assert.equal((await call('GET', '/pauses/' + p.data.id, { client: STRANGER, token: volunteerToken })).status, 404);

  const son = await call('GET', '/circles/me', { client: SON });
  assert.equal(son.data.guarding[0].openPause.id, p.data.id);

  assert.equal((await call('POST', `/pauses/${p.data.id}/respond`)).status, 400, 'owner cannot respond to own pause');
  const responded = await call('POST', `/pauses/${p.data.id}/respond`, { client: SON });
  assert.equal(responded.data.responder.name, 'Wei Ming');
  assert.equal(responded.data.responder.kind, 'circle');

  await call('POST', `/pauses/${p.data.id}/messages`, { client: SON, body: { body: 'Ma, hang up. Calling you now.' } });
  const reply = await call('POST', `/pauses/${p.data.id}/messages`, { body: { body: 'OK' } });
  assert.deepEqual(reply.data.messages.slice(-2).map(m => m.from), ['circle', 'resident']);

  // A responded Pause does not escalate.
  await wait(ESCALATE_MS * 2);
  assert.equal((await call('GET', '/pauses/' + p.data.id)).data.stage, 'circle');

  const done = await call('POST', `/pauses/${p.data.id}/resolve`, { client: SON, body: { outcome: 'stopped' } });
  assert.equal(done.data.status, 'resolved');
  assert.equal(done.data.outcome, 'stopped');

  const stats = await call('GET', '/pauses/stats');
  assert.equal(stats.data.stopped, 1);
  assert.ok(stats.data.medianResponseSeconds >= 0);
});

test('an unanswered Pause escalates to volunteers', async () => {
  const p = await call('POST', '/pauses', { body: { signs: ['otp'] } });
  assert.equal(p.data.stage, 'circle');
  await wait(ESCALATE_MS * 3);
  const after = await call('GET', '/pauses/' + p.data.id);
  assert.equal(after.data.stage, 'volunteer');
  assert.ok(after.data.escalated);

  const inbox = await call('GET', '/pauses', { client: STRANGER, token: volunteerToken });
  assert.ok(inbox.data.some(x => x.id === p.data.id && x.role === 'volunteer'));
  const vol = await call('POST', `/pauses/${p.data.id}/respond`, { client: STRANGER, token: volunteerToken });
  assert.equal(vol.data.responder.kind, 'volunteer');
  await call('POST', `/pauses/${p.data.id}/resolve`, { body: { outcome: 'safe' } });
});

test('without a Circle, Pause goes straight to volunteers', async () => {
  const p = await call('POST', '/pauses', { client: STRANGER });
  assert.equal(p.data.stage, 'volunteer');
  assert.equal(p.data.name, 'A resident');
  await call('POST', `/pauses/${p.data.id}/resolve`, { client: STRANGER, body: { outcome: 'safe' } });
});

test('drills: a Circle member sends one, the resident answers, the Circle sees the result', async () => {
  assert.equal((await call('POST', '/drills', { client: STRANGER, body: { circleId } })).status, 404);

  const sent = await call('POST', '/drills', { client: SON, body: { circleId, template: 'parcel-fee' } });
  assert.equal(sent.status, 201);
  assert.equal(sent.data.message.from, 'SG-Parcel');

  assert.equal((await call('POST', '/drills', { client: SON, body: { circleId } })).status, 409, 'one at a time');

  const pending = await call('GET', '/drills/pending');
  assert.equal(pending.data.length, 1);
  assert.equal(pending.data[0].sender, null, 'sender is hidden until answered');

  assert.equal((await call('POST', `/drills/${sent.data.id}/result`, { client: SON, body: { result: 'paused' } })).status, 404);
  const answered = await call('POST', `/drills/${sent.data.id}/result`, { body: { result: 'clicked' } });
  assert.equal(answered.data.passed, false);
  assert.equal(answered.data.sender.name, 'Wei Ming');
  assert.ok(answered.data.lesson.length >= 1);
  assert.equal((await call('POST', `/drills/${sent.data.id}/result`, { body: { result: 'paused' } })).status, 400);

  const son = await call('GET', '/circles/me', { client: SON });
  assert.equal(son.data.guarding[0].drills[0].result, 'clicked');
});

test('drills: a verified Radar report becomes a drill for the whole town', async () => {
  const report = await call('POST', '/reports', { client: STRANGER, body: { town: 'Tampines', type: 'Bank phishing', channel: 'SMS', title: 'Fake bank SMS' } });
  assert.equal((await call('POST', '/drills/estate', { client: STRANGER, token: volunteerToken, body: { reportId: report.data.id } })).status, 400, 'must be verified first');
  assert.equal((await call('POST', '/drills/estate', { client: STRANGER, body: { town: 'Tampines' } })).status, 401);

  await call('POST', `/reports/${report.data.id}/verify`, { client: STRANGER, token: volunteerToken });
  const suggestion = await call('GET', '/drills/suggest?town=Tampines');
  assert.equal(suggestion.data.report.id, report.data.id);
  assert.equal(suggestion.data.template.id, 'bank-otp');

  const estate = await call('POST', '/drills/estate', { client: STRANGER, token: volunteerToken, body: { reportId: report.data.id } });
  assert.equal(estate.status, 201);
  assert.equal(estate.data.town, 'Tampines');
  assert.equal(estate.data.sent, 1);

  const [drill] = (await call('GET', '/drills/pending')).data;
  assert.equal(drill.template, 'bank-otp');
  assert.equal(drill.reportId, report.data.id);
  await call('POST', `/drills/${drill.id}/result`, { body: { result: 'paused' } });

  const stats = await call('GET', '/drills/stats?town=Tampines');
  assert.equal(stats.data.overall.answered, 2);
  assert.equal(stats.data.overall.passed, 1);
  assert.equal(stats.data.overall.passRate, 50);
});

test('leaving a Circle', async () => {
  const son = await call('GET', '/circles/me', { client: SON });
  const memberId = son.data.guarding[0].memberId;
  assert.equal((await call('DELETE', '/circles/members/' + memberId, { client: STRANGER })).status, 403);
  const left = await call('DELETE', '/circles/members/' + memberId, { client: SON });
  assert.equal(left.data.guarding.length, 0);
});
