/**
 * Generates `public/icon/{16,32,48,128}.png` (rounded blue square + white
 * internet globe) with no image dependency: the PNG is written by hand with
 * `node:zlib` and 4x supersampling for clean anti-aliased edges.
 *
 *   npm run icons
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { deflateSync } from 'node:zlib';

const SIZES = [16, 32, 48, 128];
const SUPERSAMPLE = 4;
const SAMPLES_PER_PIXEL = SUPERSAMPLE * SUPERSAMPLE;

const BACKGROUND = [37, 99, 235]; // #2563eb
const FOREGROUND = [255, 255, 255];

const GLOBE_CENTER = 0.5;
const GLOBE_RADIUS = 0.315;
const HALF_STROKE = 0.029;
const PNG_SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
const CRC_TABLE = buildCrcTable();

const outputDir = join(dirname(fileURLToPath(import.meta.url)), '..', 'public', 'icon');

mkdirSync(outputDir, { recursive: true });

for (const size of SIZES) {
  const png = encodePng(size, size, renderIcon(size));
  writeFileSync(join(outputDir, `${size}.png`), png);
  console.log(`public/icon/${size}.png  (${png.length} bytes)`);
}

/** Draws one icon: coordinates are normalized to 0..1, y grows downwards. */
function renderIcon(size) {
  const pixels = Buffer.alloc(size * size * 4);
  // Small sizes need a thicker stroke, otherwise the ring smears into mush.
  const halfStroke = Math.max(HALF_STROKE, 0.7 / size);

  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      let red = 0;
      let green = 0;
      let blue = 0;
      let covered = 0;

      for (let subY = 0; subY < SUPERSAMPLE; subY += 1) {
        for (let subX = 0; subX < SUPERSAMPLE; subX += 1) {
          const color = sample(
            (x + (subX + 0.5) / SUPERSAMPLE) / size,
            (y + (subY + 0.5) / SUPERSAMPLE) / size,
            halfStroke,
          );
          if (!color) continue;

          red += color[0];
          green += color[1];
          blue += color[2];
          covered += 1;
        }
      }

      const offset = (y * size + x) * 4;
      if (covered === 0) continue;

      pixels[offset] = Math.round(red / covered);
      pixels[offset + 1] = Math.round(green / covered);
      pixels[offset + 2] = Math.round(blue / covered);
      pixels[offset + 3] = Math.round((covered / SAMPLES_PER_PIXEL) * 255);
    }
  }

  return pixels;
}

/** Color of a single sub-sample, or `null` for fully transparent. */
function sample(x, y, halfStroke) {
  if (!inRoundedRect(x, y, 0, 0, 1, 1, 0.22)) return null;
  return isGlobe(x, y, halfStroke) ? FOREGROUND : BACKGROUND;
}

/**
 * Internet globe: an outer ring, the equator and one vertical meridian - the
 * shapes stay readable down to 16px.
 */
function isGlobe(x, y, halfStroke) {
  const dx = x - GLOBE_CENTER;
  const dy = y - GLOBE_CENTER;
  const radius = Math.hypot(dx, dy);

  if (Math.abs(radius - GLOBE_RADIUS) <= halfStroke) return true; // Outer ring.
  if (Math.abs(dy) <= halfStroke && Math.abs(dx) <= GLOBE_RADIUS) return true; // Equator.

  return inEllipseRing(x, y, GLOBE_RADIUS * 0.45, GLOBE_RADIUS, halfStroke); // Meridian.
}

function inEllipseRing(x, y, radiusX, radiusY, halfStroke) {
  const dx = x - GLOBE_CENTER;
  const dy = y - GLOBE_CENTER;

  const normalized = Math.hypot(dx / radiusX, dy / radiusY);
  if (normalized === 0) return false;

  // First-order distance to the ellipse curve: |q - 1| / |grad f|.
  const gradient = Math.hypot(dx / (radiusX * radiusX), dy / (radiusY * radiusY)) / normalized;
  return Math.abs(normalized - 1) / gradient <= halfStroke;
}

function inRoundedRect(x, y, left, top, right, bottom, radius) {
  const nearestX = Math.min(Math.max(x, left + radius), right - radius);
  const nearestY = Math.min(Math.max(y, top + radius), bottom - radius);
  return Math.hypot(x - nearestX, y - nearestY) <= radius;
}

function encodePng(width, height, rgba) {
  const stride = width * 4;
  const raw = Buffer.alloc((stride + 1) * height);

  for (let y = 0; y < height; y += 1) {
    raw[y * (stride + 1)] = 0; // Filter type: none.
    rgba.copy(raw, y * (stride + 1) + 1, y * stride, (y + 1) * stride);
  }

  const header = Buffer.alloc(13);
  header.writeUInt32BE(width, 0);
  header.writeUInt32BE(height, 4);
  header[8] = 8; // Bit depth.
  header[9] = 6; // Color type: RGBA.

  return Buffer.concat([
    PNG_SIGNATURE,
    createChunk('IHDR', header),
    createChunk('IDAT', deflateSync(raw, { level: 9 })),
    createChunk('IEND', Buffer.alloc(0)),
  ]);
}

function createChunk(type, data) {
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length);

  const body = Buffer.concat([Buffer.from(type, 'latin1'), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));

  return Buffer.concat([length, body, crc]);
}

function buildCrcTable() {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n += 1) {
    let value = n;
    for (let bit = 0; bit < 8; bit += 1) {
      value = value & 1 ? 0xedb88320 ^ (value >>> 1) : value >>> 1;
    }
    table[n] = value >>> 0;
  }
  return table;
}

function crc32(buffer) {
  let crc = 0xffffffff;
  for (const byte of buffer) crc = CRC_TABLE[(crc ^ byte) & 0xff] ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}
