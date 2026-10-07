/* Uploaded screenshots arrive as data URLs (already resized in the browser)
   and are stored as files under DATA_DIR/uploads. */
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { badRequest } from './http.js';

const MAX_BYTES = 2 * 1024 * 1024;
const DATA_URL = /^data:image\/(jpeg|png|webp);base64,([A-Za-z0-9+/]+={0,2})$/;
const STORED = /^\/uploads\/([a-f0-9]{24}\.(?:jpg|png|webp))$/;

const MAGIC = {
  jpg: buf => buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff,
  png: buf => buf.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])),
  webp: buf => buf.subarray(0, 4).toString('ascii') === 'RIFF' && buf.subarray(8, 12).toString('ascii') === 'WEBP'
};

/* Checks an image data URL (type, size and real file signature) and decodes it. */
export function decodeImageDataUrl(input) {
  const m = typeof input === 'string' ? input.match(DATA_URL) : null;
  if (!m) throw badRequest('image must be a JPEG, PNG or WebP data URL');
  const ext = m[1] === 'jpeg' ? 'jpg' : m[1];
  const buf = Buffer.from(m[2], 'base64');
  if (buf.length > MAX_BYTES) throw badRequest('image is too large (max 2 MB)');
  if (!MAGIC[ext](buf)) throw badRequest('image data is not a valid ' + ext.toUpperCase());
  return { ext, mediaType: 'image/' + m[1], base64: m[2], buf };
}

export function createImageStore(dir) {
  fs.mkdirSync(dir, { recursive: true });
  return {
    dir,
    /* Returns a public /uploads/... path, or null when no image was given. */
    save(input) {
      if (input == null || input === '') return null;
      if (typeof input !== 'string') throw badRequest('image must be a data URL');

      // Re-using an image that was already uploaded (e.g. a case screenshot sent on to Scam Radar).
      const stored = input.match(STORED);
      if (stored) {
        if (fs.existsSync(path.join(dir, stored[1]))) return input;
        throw badRequest('That image no longer exists');
      }

      const { ext, buf } = decodeImageDataUrl(input);
      const name = crypto.randomBytes(12).toString('hex') + '.' + ext;
      fs.writeFileSync(path.join(dir, name), buf);
      return '/uploads/' + name;
    }
  };
}
