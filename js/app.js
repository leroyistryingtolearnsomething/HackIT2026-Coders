/* Kampung Watch — single-page app combining:
   1. Community forum (Reddit-style posts, votes, comments, photos, polls)
   2. Neighbourhood Scam Radar (live map + verified feed + area alerts)
   3. Ask a Neighbour (one-tap "Is this a scam?" to volunteers, call-back)
   4. Learn (short courses, quizzes, "Spot the scam" game)

   Shared data lives on the Kampung Watch server (see server/). Personal
   preferences and course progress stay in this browser's localStorage. */
(() => {
  'use strict';

  const KW = window.KW;
  const PREFS_KEY = 'kampungwatch.prefs';
  const main = document.getElementById('main');

  /* ---------- helpers ---------- */
  const $ = (sel, el = document) => el.querySelector(sel);
  const $$ = (sel, el = document) => [...el.querySelectorAll(sel)];
  const esc = s => String(s ?? '').replace(/[&<>"']/g, c =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const nl2br = s => esc(s).replace(/\n/g, '<br>');
  const hoursSince = iso => (Date.now() - new Date(iso).getTime()) / 3600e3;
  const byNewest = (a, b) => new Date(b.created) - new Date(a.created);
  const debounce = (fn, ms) => { let t; return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); }; };

  function timeAgo(iso) {
    const s = Math.max(0, (Date.now() - new Date(iso).getTime()) / 1000);
    if (s < 45) return 'just now';
    if (s < 3600) return Math.round(s / 60) + ' min ago';
    if (s < 86400) return Math.round(s / 3600) + 'h ago';
    const d = Math.round(s / 86400);
    return d === 1 ? 'yesterday' : d + ' days ago';
  }

  /* Replace an item in a list by id (or add it), in place. */
  function upsert(list, item, { prepend = true } = {}) {
    const i = list.findIndex(x => x.id === item.id);
    if (i >= 0) list[i] = item;
    else if (prepend) list.unshift(item);
    else list.push(item);
  }

  /* ---------- local preferences ---------- */
  const newClientId = () => (window.crypto && crypto.randomUUID)
    ? crypto.randomUUID()
    : 'c-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 12);

  let prefs = loadPrefs();

  function loadPrefs() {
    let p = {};
    try { p = JSON.parse(localStorage.getItem(PREFS_KEY)) || {}; } catch (e) { /* use defaults */ }
    return {
      clientId: p.clientId || newClientId(),
      largeText: !!p.largeText,
      lang: ['en', 'zh', 'ms', 'ta'].includes(p.lang) ? p.lang : 'en',
      subscription: p.subscription || { town: '', enabled: false },
      progress: p.progress || {},
      gameBest: p.gameBest || 0,
      volunteer: p.volunteer || null,
      homePause: p.homePause === true // emergency-button mode: off unless chosen
    };
  }

  function savePrefs() {
    try { localStorage.setItem(PREFS_KEY, JSON.stringify(prefs)); } catch (e) { /* private mode: keep in memory */ }
  }

  const isVolunteer = () => !!prefs.volunteer;
  const myCircle = () => (cache.circle && cache.circle.mine) || null;
  const userName = () => (prefs.volunteer && prefs.volunteer.name) || (myCircle() && myCircle().name) || null;
  const userTown = () => (prefs.volunteer && prefs.volunteer.area) || (myCircle() && myCircle().town) || prefs.subscription.town || null;

  /* ---------- API client ---------- */
  class ApiError extends Error {}

  function apiHeaders(json) {
    const headers = { 'X-Client-Id': prefs.clientId };
    if (json) headers['Content-Type'] = 'application/json';
    if (prefs.volunteer) headers.Authorization = 'Bearer ' + prefs.volunteer.token;
    return headers;
  }

  async function request(method, path, body) {
    const headers = apiHeaders(body !== undefined);
    let res;
    try {
      res = await fetch('/api' + path, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) });
    } catch (e) {
      throw new ApiError('offline');
    }
    const data = res.status === 204 ? null : await res.json().catch(() => null);
    if (!res.ok) {
      if (res.status === 401 && prefs.volunteer && path !== '/volunteer/login') endVolunteerSession('Your volunteer session has expired. Please sign in again.');
      throw new ApiError((data && data.error) || `Request failed (${res.status})`);
    }
    return data;
  }

  const api = {
    get: path => request('GET', path),
    post: (path, body = {}) => request('POST', path, body),
    del: path => request('DELETE', path)
  };

  /* Run an API action from a button: disables it while busy and shows errors. */
  async function act(button, fn) {
    if (button) button.disabled = true;
    try { return await fn(); } catch (err) {
      toast(err.message === 'offline' ? 'Can’t reach the server. Check your connection and try again.' : err.message, 'warn');
      return undefined;
    } finally {
      if (button && button.isConnected) button.disabled = false;
    }
  }

  /* In-memory copies of server data for the current views. */
  const cache = { me: null, config: null, circle: null, reports: [], cases: [], posts: [], post: null };

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
  let onModalClose = null;
  function openModal({ title, body, onMount, onClose, wide = false }) {
    const root = $('#modal');
    lastFocus = document.activeElement;
    onModalClose = onClose || null;
    root.innerHTML = `
      <div class="dialog-backdrop">
        <div class="dialog ${wide ? 'dialog-wide' : ''}" role="dialog" aria-modal="true" aria-labelledby="modalTitle">
          <header class="dialog-head">
            <h2 class="dialog-title" id="modalTitle">${esc(title)}</h2>
            <button type="button" class="btn btn-ghost" data-close>Close</button>
          </header>
          <div class="dialog-content">${body}</div>
        </div>
      </div>`;
    root.hidden = false;
    document.body.classList.add('modal-open');
    $$('[data-close]', root).forEach(b => b.addEventListener('click', () => closeModal()));
    const backdrop = $('.dialog-backdrop', root);
    backdrop.addEventListener('click', e => { if (e.target === backdrop) closeModal(); });
    if (onMount) onMount($('.dialog-content', root));
    const first = $('input:not([type=hidden]):not([type=file]), select, textarea', $('.dialog-content', root));
    if (first) first.focus();
  }

  function closeModal({ silent = false } = {}) {
    const root = $('#modal');
    if (root.hidden) return;
    root.hidden = true;
    root.innerHTML = '';
    document.body.classList.remove('modal-open');
    const cb = onModalClose;
    onModalClose = null;
    if (cb && !silent) cb();
    if (lastFocus && lastFocus.isConnected) lastFocus.focus();
    if (queuedDrill) {
      const d = queuedDrill;
      queuedDrill = null;
      setTimeout(() => openDrill(d), 1000);
    }
  }

  document.addEventListener('keydown', e => {
    if (e.key === 'Escape' && !$('#modal').hidden) closeModal();
  });

  /* Downscale an uploaded image before sending it to the server. */
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

  const SCREENSHOT_TYPES = ['image/jpeg', 'image/png', 'image/webp'];
  const SCREENSHOT_MAX = 2 * 1024 * 1024;

  /* Markup for a screenshot picker: a hidden file input opened by a text button. */
  function imageField(id, label, initial = null) {
    return `
      <div class="field full">
        <span class="field-label" id="${id}Label">${esc(label)}</span>
        <input type="file" id="${id}" class="sr-only" accept="${SCREENSHOT_TYPES.join(',')}" tabindex="-1" aria-hidden="true">
        <div class="img-picker">
          <button type="button" class="btn btn-secondary" data-pick="${id}" aria-describedby="${id}Label">Choose a screenshot</button>
          <span class="muted">JPEG, PNG or WebP, up to 2 MB</span>
        </div>
        <div class="img-preview" id="${id}Prev">${initial ? `<img src="${esc(initial)}" alt="Attached screenshot">` : ''}</div>
      </div>`;
  }

  /* Wires an imageField to its preview; returns a getter for the current image. */
  function bindImageInput(input, preview, initial = null) {
    let data = initial;
    const pick = document.querySelector(`[data-pick="${input.id}"]`);
    if (pick) pick.addEventListener('click', () => input.click());
    const clear = () => { data = null; input.value = ''; preview.innerHTML = ''; };
    input.addEventListener('change', async () => {
      const file = input.files[0];
      if (!file) return;
      if (!SCREENSHOT_TYPES.includes(file.type)) { clear(); toast('Please choose a JPEG, PNG or WebP image.', 'warn'); return; }
      if (file.size > SCREENSHOT_MAX) { clear(); toast('That image is over 2 MB. Please choose a smaller one.', 'warn'); return; }
      try {
        data = await readImage(file);
        preview.innerHTML = `<img src="${esc(data)}" alt="Your screenshot"><button type="button" class="btn btn-ghost">Remove screenshot</button>`;
        $('button', preview).addEventListener('click', () => { clear(); if (pick) pick.focus(); });
      } catch (err) {
        clear();
        toast(err.message, 'warn');
      }
    });
    return () => data;
  }

  /* Seed polls were written with emoji; show the words only. */
  const plainLabel = s => String(s).replace(/^[\p{Extended_Pictographic}️‍\s]+/u, '');

  function townOptions(selected = '', includeAll = false, allLabel = 'All areas') {
    return (includeAll ? `<option value="">${allLabel}</option>` : '') +
      Object.keys(KW.TOWNS).map(t => `<option ${t === selected ? 'selected' : ''}>${esc(t)}</option>`).join('');
  }

  /* ---------- red-flag analysis (instant, in the browser) ---------- */
  function analyse(text) {
    const flags = KW.FLAG_RULES.filter(r => r.re.test(text));
    const level = flags.length >= 3 ? 'high' : flags.length >= 1 ? 'medium' : 'low';
    return { flags, level };
  }

  /* The same verdict and numbered list as the Check First screen, for posts and dialogs. */
  function flagsHTML(text) {
    if (!text.trim()) return '<p class="muted">Red flags will appear here as you type.</p>';
    const { flags } = analyse(text);
    const verdict = flags.length === 0 ? 'No obvious red flags. Still unsure? Ask a neighbour.'
      : flags.length === 1 ? '1 red flag. Pause before you reply.'
      : `${flags.length} red flags. Don’t tap, don’t pay.`;
    return `
      <p class="flag-verdict">${verdict}</p>
      ${flags.length ? `<ol class="flag-list" role="list">${flags.map((f, i) => `
        <li><span class="flag-n">${i + 1}</span><span class="flag-label">${esc(f.label)}</span><span class="flag-tip">${esc(f.tip)}</span></li>`).join('')}</ol>` : ''}`;
  }

  /* ---------- settings, header & volunteer sign-in ---------- */
  function applySettings() {
    document.documentElement.classList.toggle('large-text', prefs.largeText);
    document.body.classList.toggle('volunteer-on', isVolunteer());
    $$('[data-text-size]').forEach(b => b.setAttribute('aria-pressed', String(prefs.largeText)));
    paintHeader();
    if (prefs.volunteer) {
      const v = prefs.volunteer;
      $('#volStripText').textContent = `Signed in as ${v.name} (${v.role}, ${v.area}).`;
    }
  }

  /* The header follows the chosen language on every page. */
  function paintHeader() {
    const header = $('.site-header');
    header.lang = prefs.lang;
    $$('[data-i18n]', header).forEach(el => { el.textContent = say(el.dataset.i18n); });
    $$('[data-i18n-label]', header).forEach(el => { el.setAttribute('aria-label', say(el.dataset.i18nLabel)); });
    const town = userTown();
    $('#navTown').textContent = town ? ` · ${town}` : '';
    $('#volunteerBtn').textContent = say(isVolunteer() ? 'signOut' : 'volunteer');
    $('#langSelect').value = prefs.lang;
    paintAssistant();
  }

  // Set by a page whose own text is translated (today only the Check First screen).
  let onLangChange = null;
  $('#langSelect').addEventListener('change', e => {
    prefs.lang = e.target.value;
    savePrefs();
    paintHeader();
    if (onLangChange) onLangChange();
  });

  document.addEventListener('click', e => {
    if (!e.target.closest('[data-text-size]')) return;
    prefs.largeText = !prefs.largeText;
    savePrefs(); applySettings();
  });

  function toggleVolunteer() {
    if (isVolunteer()) {
      api.del('/volunteer/session').catch(() => {});
      endVolunteerSession('Signed out. Back to the resident view.');
    } else {
      openVolunteerLogin();
    }
  }

  $('#volunteerBtn').addEventListener('click', toggleVolunteer);

  function endVolunteerSession(message) {
    if (!prefs.volunteer) return;
    prefs.volunteer = null;
    savePrefs(); applySettings();
    connectEvents();
    toast(message);
    router();
  }

  function openVolunteerLogin() {
    const roles = (cache.config && cache.config.volunteerRoles) || ['Digital Ambassador', 'RC Volunteer', 'Student Volunteer', 'CC Scam-Buster'];
    openModal({
      title: 'Volunteer sign-in',
      body: `
        <form id="volForm" class="form-grid">
          <p class="muted full">Volunteer mode lets trained Digital Ambassadors, RC/CC and student volunteers answer cases, verify Scam Radar reports and give verdicts in the community.</p>
          <div class="field full"><label for="vName">Your name</label><input id="vName" class="input" required minlength="2" maxlength="40" autocomplete="name"></div>
          <div class="field"><label for="vRole">Role</label><select id="vRole" class="input">${roles.map(r => `<option>${esc(r)}</option>`).join('')}</select></div>
          <div class="field"><label for="vArea">Area</label><select id="vArea" class="input">${townOptions(prefs.subscription.town || 'Tampines')}</select></div>
          <div class="field full"><label for="vCode">Volunteer access code</label><input id="vCode" class="input" type="password" required autocomplete="off"></div>
          ${cache.config && cache.config.usingDefaultCode ? '<p class="full muted">This server is using the prototype’s default code (see <code>server/.env.example</code>).</p>' : ''}
          <div class="full form-actions">
            <button type="button" class="btn btn-secondary" data-close>Cancel</button>
            <button type="submit" class="btn btn-primary">Sign in</button>
          </div>
        </form>`,
      onMount: body => {
        $$('[data-close]', body).forEach(b => b.addEventListener('click', () => closeModal()));
        $('#volForm', body).addEventListener('submit', e => {
          e.preventDefault();
          act(e.submitter, async () => {
            const res = await api.post('/volunteer/login', {
              name: $('#vName', body).value, role: $('#vRole', body).value,
              area: $('#vArea', body).value, code: $('#vCode', body).value
            });
            prefs.volunteer = { token: res.token, ...res.volunteer };
            savePrefs();
            closeModal({ silent: true });
            applySettings();
            connectEvents();
            toast(`Welcome, ${res.volunteer.name}! Volunteer mode is on.`, 'ok');
            router();
          });
        });
      }
    });
  }

  $('#navToggle').addEventListener('click', () => {
    const nav = $('#siteNav');
    const open = nav.classList.toggle('open');
    $('#navToggle').setAttribute('aria-expanded', String(open));
  });

  $('#resetLocal').addEventListener('click', () => {
    if (!confirm('Clear this browser’s Kampung Watch data? Your course progress, alert settings and anonymous identity will be reset.')) return;
    try { localStorage.removeItem(PREFS_KEY); } catch (e) { /* ignore */ }
    location.replace('#/home');
    location.reload();
  });

  $('#footerHelplines').innerHTML = KW.HELPLINES.map(h =>
    `<li><a href="tel:${h.number.replace(/\s/g, '')}">${esc(h.number)}</a> <span>${esc(h.label)}</span><span class="muted">${esc(h.note)}</span></li>`).join('');

  /* ---------- live updates ----------
     A Server-Sent Events stream, with polling as a backup: some networks and
     tunnels hold the stream back, and a Pause alert must still get through. */
  let events = null;
  let pollTimer = null;
  let lastEventId = 0;
  let connection = 0; // bumped on every reconnect, so an old fallback timer can't fire

  const EVENT_HANDLERS = {
    report: d => onReportEvent(d),
    case: d => onCaseEvent(d),
    post: d => onPostEvent(d),
    pause: d => onPauseEvent(d),
    drill: d => onDrillEvent(d),
    circle: d => onCircleEvent(d)
  };

  function handleEvent(name, id, data) {
    if (id && id <= lastEventId) return; // already handled
    if (id) lastEventId = id;
    try { EVENT_HANDLERS[name](data); } catch (err) { console.error(err); }
  }

  async function connectEvents() {
    const mine = ++connection;
    if (events) { events.close(); events = null; }
    clearInterval(pollTimer);
    pollTimer = null;

    const auth = new URLSearchParams({ clientId: prefs.clientId });
    if (prefs.volunteer) auth.set('token', prefs.volunteer.token);
    // Where to pick up from if we end up polling.
    try { lastEventId = (await api.get('/events/poll')).last; } catch (e) { /* offline: start from the stream */ }
    if (mine !== connection) return;

    if (!window.EventSource) { startPolling(); return; }
    let live = false;
    events = new EventSource('/api/events?' + auth);
    events.addEventListener('ready', () => { live = true; });
    Object.keys(EVENT_HANDLERS).forEach(name => events.addEventListener(name, e => {
      live = true;
      handleEvent(name, Number(e.lastEventId) || 0, JSON.parse(e.data));
    }));
    setTimeout(() => {
      if (mine === connection && !live) startPolling(); // the stream is being held back
    }, 5000);
  }

  function startPolling() {
    if (events) { events.close(); events = null; }
    clearInterval(pollTimer);
    const poll = async () => {
      try {
        const res = await api.get('/events/poll?after=' + lastEventId);
        res.events.forEach(e => handleEvent(e.event, e.id, e.data));
        lastEventId = Math.max(lastEventId, res.last);
      } catch (e) { /* offline for a moment: try again next time */ }
    };
    pollTimer = setInterval(poll, 3000);
    poll();
  }

  async function onReportEvent({ id, action }) {
    const r = await api.get('/reports/' + id).catch(() => null);
    if (!r) return;
    upsert(cache.reports, r);
    const sub = prefs.subscription;
    if (action === 'verified' && sub.enabled && sub.town === r.town) pushAlert(r);
    if (current.route === 'radar' && !current.args.length) updateRadar();
  }

  async function onCaseEvent({ id, kind, by }) {
    if (onCheckFirst()) {
      const c = await api.get('/cases/' + id).catch(() => null);
      if (!c || !onCheckFirst()) return;
      upsert(cache.cases, c);
      renderCaseList();
    } else if (kind === 'reply' && !isVolunteer()) {
      notify(`${by} replied`, 'Your “Is this a scam?” case has an answer.', '#/ask');
    } else if (kind === 'new' && isVolunteer()) {
      notify('New case', 'A resident needs help checking a message.', '#/ask');
    }
  }

  function onPostEvent({ id, action }) {
    if (current.route !== 'community') return;
    const [sub, postId] = current.args;
    if (!sub && action === 'new') loadPostList();
    // Refresh an open post, unless the reader is in the middle of typing.
    if (sub === 'post' && postId === id && !$$('textarea', main).some(t => t.value.trim())) {
      refreshPost(id);
    }
  }

  function notify(title, body, link) {
    toast(`${title}: ${body}`, 'info', { link, linkText: 'Open' });
    if ('Notification' in window && Notification.permission === 'granted' && document.hidden) {
      try { new Notification(title, { body }); } catch (e) { /* some browsers need a service worker */ }
    }
  }

  /* ---------- router ---------- */
  let map = null, markerLayer = null;
  let routeSeq = 0;
  let current = { route: 'home', args: [] };

  const routes = {
    home: renderPause, // the landing page is Pause, the main feature
    pause: renderPause,
    ask: renderAsk,
    radar: renderRadar,
    community: renderCommunity,
    learn: renderLearn,
    ai: renderAssistantPage
  };

  async function router() {
    const seq = ++routeSeq;
    const parts = location.hash.replace(/^#\/?/, '').split('/').filter(Boolean).map(decodeURIComponent);
    const route = routes[parts[0]] ? parts[0] : 'home';
    current = { route, args: parts.slice(1) };
    if (map) { map.remove(); map = null; markerLayer = null; }
    clearInterval(pauseTimer);
    cancelLaunch();
    $$('#siteNav a').forEach(a => {
      if (a.dataset.route === (route === 'home' ? 'pause' : route)) a.setAttribute('aria-current', 'page');
      else a.removeAttribute('aria-current');
    });
    $('#siteNav').classList.remove('open');
    $('#navToggle').setAttribute('aria-expanded', 'false');
    // The floating "Is this a scam?" button would cover the main buttons on these pages.
    $('#fab').hidden = routes[route] === renderAsk || routes[route] === renderPause || route === 'ai';
    document.body.classList.remove('route-ask');
    onLangChange = null;
    main.innerHTML = '<div class="page"><p class="kicker" role="status">Loading…</p></div>';
    window.scrollTo({ top: 0, behavior: 'instant' });
    try {
      await routes[route](seq, ...current.args);
    } catch (err) {
      if (seq === routeSeq) renderError(err);
    }
  }

  const stale = seq => seq !== routeSeq;
  /* Ask a Neighbour shows the Check First screen and its case list. */
  const onCheckFirst = () => current.route === 'ask';
  const onPausePage = () => current.route === 'home' || current.route === 'pause';

  function renderError(err) {
    document.body.classList.remove('route-ask');
    const offline = err.message === 'offline';
    main.innerHTML = `
      <div class="page">
        <div class="error-block">
          <p class="kicker">${offline ? 'Offline' : 'Error'}</p>
          <h1 class="display">${offline ? 'Can’t reach the Kampung Watch server.' : 'Something went wrong.'}</h1>
          <p class="lede">${offline ? 'Check your connection. If you’re running it yourself, start the server with <code>npm start</code> in the project folder.' : esc(err.message)}</p>
          ${offline ? `<p class="lede">Being pressured to pay right now? Don’t pay. Call someone you trust, or the ScamShield Helpline <a href="tel:1799">1799</a>. In danger, call <a href="tel:999">999</a>.</p>` : ''}
          <button type="button" class="btn btn-primary btn-lg" id="retryBtn">Try again</button>
        </div>
      </div>`;
    $('#retryBtn').addEventListener('click', router);
  }

  window.addEventListener('hashchange', router);

  /* =========================================================
     ASK A NEIGHBOUR — "Check First"
     ========================================================= */
  /* Static copy for this screen and the site header. Missing keys fall back to English.
     {999} and {1799} in `help` become tap-to-call links. */
  const ASK_COPY = {
    en: {
      aiHeadline: 'Not sure about a message? Ask AI.',
      aiChatLabel: 'Chat with the assistant',
      aiTry: 'Try asking',
      aiPerson: 'Prefer a person?',
      aiPersonText: 'Trained volunteers check every case by hand, and can call you back.',
      aiUrgent: 'Money leaving your account right now?',
      assistant: 'Ask AI',
      aiKicker: 'AI assistant · it can make mistakes',
      aiIntro: 'Tell me what happened, or paste the message you received. I’ll point out warning signs and what to do next. A trained volunteer can check anything I’m not sure about.',
      aiPlaceholder: 'Type your question or paste the message',
      aiSend: 'Send',
      aiAttach: 'Add screenshot',
      aiRemove: 'Remove screenshot',
      aiHandoff: 'Send this chat to a volunteer',
      aiNew: 'Start a new chat',
      aiNote: 'Your messages are sent to Claude, an AI made by Anthropic, to answer. Never share passwords, OTPs or card numbers.',
      aiNoteGemini: 'Your messages are sent to Google Gemini, an AI service, to answer. On the free plan Google may use them to improve its products, so leave out personal details. Never share passwords, OTPs or card numbers.',
      aiOff: 'The assistant isn’t switched on yet. You can still ask a trained volunteer.',
      aiAskVolunteer: 'Ask a volunteer',
      aiYou: 'You',
      aiName: 'Assistant',
      aiThinking: 'Thinking…',
      aiError: 'Sorry, the assistant couldn’t answer just now. Please try again, or ask a volunteer.',
      aiSent: 'Sent to a volunteer. You’ll find the conversation under My cases on the Check a message page.',
      aiShotNote: '(I attached a screenshot.)',
      aiSuggest: ['I got an SMS about a parcel fee. Is it real?', 'Someone called saying they are from the police.', 'I already clicked a link. What should I do now?'],
      menu: 'Menu',
      navPause: 'Pause', navCheck: 'Check a message',
      navRadar: 'Scam Radar', navCommunity: 'Community', navLearn: 'Learn',
      langLabel: 'Language', textSize: 'Text size A+', volunteer: 'Volunteer sign in', signOut: 'Volunteer sign out',
      headline: 'Got a message that feels off? Ask the kampung.',
      onDuty: 'Neighbours on duty tonight',
      callMeBack: 'Call me back',
      dutyNone: town => `No volunteers listed for ${town} yet. Ask anyway: volunteers across Singapore answer.`,
      block: 'Going round your block this week',
      blockAll: 'Going round Singapore this week',
      blockNone: town => `Nothing verified in ${town} this week.`,
      hit: n => `${n} neighbours hit`,
      pasteLabel: 'Paste it, or upload a screenshot',
      placeholder: 'Paste the message here',
      send: 'Ask a neighbour now',
      upload: 'Upload screenshot',
      remove: 'Remove screenshot',
      shotAlt: 'Your screenshot',
      help: 'Money leaving your account now? Call {999}. For advice, ScamShield {1799}, any time.',
      noticed: 'What we noticed',
      vEmpty: 'Paste a message to check it.',
      vNone: 'No obvious red flags. Still unsure? Ask a neighbour.',
      vOne: '1 red flag. Pause before you reply.',
      vMany: n => `${n} red flags. Don’t tap, don’t pay.`,
      footnote: 'This is a pause, not a verdict. A neighbour checks every case by hand.',
      more: 'More options: how it reached you, or ask for a call back',
      channel: 'How did it reach you?',
      cbIntro: 'Prefer to talk? Leave your number and a volunteer will call you back.',
      cbName: 'Your name', cbPhone: 'Phone number', cbLang: 'Language for the call',
      privacy: 'Only verified volunteers see your case. Never send passwords, OTPs or full card numbers.',
      cases: 'My cases', inbox: 'Volunteer inbox',
      needInput: 'Please paste the message or add a screenshot first.',
      sent: 'Sent! A volunteer will pick this up shortly.',
      imgType: 'Please choose a JPEG, PNG or WebP image.',
      imgSize: 'That image is over 2 MB. Please choose a smaller one.',
      casesOffline: 'Can’t load your cases right now. The check above still works.'
    },
    zh: {
      aiHeadline: '不确定一条信息？问问 AI。',
      aiChatLabel: '与助手对话',
      aiTry: '可以这样问',
      aiPerson: '想找真人帮忙？',
      aiPersonText: '受过训练的义工会亲手核查每一个案例，也可以给您回电。',
      aiUrgent: '钱正在从您的户口被转走？',
      assistant: '问 AI 助手',
      aiKicker: 'AI 助手 · 可能会出错',
      aiIntro: '告诉我发生了什么，或贴上您收到的信息。我会指出危险信号和下一步该怎么做。我不确定的，可以交给受过训练的义工核查。',
      aiPlaceholder: '输入您的问题或贴上信息',
      aiSend: '发送',
      aiAttach: '添加截图',
      aiRemove: '移除截图',
      aiHandoff: '把这段对话交给义工',
      aiNew: '开始新对话',
      aiNote: '您的信息会发送给 Anthropic 公司开发的 AI「Claude」来回答。切勿分享密码、OTP 或卡号。',
      aiNoteGemini: '您的信息会发送给 Google 的 AI 服务 Gemini 来回答。在免费方案下，Google 可能会用这些信息改进其产品，所以请不要附上个人资料。切勿分享密码、OTP 或卡号。',
      aiOff: '助手尚未启用。您仍然可以请受过训练的义工帮忙。',
      aiAskVolunteer: '请义工帮忙',
      aiYou: '您',
      aiName: '助手',
      aiThinking: '正在思考…',
      aiError: '抱歉，助手暂时无法回答。请再试一次，或请义工帮忙。',
      aiSent: '已交给义工。您可以在“检查信息”页面的“我的案例”中查看这段对话。',
      aiShotNote: '（我附上了一张截图。）',
      aiSuggest: ['我收到一条关于包裹费用的短信，是真的吗？', '有人打电话说他是警察。', '我已经点了链接，现在该怎么办？'],
      menu: '菜单',
      navPause: '暂停求助', navCheck: '检查信息',
      navRadar: '诈骗雷达', navCommunity: '社区', navLearn: '学习',
      langLabel: '语言', textSize: '字体大小 A+', volunteer: '义工登录', signOut: '义工退出',
      headline: '收到一条感觉不对劲的信息？问问甘榜邻居。',
      onDuty: '今晚值班的邻居',
      callMeBack: '请给我回电',
      dutyNone: town => `${town}暂时没有登记的义工。照样可以提问，全新加坡的义工都会回答。`,
      block: '本周在您附近流传的骗局',
      blockAll: '本周在新加坡流传的骗局',
      blockNone: town => `本周${town}没有经核实的骗局。`,
      hit: n => `${n} 位邻居遇到`,
      pasteLabel: '把信息贴在这里，或上传截图',
      placeholder: '在这里粘贴信息',
      send: '马上问问邻居',
      upload: '上传截图',
      remove: '移除截图',
      shotAlt: '您的截图',
      help: '钱正在从您的户口被转走？请拨打 {999}。如需咨询，可随时拨打 ScamShield {1799}。',
      noticed: '我们发现了什么',
      vEmpty: '贴上信息，我们帮您检查。',
      vNone: '没有明显的危险信号。还是不放心？问问邻居吧。',
      vOne: '1 个危险信号。回复之前先停一停。',
      vMany: n => `${n} 个危险信号。别点链接，别付钱。`,
      footnote: '这只是提醒您停一停，不是最终判断。每一个案例都由邻居亲手核查。',
      more: '更多选项：信息来源，或要求回电',
      channel: '您是怎么收到的？',
      cbIntro: '想直接通话？留下电话号码，义工会给您回电。',
      cbName: '您的名字', cbPhone: '电话号码', cbLang: '通话语言',
      privacy: '只有经过认证的义工才能看到您的案例。切勿发送密码、OTP 或完整的卡号。',
      cases: '我的案例', inbox: '义工收件箱',
      needInput: '请先粘贴信息或上传截图。',
      sent: '已发送！义工很快就会处理。',
      imgType: '请选择 JPEG、PNG 或 WebP 图片。',
      imgSize: '图片超过 2 MB，请选择较小的图片。',
      casesOffline: '暂时无法载入您的案例。上面的检查仍然可以使用。'
    },
    ms: {
      aiHeadline: 'Ragu dengan sesuatu mesej? Tanya AI.',
      aiChatLabel: 'Berbual dengan pembantu',
      aiTry: 'Cuba tanya',
      aiPerson: 'Lebih suka bercakap dengan orang?',
      aiPersonText: 'Sukarelawan terlatih menyemak setiap kes sendiri, dan boleh menelefon anda semula.',
      aiUrgent: 'Wang sedang keluar dari akaun anda?',
      assistant: 'Tanya AI',
      aiKicker: 'Pembantu AI · ia boleh tersilap',
      aiIntro: 'Ceritakan apa yang berlaku, atau tampal mesej yang anda terima. Saya akan tunjukkan tanda bahaya dan langkah seterusnya. Sukarelawan terlatih boleh menyemak apa-apa yang saya kurang pasti.',
      aiPlaceholder: 'Taip soalan anda atau tampal mesej',
      aiSend: 'Hantar',
      aiAttach: 'Tambah tangkapan skrin',
      aiRemove: 'Buang tangkapan skrin',
      aiHandoff: 'Hantar perbualan ini kepada sukarelawan',
      aiNew: 'Mula perbualan baru',
      aiNote: 'Mesej anda dihantar kepada Claude, AI buatan Anthropic, untuk dijawab. Jangan sekali-kali kongsi kata laluan, OTP atau nombor kad.',
      aiNoteGemini: 'Mesej anda dihantar kepada Google Gemini, sebuah perkhidmatan AI, untuk dijawab. Dalam pelan percuma, Google mungkin menggunakannya untuk menambah baik produknya, jadi jangan sertakan butiran peribadi. Jangan sekali-kali kongsi kata laluan, OTP atau nombor kad.',
      aiOff: 'Pembantu belum diaktifkan. Anda masih boleh bertanya kepada sukarelawan terlatih.',
      aiAskVolunteer: 'Tanya sukarelawan',
      aiYou: 'Anda',
      aiName: 'Pembantu',
      aiThinking: 'Sedang berfikir…',
      aiError: 'Maaf, pembantu tidak dapat menjawab sekarang. Sila cuba lagi, atau tanya sukarelawan.',
      aiSent: 'Dihantar kepada sukarelawan. Perbualan ini ada di bawah Kes saya di halaman Semak mesej.',
      aiShotNote: '(Saya lampirkan tangkapan skrin.)',
      aiSuggest: ['Saya dapat SMS tentang bayaran bungkusan. Betulkah?', 'Seseorang menelefon mengaku dari polis.', 'Saya sudah tekan pautan. Apa patut saya buat sekarang?'],
      menu: 'Menu',
      navPause: 'Jeda', navCheck: 'Semak mesej',
      navRadar: 'Radar Penipuan', navCommunity: 'Komuniti', navLearn: 'Belajar',
      langLabel: 'Bahasa', textSize: 'Saiz teks A+', volunteer: 'Log masuk sukarelawan', signOut: 'Log keluar sukarelawan',
      headline: 'Dapat mesej yang rasa tak kena? Tanya orang kampung.',
      onDuty: 'Jiran yang bertugas malam ini',
      callMeBack: 'Telefon saya semula',
      dutyNone: town => `Belum ada sukarelawan untuk ${town}. Tanya juga: sukarelawan seluruh Singapura akan menjawab.`,
      block: 'Sedang tersebar di kawasan anda minggu ini',
      blockAll: 'Sedang tersebar di Singapura minggu ini',
      blockNone: town => `Tiada penipuan disahkan di ${town} minggu ini.`,
      hit: n => `${n} jiran terkena`,
      pasteLabel: 'Tampal di sini, atau muat naik tangkapan skrin',
      placeholder: 'Tampal mesej di sini',
      send: 'Tanya jiran sekarang',
      upload: 'Muat naik tangkapan skrin',
      remove: 'Buang tangkapan skrin',
      shotAlt: 'Tangkapan skrin anda',
      help: 'Wang sedang keluar dari akaun anda? Hubungi {999}. Untuk nasihat, ScamShield {1799}, bila-bila masa.',
      noticed: 'Apa yang kami perasan',
      vEmpty: 'Tampal mesej untuk menyemaknya.',
      vNone: 'Tiada tanda bahaya yang jelas. Masih ragu? Tanya jiran.',
      vOne: '1 tanda bahaya. Berhenti sejenak sebelum membalas.',
      vMany: n => `${n} tanda bahaya. Jangan tekan, jangan bayar.`,
      footnote: 'Ini masa untuk berhenti sejenak, bukan keputusan. Setiap kes disemak sendiri oleh seorang jiran.',
      more: 'Pilihan lain: bagaimana ia sampai, atau minta panggilan balik',
      channel: 'Bagaimana anda menerimanya?',
      cbIntro: 'Lebih suka bercakap? Tinggalkan nombor anda dan sukarelawan akan menelefon anda.',
      cbName: 'Nama anda', cbPhone: 'Nombor telefon', cbLang: 'Bahasa untuk panggilan',
      privacy: 'Hanya sukarelawan yang disahkan dapat melihat kes anda. Jangan sekali-kali hantar kata laluan, OTP atau nombor kad penuh.',
      cases: 'Kes saya', inbox: 'Peti masuk sukarelawan',
      needInput: 'Sila tampal mesej atau tambah tangkapan skrin dahulu.',
      sent: 'Dihantar! Seorang sukarelawan akan menyemaknya sebentar lagi.',
      imgType: 'Sila pilih imej JPEG, PNG atau WebP.',
      imgSize: 'Imej itu melebihi 2 MB. Sila pilih yang lebih kecil.',
      casesOffline: 'Kes anda tidak dapat dimuatkan sekarang. Semakan di atas masih berfungsi.'
    },
    ta: {
      aiHeadline: 'ஒரு செய்தி பற்றிச் சந்தேகமா? AI-யிடம் கேளுங்கள்.',
      aiChatLabel: 'உதவியாளருடன் உரையாடுங்கள்',
      aiTry: 'இப்படிக் கேட்கலாம்',
      aiPerson: 'ஒரு நபரிடம் பேச விரும்புகிறீர்களா?',
      aiPersonText: 'பயிற்சி பெற்ற தொண்டூழியர்கள் ஒவ்வொரு வழக்கையும் நேரடியாகச் சரிபார்க்கிறார்கள், உங்களைத் திரும்ப அழைக்கவும் முடியும்.',
      aiUrgent: 'உங்கள் கணக்கிலிருந்து இப்போதே பணம் போகிறதா?',
      assistant: 'AI-யிடம் கேளுங்கள்',
      aiKicker: 'AI உதவியாளர் · இது தவறு செய்யலாம்',
      aiIntro: 'என்ன நடந்தது என்று சொல்லுங்கள், அல்லது உங்களுக்கு வந்த செய்தியை ஒட்டுங்கள். அபாய அறிகுறிகளையும் அடுத்து என்ன செய்வது என்பதையும் சொல்வேன். எனக்கு உறுதியாகத் தெரியாதவற்றைப் பயிற்சி பெற்ற தொண்டூழியர் சரிபார்க்கலாம்.',
      aiPlaceholder: 'உங்கள் கேள்வியைத் தட்டச்சு செய்யுங்கள் அல்லது செய்தியை ஒட்டுங்கள்',
      aiSend: 'அனுப்பு',
      aiAttach: 'திரைப்பிடிப்பைச் சேர்',
      aiRemove: 'திரைப்பிடிப்பை நீக்கு',
      aiHandoff: 'இந்த உரையாடலைத் தொண்டூழியருக்கு அனுப்பு',
      aiNew: 'புதிய உரையாடலைத் தொடங்கு',
      aiNote: 'பதிலளிக்க உங்கள் செய்திகள் Anthropic உருவாக்கிய AI ஆன Claude-க்கு அனுப்பப்படுகின்றன. கடவுச்சொல், OTP அல்லது அட்டை எண்ணை ஒருபோதும் பகிர வேண்டாம்.',
      aiNoteGemini: 'பதிலளிக்க உங்கள் செய்திகள் Google-இன் AI சேவையான Gemini-க்கு அனுப்பப்படுகின்றன. இலவசத் திட்டத்தில் Google தன் சேவைகளை மேம்படுத்த அவற்றைப் பயன்படுத்தக்கூடும், எனவே தனிப்பட்ட விவரங்களைச் சேர்க்க வேண்டாம். கடவுச்சொல், OTP அல்லது அட்டை எண்ணை ஒருபோதும் பகிர வேண்டாம்.',
      aiOff: 'உதவியாளர் இன்னும் இயக்கப்படவில்லை. பயிற்சி பெற்ற தொண்டூழியரிடம் இன்னும் கேட்கலாம்.',
      aiAskVolunteer: 'தொண்டூழியரிடம் கேளுங்கள்',
      aiYou: 'நீங்கள்',
      aiName: 'உதவியாளர்',
      aiThinking: 'யோசிக்கிறது…',
      aiError: 'மன்னிக்கவும், உதவியாளரால் இப்போது பதிலளிக்க முடியவில்லை. மீண்டும் முயலுங்கள், அல்லது தொண்டூழியரிடம் கேளுங்கள்.',
      aiSent: 'தொண்டூழியருக்கு அனுப்பப்பட்டது. செய்தியைச் சரிபார் பக்கத்தில் என் வழக்குகள் பகுதியில் இந்த உரையாடல் இருக்கும்.',
      aiShotNote: '(நான் ஒரு திரைப்பிடிப்பை இணைத்துள்ளேன்.)',
      aiSuggest: ['பார்சல் கட்டணம் பற்றி எனக்கு ஒரு SMS வந்தது. இது உண்மையா?', 'ஒருவர் காவல்துறையிலிருந்து அழைப்பதாகச் சொன்னார்.', 'நான் ஏற்கெனவே ஒரு இணைப்பைத் தொட்டுவிட்டேன். இப்போது என்ன செய்வது?'],
      menu: 'பட்டியல்',
      navPause: 'நிறுத்து', navCheck: 'செய்தியைச் சரிபார்',
      navRadar: 'மோசடி ரேடார்', navCommunity: 'சமூகம்', navLearn: 'கற்றல்',
      langLabel: 'மொழி', textSize: 'எழுத்து அளவு A+', volunteer: 'தொண்டூழியர் உள்நுழைவு', signOut: 'தொண்டூழியர் வெளியேறு',
      headline: 'சந்தேகமான செய்தி வந்ததா? கம்பத்திடம் கேளுங்கள்.',
      onDuty: 'இன்றிரவு பணியிலுள்ள அண்டை வீட்டார்',
      callMeBack: 'என்னைத் திரும்ப அழையுங்கள்',
      dutyNone: town => `${town} பகுதிக்கு இன்னும் தொண்டூழியர்கள் பதிவு செய்யவில்லை. இருந்தாலும் கேளுங்கள்: சிங்கப்பூர் முழுவதும் உள்ள தொண்டூழியர்கள் பதிலளிப்பார்கள்.`,
      block: 'இந்த வாரம் உங்கள் பகுதியில் பரவுபவை',
      blockAll: 'இந்த வாரம் சிங்கப்பூரில் பரவுபவை',
      blockNone: town => `இந்த வாரம் ${town} பகுதியில் சரிபார்க்கப்பட்ட மோசடி எதுவும் இல்லை.`,
      hit: n => `${n} அண்டை வீட்டார் பாதிப்பு`,
      pasteLabel: 'அதை இங்கே ஒட்டுங்கள், அல்லது திரைப்பிடிப்பைப் பதிவேற்றுங்கள்',
      placeholder: 'செய்தியை இங்கே ஒட்டுங்கள்',
      send: 'இப்போதே அண்டை வீட்டாரிடம் கேளுங்கள்',
      upload: 'திரைப்பிடிப்பைப் பதிவேற்று',
      remove: 'திரைப்பிடிப்பை நீக்கு',
      shotAlt: 'உங்கள் திரைப்பிடிப்பு',
      help: 'உங்கள் கணக்கிலிருந்து இப்போதே பணம் போகிறதா? {999} ஐ அழையுங்கள். ஆலோசனைக்கு, ScamShield {1799}, எந்நேரமும்.',
      noticed: 'நாங்கள் கவனித்தவை',
      vEmpty: 'சரிபார்க்க ஒரு செய்தியை ஒட்டுங்கள்.',
      vNone: 'வெளிப்படையான அபாய அறிகுறிகள் இல்லை. இன்னும் சந்தேகமா? அண்டை வீட்டாரிடம் கேளுங்கள்.',
      vOne: '1 அபாய அறிகுறி. பதில் அனுப்பும் முன் சற்று நிதானியுங்கள்.',
      vMany: n => `${n} அபாய அறிகுறிகள். தொடாதீர்கள், பணம் செலுத்தாதீர்கள்.`,
      footnote: 'இது ஒரு இடைநிறுத்தம், தீர்ப்பு அல்ல. ஒவ்வொரு வழக்கையும் ஒரு அண்டை வீட்டார் நேரடியாகச் சரிபார்க்கிறார்.',
      more: 'மேலும்: அது எப்படி வந்தது, அல்லது திரும்ப அழைக்கக் கோருங்கள்',
      channel: 'அது உங்களுக்கு எப்படி வந்தது?',
      cbIntro: 'பேச விரும்புகிறீர்களா? உங்கள் எண்ணைத் தாருங்கள், ஒரு தொண்டூழியர் உங்களைத் திரும்ப அழைப்பார்.',
      cbName: 'உங்கள் பெயர்', cbPhone: 'தொலைபேசி எண்', cbLang: 'அழைப்பின் மொழி',
      privacy: 'சரிபார்க்கப்பட்ட தொண்டூழியர்கள் மட்டுமே உங்கள் வழக்கைப் பார்ப்பார்கள். கடவுச்சொல், OTP அல்லது முழு அட்டை எண்ணை ஒருபோதும் அனுப்பாதீர்கள்.',
      cases: 'என் வழக்குகள்', inbox: 'தொண்டூழியர் உள்பெட்டி',
      needInput: 'முதலில் செய்தியை ஒட்டுங்கள் அல்லது திரைப்பிடிப்பைச் சேர்க்கவும்.',
      sent: 'அனுப்பப்பட்டது! ஒரு தொண்டூழியர் விரைவில் பார்ப்பார்.',
      imgType: 'JPEG, PNG அல்லது WebP படத்தைத் தேர்ந்தெடுங்கள்.',
      imgSize: 'அந்தப் படம் 2 MB-க்கு மேல் உள்ளது. சிறிய படத்தைத் தேர்ந்தெடுங்கள்.',
      casesOffline: 'உங்கள் வழக்குகளை இப்போது ஏற்ற முடியவில்லை. மேலே உள்ள சரிபார்ப்பு இன்னும் வேலை செய்யும்.'
    }
  };

  function say(key, ...args) {
    const own = ASK_COPY[prefs.lang] || {};
    const v = key in own ? own[key] : ASK_COPY.en[key];
    return typeof v === 'function' ? v(...args) : v;
  }

  /* Languages a volunteer can call back in. Must match LANGS in server/src/routes/cases.js. */
  const CALLBACK_LANGS = ['English', '华语 (Mandarin)', 'Bahasa Melayu', 'தமிழ் (Tamil)', 'Hokkien / Teochew'];
  const CALLBACK_LANG_FOR = { English: 'English', 华语: '华语 (Mandarin)', Melayu: 'Bahasa Melayu', தமிழ்: 'தமிழ் (Tamil)', Hokkien: 'Hokkien / Teochew' };
  const CALLBACK_LANG_FOR_UI = { en: 'English', zh: '华语 (Mandarin)', ms: 'Bahasa Melayu', ta: 'தமிழ் (Tamil)' };

  /* Kampung greeting by time of day: pagi (morning), petang (afternoon and early evening), malam (night). */
  function greeting(name) {
    const h = new Date().getHours();
    return `Selamat ${h < 12 ? 'pagi' : h < 19 ? 'petang' : 'malam'}, ${name}.`;
  }

  const initials = name => name.replace(/^(Aunty|Uncle|Mr|Mrs|Mdm|Ms|Encik|Puan)\s+/i, '')
    .split(/\s+/).map(w => w[0]).join('').slice(0, 2).toUpperCase();

  async function renderAsk(seq) {
    const vol = isVolunteer();
    const town = userTown();
    let blockReports = null;

    main.innerHTML = `
      <div class="check-first">

        <div class="cf-body">
          <div class="cf-intro">
            <p class="cf-greeting" id="askGreeting" hidden></p>
            <h1 class="cf-headline" data-i18n="headline"></h1>
          </div>

          <div class="cf-columns">
            <form class="cf-input" id="askForm" novalidate>
              <div class="field">
                <label for="askText" data-i18n="pasteLabel"></label>
                <textarea id="askText" class="input" rows="5" maxlength="4000" data-i18n-placeholder="placeholder"></textarea>
              </div>
              <input type="file" id="askImg" class="sr-only" accept="${SCREENSHOT_TYPES.join(',')}" tabindex="-1" aria-hidden="true">
              <div class="cf-actions">
                <button type="submit" class="btn btn-primary"><span data-i18n="send"></span></button>
                <button type="button" class="btn btn-secondary" id="askUploadBtn"><span data-i18n="upload"></span></button>
              </div>
              <div class="cf-shot" id="askImgPrev" hidden></div>
              <p class="cf-help" id="askHelp"></p>
            </form>

            <section class="cf-results" aria-live="polite" aria-labelledby="askNoticed">
              <h2 class="cf-kicker" id="askNoticed" data-i18n="noticed"></h2>
              <p class="cf-verdict" id="askVerdict"></p>
              <ol class="cf-flags" id="askFlagList" role="list"></ol>
            </section>
          </div>

          <!-- Read by the form's submit handler (by id), so it can sit outside the form.
               "Call me back" next to a neighbour on duty opens it. -->
          <details class="cf-more" id="callbackBox">
            <summary data-i18n="more"></summary>
            <div class="cf-more-body">
              <div class="field">
                <label for="askChannel" data-i18n="channel"></label>
                <select id="askChannel" class="input">
                  ${KW.CHANNELS.map(c => `<option>${esc(c)}</option>`).join('')}
                </select>
              </div>
              <p class="cf-note" data-i18n="cbIntro"></p>
              <div class="cf-callback">
                <div class="field"><label for="cbName" data-i18n="cbName"></label><input type="text" id="cbName" class="input" maxlength="60" autocomplete="given-name"></div>
                <div class="field"><label for="cbPhone" data-i18n="cbPhone"></label><input type="tel" id="cbPhone" class="input" inputmode="tel" maxlength="20" autocomplete="tel" placeholder="8123 4567"></div>
                <div class="field"><label for="cbLang" data-i18n="cbLang"></label>
                  <select id="cbLang" class="input">${CALLBACK_LANGS.map(l => `<option>${esc(l)}</option>`).join('')}</select>
                </div>
              </div>
              <p class="cf-note" data-i18n="privacy"></p>
            </div>
          </details>

          <div class="cf-neighbours">
            <section aria-labelledby="dutyTitle">
              <h2 class="cf-kicker" id="dutyTitle" data-i18n="onDuty"></h2>
              <ul class="duty-list" id="dutyList" role="list"></ul>
            </section>
            <section aria-labelledby="blockTitle">
              <h2 class="cf-kicker" id="blockTitle"></h2>
              <ul class="block-list" id="blockList" role="list"></ul>
            </section>
          </div>
        </div>

        <section class="cf-cases" aria-labelledby="casesTitle">
          <h2 id="casesTitle" data-i18n="${vol ? 'inbox' : 'cases'}"></h2>
          <p class="vol-only cf-note">Replies you send here go to residents as ${esc(vol ? prefs.volunteer.name : 'a volunteer')}.</p>
          <div id="caseList"></div>
        </section>
      </div>`;
    document.body.classList.add('route-ask');

    const screen = $('.check-first');
    const text = $('#askText');
    let shownCheck = null;

    // Re-draws only when the result changes, so screen readers hear each new verdict once.
    function updateCheck(force = false) {
      const value = text.value;
      const flags = value.trim() ? analyse(value).flags : [];
      const key = prefs.lang + '|' + (value.trim() ? flags.map(f => f.id).join(',') : '-');
      if (key === shownCheck && !force) return;
      shownCheck = key;
      $('#askVerdict').textContent = !value.trim() ? say('vEmpty')
        : flags.length === 0 ? say('vNone')
        : flags.length === 1 ? say('vOne')
        : say('vMany', flags.length);
      $('#askFlagList').innerHTML = flags.map((f, i) => `
        <li>
          <span class="cf-flag-n">${i + 1}</span>
          <span class="cf-flag-label">${esc(f.label)}</span>
          <span class="cf-flag-tip">${esc(f.tip)}</span>
        </li>`).join('');
    }

    function paintCopy() {
      screen.lang = prefs.lang;
      $$('[data-i18n]', screen).forEach(el => { el.textContent = say(el.dataset.i18n); });
      $$('[data-i18n-placeholder]', screen).forEach(el => { el.placeholder = say(el.dataset.i18nPlaceholder); });
      $$('[data-i18n-label]', screen).forEach(el => { el.setAttribute('aria-label', say(el.dataset.i18nLabel)); });
      const call = n => `<a href="tel:${n}">${n}</a>`;
      $('#askHelp').innerHTML = esc(say('help')).replace('{999}', call('999')).replace('{1799}', call('1799'));
      const rm = $('#askImgPrev button');
      if (rm) { rm.textContent = say('remove'); $('#askImgPrev img').alt = say('shotAlt'); }
      const name = userName();
      $('#askGreeting').hidden = !name;
      $('#askGreeting').textContent = name ? greeting(name) : '';
      $('#blockTitle').textContent = town ? say('block') : say('blockAll');
      drawDuty();
      drawBlock();
      updateCheck(true);
    }

    /* Volunteers from the seed data who cover the user's town. */
    function drawDuty() {
      const list = $('#dutyList');
      const onDuty = town ? KW.VOLUNTEERS.filter(v => v.area === town) : KW.VOLUNTEERS.slice(0, 3);
      if (!onDuty.length) { list.innerHTML = `<li class="cf-note">${esc(say('dutyNone', town))}</li>`; return; }
      list.innerHTML = onDuty.map((v, i) => `
        <li class="duty">
          <span class="duty-avatar" aria-hidden="true">${esc(initials(v.name))}</span>
          <span class="duty-who"><span class="duty-name">${esc(v.name)}</span><span class="duty-meta">${esc(v.role)} · ${esc(v.langs)}</span></span>
          <button type="button" class="btn btn-ghost" data-callme="${i}" aria-label="${esc(say('callMeBack'))}: ${esc(v.name)}">${esc(say('callMeBack'))}</button>
        </li>`).join('');
      $$('[data-callme]', list).forEach(b => b.addEventListener('click', () => {
        const v = onDuty[Number(b.dataset.callme)];
        // Prefer the resident's own language if this volunteer speaks it.
        const mine = CALLBACK_LANG_FOR_UI[prefs.lang];
        const spoken = v.langs.split(/,\s*/).map(l => CALLBACK_LANG_FOR[l]).filter(Boolean);
        $('#cbLang').value = spoken.includes(mine) ? mine : (spoken[0] || 'English');
        const box = $('#callbackBox');
        box.open = true;
        box.scrollIntoView({ behavior: 'smooth', block: 'center' });
        $('#cbName').focus({ preventScroll: true });
      }));
    }

    /* The top verified scams in the user's town this week, from the Scam Radar. */
    function drawBlock() {
      const list = $('#blockList');
      if (!blockReports) { list.innerHTML = ''; return; }
      const top = [...blockReports].sort((a, b) => b.count - a.count).slice(0, 4);
      list.innerHTML = top.length ? top.map(r => `
        <li class="block-row">
          <a href="#/radar" class="block-title">${esc(r.title)}</a>
          <span class="block-leader" aria-hidden="true"></span>
          <span class="block-count" aria-label="${esc(say('hit', r.count))}">${r.count}</span>
        </li>`).join('') : `<li class="cf-note">${esc(say('blockNone', town))}</li>`;
    }

    paintCopy();
    text.addEventListener('input', () => updateCheck());

    onLangChange = paintCopy; // the header's language dropdown re-translates this screen

    // Screenshot: JPEG, PNG or WebP up to 2 MB, downscaled in the browser before sending.
    const fileInput = $('#askImg');
    const preview = $('#askImgPrev');
    let image = null;
    const clearImage = () => { image = null; fileInput.value = ''; preview.innerHTML = ''; preview.hidden = true; };
    $('#askUploadBtn').addEventListener('click', () => fileInput.click());
    fileInput.addEventListener('change', async () => {
      const file = fileInput.files[0];
      if (!file) return;
      if (!SCREENSHOT_TYPES.includes(file.type)) { clearImage(); toast(say('imgType'), 'warn'); return; }
      if (file.size > SCREENSHOT_MAX) { clearImage(); toast(say('imgSize'), 'warn'); return; }
      try {
        image = await readImage(file);
        preview.innerHTML = `<img src="${esc(image)}" alt="${esc(say('shotAlt'))}"><button type="button" class="btn btn-ghost">${esc(say('remove'))}</button>`;
        preview.hidden = false;
        $('button', preview).addEventListener('click', () => { clearImage(); $('#askUploadBtn').focus(); });
      } catch (err) {
        clearImage();
        toast(err.message, 'warn');
      }
    });

    $('#askForm').addEventListener('submit', e => {
      e.preventDefault();
      const body = text.value.trim();
      const wantsCall = $('#callbackBox').open && $('#cbPhone').value.trim();
      // A call-back request on its own is fine: some residents would rather talk than type.
      if (!body && !image && !wantsCall) {
        toast(say('needInput'), 'warn');
        text.focus();
        return;
      }
      act(e.submitter, async () => {
        const c = await api.post('/cases', {
          channel: $('#askChannel').value,
          text: body,
          image,
          callback: wantsCall ? { name: $('#cbName').value, phone: $('#cbPhone').value, lang: $('#cbLang').value } : null
        });
        upsert(cache.cases, c);
        toast(say('sent'), 'ok');
        $('#askForm').reset();
        $('#cbName').value = $('#cbPhone').value = ''; // these sit outside the form
        $('#callbackBox').open = false;
        clearImage();
        updateCheck();
        renderCaseList();
        $('#casesTitle').scrollIntoView({ behavior: 'smooth' });
      });
    });

    // The check works without the server; only the case list and the block alerts need it.
    const q = new URLSearchParams({ status: 'verified', days: 7, limit: 200 });
    if (town) q.set('town', town);
    api.get('/reports?' + q).then(reports => {
      if (stale(seq)) return;
      blockReports = reports;
      drawBlock();
    }).catch(() => {});
    try {
      const cases = await api.get('/cases');
      if (stale(seq)) return;
      cache.cases = cases;
      renderCaseList();
    } catch (err) {
      if (stale(seq)) return;
      $('#caseList').innerHTML = `<p class="cf-note">${esc(say('casesOffline'))}</p>`;
    }
  }

  /* [label, Broadsheet tag variant] */
  const VERDICTS = {
    scam: ['Scam', 'tag-accent-2'],
    suspicious: ['Suspicious', 'tag-accent-2'],
    safe: ['Likely safe', 'tag-accent']
  };

  /* Which side of the chat a message sits on depends on who is looking. */
  function messageSide(m, vol) {
    if (m.from === 'system') return 'system';
    if (m.from === 'resident') return vol ? 'them' : 'me';
    return vol ? 'me' : 'vol';
  }

  function renderCaseList() {
    const list = $('#caseList');
    if (!list) return;
    // Preserve anything typed in reply boxes across re-renders.
    const drafts = {};
    $$('textarea[data-case]', list).forEach(t => { drafts[t.dataset.case] = t.value; });
    const focused = document.activeElement && document.activeElement.dataset ? document.activeElement.dataset.case : null;
    const vol = isVolunteer();

    if (!cache.cases.length) {
      list.innerHTML = `<div class="empty"><p>${vol ? 'No cases in the inbox right now.' : 'No cases yet. When you send something to check, the conversation with your volunteer appears here.'}</p></div>`;
      return;
    }

    list.innerHTML = cache.cases.map(c => {
      const status = { waiting: ['Waiting for volunteer', 'tag-outline'], replied: ['Volunteer replied', 'tag-accent'], resolved: ['Resolved', 'tag-neutral'] }[c.status];
      return `
        <article class="case" id="case-${esc(c.id)}">
          <header class="case-head">
            <div class="tag-row">
              <span class="tag ${status[1]}">${status[0]}</span>
              ${c.verdict ? `<span class="tag ${VERDICTS[c.verdict][1]}">${VERDICTS[c.verdict][0]}</span>` : ''}
              ${c.callback ? `<span class="tag tag-neutral">Call-back requested</span>` : ''}
              ${vol && c.mine ? `<span class="tag tag-neutral">Your own case</span>` : ''}
            </div>
            <span class="muted">${esc(c.channel)} · ${timeAgo(c.created)}</span>
          </header>
          ${vol && c.callback ? `<p class="callback-note">Call <strong>${esc(c.callback.name || 'the resident')}</strong> at <a href="tel:${esc(c.callback.phone.replace(/\s/g, ''))}">${esc(c.callback.phone)}</a> · ${esc(c.callback.lang)}</p>` : ''}
          <blockquote class="case-quote">${c.text ? nl2br(c.text) : c.image ? '<em>(screenshot only)</em>' : '<em>(call-back request)</em>'}</blockquote>
          ${c.image ? `<img class="case-img" src="${esc(c.image)}" alt="Screenshot attached to case">` : ''}
          <div class="thread">
            ${c.messages.map(m => `
              <div class="msg msg-${messageSide(m, vol)}">
                ${m.from === 'vol' ? `<span class="msg-name">${esc(m.name)}</span>` : ''}
                ${m.from === 'resident' && vol ? `<span class="msg-name">Resident</span>` : ''}
                <p>${nl2br(m.body)}</p>
                <time>${timeAgo(m.at)}</time>
              </div>`).join('')}
            ${c.status === 'waiting' && c.volunteer && !vol ? `<div class="msg msg-system typing">${esc(c.volunteer.name)} is typing<span class="dots"><i></i><i></i><i></i></span></div>` : ''}
          </div>
          ${c.status !== 'resolved' ? `
            ${vol ? `
              <div class="verdict-row" role="group" aria-label="Set verdict">
                <span class="muted">Verdict:</span>
                ${Object.entries(VERDICTS).map(([k, [label]]) => `<button class="btn ${c.verdict === k ? 'btn-primary' : 'btn-secondary'}" data-verdict="${k}" data-id="${esc(c.id)}" aria-pressed="${c.verdict === k}">${label}</button>`).join('')}
              </div>` : ''}
            <form class="reply-form" data-id="${esc(c.id)}">
              <label class="sr-only" for="reply-${esc(c.id)}">Reply</label>
              <textarea id="reply-${esc(c.id)}" class="input" data-case="${esc(c.id)}" rows="2" maxlength="3000" placeholder="${vol ? 'Reply to the resident as a volunteer…' : 'Add more details or ask a follow-up…'}">${esc(drafts[c.id] || '')}</textarea>
              <button class="btn btn-primary" type="submit">Send</button>
            </form>` : ''}
          <footer class="case-actions">
            ${c.status !== 'resolved' ? `<button class="btn btn-ghost" data-resolve="${esc(c.id)}">Mark resolved</button>` : ''}
            ${c.shared ? `<a class="btn btn-ghost" href="#/community/post/${esc(c.shared)}">View community post</a>`
              : c.mine ? `<button class="btn btn-ghost" data-share="${esc(c.id)}">Share anonymously with the community</button>` : ''}
            ${c.verdict === 'scam' ? `<button class="btn btn-ghost" data-radar="${esc(c.id)}">Report to Scam Radar</button>` : ''}
          </footer>
        </article>`;
    }).join('');

    if (focused) {
      const t = $(`textarea[data-case="${CSS.escape(focused)}"]`, list);
      if (t) { t.focus(); t.setSelectionRange(t.value.length, t.value.length); }
    }

    const findCase = id => cache.cases.find(x => x.id === id);
    const update = c => { upsert(cache.cases, c); renderCaseList(); };

    $$('.reply-form', list).forEach(f => f.addEventListener('submit', e => {
      e.preventDefault();
      const ta = $('textarea', f);
      const body = ta.value.trim();
      if (!body) return;
      act(e.submitter, async () => {
        const c = await api.post(`/cases/${encodeURIComponent(f.dataset.id)}/messages`, { body });
        ta.value = '';
        update(c);
      });
    }));

    $$('[data-verdict]', list).forEach(b => b.addEventListener('click', () => act(b, async () => {
      const c = findCase(b.dataset.id);
      const verdict = c.verdict === b.dataset.verdict ? null : b.dataset.verdict;
      update(await api.post(`/cases/${encodeURIComponent(c.id)}/verdict`, { verdict }));
    })));

    $$('[data-resolve]', list).forEach(b => b.addEventListener('click', () => act(b, async () => {
      update(await api.post(`/cases/${encodeURIComponent(b.dataset.resolve)}/resolve`));
    })));

    $$('[data-share]', list).forEach(b => b.addEventListener('click', () => act(b, async () => {
      const id = b.dataset.share;
      const { postId } = await api.post(`/cases/${encodeURIComponent(id)}/share`);
      update(await api.get('/cases/' + encodeURIComponent(id)));
      toast('Shared to the community with personal details hidden.', 'ok', { link: '#/community/post/' + postId, linkText: 'Open post' });
    })));

    $$('[data-radar]', list).forEach(b => b.addEventListener('click', () => {
      const c = findCase(b.dataset.radar);
      openReportModal({ desc: c.text, channel: c.channel, image: c.image });
    }));
  }

  /* =========================================================
     PAUSE — the Kampung Circle steps in while it's happening
     ========================================================= */
  const SIGN_LABEL = Object.fromEntries(KW.PAUSE_SIGNS.map(s => [s.id, s.label]));
  const OUTCOMES = {
    stopped: ['Scam stopped', 'tag-accent'],
    safe: ['False alarm', 'tag-neutral'],
    lost: ['Money or details lost', 'tag-accent-2']
  };
  const DRILL_RESULTS = {
    paused: ['Pressed Pause', 'tag-accent'],
    ignored: ['Deleted it', 'tag-accent'],
    clicked: ['Fell for it', 'tag-accent-2']
  };

  const pauseState = { circle: null, pauses: [], stats: null, drillStats: null, suggest: {} };
  let pauseTimer = null;

  const fmtClock = s => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
  const escalateSeconds = () => (pauseState.stats && pauseState.stats.escalateAfterSeconds) || 90;
  function fmtWait() {
    const s = escalateSeconds();
    return s >= 120 && s % 60 === 0 ? `${s / 60} minutes` : `${s} seconds`;
  }

  async function loadPauseData() {
    const [circle, pauses, stats, drillStats] = await Promise.all([
      api.get('/circles/me'), api.get('/pauses'), api.get('/pauses/stats'),
      isVolunteer() ? api.get('/drills/stats') : null
    ]);
    Object.assign(pauseState, { circle, pauses, stats, drillStats });
    cache.circle = circle;
    paintHeader(); // the header shows the town from the resident's Circle
  }

  async function renderPause(seq, sub) {
    await loadPauseData();
    if (stale(seq)) return;
    main.innerHTML = `
      <div class="page pause-page">
        <header class="page-head">
          <div>
            <p class="kicker">Pause · before you pay</p>
            <h1 class="display">Someone pushing you to pay? Press Pause.</h1>
          </div>
          <div class="head-side">
            <p class="lede">Scammers win by keeping you alone and in a hurry. Pause brings in the people you trust. Your Circle gets an alert straight away and calls you. If no one answers within ${fmtWait()}, a volunteer near you steps in.</p>
          </div>
        </header>
        <section id="pauseZone" class="pause-zone" aria-label="Pause"></section>
        <section id="installZone" class="section install-zone" aria-labelledby="installTitle"></section>
        <section id="guardZone" class="section" aria-labelledby="guardTitle" hidden></section>
        <section id="volPauseZone" class="section vol-only" aria-labelledby="volPauseTitle"></section>
        <section id="circleZone" class="section" aria-labelledby="circleTitle"></section>
        <section class="section" aria-labelledby="impactTitle">
          <h2 class="section-title" id="impactTitle">Pause so far</h2>
          <div class="stat-row pause-stats" id="pauseStats"></div>
        </section>
      </div>`;
    const page = $('.pause-page');
    page.addEventListener('click', onPauseClick);
    page.addEventListener('submit', onPauseSubmit);
    page.addEventListener('change', onPauseChange);
    redrawPause();
    if (sub === 'now') {
      // Back or reload must never send a second alert.
      history.replaceState(null, '', '#/pause');
      current.args = [];
      startLaunch();
    }
  }

  async function refreshPause() {
    if (!onPausePage() || !$('.pause-page')) return;
    try { await loadPauseData(); } catch (e) { return; }
    if (onPausePage() && $('.pause-page')) redrawPause();
  }

  /* Redraws every part of the page, keeping anything typed and where the focus was. */
  function redrawPause() {
    const page = $('.pause-page');
    const kept = {};
    $$('input[id], select[id], textarea[id]', page).forEach(el => { kept[el.id] = el.value; });
    const activeId = document.activeElement && page.contains(document.activeElement) ? document.activeElement.id : null;

    drawPauseZone();
    drawInstallZone();
    drawGuardZone();
    drawVolPauseZone();
    drawCircleZone();
    drawPauseStats();

    Object.entries(kept).forEach(([id, value]) => {
      const el = document.getElementById(id);
      if (el && page.contains(el) && el.type !== 'file') el.value = value;
    });
    if (activeId) {
      const el = document.getElementById(activeId);
      if (el) {
        el.focus({ preventScroll: true });
        if (el.setSelectionRange && /^(text|search|tel|)$/.test(el.type || '')) el.setSelectionRange(el.value.length, el.value.length);
      }
    }
    applySuggestions(kept);
    startPauseClock();
  }

  /* ---------- your own Pause ---------- */
  function drawPauseZone() {
    const zone = $('#pauseZone');
    const { circle, pauses } = pauseState;
    const open = pauses.find(p => p.role === 'owner' && p.status === 'open');
    if (open) { zone.innerHTML = pauseLiveHTML(open); return; }

    const members = circle.mine ? circle.mine.members : [];
    const past = pauses.filter(p => p.role === 'owner').slice(0, 3);
    zone.innerHTML = `
      <div class="pause-start">
        <button type="button" class="pause-btn" id="pauseBtn">
          <span class="pause-btn-word">Pause</span>
          <span class="pause-btn-sub">${members.length ? 'Alert my Circle' : 'Alert a volunteer'}</span>
        </button>
        <div class="pause-who">
          <h2 class="kicker">Who gets the alert</h2>
          ${members.length ? `
            <ul class="pause-people" role="list">${members.map(m => `<li><strong>${esc(m.name)}</strong> <span class="muted">${esc(m.relation)}</span></li>`).join('')}</ul>
            <p class="muted">If no one answers within ${fmtWait()}, volunteers near ${esc(circle.mine.town)} are alerted too.</p>`
          : `
            <p>${circle.mine ? 'No one has joined your Circle yet, so' : 'You haven’t set up your Circle yet, so'} volunteers near you will get the alert.</p>
            <p><button type="button" class="btn btn-secondary" data-jump="circleTitle">${circle.mine ? 'Invite your family' : 'Set up your Circle'}</button></p>`}
          <p class="cf-help">Money leaving your account right now? Call <a href="tel:999">999</a>. For advice, call the ScamShield Helpline <a href="tel:1799">1799</a>.</p>
        </div>
      </div>
      ${past.length ? `
        <div class="pause-history">
          <h2 class="kicker">Your recent Pauses</h2>
          <ul class="plain-list" role="list">${past.map(p => `
            <li>${timeAgo(p.created)}
              ${p.outcome ? `<span class="tag ${OUTCOMES[p.outcome][1]}">${OUTCOMES[p.outcome][0]}</span>` : ''}
              ${p.responder ? `<span class="muted">helped by ${esc(p.responder.name)}</span>` : ''}</li>`).join('')}
          </ul>
        </div>` : ''}`;
  }

  function pauseLiveHTML(p) {
    const waiting = !p.responder && p.stage === 'circle';
    const headline = p.responder ? `${p.responder.name} is calling you now.`
      : p.stage === 'circle' ? 'Your Circle has been alerted.' : 'Volunteers near you have been alerted.';
    const deadline = new Date(p.created).getTime() + escalateSeconds() * 1000;
    return `
      <div class="pause-live">
        <div class="pause-live-main">
          <p class="kicker">Pause is on · started ${timeAgo(p.created)}</p>
          <h2 class="pause-headline" role="status">${esc(headline)}</h2>
          ${p.responder ? `<p class="lede">${esc(p.responder.detail)}${p.responder.kind === 'volunteer' ? ' · volunteer' : ''}</p>` : ''}
          ${waiting ? `
            <p class="pause-clock">If no one answers in <strong id="pauseCountdown" data-deadline="${deadline}">${fmtClock(escalateSeconds())}</strong>, volunteers are alerted too.</p>
            <div class="btn-row"><button type="button" class="btn btn-secondary" data-escalate="${esc(p.id)}">Get a volunteer now</button></div>` : ''}
          <ol class="pause-steps">
            <li><strong>Don’t pay, and don’t share any code.</strong> Not even to “stop” something.</li>
            <li><strong>It’s OK to hang up.</strong> Real police officers and banks won’t mind.</li>
            <li><strong>Wait for the call,</strong> or call the ScamShield Helpline <a href="tel:1799">1799</a>.</li>
          </ol>
          <h3 class="kicker">Messages</h3>
          ${pauseThread(p)}
          ${pauseReplyForm(p, 'Tell them what’s happening…')}
          <h3 class="kicker">How did it end?</h3>
          ${outcomeButtons(p, true)}
        </div>
        <aside class="pause-live-side" aria-labelledby="signsTitle">
          <h3 class="kicker" id="signsTitle">What’s happening? Tap any that apply</h3>
          <div class="sign-list" role="group" aria-labelledby="signsTitle">
            ${KW.PAUSE_SIGNS.map(s => `<button type="button" class="sign-btn" id="sign-${s.id}" data-sign="${s.id}" data-id="${esc(p.id)}" aria-pressed="${p.signs.includes(s.id)}">${esc(s.label)}</button>`).join('')}
          </div>
          <div class="field">
            <label for="pauseCaller">Who do they say they are?</label>
            <select id="pauseCaller" class="input" data-id="${esc(p.id)}">
              <option value="">Not sure</option>
              ${KW.PAUSE_CALLERS.map(c => `<option ${p.caller === c ? 'selected' : ''}>${esc(c)}</option>`).join('')}
            </select>
          </div>
          <p class="muted">Your Circle sees this straight away, so they know what to say when they call.</p>
        </aside>
      </div>`;
  }

  function pauseThread(p) {
    const own = p.role === 'owner';
    return `<div class="thread">${p.messages.map(m => {
      const side = m.from === 'system' ? 'system' : m.from === 'resident' ? (own ? 'me' : 'them') : 'vol';
      const name = m.from === 'resident' ? (own ? '' : p.name) : m.name;
      return `
        <div class="msg msg-${side}">
          ${name && side !== 'system' ? `<span class="msg-name">${esc(name)}</span>` : ''}
          <p>${nl2br(m.body)}</p>
          <time>${timeAgo(m.at)}</time>
        </div>`;
    }).join('')}</div>`;
  }

  function pauseReplyForm(p, placeholder) {
    if (p.status !== 'open') return '';
    const id = esc(p.id);
    return `
      <form class="reply-form" data-pause-reply="${id}">
        <label class="sr-only" for="pr-${id}">Message</label>
        <textarea id="pr-${id}" class="input" rows="2" maxlength="1000" placeholder="${esc(placeholder)}"></textarea>
        <button class="btn btn-primary" type="submit">Send</button>
      </form>`;
  }

  function outcomeButtons(p, own) {
    if (p.status !== 'open') {
      return p.outcome ? `<p><span class="tag ${OUTCOMES[p.outcome][1]}">${OUTCOMES[p.outcome][0]}</span></p>` : '';
    }
    const id = esc(p.id);
    return `
      <div class="btn-row pause-outcomes" role="group" aria-label="How did it end?">
        <button type="button" class="btn btn-primary" data-outcome="stopped" data-id="${id}">${own ? 'I’m safe. I didn’t pay' : `${esc(p.name)} is safe and didn’t pay`}</button>
        <button type="button" class="btn btn-secondary" data-outcome="safe" data-id="${id}">It was genuine</button>
        <button type="button" class="btn btn-ghost" data-outcome="lost" data-id="${id}">${own ? 'I already paid or shared details' : 'Money or details were lost'}</button>
      </div>`;
  }

  /* An open Pause, as a Circle member or volunteer sees it. */
  function helperPauseHTML(p, { escalate = false } = {}) {
    const id = esc(p.id);
    return `
      <div class="guard-pause">
        <p class="pause-headline">${esc(p.name)} pressed Pause ${timeAgo(p.created)}.</p>
        ${p.caller ? `<p>Caller says they are: <strong>${esc(p.caller)}</strong></p>` : ''}
        ${p.signs.length
          ? `<ul class="sign-tags" role="list">${p.signs.map(s => `<li class="tag tag-accent-2">${esc(SIGN_LABEL[s])}</li>`).join('')}</ul>`
          : '<p class="muted">They haven’t added any details yet.</p>'}
        ${p.responder
          ? `<p><strong>${esc(p.responder.name)}</strong> (${esc(p.responder.detail)}) is on it.</p>`
          : `<div class="btn-row">
              <button type="button" class="btn btn-primary btn-lg" data-respond="${id}">I’m on it, calling now</button>
              ${escalate && p.stage === 'circle' ? `<button type="button" class="btn btn-ghost" data-escalate="${id}">Ask a volunteer to call</button>` : ''}
            </div>`}
        ${p.stage === 'volunteer' && escalate ? '<p class="muted">Volunteers have been alerted too.</p>' : ''}
        ${pauseThread(p)}
        ${pauseReplyForm(p, `Message ${p.name}…`)}
        ${outcomeButtons(p, false)}
      </div>`;
  }

  /* ---------- one tap from the home screen ---------- */
  const isStandalone = () => window.matchMedia('(display-mode: standalone)').matches || navigator.standalone === true;
  const isIOS = () => /iphone|ipad|ipod/i.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);

  /* "Emergency button" mode: opening the app from the home screen starts the Pause
     countdown straight away. Off unless chosen, so people can open the app for
     everything else without sending (or having to cancel) an alert every time. */
  const homePauseOn = () => prefs.homePause === true;

  let installPrompt = null; // Android/Chrome's install dialog, saved until the button is pressed
  window.addEventListener('beforeinstallprompt', e => {
    e.preventDefault();
    installPrompt = e;
    if ($('#installZone')) drawInstallZone();
  });
  window.addEventListener('appinstalled', () => {
    installPrompt = null;
    toast('Kampung Watch is on your home screen. Tap it whenever someone pressures you to pay.', 'ok');
    if ($('#installZone')) drawInstallZone();
  });

  function drawInstallZone() {
    const zone = $('#installZone');
    if (!zone) return;
    let how;
    if (isStandalone()) {
      how = '<p>Kampung Watch is on your home screen.</p>';
    } else if (!window.isSecureContext) {
      how = '<p class="muted">Adding to the home screen needs the secure (https://) address of Kampung Watch. Open it from that address on your phone.</p>';
    } else if (installPrompt) {
      how = '<p><button type="button" class="btn btn-primary btn-lg" id="installBtn">Add to home screen</button></p>';
    } else if (isIOS()) {
      how = `<ol class="install-steps">
          <li>Tap the <strong>Share</strong> button in Safari (the square with an arrow).</li>
          <li>Choose <strong>Add to Home Screen</strong>, then <strong>Add</strong>.</li>
        </ol>`;
    } else {
      how = '<p>Open your browser’s menu and choose <strong>Add to Home screen</strong> or <strong>Install app</strong>.</p>';
    }
    zone.innerHTML = `
      <h2 class="kicker" id="installTitle">Pause from your home screen</h2>
      <p>When someone is pushing you to pay, you won’t have time to look for a website. Put Kampung Watch on your home screen: it opens on the Pause button, so help is two taps away.</p>
      ${how}
      <label class="check">
        <input type="checkbox" id="homePause" ${homePauseOn() ? 'checked' : ''}>
        Emergency button: opening Kampung Watch from my home screen starts Pause straight away
      </label>
      <p class="muted">Turn this on only if this phone uses Kampung Watch just for emergencies, for example a phone you set up for a parent.</p>`;
  }

  /* The 5-second countdown before an alert goes out, so a mis-tap can be cancelled. */
  let launch = null;

  function cancelLaunch() {
    if (!launch) return;
    clearInterval(launch.timer);
    document.removeEventListener('keydown', launch.onKey);
    launch.el.remove();
    document.body.classList.remove('modal-open');
    launch = null;
  }

  function startLaunch() {
    const own = pauseState.pauses.find(p => p.role === 'owner' && p.status === 'open');
    if (own || launch) return; // already on: just show it
    const members = pauseState.circle.mine ? pauseState.circle.mine.members : [];
    const who = members.length
      ? `${members.map(m => m.name).join(', ').replace(/, ([^,]*)$/, ' and $1')} will get an alert and call you.`
      : 'Volunteers near you will get an alert and call you.';
    const el = document.createElement('div');
    el.className = 'launch-overlay';
    el.innerHTML = `
      <div class="launch-box" role="alertdialog" aria-modal="true" aria-labelledby="launchTitle" aria-describedby="launchWho">
        <p class="kicker">Pause</p>
        <h2 class="launch-title" id="launchTitle">${members.length ? 'Alerting your Circle in' : 'Alerting volunteers in'} <span class="launch-count" id="launchCount">5</span></h2>
        <p class="launch-who" id="launchWho">${esc(who)}</p>
        <div class="launch-actions">
          <button type="button" class="btn btn-primary btn-lg" id="launchNow">Send now</button>
          <button type="button" class="btn btn-secondary btn-lg" id="launchCancel">Cancel, I tapped by mistake</button>
        </div>
      </div>`;
    document.body.appendChild(el);
    document.body.classList.add('modal-open');

    let left = 5;
    const send = async () => {
      cancelLaunch();
      try {
        await api.post('/pauses');
        // Phones only allow vibration after the person has touched the page.
        if (navigator.vibrate && (!navigator.userActivation || navigator.userActivation.hasBeenActive)) navigator.vibrate([200, 100, 200]);
      } catch (err) {
        toast('Couldn’t send the alert. Don’t pay. Call someone you trust, or the ScamShield Helpline 1799.', 'warn');
      }
      await refreshPause();
      const status = $('.pause-headline');
      if (status) status.scrollIntoView({ block: 'center' });
    };
    launch = {
      el,
      timer: setInterval(() => {
        left -= 1;
        if (left <= 0) send();
        else $('#launchCount').textContent = left;
      }, 1000),
      onKey: e => { if (e.key === 'Escape') cancelLaunch(); }
    };
    document.addEventListener('keydown', launch.onKey);
    $('#launchNow').addEventListener('click', send);
    $('#launchCancel').addEventListener('click', () => {
      cancelLaunch();
      toast('Cancelled. Nothing was sent.');
      const btn = $('#pauseBtn');
      if (btn) btn.focus();
    });
    $('#launchCancel').focus(); // the safe choice gets the focus
  }

  /* ---------- people you look after ---------- */
  function drawGuardZone() {
    const zone = $('#guardZone');
    const list = pauseState.circle.guarding;
    zone.hidden = !list.length;
    if (!list.length) { zone.innerHTML = ''; return; }
    zone.innerHTML = `
      <div class="section-head"><h2 class="section-title" id="guardTitle">People you look after</h2></div>
      ${list.map(g => {
        const id = esc(g.circleId);
        return `
          <article class="guard" id="guard-${id}">
            <header class="guard-head">
              <h3 class="guard-name">${esc(g.name)}</h3>
              <span class="muted">${esc(g.town)} · you’re in their Circle as ${esc(g.relation.toLowerCase())}</span>
            </header>
            ${g.openPause ? helperPauseHTML(g.openPause, { escalate: true })
              : `<p class="muted">No Pause right now. If ${esc(g.name)} presses it, you’ll get an alert on any page of Kampung Watch.</p>`}
            <div class="drill-panel">
              <h4 class="kicker">Scam Drill</h4>
              <p>Send ${esc(g.name)} a safe practice scam. If they press Pause or delete it, they pass. If they fall for it, they get a 30-second lesson and nothing is lost.</p>
              <p class="drill-suggest" data-suggest="${esc(g.town)}" data-for="dt-${id}"></p>
              <div class="inline-form">
                <div class="field">
                  <label for="dt-${id}">Practice message</label>
                  <select id="dt-${id}" class="input">${drillOptions()}</select>
                </div>
                <button type="button" class="btn btn-secondary" data-send-drill="${id}">Send practice scam</button>
              </div>
              ${drillHistory(g.drills, g.drillStats)}
            </div>
            <p><button type="button" class="btn btn-ghost" data-leave="${esc(String(g.memberId))}" data-name="${esc(g.name)}">Leave ${esc(g.name)}’s Circle</button></p>
          </article>`;
      }).join('')}`;
  }

  const drillOptions = () => KW.DRILLS.map(d => `<option value="${esc(d.id)}">${esc(d.name)} (${esc(d.channel)})</option>`).join('');

  function drillHistory(drills, stats) {
    if (!drills.length) return '<p class="muted">No practice scams sent yet.</p>';
    return `
      ${stats.answered ? `<p class="drill-score"><span class="stat-n">${stats.passed}</span> of ${stats.answered} practice scams passed</p>` : ''}
      <ul class="drill-history" role="list">${drills.map(d => `
        <li>
          <span>${esc(d.name)}</span>
          ${d.result ? `<span class="tag ${DRILL_RESULTS[d.result][1]}">${DRILL_RESULTS[d.result][0]}</span>` : '<span class="tag tag-outline">Not answered yet</span>'}
          <span class="muted">${timeAgo(d.created)}${d.sender ? ` · from ${esc(d.sender.name)}` : ''}${d.reportId ? ' · from a Scam Radar wave' : ''}</span>
        </li>`).join('')}
      </ul>`;
  }

  /* "This week's drill": the newest verified scam wave in that town. */
  async function applySuggestions(kept = {}) {
    for (const el of $$('[data-suggest]', main)) {
      const town = el.dataset.suggest;
      if (!pauseState.suggest[town]) {
        pauseState.suggest[town] = await api.get('/drills/suggest?town=' + encodeURIComponent(town)).catch(() => null);
      }
      const s = pauseState.suggest[town];
      if (!s || !el.isConnected) continue;
      el.textContent = s.report
        ? `Verified on Scam Radar in ${town} this week: ${s.report.title}. Suggested practice: ${s.template.name}.`
        : `No new scam wave verified in ${town} lately. Suggested practice: ${s.template.name}.`;
      const select = document.getElementById(el.dataset.for);
      if (select && !(select.id in kept)) select.value = s.template.id;
    }
  }

  /* ---------- volunteers ---------- */
  function drawVolPauseZone() {
    const zone = $('#volPauseZone');
    if (!isVolunteer()) { zone.innerHTML = ''; return; }
    const escalated = pauseState.pauses.filter(p => p.role === 'volunteer');
    const open = escalated.filter(p => p.status === 'open');
    const stats = pauseState.drillStats;
    const estateTown = ($('#estateTown') && $('#estateTown').value) || prefs.volunteer.area;
    zone.innerHTML = `
      <div class="section-head"><h2 class="section-title" id="volPauseTitle">Escalated Pauses</h2></div>
      ${open.length ? open.map(p => `
        <article class="guard">
          <header class="guard-head">
            <h3 class="guard-name">${esc(p.name)}</h3>
            <span class="muted">${esc(p.town || 'Town not set')} · ${p.circleSize ? 'their Circle didn’t answer in time' : 'no Circle set up'}</span>
          </header>
          ${helperPauseHTML(p)}
        </article>`).join('')
        : '<p class="muted">No escalated Pauses right now. When a resident’s Circle doesn’t answer in time, the Pause appears here.</p>'}

      <h3 class="section-title section-title-sm">Estate drill</h3>
      <p>Send this week’s practice scam to every Circle in a town. It matches the newest verified Scam Radar wave there, so residents practise on the scam that’s actually going around.</p>
      <p class="drill-suggest" data-suggest="${esc(estateTown)}" data-for="estateTemplate" id="estateSuggest"></p>
      <div class="inline-form">
        <div class="field"><label for="estateTown">Town</label><select id="estateTown" class="input">${townOptions(estateTown)}</select></div>
        <div class="field"><label for="estateTemplate">Practice message</label><select id="estateTemplate" class="input">${drillOptions()}</select></div>
        <button type="button" class="btn btn-primary" id="estateSend">Send to every Circle in this town</button>
      </div>
      ${stats && stats.byTown.length ? `
        <table class="table drill-table">
          <caption class="kicker">Drill results by town</caption>
          <thead><tr><th scope="col">Town</th><th scope="col" class="num">Sent</th><th scope="col" class="num">Answered</th><th scope="col" class="num">Passed</th></tr></thead>
          <tbody>${stats.byTown.map(t => `
            <tr><td>${esc(t.town)}</td><td class="num">${t.sent}</td><td class="num">${t.answered}</td><td class="num">${t.passRate == null ? '–' : t.passRate + '%'}</td></tr>`).join('')}
          </tbody>
        </table>` : ''}`;
  }

  /* ---------- your Circle ---------- */
  function circleForm(mine) {
    return `
      <form id="circleForm" class="form-grid">
        <div class="field"><label for="circleName">Your name</label><input id="circleName" class="input" maxlength="40" required autocomplete="given-name" value="${esc(mine ? mine.name : '')}"></div>
        <div class="field"><label for="circleTown">Your town</label><select id="circleTown" class="input">${townOptions(mine ? mine.town : (prefs.subscription.town || 'Tampines'))}</select></div>
        <div class="full form-actions"><button type="submit" class="btn btn-primary">${mine ? 'Save' : 'Create my Circle'}</button></div>
      </form>`;
  }

  function drawCircleZone() {
    const zone = $('#circleZone');
    const mine = pauseState.circle.mine;
    const share = mine && `Join my Kampung Circle so you get an alert if a scammer is pressuring me. Open Kampung Watch, go to Pause, choose "Join their Circle" and enter my code: ${mine.inviteCode}. ${location.origin}/#/pause`;
    zone.innerHTML = `
      <div class="section-head"><h2 class="section-title" id="circleTitle" tabindex="-1">Your Kampung Circle</h2></div>
      <div class="circle-layout">
        <div>
          ${mine ? `
            <p class="kicker">Your Circle code</p>
            <p class="circle-code" aria-label="Your Circle code: ${esc(mine.inviteCode.split('').join(' '))}">${esc(mine.inviteCode.slice(0, 3))} ${esc(mine.inviteCode.slice(3))}</p>
            <p>Send this code to your family. They open Kampung Watch on their phone, go to Pause, and choose <strong>Join their Circle</strong>.</p>
            <div class="btn-row">
              <button type="button" class="btn btn-secondary" id="copyCode">Copy code</button>
              <a class="btn btn-secondary" href="https://wa.me/?text=${encodeURIComponent(share)}" target="_blank" rel="noopener">Send on WhatsApp</a>
              <button type="button" class="btn btn-ghost" id="newCode">Make a new code</button>
            </div>
            <h3 class="kicker">In your Circle</h3>
            ${mine.members.length ? `
              <ul class="member-list" role="list">${mine.members.map(m => `
                <li><span><strong>${esc(m.name)}</strong> <span class="muted">${esc(m.relation)}</span></span>
                  <button type="button" class="btn btn-ghost" data-remove="${m.id}" data-name="${esc(m.name)}">Remove</button></li>`).join('')}
              </ul>` : '<p class="muted">No one yet. Until someone joins, your Pause alerts go to volunteers.</p>'}
            ${mine.drills.length ? `<h3 class="kicker">Your practice scams</h3>${drillHistory(mine.drills, mine.drillStats)}` : ''}
            <details class="cf-more"><summary>Change your name or town</summary>${circleForm(mine)}</details>`
          : `
            <p>Your Circle is the people who get an alert when you press Pause: your children, grandchildren, a good friend or a neighbour. Set it up once, then send them your code.</p>
            ${circleForm(null)}`}
        </div>
        <div>
          <h3 class="kicker" id="joinTitle">Look after someone? Join their Circle</h3>
          <p>Ask them for their 6-letter Circle code. You’ll get an alert whenever they press Pause, and you can send them practice scams.</p>
          <form id="joinForm" class="form-grid" aria-labelledby="joinTitle">
            <div class="field full"><label for="joinCode">Their Circle code</label><input id="joinCode" class="input circle-code-input" maxlength="9" required autocomplete="off" autocapitalize="characters" spellcheck="false"></div>
            <div class="field"><label for="joinName">Your name</label><input id="joinName" class="input" maxlength="40" required autocomplete="given-name"></div>
            <div class="field"><label for="joinRelation">You are their</label><select id="joinRelation" class="input">${KW.RELATIONS.map(r => `<option>${esc(r)}</option>`).join('')}</select></div>
            <div class="full form-actions"><button type="submit" class="btn btn-primary">Join their Circle</button></div>
          </form>
        </div>
      </div>`;
  }

  function drawPauseStats() {
    const s = pauseState.stats;
    const stat = (n, label) => `<div class="stat"><span class="stat-n">${n}</span><span class="stat-label">${label}</span></div>`;
    const wait = s.medianResponseSeconds == null ? '–' : s.medianResponseSeconds < 120 ? `${s.medianResponseSeconds}s` : `${Math.round(s.medianResponseSeconds / 60)} min`;
    $('#pauseStats').innerHTML =
      stat(s.pauses, 'Pauses pressed') +
      stat(s.stopped, 'Scams stopped before paying') +
      stat(wait, 'Typical time until a person steps in') +
      stat(s.circles, 'Kampung Circles set up');
  }

  function startPauseClock() {
    clearInterval(pauseTimer);
    const el = $('#pauseCountdown');
    if (!el) return;
    const deadline = Number(el.dataset.deadline);
    const tick = () => {
      const node = $('#pauseCountdown');
      if (!node) { clearInterval(pauseTimer); return; }
      const left = Math.max(0, Math.round((deadline - Date.now()) / 1000));
      node.textContent = left ? fmtClock(left) : 'a moment';
      if (!left) clearInterval(pauseTimer); // the server's "escalated" event redraws the page
    };
    tick();
    pauseTimer = setInterval(tick, 1000);
  }

  /* ---------- actions (one listener per page, so redraws never double up) ---------- */
  const pausePath = (id, action) => `/pauses/${encodeURIComponent(id)}/${action}`;

  function onPauseClick(e) {
    const b = e.target.closest('button');
    if (!b || b.type === 'submit') return;
    const d = b.dataset;

    if (b.id === 'installBtn') {
      const promptEvent = installPrompt;
      installPrompt = null;
      promptEvent.prompt();
      promptEvent.userChoice.finally(drawInstallZone);
    } else if (b.id === 'pauseBtn') {
      startLaunch(); // 5 seconds to cancel a stray tap; sends by itself after that
    } else if (d.jump) {
      const target = document.getElementById(d.jump);
      target.scrollIntoView({ behavior: 'smooth' });
      target.focus({ preventScroll: true });
    } else if (d.sign) {
      b.setAttribute('aria-pressed', String(b.getAttribute('aria-pressed') !== 'true'));
      const signs = $$('[data-sign]', main).filter(x => x.getAttribute('aria-pressed') === 'true').map(x => x.dataset.sign);
      act(null, () => api.post(pausePath(d.id, 'details'), { signs }));
    } else if (d.escalate) {
      act(b, async () => { await api.post(pausePath(d.escalate, 'escalate')); await refreshPause(); });
    } else if (d.respond) {
      act(b, async () => { await api.post(pausePath(d.respond, 'respond')); await refreshPause(); });
    } else if (d.outcome) {
      act(b, async () => {
        await api.post(pausePath(d.id, 'resolve'), { outcome: d.outcome });
        toast(d.outcome === 'lost' ? 'Call your bank’s 24-hour hotline now, then make a police report.' : 'Pause closed. Thank you for checking first.', d.outcome === 'lost' ? 'warn' : 'ok');
        await refreshPause();
      });
    } else if (d.sendDrill) {
      const template = document.getElementById('dt-' + d.sendDrill).value;
      act(b, async () => {
        const drill = await api.post('/drills', { circleId: d.sendDrill, template });
        toast(`Practice scam sent: ${drill.name}. You’ll see here whether they pass.`, 'ok');
        await refreshPause();
      });
    } else if (b.id === 'estateSend') {
      const town = $('#estateTown').value;
      act(b, async () => {
        const res = await api.post('/drills/estate', { town, template: $('#estateTemplate').value });
        toast(res.sent ? `Practice scam sent to ${res.sent} Circle${res.sent === 1 ? '' : 's'} in ${res.town}.` : `No Circles in ${res.town} are waiting for a drill right now.`, res.sent ? 'ok' : 'info');
        await refreshPause();
      });
    } else if (b.id === 'copyCode') {
      const code = pauseState.circle.mine.inviteCode;
      (navigator.clipboard ? navigator.clipboard.writeText(code) : Promise.reject())
        .then(() => toast('Code copied. Paste it into a message to your family.', 'ok'))
        .catch(() => toast(`Your code is ${code}.`));
    } else if (b.id === 'newCode') {
      if (!confirm('Make a new code? The old one will stop working, but people already in your Circle stay in it.')) return;
      act(b, async () => { pauseState.circle = await api.post('/circles/code'); redrawPause(); });
    } else if (d.remove || d.leave) {
      const question = d.remove ? `Remove ${d.name} from your Circle? They won’t get your Pause alerts any more.` : `Leave ${d.name}’s Circle? You won’t get their Pause alerts any more.`;
      if (!confirm(question)) return;
      act(b, async () => { await api.del('/circles/members/' + encodeURIComponent(d.remove || d.leave)); await refreshPause(); });
    }
  }

  function onPauseSubmit(e) {
    const form = e.target;
    e.preventDefault();
    if (form.id === 'circleForm') {
      act(e.submitter, async () => {
        const res = await api.post('/circles', { name: $('#circleName').value, town: $('#circleTown').value });
        toast(pauseState.circle.mine ? 'Saved.' : 'Your Circle is ready. Now send the code to your family.', 'ok');
        pauseState.circle = cache.circle = res;
        paintHeader();
        await refreshPause();
      });
    } else if (form.id === 'joinForm') {
      act(e.submitter, async () => {
        const res = await api.post('/circles/join', { code: $('#joinCode').value, name: $('#joinName').value, relation: $('#joinRelation').value });
        $('#joinCode').value = '';
        const joined = res.guarding[res.guarding.length - 1];
        toast(`You’re in ${joined ? joined.name + '’s' : 'their'} Circle. You’ll get an alert if they press Pause.`, 'ok');
        await refreshPause();
        $('#guardTitle').scrollIntoView({ behavior: 'smooth' });
      });
    } else if (form.dataset.pauseReply) {
      const ta = $('textarea', form);
      const body = ta.value.trim();
      if (!body) return;
      act(e.submitter, async () => {
        await api.post(pausePath(form.dataset.pauseReply, 'messages'), { body });
        ta.value = '';
        await refreshPause();
      });
    }
  }

  function onPauseChange(e) {
    const el = e.target;
    if (el.id === 'homePause') {
      prefs.homePause = el.checked;
      savePrefs();
      toast(el.checked ? 'Opening from the home screen will start Pause, with 5 seconds to cancel.' : 'Opening from the home screen will show the Pause button, ready to tap.');
    } else if (el.id === 'pauseCaller') {
      act(null, () => api.post(pausePath(el.dataset.id, 'details'), { caller: el.value || null }));
    } else if (el.id === 'estateTown') {
      const hint = $('#estateSuggest');
      hint.dataset.suggest = el.value;
      hint.textContent = '';
      applySuggestions();
    }
  }

  /* ---------- live updates, on any page ---------- */
  function showPauseBanner(p) {
    const banner = $('#alertBanner');
    banner.className = 'alert-banner alert-pause';
    banner.innerHTML = `
      <div class="alert-inner">
        <p><strong>${esc(p.name)} pressed Pause.</strong> ${p.caller ? `Caller says they are: ${esc(p.caller)}.` : 'Someone may be pressuring them right now.'}</p>
        <a class="btn btn-secondary" href="#/pause" id="alertView">Open</a>
        <button type="button" class="btn btn-ghost" id="alertClose">Dismiss</button>
      </div>`;
    banner.hidden = false;
    $('#alertClose').addEventListener('click', () => { banner.hidden = true; });
    $('#alertView').addEventListener('click', () => { banner.hidden = true; });
    if ('Notification' in window && Notification.permission === 'granted' && document.hidden) {
      try { new Notification(`${p.name} pressed Pause`, { body: 'Open Kampung Watch to call them.' }); } catch (e) { /* ignore */ }
    }
  }

  async function onPauseEvent({ id, kind, by }) {
    const ownOpen = pauseState.pauses.some(p => p.id === id && p.role === 'owner');
    if (onPausePage()) {
      // The resident's own taps don't need a redraw (it would move their focus).
      if (!(kind === 'updated' && ownOpen)) refreshPause();
      if ((kind === 'new' || kind === 'escalated') && !ownOpen) {
        const p = await api.get('/pauses/' + encodeURIComponent(id)).catch(() => null);
        if (p && kind === 'new' && p.role === 'circle') toast(`${p.name} pressed Pause.`, 'warn');
        if (p && kind === 'escalated' && p.role === 'volunteer') toast(`${p.name} needs a volunteer: their Circle didn’t answer in time.`, 'warn');
      }
      return;
    }
    const p = await api.get('/pauses/' + encodeURIComponent(id)).catch(() => null);
    if (!p) return;
    if (p.role === 'owner') {
      if (kind === 'responding') notify(`${by} is on it`, 'They’re calling you now.', '#/pause');
      else if (kind === 'message') notify(`Message from ${by}`, 'Open Pause to read it.', '#/pause');
      else if (kind === 'escalated') notify('Volunteers alerted', 'A volunteer near you is stepping in.', '#/pause');
    } else if (kind === 'new' || (kind === 'escalated' && p.role === 'volunteer')) {
      if (p.status === 'open') showPauseBanner(p);
    } else if (kind === 'responding') {
      notify(`${by} is on it`, `${by} is calling ${p.name}.`, '#/pause');
    } else if (kind === 'escalated') {
      notify('Volunteers alerted', `No one answered ${p.name}’s Pause in time, so volunteers are stepping in.`, '#/pause');
    } else if (kind === 'resolved' && p.outcome) {
      $('#alertBanner').hidden = true;
      toast(`${p.name}’s Pause is closed: ${OUTCOMES[p.outcome][0].toLowerCase()}.`, p.outcome === 'lost' ? 'warn' : 'ok');
    }
  }

  function onCircleEvent({ kind, name }) {
    if (kind === 'joined') toast(`${name} joined your Kampung Circle.`, 'ok');
    refreshPause();
  }

  /* ---------- Scam Drills ---------- */
  async function onDrillEvent({ id, kind, result, name }) {
    if (kind === 'new') {
      const pending = await api.get('/drills/pending').catch(() => []);
      const drill = pending.find(d => d.id === id);
      if (drill) setTimeout(() => openDrill(drill), 1500); // arrives like a real message, not instantly
    } else if (kind === 'result') {
      const who = name || 'They';
      if (result === 'clicked') toast(`${who} fell for the practice scam. They’ve seen a short lesson. Maybe give them a call about it.`, 'warn');
      else toast(`${who} passed the practice scam: ${result === 'paused' ? 'they pressed Pause' : 'they deleted it'}.`, 'ok');
      refreshPause();
    }
  }

  async function checkPendingDrills() {
    const pending = await api.get('/drills/pending').catch(() => []);
    if (pending.length) setTimeout(() => openDrill(pending[0]), 2500);
  }

  let queuedDrill = null;
  function openDrill(d) {
    // Don't cover something the resident is already doing; show it when they close that.
    if (!$('#modal').hidden) { queuedDrill = d; return; }
    const m = d.message;
    openModal({
      title: 'New message',
      body: `
        <div id="drillBody" class="drill-body">
          <div class="drill-phone">
            <p class="drill-meta">${esc(m.channel)} · <strong>${esc(m.from)}</strong> · ${timeAgo(d.created)}</p>
            <p class="drill-text">${esc(m.text)}${m.link ? ` <span class="drill-link">${esc(m.link)}</span>` : ''}</p>
          </div>
          <p class="muted">What would you do?</p>
          <div class="drill-actions">
            <button type="button" class="btn btn-secondary btn-lg" data-drill="clicked">${m.link ? 'Open the link' : 'Reply to them'}</button>
            <button type="button" class="btn btn-primary btn-lg" data-drill="paused">Pause: check with my Circle</button>
            <button type="button" class="btn btn-ghost" data-drill="ignored">Delete it</button>
          </div>
        </div>`,
      onMount: body => $$('[data-drill]', body).forEach(b => b.addEventListener('click', () => act(b, async () => {
        const res = await api.post(`/drills/${encodeURIComponent(d.id)}/result`, { result: b.dataset.drill });
        showDrillResult(body, res);
      })))
    });
  }

  function showDrillResult(body, d) {
    const fromVolunteer = d.sender && d.sender.kind === 'volunteer';
    const from = d.sender ? d.sender.name : 'your Circle';
    $('#modalTitle').textContent = 'Scam Drill: practice message';
    const verdict = { paused: 'Well done. Pressing Pause is exactly right.', ignored: 'Good. Deleting it kept you safe.', clicked: 'That was a scam, but only a practice one.' }[d.result];
    $('#drillBody', body).innerHTML = `
      ${fromVolunteer ? `<p class="kicker">Sent to everyone in ${esc(d.town)}</p>` : ''}
      <p class="game-verdict ${d.passed ? 'is-right' : 'is-wrong'}" tabindex="-1" id="drillVerdict">${verdict}</p>
      <p>This was a safe practice message from ${esc(from)}${fromVolunteer ? ', copied from a scam going around your area' : ''}. ${d.passed ? 'They’ve been told you passed.' : 'Nothing happened: no money or details went anywhere.'}</p>
      <h3 class="kicker">How to spot it next time</h3>
      <ol class="flag-list" role="list">${d.lesson.map((l, i) => `<li><span class="flag-n">${i + 1}</span><span class="flag-label">${esc(l)}</span></li>`).join('')}</ol>
      <div class="btn-row"><button type="button" class="btn btn-primary btn-lg" id="drillDone">Got it</button></div>`;
    $('#drillDone', body).addEventListener('click', () => closeModal());
    $('#drillVerdict', body).focus();
    refreshPause();
  }

  /* =========================================================
     SCAM RADAR
     ========================================================= */
  const radarFilter = { town: '', type: '', days: 30, verifiedOnly: false };

  function filteredReports() {
    return cache.reports
      .filter(r => !radarFilter.town || r.town === radarFilter.town)
      .filter(r => !radarFilter.type || r.type === radarFilter.type)
      .filter(r => !radarFilter.days || hoursSince(r.created) <= radarFilter.days * 24)
      .filter(r => !radarFilter.verifiedOnly || r.status === 'verified')
      .sort(byNewest);
  }

  async function renderRadar(seq) {
    const reports = await api.get('/reports?limit=500');
    if (stale(seq)) return;
    cache.reports = reports;
    drawRadarPage();
  }

  /* Colours come from the Broadsheet tokens so the map matches the page. */
  const cssVar = name => getComputedStyle(document.documentElement).getPropertyValue(name).trim();

  /* Short phrases for the headline, e.g. "Tampines, this week: fake delivery SMS." */
  const TYPE_PHRASE = {
    'Fake delivery SMS': 'fake delivery SMS',
    'Government official impersonation': 'fake officials',
    'Bank phishing': 'bank phishing',
    'Job / task scam': 'job scams',
    'Investment / crypto scam': 'investment scams',
    'Online shopping scam': 'shopping scams',
    'Fake friend call': '“guess who” calls',
    'Love / romance scam': 'romance scams',
    'Tech support scam': 'tech support scams',
    Other: 'new scams'
  };

  /* The key with the most neighbours affected, e.g. the hardest-hit town. */
  function topBy(reports, key) {
    const totals = {};
    reports.forEach(r => { totals[r[key]] = (totals[r[key]] || 0) + r.count; });
    const top = Object.entries(totals).sort((a, b) => b[1] - a[1])[0];
    return top ? top[0] : null;
  }

  function radarHeadline() {
    const sub = prefs.subscription;
    const week = cache.reports.filter(r => r.status === 'verified' && hoursSince(r.created) < 168);
    const town = (sub.enabled && sub.town) || topBy(week, 'town');
    const type = topBy(week.filter(r => r.town === town), 'type');
    if (!town || !type) return ['Scams near you,', 'verified as they happen.'];
    return [`${town}, this week:`, `${TYPE_PHRASE[type] || type.toLowerCase()}.`];
  }

  function drawRadarPage() {
    if (map) { map.remove(); map = null; markerLayer = null; }
    const sub = prefs.subscription;
    const [line1, line2] = radarHeadline();
    const newest = [...cache.reports].sort(byNewest)[0];
    main.innerHTML = `
      <div class="page radar">
        <header class="page-head">
          <div>
            <p class="kicker">Scam Radar${newest ? ` · latest report ${timeAgo(newest.created)}` : ''}</p>
            <h1 class="display"><span class="line">${esc(line1)}</span> <span class="line">${esc(line2)}</span></h1>
          </div>
          <section class="head-side" aria-labelledby="alertTitle">
            <h2 class="kicker" id="alertTitle">Alerts for your town</h2>
            <p>${sub.enabled
              ? `Alerts are on for <strong>${esc(sub.town)}</strong>. You’ll hear the moment volunteers verify a new scam wave there.`
              : 'Get an alert the moment volunteers verify a new scam wave in your town.'}</p>
            <div class="inline-form">
              <div class="field"><label for="subTown">Your town</label><select id="subTown" class="input">${townOptions(sub.town, true, 'Choose your town')}</select></div>
              ${sub.enabled
                ? `<button type="button" class="btn btn-secondary" id="subOff">Turn off</button><button type="button" class="btn btn-ghost" id="subTest">Send a test alert</button>`
                : `<button type="button" class="btn btn-primary" id="subOn">Alert me</button>`}
            </div>
          </section>
        </header>

        <section class="stat-row" id="radarStats" aria-label="Summary of the reports shown"></section>

        <figure class="map-figure">
          <div id="map" role="region" aria-label="Map of scam reports in Singapore"></div>
          <figcaption class="legend">
            <span><i class="swatch swatch-verified" aria-hidden="true"></i>Verified scam wave</span>
            <span><i class="swatch swatch-pending" aria-hidden="true"></i>Awaiting check</span>
            <span>A bigger circle means more neighbours hit</span>
          </figcaption>
        </figure>

        <section class="section" aria-labelledby="feedTitle">
          <div class="section-head">
            <h2 class="section-title" id="feedTitle">Reports</h2>
            <button type="button" class="btn btn-primary btn-lg" id="reportBtn">Report a scam</button>
          </div>
          <div class="filters" role="search" aria-label="Filter reports">
            <div class="field"><label for="fTown">Town</label><select id="fTown" class="input">${townOptions(radarFilter.town, true, 'All towns')}</select></div>
            <div class="field"><label for="fType">Scam type</label><select id="fType" class="input"><option value="">All types</option>${KW.SCAM_TYPES.map(t => `<option ${t === radarFilter.type ? 'selected' : ''}>${esc(t)}</option>`).join('')}</select></div>
            <div class="field"><label for="fDays">Period</label><select id="fDays" class="input">
              <option value="1" ${radarFilter.days === 1 ? 'selected' : ''}>Last 24 hours</option>
              <option value="7" ${radarFilter.days === 7 ? 'selected' : ''}>Last 7 days</option>
              <option value="30" ${radarFilter.days === 30 ? 'selected' : ''}>Last 30 days</option>
              <option value="0" ${radarFilter.days === 0 ? 'selected' : ''}>All time</option>
            </select></div>
            <label class="check"><input type="checkbox" id="fVerified" ${radarFilter.verifiedOnly ? 'checked' : ''}> Verified only</label>
          </div>
          <div id="radarFeed" aria-live="polite"></div>
        </section>
      </div>`;

    $('#reportBtn').addEventListener('click', () => openReportModal());

    const subOn = $('#subOn');
    if (subOn) subOn.addEventListener('click', async () => {
      const town = $('#subTown').value;
      if (!town) { toast('Choose your town first.', 'warn'); $('#subTown').focus(); return; }
      if ('Notification' in window && Notification.permission === 'default') {
        try { await Notification.requestPermission(); } catch (e) { /* ignore */ }
      }
      prefs.subscription = { town, enabled: true };
      savePrefs();
      paintHeader();
      toast(`Alerts on for ${town}.`, 'ok');
      drawRadarPage();
    });
    const subOff = $('#subOff');
    if (subOff) subOff.addEventListener('click', () => {
      prefs.subscription.enabled = false; savePrefs(); drawRadarPage();
    });
    const subTest = $('#subTest');
    if (subTest) subTest.addEventListener('click', () => pushAlert({
      town: prefs.subscription.town, title: 'This is a test alert. You’re all set.'
    }));
    $('#subTown').addEventListener('change', e => {
      if (prefs.subscription.enabled && e.target.value) {
        prefs.subscription.town = e.target.value; savePrefs(); paintHeader(); drawRadarPage();
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
    if (!$('#radarFeed')) return;
    const reports = filteredReports();
    drawMarkers(reports);
    renderRadarStats(reports);
    renderRadarFeed(reports);
  }

  function renderRadarStats(reports) {
    const top = topBy(reports, 'town');
    const stat = (n, label) => `<div class="stat"><span class="stat-n">${n}</span><span class="stat-label">${label}</span></div>`;
    $('#radarStats').innerHTML =
      stat(reports.length, 'reports shown') +
      stat(reports.filter(r => r.status === 'verified').length, 'verified by CC and RC volunteers') +
      stat(reports.filter(r => r.status === 'pending').length, 'awaiting a volunteer’s check') +
      stat(top ? esc(top) : 'None', 'hardest-hit town');
  }

  const STATUS_TAG = {
    verified: r => `<span class="tag tag-accent-2">Verified</span>${r.verifiedBy ? `<span class="r-by">${esc(r.verifiedBy)}</span>` : ''}`,
    pending: () => `<span class="tag tag-outline">Awaiting check</span>`,
    rumour: r => `<span class="tag tag-neutral">Not a scam wave</span>${r.verifiedBy ? `<span class="r-by">${esc(r.verifiedBy)}</span>` : ''}`
  };

  function renderRadarFeed(reports) {
    const feed = $('#radarFeed');
    if (!reports.length) {
      feed.innerHTML = `<div class="empty"><p>No reports match these filters.</p><button type="button" class="btn btn-secondary" id="clearFilters">Clear filters</button></div>`;
      $('#clearFilters').addEventListener('click', () => {
        Object.assign(radarFilter, { town: '', type: '', days: 30, verifiedOnly: false });
        drawRadarPage();
      });
      return;
    }
    feed.innerHTML = `
      <table class="table radar-table">
        <thead><tr>
          <th scope="col">Scam</th><th scope="col">Town</th><th scope="col">Status</th>
          <th scope="col" class="num">Neighbours hit</th><th scope="col"><span class="sr-only">Actions</span></th>
        </tr></thead>
        <tbody>
          ${reports.map(r => `
            <tr id="rep-${esc(r.id)}">
              <td class="r-main">
                <span class="r-title">${esc(r.title)}</span>
                <span class="r-detail">${esc(r.type)} · ${esc(r.channel)} · ${timeAgo(r.created)}</span>
                ${r.desc ? `<span class="r-desc">${nl2br(r.desc)}</span>` : ''}
                ${r.image ? `<img class="r-img" src="${esc(r.image)}" alt="Screenshot attached to this report">` : ''}
              </td>
              <td data-label="Town">${esc(r.town)}</td>
              <td data-label="Status"><span class="r-status">${STATUS_TAG[r.status](r)}</span></td>
              <td class="num" data-label="Neighbours hit"><span class="r-count">${r.count}</span></td>
              <td class="r-actions">
                <button type="button" class="btn ${r.mine ? 'btn-primary' : 'btn-secondary'}" data-confirm="${esc(r.id)}" aria-pressed="${r.mine}">${r.mine ? 'You got this too' : 'I got this too'}</button>
                <button type="button" class="btn btn-ghost" data-discuss="${esc(r.id)}">Discuss</button>
                ${r.status !== 'verified' ? `<button type="button" class="btn btn-primary vol-only" data-verify="${esc(r.id)}">Verify</button>` : ''}
                ${r.status !== 'rumour' ? `<button type="button" class="btn btn-ghost vol-only" data-rumour="${esc(r.id)}">Not a scam wave</button>` : ''}
                ${r.status === 'verified' ? `<button type="button" class="btn btn-ghost vol-only" data-drillfrom="${esc(r.id)}">Make it this week’s drill</button>` : ''}
              </td>
            </tr>`).join('')}
        </tbody>
      </table>`;

    const run = (attr, fn) => $$(`[data-${attr}]`, feed).forEach(b => b.addEventListener('click', () =>
      act(b, () => fn(encodeURIComponent(b.dataset[attr])))));

    run('confirm', async id => { upsert(cache.reports, await api.post(`/reports/${id}/confirm`)); updateRadar(); });
    run('discuss', async id => {
      const { postId } = await api.post(`/reports/${id}/discuss`);
      location.hash = '#/community/post/' + postId;
    });
    run('verify', async id => {
      upsert(cache.reports, await api.post(`/reports/${id}/verify`));
      updateRadar();
      toast('Report verified. Residents in that town are being alerted.', 'ok');
    });
    run('drillfrom', async id => {
      const res = await api.post('/drills/estate', { reportId: decodeURIComponent(id) });
      toast(res.sent
        ? `Practice scam sent to ${res.sent} Circle${res.sent === 1 ? '' : 's'} in ${res.town}. Results show on the Pause page.`
        : `No Circles in ${res.town} are waiting for a drill right now.`, res.sent ? 'ok' : 'info', { link: '#/pause', linkText: 'Open Pause' });
    });
    run('rumour', async id => {
      upsert(cache.reports, await api.post(`/reports/${id}/dismiss`));
      updateRadar();
      toast('Marked as checked: not a scam wave.');
    });
  }

  function initMap() {
    const el = $('#map');
    if (!window.L) {
      el.innerHTML = '<p class="map-fallback">The map couldn’t load (are you offline?). The reports below still work.</p>';
      return;
    }
    // OneMap (Singapore Land Authority): Singapore's official basemap, free with attribution,
    // no API key. The Grey style keeps the scam circles readable. It only covers Singapore.
    const sgBounds = L.latLngBounds([1.144, 103.535], [1.494, 104.502]);
    map = L.map(el, { scrollWheelZoom: false, minZoom: 11, maxZoom: 19, maxBounds: sgBounds, maxBoundsViscosity: 1 })
      .setView([1.3521, 103.8198], 11);
    L.tileLayer('https://www.onemap.gov.sg/maps/tiles/Grey/{z}/{x}/{y}.png', {
      minZoom: 11,
      maxZoom: 19,
      bounds: sgBounds,
      attribution: '<a href="https://www.onemap.gov.sg/" target="_blank" rel="noopener">OneMap</a> &copy; contributors | <a href="https://www.sla.gov.sg/" target="_blank" rel="noopener">Singapore Land Authority</a>'
    }).addTo(map);
    markerLayer = L.layerGroup().addTo(map);
    map.on('popupopen', e => {
      const btn = e.popup.getElement().querySelector('[data-town]');
      if (btn) btn.addEventListener('click', () => {
        radarFilter.town = btn.dataset.town;
        $('#fTown').value = radarFilter.town;
        map.closePopup();
        updateRadar();
        $('#feedTitle').scrollIntoView({ behavior: 'smooth' });
      });
    });
  }

  function drawMarkers(reports) {
    if (!map || !markerLayer) return;
    markerLayer.clearLayers();
    const verifiedInk = cssVar('--color-accent-2-700');
    const pendingInk = cssVar('--color-accent-600');
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
      const color = g.verified ? verifiedInk : pendingInk;
      L.circleMarker(coords, {
        radius: 9 + Math.sqrt(g.residents) * 2.4,
        color, weight: 2, fillColor: color, fillOpacity: 0.3,
        className: g.fresh ? 'pulse' : ''
      }).bindPopup(`
        <div class="map-pop">
          <p class="map-pop-title">${esc(town)}</p>
          <p class="muted">${g.reports.length} report${g.reports.length === 1 ? '' : 's'} · ${g.residents} neighbours hit</p>
          <ul>${g.reports.slice(0, 3).map(r => `<li>${esc(r.title)}</li>`).join('')}</ul>
          <button type="button" class="btn btn-primary" data-town="${esc(town)}">Show ${esc(town)} reports</button>
        </div>`).addTo(markerLayer);
    });
  }

  function openReportModal(prefill = {}) {
    openModal({
      title: 'Report a scam',
      wide: true,
      body: `
        <form id="reportForm" class="form-grid">
          <p class="muted full">Your report is anonymous. A CC or RC volunteer checks it before it’s shown as a verified scam wave.</p>
          <div class="field"><label for="rTown">Your town</label><select id="rTown" class="input" required>${townOptions(prefs.subscription.town || '', true, 'Choose your town')}</select></div>
          <div class="field"><label for="rChannel">How did it reach you?</label><select id="rChannel" class="input">${KW.CHANNELS.map(c => `<option ${c === prefill.channel ? 'selected' : ''}>${esc(c)}</option>`).join('')}</select></div>
          <div class="field full"><label for="rType">Type of scam</label><select id="rType" class="input">${KW.SCAM_TYPES.map(t => `<option>${esc(t)}</option>`).join('')}</select></div>
          <div class="field full"><label for="rTitle">Short summary</label><input id="rTitle" class="input" required maxlength="120" placeholder="For example: fake parcel SMS asking for $1.99"></div>
          <div class="field full"><label for="rDesc">What happened?</label><textarea id="rDesc" class="input" rows="4" maxlength="2000" placeholder="What did the message or caller say or ask for? Leave out your own personal details.">${esc(prefill.desc || '')}</textarea></div>
          ${imageField('rImg', 'Screenshot (optional)', prefill.image)}
          <div class="full form-actions">
            <button type="button" class="btn btn-secondary" data-close>Cancel</button>
            <button type="submit" class="btn btn-primary">Send report</button>
          </div>
        </form>`,
      onMount: body => {
        $$('[data-close]', body).forEach(b => b.addEventListener('click', () => closeModal()));
        const getImg = bindImageInput($('#rImg', body), $('#rImgPrev', body), prefill.image || null);
        $('#reportForm', body).addEventListener('submit', e => {
          e.preventDefault();
          const town = $('#rTown', body).value;
          const title = $('#rTitle', body).value.trim();
          if (!town || !title) { toast('Please choose your town and add a short summary.', 'warn'); return; }
          act(e.submitter, async () => {
            const r = await api.post('/reports', {
              town, title,
              type: $('#rType', body).value,
              channel: $('#rChannel', body).value,
              desc: $('#rDesc', body).value,
              image: getImg()
            });
            upsert(cache.reports, r);
            closeModal();
            toast(isVolunteer()
              ? 'Report sent. As a volunteer you can verify it in the list.'
              : 'Thank you. A CC or RC volunteer will check your report.', 'ok');
            if (current.route === 'radar') { radarFilter.town = ''; drawRadarPage(); }
            else location.hash = '#/radar';
          });
        });
      }
    });
  }

  function pushAlert(r) {
    const banner = $('#alertBanner');
    banner.className = 'alert-banner';
    banner.innerHTML = `
      <div class="alert-inner">
        <p><strong>Scam alert for ${esc(r.town)}.</strong> ${esc(r.title)}</p>
        <a class="btn btn-secondary" href="#/radar" id="alertView">View</a>
        <button type="button" class="btn btn-ghost" id="alertClose">Dismiss</button>
      </div>`;
    banner.hidden = false;
    $('#alertClose').addEventListener('click', () => { banner.hidden = true; });
    $('#alertView').addEventListener('click', () => {
      banner.hidden = true;
      radarFilter.town = r.town;
      if (current.route === 'radar') drawRadarPage();
    });
    if ('Notification' in window && Notification.permission === 'granted' && document.hidden) {
      try { new Notification('Kampung Watch: scam alert for ' + r.town, { body: r.title }); } catch (e) { /* ignore */ }
    }
  }

  /* =========================================================
     COMMUNITY
     ========================================================= */
  const communityView = { flair: 'all', sort: 'hot', q: '' };
  const flairLabel = id => (KW.FLAIRS.find(f => f.id === id) || {}).label || id;

  async function renderCommunity(seq, sub, id) {
    if (sub === 'post' && id) return renderPost(seq, id);
    await loadPostList(seq);
    if (stale(seq)) return;

    const topic = (fid, label) => `
      <li><button type="button" class="topic" data-flair="${fid}" aria-pressed="${communityView.flair === fid}">${esc(label)}</button></li>`;

    main.innerHTML = `
      <div class="page community">
        <header class="page-head">
          <div>
            <p class="kicker">Community</p>
            <h1 class="display">Ask, warn and learn from your neighbours.</h1>
          </div>
          <div class="head-side">
            <p class="lede">Questions, screenshots, tips and debate. Answers marked Volunteer come from trained Digital Ambassadors and RC volunteers.</p>
            <div class="btn-row"><button type="button" class="btn btn-primary btn-lg" id="newPostBtn">Start a post</button></div>
          </div>
        </header>

        <div class="community-layout">
          <section class="feed-col" aria-label="Posts">
            <div class="feed-toolbar">
              <div class="seg" role="radiogroup" aria-label="Sort posts">
                ${[['hot', 'Hot'], ['new', 'New'], ['top', 'Top']].map(([s, label]) => `
                  <label class="seg-opt"><input type="radio" name="postSort" value="${s}" ${communityView.sort === s ? 'checked' : ''}>${label}</label>`).join('')}
              </div>
              <div class="field search-field">
                <label for="postSearch" class="sr-only">Search posts</label>
                <input type="search" id="postSearch" class="input" placeholder="Search posts" value="${esc(communityView.q)}">
              </div>
            </div>
            <div id="postList"></div>
          </section>

          <aside class="community-side">
            <nav aria-labelledby="topicsTitle">
              <h2 class="kicker" id="topicsTitle">Topics</h2>
              <ul class="topic-list" role="list">
                ${topic('all', 'All posts')}
                ${KW.FLAIRS.map(f => topic(f.id, f.label)).join('')}
              </ul>
            </nav>
            <section aria-labelledby="rulesTitle">
              <h2 class="kicker" id="rulesTitle">House rules</h2>
              <ol class="flag-list" role="list">
                <li><span class="flag-n">1</span><span class="flag-label">Hide personal details</span><span class="flag-tip">Phone numbers, NRIC numbers and addresses stay out of posts.</span></li>
                <li><span class="flag-n">2</span><span class="flag-label">Be kind</span><span class="flag-tip">Anyone can be targeted. Nobody gets scolded here.</span></li>
                <li><span class="flag-n">3</span><span class="flag-label">No selling, no strange links</span><span class="flag-tip">Posts with unknown links are removed.</span></li>
              </ol>
            </section>
            <section aria-labelledby="fastTitle">
              <h2 class="kicker" id="fastTitle">Need an answer fast?</h2>
              <p>Send it privately to a trained volunteer instead.</p>
              <a class="btn btn-secondary" href="#/ask">Ask a volunteer</a>
            </section>
            <section aria-labelledby="helpersTitle">
              <h2 class="kicker" id="helpersTitle">Top helpers this week</h2>
              <ul class="helper-list" role="list">
                ${KW.VOLUNTEERS.slice(0, 4).map((v, i) => `<li><span class="helper-name">${esc(v.name)}</span><span class="muted">${esc(v.role)} · ${[48, 35, 29, 21][i]} helpful answers</span></li>`).join('')}
              </ul>
            </section>
          </aside>
        </div>
      </div>`;

    $$('[data-flair]').forEach(b => b.addEventListener('click', () => {
      communityView.flair = b.dataset.flair;
      $$('[data-flair]').forEach(x => x.setAttribute('aria-pressed', String(x === b)));
      loadPostList();
    }));
    $$('input[name=postSort]').forEach(r => r.addEventListener('change', () => {
      communityView.sort = r.value;
      loadPostList();
    }));
    $('#postSearch').addEventListener('input', debounce(e => { communityView.q = e.target.value; loadPostList(); }, 250));
    $('#newPostBtn').addEventListener('click', () => openPostModal());
    renderPostList();
  }

  /* Fetch posts for the current filters; re-renders the list if it is on screen. */
  let listSeq = 0;
  async function loadPostList(seq) {
    const mine = ++listSeq;
    const q = new URLSearchParams({ sort: communityView.sort });
    if (communityView.flair !== 'all') q.set('flair', communityView.flair);
    if (communityView.q.trim()) q.set('q', communityView.q.trim());
    try {
      const posts = await api.get('/posts?' + q);
      if (mine !== listSeq || (seq && stale(seq))) return;
      cache.posts = posts;
      renderPostList();
    } catch (err) {
      if (seq) throw err;
      toast(err.message === 'offline' ? 'Can’t reach the server.' : err.message, 'warn');
    }
  }

  function renderPostList() {
    const list = $('#postList');
    if (!list) return;
    list.innerHTML = cache.posts.length ? cache.posts.map(postItem).join('')
      : `<div class="empty"><p>No posts here yet. Be the first to start the conversation.</p></div>`;
    bindVotes(list, (kind, updated) => {
      upsert(cache.posts, updated);
      renderPostList();
    });
  }

  /* Text-only voting: "Upvote · 42 points · Downvote". */
  function voteBox(kind, id, score, mine) {
    const what = kind === 'post' ? 'post' : 'comment';
    return `
      <span class="vote" role="group" aria-label="Vote on this ${what}">
        <button type="button" class="btn btn-ghost" data-vote="1" data-kind="${kind}" data-id="${esc(id)}" data-mine="${mine}" aria-pressed="${mine === 1}">Upvote</button>
        <span class="vote-score">${score} point${Math.abs(score) === 1 ? '' : 's'}</span>
        <button type="button" class="btn btn-ghost" data-vote="-1" data-kind="${kind}" data-id="${esc(id)}" data-mine="${mine}" aria-pressed="${mine === -1}">Downvote</button>
      </span>`;
  }

  function bindVotes(scope, onUpdated) {
    $$('[data-vote]', scope).forEach(b => b.addEventListener('click', e => {
      e.preventDefault(); e.stopPropagation();
      const v = Number(b.dataset.vote);
      const value = Number(b.dataset.mine) === v ? 0 : v;
      const path = b.dataset.kind === 'post' ? '/posts/' : '/comments/';
      act(b, async () => onUpdated(b.dataset.kind, await api.post(path + encodeURIComponent(b.dataset.id) + '/vote', { value })));
    }));
  }

  function verdictTag(p) {
    if (!p.verdict) return '';
    return p.verdict.result === 'scam'
      ? `<span class="tag tag-accent-2">Volunteer verified: scam</span>`
      : `<span class="tag tag-accent">Volunteer verified: legit</span>`;
  }

  function postMeta(p) {
    return `
      <p class="post-meta">
        <span class="tag tag-neutral">${esc(flairLabel(p.flair))}</span>
        ${verdictTag(p)}
        <span>by ${esc(p.author)}</span>
        ${p.authorRole ? `<span class="tag tag-accent">${esc(p.authorRole)}</span>` : ''}
        <span class="muted">${timeAgo(p.created)}</span>
      </p>`;
  }

  function postItem(p) {
    const excerpt = p.body.length > 240 ? p.body.slice(0, 240) + '…' : p.body;
    const votes = p.poll ? p.poll.options.reduce((n, o) => n + o.votes, 0) : 0;
    return `
      <article class="post">
        ${postMeta(p)}
        <h2 class="post-title"><a href="#/community/post/${esc(p.id)}">${esc(p.title)}</a></h2>
        ${excerpt ? `<p class="post-excerpt">${nl2br(excerpt)}</p>` : ''}
        ${p.image ? `<img class="post-thumb" src="${esc(p.image)}" alt="Image attached to this post">` : ''}
        <div class="post-actions">
          ${voteBox('post', p.id, p.score, p.myVote)}
          <a class="btn btn-ghost" href="#/community/post/${esc(p.id)}">${p.commentCount} comment${p.commentCount === 1 ? '' : 's'}</a>
          ${p.poll ? `<span class="muted">${votes} poll vote${votes === 1 ? '' : 's'}</span>` : ''}
        </div>
      </article>`;
  }

  async function renderPost(seq, id) {
    let post;
    try {
      post = await api.get('/posts/' + encodeURIComponent(id));
    } catch (err) {
      if (err.message === 'offline') throw err;
      post = null;
    }
    if (stale(seq)) return;
    cache.post = post;
    drawPost();
  }

  async function refreshPost(id) {
    const post = await api.get('/posts/' + encodeURIComponent(id)).catch(() => null);
    if (!post || current.args[1] !== id) return;
    cache.post = post;
    keepScroll(drawPost);
  }

  function keepScroll(fn) {
    const y = window.scrollY;
    fn();
    window.scrollTo({ top: y, behavior: 'instant' });
  }

  function drawPost() {
    const p = cache.post;
    if (!p) {
      main.innerHTML = `
        <div class="page">
          <div class="error-block">
            <p class="kicker">Community</p>
            <h1 class="display">That post doesn’t exist anymore.</h1>
            <a class="btn btn-primary btn-lg" href="#/community">Back to Community</a>
          </div>
        </div>`;
      return;
    }
    const vol = isVolunteer();
    const commentCount = p.commentCount;
    main.innerHTML = `
      <div class="page post-page">
        <a class="btn btn-ghost back-link" href="#/community">Back to Community</a>
        <article class="post-full">
          ${postMeta(p)}
          <h1 class="display display-sm">${esc(p.title)}</h1>
          ${p.body ? `<p class="post-body">${nl2br(p.body)}</p>` : ''}
          ${p.image ? `<img class="post-img" src="${esc(p.image)}" alt="Image attached to this post">` : ''}
          <div class="post-actions">${voteBox('post', p.id, p.score, p.myVote)}</div>
          ${p.flair === 'ask' && p.body ? `
            <details class="post-check">
              <summary>Run the red-flag check on this message</summary>
              <div class="post-check-body">${flagsHTML(p.body)}</div>
            </details>` : ''}
          ${p.poll ? pollHTML(p) : ''}
          ${p.verdict ? `<p class="muted">Verdict given by ${esc(p.verdict.by)}.</p>` : ''}
          <div class="vol-only verdict-row" role="group" aria-label="Volunteer verdict">
            <span class="muted">Volunteer verdict:</span>
            <button type="button" class="btn ${p.verdict && p.verdict.result === 'scam' ? 'btn-primary' : 'btn-secondary'}" data-pverdict="scam">Scam</button>
            <button type="button" class="btn ${p.verdict && p.verdict.result === 'legit' ? 'btn-primary' : 'btn-secondary'}" data-pverdict="legit">Legit</button>
            ${p.verdict ? `<button type="button" class="btn btn-ghost" data-pverdict="">Clear</button>` : ''}
          </div>
        </article>

        <section class="comments" aria-labelledby="commentsTitle">
          <h2 class="section-title" id="commentsTitle">${commentCount} comment${commentCount === 1 ? '' : 's'}</h2>
          <form class="comment-form" id="commentForm">
            <div class="field">
              <label for="commentText">Commenting as ${esc(vol ? prefs.volunteer.name + ' (Volunteer)' : (cache.me ? cache.me.handle : 'a resident'))}</label>
              <textarea id="commentText" class="input" rows="3" maxlength="3000" placeholder="${vol ? 'Answer as a volunteer' : 'Share your thoughts or advice'}"></textarea>
            </div>
            <div class="btn-row"><button type="submit" class="btn btn-primary">Post comment</button></div>
          </form>
          <div class="comment-tree">${p.comments.length ? commentsHTML(p.comments, 0) : '<p class="muted">No comments yet. Be the first to help.</p>'}</div>
        </section>
      </div>`;

    const base = '/posts/' + encodeURIComponent(p.id);
    // Some endpoints return the post without comments; keep the ones we have.
    const apply = updated => {
      cache.post = { ...cache.post, ...updated };
      keepScroll(drawPost);
    };

    bindVotes(main, (kind, updated) => apply(updated));

    $$('[data-poll]').forEach(b => b.addEventListener('click', () => act(b, async () => {
      const i = Number(b.dataset.poll);
      apply(await api.post(base + '/poll', { option: p.poll.myChoice === i ? null : i }));
    })));

    $$('[data-pverdict]').forEach(b => b.addEventListener('click', () => act(b, async () => {
      apply(await api.post(base + '/verdict', { result: b.dataset.pverdict || null }));
    })));

    $('#commentForm').addEventListener('submit', e => {
      e.preventDefault();
      const body = $('#commentText').value.trim();
      if (!body) return;
      act(e.submitter, async () => {
        const updated = await api.post(base + '/comments', { body });
        $('#commentText').value = '';
        apply(updated);
      });
    });

    $$('[data-reply]').forEach(b => b.addEventListener('click', () => {
      const box = document.getElementById('rf-' + b.dataset.reply);
      box.hidden = !box.hidden;
      b.setAttribute('aria-expanded', String(!box.hidden));
      if (!box.hidden) $('textarea', box).focus();
    }));

    $$('.reply-inline').forEach(f => f.addEventListener('submit', e => {
      e.preventDefault();
      const ta = $('textarea', f);
      const body = ta.value.trim();
      if (!body) return;
      act(e.submitter, async () => {
        const updated = await api.post(base + '/comments', { body, parentId: f.dataset.parent });
        ta.value = '';
        apply(updated);
      });
    }));
  }

  function commentsHTML(list, depth) {
    return list.map(c => `
      <div class="comment ${depth ? 'nested' : ''}">
        <p class="comment-head">
          <span class="comment-author">${esc(c.author)}</span>
          ${c.role ? `<span class="tag tag-accent">${esc(c.role)}</span>` : ''}
          <span class="muted">${timeAgo(c.created)}</span>
        </p>
        <p class="comment-body">${nl2br(c.body)}</p>
        <div class="comment-actions">
          ${voteBox('comment', c.id, c.score, c.myVote)}
          <button type="button" class="btn btn-ghost" data-reply="${esc(c.id)}" aria-expanded="false" aria-controls="rf-${esc(c.id)}">Reply</button>
        </div>
        <form class="reply-inline" id="rf-${esc(c.id)}" data-parent="${esc(c.id)}" hidden>
          <textarea class="input" rows="2" maxlength="3000" aria-label="Reply to ${esc(c.author)}" placeholder="Write a reply"></textarea>
          <button type="submit" class="btn btn-primary">Reply</button>
        </form>
        ${c.replies && c.replies.length ? `<div class="replies">${commentsHTML(c.replies, depth + 1)}</div>` : ''}
      </div>`).join('');
  }

  function pollHTML(p) {
    const mine = p.poll.myChoice;
    const total = p.poll.options.reduce((a, o) => a + o.votes, 0) || 1;
    return `
      <section class="poll" aria-labelledby="pollTitle">
        <h2 class="kicker" id="pollTitle">${p.flair === 'ask' ? 'What the community thinks' : 'Where do you stand?'}</h2>
        <p class="muted">${mine == null ? 'Tap an answer to vote.' : 'Tap your answer again to take back your vote.'}</p>
        ${p.poll.options.map((o, i) => {
          const pct = Math.round(o.votes / total * 100);
          return `
            <button type="button" class="poll-opt ${mine === i ? 'chosen' : ''}" data-poll="${i}" aria-pressed="${mine === i}">
              <span class="poll-bar" style="width:${pct}%"></span>
              <span class="poll-label">${esc(plainLabel(o.label))}</span>
              <span class="poll-pct">${pct}%</span>
            </button>`;
        }).join('')}
      </section>`;
  }

  function openPostModal(prefill = {}) {
    openModal({
      title: 'Start a post',
      wide: true,
      body: `
        <form id="postForm" class="form-grid">
          <div class="field full"><label for="pFlair">Topic</label>
            <select id="pFlair" class="input">${KW.FLAIRS.map(f => `<option value="${f.id}" ${f.id === prefill.flair ? 'selected' : ''}>${esc(f.label)}</option>`).join('')}</select>
          </div>
          <div class="field full"><label for="pTitle">Title</label><input id="pTitle" class="input" maxlength="140" required placeholder="For example: is this WhatsApp job offer a scam?" value="${esc(prefill.title || '')}"></div>
          <div class="field full"><label for="pBody">Details</label><textarea id="pBody" class="input" rows="6" maxlength="5000" placeholder="Paste the message or tell your story. Hide phone numbers and personal details."></textarea></div>
          <div class="full" id="pFlags" aria-live="polite"></div>
          ${imageField('pImg', 'Photo or screenshot (optional)')}
          <p class="full muted" id="pPollNote"></p>
          <div class="full form-actions">
            <button type="button" class="btn btn-secondary" data-close>Cancel</button>
            <button type="submit" class="btn btn-primary">Post</button>
          </div>
        </form>`,
      onMount: body => {
        $$('[data-close]', body).forEach(b => b.addEventListener('click', () => closeModal()));
        const getImg = bindImageInput($('#pImg', body), $('#pImgPrev', body));
        const flair = $('#pFlair', body), text = $('#pBody', body);
        const update = () => {
          $('#pFlags', body).innerHTML = flair.value === 'ask' ? flagsHTML(text.value) : '';
          const note = $('#pPollNote', body);
          note.hidden = !['ask', 'debate'].includes(flair.value);
          note.textContent = flair.value === 'debate'
            ? 'A poll (Agree, Disagree, It depends) is added automatically.'
            : 'A community poll (Scam, Looks legit, Not sure) is added automatically.';
        };
        flair.addEventListener('change', update);
        text.addEventListener('input', update);
        update();
        $('#postForm', body).addEventListener('submit', e => {
          e.preventDefault();
          const title = $('#pTitle', body).value.trim();
          if (!title) { toast('Please add a title.', 'warn'); return; }
          act(e.submitter, async () => {
            const post = await api.post('/posts', { flair: flair.value, title, body: text.value, image: getImg() });
            closeModal();
            toast('Posted. Neighbours and volunteers can now reply.', 'ok');
            location.hash = '#/community/post/' + post.id;
          });
        });
      }
    });
  }

  /* =========================================================
     LEARN (content is static; progress stays in this browser)
     ========================================================= */
  function courseProgress(id) {
    const course = KW.COURSES.find(c => c.id === id);
    const p = prefs.progress[id] || { done: [], score: null, passed: false };
    const steps = course.lessons.length + 1; // lessons + quiz
    const doneSteps = p.done.length + (p.passed ? 1 : 0);
    return { ...p, pct: Math.round(doneSteps / steps * 100) };
  }

  function progressBar(pct, label = 'Course progress') {
    return `<div class="progress" role="progressbar" aria-valuenow="${pct}" aria-valuemin="0" aria-valuemax="100" aria-label="${esc(label)}"><span style="width:${pct}%"></span></div>`;
  }

  function progressWords(p, course) {
    if (p.passed) return 'Passed';
    if (p.done.length) return `${p.done.length} of ${course.lessons.length} lessons done`;
    return 'Not started';
  }

  const passMark = course => Math.ceil(course.quiz.length * 2 / 3); // two-thirds, e.g. 2 of 3

  const game = { order: [], i: 0, score: 0, answered: false };
  function resetGame() {
    game.order = KW.SPOT_GAME.map((_, i) => i).sort(() => Math.random() - 0.5).slice(0, 5);
    game.i = 0; game.score = 0; game.answered = false;
  }

  function renderLearn(seq, sub, id, step) {
    if (sub === 'course' && id) return renderCourse(id, step);

    const passed = KW.COURSES.filter(c => courseProgress(c.id).passed).length;
    main.innerHTML = `
      <div class="page learn">
        <header class="page-head">
          <div>
            <p class="kicker">Learn</p>
            <h1 class="display">Ten minutes to spot a scam.</h1>
          </div>
          <div class="head-side">
            <p class="lede">Six short courses with quizzes, and a Spot-the-scam game. Start with fake delivery messages, the most reported scam this month.</p>
            <p class="progress-line"><span class="stat-n">${passed}</span> of ${KW.COURSES.length} courses passed</p>
            ${progressBar(Math.round(passed / KW.COURSES.length * 100), 'Courses passed')}
            ${passed === KW.COURSES.length ? '<p class="tag tag-accent-2">Kampung Scam-Buster: every course passed</p>' : ''}
          </div>
        </header>

        <div class="learn-layout">
          <section aria-labelledby="coursesTitle">
            <h2 class="section-title" id="coursesTitle">Courses</h2>
            <ol class="course-list" role="list">
              ${KW.COURSES.map((c, i) => {
                const p = courseProgress(c.id);
                return `
                  <li class="course-item">
                    <span class="course-n">${String(i + 1).padStart(2, '0')}</span>
                    <div>
                      <h3 class="course-title"><a href="#/learn/course/${c.id}">${esc(c.title)}</a></h3>
                      <p class="muted">${esc(c.blurb)}</p>
                      <p class="course-meta">
                        <span>${c.minutes} minutes</span><span>${esc(c.level)}</span><span>${c.lessons.length} lessons and a quiz</span>
                        <span class="tag ${p.passed ? 'tag-accent-2' : p.done.length ? 'tag-accent' : 'tag-neutral'}">${progressWords(p, c)}</span>
                      </p>
                    </div>
                  </li>`;
              }).join('')}
            </ol>
          </section>

          <section class="game" id="gameCard" aria-labelledby="gameTitle"></section>
        </div>
      </div>`;

    resetGame();
    renderGame();
  }

  function renderGame() {
    const card = $('#gameCard');
    if (!card) return;
    if (game.i >= game.order.length) {
      const best = Math.max(prefs.gameBest || 0, game.score);
      if (best !== prefs.gameBest) { prefs.gameBest = best; savePrefs(); }
      card.innerHTML = `
        <h2 class="kicker" id="gameTitle">Spot the scam</h2>
        <p class="game-score"><span class="stat-n">${game.score}</span> of ${game.order.length} right</p>
        <p class="game-verdict">${game.score === game.order.length ? 'Perfect. You’re a natural scam-spotter.' : game.score >= 3 ? 'Nice work. A few of those were tricky.' : 'Scams are designed to fool people. Try a course and play again.'}</p>
        <p class="muted">Your best score: ${best} of ${game.order.length}</p>
        <div class="btn-row"><button type="button" class="btn btn-primary btn-lg" id="gameAgain">Play again</button></div>`;
      $('#gameAgain').addEventListener('click', () => { resetGame(); renderGame(); });
      return;
    }
    const item = KW.SPOT_GAME[game.order[game.i]];
    card.innerHTML = `
      <h2 class="kicker" id="gameTitle">Spot the scam</h2>
      <p class="muted">Message ${game.i + 1} of ${game.order.length} · ${game.score} right so far</p>
      <figure class="game-msg">
        <blockquote>${esc(item.msg)}</blockquote>
        <figcaption>${esc(item.from)}</figcaption>
      </figure>
      <div class="btn-row" role="group" aria-label="Your answer">
        <button type="button" class="btn btn-secondary btn-lg" data-ans="scam">Scam</button>
        <button type="button" class="btn btn-secondary btn-lg" data-ans="legit">Legit</button>
      </div>
      <div id="gameFeedback" aria-live="polite"></div>`;
    $$('[data-ans]', card).forEach(b => b.addEventListener('click', () => {
      if (game.answered) return;
      game.answered = true;
      const right = (b.dataset.ans === 'scam') === item.isScam;
      if (right) game.score++;
      $$('[data-ans]', card).forEach(x => { x.disabled = true; });
      b.classList.replace('btn-secondary', 'btn-primary');
      $('#gameFeedback').innerHTML = `
        <p class="game-verdict ${right ? 'is-right' : 'is-wrong'}">${right ? 'Correct.' : 'Not quite.'} It’s ${item.isScam ? 'a scam' : 'legit'}.</p>
        <p>${esc(item.explain)}</p>
        <div class="btn-row"><button type="button" class="btn btn-primary btn-lg" id="gameNext">${game.i + 1 < game.order.length ? 'Next message' : 'See my score'}</button></div>`;
      $('#gameNext').addEventListener('click', () => { game.i++; game.answered = false; renderGame(); });
      $('#gameNext').focus();
    }));
  }

  function renderCourse(id, step) {
    const course = KW.COURSES.find(c => c.id === id);
    if (!course) { location.hash = '#/learn'; return; }
    const p = prefs.progress[id] || (prefs.progress[id] = { done: [], score: null, passed: false });
    const isQuiz = step === 'quiz';
    let idx = isQuiz ? -1 : Number(step);
    if (!isQuiz && !(idx >= 0 && idx < course.lessons.length)) {
      // Resume at the first unfinished lesson.
      idx = course.lessons.findIndex((_, i) => !p.done.includes(i));
      if (idx === -1) { location.replace(`#/learn/course/${id}/quiz`); return; }
    }
    const n = KW.COURSES.indexOf(course) + 1;

    main.innerHTML = `
      <div class="page course-page">
        <a class="btn btn-ghost back-link" href="#/learn">All courses</a>
        <div class="course-layout">
          <nav class="lesson-nav" aria-labelledby="courseTitle">
            <p class="kicker">Course ${String(n).padStart(2, '0')} · ${course.minutes} minutes</p>
            <h2 class="lesson-nav-title" id="courseTitle">${esc(course.title)}</h2>
            ${progressBar(courseProgress(id).pct)}
            <ol class="lesson-steps" role="list">
              ${course.lessons.map((l, i) => `
                <li><a href="#/learn/course/${id}/${i}" ${i === idx ? 'aria-current="step"' : ''}>
                  <span class="step-n">${i + 1}</span><span class="step-title">${esc(l.title)}</span>
                  ${p.done.includes(i) ? '<span class="step-state">Done</span>' : ''}
                </a></li>`).join('')}
              <li><a href="#/learn/course/${id}/quiz" ${isQuiz ? 'aria-current="step"' : ''}>
                <span class="step-n">${course.lessons.length + 1}</span><span class="step-title">Quiz</span>
                ${p.passed ? '<span class="step-state">Passed</span>' : ''}
              </a></li>
            </ol>
          </nav>
          <article class="lesson" id="lessonBody"></article>
        </div>
      </div>`;

    const body = $('#lessonBody');
    if (!isQuiz) {
      const lesson = course.lessons[idx];
      body.innerHTML = `
        <p class="kicker">Lesson ${idx + 1} of ${course.lessons.length}</p>
        <h1 class="display display-sm">${esc(lesson.title)}</h1>
        <div class="lesson-content">${lesson.body}</div>
        <div class="btn-row">
          ${idx > 0 ? `<a class="btn btn-secondary btn-lg" href="#/learn/course/${id}/${idx - 1}">Previous lesson</a>` : ''}
          <button type="button" class="btn btn-primary btn-lg" id="lessonDone">${idx + 1 < course.lessons.length ? 'Got it, next lesson' : 'Got it, take the quiz'}</button>
        </div>`;
      $('#lessonDone').addEventListener('click', () => {
        if (!p.done.includes(idx)) p.done.push(idx);
        savePrefs();
        location.hash = idx + 1 < course.lessons.length ? `#/learn/course/${id}/${idx + 1}` : `#/learn/course/${id}/quiz`;
      });
      return;
    }

    body.innerHTML = `
      <p class="kicker">Quiz</p>
      <h1 class="display display-sm">Check what you’ve learned.</h1>
      <p class="lede">Get ${passMark(course)} of ${course.quiz.length} right to pass the course.</p>
      <form id="quizForm" class="quiz">
        ${course.quiz.map((q, qi) => `
          <fieldset class="quiz-q" id="q${qi}">
            <legend><span class="flag-n">${qi + 1}</span>${esc(q.q)}</legend>
            ${q.options.map((o, oi) => `
              <label class="radio quiz-opt"><input type="radio" name="q${qi}" value="${oi}" required><span class="dot" aria-hidden="true"></span><span>${esc(o)}</span></label>`).join('')}
            <p class="quiz-explain" hidden></p>
          </fieldset>`).join('')}
        <div id="quizResult" aria-live="polite"></div>
        <div class="btn-row"><button type="submit" class="btn btn-primary btn-lg">Check my answers</button></div>
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
        fs.classList.remove('is-right', 'is-wrong');
        fs.classList.add(ok ? 'is-right' : 'is-wrong');
        const ex = $('.quiz-explain', fs);
        ex.hidden = false;
        ex.innerHTML = `<strong>${ok ? 'Correct.' : 'Not quite. The answer is: ' + esc(q.options[q.answer]) + '.'}</strong> ${esc(q.explain)}`;
      });
      const pass = score >= passMark(course);
      p.score = Math.max(p.score || 0, score);
      if (pass) p.passed = true;
      savePrefs();
      const nextCourse = KW.COURSES.find(c => !courseProgress(c.id).passed);
      $('#quizResult').innerHTML = `
        <p class="game-verdict ${pass ? 'is-right' : 'is-wrong'}">${pass ? `You passed, ${score} of ${course.quiz.length}.` : `${score} of ${course.quiz.length}. So close.`}</p>
        <p>${pass ? 'Share what you learned with someone you care about.' : 'Read the explanations above and try again.'}</p>
        <div class="btn-row">
          ${pass && nextCourse ? `<a class="btn btn-primary btn-lg" href="#/learn/course/${nextCourse.id}">Next course: ${esc(nextCourse.title)}</a>` : ''}
          ${pass ? `<button type="button" class="btn btn-secondary btn-lg" id="shareTip">Share a tip in Community</button>` : ''}
        </div>`;
      const share = $('#shareTip');
      if (share) share.addEventListener('click', () => openPostModal({ flair: 'tips', title: `What I learned from “${course.title}”` }));
    });
  }

  /* =========================================================
     ASK AI — a page of its own (#/ai). Replies stream from
     /api/assistant/chat, which calls the AI service on the server.
     The conversation lives in memory, so it survives moving between pages.
     ========================================================= */
  const chat = { messages: [], image: null, busy: false, handedOff: false };
  const assistantOn = () => !!(cache.config && cache.config.assistant);
  // The assistant is asked for plain text, but strip stray markdown just in case.
  const plainReply = s => s.replace(/\*\*(.+?)\*\*/g, '$1').replace(/^#+\s*/gm, '');

  function renderAssistantPage() {
    main.innerHTML = `
      <div class="page ai-page">
        <header class="page-head">
          <div>
            <p class="kicker" data-ai="aiKicker"></p>
            <h1 class="display" data-ai="aiHeadline"></h1>
          </div>
          <div class="head-side">
            <p class="lede" data-ai="aiIntro"></p>
          </div>
        </header>

        <div class="ai-layout">
          <section class="ai-chat" aria-labelledby="aiChatTitle">
            <h2 class="sr-only" id="aiChatTitle" data-ai="aiChatLabel"></h2>
            <div id="aiChatBody"></div>
          </section>

          <aside class="ai-side">
            <section aria-labelledby="aiTryTitle">
              <h2 class="kicker" id="aiTryTitle" data-ai="aiTry"></h2>
              <ul class="assistant-suggest" id="assistantSuggest" role="list"></ul>
            </section>
            <section aria-labelledby="aiPersonTitle">
              <h2 class="kicker" id="aiPersonTitle" data-ai="aiPerson"></h2>
              <p data-ai="aiPersonText"></p>
              <a class="btn btn-secondary" href="#/ask" data-ai="aiAskVolunteer"></a>
            </section>
            <section aria-labelledby="aiUrgentTitle">
              <h2 class="kicker" id="aiUrgentTitle" data-ai="aiUrgent"></h2>
              <ul class="helpline-list">
                ${KW.HELPLINES.map(h => `<li><a href="tel:${h.number.replace(/\s/g, '')}">${esc(h.number)}</a> <span>${esc(h.label)}</span><span class="muted">${esc(h.note)}</span></li>`).join('')}
              </ul>
            </section>
          </aside>
        </div>
      </div>`;

    const body = $('#aiChatBody');
    if (!assistantOn()) {
      body.innerHTML = `<p class="ai-off" data-ai="aiOff"></p>`;
    } else {
      body.innerHTML = `
        <div class="assistant-log" id="assistantLog"></div>
        <p class="sr-only" id="assistantStatus" role="status" aria-live="polite"></p>
        <form class="assistant-form" id="assistantForm" novalidate>
          <div class="field">
            <label for="assistantInput" data-ai="aiPlaceholder"></label>
            <textarea id="assistantInput" class="input" rows="4" maxlength="2000"></textarea>
          </div>
          <input type="file" id="assistantImg" class="sr-only" accept="${SCREENSHOT_TYPES.join(',')}" tabindex="-1" aria-hidden="true">
          <div class="assistant-shot" id="assistantShot" hidden></div>
          <div class="assistant-actions">
            <button type="submit" class="btn btn-primary btn-lg" id="assistantSend" data-ai="aiSend"></button>
            <button type="button" class="btn btn-secondary btn-lg" id="assistantAttach" data-ai="aiAttach"></button>
          </div>
          <p class="assistant-note" id="assistantNote"></p>
        </form>`;
      bindChatForm();
    }

    paintAssistant();
    onLangChange = paintAssistant; // the header's language dropdown re-translates this page
  }

  /* Static text on the page follows the language dropdown. */
  function paintAssistant() {
    const page = $('.ai-page');
    if (!page) return;
    page.lang = prefs.lang;
    $$('[data-ai]', page).forEach(el => { el.textContent = say(el.dataset.ai); });
    const note = $('#assistantNote');
    // The privacy note names the AI service the server is using.
    if (note) note.textContent = say(cache.config && cache.config.assistantProvider === 'gemini' ? 'aiNoteGemini' : 'aiNote');
    $('#assistantSuggest').innerHTML = say('aiSuggest').map(q =>
      `<li><button type="button" class="btn btn-secondary" data-suggest ${assistantOn() ? '' : 'disabled'}>${esc(q)}</button></li>`).join('');
    $$('[data-suggest]').forEach(b => b.addEventListener('click', () => {
      sendChat(b.textContent);
      const form = $('#assistantForm');
      if (form) form.scrollIntoView({ behavior: 'smooth', block: 'end' });
    }));
    renderChat();
  }

  function renderChat() {
    const log = $('#assistantLog');
    if (!log) return; // not on the Ask AI page
    const answered = chat.messages.some(m => m.role === 'assistant' && !m.pending && !m.error);
    log.innerHTML = `
      ${chat.messages.map(m => `
        <div class="ai-msg ai-${m.role}${m.error ? ' ai-error' : ''}">
          <span class="ai-who">${esc(say(m.role === 'user' ? 'aiYou' : 'aiName'))}</span>
          ${m.image ? `<img src="${esc(m.image)}" alt="${esc(say('aiShotNote'))}">` : ''}
          <p${m.pending ? ' data-pending' : ''}>${m.content ? nl2br(plainReply(m.content)) : esc(say('aiThinking'))}</p>
        </div>`).join('')}
      ${chat.messages.length && !chat.busy ? `
        <div class="assistant-after">
          ${answered && !chat.handedOff ? `<button type="button" class="btn btn-primary" id="aiHandoff">${esc(say('aiHandoff'))}</button>` : ''}
          <button type="button" class="btn btn-ghost" id="aiNew">${esc(say('aiNew'))}</button>
        </div>` : ''}`;

    const handoff = $('#aiHandoff', log);
    if (handoff) handoff.addEventListener('click', () => handOff(handoff));
    const fresh = $('#aiNew', log);
    if (fresh) fresh.addEventListener('click', () => {
      Object.assign(chat, { messages: [], handedOff: false });
      renderChat();
      $('#assistantInput').focus();
    });
    const send = $('#assistantSend');
    if (send) send.disabled = chat.busy;
  }

  function bindChatForm() {
    $('#assistantForm').addEventListener('submit', e => {
      e.preventDefault();
      sendChat($('#assistantInput').value);
    });
    $('#assistantInput').addEventListener('keydown', e => {
      // Enter sends; Shift+Enter starts a new line.
      if (e.key === 'Enter' && !e.shiftKey && !e.isComposing) { e.preventDefault(); sendChat(e.target.value); }
    });
    $('#assistantAttach').addEventListener('click', () => $('#assistantImg').click());
    $('#assistantImg').addEventListener('change', async e => {
      const file = e.target.files[0];
      if (!file) return;
      if (!SCREENSHOT_TYPES.includes(file.type)) { clearChatImage(); toast('Please choose a JPEG, PNG or WebP image.', 'warn'); return; }
      if (file.size > SCREENSHOT_MAX) { clearChatImage(); toast('That image is over 2 MB. Please choose a smaller one.', 'warn'); return; }
      try {
        chat.image = await readImage(file);
        showChatImage();
      } catch (err) {
        clearChatImage();
        toast(err.message, 'warn');
      }
    });
    if (chat.image) showChatImage(); // a screenshot picked before leaving the page
  }

  function showChatImage() {
    const box = $('#assistantShot');
    if (!box) return;
    box.innerHTML = `<img src="${esc(chat.image)}" alt=""><button type="button" class="btn btn-ghost">${esc(say('aiRemove'))}</button>`;
    box.hidden = false;
    $('button', box).addEventListener('click', () => { clearChatImage(); $('#assistantAttach').focus(); });
  }

  function clearChatImage() {
    chat.image = null;
    const input = $('#assistantImg'), box = $('#assistantShot');
    if (input) input.value = '';
    if (box) { box.innerHTML = ''; box.hidden = true; }
  }

  /* Earlier turns for the API: complete pairs only (failed replies are left out). */
  function chatHistory() {
    const turns = [];
    for (let i = 0; i + 1 < chat.messages.length; i += 2) {
      const [u, a] = [chat.messages[i], chat.messages[i + 1]];
      if (a.pending || a.error) continue;
      const shot = u.image && u.content !== say('aiShotNote') ? ' ' + say('aiShotNote') : '';
      turns.push({ role: 'user', content: (u.content + shot).slice(0, 2000) }, { role: 'assistant', content: a.content.slice(0, 4000) });
    }
    return turns.slice(-18); // keep the conversation within the server's 20-turn limit
  }

  /* Reads the server's event stream: {type: 'text' | 'refusal' | 'error' | 'done'}. */
  async function streamAssistant(payload, onEvent) {
    let res;
    try {
      res = await fetch('/api/assistant/chat', { method: 'POST', headers: apiHeaders(true), body: JSON.stringify(payload) });
    } catch (e) {
      throw new ApiError(say('aiError'));
    }
    if (!res.ok) {
      const data = await res.json().catch(() => null);
      throw new ApiError((data && data.error) || say('aiError'));
    }
    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';
    for (;;) {
      const { value, done } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      let cut;
      while ((cut = buffer.indexOf('\n\n')) >= 0) {
        const chunk = buffer.slice(0, cut);
        buffer = buffer.slice(cut + 2);
        if (chunk.startsWith('data: ')) {
          try { onEvent(JSON.parse(chunk.slice(6))); } catch (e) { /* ignore a malformed chunk */ }
        }
      }
    }
  }

  async function sendChat(value) {
    const body = String(value || '').trim();
    if (chat.busy || (!body && !chat.image)) return;
    const history = chatHistory();
    const user = { role: 'user', content: body || say('aiShotNote'), image: chat.image };
    const reply = { role: 'assistant', content: '', pending: true };
    chat.messages.push(user, reply);
    const image = chat.image;
    clearChatImage();
    const input = $('#assistantInput');
    if (input) input.value = '';
    chat.busy = true;
    renderChat();

    // Update just the reply being written, so the page doesn't flicker.
    const showProgress = () => {
      const p = $('#assistantLog [data-pending]');
      if (p) p.innerHTML = nl2br(plainReply(reply.content));
    };
    try {
      await streamAssistant({ lang: prefs.lang, messages: [...history, { role: 'user', content: user.content }], image }, ev => {
        if (ev.type === 'text') { reply.content += ev.text; showProgress(); }
        else if (ev.type === 'refusal') { reply.content += (reply.content ? '\n\n' : '') + ev.text; showProgress(); }
        else if (ev.type === 'error') { reply.error = true; reply.content = ev.message; }
      });
      if (!reply.content.trim()) { reply.error = true; reply.content = say('aiError'); }
    } catch (err) {
      reply.error = true;
      reply.content = err.message;
    }
    reply.pending = false;
    chat.busy = false;
    renderChat();
    const status = $('#assistantStatus');
    if (status) status.textContent = reply.content; // read the finished reply to screen readers once
    if ($('#assistantInput')) $('#assistantInput').focus({ preventScroll: true });
  }

  /* Turns the conversation into a normal "Is this a scam?" case for a volunteer. */
  function handOff(button) {
    const lines = chat.messages.filter(m => !m.pending && !m.error)
      .map(m => `${m.role === 'user' ? 'Resident' : 'AI assistant'}: ${m.content}`);
    let body = 'Conversation with the AI assistant\n\n' + lines.join('\n\n');
    if (body.length > 4000) body = '…' + body.slice(-3990);
    const shot = [...chat.messages].reverse().find(m => m.image);
    act(button, async () => {
      const c = await api.post('/cases', { channel: 'Not sure', text: body, image: shot ? shot.image : null });
      upsert(cache.cases, c);
      chat.handedOff = true;
      renderChat();
      toast(say('aiSent'), 'ok', { link: '#/ask', linkText: say('aiAskVolunteer') });
    });
  }

  /* ---------- boot ---------- */
  async function boot() {
    savePrefs(); // persist a newly generated client id
    try { localStorage.removeItem('kampungwatch.state'); } catch (e) { /* old prototype data */ }
    applySettings();
    try {
      const [me, config, circle] = await Promise.all([api.get('/me'), api.get('/config'), api.get('/circles/me')]);
      cache.me = me;
      cache.config = config;
      cache.circle = circle;
      paintHeader();
      paintAssistant();
      // The server forgot this volunteer session (expired or server reset).
      if (prefs.volunteer && !me.volunteer) {
        prefs.volunteer = null;
        savePrefs(); applySettings();
      }
    } catch (e) { /* the router shows a helpful error if the server is down */ }
    connectEvents();
    routeLaunch();
    router();
    checkPendingDrills();
    if ('serviceWorker' in navigator && window.isSecureContext) {
      navigator.serviceWorker.register('/sw.js').catch(() => { /* the site still works without it */ });
    }
  }

  /* Opened from the home-screen icon (?launch=home), its "Pause now" shortcut (?launch=pause),
     or as an installed app that ignores start_url: go straight to the Pause countdown. */
  function routeLaunch() {
    const launchParam = new URLSearchParams(location.search).get('launch');
    let fresh = false;
    try {
      fresh = !sessionStorage.getItem('kampungwatch.launched');
      sessionStorage.setItem('kampungwatch.launched', '1');
    } catch (e) { fresh = !!launchParam; }
    const fromHome = launchParam === 'pause' || launchParam === 'home' || (isStandalone() && fresh);
    // From the home screen: the Pause button, ready to tap (or the countdown, in emergency-button mode).
    const hash = fromHome ? (launchParam === 'pause' || homePauseOn() ? '#/pause/now' : '#/pause')
      : location.hash || '#/home';
    // Drop ?launch=... so a reload doesn't count as another launch.
    history.replaceState(null, '', location.pathname + hash);
  }

  boot();
})();
