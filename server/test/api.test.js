import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createApp } from '../src/app.js';

const CODE = 'test-code';
const RESIDENT = 'resident-aaaa-1111';
const OTHER = 'resident-bbbb-2222';
// 1×1 transparent PNG
const PNG = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=';

let server, base, close, tmp, volunteerToken;

async function call(method, url, { body, client = RESIDENT, token } = {}) {
  const headers = { 'X-Client-Id': client };
  if (body !== undefined) headers['Content-Type'] = 'application/json';
  if (token) headers.Authorization = 'Bearer ' + token;
  const res = await fetch(base + url, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) });
  const data = res.status === 204 ? null : await res.json();
  return { status: res.status, data };
}

before(async () => {
  tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'kampung-test-'));
  ({ app: server, close } = createApp({
    dataDir: tmp, dbFile: ':memory:', uploadsDir: path.join(tmp, 'uploads'),
    volunteerCode: CODE, usingDefaultCode: false, autoReply: false, writeLimitPerMinute: 1000
  }));
  server = server.listen(0);
  await new Promise(r => server.once('listening', r));
  base = `http://127.0.0.1:${server.address().port}/api`;
});

after(() => {
  close();
  server.closeAllConnections();
  server.close();
  fs.rmSync(tmp, { recursive: true, force: true });
});

test('health and identity', async () => {
  assert.equal((await call('GET', '/health')).data.ok, true);
  const me = await call('GET', '/me');
  assert.match(me.data.handle, /^Resident-\d{4}$/);
  assert.equal((await call('GET', '/me', { client: 'bad id!' })).status, 400);
});

test('seed data is loaded', async () => {
  const reports = await call('GET', '/reports');
  assert.ok(reports.data.length >= 10);
  const posts = await call('GET', '/posts?sort=top');
  assert.ok(posts.data.length >= 5);
  assert.ok(posts.data[0].score >= posts.data[1].score);
});

test('volunteer login', async () => {
  const wrong = await call('POST', '/volunteer/login', { body: { name: 'Mei', role: 'RC Volunteer', area: 'Tampines', code: 'nope' } });
  assert.equal(wrong.status, 401);
  const ok = await call('POST', '/volunteer/login', { body: { name: 'Mei', role: 'RC Volunteer', area: 'Tampines', code: CODE } });
  assert.equal(ok.status, 201);
  volunteerToken = ok.data.token;
  const me = await call('GET', '/me', { token: volunteerToken });
  assert.equal(me.data.volunteer.name, 'Mei');
});

test('report lifecycle: create → confirm → verify', async () => {
  const bad = await call('POST', '/reports', { body: { town: 'Atlantis', type: 'Other', channel: 'SMS', title: 'x' } });
  assert.equal(bad.status, 400);

  const created = await call('POST', '/reports', {
    body: { town: 'Bishan', type: 'Bank phishing', channel: 'SMS', title: 'Fake bank SMS, call 91234567', desc: 'Sent to me@example.com', image: PNG }
  });
  assert.equal(created.status, 201);
  const r = created.data;
  assert.equal(r.status, 'pending');
  assert.equal(r.count, 1);
  assert.equal(r.mine, true);
  assert.match(r.title, /\[phone hidden\]/);
  assert.match(r.desc, /\[email hidden\]/);
  assert.match(r.image, /^\/uploads\/[a-f0-9]{24}\.png$/);

  const img = await fetch(base.replace('/api', '') + r.image);
  assert.equal(img.status, 200);

  const confirmed = await call('POST', `/reports/${r.id}/confirm`, { client: OTHER });
  assert.equal(confirmed.data.count, 2);
  const unconfirmed = await call('POST', `/reports/${r.id}/confirm`, { client: OTHER });
  assert.equal(unconfirmed.data.count, 1);

  assert.equal((await call('POST', `/reports/${r.id}/verify`)).status, 401);
  const verified = await call('POST', `/reports/${r.id}/verify`, { token: volunteerToken });
  assert.equal(verified.data.status, 'verified');
  assert.match(verified.data.verifiedBy, /Bishan CC · Mei/);

  const discuss = await call('POST', `/reports/${r.id}/discuss`);
  const again = await call('POST', `/reports/${r.id}/discuss`, { client: OTHER });
  assert.equal(discuss.data.postId, again.data.postId);
});

test('rejects images that are not really images', async () => {
  const fake = 'data:image/png;base64,' + Buffer.from('<script>alert(1)</script>').toString('base64');
  const res = await call('POST', '/reports', { body: { town: 'Bishan', type: 'Other', channel: 'SMS', title: 'x', image: fake } });
  assert.equal(res.status, 400);
});

test('posts: create, vote, poll, nested comments, verdict', async () => {
  const created = await call('POST', '/posts', { body: { flair: 'ask', title: 'Is this real?', body: 'Pay fee at bit.ly/x' } });
  assert.equal(created.status, 201);
  const p = created.data;
  assert.equal(p.score, 1);
  assert.equal(p.poll.options.length, 3);

  const down = await call('POST', `/posts/${p.id}/vote`, { client: OTHER, body: { value: -1 } });
  assert.equal(down.data.score, 0);
  assert.equal(down.data.myVote, -1);

  const polled = await call('POST', `/posts/${p.id}/poll`, { client: OTHER, body: { option: 0 } });
  assert.equal(polled.data.poll.options[0].votes, 1);
  assert.equal(polled.data.poll.myChoice, 0);
  assert.equal((await call('POST', `/posts/${p.id}/poll`, { body: { option: 9 } })).status, 400);

  const c1 = await call('POST', `/posts/${p.id}/comments`, { body: { body: 'Looks like a scam' } });
  const parentId = c1.data.comments[0].id;
  const c2 = await call('POST', `/posts/${p.id}/comments`, { token: volunteerToken, body: { body: 'Yes, scam.', parentId } });
  const reply = c2.data.comments[0].replies[0];
  assert.equal(reply.role, 'Volunteer');
  assert.equal(reply.author, 'Mei');

  const voted = await call('POST', `/comments/${reply.id}/vote`, { client: OTHER, body: { value: 1 } });
  assert.equal(voted.data.comments[0].replies[0].score, 2);

  assert.equal((await call('POST', `/posts/${p.id}/verdict`, { body: { result: 'scam' } })).status, 401);
  const verdict = await call('POST', `/posts/${p.id}/verdict`, { token: volunteerToken, body: { result: 'scam' } });
  assert.equal(verdict.data.verdict.result, 'scam');

  const search = await call('GET', '/posts?q=' + encodeURIComponent('Is this real'));
  assert.ok(search.data.some(x => x.id === p.id));
  const wildcard = await call('GET', '/posts?q=%25%25%25');
  assert.equal(wildcard.data.length, 0);
});

test('cases: private to the resident, answered by volunteers', async () => {
  const empty = await call('POST', '/cases', { body: { channel: 'SMS', text: '' } });
  assert.equal(empty.status, 400);

  const created = await call('POST', '/cases', {
    body: {
      channel: 'SMS',
      text: 'URGENT: account suspended. Verify your OTP at dbs-secure.xyz',
      callback: { name: 'Ah Ma', phone: '8123 4567', lang: 'Hokkien / Teochew' }
    }
  });
  assert.equal(created.status, 201);
  const c = created.data;
  assert.equal(c.level, 'high');
  assert.ok(c.flags.includes('credentials'));
  assert.equal(c.status, 'waiting');

  assert.equal((await call('GET', `/cases/${c.id}`, { client: OTHER })).status, 404);
  assert.equal((await call('GET', '/cases', { client: OTHER })).data.length, 0);

  const inbox = await call('GET', '/cases', { client: OTHER, token: volunteerToken });
  assert.ok(inbox.data.some(x => x.id === c.id));

  const replied = await call('POST', `/cases/${c.id}/messages`, { client: OTHER, token: volunteerToken, body: { body: 'This is a scam, please block.' } });
  assert.equal(replied.data.status, 'replied');
  assert.equal(replied.data.volunteer.name, 'Mei');

  await call('POST', `/cases/${c.id}/verdict`, { client: OTHER, token: volunteerToken, body: { verdict: 'scam' } });
  const followUp = await call('POST', `/cases/${c.id}/messages`, { body: { body: 'Thank you!' } });
  assert.deepEqual(followUp.data.messages.map(m => m.from), ['system', 'vol', 'resident']);

  assert.equal((await call('POST', `/cases/${c.id}/share`, { client: OTHER, token: volunteerToken })).status, 403);
  const shared = await call('POST', `/cases/${c.id}/share`);
  const post = await call('GET', `/posts/${shared.data.postId}`);
  assert.equal(post.data.verdict.result, 'scam');

  const resolved = await call('POST', `/cases/${c.id}/resolve`);
  assert.equal(resolved.data.status, 'resolved');
});

test('live events reach subscribers', async () => {
  const ac = new AbortController();
  const res = await fetch(`${base}/events?clientId=${RESIDENT}`, { signal: ac.signal });
  assert.equal(res.headers.get('content-type'), 'text/event-stream');
  const reader = res.body.getReader();

  await call('POST', '/reports', { client: OTHER, body: { town: 'Yishun', type: 'Other', channel: 'SMS', title: 'Live test' } });

  let received = '';
  while (!received.includes('event: report')) {
    const { value } = await reader.read();
    received += new TextDecoder().decode(value);
  }
  assert.match(received, /"action":"new"/);
  ac.abort();
});

test('unknown endpoints and private files', async () => {
  assert.equal((await call('GET', '/nope')).status, 404);
  const pkg = await fetch(base.replace('/api', '') + '/server/package.json');
  assert.equal(pkg.status, 404);
});

test('cases: a call-back request needs no message, but an empty case is refused', async () => {
  assert.equal((await call('POST', '/cases', { body: { channel: 'Phone call', text: '' } })).status, 400);
  const c = await call('POST', '/cases', {
    body: { channel: 'Phone call', text: '', callback: { name: 'Rosnah', phone: '8123 4567', lang: 'Bahasa Melayu' } }
  });
  assert.equal(c.status, 201);
  assert.equal(c.data.callback.lang, 'Bahasa Melayu');
  assert.equal(c.data.text, '');
});

test('installable app: manifest, icons and service worker are served', async () => {
  const root = base.replace(/\/api$/, '');
  const manifest = await fetch(root + '/manifest.webmanifest');
  assert.equal(manifest.status, 200);
  assert.match(manifest.headers.get('content-type'), /application\/manifest\+json/);
  const m = await manifest.json();
  assert.equal(m.display, 'standalone');
  assert.match(m.start_url, /launch=home/);
  for (const icon of m.icons) {
    const res = await fetch(root + icon.src);
    assert.equal(res.status, 200, icon.src);
    assert.match(res.headers.get('content-type'), /image\/png/);
  }
  const sw = await fetch(root + '/sw.js');
  assert.equal(sw.status, 200);
  assert.match(sw.headers.get('content-type'), /javascript/);
  assert.equal(sw.headers.get('cache-control'), 'no-cache');
  for (const p of ['/apple-touch-icon.png', '/apple-touch-icon-precomposed.png', '/favicon.ico']) {
    const res = await fetch(root + p);
    assert.equal(res.status, 200, p);
    assert.match(res.headers.get('content-type'), /image\/png/);
  }
  // The start URL with ?launch=… still loads the site.
  assert.equal((await fetch(root + '/?launch=home')).status, 200);
});

test('live events can also be polled, with the same privacy rules', async () => {
  const start = await call('GET', '/events/poll');
  assert.equal(start.data.events.length, 0);
  const from = start.data.last;

  // Public: a new report reaches everyone.
  await call('POST', '/reports', { client: OTHER, body: { town: 'Yishun', type: 'Other', channel: 'SMS', title: 'Poll test' } });
  // Private: a case event only reaches its owner (and volunteers).
  await call('POST', '/cases', { client: OTHER, body: { channel: 'SMS', text: 'private poll test' } });

  const mine = await call('GET', `/events/poll?after=${from}`);
  assert.ok(mine.data.events.some(e => e.event === 'report'));
  assert.ok(!mine.data.events.some(e => e.event === 'case'), 'another resident’s case is not visible');

  const theirs = await call('GET', `/events/poll?after=${from}`, { client: OTHER });
  assert.ok(theirs.data.events.some(e => e.event === 'case'));
  assert.ok(theirs.data.last > from);
  assert.ok(theirs.data.events.every(e => e.id > from));
});

test('community counts: total and per topic', async () => {
  const counts = await call('GET', '/posts/counts');
  assert.equal(counts.status, 200);
  const all = await call('GET', '/posts?limit=100');
  assert.equal(counts.data.total, all.data.length);
  assert.equal(Object.values(counts.data.byFlair).reduce((a, n) => a + n, 0), counts.data.total);
  const asks = await call('GET', '/posts?flair=ask&limit=100');
  assert.equal(counts.data.byFlair.ask, asks.data.length);
});
