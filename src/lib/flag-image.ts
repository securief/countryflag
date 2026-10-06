import { cacheKey, cached } from './cache';
import { normalizeCountryCode } from './country-codes';

/**
 * Country flags come from flagsapi.com and are stored as base64, so every
 * country is downloaded once per install and later visits work offline.
 *
 * The emoji is deliberately *not* used as the primary source: platforms like
 * Windows render regional indicators as letters instead of a flag.
 */
const FLAG_CDN = 'https://flagsapi.com';

/**
 * `flat` is the plain style; the size is the square canvas the flag is centred
 * in, so a 4:3 flag ends up roughly 24x18 with transparent padding. Flat art
 * stays tiny - around 250 characters of base64 per country.
 */
const FLAG_STYLE = 'flat';
const FLAG_SIZE = 24;

const FLAG_EXTENSION = 'png';

/** Flags barely change: a year is effectively "forever" for a cached install. */
const FLAG_TTL_MS = 365 * 24 * 60 * 60 * 1000;

export const FLAG_MIME = `image/${FLAG_EXTENSION}`;

/** `https://flagsapi.com/US/flat/24.png` - the code has to be uppercase. */
export function flagImageUrl(code: string): string | null {
  const normalized = normalizeCountryCode(code);
  return normalized
    ? `${FLAG_CDN}/${normalized}/${FLAG_STYLE}/${FLAG_SIZE}.${FLAG_EXTENSION}`
    : null;
}

/**
 * Base64 of a country's flag, or `null` when it cannot be loaded (offline,
 * blocked, unknown country). Failures are not cached, so they are retried.
 */
export async function getFlagData(code: string): Promise<string | null> {
  const normalized = normalizeCountryCode(code);
  const url = flagImageUrl(code);
  if (normalized === null || url === null) return null;

  // The style and size are part of the key, so changing them never serves a
  // stale image.
  const key = cacheKey('flag', `${FLAG_STYLE}:${FLAG_SIZE}:${FLAG_EXTENSION}:${normalized}`);

  try {
    return await cached<string>(key, FLAG_TTL_MS, async () => {
      const response = await fetch(url);
      if (!response.ok) throw new Error(`Flag download failed with status ${response.status}`);
      return toBase64(await response.arrayBuffer());
    });
  } catch {
    return null;
  }
}

/** `data:` URL, ready for an `<img>` element. */
export function flagDataUrl(base64: string): string {
  return `data:${FLAG_MIME};base64,${base64}`;
}

/** Decodes the cached base64 into bytes for canvas rendering. */
export function flagDataToBytes(base64: string): Uint8Array<ArrayBuffer> {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }
  return bytes;
}

/** `btoa` exists in service workers too, `FileReader` does not. */
function toBase64(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  let binary = '';

  for (let index = 0; index < bytes.length; index += 0x8000) {
    binary += String.fromCharCode(...bytes.subarray(index, index + 0x8000));
  }
  return btoa(binary);
}
