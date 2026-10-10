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

  /* ---------- translation ----------
     t('English text') returns that text in the chosen language, from js/i18n.js,
     or the English when there's no translation yet. {name}-style placeholders are
     filled from vars. tx() is the same, escaped for use inside HTML. */
  function t(en, vars) {
    const dict = (KW.I18N && KW.I18N[prefs.lang]) || {};
    const s = Object.prototype.hasOwnProperty.call(dict, en) ? dict[en] : en;
    // {town} is always a town name, so it's shown in the chosen language too.
    return vars ? s.replace(/\{(\w+)\}/g, (m, k) => (k in vars ? (k === 'town' ? placeName(vars[k]) : vars[k]) : m)) : s;
  }
  const inDictionary = en => Boolean(KW.I18N && KW.I18N.zh && Object.prototype.hasOwnProperty.call(KW.I18N.zh, en));
  const tx = (en, vars) => esc(t(en, vars));
  /* Like tx(), but the {placeholders} are filled with ready-made HTML (links, bold numbers). */
  function th(en, html) {
    return esc(t(en)).replace(/\{([\w/]+)\}/g, (m, k) => (k in html ? html[k] : m));
  }
  const telLink = n => `<a href="tel:${n.replace(/\s/g, '')}">${n}</a>`;

  /* Town names in the chosen language. The English name stays the value that's saved and
     filtered on; anything after it is kept, so "Tampines CC" becomes "淡滨尼 CC". */
  function placeName(name) {
    const s = String(name ?? '');
    const town = Object.keys(KW.TOWNS).find(n => s === n || s.startsWith(n + ' '));
    return town ? t(town) + s.slice(town.length) : s;
  }
  // "Priya (Student Volunteer)": the role in brackets is translated, the name isn't.
  const authorName = s => String(s ?? '').replace(/\(([^()]+)\)$/, (m, role) => `(${t(role)})`);

  /* ---------- what residents write ----------
     Posts, comments, Radar reports and chat messages are written by people, so js/i18n.js
     can't cover them. written(text) draws the original and marks it; translateWritten()
     then asks the server's AI for the chosen language and swaps the translation in.
     Each text is fetched once; if the AI isn't available the original simply stays. */
  const writtenCache = {};   // lang -> Map(original -> translation, or null when it couldn't be translated)
  let showOriginal = false;
  function written(text, { br = false } = {}) {
    const src = String(text ?? '');
    const show = v => (br ? nl2br(v) : esc(v));
    if (prefs.lang === 'en' || showOriginal || !src.trim()) return show(src);
    const done = writtenCache[prefs.lang] && writtenCache[prefs.lang].get(src);
    if (done) return `<span class="written" lang="${prefs.lang}">${show(done)}</span>`;
    return `<span class="written" lang="en" data-written="${esc(src)}"${br ? ' data-br' : ''}>${show(src)}</span>`;
  }
  // Fixed labels (like the Scam / Looks legit poll answers) come from js/i18n.js; anything else was written by a person.
  const label = s => (inDictionary(s) ? tx(s) : written(s));

  let translating = false;
  async function translateWritten() {
    const lang = prefs.lang;
    if (lang === 'en' || showOriginal || translating || !$('[data-written]')) return;
    const known = writtenCache[lang] || (writtenCache[lang] = new Map());
    const todo = [...new Set($$('[data-written]').map(el => el.dataset.written))].filter(s => !known.has(s));
    translating = true;
    try {
      for (let i = 0; i < todo.length; i += 40) {
        const chunk = todo.slice(i, i + 40);
        const res = await api.post('/translate', { lang, texts: chunk.map(s => s.slice(0, 4000)) });
        chunk.forEach((s, j) => known.set(s, res.translations[j]));
      }
    } catch (err) {
      todo.forEach(s => { if (!known.has(s)) known.set(s, null); }); // AI switched off or offline: keep the originals
    } finally {
      translating = false;
    }
    if (prefs.lang !== lang || showOriginal) return;
    $$('[data-written]').forEach(el => {
      const done = known.get(el.dataset.written);
      if (done === undefined) return; // appeared while we waited; handled on the next pass
      if (done) {
        el.innerHTML = el.hasAttribute('data-br') ? nl2br(done) : esc(done);
        el.lang = lang;
      }
      el.removeAttribute('data-written');
    });
    if ($('[data-written]')) translateWritten();
  }

  /* Shown above translated posts and reports, with a way back to the original words. */
  const writtenNote = () => prefs.lang === 'en' ? '' : `
    <p class="written-note">${tx('Text written by residents is translated automatically by AI, so a few words may be off.')}
      <button type="button" class="written-toggle" data-show-original>${showOriginal ? tx('Show translation') : tx('Show original')}</button></p>`;

  function timeAgo(iso) {
    const s = Math.max(0, (Date.now() - new Date(iso).getTime()) / 1000);
    if (s < 45) return t('just now');
    if (s < 3600) return t('{n} min ago', { n: Math.round(s / 60) });
    if (s < 86400) return t('{n}h ago', { n: Math.round(s / 3600) });
    const d = Math.round(s / 86400);
    return d === 1 ? t('yesterday') : t('{n} days ago', { n: d });
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
      homePause: p.homePause === true, // emergency-button mode: off unless chosen
      pauseLink: p.pauseLink || null // this device's emergency link (the server keeps only a hash)
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
      toast(err.message === 'offline' ? t('Can’t reach the server. Check your connection and try again.') : err.message, 'warn');
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
    el.innerHTML = `<span>${esc(msg)}</span>${link ? `<a href="${esc(link)}">${esc(linkText || t('View'))}</a>` : ''}`;
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
            <button type="button" class="btn btn-ghost" data-close>${tx('Close')}</button>
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
      if (!file.type.startsWith('image/')) return reject(new Error(t('Please choose an image file.')));
      const reader = new FileReader();
      reader.onerror = () => reject(new Error(t('Could not read that file.')));
      reader.onload = () => {
        const img = new Image();
        img.onerror = () => reject(new Error(t('Could not read that image.')));
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
          <button type="button" class="btn btn-secondary" data-pick="${id}" aria-describedby="${id}Label">${tx('Choose a screenshot')}</button>
          <span class="muted">${tx('JPEG, PNG or WebP, up to 2 MB')}</span>
        </div>
        <div class="img-preview" id="${id}Prev">${initial ? `<img src="${esc(initial)}" alt="${tx('Attached screenshot')}">` : ''}</div>
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
      if (!SCREENSHOT_TYPES.includes(file.type)) { clear(); toast(say('imgType'), 'warn'); return; }
      if (file.size > SCREENSHOT_MAX) { clear(); toast(say('imgSize'), 'warn'); return; }
      try {
        data = await readImage(file);
        preview.innerHTML = `<img src="${esc(data)}" alt="${esc(say('shotAlt'))}"><button type="button" class="btn btn-ghost">${esc(say('remove'))}</button>`;
        $('button', preview).addEventListener('click', () => { clear(); if (pick) pick.focus(); });
      } catch (err) {
        clear();
        toast(err.message, 'warn');
      }
    });
    return () => data;
  }


  function townOptions(selected = '', includeAll = false, allLabel = t('All areas')) {
    return (includeAll ? `<option value="">${esc(allLabel)}</option>` : '') +
      Object.keys(KW.TOWNS).map(n => `<option value="${esc(n)}" ${n === selected ? 'selected' : ''}>${tx(n)}</option>`).join('');
  }

  /* ---------- red-flag analysis (instant, in the browser) ---------- */
  function analyse(text) {
    const flags = KW.FLAG_RULES.filter(r => r.re.test(text));
    const level = flags.length >= 3 ? 'high' : flags.length >= 1 ? 'medium' : 'low';
    return { flags, level };
  }

  /* The same verdict and numbered list as the Check First screen, for posts and dialogs. */
  function flagsHTML(text) {
    if (!text.trim()) return `<p class="muted">${tx('Red flags will appear here as you type.')}</p>`;
    const { flags } = analyse(text);
    const verdict = flags.length === 0 ? say('vNone') : flags.length === 1 ? say('vOne') : say('vMany', flags.length);
    return `
      <p class="flag-verdict">${esc(verdict)}</p>
      ${flags.length ? `<ol class="flag-list" role="list">${flags.map((f, i) => `
        <li><span class="flag-n">${i + 1}</span><span class="flag-label">${tx(f.label)}</span><span class="flag-tip">${tx(f.tip)}</span></li>`).join('')}</ol>` : ''}`;
  }

  /* ---------- settings, header & volunteer sign-in ---------- */
  function applySettings() {
    document.documentElement.classList.toggle('large-text', prefs.largeText);
    document.body.classList.toggle('volunteer-on', isVolunteer());
    $$('[data-text-size]').forEach(b => b.setAttribute('aria-pressed', String(prefs.largeText)));
    paintHeader();
    if (prefs.volunteer) {
      const v = prefs.volunteer;
      $('#volStripText').textContent = t('Signed in as {name} ({role}, {area}).', { name: v.name, role: t(v.role), area: placeName(v.area) });
    }
  }

  /* The header follows the chosen language on every page. */
  function paintHeader() {
    const header = $('.site-header');
    header.lang = prefs.lang;
    $$('[data-i18n]', header).forEach(el => { el.textContent = say(el.dataset.i18n); });
    $$('[data-i18n-label]', header).forEach(el => { el.setAttribute('aria-label', say(el.dataset.i18nLabel)); });
    const town = userTown();
    $('#navTown').textContent = town ? ` · ${placeName(town)}` : '';
    $('#volunteerBtn').textContent = say(isVolunteer() ? 'signOut' : 'volunteer');
    $('#langSelect').value = prefs.lang;
    paintStatic();
    paintAssistant();
  }

  /* Fixed text in index.html (footer, skip link…): data-t holds the English. */
  function paintStatic() {
    document.documentElement.lang = prefs.lang;
    $$('[data-t]').forEach(el => { el.textContent = t(el.dataset.t); });
    $('.site-bar').setAttribute('aria-label', t('Main'));
    $('#footerHelplines').innerHTML = KW.HELPLINES.map(h =>
      `<li>${telLink(h.number)} <span>${tx(h.label)}</span><span class="muted">${tx(h.note)}</span></li>`).join('');
    if (prefs.volunteer) {
      const v = prefs.volunteer;
      $('#volStripText').textContent = t('Signed in as {name} ({role}, {area}).', { name: v.name, role: t(v.role), area: placeName(v.area) });
    }
  }

  // A page can keep what's typed by redrawing just its own text; otherwise the page is redrawn.
  let onLangChange = null;
  $('#langSelect').addEventListener('change', e => {
    prefs.lang = e.target.value;
    savePrefs();
    paintHeader();
    if (onLangChange) onLangChange();
    else router();
  });

  new MutationObserver(debounce(translateWritten, 150)).observe(main, { childList: true, subtree: true });
  document.addEventListener('click', e => {
    if (!e.target.closest('[data-show-original]')) return;
    showOriginal = !showOriginal;
    router();
  });

  document.addEventListener('click', e => {
    if (!e.target.closest('[data-text-size]')) return;
    prefs.largeText = !prefs.largeText;
    savePrefs(); applySettings();
  });

  function toggleVolunteer() {
    if (isVolunteer()) {
      api.del('/volunteer/session').catch(() => {});
      endVolunteerSession(t('Signed out. Back to the resident view.'));
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

  /* Becoming a volunteer: confirm who you are (Singpass in a real launch, a demo here),
     pass the Intermediate courses in Learn, then choose a role and area. The server
     checks both steps, so residents know every volunteer is real and trained. */
  async function openVolunteerLogin() {
    const roles = (cache.config && cache.config.volunteerRoles) || ['Digital Ambassador', 'RC Volunteer', 'Student Volunteer', 'CC Scam-Buster'];
    let steps;
    try {
      steps = await api.get('/volunteer/steps');
    } catch (err) {
      toast(err.message === 'offline' ? t('Can’t reach the server. Check your connection and try again.') : err.message, 'warn');
      return;
    }
    const tick = done => `<span class="vol-step-mark" aria-hidden="true">${done ? '✓' : ''}</span>`;
    openModal({
      title: t('Become a volunteer'),
      body: `
        <p class="muted">${tx('Volunteers answer cases, verify Scam Radar reports and give verdicts in the community. So residents can trust them, every volunteer confirms who they are and passes the Intermediate courses first.')}</p>
        <ol class="vol-steps" role="list">
          <li class="vol-step ${steps.identity ? 'is-done' : ''}">
            <h3>${tick(steps.identity)}${tx('1. Confirm who you are')}</h3>
            ${steps.identity ? `<p>${th('Confirmed as {name} (Singpass demo).', { name: `<strong>${esc(steps.identity.name)}</strong>` })}</p>` : `
              <form id="volVerify" class="vol-verify">
                <p class="muted">${tx('In a real launch this opens Singpass. This prototype can’t connect to Singpass, so type your name as it appears on your NRIC.')}</p>
                <div class="field"><label for="vName">${tx('Your name')}</label><input id="vName" class="input" required minlength="2" maxlength="40" autocomplete="name"></div>
                <button type="submit" class="btn btn-secondary">${tx('Verify with Singpass (demo)')}</button>
              </form>`}
          </li>
          <li class="vol-step ${steps.courses.every(c => c.passed) ? 'is-done' : ''}">
            <h3>${tick(steps.courses.every(c => c.passed))}${tx('2. Pass the Intermediate courses')}</h3>
            <ul class="vol-courses" role="list">
              ${steps.courses.map(c => `
                <li><span>${tx(c.title)}</span>${c.passed
                  ? `<span class="tag tag-accent">${tx('Passed')}</span>`
                  : `<a class="btn btn-ghost" href="#/learn/course/${esc(c.id)}" data-close>${tx('Take the course')}</a>`}</li>`).join('')}
            </ul>
          </li>
          <li class="vol-step">
            <h3>${tick(false)}${tx('3. Choose your role and area')}</h3>
            <form id="volForm" class="form-grid">
              <div class="field"><label for="vRole">${tx('Role')}</label><select id="vRole" class="input">${roles.map(r => `<option value="${esc(r)}">${tx(r)}</option>`).join('')}</select></div>
              <div class="field"><label for="vArea">${tx('Area')}</label><select id="vArea" class="input">${townOptions(prefs.subscription.town || 'Tampines')}</select></div>
              ${steps.ready ? '' : `<p class="full muted">${tx('Finish steps 1 and 2 to sign in.')}</p>`}
              <div class="full form-actions">
                <button type="button" class="btn btn-secondary" data-close>${tx('Cancel')}</button>
                <button type="submit" class="btn btn-primary" ${steps.ready ? '' : 'disabled'}>${tx('Sign in')}</button>
              </div>
            </form>
          </li>
        </ol>`,
      onMount: body => {
        $$('[data-close]', body).forEach(b => b.addEventListener('click', () => closeModal()));
        const verify = $('#volVerify', body);
        if (verify) verify.addEventListener('submit', e => {
          e.preventDefault();
          act(e.submitter, async () => {
            await api.post('/volunteer/verify', { name: $('#vName', body).value });
            closeModal({ silent: true });
            openVolunteerLogin(); // redraw with step 1 ticked
          });
        });
        $('#volForm', body).addEventListener('submit', e => {
          e.preventDefault();
          act(e.submitter, async () => {
            const res = await api.post('/volunteer/login', { role: $('#vRole', body).value, area: $('#vArea', body).value });
            prefs.volunteer = { token: res.token, ...res.volunteer };
            savePrefs();
            closeModal({ silent: true });
            applySettings();
            connectEvents();
            toast(t('Welcome, {name}! Volunteer mode is on.', { name: res.volunteer.name }), 'ok');
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
    if (!confirm(t('Clear this browser’s Kampung Watch data? Your course progress, alert settings and anonymous identity will be reset.'))) return;
    try { localStorage.removeItem(PREFS_KEY); } catch (e) { /* ignore */ }
    location.replace('#/home');
    location.reload();
  });


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
      notify(t('{name} replied', { name: by }), t('Your “Is this a scam?” case has an answer.'), '#/ask');
    } else if (kind === 'new' && isVolunteer()) {
      notify(t('New case'), t('A resident needs help checking a message.'), '#/ask');
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
    toast(`${title}: ${body}`, 'info', { link, linkText: t('Open') });
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
    ai: renderAssistantPage,
    sos: renderSos // emergency link from a phone shortcut
  };

  async function router() {
    const seq = ++routeSeq;
    const parts = location.hash.replace(/^#\/?/, '').split('/').filter(Boolean).map(decodeURIComponent);
    const route = routes[parts[0]] ? parts[0] : 'home';
    current = { route, args: parts.slice(1) };
    if (map) { map.remove(); map = null; markerLayer = null; }
    clearInterval(pauseTimer);
    clearInterval(sosTimer);
    cancelLaunch();
    $$('#siteNav a').forEach(a => {
      if (a.dataset.route === (route === 'home' ? 'pause' : route)) a.setAttribute('aria-current', 'page');
      else a.removeAttribute('aria-current');
    });
    $('#siteNav').classList.remove('open');
    $('#navToggle').setAttribute('aria-expanded', 'false');
    // The floating "Is this a scam?" button would cover the main buttons on these pages.
    $('#fab').hidden = routes[route] === renderAsk || routes[route] === renderPause || route === 'ai' || route === 'sos';
    document.body.classList.remove('route-ask');
    onLangChange = null;
    main.innerHTML = `<div class="page"><p class="kicker" role="status">${tx('Loading…')}</p></div>`;
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
          <p class="kicker">${offline ? tx('Offline') : tx('Error')}</p>
          <h1 class="display">${offline ? tx('Can’t reach the Kampung Watch server.') : tx('Something went wrong.')}</h1>
          <p class="lede">${offline ? th('Check your connection. If you’re running it yourself, start the server with {cmd} in the project folder.', { cmd: '<code>npm start</code>' }) : esc(err.message)}</p>
          ${offline ? `<p class="lede">${th('Being pressured to pay right now? Don’t pay. Call someone you trust, or the ScamShield Helpline {1799}. In danger, call {999}.', { 1799: telLink('1799'), 999: telLink('999') })}</p>` : ''}
          <button type="button" class="btn btn-primary btn-lg" id="retryBtn">${tx('Try again')}</button>
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
  const ASK_COPY = KW.COPY; // keyed copy for the header and Check a message, in js/i18n.js

  function say(key, ...args) {
    const own = ASK_COPY[prefs.lang] || {};
    const v = key in own ? own[key] : ASK_COPY.en[key];
    return typeof v === 'function' ? v(...args) : v;
  }

  /* Languages a volunteer can call back in. Must match LANGS in server/src/routes/cases.js. */
  const CALLBACK_LANGS = ['English', '华语 (Mandarin)', 'Bahasa Melayu', 'தமிழ் (Tamil)', 'Hokkien / Teochew'];
  // Volunteers list their languages in each language's own script; only "English" needs translating.
  const langList = langs => langs.split(/,\s*/).map(l => tx(l)).join(esc(t(', ')));
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
              <p class="cf-promise" id="askPromise"></p>
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
                  ${KW.CHANNELS.map(c => `<option value="${esc(c)}">${tx(c)}</option>`).join('')}
                </select>
              </div>
              <p class="cf-note" data-i18n="cbIntro"></p>
              <div class="cf-callback">
                <div class="field"><label for="cbName" data-i18n="cbName"></label><input type="text" id="cbName" class="input" maxlength="60" autocomplete="given-name"></div>
                <div class="field"><label for="cbPhone" data-i18n="cbPhone"></label><input type="tel" id="cbPhone" class="input" inputmode="tel" maxlength="20" autocomplete="tel" placeholder="8123 4567"></div>
                <div class="field"><label for="cbLang" data-i18n="cbLang"></label>
                  <select id="cbLang" class="input">${CALLBACK_LANGS.map(l => `<option value="${esc(l)}">${tx(l)}</option>`).join('')}</select>
                </div>
              </div>
              <p class="cf-note" data-i18n="privacy"></p>
            </div>
          </details>

        </div>

        <div class="cf-band">
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
          <p class="vol-only cf-note">${tx('Replies you send here go to residents as {name}.', { name: vol ? prefs.volunteer.name : t('a volunteer') })}</p>
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
          <span class="cf-flag-label">${tx(f.label)}</span>
          <span class="cf-flag-tip">${tx(f.tip)}</span>
        </li>`).join('');
    }

    function paintCopy() {
      screen.lang = prefs.lang;
      $$('[data-i18n]', screen).forEach(el => { el.textContent = say(el.dataset.i18n); });
      $$('[data-i18n-placeholder]', screen).forEach(el => { el.placeholder = say(el.dataset.i18nPlaceholder); });
      $$('[data-i18n-label]', screen).forEach(el => { el.setAttribute('aria-label', say(el.dataset.i18nLabel)); });
      const call = n => `<a href="tel:${n}">${n}</a>`;
      $('#askHelp').innerHTML = esc(say('help')).replace('{999}', call('999')).replace('{1799}', call('1799'));
      $('#askPromise').textContent = t('A volunteer usually replies within {n} seconds.', { n: REPLY_TARGET_SECONDS });
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
      if (!onDuty.length) { list.innerHTML = `<li class="cf-note">${esc(say('dutyNone', placeName(town)))}</li>`; return; }
      list.innerHTML = onDuty.map((v, i) => `
        <li class="duty">
          <span class="duty-avatar" aria-hidden="true">${esc(initials(v.name))}</span>
          <span class="duty-who"><span class="duty-name">${esc(v.name)}</span><span class="duty-meta">${tx(v.role)} · ${langList(v.langs)}</span></span>
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
          <a href="#/radar" class="block-title">${written(r.title)}</a>
          <span class="block-leader" aria-hidden="true"></span>
          <span class="block-count" aria-label="${esc(say('hit', r.count))}">${r.count}</span>
        </li>`).join('') : `<li class="cf-note">${esc(say('blockNone', placeName(town)))}</li>`;
    }

    paintCopy();
    text.addEventListener('input', () => updateCheck());

    onLangChange = () => { paintCopy(); renderCaseList(); }; // re-translate without losing what's typed

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

  /* How long a resident should expect to wait for a volunteer's first reply. The simulated
     volunteer (server/src/bot.js) answers well inside this; a human volunteer may take longer. */
  const REPLY_TARGET_SECONDS = 30;

  /* Countdown on each case still waiting for its first reply. When it runs out, the
     resident is pointed to Ask AI and the helpline instead of being left waiting. */
  let waitTimer = null;
  function tickWaits() {
    const els = $$('[data-wait-since]');
    if (!els.length) { clearInterval(waitTimer); waitTimer = null; return; }
    els.forEach(el => {
      const left = Math.ceil(REPLY_TARGET_SECONDS - (Date.now() - new Date(el.dataset.waitSince)) / 1000);
      const late = left <= 0;
      const html = late
        ? th('Taking longer than usual. {ai}Ask AI{/ai} while you wait, or call the ScamShield Helpline {1799}.', { ai: '<a href="#/ai">', '/ai': '</a>', 1799: telLink('1799') })
        : tx('A volunteer will reply within {n} seconds.', { n: left });
      if (el.dataset.shown !== html) { el.innerHTML = html; el.dataset.shown = html; }
      el.classList.toggle('is-late', late);
    });
  }
  function startWaits() {
    tickWaits();
    if (!waitTimer && $('[data-wait-since]')) waitTimer = setInterval(tickWaits, 1000);
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
      list.innerHTML = `<div class="empty"><p>${vol ? tx('No cases in the inbox right now.') : tx('No cases yet. When you send something to check, the conversation with your volunteer appears here.')}</p></div>`;
      return;
    }

    list.innerHTML = cache.cases.map(c => {
      const status = { waiting: [t('Waiting for volunteer'), 'tag-outline'], replied: [t('Volunteer replied'), 'tag-accent'], resolved: [t('Resolved'), 'tag-neutral'] }[c.status];
      return `
        <article class="case" id="case-${esc(c.id)}">
          <header class="case-head">
            <div class="tag-row">
              <span class="tag ${status[1]}">${esc(status[0])}</span>
              ${c.verdict ? `<span class="tag ${VERDICTS[c.verdict][1]}">${tx(VERDICTS[c.verdict][0])}</span>` : ''}
              ${c.callback ? `<span class="tag tag-neutral">${tx('Call-back requested')}</span>` : ''}
              ${vol && c.mine ? `<span class="tag tag-neutral">${tx('Your own case')}</span>` : ''}
            </div>
            <span class="muted">${tx(c.channel)} · ${timeAgo(c.created)}</span>
          </header>
          ${vol && c.callback ? `<p class="callback-note">${th('Call {name} at {phone}', { name: `<strong>${esc(c.callback.name || t('the resident'))}</strong>`, phone: `<a href="tel:${esc(c.callback.phone.replace(/\s/g, ''))}">${esc(c.callback.phone)}</a>` })} · ${tx(c.callback.lang)}</p>` : ''}
          <blockquote class="case-quote">${c.text ? nl2br(c.text) : c.image ? `<em>${tx('(screenshot only)')}</em>` : `<em>${tx('(call-back request)')}</em>`}</blockquote>
          ${c.image ? `<img class="case-img" src="${esc(c.image)}" alt="${tx('Screenshot attached to case')}">` : ''}
          <div class="thread">
            ${c.messages.map(m => `
              <div class="msg msg-${messageSide(m, vol)}">
                ${m.from === 'vol' ? `<span class="msg-name">${esc(m.name)}</span>` : ''}
                ${m.from === 'resident' && vol ? `<span class="msg-name">${tx('Resident')}</span>` : ''}
                <p>${written(m.body, { br: true })}</p>
                <time>${timeAgo(m.at)}</time>
              </div>`).join('')}
            ${c.status === 'waiting' && !vol ? `<p class="case-wait" data-wait-since="${esc(c.created)}"></p>` : ''}
            ${c.status === 'waiting' && c.volunteer && !vol ? `<div class="msg msg-system typing">${tx('{name} is typing', { name: c.volunteer.name })}<span class="dots"><i></i><i></i><i></i></span></div>` : ''}
          </div>
          ${c.status !== 'resolved' ? `
            ${vol ? `
              <div class="verdict-row" role="group" aria-label="${tx('Set verdict')}">
                <span class="muted">${tx('Verdict:')}</span>
                ${Object.entries(VERDICTS).map(([k, [label]]) => `<button class="btn ${c.verdict === k ? 'btn-primary' : 'btn-secondary'}" data-verdict="${k}" data-id="${esc(c.id)}" aria-pressed="${c.verdict === k}">${tx(label)}</button>`).join('')}
              </div>` : ''}
            <form class="reply-form" data-id="${esc(c.id)}">
              <label class="sr-only" for="reply-${esc(c.id)}">${tx('Reply')}</label>
              <textarea id="reply-${esc(c.id)}" class="input" data-case="${esc(c.id)}" rows="2" maxlength="3000" placeholder="${vol ? tx('Reply to the resident as a volunteer…') : tx('Add more details or ask a follow-up…')}">${esc(drafts[c.id] || '')}</textarea>
              <button class="btn btn-primary" type="submit">${tx('Send')}</button>
            </form>` : ''}
          <footer class="case-actions">
            ${c.status !== 'resolved' ? `<button class="btn btn-ghost" data-resolve="${esc(c.id)}">${tx('Mark resolved')}</button>` : ''}
            ${c.shared ? `<a class="btn btn-ghost" href="#/community/post/${esc(c.shared)}">${tx('View community post')}</a>`
              : c.mine ? `<button class="btn btn-ghost" data-share="${esc(c.id)}">${tx('Share anonymously with the community')}</button>` : ''}
            ${c.verdict === 'scam' ? `<button class="btn btn-ghost" data-radar="${esc(c.id)}">${tx('Report to Scam Radar')}</button>` : ''}
          </footer>
        </article>`;
    }).join('');
    startWaits();

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
      toast(t('Shared to the community with personal details hidden.'), 'ok', { link: '#/community/post/' + postId, linkText: t('Open post') });
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
    return s >= 120 && s % 60 === 0 ? t('{n} minutes', { n: s / 60 }) : t('{n} seconds', { n: s });
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
            <p class="kicker">${tx('Pause · before you pay')}</p>
            <h1 class="display">${tx('Someone pushing you to pay? Press Pause.')}</h1>
          </div>
          <div class="head-side">
            <p class="lede">${tx('Scammers win by keeping you alone and in a hurry. Pause brings in the people you trust. Your Circle gets an alert straight away and calls you. If no one answers within {wait}, a volunteer near you steps in.', { wait: fmtWait() })}</p>
          </div>
        </header>
        <section id="pauseZone" class="pause-zone" aria-label="${tx('Pause')}"></section>
        <section id="installZone" class="section install-zone" aria-labelledby="installTitle"></section>
        <section id="guardZone" class="section" aria-labelledby="guardTitle" hidden></section>
        <section id="volPauseZone" class="section vol-only" aria-labelledby="volPauseTitle"></section>
        <section id="circleZone" class="section" aria-labelledby="circleTitle"></section>
        <section class="section" aria-labelledby="impactTitle">
          <h2 class="section-title" id="impactTitle">${tx('Pause so far')}</h2>
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
          <span class="pause-btn-word">${tx('Pause')}</span>
          <span class="pause-btn-sub">${members.length ? tx('Alert my Circle') : tx('Alert a volunteer')}</span>
        </button>
        <div class="pause-who">
          <h2 class="kicker">${tx('Who gets the alert')}</h2>
          ${members.length ? `
            <ul class="pause-people" role="list">${members.map(m => `<li><strong>${esc(m.name)}</strong> <span class="muted">${tx(m.relation)}</span></li>`).join('')}</ul>
            <p class="muted">${tx('If no one answers within {wait}, volunteers near {town} are alerted too.', { wait: fmtWait(), town: circle.mine.town })}</p>`
          : `
            <p>${circle.mine ? tx('No one has joined your Circle yet, so volunteers near you will get the alert.') : tx('You haven’t set up your Circle yet, so volunteers near you will get the alert.')}</p>
            <p><button type="button" class="btn btn-secondary" data-jump="circleTitle">${circle.mine ? tx('Invite your family') : tx('Set up your Circle')}</button></p>`}
          <p class="cf-help">${th('Money leaving your account right now? Call {999}. For advice, call the ScamShield Helpline {1799}.', { 999: telLink('999'), 1799: telLink('1799') })}</p>
        </div>
      </div>
      ${past.length ? `
        <div class="pause-history">
          <h2 class="kicker">${tx('Your recent Pauses')}</h2>
          <ul class="plain-list" role="list">${past.map(p => `
            <li>${timeAgo(p.created)}
              ${p.outcome ? `<span class="tag ${OUTCOMES[p.outcome][1]}">${tx(OUTCOMES[p.outcome][0])}</span>` : ''}
              ${p.responder ? `<span class="muted">${tx('helped by {name}', { name: p.responder.name })}</span>` : ''}</li>`).join('')}
          </ul>
        </div>` : ''}`;
  }

  function pauseLiveHTML(p) {
    const waiting = !p.responder && p.stage === 'circle';
    const headline = p.responder ? t('{name} is calling you now.', { name: p.responder.name })
      : p.stage === 'circle' ? t('Your Circle has been alerted.') : t('Volunteers near you have been alerted.');
    const deadline = new Date(p.created).getTime() + escalateSeconds() * 1000;
    return `
      <div class="pause-live">
        <div class="pause-live-main">
          <p class="kicker">${tx('Pause is on · started {when}', { when: timeAgo(p.created) })}</p>
          <h2 class="pause-headline" role="status">${esc(headline)}</h2>
          ${p.responder ? `<p class="lede">${tx(p.responder.detail)}${p.responder.kind === 'volunteer' ? ` · ${tx('volunteer')}` : ''}</p>` : ''}
          ${waiting ? `
            <p class="pause-clock">${th('If no one answers in {time}, volunteers are alerted too.', { time: `<strong id="pauseCountdown" data-deadline="${deadline}">${fmtClock(escalateSeconds())}</strong>` })}</p>
            <div class="btn-row"><button type="button" class="btn btn-secondary" data-escalate="${esc(p.id)}">${tx('Get a volunteer now')}</button></div>` : ''}
          ${pauseStepsHTML()}
          <h3 class="kicker">${tx('Messages')}</h3>
          ${pauseThread(p)}
          ${pauseReplyForm(p, t('Tell them what’s happening…'))}
          <h3 class="kicker">${tx('How did it end?')}</h3>
          ${outcomeButtons(p, true)}
        </div>
        <aside class="pause-live-side" aria-labelledby="signsTitle">
          <h3 class="kicker" id="signsTitle">${tx('What’s happening? Tap any that apply')}</h3>
          <div class="sign-list" role="group" aria-labelledby="signsTitle">
            ${KW.PAUSE_SIGNS.map(s => `<button type="button" class="sign-btn" id="sign-${s.id}" data-sign="${s.id}" data-id="${esc(p.id)}" aria-pressed="${p.signs.includes(s.id)}">${tx(s.label)}</button>`).join('')}
          </div>
          <div class="field">
            <label for="pauseCaller">${tx('Who do they say they are?')}</label>
            <select id="pauseCaller" class="input" data-id="${esc(p.id)}">
              <option value="">${tx('Not sure')}</option>
              ${KW.PAUSE_CALLERS.map(c => `<option value="${esc(c)}" ${p.caller === c ? 'selected' : ''}>${tx(c)}</option>`).join('')}
            </select>
          </div>
          <p class="muted">${tx('Your Circle sees this straight away, so they know what to say when they call.')}</p>
        </aside>
      </div>`;
  }

  function pauseStepsHTML() {
    return `
      <ol class="pause-steps">
        <li>${th('{b}Don’t pay, and don’t share any code.{/b} Not even to “stop” something.', { b: '<strong>', '/b': '</strong>' })}</li>
        <li>${th('{b}It’s OK to hang up.{/b} Real police officers and banks won’t mind.', { b: '<strong>', '/b': '</strong>' })}</li>
        <li>${th('{b}Wait for the call,{/b} or call the ScamShield Helpline {1799}.', { b: '<strong>', '/b': '</strong>', 1799: telLink('1799') })}</li>
      </ol>`;
  }

  function pauseThread(p) {
    const own = p.role === 'owner';
    return `<div class="thread">${p.messages.map(m => {
      const side = m.from === 'system' ? 'system' : m.from === 'resident' ? (own ? 'me' : 'them') : 'vol';
      const name = m.from === 'resident' ? (own ? '' : p.name) : m.name;
      return `
        <div class="msg msg-${side}">
          ${name && side !== 'system' ? `<span class="msg-name">${esc(name)}</span>` : ''}
          <p>${written(m.body, { br: true })}</p>
          <time>${timeAgo(m.at)}</time>
        </div>`;
    }).join('')}</div>`;
  }

  function pauseReplyForm(p, placeholder) {
    if (p.status !== 'open') return '';
    const id = esc(p.id);
    return `
      <form class="reply-form" data-pause-reply="${id}">
        <label class="sr-only" for="pr-${id}">${tx('Message')}</label>
        <textarea id="pr-${id}" class="input" rows="2" maxlength="1000" placeholder="${esc(placeholder)}"></textarea>
        <button class="btn btn-primary" type="submit">${tx('Send')}</button>
      </form>`;
  }

  function outcomeButtons(p, own) {
    if (p.status !== 'open') {
      return p.outcome ? `<p><span class="tag ${OUTCOMES[p.outcome][1]}">${tx(OUTCOMES[p.outcome][0])}</span></p>` : '';
    }
    const id = esc(p.id);
    return `
      <div class="btn-row pause-outcomes" role="group" aria-label="${tx('How did it end?')}">
        <button type="button" class="btn btn-primary" data-outcome="stopped" data-id="${id}">${own ? tx('I’m safe. I didn’t pay') : tx('{name} is safe and didn’t pay', { name: p.name })}</button>
        <button type="button" class="btn btn-secondary" data-outcome="safe" data-id="${id}">${tx('It was genuine')}</button>
        <button type="button" class="btn btn-ghost" data-outcome="lost" data-id="${id}">${own ? tx('I already paid or shared details') : tx('Money or details were lost')}</button>
      </div>`;
  }

  /* An open Pause, as a Circle member or volunteer sees it. */
  function helperPauseHTML(p, { escalate = false } = {}) {
    const id = esc(p.id);
    return `
      <div class="guard-pause">
        <p class="pause-headline">${tx('{name} pressed Pause {when}.', { name: p.name, when: timeAgo(p.created) })}</p>
        ${p.caller ? `<p>${th('Caller says they are: {who}', { who: `<strong>${tx(p.caller)}</strong>` })}</p>` : ''}
        ${p.signs.length
          ? `<ul class="sign-tags" role="list">${p.signs.map(s => `<li class="tag tag-accent-2">${tx(SIGN_LABEL[s])}</li>`).join('')}</ul>`
          : `<p class="muted">${tx('They haven’t added any details yet.')}</p>`}
        ${p.responder
          ? `<p>${th('{name} ({detail}) is on it.', { name: `<strong>${esc(p.responder.name)}</strong>`, detail: tx(p.responder.detail) })}</p>`
          : `<div class="btn-row">
              <button type="button" class="btn btn-primary btn-lg" data-respond="${id}">${tx('I’m on it, calling now')}</button>
              ${escalate && p.stage === 'circle' ? `<button type="button" class="btn btn-ghost" data-escalate="${id}">${tx('Ask a volunteer to call')}</button>` : ''}
            </div>`}
        ${p.stage === 'volunteer' && escalate ? `<p class="muted">${tx('Volunteers have been alerted too.')}</p>` : ''}
        ${pauseThread(p)}
        ${pauseReplyForm(p, t('Message {name}…', { name: p.name }))}
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
    toast(t('Kampung Watch is on your home screen. Tap it whenever someone pressures you to pay.'), 'ok');
    if ($('#installZone')) drawInstallZone();
  });

  function drawInstallZone() {
    const zone = $('#installZone');
    if (!zone) return;
    const sosOpen = $('#sosBox') ? $('#sosBox').open : false;
    let how;
    if (isStandalone()) {
      how = `<p>${tx('Kampung Watch is on your home screen.')}</p>`;
    } else if (!window.isSecureContext) {
      how = `<p class="muted">${tx('Adding to the home screen needs the secure (https://) address of Kampung Watch. Open it from that address on your phone.')}</p>`;
    } else if (installPrompt) {
      how = `<p><button type="button" class="btn btn-primary btn-lg" id="installBtn">${tx('Add to home screen')}</button></p>`;
    } else if (isIOS()) {
      how = `<ol class="install-steps">
          <li>${th('Tap the {b}Share{/b} button in Safari (the square with an arrow).', { b: '<strong>', '/b': '</strong>' })}</li>
          <li>${th('Choose {b}Add to Home Screen{/b}, then {b}Add{/b}.', { b: '<strong>', '/b': '</strong>' })}</li>
        </ol>`;
    } else {
      how = `<p>${th('Open your browser’s menu and choose {b}Add to Home screen{/b} or {b}Install app{/b}.', { b: '<strong>', '/b': '</strong>' })}</p>`;
    }
    zone.innerHTML = `
      <h2 class="kicker" id="installTitle">${tx('Pause from your home screen')}</h2>
      <p>${tx('When someone is pushing you to pay, you won’t have time to look for a website. Put Kampung Watch on your home screen: it opens on the Pause button, so help is two taps away.')}</p>
      ${how}
      <details class="cf-more" id="sosBox">
        <summary>${isIOS() ? tx('Even faster: double-tap the back of your iPhone, or ask Siri') : tx('Even faster: an emergency link for phone shortcuts')}</summary>
        <div class="cf-more-body" id="sosLink"></div>
      </details>
      <label class="check">
        <input type="checkbox" id="homePause" ${homePauseOn() ? 'checked' : ''}>
        ${tx('Emergency button: opening Kampung Watch from my home screen starts Pause straight away')}
      </label>
      <p class="muted">${tx('Turn this on only if this phone uses Kampung Watch just for emergencies, for example a phone you set up for a parent.')}</p>`;
    $('#sosBox').open = sosOpen;
    drawSosLink();
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

  const nameList = names => names.length < 2 ? names.join('')
    : names.slice(0, -1).join(t(', ')) + t(' and ') + names[names.length - 1];
  const buzz = () => {
    // Phones only allow vibration after the person has touched the page.
    if (navigator.vibrate && (!navigator.userActivation || navigator.userActivation.hasBeenActive)) navigator.vibrate([200, 100, 200]);
  };

  /* Shows the 5-second countdown; send() runs when it reaches 0 or on "Send now". */
  function startCountdown({ people, send, onCancel }) {
    if (launch) return;
    const who = people.length
      ? t('{names} will get an alert and call you.', { names: nameList(people) })
      : t('Volunteers near you will get an alert and call you.');
    const el = document.createElement('div');
    el.className = 'launch-overlay';
    el.innerHTML = `
      <div class="launch-box" role="alertdialog" aria-modal="true" aria-labelledby="launchTitle" aria-describedby="launchWho">
        <p class="kicker">${tx('Pause')}</p>
        <h2 class="launch-title" id="launchTitle">${th(people.length ? 'Alerting your Circle in {n}' : 'Alerting volunteers in {n}', { n: '<span class="launch-count" id="launchCount">5</span>' })}</h2>
        <p class="launch-who" id="launchWho">${esc(who)}</p>
        <div class="launch-actions">
          <button type="button" class="btn btn-primary btn-lg" id="launchNow">${tx('Send now')}</button>
          <button type="button" class="btn btn-secondary btn-lg" id="launchCancel">${tx('Cancel, I tapped by mistake')}</button>
        </div>
      </div>`;
    document.body.appendChild(el);
    document.body.classList.add('modal-open');

    let left = 5;
    const go = () => { cancelLaunch(); send(); };
    launch = {
      el,
      timer: setInterval(() => {
        left -= 1;
        if (left <= 0) go();
        else $('#launchCount').textContent = left;
      }, 1000),
      onKey: e => { if (e.key === 'Escape') cancelLaunch(); }
    };
    document.addEventListener('keydown', launch.onKey);
    $('#launchNow').addEventListener('click', go);
    $('#launchCancel').addEventListener('click', () => {
      cancelLaunch();
      toast(t('Cancelled. Nothing was sent.'));
      if (onCancel) onCancel();
    });
    $('#launchCancel').focus(); // the safe choice gets the focus
  }

  function startLaunch() {
    const own = pauseState.pauses.find(p => p.role === 'owner' && p.status === 'open');
    if (own) return; // already on: just show it
    startCountdown({
      people: pauseState.circle.mine ? pauseState.circle.mine.members.map(m => m.name) : [],
      send: async () => {
        try {
          await api.post('/pauses');
          buzz();
        } catch (err) {
          toast(t('Couldn’t send the alert. Don’t pay. Call someone you trust, or the ScamShield Helpline 1799.'), 'warn');
        }
        await refreshPause();
        const status = $('.pause-headline');
        if (status) status.scrollIntoView({ block: 'center' });
      },
      onCancel: () => { const btn = $('#pauseBtn'); if (btn) btn.focus(); }
    });
  }

  /* ---------- emergency link (iPhone Back Tap / Siri shortcut) ----------
     A shortcut opens the link in Safari, which doesn't share the home-screen app's
     identity, so the link itself says whose Pause to press. The secret is after the
     #, which browsers never send to a server. */
  let sosTimer = null;
  const sosUrl = token => `${location.origin}/#/sos/${token}`;

  async function renderSos(seq, token) {
    clearInterval(sosTimer);
    const body = { token: token || '' };
    let status;
    try {
      status = await api.post('/pause-link/status', body);
    } catch (err) {
      if (stale(seq)) return;
      const offline = err.message === 'offline';
      main.innerHTML = `
        <div class="page sos-page">
          <p class="kicker">${tx('Pause')}</p>
          <h1 class="display">${offline ? tx('No internet connection.') : tx('This emergency link doesn’t work any more.')}</h1>
          <p class="lede">${offline ? tx('Your Circle can’t be alerted without a connection.') : tx('Make a new one on the Pause page of Kampung Watch, then update your shortcut.')}</p>
          <p class="lede">${th('Being pressured to pay right now? Don’t pay. Call someone you trust, or the ScamShield Helpline {1799}. In danger, call {999}.', { 1799: telLink('1799'), 999: telLink('999') })}</p>
        </div>`;
      return;
    }
    if (stale(seq)) return;

    const draw = s => {
      const p = s.pause;
      main.innerHTML = `
        <div class="page sos-page">
          <p class="kicker">${tx('Pause')}${s.name ? ` · ${esc(s.name)}` : ''}</p>
          ${p ? `
            <h1 class="pause-headline" role="status">${p.responder
              ? tx('{name} is calling you now.', { name: p.responder.name })
              : p.stage === 'volunteer' && s.people.length
                ? tx('Volunteers near you have been alerted too.')
                : s.people.length ? tx('{names}: alert sent.', { names: nameList(s.people) }) : tx('Volunteers near you have been alerted.')}</h1>
            ${p.responder ? `<p class="lede">${tx(p.responder.detail)}</p>` : `<p class="lede">${tx('Someone will call you. Keep your phone near you.')}</p>`}
            ${pauseStepsHTML()}
            <p class="muted">${tx('To message your Circle or say you’re safe, open Kampung Watch from your home screen.')}</p>`
          : `
            <h1 class="display">${tx('Someone pushing you to pay?')}</h1>
            <p><button type="button" class="pause-btn" id="sosBtn"><span class="pause-btn-word">${tx('Pause')}</span><span class="pause-btn-sub">${s.people.length ? tx('Alert my Circle') : tx('Alert a volunteer')}</span></button></p>
            <p class="cf-help">${th('Money leaving your account right now? Call {999}. For advice, call the ScamShield Helpline {1799}.', { 999: telLink('999'), 1799: telLink('1799') })}</p>`}
        </div>`;
      const btn = $('#sosBtn');
      if (btn) btn.addEventListener('click', () => countdown(s));
    };

    const watch = () => {
      clearInterval(sosTimer);
      sosTimer = setInterval(async () => {
        const s = await api.post('/pause-link/status', body).catch(() => null);
        if (s && current.route === 'sos') draw(s);
      }, 3000);
    };

    const countdown = s => startCountdown({
      people: s.people,
      send: async () => {
        try {
          const res = await api.post('/pause-link/press', body);
          buzz();
          draw(res);
          watch();
        } catch (err) {
          toast(t('Couldn’t send the alert. Don’t pay. Call someone you trust, or the ScamShield Helpline 1799.'), 'warn');
        }
      },
      onCancel: () => { const b = $('#sosBtn'); if (b) b.focus(); }
    });

    draw(status);
    if (status.pause) watch();
    else countdown(status);
  }

  async function drawSosLink() {
    const box = $('#sosLink');
    if (!box) return;
    let active = false;
    try { active = (await api.get('/pause-link')).active; } catch (e) { /* offline */ }
    const token = active && prefs.pauseLink ? prefs.pauseLink : null;
    if (!box.isConnected) return;
    box.innerHTML = token ? `
        <p>${tx('Your emergency link. Keep it private: anyone with it can press Pause for you.')}</p>
        <p><code class="sos-url">${esc(sosUrl(token))}</code></p>
        <div class="btn-row">
          <button type="button" class="btn btn-secondary" id="copySos">${tx('Copy link')}</button>
          <button type="button" class="btn btn-ghost" id="newSos">${tx('Make a new link')}</button>
          <button type="button" class="btn btn-ghost" id="offSos">${tx('Turn off')}</button>
        </div>
        ${isIOS() ? `
          <ol class="install-steps">
            <li>${th('Open the {b}Shortcuts{/b} app, tap {b}+{/b}, and add the action {b}Open URLs{/b}.', { b: '<strong>', '/b': '</strong>' })}</li>
            <li>${th('Paste your link into it. Name the shortcut {b}Kampung Pause{/b}.', { b: '<strong>', '/b': '</strong>' })}</li>
            <li>${th('Go to {b}Settings › Accessibility › Touch › Back Tap › Double Tap{/b} and choose {b}Kampung Pause{/b}.', { b: '<strong>', '/b': '</strong>' })}</li>
          </ol>
          <p class="muted">${tx('Now a double-tap on the back of your phone, or “Hey Siri, Kampung Pause”, starts Pause. You still get 5 seconds to cancel.')}</p>`
        : `<p class="muted">${tx('Save it as a bookmark or home-screen shortcut, or attach it to your phone’s gesture or assistant shortcuts. Opening it starts Pause, with 5 seconds to cancel.')}</p>`}`
      : `
        <p>${active ? tx('You made an emergency link on another device or before clearing this browser. Make a new one here (the old one stops working).') : tx('Make a private link that starts Pause, for a phone shortcut.')}</p>
        <p><button type="button" class="btn btn-secondary" id="newSos">${tx('Make my emergency link')}</button></p>`;
  }

  /* ---------- people you look after ---------- */
  function drawGuardZone() {
    const zone = $('#guardZone');
    const list = pauseState.circle.guarding;
    zone.hidden = !list.length;
    if (!list.length) { zone.innerHTML = ''; return; }
    zone.innerHTML = `
      <div class="section-head"><h2 class="section-title" id="guardTitle">${tx('People you look after')}</h2></div>
      ${list.map(g => {
        const id = esc(g.circleId);
        return `
          <article class="guard" id="guard-${id}">
            <header class="guard-head">
              <h3 class="guard-name">${esc(g.name)}</h3>
              <span class="muted">${esc(placeName(g.town))} · ${tx('you’re in their Circle as: {relation}', { relation: t(g.relation) })}</span>
            </header>
            ${g.openPause ? helperPauseHTML(g.openPause, { escalate: true })
              : `<p class="muted">${tx('No Pause right now. If {name} presses it, you’ll get an alert on any page of Kampung Watch.', { name: g.name })}</p>`}
            <div class="drill-panel">
              <h4 class="kicker">${tx('Scam Drill')}</h4>
              <p>${tx('Send {name} a safe practice scam. If they press Pause or delete it, they pass. If they fall for it, they get a 30-second lesson and nothing is lost.', { name: g.name })}</p>
              <p class="drill-suggest" data-suggest="${esc(g.town)}" data-for="dt-${id}"></p>
              <div class="inline-form">
                <div class="field">
                  <label for="dt-${id}">${tx('Practice message')}</label>
                  <select id="dt-${id}" class="input">${drillOptions()}</select>
                </div>
                <button type="button" class="btn btn-secondary" data-send-drill="${id}">${tx('Send practice scam')}</button>
              </div>
              ${drillHistory(g.drills, g.drillStats)}
            </div>
            <p><button type="button" class="btn btn-ghost" data-leave="${esc(String(g.memberId))}" data-name="${esc(g.name)}">${tx('Leave {name}’s Circle', { name: g.name })}</button></p>
          </article>`;
      }).join('')}`;
  }

  const drillOptions = () => KW.DRILLS.map(d => `<option value="${esc(d.id)}">${tx(d.name)} (${tx(d.channel)})</option>`).join('');

  function drillHistory(drills, stats) {
    if (!drills.length) return `<p class="muted">${tx('No practice scams sent yet.')}</p>`;
    return `
      ${stats.answered ? `<p class="drill-score">${th('{n} of {total} practice scams passed', { n: `<span class="stat-n">${stats.passed}</span>`, total: stats.answered })}</p>` : ''}
      <ul class="drill-history" role="list">${drills.map(d => `
        <li>
          <span>${tx(d.name)}</span>
          ${d.result ? `<span class="tag ${DRILL_RESULTS[d.result][1]}">${tx(DRILL_RESULTS[d.result][0])}</span>` : `<span class="tag tag-outline">${tx('Not answered yet')}</span>`}
          <span class="muted">${timeAgo(d.created)}${d.sender ? ` · ${tx('from {name}', { name: d.sender.name })}` : ''}${d.reportId ? ` · ${tx('from a Scam Radar wave')}` : ''}</span>
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
        ? t('Verified on Scam Radar in {town} this week: {title}. Suggested practice: {drill}.', { town, title: s.report.title, drill: t(s.template.name) })
        : t('No new scam wave verified in {town} lately. Suggested practice: {drill}.', { town, drill: t(s.template.name) });
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
      <div class="section-head"><h2 class="section-title" id="volPauseTitle">${tx('Escalated Pauses')}</h2></div>
      ${open.length ? open.map(p => `
        <article class="guard">
          <header class="guard-head">
            <h3 class="guard-name">${esc(p.name)}</h3>
            <span class="muted">${esc(p.town ? placeName(p.town) : t('Town not set'))} · ${p.circleSize ? tx('their Circle didn’t answer in time') : tx('no Circle set up')}</span>
          </header>
          ${helperPauseHTML(p)}
        </article>`).join('')
        : `<p class="muted">${tx('No escalated Pauses right now. When a resident’s Circle doesn’t answer in time, the Pause appears here.')}</p>`}

      <h3 class="section-title section-title-sm">${tx('Estate drill')}</h3>
      <p>${tx('Send this week’s practice scam to every Circle in a town. It matches the newest verified Scam Radar wave there, so residents practise on the scam that’s actually going around.')}</p>
      <p class="drill-suggest" data-suggest="${esc(estateTown)}" data-for="estateTemplate" id="estateSuggest"></p>
      <div class="inline-form">
        <div class="field"><label for="estateTown">${tx('Town')}</label><select id="estateTown" class="input">${townOptions(estateTown)}</select></div>
        <div class="field"><label for="estateTemplate">${tx('Practice message')}</label><select id="estateTemplate" class="input">${drillOptions()}</select></div>
        <button type="button" class="btn btn-primary" id="estateSend">${tx('Send to every Circle in this town')}</button>
      </div>
      ${stats && stats.byTown.length ? `
        <table class="table drill-table">
          <caption class="kicker">${tx('Drill results by town')}</caption>
          <thead><tr><th scope="col">${tx('Town')}</th><th scope="col" class="num">${tx('Sent')}</th><th scope="col" class="num">${tx('Answered')}</th><th scope="col" class="num">${tx('Passed')}</th></tr></thead>
          <tbody>${stats.byTown.map(row => `
            <tr><td>${esc(placeName(row.town))}</td><td class="num">${row.sent}</td><td class="num">${row.answered}</td><td class="num">${row.passRate == null ? '–' : row.passRate + '%'}</td></tr>`).join('')}
          </tbody>
        </table>` : ''}`;
  }

  /* ---------- your Circle ---------- */
  function circleForm(mine) {
    return `
      <form id="circleForm" class="form-grid">
        <div class="field"><label for="circleName">${tx('Your name')}</label><input id="circleName" class="input" maxlength="40" required autocomplete="given-name" value="${esc(mine ? mine.name : '')}"></div>
        <div class="field"><label for="circleTown">${tx('Your town')}</label><select id="circleTown" class="input">${townOptions(mine ? mine.town : (prefs.subscription.town || 'Tampines'))}</select></div>
        <div class="full form-actions"><button type="submit" class="btn btn-primary">${mine ? tx('Save') : tx('Create my Circle')}</button></div>
      </form>`;
  }

  function drawCircleZone() {
    const zone = $('#circleZone');
    const mine = pauseState.circle.mine;
    const share = mine && t('Join my Kampung Circle so you get an alert if a scammer is pressuring me. Open Kampung Watch, go to Pause, choose "Join their Circle" and enter my code: {code}.', { code: mine.inviteCode }) + ` ${location.origin}/#/pause`;
    zone.innerHTML = `
      <div class="section-head"><h2 class="section-title" id="circleTitle" tabindex="-1">${tx('Your Kampung Circle')}</h2></div>
      <div class="circle-layout">
        <div>
          ${mine ? `
            <p class="kicker">${tx('Your Circle code')}</p>
            <p class="circle-code" aria-label="${tx('Your Circle code: {code}', { code: mine.inviteCode.split('').join(' ') })}">${esc(mine.inviteCode.slice(0, 3))} ${esc(mine.inviteCode.slice(3))}</p>
            <p>${th('Send this code to your family. They open Kampung Watch on their phone, go to Pause, and choose {b}Join their Circle{/b}.', { b: '<strong>', '/b': '</strong>' })}</p>
            <div class="btn-row">
              <button type="button" class="btn btn-secondary" id="copyCode">${tx('Copy code')}</button>
              <a class="btn btn-secondary" href="https://wa.me/?text=${encodeURIComponent(share)}" target="_blank" rel="noopener">${tx('Send on WhatsApp')}</a>
              <button type="button" class="btn btn-ghost" id="newCode">${tx('Make a new code')}</button>
            </div>
            <h3 class="kicker">${tx('In your Circle')}</h3>
            ${mine.members.length ? `
              <ul class="member-list" role="list">${mine.members.map(m => `
                <li><span><strong>${esc(m.name)}</strong> <span class="muted">${tx(m.relation)}</span></span>
                  <button type="button" class="btn btn-ghost" data-remove="${m.id}" data-name="${esc(m.name)}">${tx('Remove')}</button></li>`).join('')}
              </ul>` : `<p class="muted">${tx('No one yet. Until someone joins, your Pause alerts go to volunteers.')}</p>`}
            ${mine.drills.length ? `<h3 class="kicker">${tx('Your practice scams')}</h3>${drillHistory(mine.drills, mine.drillStats)}` : ''}
            <details class="cf-more"><summary>${tx('Change your name or town')}</summary>${circleForm(mine)}</details>`
          : `
            <p>${tx('Your Circle is the people who get an alert when you press Pause: your children, grandchildren, a good friend or a neighbour. Set it up once, then send them your code.')}</p>
            ${circleForm(null)}`}
        </div>
        <div>
          <h3 class="kicker" id="joinTitle">${tx('Look after someone? Join their Circle')}</h3>
          <p>${tx('Ask them for their 6-letter Circle code. You’ll get an alert whenever they press Pause, and you can send them practice scams.')}</p>
          <form id="joinForm" class="form-grid" aria-labelledby="joinTitle">
            <div class="field full"><label for="joinCode">${tx('Their Circle code')}</label><input id="joinCode" class="input circle-code-input" maxlength="9" required autocomplete="off" autocapitalize="characters" spellcheck="false"></div>
            <div class="field"><label for="joinName">${tx('Your name')}</label><input id="joinName" class="input" maxlength="40" required autocomplete="given-name"></div>
            <div class="field"><label for="joinRelation">${tx('You are their')}</label><select id="joinRelation" class="input">${KW.RELATIONS.map(r => `<option value="${esc(r)}">${tx(r)}</option>`).join('')}</select></div>
            <div class="full form-actions"><button type="submit" class="btn btn-primary">${tx('Join their Circle')}</button></div>
          </form>
        </div>
      </div>`;
  }

  function drawPauseStats() {
    const s = pauseState.stats;
    const stat = (n, label) => `<div class="stat"><span class="stat-n">${esc(n)}</span><span class="stat-label">${tx(label)}</span></div>`;
    const wait = s.medianResponseSeconds == null ? '–' : s.medianResponseSeconds < 120 ? t('{n}s', { n: s.medianResponseSeconds }) : t('{n} min', { n: Math.round(s.medianResponseSeconds / 60) });
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
      node.textContent = left ? fmtClock(left) : t('a moment');
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
    } else if (b.id === 'newSos') {
      if (prefs.pauseLink && !confirm(t('Make a new link? The old one will stop working, so update your shortcut too.'))) return;
      act(b, async () => {
        prefs.pauseLink = (await api.post('/pause-link')).token;
        savePrefs();
        await drawSosLink();
        toast(t('Emergency link ready. Copy it into your shortcut.'), 'ok');
      });
    } else if (b.id === 'offSos') {
      if (!confirm(t('Turn off your emergency link? Shortcuts using it will stop working.'))) return;
      act(b, async () => {
        await api.del('/pause-link');
        prefs.pauseLink = null;
        savePrefs();
        await drawSosLink();
      });
    } else if (b.id === 'copySos') {
      const url = $('.sos-url').textContent;
      (navigator.clipboard ? navigator.clipboard.writeText(url) : Promise.reject())
        .then(() => toast(t('Link copied. Paste it into your shortcut.'), 'ok'))
        .catch(() => toast(t('Press and hold the link to copy it.')));
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
        toast(d.outcome === 'lost' ? t('Call your bank’s 24-hour hotline now, then make a police report.') : t('Pause closed. Thank you for checking first.'), d.outcome === 'lost' ? 'warn' : 'ok');
        await refreshPause();
      });
    } else if (d.sendDrill) {
      const template = document.getElementById('dt-' + d.sendDrill).value;
      act(b, async () => {
        const drill = await api.post('/drills', { circleId: d.sendDrill, template });
        toast(t('Practice scam sent: {drill}. You’ll see here whether they pass.', { drill: t(drill.name) }), 'ok');
        await refreshPause();
      });
    } else if (b.id === 'estateSend') {
      const town = $('#estateTown').value;
      act(b, async () => {
        const res = await api.post('/drills/estate', { town, template: $('#estateTemplate').value });
        toast(res.sent ? t(res.sent === 1 ? 'Practice scam sent to {n} Circle in {town}.' : 'Practice scam sent to {n} Circles in {town}.', { n: res.sent, town: res.town }) : t('No Circles in {town} are waiting for a drill right now.', { town: res.town }), res.sent ? 'ok' : 'info');
        await refreshPause();
      });
    } else if (b.id === 'copyCode') {
      const code = pauseState.circle.mine.inviteCode;
      (navigator.clipboard ? navigator.clipboard.writeText(code) : Promise.reject())
        .then(() => toast(t('Code copied. Paste it into a message to your family.'), 'ok'))
        .catch(() => toast(t('Your code is {code}.', { code })));
    } else if (b.id === 'newCode') {
      if (!confirm(t('Make a new code? The old one will stop working, but people already in your Circle stay in it.'))) return;
      act(b, async () => { pauseState.circle = await api.post('/circles/code'); redrawPause(); });
    } else if (d.remove || d.leave) {
      const question = d.remove ? t('Remove {name} from your Circle? They won’t get your Pause alerts any more.', { name: d.name }) : t('Leave {name}’s Circle? You won’t get their Pause alerts any more.', { name: d.name });
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
        toast(pauseState.circle.mine ? t('Saved.') : t('Your Circle is ready. Now send the code to your family.'), 'ok');
        pauseState.circle = cache.circle = res;
        paintHeader();
        await refreshPause();
      });
    } else if (form.id === 'joinForm') {
      act(e.submitter, async () => {
        const res = await api.post('/circles/join', { code: $('#joinCode').value, name: $('#joinName').value, relation: $('#joinRelation').value });
        $('#joinCode').value = '';
        const joined = res.guarding[res.guarding.length - 1];
        toast(joined ? t('You’re in {name}’s Circle. You’ll get an alert if they press Pause.', { name: joined.name }) : t('You’re in their Circle. You’ll get an alert if they press Pause.'), 'ok');
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
      toast(el.checked ? t('Opening from the home screen will start Pause, with 5 seconds to cancel.') : t('Opening from the home screen will show the Pause button, ready to tap.'));
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
        <p><strong>${tx('{name} pressed Pause.', { name: p.name })}</strong> ${p.caller ? tx('Caller says they are: {who}.', { who: t(p.caller) }) : tx('Someone may be pressuring them right now.')}</p>
        <a class="btn btn-secondary" href="#/pause" id="alertView">${tx('Open')}</a>
        <button type="button" class="btn btn-ghost" id="alertClose">${tx('Dismiss')}</button>
      </div>`;
    banner.hidden = false;
    $('#alertClose').addEventListener('click', () => { banner.hidden = true; });
    $('#alertView').addEventListener('click', () => { banner.hidden = true; });
    if ('Notification' in window && Notification.permission === 'granted' && document.hidden) {
      try { new Notification(t('{name} pressed Pause.', { name: p.name }), { body: t('Open Kampung Watch to call them.') }); } catch (e) { /* ignore */ }
    }
  }

  async function onPauseEvent({ id, kind, by }) {
    const ownOpen = pauseState.pauses.some(p => p.id === id && p.role === 'owner');
    if (onPausePage()) {
      // The resident's own taps don't need a redraw (it would move their focus).
      if (!(kind === 'updated' && ownOpen)) refreshPause();
      if ((kind === 'new' || kind === 'escalated') && !ownOpen) {
        const p = await api.get('/pauses/' + encodeURIComponent(id)).catch(() => null);
        if (p && kind === 'new' && p.role === 'circle') toast(t('{name} pressed Pause.', { name: p.name }), 'warn');
        if (p && kind === 'escalated' && p.role === 'volunteer') toast(t('{name} needs a volunteer: their Circle didn’t answer in time.', { name: p.name }), 'warn');
      }
      return;
    }
    const p = await api.get('/pauses/' + encodeURIComponent(id)).catch(() => null);
    if (!p) return;
    if (p.role === 'owner') {
      if (kind === 'responding') notify(t('{name} is on it', { name: by }), t('They’re calling you now.'), '#/pause');
      else if (kind === 'message') notify(t('Message from {name}', { name: by }), t('Open Pause to read it.'), '#/pause');
      else if (kind === 'escalated') notify(t('Volunteers alerted'), t('A volunteer near you is stepping in.'), '#/pause');
    } else if (kind === 'new' || (kind === 'escalated' && p.role === 'volunteer')) {
      if (p.status === 'open') showPauseBanner(p);
    } else if (kind === 'responding') {
      notify(t('{name} is on it', { name: by }), t('{name} is calling {other}.', { name: by, other: p.name }), '#/pause');
    } else if (kind === 'escalated') {
      notify(t('Volunteers alerted'), t('No one answered {name}’s Pause in time, so volunteers are stepping in.', { name: p.name }), '#/pause');
    } else if (kind === 'resolved' && p.outcome) {
      $('#alertBanner').hidden = true;
      toast(t('{name}’s Pause is closed: {outcome}.', { name: p.name, outcome: t(OUTCOMES[p.outcome][0]) }), p.outcome === 'lost' ? 'warn' : 'ok');
    }
  }

  function onCircleEvent({ kind, name }) {
    if (kind === 'joined') toast(t('{name} joined your Kampung Circle.', { name }), 'ok');
    refreshPause();
  }

  /* ---------- Scam Drills ---------- */
  async function onDrillEvent({ id, kind, result, name }) {
    if (kind === 'new') {
      const pending = await api.get('/drills/pending').catch(() => []);
      const drill = pending.find(d => d.id === id);
      if (drill) setTimeout(() => openDrill(drill), 1500); // arrives like a real message, not instantly
    } else if (kind === 'result') {
      const who = name || t('They');
      if (result === 'clicked') toast(t('{name} fell for the practice scam. They’ve seen a short lesson. Maybe give them a call about it.', { name: who }), 'warn');
      else toast(t(result === 'paused' ? '{name} passed the practice scam: they pressed Pause.' : '{name} passed the practice scam: they deleted it.', { name: who }), 'ok');
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
      title: t('New message'),
      body: `
        <div id="drillBody" class="drill-body">
          <div class="drill-phone">
            <p class="drill-meta">${tx(m.channel)} · <strong>${tx(m.from)}</strong> · ${timeAgo(d.created)}</p>
            <p class="drill-text">${tx(m.text)}${m.link ? ` <span class="drill-link">${esc(m.link)}</span>` : ''}</p>
          </div>
          <p class="muted">${tx('What would you do?')}</p>
          <div class="drill-actions">
            <button type="button" class="btn btn-secondary btn-lg" data-drill="clicked">${m.link ? tx('Open the link') : tx('Reply to them')}</button>
            <button type="button" class="btn btn-primary btn-lg" data-drill="paused">${tx('Pause: check with my Circle')}</button>
            <button type="button" class="btn btn-ghost" data-drill="ignored">${tx('Delete it')}</button>
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
    const from = d.sender ? d.sender.name : t('your Circle');
    $('#modalTitle').textContent = t('Scam Drill: practice message');
    const verdict = { paused: 'Well done. Pressing Pause is exactly right.', ignored: 'Good. Deleting it kept you safe.', clicked: 'That was a scam, but only a practice one.' }[d.result];
    $('#drillBody', body).innerHTML = `
      ${fromVolunteer ? `<p class="kicker">${tx('Sent to everyone in {town}', { town: d.town })}</p>` : ''}
      <p class="game-verdict ${d.passed ? 'is-right' : 'is-wrong'}" tabindex="-1" id="drillVerdict">${tx(verdict)}</p>
      <p>${fromVolunteer ? tx('This was a safe practice message from {name}, copied from a scam going around your area.', { name: from }) : tx('This was a safe practice message from {name}.', { name: from })} ${d.passed ? tx('They’ve been told you passed.') : tx('Nothing happened: no money or details went anywhere.')}</p>
      <h3 class="kicker">${tx('How to spot it next time')}</h3>
      <ol class="flag-list" role="list">${d.lesson.map((l, i) => `<li><span class="flag-n">${i + 1}</span><span class="flag-label">${tx(l)}</span></li>`).join('')}</ol>
      <div class="btn-row"><button type="button" class="btn btn-primary btn-lg" id="drillDone">${tx('Got it')}</button></div>`;
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
    if (!town || !type) return [t('Scams near you,'), t('verified as they happen.')];
    return [t('{town}, this week:', { town }), t(TYPE_PHRASE[type] || type) + t('.')];
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
            <p class="kicker">${tx('Scam Radar')}${newest ? ` · ${tx('latest report {when}', { when: timeAgo(newest.created) })}` : ''}</p>
            <h1 class="display"><span class="line">${esc(line1)}</span> <span class="line">${esc(line2)}</span></h1>
          </div>
          <section class="head-side" aria-labelledby="alertTitle">
            <h2 class="kicker" id="alertTitle">${tx('Alerts for your town')}</h2>
            <p>${sub.enabled
              ? th('Alerts are on for {town}. You’ll hear the moment volunteers verify a new scam wave there.', { town: `<strong>${esc(placeName(sub.town))}</strong>` })
              : tx('Get an alert the moment volunteers verify a new scam wave in your town.')}</p>
            <div class="inline-form">
              <div class="field"><label for="subTown">${tx('Your town')}</label><select id="subTown" class="input">${townOptions(sub.town, true, t('Choose your town'))}</select></div>
              ${sub.enabled
                ? `<button type="button" class="btn btn-secondary" id="subOff">${tx('Turn off')}</button><button type="button" class="btn btn-ghost" id="subTest">${tx('Send a test alert')}</button>`
                : `<button type="button" class="btn btn-primary" id="subOn">${tx('Alert me')}</button>`}
            </div>
          </section>
        </header>

        <section class="stat-row" id="radarStats" aria-label="${tx('Summary of the reports shown')}"></section>

        <figure class="map-figure">
          <div id="map" role="region" aria-label="${tx('Map of scam reports in Singapore')}"></div>
          <figcaption class="legend">
            <span><i class="swatch swatch-verified" aria-hidden="true"></i>${tx('Verified scam wave')}</span>
            <span><i class="swatch swatch-pending" aria-hidden="true"></i>${tx('Awaiting check')}</span>
            <span>${tx('A bigger circle means more neighbours hit')}</span>
          </figcaption>
        </figure>

        <section class="section" aria-labelledby="feedTitle">
          <div class="section-head">
            <h2 class="section-title" id="feedTitle">${tx('Reports')}</h2>
            <button type="button" class="btn btn-primary btn-lg" id="reportBtn">${tx('Report a scam')}</button>
          </div>
          <div class="filters" role="search" aria-label="${tx('Filter reports')}">
            <div class="field"><label for="fTown">${tx('Town')}</label><select id="fTown" class="input">${townOptions(radarFilter.town, true, t('All towns'))}</select></div>
            <div class="field"><label for="fType">${tx('Scam type')}</label><select id="fType" class="input"><option value="">${tx('All types')}</option>${KW.SCAM_TYPES.map(ty => `<option value="${esc(ty)}" ${ty === radarFilter.type ? 'selected' : ''}>${tx(ty)}</option>`).join('')}</select></div>
            <div class="field"><label for="fDays">${tx('Period')}</label><select id="fDays" class="input">
              <option value="1" ${radarFilter.days === 1 ? 'selected' : ''}>${tx('Last 24 hours')}</option>
              <option value="7" ${radarFilter.days === 7 ? 'selected' : ''}>${tx('Last 7 days')}</option>
              <option value="30" ${radarFilter.days === 30 ? 'selected' : ''}>${tx('Last 30 days')}</option>
              <option value="0" ${radarFilter.days === 0 ? 'selected' : ''}>${tx('All time')}</option>
            </select></div>
            <label class="check"><input type="checkbox" id="fVerified" ${radarFilter.verifiedOnly ? 'checked' : ''}> ${tx('Verified only')}</label>
          </div>
          ${writtenNote()}
          <div id="radarFeed" aria-live="polite"></div>
        </section>
      </div>`;

    $('#reportBtn').addEventListener('click', () => openReportModal());

    const subOn = $('#subOn');
    if (subOn) subOn.addEventListener('click', async () => {
      const town = $('#subTown').value;
      if (!town) { toast(t('Choose your town first.'), 'warn'); $('#subTown').focus(); return; }
      if ('Notification' in window && Notification.permission === 'default') {
        try { await Notification.requestPermission(); } catch (e) { /* ignore */ }
      }
      prefs.subscription = { town, enabled: true };
      savePrefs();
      paintHeader();
      toast(t('Alerts on for {town}.', { town }), 'ok');
      drawRadarPage();
    });
    const subOff = $('#subOff');
    if (subOff) subOff.addEventListener('click', () => {
      prefs.subscription.enabled = false; savePrefs(); drawRadarPage();
    });
    const subTest = $('#subTest');
    if (subTest) subTest.addEventListener('click', () => pushAlert({
      town: prefs.subscription.town, title: t('This is a test alert. You’re all set.')
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
    const stat = (n, label) => `<div class="stat"><span class="stat-n">${n}</span><span class="stat-label">${tx(label)}</span></div>`;
    $('#radarStats').innerHTML =
      stat(reports.length, 'reports shown') +
      stat(reports.filter(r => r.status === 'verified').length, 'verified by CC and RC volunteers') +
      stat(reports.filter(r => r.status === 'pending').length, 'awaiting a volunteer’s check') +
      stat(top ? esc(placeName(top)) : tx('None'), 'hardest-hit town');
  }

  const STATUS_TAG = {
    verified: r => `<span class="tag tag-accent-2">${tx('Verified')}</span>${r.verifiedBy ? `<span class="r-by">${esc(placeName(r.verifiedBy))}</span>` : ''}`,
    pending: () => `<span class="tag tag-outline">${tx('Awaiting check')}</span>`,
    rumour: r => `<span class="tag tag-neutral">${tx('Not a scam wave')}</span>${r.verifiedBy ? `<span class="r-by">${esc(placeName(r.verifiedBy))}</span>` : ''}`
  };

  function renderRadarFeed(reports) {
    const feed = $('#radarFeed');
    if (!reports.length) {
      feed.innerHTML = `<div class="empty"><p>${tx('No reports match these filters.')}</p><button type="button" class="btn btn-secondary" id="clearFilters">${tx('Clear filters')}</button></div>`;
      $('#clearFilters').addEventListener('click', () => {
        Object.assign(radarFilter, { town: '', type: '', days: 30, verifiedOnly: false });
        drawRadarPage();
      });
      return;
    }
    feed.innerHTML = `
      <table class="table radar-table">
        <thead><tr>
          <th scope="col">${tx('Scam')}</th><th scope="col">${tx('Town')}</th><th scope="col">${tx('Status')}</th>
          <th scope="col" class="num">${tx('Neighbours hit')}</th><th scope="col"><span class="sr-only">${tx('Actions')}</span></th>
        </tr></thead>
        <tbody>
          ${reports.map(r => `
            <tr id="rep-${esc(r.id)}">
              <td class="r-main">
                <span class="r-title">${written(r.title)}</span>
                <span class="r-detail">${tx(r.type)} · ${tx(r.channel)} · ${timeAgo(r.created)}</span>
                ${r.desc ? `<span class="r-desc">${written(r.desc, { br: true })}</span>` : ''}
                ${r.image ? `<img class="r-img" src="${esc(r.image)}" alt="${tx('Screenshot attached to this report')}">` : ''}
              </td>
              <td data-label="${tx('Town')}">${esc(placeName(r.town))}</td>
              <td data-label="${tx('Status')}"><span class="r-status">${STATUS_TAG[r.status](r)}</span></td>
              <td class="num" data-label="${tx('Neighbours hit')}"><span class="r-count">${r.count}</span></td>
              <td class="r-actions">
                <button type="button" class="btn ${r.mine ? 'btn-primary' : 'btn-secondary'}" data-confirm="${esc(r.id)}" aria-pressed="${r.mine}">${r.mine ? tx('You got this too') : tx('I got this too')}</button>
                <button type="button" class="btn btn-ghost" data-discuss="${esc(r.id)}">${tx('Discuss')}</button>
                ${r.status !== 'verified' ? `<button type="button" class="btn btn-primary vol-only" data-verify="${esc(r.id)}">${tx('Verify')}</button>` : ''}
                ${r.status !== 'rumour' ? `<button type="button" class="btn btn-ghost vol-only" data-rumour="${esc(r.id)}">${tx('Not a scam wave')}</button>` : ''}
                ${r.status === 'verified' ? `<button type="button" class="btn btn-ghost vol-only" data-drillfrom="${esc(r.id)}">${tx('Make it this week’s drill')}</button>` : ''}
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
      toast(t('Report verified. Residents in that town are being alerted.'), 'ok');
    });
    run('drillfrom', async id => {
      const res = await api.post('/drills/estate', { reportId: decodeURIComponent(id) });
      toast(res.sent
        ? t(res.sent === 1 ? 'Practice scam sent to {n} Circle in {town}. Results show on the Pause page.' : 'Practice scam sent to {n} Circles in {town}. Results show on the Pause page.', { n: res.sent, town: res.town })
        : t('No Circles in {town} are waiting for a drill right now.', { town: res.town }), res.sent ? 'ok' : 'info', { link: '#/pause', linkText: t('Open Pause') });
    });
    run('rumour', async id => {
      upsert(cache.reports, await api.post(`/reports/${id}/dismiss`));
      updateRadar();
      toast(t('Marked as checked: not a scam wave.'));
    });
  }

  function initMap() {
    const el = $('#map');
    if (!window.L) {
      el.innerHTML = `<p class="map-fallback">${tx('The map couldn’t load (are you offline?). The reports below still work.')}</p>`;
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
          <p class="map-pop-title">${esc(placeName(town))}</p>
          <p class="muted">${tx(g.reports.length === 1 ? '{n} report' : '{n} reports', { n: g.reports.length })} · ${tx('{n} neighbours hit', { n: g.residents })}</p>
          <ul>${g.reports.slice(0, 3).map(r => `<li>${written(r.title)}</li>`).join('')}</ul>
          <button type="button" class="btn btn-primary" data-town="${esc(town)}">${tx('Show {town} reports', { town })}</button>
        </div>`).addTo(markerLayer);
    });
  }

  function openReportModal(prefill = {}) {
    openModal({
      title: t('Report a scam'),
      wide: true,
      body: `
        <form id="reportForm" class="form-grid">
          <p class="muted full">${tx('Your report is anonymous. A CC or RC volunteer checks it before it’s shown as a verified scam wave.')}</p>
          <div class="field"><label for="rTown">${tx('Your town')}</label><select id="rTown" class="input" required>${townOptions(prefs.subscription.town || '', true, t('Choose your town'))}</select></div>
          <div class="field"><label for="rChannel">${esc(say('channel'))}</label><select id="rChannel" class="input">${KW.CHANNELS.map(c => `<option value="${esc(c)}" ${c === prefill.channel ? 'selected' : ''}>${tx(c)}</option>`).join('')}</select></div>
          <div class="field full"><label for="rType">${tx('Type of scam')}</label><select id="rType" class="input">${KW.SCAM_TYPES.map(ty => `<option value="${esc(ty)}">${tx(ty)}</option>`).join('')}</select></div>
          <div class="field full"><label for="rTitle">${tx('Short summary')}</label><input id="rTitle" class="input" required maxlength="120" placeholder="${tx('For example: fake parcel SMS asking for $1.99')}"></div>
          <div class="field full"><label for="rDesc">${tx('What happened?')}</label><textarea id="rDesc" class="input" rows="4" maxlength="2000" placeholder="${tx('What did the message or caller say or ask for? Leave out your own personal details.')}">${esc(prefill.desc || '')}</textarea></div>
          ${imageField('rImg', t('Screenshot (optional)'), prefill.image)}
          <div class="full form-actions">
            <button type="button" class="btn btn-secondary" data-close>${tx('Cancel')}</button>
            <button type="submit" class="btn btn-primary">${tx('Send report')}</button>
          </div>
        </form>`,
      onMount: body => {
        $$('[data-close]', body).forEach(b => b.addEventListener('click', () => closeModal()));
        const getImg = bindImageInput($('#rImg', body), $('#rImgPrev', body), prefill.image || null);
        $('#reportForm', body).addEventListener('submit', e => {
          e.preventDefault();
          const town = $('#rTown', body).value;
          const title = $('#rTitle', body).value.trim();
          if (!town || !title) { toast(t('Please choose your town and add a short summary.'), 'warn'); return; }
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
              ? t('Report sent. As a volunteer you can verify it in the list.')
              : t('Thank you. A CC or RC volunteer will check your report.'), 'ok');
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
        <p><strong>${tx('Scam alert for {town}.', { town: r.town })}</strong> ${esc(r.title)}</p>
        <a class="btn btn-secondary" href="#/radar" id="alertView">${tx('View')}</a>
        <button type="button" class="btn btn-ghost" id="alertClose">${tx('Dismiss')}</button>
      </div>`;
    banner.hidden = false;
    $('#alertClose').addEventListener('click', () => { banner.hidden = true; });
    $('#alertView').addEventListener('click', () => {
      banner.hidden = true;
      radarFilter.town = r.town;
      if (current.route === 'radar') drawRadarPage();
    });
    if ('Notification' in window && Notification.permission === 'granted' && document.hidden) {
      try { new Notification(t('Kampung Watch: scam alert for {town}', { town: r.town }), { body: r.title }); } catch (e) { /* ignore */ }
    }
  }

  /* =========================================================
     COMMUNITY
     ========================================================= */
  const communityView = { flair: 'all', sort: 'hot', q: '' };
  const flairLabel = id => (KW.FLAIRS.find(f => f.id === id) || {}).label || id;

  /* Tag colour for each topic: warnings in chili, tips in pandan, the rest quieter. */
  const FLAIR_TAG = { ask: 'tag-accent-2', alert: 'tag-accent-2', tips: 'tag-accent', debate: 'tag-neutral', story: 'tag-outline' };
  // Posts, poll answers and topics are shown without emoji.
  const noEmoji = s => String(s).replace(/[\p{Extended_Pictographic}\u{FE0F}\u{200D}]/gu, '').replace(/\s{2,}/g, ' ').trim();

  let postCounts = null;

  async function renderCommunity(seq, sub, id) {
    if (sub === 'post' && id) return renderPost(seq, id);
    const [, counts] = await Promise.all([loadPostList(seq), api.get('/posts/counts').catch(() => null)]);
    if (stale(seq)) return;
    postCounts = counts;

    const count = fid => postCounts ? (fid === 'all' ? postCounts.total : postCounts.byFlair[fid] || 0) : '';
    const topic = (fid, label) => `
      <li><button type="button" class="cm-topic" data-flair="${fid}" aria-pressed="${communityView.flair === fid}">
        <span>${tx(noEmoji(label))}</span><span class="cm-topic-n" aria-label="${tx('{n} posts', { n: count(fid) })}">${count(fid)}</span>
      </button></li>`;

    main.innerHTML = `
      <div class="community">
        <header class="cm-head">
          <div class="cm-head-inner">
            <div class="cm-head-text">
              <p class="cm-eyebrow">${tx('Kopitiam talk')}${postCounts ? ` · ${tx(postCounts.total === 1 ? '{n} discussion' : '{n} discussions', { n: postCounts.total })}` : ''}</p>
              <h1 class="cm-title">${tx('Community')}</h1>
              <p class="cm-desc">${tx('Ask about a strange message, warn your block, and learn from neighbours. Volunteer answers are marked.')}</p>
              ${writtenNote()}
            </div>
            <button type="button" class="btn btn-primary btn-lg cm-new" id="newPostBtn">${tx('New post')}</button>
          </div>
        </header>

        <div class="cm-body">
          <nav class="cm-topics" aria-labelledby="topicsTitle">
            <h2 class="kicker" id="topicsTitle">${tx('Topics')}</h2>
            <ul class="cm-topic-list" role="list">
              ${topic('all', 'All posts')}
              ${KW.FLAIRS.map(f => topic(f.id, f.label)).join('')}
            </ul>
          </nav>

          <section class="cm-feed" aria-label="${tx('Posts')}">
            <div class="cm-toolbar">
              <div class="seg" role="radiogroup" aria-label="${tx('Sort posts')}">
                ${[['hot', 'Hot'], ['new', 'New'], ['top', 'Top']].map(([s, label]) => `
                  <label class="seg-opt"><input type="radio" name="postSort" value="${s}" ${communityView.sort === s ? 'checked' : ''}>${tx(label)}</label>`).join('')}
              </div>
              <div class="cm-search">
                <label for="postSearch" class="sr-only">${tx('Search posts')}</label>
                <input type="search" id="postSearch" placeholder="${tx('Search posts')}" value="${esc(communityView.q)}">
              </div>
            </div>
            <div id="postList"></div>
          </section>

          <aside class="cm-side">
            <section aria-labelledby="rulesTitle">
              <h2 class="cm-side-title" id="rulesTitle">${tx('House rules')}</h2>
              <ol class="cm-side-list" role="list">
                <li>${th('{b}Hide personal details.{/b} Phone numbers, NRIC numbers and addresses stay out of posts.', { b: '<strong>', '/b': '</strong>' })}</li>
                <li>${th('{b}Be kind.{/b} Anyone can be targeted. Nobody gets scolded here.', { b: '<strong>', '/b': '</strong>' })}</li>
                <li>${th('{b}No selling, no strange links.{/b} Posts with unknown links are removed.', { b: '<strong>', '/b': '</strong>' })}</li>
                <li>${th('{b}Need an answer fast?{/b} {a}Ask a volunteer privately{/a} instead.', { b: '<strong>', '/b': '</strong>', a: '<a href="#/ask">', '/a': '</a>' })}</li>
              </ol>
            </section>
            <section aria-labelledby="helpersTitle">
              <h2 class="cm-side-title" id="helpersTitle">${tx('Volunteers answering')}</h2>
              <ul class="cm-side-list" role="list">
                ${KW.VOLUNTEERS.slice(0, 5).map(v => `
                  <li><span class="cm-helper">${esc(v.name)}</span><span class="cm-helper-meta">${tx(v.role)} · ${esc(placeName(v.area))} · ${langList(v.langs)}</span></li>`).join('')}
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
      toast(err.message === 'offline' ? t('Can’t reach the server.') : err.message, 'warn');
    }
  }

  function renderPostList() {
    const list = $('#postList');
    if (!list) return;
    list.innerHTML = cache.posts.length ? cache.posts.map(postItem).join('')
      : `<div class="empty"><p>${tx('No posts here yet. Be the first to start the conversation.')}</p></div>`;
    const update = updated => {
      const i = cache.posts.findIndex(x => x.id === updated.id);
      if (i >= 0) cache.posts[i] = { ...cache.posts[i], ...updated };
      renderPostList();
    };
    bindVotes(list, (kind, updated) => update(updated));
    $$('[data-listpoll]', list).forEach(b => b.addEventListener('click', () => act(b, async () => {
      const p = cache.posts.find(x => x.id === b.dataset.post);
      const i = Number(b.dataset.listpoll);
      update(await api.post(`/posts/${encodeURIComponent(p.id)}/poll`, { option: p.poll.myChoice === i ? null : i }));
    })));
    $$('[data-share]', list).forEach(b => b.addEventListener('click', () => sharePost(cache.posts.find(x => x.id === b.dataset.share))));
  }

  /* "Share to my block": the phone's share sheet (WhatsApp, Telegram…), or copy the link. */
  function sharePost(p) {
    const url = `${location.origin}/#/community/post/${p.id}`;
    const title = noEmoji(p.title);
    if (navigator.share) {
      navigator.share({ title, text: `Kampung Watch: ${title}`, url }).catch(() => { /* closed the share sheet */ });
    } else if (navigator.clipboard) {
      navigator.clipboard.writeText(url).then(() => toast(t('Link copied. Paste it into your block’s chat group.'), 'ok'));
    } else {
      toast(url);
    }
  }

  /* Text-only voting: "Upvote · 42 points · Downvote". */
  function voteBox(kind, id, score, mine) {
    return `
      <span class="vote" role="group" aria-label="${kind === 'post' ? tx('Vote on this post') : tx('Vote on this comment')}">
        <button type="button" class="btn btn-ghost" data-vote="1" data-kind="${kind}" data-id="${esc(id)}" data-mine="${mine}" aria-pressed="${mine === 1}">${tx('Upvote')}</button>
        <span class="vote-score">${tx(Math.abs(score) === 1 ? '{n} point' : '{n} points', { n: score })}</span>
        <button type="button" class="btn btn-ghost" data-vote="-1" data-kind="${kind}" data-id="${esc(id)}" data-mine="${mine}" aria-pressed="${mine === -1}">${tx('Downvote')}</button>
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
      ? `<span class="tag tag-accent-2">${tx('Verified scam')}</span>`
      : `<span class="tag tag-accent">${tx('Verified legit')}</span>`;
  }

  /* Topic tag, "author · role · time", then the volunteer verdict. */
  function postMeta(p) {
    return `
      <p class="post-meta">
        <span class="tag ${FLAIR_TAG[p.flair] || 'tag-neutral'}">${tx(noEmoji(flairLabel(p.flair)))}</span>
        <span class="post-by">${esc(authorName(p.author))}${p.authorRole ? ` · ${tx(p.authorRole)}` : ''} · ${timeAgo(p.created)}</span>
        ${verdictTag(p)}
      </p>`;
  }

  /* The scam answer is chili red; the rest are pandan green. */
  const isScamOption = label => /^scam$/i.test(noEmoji(label));

  function listPollHTML(p) {
    const total = p.poll.options.reduce((a, o) => a + o.votes, 0);
    const mine = p.poll.myChoice;
    return `
      <div class="cm-poll" role="group" aria-label="${p.flair === 'ask' ? tx('What neighbours think') : tx('Where neighbours stand')}">
        ${p.poll.options.map((o, i) => {
          const pct = total ? Math.round(o.votes / total * 100) : 0;
          return `
            <button type="button" class="cm-poll-opt ${mine === i ? 'chosen' : ''}" data-listpoll="${i}" data-post="${esc(p.id)}" aria-pressed="${mine === i}">
              <span class="cm-poll-row"><span>${label(noEmoji(o.label))}</span><span class="cm-poll-pct">${pct}%</span></span>
              <span class="cm-poll-track" aria-hidden="true"><span class="cm-poll-bar ${isScamOption(o.label) ? 'is-scam' : ''}" style="width:${pct}%"></span></span>
            </button>`;
        }).join('')}
        <p class="cm-poll-note">${tx(total === 1 ? '{n} vote' : '{n} votes', { n: total })} · ${mine == null ? tx('tap an answer to vote') : tx('tap your answer again to take it back')}</p>
      </div>`;
  }

  const chevron = up => `<svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true" focusable="false"><path d="${up ? 'm6 15 6-6 6 6' : 'm6 9 6 6 6-6'}" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"/></svg>`;

  function postItem(p) {
    const body = noEmoji(p.body);
    const excerpt = body.length > 240 ? body.slice(0, 240) + '…' : body;
    const replies = p.commentCount;
    return `
      <article class="cm-post">
        <div class="cm-vote" role="group" aria-label="${tx('Vote on this post')}">
          <button type="button" class="cm-vote-btn" data-vote="1" data-kind="post" data-id="${esc(p.id)}" data-mine="${p.myVote}" aria-pressed="${p.myVote === 1}" aria-label="${tx('Upvote')}">${chevron(true)}</button>
          <span class="cm-score" aria-label="${tx(Math.abs(p.score) === 1 ? '{n} point' : '{n} points', { n: p.score })}">${p.score}</span>
          <button type="button" class="cm-vote-btn" data-vote="-1" data-kind="post" data-id="${esc(p.id)}" data-mine="${p.myVote}" aria-pressed="${p.myVote === -1}" aria-label="${tx('Downvote')}">${chevron(false)}</button>
        </div>
        <div class="cm-post-body">
          ${postMeta(p)}
          <h2 class="cm-post-title"><a href="#/community/post/${esc(p.id)}">${written(noEmoji(p.title))}</a></h2>
          ${excerpt ? `<p class="cm-excerpt">${written(excerpt, { br: true })}</p>` : ''}
          ${p.image ? `<img class="post-thumb" src="${esc(p.image)}" alt="${tx('Image attached to this post')}">` : ''}
          ${p.poll ? listPollHTML(p) : ''}
          <div class="cm-actions">
            <a class="btn btn-ghost" href="#/community/post/${esc(p.id)}">${tx(replies === 1 ? '{n} reply' : '{n} replies', { n: replies })}</a>
            <button type="button" class="btn btn-ghost" data-share="${esc(p.id)}">${tx('Share to my block')}</button>
          </div>
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
            <p class="kicker">${tx('Community')}</p>
            <h1 class="display">${tx('That post doesn’t exist anymore.')}</h1>
            <a class="btn btn-primary btn-lg" href="#/community">${tx('Back to Community')}</a>
          </div>
        </div>`;
      return;
    }
    const vol = isVolunteer();
    const commentCount = p.commentCount;
    main.innerHTML = `
      <div class="page post-page">
        <a class="btn btn-ghost back-link" href="#/community">${tx('Back to Community')}</a>
        ${writtenNote()}
        <article class="post-full">
          ${postMeta(p)}
          <h1 class="display display-sm">${written(noEmoji(p.title))}</h1>
          ${p.body ? `<p class="post-body">${written(noEmoji(p.body), { br: true })}</p>` : ''}
          ${p.image ? `<img class="post-img" src="${esc(p.image)}" alt="${tx('Image attached to this post')}">` : ''}
          <div class="post-actions">${voteBox('post', p.id, p.score, p.myVote)}</div>
          ${p.flair === 'ask' && p.body ? `
            <details class="post-check">
              <summary>${tx('Run the red-flag check on this message')}</summary>
              <div class="post-check-body">${flagsHTML(p.body)}</div>
            </details>` : ''}
          ${p.poll ? pollHTML(p) : ''}
          ${p.verdict ? `<p class="muted">${tx('Verdict given by {name}.', { name: p.verdict.by })}</p>` : ''}
          <div class="vol-only verdict-row" role="group" aria-label="${tx('Volunteer verdict')}">
            <span class="muted">${tx('Volunteer verdict:')}</span>
            <button type="button" class="btn ${p.verdict && p.verdict.result === 'scam' ? 'btn-primary' : 'btn-secondary'}" data-pverdict="scam">${tx('Scam')}</button>
            <button type="button" class="btn ${p.verdict && p.verdict.result === 'legit' ? 'btn-primary' : 'btn-secondary'}" data-pverdict="legit">${tx('Legit')}</button>
            ${p.verdict ? `<button type="button" class="btn btn-ghost" data-pverdict="">${tx('Clear')}</button>` : ''}
          </div>
        </article>

        <section class="comments" aria-labelledby="commentsTitle">
          <h2 class="section-title" id="commentsTitle">${tx(commentCount === 1 ? '{n} comment' : '{n} comments', { n: commentCount })}</h2>
          <form class="comment-form" id="commentForm">
            <div class="field">
              <label for="commentText">${tx('Commenting as {name}', { name: vol ? `${prefs.volunteer.name} (${t('Volunteer')})` : (cache.me ? cache.me.handle : t('a resident')) })}</label>
              <textarea id="commentText" class="input" rows="3" maxlength="3000" placeholder="${vol ? tx('Answer as a volunteer') : tx('Share your thoughts or advice')}"></textarea>
            </div>
            <div class="btn-row"><button type="submit" class="btn btn-primary">${tx('Post comment')}</button></div>
          </form>
          <div class="comment-tree">${p.comments.length ? commentsHTML(p.comments, 0) : `<p class="muted">${tx('No comments yet. Be the first to help.')}</p>`}</div>
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
          ${c.role ? `<span class="tag tag-accent">${tx(c.role)}</span>` : ''}
          <span class="muted">${timeAgo(c.created)}</span>
        </p>
        <p class="comment-body">${written(c.body, { br: true })}</p>
        <div class="comment-actions">
          ${voteBox('comment', c.id, c.score, c.myVote)}
          <button type="button" class="btn btn-ghost" data-reply="${esc(c.id)}" aria-expanded="false" aria-controls="rf-${esc(c.id)}">${tx('Reply')}</button>
        </div>
        <form class="reply-inline" id="rf-${esc(c.id)}" data-parent="${esc(c.id)}" hidden>
          <textarea class="input" rows="2" maxlength="3000" aria-label="${tx('Reply to {name}', { name: c.author })}" placeholder="${tx('Write a reply')}"></textarea>
          <button type="submit" class="btn btn-primary">${tx('Reply')}</button>
        </form>
        ${c.replies && c.replies.length ? `<div class="replies">${commentsHTML(c.replies, depth + 1)}</div>` : ''}
      </div>`).join('');
  }

  function pollHTML(p) {
    const mine = p.poll.myChoice;
    const total = p.poll.options.reduce((a, o) => a + o.votes, 0) || 1;
    return `
      <section class="poll" aria-labelledby="pollTitle">
        <h2 class="kicker" id="pollTitle">${p.flair === 'ask' ? tx('What the community thinks') : tx('Where do you stand?')}</h2>
        <p class="muted">${mine == null ? tx('Tap an answer to vote.') : tx('Tap your answer again to take back your vote.')}</p>
        ${p.poll.options.map((o, i) => {
          const pct = Math.round(o.votes / total * 100);
          return `
            <button type="button" class="poll-opt ${mine === i ? 'chosen' : ''}" data-poll="${i}" aria-pressed="${mine === i}">
              <span class="poll-bar" style="width:${pct}%"></span>
              <span class="poll-label">${label(noEmoji(o.label))}</span>
              <span class="poll-pct">${pct}%</span>
            </button>`;
        }).join('')}
      </section>`;
  }

  function openPostModal(prefill = {}) {
    openModal({
      title: t('New post'),
      wide: true,
      body: `
        <form id="postForm" class="form-grid">
          <div class="field full"><label for="pFlair">${tx('Topic')}</label>
            <select id="pFlair" class="input">${KW.FLAIRS.map(f => `<option value="${f.id}" ${f.id === prefill.flair ? 'selected' : ''}>${tx(f.label)}</option>`).join('')}</select>
          </div>
          <div class="field full"><label for="pTitle">${tx('Title')}</label><input id="pTitle" class="input" maxlength="140" required placeholder="${tx('For example: is this WhatsApp job offer a scam?')}" value="${esc(prefill.title || '')}"></div>
          <div class="field full"><label for="pBody">${tx('Details')}</label><textarea id="pBody" class="input" rows="6" maxlength="5000" placeholder="${tx('Paste the message or tell your story. Hide phone numbers and personal details.')}"></textarea></div>
          <div class="full" id="pFlags" aria-live="polite"></div>
          ${imageField('pImg', t('Photo or screenshot (optional)'))}
          <p class="full muted" id="pPollNote"></p>
          <div class="full form-actions">
            <button type="button" class="btn btn-secondary" data-close>${tx('Cancel')}</button>
            <button type="submit" class="btn btn-primary">${tx('Post')}</button>
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
            ? t('A poll (Agree, Disagree, It depends) is added automatically.')
            : t('A community poll (Scam, Looks legit, Not sure) is added automatically.');
        };
        flair.addEventListener('change', update);
        text.addEventListener('input', update);
        update();
        $('#postForm', body).addEventListener('submit', e => {
          e.preventDefault();
          const title = $('#pTitle', body).value.trim();
          if (!title) { toast(t('Please add a title.'), 'warn'); return; }
          act(e.submitter, async () => {
            const post = await api.post('/posts', { flair: flair.value, title, body: text.value, image: getImg() });
            closeModal();
            toast(t('Posted. Neighbours and volunteers can now reply.'), 'ok');
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

  function progressBar(pct, label = t('Course progress')) {
    return `<div class="progress" role="progressbar" aria-valuenow="${pct}" aria-valuemin="0" aria-valuemax="100" aria-label="${esc(label)}"><span style="width:${pct}%"></span></div>`;
  }

  function progressWords(p, course) {
    if (p.passed) return t('Passed');
    if (p.done.length) return t('{n} of {total} lessons done', { n: p.done.length, total: course.lessons.length });
    return t('Not started');
  }

  const passMark = course => Math.ceil(course.quiz.length * 2 / 3); // two-thirds, e.g. 2 of 3

  const game = { order: [], i: 0, score: 0, answered: false };
  function resetGame() {
    game.order = KW.SPOT_GAME.map((_, i) => i).sort(() => Math.random() - 0.5).slice(0, 5);
    game.i = 0; game.score = 0; game.answered = false;
  }

  /* Learn uses the Community layout: a head band, then progress filters | courses | game. */
  const learnView = { status: 'all', level: 'all' };

  const courseStatus = p => (p.passed ? 'passed' : p.done.length ? 'started' : 'new');
  const COURSE_TAG = {
    passed: ['Passed', 'tag-accent'],
    started: [null, 'tag-outline'], // label is "N of 3 lessons done"
    new: ['Not started', 'tag-neutral']
  };

  function renderLearn(seq, sub, id, step) {
    if (sub === 'course' && id) return renderCourse(id, step);

    const all = KW.COURSES.map(c => ({ c, p: courseProgress(c.id) }));
    const passed = all.filter(x => x.p.passed).length;
    const next = all.find(x => !x.p.passed);
    const count = st => st === 'all' ? all.length : all.filter(x => courseStatus(x.p) === st).length;
    const LEVEL_ORDER = ['For everyone', 'Beginner', 'Intermediate'];
    const levels = [...new Set(KW.COURSES.map(c => c.level))].sort((a, b) => LEVEL_ORDER.indexOf(a) - LEVEL_ORDER.indexOf(b));
    const filter = (st, label) => `
      <li><button type="button" class="cm-topic" data-status="${st}" aria-pressed="${learnView.status === st}">
        <span>${tx(label)}</span><span class="cm-topic-n" aria-label="${tx('{n} courses', { n: count(st) })}">${count(st)}</span>
      </button></li>`;

    main.innerHTML = `
      <div class="learn-page">
        <header class="cm-head">
          <div class="cm-head-inner">
            <div class="cm-head-text">
              <p class="cm-eyebrow">${tx('Short lessons · {n} courses · about 10 minutes each', { n: KW.COURSES.length })}</p>
              <h1 class="cm-title">${tx('Learn')}</h1>
              <p class="cm-desc">${tx('Short courses with quizzes, and a Spot-the-scam game. Start with fake delivery messages, the most reported scam this month.')}</p>
              ${prefs.lang !== 'en' ? `<p class="cm-desc">${tx('The lessons, quizzes and game are in English for now.')}</p>` : ''}
            </div>
            ${next
              ? `<a class="btn btn-primary btn-lg cm-new" href="#/learn/course/${next.c.id}">${next.p.done.length ? tx('Continue') : passed ? tx('Next course') : tx('Start the first course')}</a>`
              : `<a class="btn btn-primary btn-lg cm-new" href="#gameTitle" data-jump-game>${tx('Play Spot the scam')}</a>`}
          </div>
        </header>

        <div class="cm-body">
          <nav class="cm-topics" aria-labelledby="progressTitle">
            <h2 class="kicker" id="progressTitle">${tx('Your progress')}</h2>
            <p class="lr-progress">${th('{n} of {total} passed', { n: `<span class="stat-n">${passed}</span>`, total: KW.COURSES.length })}</p>
            ${progressBar(Math.round(passed / KW.COURSES.length * 100), t('Courses passed'))}
            ${passed === KW.COURSES.length ? `<p class="tag tag-accent lr-badge">${tx('Kampung Scam-Buster: every course passed')}</p>` : ''}
            <ul class="cm-topic-list lr-filters" role="list">
              ${filter('all', 'All courses')}
              ${filter('new', 'Not started')}
              ${filter('started', 'In progress')}
              ${filter('passed', 'Passed')}
            </ul>
          </nav>

          <section class="cm-feed" aria-labelledby="coursesTitle">
            <h2 class="sr-only" id="coursesTitle">${tx('Courses')}</h2>
            <div class="cm-toolbar">
              <div class="seg lr-levels" role="radiogroup" aria-label="${tx('Level')}">
                ${[['all', 'All levels'], ...levels.map(l => [l, l])].map(([v, label]) => `
                  <label class="seg-opt"><input type="radio" name="courseLevel" value="${esc(v)}" ${learnView.level === v ? 'checked' : ''}>${tx(label)}</label>`).join('')}
              </div>
            </div>
            <ol class="lr-list" id="courseList" role="list"></ol>
          </section>

          <aside class="cm-side">
            <section class="game" id="gameCard" aria-labelledby="gameTitle"></section>
            <section aria-labelledby="drillTitle">
              <h2 class="cm-side-title" id="drillTitle">${tx('Practise with your family')}</h2>
              <ul class="cm-side-list" role="list">
                <li>${th('{b}Scam Drills.{/b} Send a safe practice scam to someone in your Circle and see if they press Pause.', { b: '<strong>', '/b': '</strong>' })}
                  <p class="lr-drill-btn"><a class="btn btn-secondary" href="#/pause">${tx('Send a practice scam')}</a></p></li>
              </ul>
            </section>
          </aside>
        </div>
      </div>`;

    $$('[data-status]').forEach(b => b.addEventListener('click', () => {
      learnView.status = b.dataset.status;
      $$('[data-status]').forEach(x => x.setAttribute('aria-pressed', String(x === b)));
      drawCourseList();
    }));
    $$('input[name=courseLevel]').forEach(r => r.addEventListener('change', () => {
      learnView.level = r.value;
      drawCourseList();
    }));
    const jump = $('[data-jump-game]');
    if (jump) jump.addEventListener('click', e => {
      e.preventDefault(); // a #hash link would change the page
      $('#gameTitle').scrollIntoView({ behavior: 'smooth' });
    });

    drawCourseList();
    resetGame();
    renderGame();
  }

  function drawCourseList() {
    const list = $('#courseList');
    if (!list) return;
    const shown = KW.COURSES
      .map((c, i) => ({ c, i, p: courseProgress(c.id) }))
      .filter(x => learnView.status === 'all' || courseStatus(x.p) === learnView.status)
      .filter(x => learnView.level === 'all' || x.c.level === learnView.level);
    if (!shown.length) {
      list.innerHTML = `<li class="empty"><p>${tx('No courses match. Try another filter.')}</p></li>`;
      return;
    }
    list.innerHTML = shown.map(({ c, i, p }) => {
      const st = courseStatus(p);
      const [label, tag] = COURSE_TAG[st];
      const lessonsLeft = p.done.length < c.lessons.length;
      return `
        <li class="cm-post lr-course">
          <span class="lr-n" aria-hidden="true">${String(i + 1).padStart(2, '0')}</span>
          <div class="cm-post-body">
            <p class="post-meta">
              <span class="tag ${tag}">${label ? tx(label) : esc(progressWords(p, c))}</span>
              <span class="post-by">${tx('{n} minutes · {level} · {lessons} lessons and a quiz', { n: c.minutes, level: t(c.level), lessons: c.lessons.length })}</span>
            </p>
            <h3 class="cm-post-title"><a href="#/learn/course/${c.id}">${tx(c.title)}</a></h3>
            <p class="cm-excerpt">${tx(c.blurb)}</p>
            ${st === 'started' ? progressBar(p.pct, t('{course}: progress', { course: t(c.title) })) : ''}
            <div class="cm-actions">
              <a class="btn btn-ghost" href="#/learn/course/${c.id}">${st === 'new' ? tx('Start') : st === 'passed' ? tx('Review the lessons') : lessonsLeft ? tx('Continue') : tx('Back to the lessons')}</a>
              ${st !== 'passed' && !lessonsLeft ? `<a class="btn btn-ghost" href="#/learn/course/${c.id}/quiz">${tx('Take the quiz')}</a>` : ''}
              ${st === 'passed' ? `<a class="btn btn-ghost" href="#/learn/course/${c.id}/quiz">${tx('Retake the quiz')}</a>` : ''}
            </div>
          </div>
        </li>`;
    }).join('');
  }

  function renderGame() {
    const card = $('#gameCard');
    if (!card) return;
    if (game.i >= game.order.length) {
      const best = Math.max(prefs.gameBest || 0, game.score);
      if (best !== prefs.gameBest) { prefs.gameBest = best; savePrefs(); }
      card.innerHTML = `
        <h2 class="cm-side-title" id="gameTitle">${tx('Spot the scam')}</h2>
        <p class="game-score">${th('{n} of {total} right', { n: `<span class="stat-n">${game.score}</span>`, total: game.order.length })}</p>
        <p class="game-verdict">${game.score === game.order.length ? tx('Perfect. You’re a natural scam-spotter.') : game.score >= 3 ? tx('Nice work. A few of those were tricky.') : tx('Scams are designed to fool people. Try a course and play again.')}</p>
        <p class="muted">${tx('Your best score: {n} of {total}', { n: best, total: game.order.length })}</p>
        <div class="btn-row"><button type="button" class="btn btn-primary btn-lg" id="gameAgain">${tx('Play again')}</button></div>`;
      $('#gameAgain').addEventListener('click', () => { resetGame(); renderGame(); });
      return;
    }
    const item = KW.SPOT_GAME[game.order[game.i]];
    card.innerHTML = `
      <h2 class="cm-side-title" id="gameTitle">${tx('Spot the scam')}</h2>
      <p class="muted">${tx('Message {n} of {total} · {score} right so far', { n: game.i + 1, total: game.order.length, score: game.score })}</p>
      <figure class="game-msg">
        <blockquote>${esc(item.msg)}</blockquote>
        <figcaption>${esc(item.from)}</figcaption>
      </figure>
      <div class="btn-row" role="group" aria-label="${tx('Your answer')}">
        <button type="button" class="btn btn-secondary btn-lg" data-ans="scam">${tx('Scam')}</button>
        <button type="button" class="btn btn-secondary btn-lg" data-ans="legit">${tx('Legit')}</button>
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
        <p class="game-verdict ${right ? 'is-right' : 'is-wrong'}">${right ? tx('Correct.') : tx('Not quite.')} ${item.isScam ? tx('It’s a scam.') : tx('It’s legit.')}</p>
        <p>${esc(item.explain)}</p>
        <div class="btn-row"><button type="button" class="btn btn-primary btn-lg" id="gameNext">${game.i + 1 < game.order.length ? tx('Next message') : tx('See my score')}</button></div>`;
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
        <a class="btn btn-ghost back-link" href="#/learn">${tx('All courses')}</a>
        <div class="course-layout">
          <nav class="lesson-nav" aria-labelledby="courseTitle">
            <p class="kicker">${tx('Course {n} · {minutes} minutes', { n: String(n).padStart(2, '0'), minutes: course.minutes })}</p>
            <h2 class="lesson-nav-title" id="courseTitle">${tx(course.title)}</h2>
            ${progressBar(courseProgress(id).pct)}
            <ol class="lesson-steps" role="list">
              ${course.lessons.map((l, i) => `
                <li><a href="#/learn/course/${id}/${i}" ${i === idx ? 'aria-current="step"' : ''}>
                  <span class="step-n">${i + 1}</span><span class="step-title">${esc(l.title)}</span>
                  ${p.done.includes(i) ? `<span class="step-state">${tx('Done')}</span>` : ''}
                </a></li>`).join('')}
              <li><a href="#/learn/course/${id}/quiz" ${isQuiz ? 'aria-current="step"' : ''}>
                <span class="step-n">${course.lessons.length + 1}</span><span class="step-title">${tx('Quiz')}</span>
                ${p.passed ? `<span class="step-state">${tx('Passed')}</span>` : ''}
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
        <p class="kicker">${tx('Lesson {n} of {total}', { n: idx + 1, total: course.lessons.length })}</p>
        <h1 class="display display-sm">${esc(lesson.title)}</h1>
        <div class="lesson-content">${lesson.body}</div>
        <div class="btn-row">
          ${idx > 0 ? `<a class="btn btn-secondary btn-lg" href="#/learn/course/${id}/${idx - 1}">${tx('Previous lesson')}</a>` : ''}
          <button type="button" class="btn btn-primary btn-lg" id="lessonDone">${idx + 1 < course.lessons.length ? tx('Got it, next lesson') : tx('Got it, take the quiz')}</button>
        </div>`;
      $('#lessonDone').addEventListener('click', () => {
        if (!p.done.includes(idx)) p.done.push(idx);
        savePrefs();
        location.hash = idx + 1 < course.lessons.length ? `#/learn/course/${id}/${idx + 1}` : `#/learn/course/${id}/quiz`;
      });
      return;
    }

    body.innerHTML = `
      <p class="kicker">${tx('Quiz')}</p>
      <h1 class="display display-sm">${tx('Check what you’ve learned.')}</h1>
      <p class="lede">${tx('Get {n} of {total} right to pass the course.', { n: passMark(course), total: course.quiz.length })}</p>
      <form id="quizForm" class="quiz">
        ${course.quiz.map((q, qi) => `
          <fieldset class="quiz-q" id="q${qi}">
            <legend><span class="flag-n">${qi + 1}</span>${esc(q.q)}</legend>
            ${q.options.map((o, oi) => `
              <label class="radio quiz-opt"><input type="radio" name="q${qi}" value="${oi}" required><span class="dot" aria-hidden="true"></span><span>${esc(o)}</span></label>`).join('')}
            <p class="quiz-explain" hidden></p>
          </fieldset>`).join('')}
        <div id="quizResult" aria-live="polite"></div>
        <div class="btn-row"><button type="submit" class="btn btn-primary btn-lg">${tx('Check my answers')}</button></div>
      </form>`;

    $('#quizForm').addEventListener('submit', e => {
      e.preventDefault();
      const form = e.target;
      const answers = course.quiz.map((_, qi) => {
        const sel = $(`input[name=q${qi}]:checked`, form);
        return sel ? Number(sel.value) : null;
      });
      if (answers.includes(null)) { toast(t('Please answer every question.'), 'warn'); return; }
      let score = 0;
      course.quiz.forEach((q, qi) => {
        const ok = answers[qi] === q.answer;
        if (ok) score++;
        const fs = $('#q' + qi);
        fs.classList.remove('is-right', 'is-wrong');
        fs.classList.add(ok ? 'is-right' : 'is-wrong');
        const ex = $('.quiz-explain', fs);
        ex.hidden = false;
        ex.innerHTML = `<strong>${ok ? tx('Correct.') : tx('Not quite. The answer is: {answer}.', { answer: q.options[q.answer] })}</strong> ${esc(q.explain)}`;
      });
      const pass = score >= passMark(course);
      p.score = Math.max(p.score || 0, score);
      if (pass) p.passed = true;
      savePrefs();
      // The server marks it again and remembers the pass; volunteers need the Intermediate courses.
      api.post('/learn/quiz', { course: course.id, answers }).catch(() => {});
      const nextCourse = KW.COURSES.find(c => !courseProgress(c.id).passed);
      $('#quizResult').innerHTML = `
        <p class="game-verdict ${pass ? 'is-right' : 'is-wrong'}">${pass ? tx('You passed, {n} of {total}.', { n: score, total: course.quiz.length }) : tx('{n} of {total}. So close.', { n: score, total: course.quiz.length })}</p>
        <p>${pass ? tx('Share what you learned with someone you care about.') : tx('Read the explanations above and try again.')}</p>
        <div class="btn-row">
          ${pass && nextCourse ? `<a class="btn btn-primary btn-lg" href="#/learn/course/${nextCourse.id}">${tx('Next course: {title}', { title: t(nextCourse.title) })}</a>` : ''}
          ${pass ? `<button type="button" class="btn btn-secondary btn-lg" id="shareTip">${tx('Share a tip in Community')}</button>` : ''}
        </div>`;
      const share = $('#shareTip');
      if (share) share.addEventListener('click', () => openPostModal({ flair: 'tips', title: t('What I learned from “{title}”', { title: t(course.title) }) }));
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
                ${KW.HELPLINES.map(h => `<li><a href="tel:${h.number.replace(/\s/g, '')}">${esc(h.number)}</a> <span>${tx(h.label)}</span><span class="muted">${tx(h.note)}</span></li>`).join('')}
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
