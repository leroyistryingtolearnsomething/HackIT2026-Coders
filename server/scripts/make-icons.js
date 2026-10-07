/* Draws the home-screen icons (a house with pause bars, the Pause button's
   chili red) and writes them to icons/. Run from the project root:
     node server/scripts/make-icons.js
   No image libraries: the shapes are rasterised here and saved with zlib. */
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import { WEB_ROOT } from '../src/config.js';

const BG = [0x96, 0x2f, 0x1f];   // --color-accent-2-700, chili
const FG = [0xf6, 0xf0, 0xe4];   // --color-bg, kopitiam cream

// The logo on a 32-unit grid (same paths as the <svg> in index.html), with pause bars inside.
const STROKE = 2.4;
const LINES = [
  [[5, 15.5], [16, 6.5], [27, 15.5]],              // roof
  [[8.5, 13], [8.5, 25.5], [23.5, 25.5], [23.5, 13]] // walls
];
const BARS = [[12.6, 15.5, 2.6, 7.5], [16.8, 15.5, 2.6, 7.5]]; // x, y, w, h

function distToSegment(px, py, [ax, ay], [bx, by]) {
  const dx = bx - ax, dy = by - ay;
  const t = Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / (dx * dx + dy * dy)));
  return Math.hypot(px - (ax + t * dx), py - (ay + t * dy));
}

function inRoundRect(px, py, [x, y, w, h], r = 0.8) {
  const cx = Math.max(x + r, Math.min(px, x + w - r));
  const cy = Math.max(y + r, Math.min(py, y + h - r));
  return Math.hypot(px - cx, py - cy) <= r;
}

function inShape(u, v) {
  for (const line of LINES) {
    for (let i = 0; i < line.length - 1; i++) {
      if (distToSegment(u, v, line[i], line[i + 1]) <= STROKE / 2) return true;
    }
  }
  return BARS.some(b => inRoundRect(u, v, b));
}

/* fill = how much of the icon the 32-unit drawing spans (smaller for maskable icons). */
function render(size, fill) {
  const scale = size / 32 * fill;
  const offset = (size - 32 * scale) / 2;
  const SS = 4; // 4x4 supersampling for smooth edges
  const rows = [];
  for (let y = 0; y < size; y++) {
    const row = Buffer.alloc(1 + size * 3); // filter byte + RGB
    for (let x = 0; x < size; x++) {
      let hit = 0;
      for (let sy = 0; sy < SS; sy++) {
        for (let sx = 0; sx < SS; sx++) {
          const u = (x + (sx + 0.5) / SS - offset) / scale;
          const v = (y + (sy + 0.5) / SS - offset) / scale - 0.6; // nudge down to centre the house
          if (inShape(u, v)) hit++;
        }
      }
      const a = hit / (SS * SS);
      for (let c = 0; c < 3; c++) row[1 + x * 3 + c] = Math.round(BG[c] + (FG[c] - BG[c]) * a);
    }
    rows.push(row);
  }
  return png(size, size, Buffer.concat(rows));
}

const CRC_TABLE = Array.from({ length: 256 }, (_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});
const crc32 = buf => {
  let c = 0xffffffff;
  for (const b of buf) c = CRC_TABLE[(c ^ b) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
};
function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([len, body, crc]);
}
function png(w, h, raw) {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0);
  ihdr.writeUInt32BE(h, 4);
  ihdr[8] = 8; ihdr[9] = 2; // 8-bit RGB
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', zlib.deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0))
  ]);
}

const out = path.join(WEB_ROOT, 'icons');
fs.mkdirSync(out, { recursive: true });
const icons = {
  'icon-192.png': [192, 0.86],
  'icon-512.png': [512, 0.86],
  'icon-maskable-512.png': [512, 0.62], // Android crops these to a circle or squircle
  'apple-touch-icon.png': [180, 0.8]
};
for (const [name, [size, fill]] of Object.entries(icons)) {
  fs.writeFileSync(path.join(out, name), render(size, fill));
  console.log('wrote icons/' + name);
}
