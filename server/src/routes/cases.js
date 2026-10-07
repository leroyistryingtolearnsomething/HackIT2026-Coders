/* "Ask a Neighbour": residents send suspicious messages; volunteers reply. */
import { Router } from 'express';
import { requireClient, requireVolunteer, handleFor } from '../auth.js';
import { transaction } from '../db.js';
import { KW, analyse, maskPersonal, defaultPoll } from '../shared.js';
import { text, oneOf, notFound, badRequest, forbidden, newId, nowIso } from '../http.js';
import { getCaseRow, serializeCase, canView, addMessage, updateCase, notifyCase } from '../models/cases.js';
import { createPost } from '../models/posts.js';

const LANGS = ['English', '华语 (Mandarin)', 'Bahasa Melayu', 'தமிழ் (Tamil)', 'Hokkien / Teochew'];
const PHONE = /^\+?[\d\s-]{8,16}$/;

export default function casesRouter({ db, hub, images, bot }) {
  const r = Router();
  r.use(requireClient);

  const loadRow = req => {
    const row = getCaseRow(db, req.params.id);
    // Same response for "missing" and "not yours" so case ids can't be probed.
    if (!row || !canView(row, req)) throw notFound('Case not found');
    return row;
  };
  const view = (req, row) => serializeCase(db, getCaseRow(db, row.id), req);

  /* Residents see their own cases; volunteers see the shared inbox. */
  r.get('/', (req, res) => {
    const rows = req.volunteer
      ? db.prepare("SELECT * FROM cases ORDER BY status = 'resolved', created_at DESC LIMIT 100").all()
      : db.prepare('SELECT * FROM cases WHERE client_id = ? ORDER BY created_at DESC LIMIT 50').all(req.clientId);
    res.json(rows.map(row => serializeCase(db, row, req)));
  });

  r.get('/:id', (req, res) => res.json(view(req, loadRow(req))));

  r.post('/', (req, res) => {
    const b = req.body || {};
    const body = text(b.text, 'text', { max: 4000 });
    const image = images.save(b.image);

    let callback = null;
    if (b.callback) {
      const phone = text(b.callback.phone, 'phone', { min: 1, max: 20 });
      if (!PHONE.test(phone)) throw badRequest('Please enter a valid phone number');
      callback = {
        name: text(b.callback.name, 'name', { max: 60 }),
        phone,
        lang: LANGS.includes(b.callback.lang) ? b.callback.lang : 'English'
      };
    }
    // A call-back request on its own is fine: some residents would rather talk than type.
    if (!body && !image && !callback) throw badRequest('Paste the message or add a screenshot');

    const { flags, level } = analyse(body);
    const id = newId('k');
    transaction(db, () => {
      db.prepare(`INSERT INTO cases (id, client_id, channel, text, image, flags, level, callback, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`)
        .run(id, req.clientId, oneOf(b.channel, KW.CHANNELS, 'channel'), body, image,
          JSON.stringify(flags), level, callback ? JSON.stringify(callback) : null, nowIso());
      addMessage(db, id, 'system', null, 'Your case has been sent to volunteers near you.');
    });
    const row = getCaseRow(db, id);
    notifyCase(hub, row, 'new');
    bot.onCaseCreated(id);
    res.status(201).json(serializeCase(db, row, req));
  });

  r.post('/:id/messages', (req, res) => {
    const row = loadRow(req);
    if (row.status === 'resolved') throw badRequest('This case is already resolved');
    const body = text(req.body?.body, 'body', { min: 1, max: 3000 });

    if (req.volunteer) {
      // A human volunteer replying takes the case over from the simulated one.
      const v = req.volunteer;
      transaction(db, () => {
        const current = row.volunteer ? JSON.parse(row.volunteer) : null;
        if (!current || current.bot || current.name !== v.name) {
          updateCase(db, row.id, { volunteer: { name: v.name, role: v.role, area: v.area } });
        }
        addMessage(db, row.id, 'vol', `${v.name} · ${v.role}`, body);
        updateCase(db, row.id, { status: 'replied' });
      });
      notifyCase(hub, row, 'reply', { by: v.name });
    } else {
      if (row.client_id !== req.clientId) throw forbidden();
      addMessage(db, row.id, 'resident', null, body);
      notifyCase(hub, row, 'message');
      bot.onResidentMessage(row.id);
    }
    res.status(201).json(view(req, row));
  });

  r.post('/:id/verdict', requireVolunteer, (req, res) => {
    const row = loadRow(req);
    const verdict = req.body?.verdict ?? null;
    if (verdict !== null) oneOf(verdict, ['scam', 'suspicious', 'safe'], 'verdict');
    updateCase(db, row.id, { verdict });
    notifyCase(hub, row, 'verdict');
    res.json(view(req, row));
  });

  r.post('/:id/resolve', (req, res) => {
    const row = loadRow(req);
    if (row.status !== 'resolved') {
      transaction(db, () => {
        updateCase(db, row.id, { status: 'resolved' });
        addMessage(db, row.id, 'system', null, 'Case marked as resolved. Thanks for checking before acting!');
      });
      notifyCase(hub, row, 'resolved');
    }
    res.json(view(req, row));
  });

  /* Post an anonymised copy to the community so others learn from it. */
  r.post('/:id/share', (req, res) => {
    const row = loadRow(req);
    if (row.client_id !== req.clientId) throw forbidden('Only the resident who asked can share this case');
    if (row.shared_post) return res.json({ postId: row.shared_post });
    const volunteer = row.volunteer ? JSON.parse(row.volunteer) : null;
    const postId = transaction(db, () => {
      const id = createPost(db, {
        flair: 'ask',
        author: handleFor(req.clientId),
        authorClient: req.clientId,
        title: `Is this ${row.channel.toLowerCase()} message a scam?`,
        body: maskPersonal(row.text || '(see screenshot)'),
        image: row.image,
        poll: defaultPoll('ask')
      });
      if (row.verdict && row.verdict !== 'suspicious') {
        db.prepare('UPDATE posts SET verdict = ? WHERE id = ?').run(JSON.stringify({
          result: row.verdict === 'safe' ? 'legit' : 'scam',
          by: volunteer ? `${volunteer.name} · ${volunteer.role}` : 'Volunteer'
        }), id);
      }
      updateCase(db, row.id, { shared_post: id });
      return id;
    });
    hub.send('post', { id: postId, action: 'new' });
    res.status(201).json({ postId });
  });

  return r;
}
