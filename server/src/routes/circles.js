/* Kampung Circle: set up your Circle, invite family with a code, or join someone else's. */
import { Router } from 'express';
import { requireClient, rateLimit } from '../auth.js';
import { KW, TOWNS } from '../shared.js';
import { text, oneOf, notFound, badRequest, forbidden, HttpError, newId, nowIso } from '../http.js';
import { circleOf, getCircle, membership, newInviteCode, normaliseCode, serializeMember } from '../models/circles.js';
import { openPauseOf, serializePause } from '../models/pauses.js';
import { serializeDrill, drillStats } from '../models/drills.js';

const MAX_MEMBERS = 8;

export default function circlesRouter({ db, hub }) {
  const r = Router();
  r.use(requireClient);

  const recentDrills = (circleId, req) => db.prepare('SELECT * FROM drills WHERE circle_id = ? ORDER BY created_at DESC LIMIT 5')
    .all(circleId).map(row => serializeDrill(row, req));

  function circleStats(circleId) {
    const row = db.prepare(`SELECT COUNT(*) AS answered, COALESCE(SUM(result != 'clicked'), 0) AS passed
      FROM drills WHERE circle_id = ? AND result IS NOT NULL`).get(circleId);
    return { answered: row.answered, passed: row.passed };
  }

  function view(req) {
    const own = circleOf(db, req.clientId);
    const mine = own && {
      id: own.id,
      name: own.owner_name,
      town: own.town,
      inviteCode: own.invite_code,
      members: db.prepare('SELECT * FROM circle_members WHERE circle_id = ? ORDER BY joined_at').all(own.id).map(serializeMember),
      drills: recentDrills(own.id, req),
      drillStats: circleStats(own.id)
    };
    const guarding = db.prepare(`SELECT m.id AS member_id, m.relation, c.* FROM circle_members m
      JOIN circles c ON c.id = m.circle_id WHERE m.client_id = ? ORDER BY m.joined_at`).all(req.clientId)
      .map(row => {
        const open = openPauseOf(db, row.owner_client);
        return {
          circleId: row.id,
          memberId: row.member_id,
          name: row.owner_name,
          town: row.town,
          relation: row.relation,
          openPause: open ? serializePause(db, open, req) : null,
          drills: recentDrills(row.id, req),
          drillStats: circleStats(row.id)
        };
      });
    return { mine, guarding, townStats: mine ? drillStats(db, mine.town) : null };
  }

  r.get('/me', (req, res) => res.json(view(req)));

  /* Create your Circle, or change your name or town. */
  r.post('/', (req, res) => {
    const b = req.body || {};
    const name = text(b.name, 'name', { min: 1, max: 40 });
    const town = oneOf(b.town, TOWNS, 'town');
    const own = circleOf(db, req.clientId);
    if (own) {
      db.prepare('UPDATE circles SET owner_name = ?, town = ? WHERE id = ?').run(name, town, own.id);
    } else {
      db.prepare('INSERT INTO circles (id, owner_client, owner_name, town, invite_code, created_at) VALUES (?, ?, ?, ?, ?, ?)')
        .run(newId('o'), req.clientId, name, town, newInviteCode(db), nowIso());
    }
    res.status(own ? 200 : 201).json(view(req));
  });

  /* A new code, so an old one that was shared too widely stops working. */
  r.post('/code', (req, res) => {
    const own = circleOf(db, req.clientId);
    if (!own) throw notFound('Set up your Circle first');
    db.prepare('UPDATE circles SET invite_code = ? WHERE id = ?').run(newInviteCode(db), own.id);
    res.json(view(req));
  });

  /* Family join with the 6-letter code. Limited, so codes can't be guessed. */
  r.post('/join', rateLimit({ max: 10 }), (req, res) => {
    const b = req.body || {};
    const code = normaliseCode(b.code);
    if (code.length !== 6) throw badRequest('The Circle code has 6 letters and numbers');
    const circle = db.prepare('SELECT * FROM circles WHERE invite_code = ?').get(code);
    if (!circle) throw new HttpError(404, 'No Circle has that code. Check it with the person who sent it.');
    if (circle.owner_client === req.clientId) throw badRequest('That’s your own Circle code. Send it to your family instead.');
    const name = text(b.name, 'name', { min: 1, max: 40 });
    const relation = oneOf(b.relation, KW.RELATIONS, 'relation');
    if (membership(db, circle.id, req.clientId)) {
      db.prepare('UPDATE circle_members SET name = ?, relation = ? WHERE circle_id = ? AND client_id = ?').run(name, relation, circle.id, req.clientId);
    } else {
      const count = db.prepare('SELECT COUNT(*) AS n FROM circle_members WHERE circle_id = ?').get(circle.id).n;
      if (count >= MAX_MEMBERS) throw badRequest(`A Circle can have up to ${MAX_MEMBERS} people`);
      db.prepare('INSERT INTO circle_members (circle_id, client_id, name, relation, joined_at) VALUES (?, ?, ?, ?, ?)')
        .run(circle.id, req.clientId, name, relation, nowIso());
      hub.send('circle', { kind: 'joined', name, relation }, c => c.clientId === circle.owner_client);
    }
    res.status(201).json(view(req));
  });

  /* The owner removes someone, or a member leaves. */
  r.delete('/members/:id', (req, res) => {
    const m = db.prepare('SELECT * FROM circle_members WHERE id = ?').get(Number(req.params.id));
    const circle = m && getCircle(db, m.circle_id);
    if (!m || !circle) throw notFound('Member not found');
    if (circle.owner_client !== req.clientId && m.client_id !== req.clientId) throw forbidden();
    db.prepare('DELETE FROM circle_members WHERE id = ?').run(m.id);
    hub.send('circle', { kind: 'left' }, c => c.clientId === circle.owner_client || c.clientId === m.client_id);
    res.json(view(req));
  });

  return r;
}
