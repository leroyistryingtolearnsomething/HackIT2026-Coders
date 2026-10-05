/* Kampung Watch — single-page app combining:
   1. Community forum (Reddit-style posts, votes, comments, photos, polls)
   2. Neighbourhood Scam Radar (live map + verified feed + area alerts)
   3. Ask a Neighbour (one-tap "Is this a scam?" to volunteers, call-back)
   4. Learn (short courses, quizzes, "Spot the scam" game) */
(() => {
  'use strict';

  const KW = window.KW;
  const STORE_KEY = 'kampungwatch.state';
  const main = document.getElementById('main');

  /* ---------- helpers ---------- */
  const $ = (sel, el = document) => el.querySelector(sel);
  const $$ = (sel, el = document) => [...el.querySelectorAll(sel)];
  const esc = s => String(s ?? '').replace(/[&<>"']/g, c =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const nl2br = s => esc(s).replace(/\n/g, '<br>');
  const uid = () => Math.random().toString(36).slice(2, 10);
  const now = () => new Date().toISOString();
  const hoursSince = iso => (Date.now() - new Date(iso).getTime()) / 3600e3;
  const pick = arr => arr[Math.floor(Math.random() * arr.length)];
  const byNewest = (a, b) => new Date(b.created) - new Date(a.created);

  function timeAgo(iso) {
    const s = Math.max(0, (Date.now() - new Date(iso).getTime()) / 1000);
    if (s < 45) return 'just now';
    if (s < 3600) return Math.round(s / 60) + ' min ago';
    if (s < 86400) return Math.round(s / 3600) + 'h ago';
    const d = Math.round(s / 86400);
    return d === 1 ? 'yesterday' : d + ' days ago';
  }

  function maskPersonal(text) {
    return text
      .replace(/\b[689]\d{3}[ -]?\d{4}\b/g, '[phone hidden]')
      .replace(/[\w.+-]+@[\w-]+\.[\w.]+/g, '[email hidden]')
      .replace(/\b[STFGM]\d{7}[A-Z]\b/gi, '[NRIC hidden]');
  }

  /* ---------- state ---------- */
  let state = loadState();

  function loadState() {
    try {
      const raw = localStorage.getItem(STORE_KEY);
      if (raw) {
        const s = JSON.parse(raw);
        if (s && s.version === KW.VERSION) return s;
      }
    } catch (e) { /* fall through to seed */ }
    return KW.seed();
  }

  function save() {
    try {
      localStorage.setItem(STORE_KEY, JSON.stringify(state));
    } catch (e) {
      toast('Could not save — your browser storage is full. Try a smaller photo.', 'warn');
    }
  }

  /* ---------- UI primitives ---------- */
  function toast(msg, type = 'info', { link, linkText } = {}) {
    const el = document.createElement('div');
    el.className = 'toast toast-' + type;
    el.innerHTML = `<span>${esc(msg)}</span>${link ? `<a href="${esc(link)}">${esc(linkText || 'View')}</a>` : ''}`;
    $('#toasts').appendChild(el);
    requestAnimationFrame(() => el.classList.add('show'));
    setTimeout(() => { el.classList.remove('show'); setTimeout(() => el.remove(), 300); }, 5000);
  }

  let lastFocus = null;
  function openModal({ title, body, onMount, wide = false }) {
    const root = $('#modal');
    lastFocus = document.activeElement;
    root.innerHTML = `
      <div class="modal-backdrop" data-close></div>
      <div class="modal-dialog ${wide ? 'wide' : ''}" role="dialog" aria-modal="true" aria-labelledby="modalTitle">
        <header class="modal-head">
          <h2 id="modalTitle">${esc(title)}</h2>
          <button class="icon-btn" data-close aria-label="Close">✕</button>
        </header>
        <div class="modal-body">${body}</div>
      </div>`;
    root.hidden = false;
    document.body.classList.add('modal-open');
    $$('[data-close]', root).forEach(b => b.addEventListener('click', closeModal));
    if (onMount) onMount($('.modal-body', root));
    const first = $('input:not([type=hidden]), select, textarea, button:not([data-close])', $('.modal-body', root));
    if (first) first.focus();
  }

  function closeModal() {
    const root = $('#modal');
    root.hidden = true;
    root.innerHTML = '';
    document.body.classList.remove('modal-open');
    if (lastFocus) lastFocus.focus();
  }

  document.addEventListener('keydown', e => {
    if (e.key === 'Escape' && !$('#modal').hidden) closeModal();
  });

  /* Downscale an uploaded image so it fits comfortably in localStorage. */
  function readImage(file, max = 900) {
    return new Promise((resolve, reject) => {
      if (!file) return resolve(null);
      if (!file.type.startsWith('image/')) return reject(new Error('Please choose an image file.'));
      const reader = new FileReader();
      reader.onerror = () => reject(new Error('Could not read that file.'));
      reader.onload = () => {
        const img = new Image();
        img.onerror = () => reject(new Error('Could not read that image.'));
        img.onload = () => {
          const scale = Math.min(1, max / Math.max(img.width, img.height));
          const canvas = document.createElement('canvas');
          canvas.width = Math.round(img.width * scale);
          canvas.height = Math.round(img.height * scale);
          canvas.getContext('2d').drawImage(img, 0, 0, canvas.width, canvas.height);
          resolve(canvas.toDataURL('image/jpeg', 0.8));
        };
        img.src = reader.result;
      };
      reader.readAsDataURL(file);
    });
  }

  /* Wires a file input to a preview box; returns a getter for the current image. */
  function bindImageInput(input, preview) {
    let data = null;
    input.addEventListener('change', async () => {
      try {
        data = await readImage(input.files[0]);
        preview.innerHTML = data
          ? `<img src="${esc(data)}" alt="Uploaded screenshot preview"><button type="button" class="btn btn-ghost btn-sm">Remove</button>`
          : '';
        const rm = $('button', preview);
        if (rm) rm.addEventListener('click', () => { data = null; input.value = ''; preview.innerHTML = ''; });
      } catch (err) {
        data = null; input.value = ''; preview.innerHTML = '';
        toast(err.message, 'warn');
      }
    });
    return () => data;
  }

  function townOptions(selected = '', includeAll = false, allLabel = 'All areas') {
    return (includeAll ? `<option value="">${allLabel}</option>` : '') +
      Object.keys(KW.TOWNS).map(t => `<option ${t === selected ? 'selected' : ''}>${esc(t)}</option>`).join('');
  }

  function onlineVolunteers() {
    // Deterministic-ish number that drifts through the day, for the demo.
    const h = new Date().getHours();
    return 6 + ((h * 7) % 11);
  }

  /* ---------- red-flag analysis ---------- */
  function analyse(text) {
    const flags = KW.FLAG_RULES.filter(r => r.re.test(text));
    const level = flags.length >= 3 ? 'high' : flags.length >= 1 ? 'medium' : 'low';
    return { flags, level };
  }

  const RISK_COPY = {
    high: ['High risk', 'This looks very much like a scam. Don’t click, reply or pay.'],
    medium: ['Be careful', 'There are warning signs. Check through official channels first.'],
    low: ['No obvious red flags', 'That doesn’t mean it’s safe — ask a volunteer if you’re unsure.']
  };

  function flagsHTML(text) {
    if (!text.trim()) return '<p class="muted small">Red flags will appear here as you type.</p>';
    const { flags, level } = analyse(text);
    const [head, sub] = RISK_COPY[level];
    return `
      <div class="risk risk-${level}"><strong>${head}</strong><span>${sub}</span></div>
      ${flags.length ? `<ul class="flag-list">${flags.map(f => `
        <li><span aria-hidden="true">🚩</span><div><strong>${esc(f.label)}</strong><small>${esc(f.tip)}</small></div></li>`).join('')}</ul>` : ''}`;
  }

  /* ---------- settings & header ---------- */
  function applySettings() {
    document.documentElement.classList.toggle('large-text', state.settings.largeText);
    document.body.classList.toggle('volunteer-on', state.settings.volunteer);
    $('#textSizeBtn').setAttribute('aria-pressed', String(state.settings.largeText));
    $('#volunteerToggle').checked = state.settings.volunteer;
  }

  $('#textSizeBtn').addEventListener('click', () => {
    state.settings.largeText = !state.settings.largeText;
    save(); applySettings();
  });

  $('#volunteerToggle').addEventListener('change', e => {
    state.settings.volunteer = e.target.checked;
    save(); applySettings();
    toast(state.settings.volunteer
      ? 'Volunteer mode on — you can now answer cases and verify reports.'
      : 'Back to resident view.');
    router();
  });

  $('#navToggle').addEventListener('click', () => {
    const nav = $('#siteNav');
    const open = nav.classList.toggle('open');
    $('#navToggle').setAttribute('aria-expanded', String(open));
  });

  $('#resetDemo').addEventListener('click', () => {
    if (!confirm('Reset all demo data? Your posts, cases and progress will be cleared.')) return;
    localStorage.removeItem(STORE_KEY);
    state = KW.seed();
    save(); applySettings();
    location.hash = '#/home';
    router();
    toast('Demo data reset.');
  });

  $('#footerHelplines').innerHTML = KW.HELPLINES.map(h =>
    `<li><a href="tel:${h.number.replace(/\s/g, '')}"><strong>${esc(h.number)}</strong> ${esc(h.label)}</a><small>${esc(h.note)}</small></li>`).join('');

  /* ---------- router ---------- */
  let map = null, markerLayer = null;

  const routes = {
    home: renderHome,
    ask: renderAsk,
    radar: renderRadar,
    community: renderCommunity,
    learn: renderLearn
  };

  function router() {
    const parts = location.hash.replace(/^#\/?/, '').split('/').filter(Boolean).map(decodeURIComponent);
    const route = routes[parts[0]] ? parts[0] : 'home';
    if (map) { map.remove(); map = null; markerLayer = null; }
    $$('#siteNav a').forEach(a => a.classList.toggle('active', a.dataset.route === route));
    $('#siteNav').classList.remove('open');
    $('#navToggle').setAttribute('aria-expanded', 'false');
    $('#fab').hidden = route === 'ask';
    main.innerHTML = '';
    routes[route](...parts.slice(1));
    window.scrollTo({ top: 0, behavior: 'instant' });
  }

  window.addEventListener('hashchange', router);

  /* =========================================================
     HOME
     ========================================================= */
  function renderHome() {
    const verified = state.reports.filter(r => r.status === 'verified').sort(byNewest);
    const myTown = state.subscription.town;
    const nearby = myTown
      ? [...verified.filter(r => r.town === myTown), ...verified.filter(r => r.town !== myTown)]
      : verified;
    const weekReports = state.reports.filter(r => hoursSince(r.created) < 168);
    const residentsWarned = weekReports.reduce((n, r) => n + r.count, 0);
    const hot = [...state.posts].sort(hotSort).slice(0, 3);
    const nextCourse = KW.COURSES.find(c => !courseProgress(c.id).passed) || KW.COURSES[0];
    const np = courseProgress(nextCourse.id);

    main.innerHTML = `
      <section class="hero">
        <div class="hero-text">
          <p class="eyebrow">Your neighbourhood scam help desk</p>
          <h1>Not sure if it’s a scam? <span>Ask a neighbour.</span></h1>
          <p class="lead">Check suspicious messages with trained community volunteers, see which scams are spreading in your estate, and learn together — before anyone loses money.</p>
          <div class="hero-cta">
            <a class="btn btn-danger btn-xl" href="#/ask">🚩 Is this a scam?</a>
            <a class="btn btn-outline btn-xl" href="#/radar">📍 Scams near me</a>
          </div>
          <p class="hero-note"><span class="dot-live" aria-hidden="true"></span> <strong>${onlineVolunteers()}</strong> volunteers online now · typical reply in <strong>~4 min</strong></p>
        </div>
        <div class="card quick-check">
          <h2>Instant red-flag check</h2>
          <label for="qcText" class="muted">Paste the message you received</label>
          <textarea id="qcText" rows="5" placeholder="e.g. Your parcel is on hold. Pay $1.99 within 24 hours at sgpost-track.top"></textarea>
          <div id="qcResult" class="flag-result" aria-live="polite">${flagsHTML('')}</div>
          <button class="btn btn-primary btn-block" id="qcSend">Ask a volunteer to check →</button>
        </div>
      </section>

      <section class="stats" aria-label="Community activity">
        <div class="stat"><strong>${weekReports.length}</strong><span>scam reports this week</span></div>
        <div class="stat"><strong>${residentsWarned}</strong><span>residents flagged the same scams</span></div>
        <div class="stat"><strong>${state.posts.length * 37 + state.cases.length}</strong><span>questions answered by volunteers</span></div>
        <div class="stat"><strong>${KW.VOLUNTEERS.length * 41}</strong><span>trained Digital Ambassadors & RC volunteers</span></div>
      </section>

      <section class="home-grid">
        <div class="card">
          <div class="card-head"><h2>⚠️ Scam alerts ${myTown ? 'near ' + esc(myTown) : 'near you'}</h2><a href="#/radar">See map →</a></div>
          ${nearby.slice(0, 3).map(reportMini).join('')}
          ${myTown ? '' : `<p class="muted small">Tip: set your area on <a href="#/radar">Scam Radar</a> to get alerts for your estate.</p>`}
        </div>
        <div class="card">
          <div class="card-head"><h2>💬 Hot in the community</h2><a href="#/community">Join in →</a></div>
          ${hot.map(p => `
            <a class="mini-item" href="#/community/post/${p.id}">
              <span class="flair flair-${p.flair}">${esc(flairLabel(p.flair))}</span>
              <strong>${esc(p.title)}</strong>
              <small class="muted">▲ ${postScore(p)} · ${countComments(p.comments)} comments</small>
            </a>`).join('')}
        </div>
        <div class="card">
          <div class="card-head"><h2>🎓 Keep learning</h2><a href="#/learn">All courses →</a></div>
          <a class="course-feature" href="#/learn/course/${nextCourse.id}">
            <span class="course-icon" aria-hidden="true">${nextCourse.icon}</span>
            <strong>${esc(nextCourse.title)}</strong>
            <small class="muted">${nextCourse.minutes} min · ${esc(nextCourse.level)}</small>
            ${progressBar(np.pct)}
          </a>
          <a class="btn btn-ghost btn-block" href="#/learn">🎯 Play “Spot the scam”</a>
        </div>
      </section>

      <section class="how">
        <h2>How Kampung Watch works</h2>
        <ol class="how-grid">
          <li><span class="how-icon">🚩</span><strong>Ask</strong><p>Tap “Is this a scam?” and a trained volunteer replies within minutes — or calls you back.</p></li>
          <li><span class="how-icon">📍</span><strong>Report</strong><p>Flag scams you receive. CC and RC volunteers verify them so the radar stays trustworthy.</p></li>
          <li><span class="how-icon">🔔</span><strong>Get alerted</strong><p>Choose your estate and get a heads-up when a new scam wave hits your area.</p></li>
          <li><span class="how-icon">💬</span><strong>Discuss & learn</strong><p>Share stories, debate, and take bite-sized courses to protect yourself and your family.</p></li>
        </ol>
      </section>`;

    const qc = $('#qcText');
    qc.addEventListener('input', () => { $('#qcResult').innerHTML = flagsHTML(qc.value); });
    $('#qcSend').addEventListener('click', () => {
      state.draft = qc.value;
      save();
      location.hash = '#/ask';
    });
  }

  function reportMini(r) {
    return `
      <div class="mini-item">
        <span class="tag">${esc(r.type)}</span>
        <strong>${esc(r.title)}</strong>
        <small class="muted">📍 ${esc(r.town)} · ${timeAgo(r.created)} · ${r.count} reports</small>
      </div>`;
  }

  /* =========================================================
     ASK A NEIGHBOUR
     ========================================================= */
  function renderAsk() {
    const draft = state.draft || '';
    if (draft) { state.draft = ''; save(); }

    main.innerHTML = `
      <div class="page-head">
        <h1>🚩 Ask a Neighbour</h1>
        <p>Send anything suspicious to trained community volunteers — Digital Ambassadors, RC members and student volunteers. Most replies arrive within minutes.</p>
      </div>

      <div class="ask-layout">
        <form class="card ask-form" id="askForm" novalidate>
          <fieldset>
            <legend>1. How did you receive it?</legend>
            <div class="chips">
              ${KW.CHANNELS.map((c, i) => `
                <label class="chip"><input type="radio" name="channel" value="${esc(c)}" ${i === 0 ? 'checked' : ''}><span>${esc(c)}</span></label>`).join('')}
            </div>
          </fieldset>

          <label for="askText" class="field-label">2. Paste or describe the message</label>
          <textarea id="askText" rows="6" placeholder="Copy the message here, or describe the call (who they said they were, what they asked for)…">${esc(draft)}</textarea>
          <div id="askFlags" class="flag-result" aria-live="polite">${flagsHTML(draft)}</div>

          <label for="askImg" class="field-label">3. Add a screenshot <span class="muted">(optional)</span></label>
          <input type="file" id="askImg" accept="image/*">
          <div class="img-preview" id="askImgPrev"></div>

          <details class="callback" id="callbackBox">
            <summary>📞 I prefer to talk — request a call back</summary>
            <div class="callback-grid">
              <label>Your name<input type="text" id="cbName" autocomplete="given-name"></label>
              <label>Phone number<input type="tel" id="cbPhone" inputmode="tel" autocomplete="tel" placeholder="8123 4567"></label>
              <label>Language
                <select id="cbLang"><option>English</option><option>华语 (Mandarin)</option><option>Bahasa Melayu</option><option>தமிழ் (Tamil)</option><option>Hokkien / Teochew</option></select>
              </label>
            </div>
          </details>

          <button class="btn btn-danger btn-lg btn-block" type="submit">Send to a volunteer</button>
          <p class="muted small">🔒 Only verified volunteers see your case. Never send passwords, OTPs or full card numbers.</p>
        </form>

        <aside class="ask-side">
          <div class="card talk-card">
            <h2>Need to talk right now?</h2>
            ${KW.HELPLINES.map(h => `
              <a class="call-btn" href="tel:${h.number.replace(/\s/g, '')}">
                <span class="call-num">📞 ${esc(h.number)}</span>
                <span><strong>${esc(h.label)}</strong><small>${esc(h.note)}</small></span>
              </a>`).join('')}
          </div>
          <div class="card">
            <h2>Volunteers online <span class="dot-live" aria-hidden="true"></span></h2>
            <ul class="vol-list">
              ${KW.VOLUNTEERS.slice(0, 4).map(v => `
                <li><span class="avatar" aria-hidden="true">${esc(v.name[0])}</span>
                <div><strong>${esc(v.name)}</strong><small>${esc(v.role)} · ${esc(v.area)}<br>${esc(v.langs)}</small></div></li>`).join('')}
            </ul>
            <p class="muted small">+ ${Math.max(0, onlineVolunteers() - 4)} more ready to help</p>
          </div>
          <div class="card">
            <h2>While you wait</h2>
            <ul class="tick-list">
              <li>Don’t click links or reply to the sender.</li>
              <li>Don’t transfer money or share OTPs.</li>
              <li>If you already paid, call your bank’s 24h hotline now.</li>
            </ul>
          </div>
        </aside>
      </div>

      <section class="cases-section">
        <div class="section-head">
          <h2 id="casesTitle">${state.settings.volunteer ? '🙋 Volunteer inbox' : 'My cases'}</h2>
          <span class="vol-only muted small">Replies you send here go to residents as a volunteer.</span>
        </div>
        <div id="caseList"></div>
      </section>`;

    const text = $('#askText');
    text.addEventListener('input', () => { $('#askFlags').innerHTML = flagsHTML(text.value); });
    const getImg = bindImageInput($('#askImg'), $('#askImgPrev'));

    $('#askForm').addEventListener('submit', e => {
      e.preventDefault();
      const body = text.value.trim();
      const image = getImg();
      if (!body && !image) {
        toast('Please paste the message or add a screenshot first.', 'warn');
        text.focus();
        return;
      }
      const wantsCall = $('#callbackBox').open && $('#cbPhone').value.trim();
      const { flags, level } = analyse(body);
      const c = {
        id: uid(), created: now(),
        channel: $('input[name=channel]:checked').value,
        text: body, image, flags: flags.map(f => f.id), level,
        status: 'waiting', verdict: null, volunteer: null,
        callback: wantsCall ? { name: $('#cbName').value.trim(), phone: $('#cbPhone').value.trim(), lang: $('#cbLang').value } : null,
        assignAt: Date.now() + 2500,
        replyAt: Date.now() + 9000,
        followUpAt: null,
        messages: [{ from: 'system', body: 'Your case has been sent to volunteers near you.', at: now() }]
      };
      state.cases.unshift(c);
      save();
      toast('Sent! A volunteer will pick this up shortly.', 'ok');
      $('#askForm').reset();
      $('#askImgPrev').innerHTML = '';
      $('#askFlags').innerHTML = flagsHTML('');
      renderCaseList();
      $('#casesTitle').scrollIntoView({ behavior: 'smooth' });
    });

    renderCaseList();
  }

  const VERDICTS = {
    scam: ['🚩 Scam', 'danger'],
    suspicious: ['⚠️ Suspicious', 'warn'],
    safe: ['✅ Likely safe', 'ok']
  };

  function renderCaseList() {
    const list = $('#caseList');
    if (!list) return;
    // Preserve anything typed in reply boxes across re-renders.
    const drafts = {};
    $$('textarea[data-case]', list).forEach(t => { drafts[t.dataset.case] = t.value; });
    const focused = document.activeElement && document.activeElement.dataset ? document.activeElement.dataset.case : null;

    if (!state.cases.length) {
      list.innerHTML = `<div class="empty card"><p>No cases yet. When you send something to check, the conversation with your volunteer appears here.</p></div>`;
      return;
    }

    const vol = state.settings.volunteer;
    list.innerHTML = state.cases.map(c => {
      const status = { waiting: ['Waiting for volunteer', 'warn'], replied: ['Volunteer replied', 'info'], resolved: ['Resolved', 'ok'] }[c.status];
      return `
        <article class="card case" id="case-${c.id}">
          <header class="case-head">
            <div>
              <span class="pill pill-${status[1]}">${status[0]}</span>
              ${c.verdict ? `<span class="pill pill-${VERDICTS[c.verdict][1]}">${VERDICTS[c.verdict][0]}</span>` : ''}
              ${c.callback ? `<span class="pill pill-info">📞 Call-back requested</span>` : ''}
            </div>
            <small class="muted">${esc(c.channel)} · ${timeAgo(c.created)}</small>
          </header>
          <blockquote class="case-quote">${c.text ? nl2br(c.text) : '<em>(screenshot only)</em>'}</blockquote>
          ${c.image ? `<img class="case-img" src="${esc(c.image)}" alt="Screenshot attached to case">` : ''}
          <div class="thread">
            ${c.messages.map(m => `
              <div class="msg msg-${m.from}">
                ${m.from === 'vol' ? `<span class="msg-name">${esc(m.name)}</span>` : ''}
                <p>${nl2br(m.body)}</p>
                <time>${timeAgo(m.at)}</time>
              </div>`).join('')}
            ${c.status === 'waiting' && c.volunteer && !vol ? `<div class="msg msg-system typing">${esc(c.volunteer.name)} is typing<span class="dots"><i></i><i></i><i></i></span></div>` : ''}
          </div>
          ${c.status !== 'resolved' ? `
            ${vol ? `
              <div class="verdict-row" role="group" aria-label="Set verdict">
                <span class="muted small">Verdict:</span>
                ${Object.entries(VERDICTS).map(([k, [label]]) => `<button class="btn btn-sm ${c.verdict === k ? 'btn-primary' : 'btn-ghost'}" data-verdict="${k}" data-id="${c.id}">${label}</button>`).join('')}
              </div>` : ''}
            <form class="reply-form" data-id="${c.id}">
              <label class="sr-only" for="reply-${c.id}">Reply</label>
              <textarea id="reply-${c.id}" data-case="${c.id}" rows="2" placeholder="${vol ? 'Reply to the resident as a volunteer…' : 'Add more details or ask a follow-up…'}">${esc(drafts[c.id] || '')}</textarea>
              <button class="btn btn-primary" type="submit">Send</button>
            </form>` : ''}
          <footer class="case-actions">
            ${c.status !== 'resolved' ? `<button class="btn btn-ghost btn-sm" data-resolve="${c.id}">✔ Mark resolved</button>` : ''}
            ${c.shared ? `<a class="btn btn-ghost btn-sm" href="#/community/post/${c.shared}">💬 View community post</a>`
              : `<button class="btn btn-ghost btn-sm" data-share="${c.id}">💬 Share anonymously with the community</button>`}
            ${c.verdict === 'scam' ? `<button class="btn btn-ghost btn-sm" data-radar="${c.id}">📍 Report to Scam Radar</button>` : ''}
          </footer>
        </article>`;
    }).join('');

    if (focused) {
      const t = $(`textarea[data-case="${focused}"]`, list);
      if (t) { t.focus(); t.setSelectionRange(t.value.length, t.value.length); }
    }

    $$('.reply-form', list).forEach(f => f.addEventListener('submit', e => {
      e.preventDefault();
      const ta = $('textarea', f);
      const body = ta.value.trim();
      if (!body) return;
      const c = state.cases.find(x => x.id === f.dataset.id);
      ta.value = '';
      if (state.settings.volunteer) {
        c.messages.push({ from: 'vol', name: 'You (Volunteer)', body, at: now() });
        c.status = 'replied';
        c.replyAt = null;
        c.volunteer = c.volunteer || { name: 'You (Volunteer)' };
      } else {
        c.messages.push({ from: 'me', body, at: now() });
        if (c.status === 'replied') c.followUpAt = Date.now() + 5000;
      }
      save(); renderCaseList();
    }));

    $$('[data-verdict]', list).forEach(b => b.addEventListener('click', () => {
      const c = state.cases.find(x => x.id === b.dataset.id);
      c.verdict = b.dataset.verdict;
      save(); renderCaseList();
    }));

    $$('[data-resolve]', list).forEach(b => b.addEventListener('click', () => {
      const c = state.cases.find(x => x.id === b.dataset.resolve);
      c.status = 'resolved';
      c.replyAt = c.followUpAt = null;
      c.messages.push({ from: 'system', body: 'Case marked as resolved. Thanks for checking before acting!', at: now() });
      save(); renderCaseList();
    }));

    $$('[data-share]', list).forEach(b => b.addEventListener('click', () => {
      const c = state.cases.find(x => x.id === b.dataset.share);
      const post = {
        id: 'p' + uid(), flair: 'ask', author: state.me.handle, created: now(), votes: 1,
        title: `Is this ${c.channel.toLowerCase()} message a scam?`,
        body: maskPersonal(c.text || '(see screenshot)'),
        image: c.image,
        poll: defaultPoll('ask'),
        verdict: c.verdict ? { result: c.verdict === 'safe' ? 'legit' : 'scam', by: c.volunteer ? c.volunteer.name : 'Volunteer' } : null,
        comments: []
      };
      state.posts.unshift(post);
      c.shared = post.id;
      save(); renderCaseList();
      toast('Shared to the community with personal details hidden.', 'ok', { link: '#/community/post/' + post.id, linkText: 'Open post' });
    }));

    $$('[data-radar]', list).forEach(b => b.addEventListener('click', () => {
      const c = state.cases.find(x => x.id === b.dataset.radar);
      openReportModal({ desc: maskPersonal(c.text), channel: c.channel, image: c.image });
    }));
  }

  /* Simulated volunteer behaviour so the prototype feels live. */
  function volunteerReply(c) {
    const flags = KW.FLAG_RULES.filter(r => c.flags.includes(r.id));
    const flagText = flags.map(f => '• ' + f.label).join('\n');
    const greet = c.callback ? `Hi ${c.callback.name || 'there'}! ` : 'Hi! ';
    let body, verdict;
    if (c.level === 'high') {
      verdict = 'scam';
      body = `${greet}Thanks for checking with us first 👍 This looks like a scam. I noticed:\n${flagText}\n\nPlease don’t click any links, reply or transfer money. Block the sender and report it in the ScamShield app. If you’ve already shared bank details, call your bank’s 24-hour hotline right away.`;
    } else if (c.level === 'medium') {
      verdict = 'suspicious';
      body = `${greet}There are some warning signs here:\n${flagText}\n\nDon’t act on it yet. Contact the organisation directly using the number on their official website or the back of your card — not the one in the message. Happy to help you check further!`;
    } else {
      verdict = c.text ? 'safe' : null;
      body = `${greet}I don’t see obvious red flags${c.text ? '' : ' yet — could you describe what the message says'}. Stay careful though: if they later ask for money, OTPs or personal details, that’s a scam sign. Can you tell me who sent it and whether there’s a link?`;
    }
    if (c.callback) body += `\n\nI’ll call you at ${c.callback.phone} in ${c.callback.lang} within 15 minutes.`;
    return { body, verdict };
  }

  function notify(title, body, link) {
    toast(`${title}: ${body}`, 'info', { link, linkText: 'Open' });
    if ('Notification' in window && Notification.permission === 'granted' && document.hidden) {
      try { new Notification(title, { body }); } catch (e) { /* some browsers need a service worker */ }
    }
  }

  function tickCases() {
    const t = Date.now();
    let changed = false;
    state.cases.forEach(c => {
      if (c.status === 'waiting' && !c.volunteer && c.assignAt && t >= c.assignAt) {
        c.volunteer = pick(KW.VOLUNTEERS);
        c.messages.push({ from: 'system', body: `${c.volunteer.name} (${c.volunteer.role}, ${c.volunteer.area}) has picked up your case.`, at: now() });
        changed = true;
      }
      if (c.status === 'waiting' && c.replyAt && t >= c.replyAt) {
        const { body, verdict } = volunteerReply(c);
        c.messages.push({ from: 'vol', name: `${c.volunteer.name} · ${c.volunteer.role}`, body, at: now() });
        c.verdict = verdict;
        c.status = 'replied';
        c.replyAt = null;
        changed = true;
        if (!location.hash.startsWith('#/ask')) notify(`${c.volunteer.name} replied`, 'Your “Is this a scam?” case has an answer.', '#/ask');
      }
      if (c.followUpAt && t >= c.followUpAt) {
        c.followUpAt = null;
        if (!state.settings.volunteer && c.volunteer) {
          c.messages.push({ from: 'vol', name: `${c.volunteer.name} · ${c.volunteer.role}`,
            body: 'Thanks for the extra info! My advice stays the same — don’t share OTPs or send money. If you’re still unsure, call the ScamShield Helpline at 1799 and they can check with you.', at: now() });
          changed = true;
        }
      }
    });
    if (changed) { save(); renderCaseList(); }
  }

  /* =========================================================
     SCAM RADAR
     ========================================================= */
  const radarFilter = { town: '', type: '', days: 30, verifiedOnly: false };
  let demoWaveSent = false;

  function filteredReports() {
    return state.reports
      .filter(r => !radarFilter.town || r.town === radarFilter.town)
      .filter(r => !radarFilter.type || r.type === radarFilter.type)
      .filter(r => !radarFilter.days || hoursSince(r.created) <= radarFilter.days * 24)
      .filter(r => !radarFilter.verifiedOnly || r.status === 'verified')
      .sort(byNewest);
  }

  function renderRadar() {
    const sub = state.subscription;
    main.innerHTML = `
      <div class="page-head page-head-row">
        <div>
          <h1>📍 Neighbourhood Scam Radar</h1>
          <p>A live, anonymised map of scams reported by residents. Reports are verified by Community Centre and RC volunteers so the feed stays trustworthy — not rumour-filled.</p>
        </div>
        <button class="btn btn-danger btn-lg" id="reportBtn">+ Report a scam</button>
      </div>

      <div class="card alert-sub">
        <div>
          <strong>🔔 Scam alerts for my area</strong>
          <p class="muted small">${sub.enabled ? `You’ll be alerted when a verified scam wave hits <strong>${esc(sub.town)}</strong>.` : 'Pick your estate to get a push alert when a new scam wave is verified there.'}</p>
        </div>
        <div class="alert-sub-controls">
          <label class="sr-only" for="subTown">My area</label>
          <select id="subTown">${townOptions(sub.town, true, 'Choose your area…')}</select>
          ${sub.enabled
            ? `<button class="btn btn-ghost" id="subOff">Turn off</button><button class="btn btn-ghost" id="subTest">Send test alert</button>`
            : `<button class="btn btn-primary" id="subOn">Turn on alerts</button>`}
        </div>
      </div>

      <div class="radar-stats" id="radarStats"></div>

      <div class="filters card" role="search">
        <label>Area<select id="fTown">${townOptions(radarFilter.town, true)}</select></label>
        <label>Scam type<select id="fType"><option value="">All types</option>${KW.SCAM_TYPES.map(t => `<option ${t === radarFilter.type ? 'selected' : ''}>${esc(t)}</option>`).join('')}</select></label>
        <label>Period<select id="fDays">
          <option value="1" ${radarFilter.days === 1 ? 'selected' : ''}>Last 24 hours</option>
          <option value="7" ${radarFilter.days === 7 ? 'selected' : ''}>Last 7 days</option>
          <option value="30" ${radarFilter.days === 30 ? 'selected' : ''}>Last 30 days</option>
          <option value="0" ${radarFilter.days === 0 ? 'selected' : ''}>All time</option>
        </select></label>
        <label class="check"><input type="checkbox" id="fVerified" ${radarFilter.verifiedOnly ? 'checked' : ''}> Verified only</label>
      </div>

      <div class="radar-layout">
        <div class="card map-card">
          <div id="map" aria-label="Map of scam reports in Singapore"></div>
          <div class="legend">
            <span><i class="lg lg-verified"></i>Verified scam wave</span>
            <span><i class="lg lg-pending"></i>Awaiting verification</span>
            <span class="muted">Bigger circle = more residents affected</span>
          </div>
        </div>
        <div class="feed" id="radarFeed" aria-live="polite"></div>
      </div>`;

    $('#reportBtn').addEventListener('click', () => openReportModal());

    const subOn = $('#subOn');
    if (subOn) subOn.addEventListener('click', async () => {
      const town = $('#subTown').value;
      if (!town) { toast('Choose your area first.', 'warn'); $('#subTown').focus(); return; }
      if ('Notification' in window && Notification.permission === 'default') {
        try { await Notification.requestPermission(); } catch (e) { /* ignore */ }
      }
      state.subscription = { town, enabled: true };
      save();
      toast(`Alerts on for ${town}.`, 'ok');
      renderRadar();
      scheduleDemoWave();
    });
    const subOff = $('#subOff');
    if (subOff) subOff.addEventListener('click', () => {
      state.subscription.enabled = false; save(); renderRadar();
    });
    const subTest = $('#subTest');
    if (subTest) subTest.addEventListener('click', () => pushAlert({
      id: null, town: state.subscription.town, title: 'This is a test alert — you’re all set!', type: 'Test'
    }));
    $('#subTown').addEventListener('change', e => {
      if (state.subscription.enabled && e.target.value) {
        state.subscription.town = e.target.value; save(); renderRadar();
      }
    });

    const bind = (id, key, cast) => $(id).addEventListener('change', e => {
      radarFilter[key] = cast(e.target);
      updateRadar();
    });
    bind('#fTown', 'town', el => el.value);
    bind('#fType', 'type', el => el.value);
    bind('#fDays', 'days', el => Number(el.value));
    bind('#fVerified', 'verifiedOnly', el => el.checked);

    initMap();
    updateRadar();
  }

  function updateRadar() {
    const reports = filteredReports();
    drawMarkers(reports);
    renderRadarStats(reports);
    renderRadarFeed(reports);
  }

  function renderRadarStats(reports) {
    const byTown = {};
    reports.forEach(r => { byTown[r.town] = (byTown[r.town] || 0) + r.count; });
    const top = Object.entries(byTown).sort((a, b) => b[1] - a[1])[0];
    const pending = reports.filter(r => r.status === 'pending').length;
    $('#radarStats').innerHTML = `
      <div class="stat"><strong>${reports.length}</strong><span>reports shown</span></div>
      <div class="stat"><strong>${reports.filter(r => r.status === 'verified').length}</strong><span>verified by CC/RC</span></div>
      <div class="stat"><strong>${pending}</strong><span>awaiting verification</span></div>
      <div class="stat"><strong>${top ? esc(top[0]) : '—'}</strong><span>most affected area</span></div>`;
  }

  const STATUS_BADGE = {
    verified: r => `<span class="pill pill-ok">✅ Verified by ${esc(r.verifiedBy || 'CC volunteer')}</span>`,
    pending: () => `<span class="pill pill-warn">⏳ Awaiting verification</span>`,
    rumour: r => `<span class="pill pill-muted">✖ Checked — not a scam wave${r.verifiedBy ? ' (' + esc(r.verifiedBy) + ')' : ''}</span>`
  };

  function renderRadarFeed(reports) {
    const feed = $('#radarFeed');
    if (!reports.length) {
      feed.innerHTML = `<div class="card empty"><p>No reports match these filters. 🎉</p><button class="btn btn-ghost" id="clearFilters">Clear filters</button></div>`;
      $('#clearFilters').addEventListener('click', () => {
        Object.assign(radarFilter, { town: '', type: '', days: 30, verifiedOnly: false });
        renderRadar();
      });
      return;
    }
    feed.innerHTML = reports.map(r => {
      const mine = state.confirmed[r.id];
      return `
        <article class="card report report-${r.status}" id="rep-${r.id}">
          <header>
            <span class="tag">${esc(r.type)}</span>
            <small class="muted">📍 ${esc(r.town)} · ${esc(r.channel)} · ${timeAgo(r.created)}</small>
          </header>
          <h3>${esc(r.title)}</h3>
          <p>${nl2br(r.desc)}</p>
          ${r.image ? `<img class="report-img" src="${esc(r.image)}" alt="Screenshot attached to report">` : ''}
          <div class="report-foot">
            ${STATUS_BADGE[r.status](r)}
            <span class="muted small">👥 ${r.count} resident${r.count === 1 ? '' : 's'} reported this</span>
          </div>
          <div class="report-actions">
            <button class="btn btn-sm ${mine ? 'btn-primary' : 'btn-ghost'}" data-confirm="${r.id}" aria-pressed="${!!mine}">${mine ? '✔ You got this too' : '✋ I got this too'}</button>
            <button class="btn btn-sm btn-ghost" data-discuss="${r.id}">💬 Discuss</button>
            <span class="vol-only vol-actions">
              ${r.status !== 'verified' ? `<button class="btn btn-sm btn-ok" data-verify="${r.id}">✅ Verify</button>` : ''}
              ${r.status !== 'rumour' ? `<button class="btn btn-sm btn-ghost" data-rumour="${r.id}">✖ Not a scam wave</button>` : ''}
            </span>
          </div>
        </article>`;
    }).join('');

    $$('[data-confirm]', feed).forEach(b => b.addEventListener('click', () => {
      const r = state.reports.find(x => x.id === b.dataset.confirm);
      if (state.confirmed[r.id]) { delete state.confirmed[r.id]; r.count--; }
      else { state.confirmed[r.id] = true; r.count++; }
      save(); updateRadar();
    }));

    $$('[data-discuss]', feed).forEach(b => b.addEventListener('click', () => {
      const r = state.reports.find(x => x.id === b.dataset.discuss);
      const existing = state.posts.find(p => p.reportId === r.id);
      if (existing) { location.hash = '#/community/post/' + existing.id; return; }
      const post = {
        id: 'p' + uid(), flair: 'alert', author: state.me.handle, created: now(), votes: 1,
        title: `${r.title} (${r.town})`, body: r.desc, image: r.image, reportId: r.id, comments: []
      };
      state.posts.unshift(post);
      save();
      location.hash = '#/community/post/' + post.id;
    }));

    $$('[data-verify]', feed).forEach(b => b.addEventListener('click', () => {
      const r = state.reports.find(x => x.id === b.dataset.verify);
      r.status = 'verified';
      r.verifiedBy = r.town + ' CC';
      save(); updateRadar();
      toast('Report verified and published to residents.', 'ok');
      if (state.subscription.enabled && state.subscription.town === r.town) pushAlert(r);
    }));

    $$('[data-rumour]', feed).forEach(b => b.addEventListener('click', () => {
      const r = state.reports.find(x => x.id === b.dataset.rumour);
      r.status = 'rumour';
      r.verifiedBy = r.town + ' CC';
      save(); updateRadar();
      toast('Marked as checked — not a scam wave.');
    }));
  }

  function initMap() {
    const el = $('#map');
    if (!window.L) {
      el.innerHTML = '<div class="map-fallback">The map couldn’t load (are you offline?). The report feed still works.</div>';
      return;
    }
    map = L.map(el, { scrollWheelZoom: false, minZoom: 10 }).setView([1.3521, 103.8198], 11);
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 18,
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
    }).addTo(map);
    markerLayer = L.layerGroup().addTo(map);
    map.on('popupopen', e => {
      const btn = e.popup.getElement().querySelector('[data-town]');
      if (btn) btn.addEventListener('click', () => {
        radarFilter.town = btn.dataset.town;
        $('#fTown').value = radarFilter.town;
        map.closePopup();
        updateRadar();
        $('#radarFeed').scrollIntoView({ behavior: 'smooth' });
      });
    });
  }

  function drawMarkers(reports) {
    if (!map || !markerLayer) return;
    markerLayer.clearLayers();
    const groups = {};
    reports.filter(r => r.status !== 'rumour').forEach(r => {
      const g = groups[r.town] || (groups[r.town] = { residents: 0, reports: [], verified: false, fresh: false });
      g.residents += r.count;
      g.reports.push(r);
      if (r.status === 'verified') g.verified = true;
      if (r.status === 'verified' && hoursSince(r.created) < 24) g.fresh = true;
    });
    Object.entries(groups).forEach(([town, g]) => {
      const coords = KW.TOWNS[town];
      if (!coords) return;
      const color = g.verified ? '#d64933' : '#e8a21c';
      L.circleMarker(coords, {
        radius: 9 + Math.sqrt(g.residents) * 2.4,
        color, weight: 2, fillColor: color, fillOpacity: 0.35,
        className: g.fresh ? 'pulse' : ''
      }).bindPopup(`
        <div class="map-pop">
          <strong>${esc(town)}</strong>
          <small>${g.reports.length} report${g.reports.length === 1 ? '' : 's'} · ${g.residents} residents</small>
          <ul>${g.reports.slice(0, 3).map(r => `<li>${esc(r.title)}</li>`).join('')}</ul>
          <button class="btn btn-sm btn-primary" data-town="${esc(town)}">Show ${esc(town)} reports</button>
        </div>`).addTo(markerLayer);
    });
  }

  function openReportModal(prefill = {}) {
    openModal({
      title: 'Report a scam',
      body: `
        <form id="reportForm" class="form-grid">
          <p class="muted small full">Your report is anonymous. A CC/RC volunteer will verify it before it’s shown as a confirmed scam wave.</p>
          <label>Your area<select id="rTown" required>${townOptions(state.subscription.town || '', true, 'Choose…')}</select></label>
          <label>How did it reach you?<select id="rChannel">${KW.CHANNELS.map(c => `<option ${c === prefill.channel ? 'selected' : ''}>${esc(c)}</option>`).join('')}</select></label>
          <label class="full">Type of scam<select id="rType">${KW.SCAM_TYPES.map(t => `<option>${esc(t)}</option>`).join('')}</select></label>
          <label class="full">Short summary<input id="rTitle" required maxlength="100" placeholder="e.g. Fake parcel SMS asking for $1.99"></label>
          <label class="full">What happened?<textarea id="rDesc" rows="4" placeholder="What did the message or caller say or ask for? Leave out your own personal details.">${esc(prefill.desc || '')}</textarea></label>
          <label class="full">Screenshot (optional)<input type="file" id="rImg" accept="image/*"></label>
          <div class="img-preview full" id="rImgPrev">${prefill.image ? `<img src="${esc(prefill.image)}" alt="Attached screenshot">` : ''}</div>
          <div class="full form-actions">
            <button type="button" class="btn btn-ghost" data-close>Cancel</button>
            <button type="submit" class="btn btn-danger">Submit report</button>
          </div>
        </form>`,
      onMount: body => {
        $$('[data-close]', body).forEach(b => b.addEventListener('click', closeModal));
        const getImg = bindImageInput($('#rImg', body), $('#rImgPrev', body));
        $('#reportForm', body).addEventListener('submit', e => {
          e.preventDefault();
          const town = $('#rTown', body).value;
          const title = $('#rTitle', body).value.trim();
          if (!town || !title) { toast('Please choose your area and add a short summary.', 'warn'); return; }
          const r = {
            id: 'r' + uid(), town, title,
            type: $('#rType', body).value,
            channel: $('#rChannel', body).value,
            desc: maskPersonal($('#rDesc', body).value.trim()),
            image: getImg() || prefill.image || null,
            count: 1, status: 'pending', created: now(), verifiedBy: null
          };
          state.reports.unshift(r);
          state.confirmed[r.id] = true;
          save();
          closeModal();
          toast(state.settings.volunteer
            ? 'Report submitted. As a volunteer you can verify it in the feed.'
            : 'Thank you! A CC/RC volunteer will verify your report. (Demo: turn on Volunteer mode to verify it yourself.)', 'ok');
          if (location.hash.startsWith('#/radar')) { radarFilter.town = ''; renderRadar(); }
          else location.hash = '#/radar';
        });
      }
    });
  }

  function pushAlert(r) {
    const banner = $('#alertBanner');
    banner.innerHTML = `
      <div class="container alert-inner">
        <span class="alert-icon" aria-hidden="true">⚠️</span>
        <div><strong>Scam alert for ${esc(r.town)}</strong><span>${esc(r.title)}</span></div>
        <a class="btn btn-sm btn-light" href="#/radar" id="alertView">View</a>
        <button class="icon-btn" id="alertClose" aria-label="Dismiss alert">✕</button>
      </div>`;
    banner.hidden = false;
    $('#alertClose').addEventListener('click', () => { banner.hidden = true; });
    $('#alertView').addEventListener('click', () => {
      banner.hidden = true;
      radarFilter.town = r.town;
      if (location.hash.startsWith('#/radar')) renderRadar();
    });
    if ('Notification' in window && Notification.permission === 'granted') {
      try { new Notification('Kampung Watch: scam alert for ' + r.town, { body: r.title }); } catch (e) { /* ignore */ }
    }
  }

  /* After subscribing, simulate a new verified scam wave arriving in that area. */
  const DEMO_WAVES = [
    { type: 'Fake delivery SMS', channel: 'SMS', title: 'New wave: fake “parcel on hold” SMS with payment link',
      desc: 'Several residents received SMS asking for a small redelivery fee via a link. Couriers do not collect fees through SMS links.' },
    { type: 'Fake friend call', channel: 'WhatsApp / Telegram', title: '“Hi Mum/Dad, this is my new number” messages',
      desc: 'Senders pretend to be a child with a new phone, then ask for urgent help paying a bill. Call your child on their old number.' },
    { type: 'Government official impersonation', channel: 'Phone call', title: 'Robocalls claiming to be from a ministry — “press 1”',
      desc: 'Recorded calls say there is an issue with your records and ask you to press 1. Hang up; agencies do not make such calls.' }
  ];

  function scheduleDemoWave() {
    if (demoWaveSent) return;
    demoWaveSent = true;
    setTimeout(() => {
      const sub = state.subscription;
      if (!sub.enabled || !sub.town) return;
      const w = pick(DEMO_WAVES);
      const r = { id: 'r' + uid(), town: sub.town, ...w, count: 6 + Math.floor(Math.random() * 12),
        status: 'verified', verifiedBy: sub.town + ' CC', created: now(), image: null };
      state.reports.unshift(r);
      save();
      pushAlert(r);
      if (location.hash.startsWith('#/radar')) updateRadar();
    }, 15000);
  }

  /* =========================================================
     COMMUNITY
     ========================================================= */
  const communityView = { flair: 'all', sort: 'hot', q: '' };

  const flairLabel = id => (KW.FLAIRS.find(f => f.id === id) || {}).label || id;
  const postScore = p => p.votes + (state.votes[p.id] || 0);
  const commentScore = c => c.votes + (state.commentVotes[c.id] || 0);
  const countComments = list => list.reduce((n, c) => n + 1 + countComments(c.replies || []), 0);
  const hotSort = (a, b) => hotRank(b) - hotRank(a);
  function hotRank(p) { return (postScore(p) + 1) / Math.pow(hoursSince(p.created) + 2, 1.4); }

  function defaultPoll(flair) {
    if (flair === 'ask') return { options: [{ label: '🚩 Scam', votes: 0 }, { label: '👍 Looks legit', votes: 0 }, { label: '🤔 Not sure', votes: 0 }] };
    if (flair === 'debate') return { options: [{ label: 'Agree', votes: 0 }, { label: 'Disagree', votes: 0 }, { label: 'It depends', votes: 0 }] };
    return null;
  }

  function renderCommunity(sub, id) {
    if (sub === 'post' && id) return renderPost(id);

    main.innerHTML = `
      <div class="page-head page-head-row">
        <div>
          <h1>💬 Community</h1>
          <p>Ask questions, share screenshots, swap tips and debate — neighbours and volunteers learning from each other.</p>
        </div>
        <button class="btn btn-primary btn-lg" id="newPostBtn">+ New post</button>
      </div>
      <div class="community-layout">
        <aside class="card side-nav" aria-label="Topics">
          <h2 class="side-h">Topics</h2>
          <button class="side-link ${communityView.flair === 'all' ? 'active' : ''}" data-flair="all">🏠 All posts</button>
          ${KW.FLAIRS.map(f => `<button class="side-link ${communityView.flair === f.id ? 'active' : ''}" data-flair="${f.id}">${f.icon} ${esc(f.label)}</button>`).join('')}
        </aside>

        <section class="feed-col">
          <div class="card feed-toolbar">
            <div class="sort-tabs" role="tablist" aria-label="Sort posts">
              ${['hot', 'new', 'top'].map(s => `<button role="tab" aria-selected="${communityView.sort === s}" class="${communityView.sort === s ? 'active' : ''}" data-sort="${s}">${{ hot: '🔥 Hot', new: '🆕 New', top: '⬆ Top' }[s]}</button>`).join('')}
            </div>
            <label class="sr-only" for="postSearch">Search posts</label>
            <input type="search" id="postSearch" placeholder="Search posts…" value="${esc(communityView.q)}">
          </div>
          <div id="postList"></div>
        </section>

        <aside class="community-side">
          <div class="card">
            <h2>Community guidelines</h2>
            <ol class="small rules">
              <li>Hide personal details — phone numbers, NRIC, addresses.</li>
              <li>Be kind. Anyone can be targeted.</li>
              <li>No selling, no links to unknown sites.</li>
              <li>Answers marked <span class="pill pill-ok">Volunteer</span> come from trained volunteers.</li>
            </ol>
          </div>
          <div class="card cta-card">
            <h2>Need an answer fast?</h2>
            <p class="small">Send it privately to a trained volunteer instead.</p>
            <a class="btn btn-danger btn-block" href="#/ask">🚩 Is this a scam?</a>
          </div>
          <div class="card">
            <h2>Top helpers this week</h2>
            <ul class="vol-list">
              ${KW.VOLUNTEERS.slice(0, 4).map((v, i) => `<li><span class="avatar" aria-hidden="true">${esc(v.name[0])}</span><div><strong>${esc(v.name)}</strong><small>${[48, 35, 29, 21][i]} helpful answers</small></div></li>`).join('')}
            </ul>
          </div>
        </aside>
      </div>`;

    $$('[data-flair]').forEach(b => b.addEventListener('click', () => {
      communityView.flair = b.dataset.flair;
      $$('[data-flair]').forEach(x => x.classList.toggle('active', x === b));
      renderPostList();
    }));
    $$('[data-sort]').forEach(b => b.addEventListener('click', () => {
      communityView.sort = b.dataset.sort;
      $$('[data-sort]').forEach(x => { x.classList.toggle('active', x === b); x.setAttribute('aria-selected', String(x === b)); });
      renderPostList();
    }));
    $('#postSearch').addEventListener('input', e => { communityView.q = e.target.value; renderPostList(); });
    $('#newPostBtn').addEventListener('click', () => openPostModal());
    renderPostList();
  }

  function renderPostList() {
    const q = communityView.q.trim().toLowerCase();
    let posts = state.posts
      .filter(p => communityView.flair === 'all' || p.flair === communityView.flair)
      .filter(p => !q || (p.title + ' ' + p.body).toLowerCase().includes(q));
    posts = posts.sort(
      communityView.sort === 'new' ? byNewest
        : communityView.sort === 'top' ? (a, b) => postScore(b) - postScore(a)
          : hotSort);
    const list = $('#postList');
    list.innerHTML = posts.length ? posts.map(postCard).join('')
      : `<div class="card empty"><p>No posts here yet. Be the first to start the conversation!</p></div>`;
    bindVotes(list, () => renderPostList());
  }

  function voteBox(kind, id, score) {
    const mine = (kind === 'post' ? state.votes : state.commentVotes)[id] || 0;
    return `
      <div class="vote ${kind === 'comment' ? 'vote-inline' : ''}">
        <button class="vote-btn ${mine === 1 ? 'up' : ''}" data-vote="1" data-kind="${kind}" data-id="${id}" aria-label="Upvote" aria-pressed="${mine === 1}">▲</button>
        <span class="vote-score">${score}</span>
        <button class="vote-btn ${mine === -1 ? 'down' : ''}" data-vote="-1" data-kind="${kind}" data-id="${id}" aria-label="Downvote" aria-pressed="${mine === -1}">▼</button>
      </div>`;
  }

  function bindVotes(scope, rerender) {
    $$('[data-vote]', scope).forEach(b => b.addEventListener('click', e => {
      e.preventDefault(); e.stopPropagation();
      const store = b.dataset.kind === 'post' ? state.votes : state.commentVotes;
      const v = Number(b.dataset.vote);
      store[b.dataset.id] = store[b.dataset.id] === v ? 0 : v;
      save(); rerender();
    }));
  }

  function verdictBadge(p) {
    if (!p.verdict) return '';
    return p.verdict.result === 'scam'
      ? `<span class="pill pill-danger">🚩 Volunteer verified: scam</span>`
      : `<span class="pill pill-ok">✅ Volunteer verified: legit</span>`;
  }

  function postCard(p) {
    const excerpt = p.body.length > 220 ? p.body.slice(0, 220) + '…' : p.body;
    return `
      <article class="card post">
        ${voteBox('post', p.id, postScore(p))}
        <div class="post-main">
          <div class="post-meta">
            <span class="flair flair-${p.flair}">${esc(flairLabel(p.flair))}</span>
            <small class="muted">by ${esc(p.author)} · ${timeAgo(p.created)}</small>
            ${verdictBadge(p)}
          </div>
          <h3><a href="#/community/post/${p.id}" class="stretched">${esc(p.title)}</a></h3>
          <p class="post-excerpt">${nl2br(excerpt)}</p>
          ${p.image ? `<img class="post-thumb" src="${esc(p.image)}" alt="Image attached to post">` : ''}
          <div class="post-foot muted small">
            <span>💬 ${countComments(p.comments)} comments</span>
            ${p.poll ? `<span>📊 ${p.poll.options.reduce((n, o) => n + o.votes, 0) + (state.pollVotes[p.id] != null ? 1 : 0)} votes</span>` : ''}
          </div>
        </div>
      </article>`;
  }

  function renderPost(id) {
    const p = state.posts.find(x => x.id === id);
    if (!p) {
      main.innerHTML = `<div class="card empty"><p>That post doesn’t exist anymore.</p><a class="btn btn-primary" href="#/community">Back to community</a></div>`;
      return;
    }
    const vol = state.settings.volunteer;
    main.innerHTML = `
      <a class="back-link" href="#/community">← Back to community</a>
      <article class="card post post-full">
        ${voteBox('post', p.id, postScore(p))}
        <div class="post-main">
          <div class="post-meta">
            <span class="flair flair-${p.flair}">${esc(flairLabel(p.flair))}</span>
            <small class="muted">by ${esc(p.author)} · ${timeAgo(p.created)}</small>
            ${verdictBadge(p)}
          </div>
          <h1>${esc(p.title)}</h1>
          <p class="post-body">${nl2br(p.body)}</p>
          ${p.image ? `<img class="post-img" src="${esc(p.image)}" alt="Image attached to post">` : ''}
          ${p.flair === 'ask' && p.body ? `<details class="post-check"><summary>🔎 Run the red-flag checker on this message</summary><div class="flag-result">${flagsHTML(p.body)}</div></details>` : ''}
          ${p.poll ? pollHTML(p) : ''}
          ${p.verdict ? `<p class="muted small">Verdict given by ${esc(p.verdict.by)}</p>` : ''}
          <div class="vol-only vol-actions">
            <span class="muted small">Volunteer verdict:</span>
            <button class="btn btn-sm btn-ghost" data-pverdict="scam">🚩 Scam</button>
            <button class="btn btn-sm btn-ghost" data-pverdict="legit">✅ Legit</button>
            ${p.verdict ? `<button class="btn btn-sm btn-ghost" data-pverdict="">Clear</button>` : ''}
          </div>
        </div>
      </article>

      <section class="card comments">
        <h2>${countComments(p.comments)} comments</h2>
        <form class="comment-form" id="commentForm">
          <label class="sr-only" for="commentText">Add a comment</label>
          <textarea id="commentText" rows="3" placeholder="${vol ? 'Answer as a volunteer…' : 'Share your thoughts or advice…'}"></textarea>
          <div class="form-actions"><span class="muted small">Commenting as <strong>${vol ? 'You (Volunteer)' : esc(state.me.handle)}</strong></span><button class="btn btn-primary" type="submit">Comment</button></div>
        </form>
        <div class="comment-tree">${p.comments.length ? commentsHTML(p.comments, 0) : '<p class="muted">No comments yet — be the first to help.</p>'}</div>
      </section>`;

    const rerender = () => {
      const y = window.scrollY;
      renderPost(id);
      window.scrollTo({ top: y, behavior: 'instant' });
    };
    bindVotes(main, rerender);

    $$('[data-poll]').forEach(b => b.addEventListener('click', () => {
      const i = Number(b.dataset.poll);
      state.pollVotes[p.id] = state.pollVotes[p.id] === i ? undefined : i;
      if (state.pollVotes[p.id] === undefined) delete state.pollVotes[p.id];
      save(); rerender();
    }));

    $$('[data-pverdict]').forEach(b => b.addEventListener('click', () => {
      p.verdict = b.dataset.pverdict ? { result: b.dataset.pverdict, by: 'You (Volunteer)' } : null;
      save(); rerender();
    }));

    $('#commentForm').addEventListener('submit', e => {
      e.preventDefault();
      const body = $('#commentText').value.trim();
      if (!body) return;
      p.comments.push(newComment(body));
      save(); rerender();
    });

    $$('[data-reply]').forEach(b => b.addEventListener('click', () => {
      const box = $('#rf-' + b.dataset.reply);
      box.hidden = !box.hidden;
      if (!box.hidden) $('textarea', box).focus();
    }));

    $$('.reply-inline').forEach(f => f.addEventListener('submit', e => {
      e.preventDefault();
      const body = $('textarea', f).value.trim();
      if (!body) return;
      const parent = findComment(p.comments, f.dataset.parent);
      if (parent) parent.replies.push(newComment(body));
      save(); rerender();
    }));
  }

  function newComment(body) {
    const vol = state.settings.volunteer;
    return { id: 'c' + uid(), author: vol ? 'You' : state.me.handle, role: vol ? 'Volunteer' : null, created: now(), votes: 1, body, replies: [] };
  }

  function findComment(list, id) {
    for (const c of list) {
      if (c.id === id) return c;
      const found = findComment(c.replies || [], id);
      if (found) return found;
    }
    return null;
  }

  function commentsHTML(list, depth) {
    return list.map(c => `
      <div class="comment ${depth ? 'nested' : ''}">
        <div class="comment-head">
          <span class="avatar avatar-sm" aria-hidden="true">${esc(c.author[0])}</span>
          <strong>${esc(c.author)}</strong>
          ${c.role ? `<span class="pill pill-ok">✔ ${esc(c.role)}</span>` : ''}
          <small class="muted">${timeAgo(c.created)}</small>
        </div>
        <p>${nl2br(c.body)}</p>
        <div class="comment-actions">
          ${voteBox('comment', c.id, commentScore(c))}
          <button class="link-btn" data-reply="${c.id}">↩ Reply</button>
        </div>
        <form class="reply-inline" id="rf-${c.id}" data-parent="${c.id}" hidden>
          <textarea rows="2" aria-label="Reply to ${esc(c.author)}" placeholder="Write a reply…"></textarea>
          <button class="btn btn-sm btn-primary" type="submit">Reply</button>
        </form>
        ${c.replies && c.replies.length ? `<div class="replies">${commentsHTML(c.replies, depth + 1)}</div>` : ''}
      </div>`).join('');
  }

  function pollHTML(p) {
    const mine = state.pollVotes[p.id];
    const counts = p.poll.options.map((o, i) => o.votes + (mine === i ? 1 : 0));
    const total = counts.reduce((a, b) => a + b, 0) || 1;
    return `
      <div class="poll">
        <p class="poll-q"><strong>${p.flair === 'ask' ? 'What does the community think?' : 'Where do you stand?'}</strong> <span class="muted small">${mine == null ? 'Tap to vote' : 'Tap again to undo'}</span></p>
        ${p.poll.options.map((o, i) => {
          const pct = Math.round(counts[i] / total * 100);
          return `
            <button class="poll-opt ${mine === i ? 'chosen' : ''}" data-poll="${i}" aria-pressed="${mine === i}">
              <span class="poll-bar" style="width:${pct}%"></span>
              <span class="poll-label">${esc(o.label)}</span>
              <span class="poll-pct">${pct}%</span>
            </button>`;
        }).join('')}
      </div>`;
  }

  function openPostModal() {
    openModal({
      title: 'Create a post',
      wide: true,
      body: `
        <form id="postForm" class="form-grid">
          <label class="full">Topic
            <select id="pFlair">${KW.FLAIRS.map(f => `<option value="${f.id}">${f.icon} ${esc(f.label)}</option>`).join('')}</select>
          </label>
          <label class="full">Title<input id="pTitle" maxlength="140" required placeholder="e.g. Is this WhatsApp job offer a scam?"></label>
          <label class="full">Details<textarea id="pBody" rows="6" placeholder="Paste the message or tell your story. Hide phone numbers and personal details."></textarea></label>
          <div class="full flag-result" id="pFlags"></div>
          <label class="full">Photo or screenshot (optional)<input type="file" id="pImg" accept="image/*"></label>
          <div class="img-preview full" id="pImgPrev"></div>
          <p class="full muted small" id="pPollNote">A community poll (Scam / Legit / Not sure) will be added automatically.</p>
          <div class="full form-actions">
            <button type="button" class="btn btn-ghost" data-close>Cancel</button>
            <button type="submit" class="btn btn-primary">Post</button>
          </div>
        </form>`,
      onMount: body => {
        $$('[data-close]', body).forEach(b => b.addEventListener('click', closeModal));
        const getImg = bindImageInput($('#pImg', body), $('#pImgPrev', body));
        const flair = $('#pFlair', body), text = $('#pBody', body);
        const update = () => {
          $('#pFlags', body).innerHTML = flair.value === 'ask' ? flagsHTML(text.value) : '';
          const note = $('#pPollNote', body);
          note.hidden = !defaultPoll(flair.value);
          note.textContent = flair.value === 'debate'
            ? 'A poll (Agree / Disagree / It depends) will be added automatically.'
            : 'A community poll (Scam / Legit / Not sure) will be added automatically.';
        };
        flair.addEventListener('change', update);
        text.addEventListener('input', update);
        update();
        $('#postForm', body).addEventListener('submit', e => {
          e.preventDefault();
          const title = $('#pTitle', body).value.trim();
          if (!title) { toast('Please add a title.', 'warn'); return; }
          const post = {
            id: 'p' + uid(), flair: flair.value, author: state.me.handle, created: now(), votes: 1,
            title, body: maskPersonal(text.value.trim()), image: getImg(),
            poll: defaultPoll(flair.value), comments: []
          };
          state.posts.unshift(post);
          state.votes[post.id] = 0;
          save();
          closeModal();
          toast('Posted! Neighbours and volunteers can now reply.', 'ok');
          location.hash = '#/community/post/' + post.id;
        });
      }
    });
  }

  /* =========================================================
     LEARN
     ========================================================= */
  function courseProgress(id) {
    const course = KW.COURSES.find(c => c.id === id);
    const p = state.progress[id] || { done: [], score: null, passed: false };
    const steps = course.lessons.length + 1; // lessons + quiz
    const doneSteps = p.done.length + (p.passed ? 1 : 0);
    return { ...p, pct: Math.round(doneSteps / steps * 100) };
  }

  function progressBar(pct) {
    return `<div class="progress" role="progressbar" aria-valuenow="${pct}" aria-valuemin="0" aria-valuemax="100" aria-label="Course progress"><span style="width:${pct}%"></span></div>`;
  }

  const game = { order: [], i: 0, score: 0, answered: false };
  function resetGame() {
    game.order = KW.SPOT_GAME.map((_, i) => i).sort(() => Math.random() - 0.5).slice(0, 5);
    game.i = 0; game.score = 0; game.answered = false;
  }

  function renderLearn(sub, id, step) {
    if (sub === 'course' && id) return renderCourse(id, step);

    const passed = KW.COURSES.filter(c => courseProgress(c.id).passed);
    main.innerHTML = `
      <div class="page-head">
        <h1>🎓 Learn</h1>
        <p>Bite-sized courses (under 15 minutes each) to help you and your family spot scams. Earn a badge for every course you pass.</p>
      </div>

      <section class="learn-top">
        <div class="card progress-card">
          <h2>Your progress</h2>
          <p class="big-num">${passed.length}<span>/ ${KW.COURSES.length} courses passed</span></p>
          ${progressBar(Math.round(passed.length / KW.COURSES.length * 100))}
          <div class="badges" aria-label="Badges earned">
            ${KW.COURSES.map(c => `<span class="badge ${courseProgress(c.id).passed ? 'earned' : ''}" title="${esc(c.title)}${courseProgress(c.id).passed ? ' — earned' : ' — not yet earned'}">${c.icon}</span>`).join('')}
          </div>
          ${passed.length === KW.COURSES.length ? '<p class="pill pill-ok">🏆 Kampung Scam-Buster — all courses complete!</p>' : ''}
        </div>
        <div class="card game-card" id="gameCard"></div>
      </section>

      <h2 class="section-title">Courses</h2>
      <div class="course-grid">
        ${KW.COURSES.map(c => {
          const p = courseProgress(c.id);
          return `
            <a class="card course" href="#/learn/course/${c.id}">
              <span class="course-icon" aria-hidden="true">${c.icon}</span>
              <h3>${esc(c.title)}</h3>
              <p class="small muted">${esc(c.blurb)}</p>
              <p class="course-meta small"><span>⏱ ${c.minutes} min</span><span>${esc(c.level)}</span><span>${c.lessons.length} lessons + quiz</span></p>
              ${progressBar(p.pct)}
              <span class="course-cta">${p.passed ? '✅ Passed — review' : p.pct ? 'Continue →' : 'Start →'}</span>
            </a>`;
        }).join('')}
      </div>`;

    resetGame();
    renderGame();
  }

  function renderGame() {
    const card = $('#gameCard');
    if (!card) return;
    if (game.i >= game.order.length) {
      const best = Math.max(state.gameBest || 0, game.score);
      if (best !== state.gameBest) { state.gameBest = best; save(); }
      card.innerHTML = `
        <h2>🎯 Spot the scam</h2>
        <p class="big-num">${game.score}<span>/ ${game.order.length} correct</span></p>
        <p>${game.score === game.order.length ? 'Perfect! You’re a natural scam-spotter. 🏅' : game.score >= 3 ? 'Nice work — a few tricky ones in there.' : 'Scams are designed to fool people. Try a course below and play again!'}</p>
        <p class="muted small">Best score: ${best}/${game.order.length}</p>
        <button class="btn btn-primary" id="gameAgain">Play again</button>`;
      $('#gameAgain').addEventListener('click', () => { resetGame(); renderGame(); });
      return;
    }
    const item = KW.SPOT_GAME[game.order[game.i]];
    card.innerHTML = `
      <div class="card-head"><h2>🎯 Spot the scam</h2><span class="muted small">${game.i + 1} / ${game.order.length} · Score ${game.score}</span></div>
      <div class="phone-msg">
        <small>${esc(item.from)}</small>
        <p>${esc(item.msg)}</p>
      </div>
      <div class="game-btns" id="gameBtns">
        <button class="btn btn-danger btn-lg" data-ans="scam">🚩 Scam</button>
        <button class="btn btn-ok btn-lg" data-ans="legit">👍 Legit</button>
      </div>
      <div id="gameFeedback" aria-live="polite"></div>`;
    $$('[data-ans]', card).forEach(b => b.addEventListener('click', () => {
      if (game.answered) return;
      game.answered = true;
      const right = (b.dataset.ans === 'scam') === item.isScam;
      if (right) game.score++;
      $$('[data-ans]', card).forEach(x => { x.disabled = true; });
      $('#gameFeedback').innerHTML = `
        <div class="risk risk-${right ? 'low' : 'high'}"><strong>${right ? '✔ Correct!' : '✖ Not quite.'} It’s ${item.isScam ? 'a scam' : 'legit'}.</strong><span>${esc(item.explain)}</span></div>
        <button class="btn btn-primary" id="gameNext">${game.i + 1 < game.order.length ? 'Next message →' : 'See score'}</button>`;
      $('#gameNext').addEventListener('click', () => { game.i++; game.answered = false; renderGame(); });
      $('#gameNext').focus();
    }));
  }

  function renderCourse(id, step) {
    const course = KW.COURSES.find(c => c.id === id);
    if (!course) { location.hash = '#/learn'; return; }
    const p = state.progress[id] || (state.progress[id] = { done: [], score: null, passed: false });
    const isQuiz = step === 'quiz';
    let idx = isQuiz ? -1 : Number(step);
    if (!isQuiz && !(idx >= 0 && idx < course.lessons.length)) {
      // Resume at the first unfinished lesson.
      idx = course.lessons.findIndex((_, i) => !p.done.includes(i));
      if (idx === -1) { location.replace(`#/learn/course/${id}/quiz`); return; }
    }

    main.innerHTML = `
      <a class="back-link" href="#/learn">← All courses</a>
      <div class="course-layout">
        <aside class="card lesson-nav">
          <p class="course-icon" aria-hidden="true">${course.icon}</p>
          <h2>${esc(course.title)}</h2>
          ${progressBar(courseProgress(id).pct)}
          <ol>
            ${course.lessons.map((l, i) => `
              <li><a href="#/learn/course/${id}/${i}" class="${i === idx ? 'active' : ''}">${p.done.includes(i) ? '✅' : '○'} ${esc(l.title)}</a></li>`).join('')}
            <li><a href="#/learn/course/${id}/quiz" class="${isQuiz ? 'active' : ''}">${p.passed ? '🏅' : '📝'} Quiz</a></li>
          </ol>
        </aside>
        <section class="card lesson" id="lessonBody"></section>
      </div>`;

    const body = $('#lessonBody');
    if (!isQuiz) {
      const lesson = course.lessons[idx];
      body.innerHTML = `
        <p class="eyebrow">Lesson ${idx + 1} of ${course.lessons.length}</p>
        <h1>${esc(lesson.title)}</h1>
        <div class="lesson-content">${lesson.body}</div>
        <div class="form-actions">
          ${idx > 0 ? `<a class="btn btn-ghost" href="#/learn/course/${id}/${idx - 1}">← Previous</a>` : '<span></span>'}
          <button class="btn btn-primary" id="lessonDone">${idx + 1 < course.lessons.length ? 'Got it — next lesson →' : 'Got it — take the quiz →'}</button>
        </div>`;
      $('#lessonDone').addEventListener('click', () => {
        if (!p.done.includes(idx)) p.done.push(idx);
        save();
        location.hash = idx + 1 < course.lessons.length ? `#/learn/course/${id}/${idx + 1}` : `#/learn/course/${id}/quiz`;
      });
      return;
    }

    body.innerHTML = `
      <p class="eyebrow">Quiz</p>
      <h1>Check what you’ve learned</h1>
      <p class="muted">Get ${Math.ceil(course.quiz.length * 0.67)} of ${course.quiz.length} right to earn the ${course.icon} badge.</p>
      <form id="quizForm">
        ${course.quiz.map((q, qi) => `
          <fieldset class="quiz-q" id="q${qi}">
            <legend>${qi + 1}. ${esc(q.q)}</legend>
            ${q.options.map((o, oi) => `
              <label class="quiz-opt"><input type="radio" name="q${qi}" value="${oi}" required> <span>${esc(o)}</span></label>`).join('')}
            <div class="quiz-explain" hidden></div>
          </fieldset>`).join('')}
        <div id="quizResult" aria-live="polite"></div>
        <div class="form-actions"><span></span><button class="btn btn-primary btn-lg" type="submit">Check answers</button></div>
      </form>`;

    $('#quizForm').addEventListener('submit', e => {
      e.preventDefault();
      const form = e.target;
      const answers = course.quiz.map((_, qi) => {
        const sel = $(`input[name=q${qi}]:checked`, form);
        return sel ? Number(sel.value) : null;
      });
      if (answers.includes(null)) { toast('Please answer every question.', 'warn'); return; }
      let score = 0;
      course.quiz.forEach((q, qi) => {
        const ok = answers[qi] === q.answer;
        if (ok) score++;
        const fs = $('#q' + qi);
        fs.classList.remove('right', 'wrong');
        fs.classList.add(ok ? 'right' : 'wrong');
        const ex = $('.quiz-explain', fs);
        ex.hidden = false;
        ex.innerHTML = `<strong>${ok ? '✔ Correct.' : '✖ The answer is: ' + esc(q.options[q.answer]) + '.'}</strong> ${esc(q.explain)}`;
      });
      const pass = score >= Math.ceil(course.quiz.length * 0.67);
      p.score = Math.max(p.score || 0, score);
      if (pass) p.passed = true;
      save();
      const nextCourse = KW.COURSES.find(c => !courseProgress(c.id).passed);
      $('#quizResult').innerHTML = `
        <div class="risk risk-${pass ? 'low' : 'medium'}">
          <strong>${pass ? `🏅 You passed! ${score}/${course.quiz.length}` : `${score}/${course.quiz.length} — so close!`}</strong>
          <span>${pass ? `You’ve earned the ${course.icon} badge. Share what you learned with someone you care about.` : 'Review the explanations above and try again.'}</span>
        </div>
        ${pass && nextCourse ? `<a class="btn btn-primary" href="#/learn/course/${nextCourse.id}">Next course: ${esc(nextCourse.title)} →</a>` : ''}
        ${pass ? `<button class="btn btn-ghost" id="shareTip" type="button">💬 Share a tip in the community</button>` : ''}`;
      const share = $('#shareTip');
      if (share) share.addEventListener('click', () => {
        openPostModal();
        $('#pFlair').value = 'tips';
        $('#pFlair').dispatchEvent(new Event('change'));
        $('#pTitle').value = `What I learned from “${course.title}”`;
      });
    });
  }

  /* ---------- boot ---------- */
  applySettings();
  if (!location.hash) location.replace('#/home');
  router();
  setInterval(tickCases, 1000);
  if (state.subscription.enabled) scheduleDemoWave();
  // Pick up any cases that were mid-reply when the page was closed.
  tickCases();
})();
