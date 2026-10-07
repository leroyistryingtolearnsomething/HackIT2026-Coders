import crypto from 'node:crypto';
import { Router } from 'express';
import { requireClient, handleFor, hashToken, codeMatches, rateLimit } from '../auth.js';
import { KW, TOWNS } from '../shared.js';
import { text, oneOf, HttpError, nowIso } from '../http.js';

const ROLES = ['Digital Ambassador', 'RC Volunteer', 'Student Volunteer', 'CC Scam-Buster'];

export default function miscRouter({ db, hub, config, bot, assistant }) {
  const r = Router();

  r.get('/health', (req, res) => res.json({ ok: true, time: nowIso() }));

  r.get('/config', (req, res) => res.json({
    usingDefaultCode: config.usingDefaultCode,
    autoReply: bot.enabled,
    assistant: Boolean(assistant),
    assistantProvider: assistant ? assistant.name : null,
    volunteerRoles: ROLES
  }));

  r.get('/me', requireClient, (req, res) => res.json({
    clientId: req.clientId,
    handle: handleFor(req.clientId),
    volunteer: req.volunteer && { name: req.volunteer.name, role: req.volunteer.role, area: req.volunteer.area }
  }));

  r.get('/stats', (req, res) => {
    const weekAgo = new Date(Date.now() - 7 * 86400e3).toISOString();
    const week = db.prepare(`
      SELECT COUNT(*) AS reports,
        COALESCE(SUM(base_count + (SELECT COUNT(*) FROM report_confirms c WHERE c.report_id = r.id)), 0) AS residents
      FROM reports r WHERE created_at >= ?`).get(weekAgo);
    const answered = db.prepare("SELECT COUNT(*) AS n FROM cases WHERE status != 'waiting'").get().n
      + db.prepare("SELECT COUNT(*) AS n FROM comments WHERE author_role = 'Volunteer'").get().n;
    res.json({
      reportsThisWeek: week.reports,
      residentsFlagged: week.residents,
      questionsAnswered: answered,
      posts: db.prepare('SELECT COUNT(*) AS n FROM posts').get().n,
      // The simulated volunteer pool counts as "online" while auto-reply is on.
      volunteersOnline: hub.volunteersOnline() + (bot.enabled ? KW.VOLUNTEERS.length : 0)
    });
  });

  /* Volunteers sign in with the shared access code. */
  r.post('/volunteer/login', rateLimit({ max: 10 }), (req, res) => {
    const b = req.body || {};
    if (!codeMatches(b.code, config.volunteerCode)) throw new HttpError(401, 'That access code is not correct');
    const volunteer = {
      name: text(b.name, 'name', { min: 2, max: 40 }),
      role: oneOf(b.role, ROLES, 'role'),
      area: oneOf(b.area, TOWNS, 'area')
    };
    const token = crypto.randomBytes(32).toString('hex');
    const expires = new Date(Date.now() + config.sessionHours * 3600e3).toISOString();
    db.prepare('DELETE FROM volunteer_sessions WHERE expires_at < ?').run(nowIso());
    db.prepare('INSERT INTO volunteer_sessions (token_hash, name, role, area, created_at, expires_at) VALUES (?, ?, ?, ?, ?, ?)')
      .run(hashToken(token), volunteer.name, volunteer.role, volunteer.area, nowIso(), expires);
    res.status(201).json({ token, volunteer, expires });
  });

  r.delete('/volunteer/session', (req, res) => {
    if (req.volunteer) db.prepare('DELETE FROM volunteer_sessions WHERE token_hash = ?').run(req.volunteer.tokenHash);
    res.status(204).end();
  });

  /* Live updates (Server-Sent Events). */
  r.get('/events', requireClient, (req, res) => hub.connect(req, res));

  return r;
}
