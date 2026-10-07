import { nowIso } from '../http.js';

export function getCaseRow(db, id) {
  return db.prepare('SELECT * FROM cases WHERE id = ?').get(id);
}

export function serializeCase(db, row, viewer) {
  const messages = db.prepare('SELECT sender, name, body, created_at FROM case_messages WHERE case_id = ? ORDER BY id').all(row.id);
  const volunteer = row.volunteer ? JSON.parse(row.volunteer) : null;
  return {
    id: row.id,
    created: row.created_at,
    channel: row.channel,
    text: row.text,
    image: row.image,
    flags: JSON.parse(row.flags),
    level: row.level,
    status: row.status,
    verdict: row.verdict,
    volunteer: volunteer && { name: volunteer.name, role: volunteer.role, area: volunteer.area },
    callback: row.callback ? JSON.parse(row.callback) : null,
    shared: row.shared_post,
    mine: row.client_id === viewer.clientId,
    messages: messages.map(m => ({ from: m.sender, name: m.name, body: m.body, at: m.created_at }))
  };
}

export function canView(row, req) {
  return !!req.volunteer || row.client_id === req.clientId;
}

export function addMessage(db, caseId, sender, name, body) {
  db.prepare('INSERT INTO case_messages (case_id, sender, name, body, created_at) VALUES (?, ?, ?, ?, ?)')
    .run(caseId, sender, name, body, nowIso());
}

const COLUMNS = new Set(['status', 'verdict', 'volunteer', 'shared_post']);

export function updateCase(db, id, fields) {
  const keys = Object.keys(fields).filter(k => COLUMNS.has(k));
  if (!keys.length) return;
  const values = keys.map(k => (k === 'volunteer' && fields[k] ? JSON.stringify(fields[k]) : fields[k]));
  db.prepare(`UPDATE cases SET ${keys.map(k => k + ' = ?').join(', ')} WHERE id = ?`).run(...values, id);
}

/* Tell the resident who owns the case, and all volunteers, that it changed. */
export function notifyCase(hub, row, kind, extra = {}) {
  hub.send('case', { id: row.id, kind, ...extra }, c => !!c.volunteer || c.clientId === row.client_id);
}
