/* Dev-only stress test for the layout: worst-case data behind a switch.
   Open the site on localhost with ?data=worst (or empty, one, demo), e.g.
     http://localhost:3000/?data=worst#/community
   The switch only appears when ?data= is in the address, so normal demos on localhost are untouched.
   Real API responses are reshaped right where the app receives them (request() in app.js),
   so the app's own code renders the worst case. Inert on any public address and without
   the ?data= parameter. Values are realistic and within the server's limits:
   post title 140, post body 5000, comment 3000, report title 120 / description 2000,
   case text 4000, names 40 (call-back name 60), Pause note 1000. */
(function () {
  const DEV_HOST = /^(localhost|127\.0\.0\.1|\[::1\]|.+\.localhost|.+\.test)$/;
  const MODES = ['worst', 'empty', 'one'];
  const mode = new URLSearchParams(location.search).get('data');
  if (!DEV_HOST.test(location.hostname) || mode === null) return;

  addSwitch(MODES.includes(mode) ? mode : 'demo');
  if (!MODES.includes(mode)) return;

  const ago = mins => new Date(Date.now() - mins * 60e3).toISOString();
  const LONG_NAME = 'Muhammad Hafiz bin Abdul Rahman Alhabshi';        // 40, the name limit
  const NAMES = [LONG_NAME, 'Jo', 'Nur Aisyah binte Mohamed Zulkifli', '王秀英', 'Kavitha d/o Ramasamy Subramaniam', '👩🏽‍💻 Priya', 'Seán O’Brien-Ó Súilleabháin'];
  const URL_LINK = 'https://dbs-sg-secure-verify-account-login.example.com/verify/session/9f8e7d6c5b4a?ref=sms&token=a8f3e1c7';
  const pad = (s, n) => { let out = s; while (out.length < n) out += ' ' + s; return out.slice(0, n); };
  const STORY = 'Got a call from someone saying he was from the bank fraud team, very polite, knew my full name and the last four digits of my card. He said there was a suspicious transfer and I must move my savings to a “safe account” first, then he transferred me to a “police officer” on WhatsApp video who showed a warrant card. I almost did it, my hand was already on the PayNow screen. My daughter called just in time.';

  const POST_TITLES = [
    'URGENT got SMS from “DBS-SecureAlert” saying my account is suspended, link is dbs-sg-secure-verify-account-login.top — is this real or scam?', // 140
    'Scam?',
    '<script>alert(1)</script> & “quotes” &amp; **bold** — how does this show?',
    'Kenapa ramai sangat dapat panggilan “polis” minggu ni? 为什么这个星期那么多人接到“警察”电话？ ஏன் இந்த வாரம் இவ்வளவு “போலீஸ்” அழைப்புகள்?'
  ];

  function worstPost(p, i) {
    const o = { ...p };
    if (i === 0) Object.assign(o, { title: POST_TITLES[0], body: pad(STORY + ' ' + URL_LINK, 4990), author: LONG_NAME, authorRole: 'Digital Ambassador', score: 1284, commentCount: 1284, created: ago(0) });
    if (i === 1) Object.assign(o, { title: POST_TITLES[1], body: '', author: 'Jo', authorRole: null, score: 1, commentCount: 1, created: ago(60 * 24 * 330) });
    if (i === 2) Object.assign(o, { title: POST_TITLES[2], body: URL_LINK, author: '王秀英', score: -42, commentCount: 0, created: ago(1) });
    if (i === 3) Object.assign(o, { title: POST_TITLES[3], author: '👩🏽‍💻 Priya', score: 0, created: ago(-30) }); // clock 30 min ahead
    if (o.poll && i < 4) o.poll = { ...o.poll, options: o.poll.options.map((x, k) => k === 0 ? { ...x, label: 'Banks should refund in full when their own systems failed to flag a transfer to a new payee', votes: 1284 } : { ...x, votes: k === 1 ? 1 : 0 }) };
    return o;
  }

  function worstComments(list) {
    const deep = (d) => ({ id: 'wc' + d, author: NAMES[d % NAMES.length], role: d === 0 ? 'Digital Ambassador' : null, body: d === 0 ? pad(STORY, 2990) : d === 1 ? URL_LINK : 'ok', created: ago(d * 7), score: [1284, 1, -3, 0][d % 4], myVote: 0, parentId: d ? 'wc' + (d - 1) : null, replies: d < 4 ? [deep(d + 1)] : [] });
    return [deep(0), ...list];
  }

  function worstReport(r, i) {
    const o = { ...r };
    if (i === 0) Object.assign(o, { title: 'Caller says he is from MOH, then passes you to “Inspector Tan” on WhatsApp video with a warrant card. Wants CPF moved', desc: pad(STORY + ' ' + URL_LINK, 1995), town: 'Choa Chu Kang', type: 'Government official impersonation', channel: 'WhatsApp / Telegram', count: 1284, status: 'verified', verifiedBy: 'Choa Chu Kang CC', created: ago(0) });
    if (i === 1) Object.assign(o, { title: 'SMS', desc: '', count: 1, status: 'pending', verifiedBy: null, created: ago(60 * 24 * 40) });
    if (i === 2) Object.assign(o, { title: URL_LINK.slice(0, 120), desc: URL_LINK, count: 0, status: 'rumour', verifiedBy: 'Bukit Merah CC' });
    return o;
  }

  function worstCase(c, i) {
    return {
      ...c,
      text: i === 0 ? pad(STORY + ' ' + URL_LINK, 3990) : i === 1 ? '' : URL_LINK,
      image: null,
      channel: i === 0 ? 'WhatsApp / Telegram' : c.channel,
      callback: i === 0 ? { name: 'Muhammad Hafiz bin Abdul Rahman Alhabshi Al-Sagoff Junior', phone: '+65 9123 4567', lang: 'Hokkien / Teochew' } : c.callback,
      volunteer: { name: LONG_NAME, role: 'CC Scam-Buster', area: 'Choa Chu Kang' },
      messages: [...(c.messages || []), { from: 'vol', name: LONG_NAME + ' · CC Scam-Buster', body: pad(STORY, 2990), at: ago(1) }, { from: 'resident', name: null, body: URL_LINK, at: ago(0) }]
    };
  }

  const fakeCases = () => [0, 1, 2].map(i => worstCase({ id: 'wcase' + i, created: ago(i ? 60 * 24 * 12 : 0), channel: 'SMS', flags: [], level: 'high', status: ['waiting', 'replied', 'resolved'][i], verdict: [null, 'scam', 'safe'][i], callback: null, shared: null, mine: true, messages: [] }, i));

  const member = (n, i) => ({ id: 'wm' + i, name: n, relation: ['Brother or sister', 'Grandchild', 'Neighbour', 'Spouse'][i % 4], joined: ago(i * 60) });
  const openPause = {
    id: 'wpause', created: ago(3), name: LONG_NAME, town: 'Choa Chu Kang',
    signs: ['pay', 'secret', 'otp', 'app', 'rush'] /* every sign at once */, caller: 'Police or a government officer',
    note: pad('He says I am under investigation for money laundering and must not tell anyone. ' + URL_LINK, 995),
    stage: 'volunteer', status: 'open', outcome: null, responder: { name: LONG_NAME, kind: 'volunteer', detail: 'CC Scam-Buster, Choa Chu Kang' },
    escalated: ago(2), responded: ago(1), resolved: null, circleSize: 12, role: 'circle',
    messages: [{ from: 'circle', name: 'Kavitha d/o Ramasamy Subramaniam', body: pad('Ma don’t pay anything I am calling you now ', 600), at: ago(1) }]
  };

  const SHAPES = {
    'GET /posts': list => mode === 'empty' ? [] : mode === 'one' ? list.slice(0, 1).map(p => ({ ...p, score: 1, commentCount: 1 })) : list.map(worstPost),
    'GET /posts/counts': c => mode === 'empty' ? { total: 0, byFlair: {} } : mode === 'one' ? { total: 1, byFlair: { ask: 1 } } : { total: 1284, byFlair: { ask: 1000, alert: 284, tips: 0, debate: 0, story: 0 } },
    'GET /post': p => mode === 'worst' ? { ...worstPost(p, 0), comments: worstComments(p.comments || []) } : mode === 'empty' ? { ...p, body: '', comments: [], commentCount: 0, score: 0 } : { ...p, comments: (p.comments || []).slice(0, 1), commentCount: 1, score: 1 },
    'GET /reports': list => {
      if (mode === 'empty') return [];
      if (mode === 'one') return list.slice(0, 1).map(r => ({ ...r, count: 1 }));
      const out = list.map(worstReport);
      // An unpaginated feed at its realistic upper bound (the Radar asks for 500).
      while (out.length < 500 && list.length) { const r = list[out.length % list.length]; out.push({ ...r, id: r.id + '-' + out.length }); }
      return out;
    },
    'GET /cases': list => mode === 'empty' ? [] : mode === 'one' ? fakeCases().slice(1, 2) : fakeCases(),
    'GET /circles/me': c => mode === 'empty' ? { mine: null, guarding: [], townStats: null } : {
      mine: { id: 'wcircle', name: LONG_NAME, town: 'Choa Chu Kang', inviteCode: 'WWWWWW', members: (mode === 'one' ? NAMES.slice(0, 1) : [...NAMES, ...NAMES.slice(0, 5)]).map(member), drills: [], drillStats: { answered: mode === 'one' ? 1 : 1284, passed: 1 } },
      guarding: mode === 'one' ? [] : [{ circleId: 'wg', memberId: 'wgm', name: 'Nur Aisyah binte Mohamed Zulkifli', town: 'Choa Chu Kang', relation: 'Grandchild', openPause, drills: [], drillStats: { answered: 0, passed: 0 } }],
      townStats: null
    },
    'GET /pauses': list => mode === 'empty' ? [] : mode === 'one' ? [{ ...openPause, status: 'closed', outcome: 'safe', role: 'owner' }] : ['stopped', 'safe', 'lost'].map((o, i) => ({ ...openPause, id: 'wp' + i, status: 'closed', outcome: o, role: 'owner', created: ago(i * 60 * 24 * 40) })),
    'GET /pauses/stats': s => mode === 'empty' ? { ...s, pauses: 0, stopped: 0, medianResponseSeconds: null, circles: 0 } : mode === 'one' ? { ...s, pauses: 1, stopped: 1, medianResponseSeconds: 1, circles: 1 } : { ...s, pauses: 1284567, stopped: 1, medianResponseSeconds: 3725, circles: 0 }
  };

  function key(method, path) {
    const p = path.split('?')[0];
    if (method === 'GET' && /^\/posts\/(?!counts)[^/]+$/.test(p)) return 'GET /post';
    return method + ' ' + p;
  }

  if (mode === 'worst') {
    // Volunteers on duty (Check a message) and "volunteers answering" (Community) come from js/data.js.
    KW.VOLUNTEERS.splice(0, KW.VOLUNTEERS.length,
      { name: LONG_NAME, role: 'Digital Ambassador', area: 'Choa Chu Kang', langs: 'English, 华语, Melayu, தமிழ், Hokkien' },
      { name: 'Jo', role: 'Student Volunteer', area: 'Tampines', langs: 'English' },
      { name: 'Kavitha d/o Ramasamy Subramaniam', role: 'CC Scam-Buster', area: 'Tampines', langs: 'தமிழ்' });
  } else if (mode === 'empty') {
    KW.VOLUNTEERS.splice(0, KW.VOLUNTEERS.length);
  }

  window.KW_DEV = {
    mode,
    shape(method, path, data) {
      const fn = SHAPES[key(method, path)];
      if (!fn || data == null) return data;
      try { return fn(data); } catch (err) { console.warn('[dev-data]', path, err); return data; }
    }
  };

  /* The switch: plain chrome, fixed bottom-centre, not part of the design under test. */
  function addSwitch(active) {
    const build = () => {
      const bar = document.createElement('div');
      bar.setAttribute('role', 'group');
      bar.setAttribute('aria-label', 'Test data (dev only)');
      bar.style.cssText = 'position:fixed;left:50%;bottom:12px;transform:translateX(-50%);z-index:9999;display:flex;gap:2px;padding:3px;border-radius:999px;background:#d4d4d4;font:12px/1 system-ui,sans-serif;box-shadow:0 1px 4px rgba(0,0,0,.2)';
      [['demo', 'Demo'], ['worst', 'Worst case'], ['empty', 'Empty'], ['one', 'One']].forEach(([value, label]) => {
        const b = document.createElement('button');
        b.type = 'button';
        b.textContent = label;
        b.style.cssText = `border:0;border-radius:999px;padding:7px 12px;cursor:pointer;font:inherit;color:#111;background:${value === active ? '#fff' : 'transparent'}`;
        b.addEventListener('click', () => {
          location.href = location.pathname + '?data=' + value + location.hash;
        });
        bar.appendChild(b);
      });
      document.body.appendChild(bar);
    };
    if (document.body) build(); else document.addEventListener('DOMContentLoaded', build);
  }
})();
