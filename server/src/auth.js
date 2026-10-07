/* Identity for the prototype:
   - Residents are anonymous. The browser generates a random client id and sends
     it as the X-Client-Id header, so "my cases" and votes follow that browser.
   - Volunteers log in with a shared access code and get a session token. */
import crypto from 'node:crypto';
import { HttpError, nowIso } from './http.js';

const CLIENT_ID = /^[A-Za-z0-9-]{8,64}$/;

export const hashToken = token => crypto.createHash('sha256').update(token).digest('hex');

export function handleFor(clientId) {
  const n = parseInt(crypto.createHash('sha256').update(clientId).digest('hex').slice(0, 8), 16);
  return 'Resident-' + (1000 + (n % 9000));
}

export function identify(db) {
  const findSession = db.prepare('SELECT name, role, area, expires_at FROM volunteer_sessions WHERE token_hash = ?');
  return (req, res, next) => {
    // EventSource can't send headers, so /api/events passes these as query params.
    const rawClient = req.get('X-Client-Id') || req.query.clientId;
    req.clientId = typeof rawClient === 'string' && CLIENT_ID.test(rawClient) ? rawClient : null;

    const auth = req.get('Authorization') || '';
    const token = auth.startsWith('Bearer ') ? auth.slice(7) : (typeof req.query.token === 'string' ? req.query.token : '');
    req.volunteer = null;
    if (token) {
      const row = findSession.get(hashToken(token));
      if (row && row.expires_at > nowIso()) {
        req.volunteer = { name: row.name, role: row.role, area: row.area, tokenHash: hashToken(token) };
      }
    }
    next();
  };
}

export function requireClient(req, res, next) {
  if (!req.clientId) return next(new HttpError(400, 'Missing or invalid X-Client-Id header'));
  next();
}

export function requireVolunteer(req, res, next) {
  if (!req.volunteer) return next(new HttpError(401, 'Volunteer login required'));
  next();
}

/* Constant-time comparison of the volunteer access code. */
export function codeMatches(given, expected) {
  const a = crypto.createHash('sha256').update(String(given || '')).digest();
  const b = crypto.createHash('sha256').update(String(expected)).digest();
  return crypto.timingSafeEqual(a, b);
}

/* Simple in-memory sliding-window limiter for write requests. */
export function rateLimit({ max, windowMs = 60_000, methods = ['POST', 'PUT', 'PATCH', 'DELETE'] }) {
  const hits = new Map();
  const sweep = setInterval(() => {
    const cutoff = Date.now() - windowMs;
    for (const [key, times] of hits) if (!times.some(t => t > cutoff)) hits.delete(key);
  }, windowMs);
  sweep.unref();

  return (req, res, next) => {
    if (!methods.includes(req.method)) return next();
    const key = req.clientId || req.ip;
    const now = Date.now();
    const times = (hits.get(key) || []).filter(t => now - t < windowMs);
    if (times.length >= max) return next(new HttpError(429, 'Too many requests — please slow down and try again in a minute.'));
    times.push(now);
    hits.set(key, times);
    next();
  };
}
