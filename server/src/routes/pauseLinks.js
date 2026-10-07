/* Emergency link: a private link that can only press Pause for the resident who made it.
   It lets an iPhone Back Tap or Siri shortcut press Pause even though the shortcut
   opens Safari, which doesn't share the home-screen app's identity. The link can't
   read anything else. The token travels in the request body (never in a URL the
   server or a proxy would log), and only its hash is stored. */
import crypto from 'node:crypto';
import { Router } from 'express';
import { requireClient, hashToken, rateLimit } from '../auth.js';
import { notFound, nowIso } from '../http.js';
import { openPauseOf, pressPause } from '../models/pauses.js';
import { circleOf, memberClients } from '../models/circles.js';

const TOKEN = /^[A-Za-z0-9_-]{20,100}$/;

export default function pauseLinksRouter(ctx) {
  const { db } = ctx;
  const r = Router();

  const ownerOf = token => {
    if (typeof token !== 'string' || !TOKEN.test(token)) return null;
    const row = db.prepare('SELECT client_id FROM pause_links WHERE token_hash = ?').get(hashToken(token));
    return row ? row.client_id : null;
  };

  /* What the person who opened the link may see: who will be (or was) alerted, and whether someone is coming. */
  function status(clientId) {
    const circle = circleOf(db, clientId);
    const people = circle
      ? db.prepare('SELECT name FROM circle_members WHERE circle_id = ? ORDER BY joined_at').all(circle.id).map(m => m.name)
      : [];
    const open = openPauseOf(db, clientId);
    const responder = open && open.responder ? JSON.parse(open.responder) : null;
    return {
      name: circle ? circle.owner_name : null,
      people,
      pause: open ? {
        created: open.created_at,
        stage: open.stage,
        responder: responder && { name: responder.name, detail: responder.detail }
      } : null
    };
  }

  /* Does this browser have a link? (The link itself is only shown when it's made.) */
  r.get('/', requireClient, (req, res) => {
    res.json({ active: !!db.prepare('SELECT 1 FROM pause_links WHERE client_id = ?').get(req.clientId) });
  });

  /* Make a link, or a new one: the old link stops working straight away. */
  r.post('/', requireClient, (req, res) => {
    const token = crypto.randomBytes(24).toString('base64url');
    db.prepare('DELETE FROM pause_links WHERE client_id = ?').run(req.clientId);
    db.prepare('INSERT INTO pause_links (token_hash, client_id, created_at) VALUES (?, ?, ?)')
      .run(hashToken(token), req.clientId, nowIso());
    res.status(201).json({ token });
  });

  r.delete('/', requireClient, (req, res) => {
    db.prepare('DELETE FROM pause_links WHERE client_id = ?').run(req.clientId);
    res.status(204).end();
  });

  // Tighter limit, so tokens can't be guessed (they're 24 random bytes anyway).
  const linkLimit = rateLimit({ max: 20 });

  r.post('/status', linkLimit, (req, res) => {
    const clientId = ownerOf(req.body?.token);
    if (!clientId) throw notFound('This emergency link no longer works. Make a new one in Kampung Watch.');
    res.json(status(clientId));
  });

  r.post('/press', linkLimit, (req, res) => {
    const clientId = ownerOf(req.body?.token);
    if (!clientId) throw notFound('This emergency link no longer works. Make a new one in Kampung Watch.');
    const circle = circleOf(db, clientId);
    const { created } = pressPause(ctx, clientId);
    res.status(created ? 201 : 200).json({
      ...status(clientId),
      alerted: circle && memberClients(db, circle.id).length ? 'circle' : 'volunteers'
    });
  });

  return r;
}
