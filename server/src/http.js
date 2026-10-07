/* Small helpers for errors and request validation. */
import crypto from 'node:crypto';

export class HttpError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

export const badRequest = msg => new HttpError(400, msg);
export const notFound = (what = 'Not found') => new HttpError(404, what);
export const forbidden = (msg = 'You can’t do that') => new HttpError(403, msg);

export const newId = prefix => prefix + crypto.randomBytes(6).toString('hex');
export const nowIso = () => new Date().toISOString();

export function text(value, field, { min = 0, max = 2000 } = {}) {
  const v = value == null ? '' : String(value).trim();
  if (v.length < min) throw badRequest(min <= 1 ? `${field} is required` : `${field} must be at least ${min} characters`);
  if (v.length > max) throw badRequest(`${field} is too long (max ${max} characters)`);
  return v;
}

export function oneOf(value, list, field) {
  if (!list.includes(value)) throw badRequest(`${field} must be one of: ${list.join(', ')}`);
  return value;
}

export function voteValue(value) {
  const v = Number(value);
  if (![-1, 0, 1].includes(v)) throw badRequest('value must be -1, 0 or 1');
  return v;
}

/* Escape user input for use inside a LIKE pattern (with ESCAPE '\'). */
export const likePattern = q => '%' + q.replace(/[\\%_]/g, c => '\\' + c) + '%';
