/* Pause: "someone is pressuring me right now". The resident's Circle is alerted
   first; if nobody steps in before the clock runs out, volunteers are alerted. */
import { Router } from 'express';
import { requireClient } from '../auth.js';
import { transaction } from '../db.js';
import { KW } from '../shared.js';
import { text, oneOf, notFound, badRequest, forbidden, newId, nowIso } from '../http.js';
import { circleOf, memberClients } from '../models/circles.js';
import {
  getPauseRow, openPauseOf, pauseRole, serializePause, addPauseMessage, updatePause, claimPause, notifyPause
} from '../models/pauses.js';

const SIGN_IDS = KW.PAUSE_SIGNS.map(s => s.id);

const OUTCOME_MESSAGES = {
  stopped: name => `Pause worked: ${name} stopped before paying or sharing anything. Well done for checking first.`,
  safe: () => 'False alarm: it turned out to be genuine. Pressing Pause was still the right thing to do.',
  lost: () => 'Money or details may already be gone. Call your bank’s 24-hour hotline now to freeze your account, then make a police report. The ScamShield Helpline 1799 can guide you.'
};

function readDetails(b) {
  const out = {};
  if (b.signs !== undefined) {
    if (!Array.isArray(b.signs)) throw badRequest('signs must be a list');
    out.signs = [...new Set(b.signs)].map(s => oneOf(s, SIGN_IDS, 'sign'));
  }
  if (b.caller !== undefined) out.caller = b.caller ? oneOf(b.caller, KW.PAUSE_CALLERS, 'caller') : null;
  if (b.note !== undefined) out.note = text(b.note, 'note', { max: 1000 });
  return out;
}

export default function pausesRouter({ db, hub, pauseWatch }) {
  const r = Router();
  r.use(requireClient);

  const load = req => {
    const row = getPauseRow(db, req.params.id);
    const role = row && pauseRole(db, row, req);
    // Same answer for "missing" and "not yours" so ids can't be probed.
    if (!role) throw notFound('Pause not found');
    return { row, role };
  };
  const view = (req, id) => serializePause(db, getPauseRow(db, id), req);

  /* The person acting: a Circle member's name and relation, or a volunteer's role. */
  function actor(req, row, role) {
    if (role === 'volunteer') {
      const v = req.volunteer;
      return { sender: 'vol', name: `${v.name} · ${v.role}`, responder: { name: v.name, kind: 'volunteer', detail: `${v.role}, ${v.area}` } };
    }
    if (role === 'circle') {
      const m = db.prepare('SELECT name, relation FROM circle_members WHERE circle_id = ? AND client_id = ?').get(row.circle_id, req.clientId);
      return { sender: 'circle', name: `${m.name} · ${m.relation}`, responder: { name: m.name, kind: 'circle', detail: m.relation } };
    }
    return { sender: 'resident', name: null, responder: null };
  }

  /* Your own pauses, your Circle's, and (for volunteers) every escalated one. */
  r.get('/', (req, res) => {
    const rows = db.prepare(`SELECT * FROM pauses
      WHERE client_id = ?
         OR circle_id IN (SELECT circle_id FROM circle_members WHERE client_id = ?)
         OR (? AND stage = 'volunteer')
      ORDER BY status = 'resolved', created_at DESC LIMIT 50`).all(req.clientId, req.clientId, req.volunteer ? 1 : 0);
    res.json(rows.map(row => serializePause(db, row, req)));
  });

  /* Impact numbers for the pitch and the Pause page. */
  r.get('/stats', (req, res) => {
    const rows = db.prepare('SELECT created_at, responded_at, outcome FROM pauses').all();
    const waits = rows.filter(p => p.responded_at)
      .map(p => (new Date(p.responded_at) - new Date(p.created_at)) / 1000).sort((a, b) => a - b);
    res.json({
      pauses: rows.length,
      stopped: rows.filter(p => p.outcome === 'stopped').length,
      medianResponseSeconds: waits.length ? Math.round(waits[Math.floor(waits.length / 2)]) : null,
      circles: db.prepare('SELECT COUNT(*) AS n FROM circles').get().n,
      escalateAfterSeconds: Math.round(pauseWatch.delayMs / 1000)
    });
  });

  r.get('/:id', (req, res) => res.json(view(req, load(req).row.id)));

  /* One tap. Pressing again while a Pause is open returns the same one. */
  r.post('/', (req, res) => {
    const existing = openPauseOf(db, req.clientId);
    if (existing) return res.json(serializePause(db, existing, req));

    const details = readDetails(req.body || {});
    const circle = circleOf(db, req.clientId);
    const hasCircle = !!circle && memberClients(db, circle.id).length > 0;
    const now = nowIso();
    const id = newId('p');
    transaction(db, () => {
      db.prepare(`INSERT INTO pauses (id, client_id, circle_id, name, town, signs, caller, note, stage, created_at, escalated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
        .run(id, req.clientId, circle ? circle.id : null, circle ? circle.owner_name : 'A resident', circle ? circle.town : null,
          JSON.stringify(details.signs || []), details.caller || null, details.note || '',
          hasCircle ? 'circle' : 'volunteer', now, hasCircle ? null : now);
      addPauseMessage(db, id, 'system', null, hasCircle
        ? 'Your Circle has been alerted. Stay on this screen. Don’t pay, and don’t share any codes.'
        : 'Volunteers near you have been alerted. Don’t pay, and don’t share any codes.');
    });
    const row = getPauseRow(db, id);
    notifyPause(db, hub, row, 'new');
    if (hasCircle) pauseWatch.schedule(row);
    else pauseWatch.onVolunteerStage(id);
    res.status(201).json(serializePause(db, row, req));
  });

  /* The resident adds what's happening: the warning signs and who the caller claims to be. */
  r.post('/:id/details', (req, res) => {
    const { row, role } = load(req);
    if (role !== 'owner') throw forbidden('Only the person who pressed Pause can change this');
    updatePause(db, row.id, readDetails(req.body || {}));
    notifyPause(db, hub, row, 'updated');
    res.json(view(req, row.id));
  });

  /* "I'm on it": a Circle member or volunteer takes responsibility for calling. */
  r.post('/:id/respond', (req, res) => {
    const { row, role } = load(req);
    if (role === 'owner') throw badRequest('Someone else needs to respond to your Pause');
    if (row.status !== 'open') throw badRequest('This Pause is already closed');
    const who = actor(req, row, role);
    const claimed = transaction(db, () => {
      const ok = claimPause(db, row, who.responder);
      if (ok) addPauseMessage(db, row.id, 'system', null, `${who.responder.name} (${who.responder.detail}) is on it and will call you now.`);
      return ok;
    });
    if (claimed) notifyPause(db, hub, row, 'responding', { by: who.responder.name });
    res.json(view(req, row.id));
  });

  /* Skip the wait and bring in a volunteer straight away. */
  r.post('/:id/escalate', (req, res) => {
    const { row, role } = load(req);
    if (role !== 'owner' && role !== 'circle') throw forbidden();
    if (row.status === 'open' && row.stage === 'circle') pauseWatch.escalateNow(row.id);
    res.json(view(req, row.id));
  });

  r.post('/:id/messages', (req, res) => {
    const { row, role } = load(req);
    if (row.status !== 'open') throw badRequest('This Pause is already closed');
    const body = text(req.body?.body, 'message', { min: 1, max: 1000 });
    const who = actor(req, row, role);
    transaction(db, () => {
      if (who.responder) claimPause(db, row, who.responder); // writing back counts as stepping in
      addPauseMessage(db, row.id, who.sender, who.name, body);
    });
    notifyPause(db, hub, row, 'message', { by: who.responder ? who.responder.name : row.name });
    res.status(201).json(view(req, row.id));
  });

  r.post('/:id/resolve', (req, res) => {
    const { row } = load(req);
    const outcome = oneOf(req.body?.outcome, Object.keys(OUTCOME_MESSAGES), 'outcome');
    if (row.status !== 'resolved') {
      transaction(db, () => {
        updatePause(db, row.id, { status: 'resolved', outcome, resolved_at: nowIso() });
        addPauseMessage(db, row.id, 'system', null, OUTCOME_MESSAGES[outcome](row.name));
      });
      notifyPause(db, hub, row, 'resolved', { outcome });
    }
    res.json(view(req, row.id));
  });

  return r;
}
