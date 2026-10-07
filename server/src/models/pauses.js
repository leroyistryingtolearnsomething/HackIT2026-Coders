/* Pause: a resident under pressure asks their Circle (then volunteers) to step in. */
import { nowIso } from '../http.js';
import { getCircle, memberClients, membership } from './circles.js';

export function getPauseRow(db, id) {
  return db.prepare('SELECT * FROM pauses WHERE id = ?').get(id);
}

export function openPauseOf(db, clientId) {
  return db.prepare("SELECT * FROM pauses WHERE client_id = ? AND status = 'open' ORDER BY created_at DESC LIMIT 1").get(clientId);
}

/* Owner, members of their Circle, and volunteers once it has been escalated. */
export function pauseRole(db, row, req) {
  if (row.client_id === req.clientId) return 'owner';
  if (row.circle_id && req.clientId && membership(db, row.circle_id, req.clientId)) return 'circle';
  if (req.volunteer && row.stage === 'volunteer') return 'volunteer';
  return null;
}

export function serializePause(db, row, req) {
  const messages = db.prepare('SELECT sender, name, body, created_at FROM pause_messages WHERE pause_id = ? ORDER BY id').all(row.id);
  const responder = row.responder ? JSON.parse(row.responder) : null;
  const circle = row.circle_id ? getCircle(db, row.circle_id) : null;
  return {
    id: row.id,
    created: row.created_at,
    name: row.name,
    town: row.town,
    signs: JSON.parse(row.signs),
    caller: row.caller,
    note: row.note,
    stage: row.stage,
    status: row.status,
    outcome: row.outcome,
    responder: responder && { name: responder.name, kind: responder.kind, detail: responder.detail },
    escalated: row.escalated_at,
    responded: row.responded_at,
    resolved: row.resolved_at,
    circleSize: circle ? memberClients(db, circle.id).length : 0,
    role: pauseRole(db, row, req),
    messages: messages.map(m => ({ from: m.sender, name: m.name, body: m.body, at: m.created_at }))
  };
}

export function addPauseMessage(db, pauseId, sender, name, body) {
  db.prepare('INSERT INTO pause_messages (pause_id, sender, name, body, created_at) VALUES (?, ?, ?, ?, ?)')
    .run(pauseId, sender, name, body, nowIso());
}

const COLUMNS = new Set(['signs', 'caller', 'note', 'stage', 'status', 'outcome', 'responder', 'escalated_at', 'responded_at', 'resolved_at']);
const JSON_COLUMNS = new Set(['signs', 'responder']);

export function updatePause(db, id, fields) {
  const keys = Object.keys(fields).filter(k => COLUMNS.has(k));
  if (!keys.length) return;
  const values = keys.map(k => (JSON_COLUMNS.has(k) && fields[k] != null ? JSON.stringify(fields[k]) : fields[k]));
  db.prepare(`UPDATE pauses SET ${keys.map(k => k + ' = ?').join(', ')} WHERE id = ?`).run(...values, id);
}

/* First person to step in becomes the responder; the escalation clock stops. */
export function claimPause(db, row, responder) {
  if (row.responder) return false;
  updatePause(db, row.id, { responder, responded_at: nowIso() });
  return true;
}

/* The resident, everyone in their Circle, and volunteers if it's escalated. */
export function notifyPause(db, hub, row, kind, extra = {}) {
  const fresh = getPauseRow(db, row.id) || row;
  const audience = new Set([fresh.client_id, ...(fresh.circle_id ? memberClients(db, fresh.circle_id) : [])]);
  hub.send('pause', { id: fresh.id, kind, name: fresh.name, ...extra },
    c => audience.has(c.clientId) || (!!c.volunteer && fresh.stage === 'volunteer'));
}

/* Starts the escalation clock for open pauses still waiting on the Circle,
   including any left open when the server last stopped. */
export function createPauseWatch({ db, hub, bot, delayMs }) {
  const timers = new Map();

  function escalate(id) {
    clearTimeout(timers.get(id));
    timers.delete(id);
    const row = getPauseRow(db, id);
    if (!row || row.status !== 'open' || row.stage !== 'circle' || row.responder) return;
    updatePause(db, id, { stage: 'volunteer', escalated_at: nowIso() });
    addPauseMessage(db, id, 'system', null, 'No one in the Circle has answered yet, so volunteers near you have been alerted too.');
    notifyPause(db, hub, row, 'escalated');
    bot.onPauseEscalated(id);
  }

  function schedule(row) {
    if (timers.has(row.id)) return;
    const wait = Math.max(0, new Date(row.created_at).getTime() + delayMs - Date.now());
    const t = setTimeout(() => {
      try { escalate(row.id); } catch (err) { console.error('[pause]', err); }
    }, wait);
    t.unref?.();
    timers.set(row.id, t);
  }

  db.prepare("SELECT * FROM pauses WHERE status = 'open' AND stage = 'circle' AND responder IS NULL").all().forEach(schedule);

  return {
    delayMs,
    schedule,
    escalateNow: escalate,
    // A resident with no Circle yet goes straight to volunteers.
    onVolunteerStage: id => bot.onPauseEscalated(id),
    stop() {
      timers.forEach(clearTimeout);
      timers.clear();
    }
  };
}
