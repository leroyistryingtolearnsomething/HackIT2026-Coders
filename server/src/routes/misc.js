import crypto from 'node:crypto';
import { Router } from 'express';
import { requireClient, handleFor, hashToken, rateLimit } from '../auth.js';
import { KW, TOWNS } from '../shared.js';
import { text, oneOf, HttpError, nowIso } from '../http.js';
import { VOLUNTEER_COURSES, passedCourses } from './learn.js';

const ROLES = ['Digital Ambassador', 'RC Volunteer', 'Student Volunteer', 'CC Scam-Buster'];

export default function miscRouter({ db, hub, config, bot, assistant }) {
  const r = Router();

  r.get('/health', (req, res) => res.json({ ok: true, time: nowIso() }));

  r.get('/config', (req, res) => res.json({
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

  /* Becoming a volunteer takes two steps, so residents know volunteers are real and trained:
     1. confirm who you are (Singpass in a real launch; a demo stand-in here), and
     2. pass every Intermediate course in Learn (the server marks the quizzes). */
  function volunteerSteps(clientId) {
    const identity = db.prepare('SELECT name, method, verified_at FROM identity_checks WHERE client_id = ?').get(clientId);
    const passed = passedCourses(db, clientId);
    const courses = VOLUNTEER_COURSES.map(c => ({ id: c.id, title: c.title, passed: passed.includes(c.id) }));
    return {
      identity: identity ? { name: identity.name, method: identity.method, verifiedAt: identity.verified_at } : null,
      courses,
      ready: Boolean(identity) && courses.every(c => c.passed)
    };
  }

  r.get('/volunteer/steps', requireClient, (req, res) => res.json(volunteerSteps(req.clientId)));

  /* Demo only: a real launch would send the volunteer to Singpass and take the name it returns. */
  r.post('/volunteer/verify', requireClient, rateLimit({ max: 10 }), (req, res) => {
    const name = text(req.body?.name, 'name', { min: 2, max: 40 });
    db.prepare(`INSERT INTO identity_checks (client_id, name, method, verified_at) VALUES (?, ?, 'singpass-demo', ?)
      ON CONFLICT (client_id) DO UPDATE SET name = excluded.name, method = excluded.method, verified_at = excluded.verified_at`)
      .run(req.clientId, name, nowIso());
    res.json(volunteerSteps(req.clientId));
  });

  r.post('/volunteer/login', requireClient, rateLimit({ max: 10 }), (req, res) => {
    const b = req.body || {};
    const steps = volunteerSteps(req.clientId);
    if (!steps.identity) throw new HttpError(403, 'Please confirm who you are with Singpass first.');
    const missing = steps.courses.filter(c => !c.passed);
    if (missing.length) throw new HttpError(403, `Please pass these Learn courses first: ${missing.map(c => c.title).join(', ')}.`);
    const volunteer = {
      name: steps.identity.name, // the verified name, not one typed at sign-in
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

  /* The same updates by polling, for networks that hold the stream back.
     Without ?after it just returns the latest event id to start from. */
  r.get('/events/poll', requireClient, (req, res) => {
    const after = Number(req.query.after);
    if (!Number.isInteger(after) || after < 0) return res.json({ last: hub.lastId(), events: [] });
    res.json(hub.since(after, { clientId: req.clientId, volunteer: req.volunteer }));
  });

  return r;
}
