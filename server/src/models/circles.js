/* Kampung Circle: a resident's family and trusted neighbours. */
import crypto from 'node:crypto';

// No 0/O or 1/I/L, so codes are easy to read out over the phone.
const CODE_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';

export function newInviteCode(db) {
  for (;;) {
    const code = Array.from(crypto.randomBytes(6), b => CODE_ALPHABET[b % CODE_ALPHABET.length]).join('');
    if (!db.prepare('SELECT 1 FROM circles WHERE invite_code = ?').get(code)) return code;
  }
}

export const normaliseCode = code => String(code || '').toUpperCase().replace(/[^A-Z0-9]/g, '');

export function circleOf(db, clientId) {
  return db.prepare('SELECT * FROM circles WHERE owner_client = ?').get(clientId);
}

export function getCircle(db, id) {
  return db.prepare('SELECT * FROM circles WHERE id = ?').get(id);
}

export function membership(db, circleId, clientId) {
  return db.prepare('SELECT * FROM circle_members WHERE circle_id = ? AND client_id = ?').get(circleId, clientId);
}

export function memberClients(db, circleId) {
  return db.prepare('SELECT client_id FROM circle_members WHERE circle_id = ?').all(circleId).map(r => r.client_id);
}

export function serializeMember(m) {
  return { id: m.id, name: m.name, relation: m.relation, joined: m.joined_at };
}

/* Everyone who should hear about something in this circle: the owner and every member. */
export function circleAudience(db, circleId) {
  const circle = getCircle(db, circleId);
  if (!circle) return new Set();
  return new Set([circle.owner_client, ...memberClients(db, circleId)]);
}
