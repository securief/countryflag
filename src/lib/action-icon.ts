import { browser } from 'wxt/browser';
import { countryCodeToFlag } from './country-codes';
import { FLAG_MIME, flagDataToBytes, getFlagData } from './flag-image';

/**
 * The toolbar icon follows the detected country: the default globe is replaced
 * with the flag of the tab the change belongs to.
 *
 * The flag is the real image from `flag-image.ts`; only when that cannot be
 * loaded (offline, blocked) does it fall back to the Unicode emoji, which some
 * platforms render as the two-letter country code.
 */

/** Icon sizes Chrome asks for: 16 for the toolbar, 32 for HiDPI displays. */
const ICON_SIZES = [16, 32] as const;

/** Used when no flag can be drawn, so a tab always falls back to the globe. */
const DEFAULT_ICON_PATHS = { 16: 'icon/16.png', 32: 'icon/32.png' };

const EMOJI_FONT = '"Apple Color Emoji", "Segoe UI Emoji", "Noto Color Emoji", sans-serif';

/** Share of the icon left empty around a rendered emoji glyph. */
const EMOJI_MARGIN_RATIO = 0.04;

type IconImageData = { [size: string]: ImageData };

interface Canvas {
  canvas: HTMLCanvasElement | OffscreenCanvas;
  context: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D;
}

interface InkBounds {
  left: number;
  top: number;
  width: number;
  height: number;
}

/** Rendered icons are reused: several tabs can show the same country. */
const renderedIcons = new Map<string, IconImageData>();

/** Points the toolbar icon of a single tab at a country's flag. */
export async function setTabIcon(tabId: number | undefined, countryCode: string): Promise<void> {
  if (tabId === undefined) return;

  let imageData = renderedIcons.get(countryCode);
  if (imageData === undefined) {
    const rendered = await renderIcon(countryCode);
    if (rendered === null) return;
    renderedIcons.set(countryCode, rendered);
    imageData = rendered;
  }

  try {
    await browser.action.setIcon({ tabId, imageData });
  } catch (error) {
    // A toolbar icon is decoration: it must never break the popup.
    console.warn('[country flag] toolbar icon could not be set', error);
  }
}

/** Restores the default globe icon of a single tab. */
export async function resetTabIcon(tabId: number | undefined): Promise<void> {
  if (tabId === undefined) return;

  try {
    await browser.action.setIcon({ tabId, path: DEFAULT_ICON_PATHS });
  } catch {
    // Same here: ignore toolbars that cannot hold a per-tab icon.
  }
}

/** Real flag image first, emoji only as a fallback. */
async function renderIcon(countryCode: string): Promise<IconImageData | null> {
  const flag = await getFlagData(countryCode);
  if (flag !== null) {
    const images = await renderImage(flagDataToBytes(flag));
    if (images !== null) return images;
  }

  return renderEmoji(countryCodeToFlag(countryCode));
}

/** Decodes the cached flag and fits it into every toolbar size. */
async function renderImage(bytes: Uint8Array<ArrayBuffer>): Promise<IconImageData | null> {
  try {
    const bitmap = await createImageBitmap(new Blob([bytes], { type: FLAG_MIME }));

    const images: IconImageData = {};
    for (const size of ICON_SIZES) {
      const target = createCanvas(size);
      if (target === null) {
        bitmap.close();
        return null;
      }

      const scale = Math.min(size / bitmap.width, size / bitmap.height);
      const width = bitmap.width * scale;
      const height = bitmap.height * scale;
      target.context.imageSmoothingEnabled = true;
      target.context.imageSmoothingQuality = 'high';
      target.context.drawImage(bitmap, (size - width) / 2, (size - height) / 2, width, height);
      images[String(size)] = target.context.getImageData(0, 0, size, size);
    }

    bitmap.close();
    return images;
  } catch (error) {
    console.warn('[country flag] flag image could not be rendered', error);
    return null;
  }
}

/** Fallback: draws the flag emoji, cropped to its ink so it fills the icon. */
function renderEmoji(emoji: string): IconImageData | null {
  if (emoji === '') return null;

  const images: IconImageData = {};
  for (const size of ICON_SIZES) {
    const image = renderEmojiAtSize(emoji, size);
    if (image === null) return null;
    images[String(size)] = image;
  }
  return images;
}

function renderEmojiAtSize(emoji: string, size: number): ImageData | null {
  // Draw big on a scratch canvas first, then crop the glyph to its ink so the
  // icon is filled properly whatever metrics the platform's emoji font reports.
  const scratchSize = size * 3;
  const scratch = createCanvas(scratchSize);
  const target = createCanvas(size);
  if (scratch === null || target === null) return null;

  scratch.context.font = `${size}px ${EMOJI_FONT}`;
  scratch.context.textAlign = 'center';
  scratch.context.textBaseline = 'middle';
  scratch.context.fillText(emoji, scratchSize / 2, scratchSize / 2);

  const ink = inkBounds(scratch.context.getImageData(0, 0, scratchSize, scratchSize));
  if (ink === null) return null;

  const margin = size * EMOJI_MARGIN_RATIO;
  const scale = Math.min((size - margin * 2) / ink.width, (size - margin * 2) / ink.height);
  const width = ink.width * scale;
  const height = ink.height * scale;

  target.context.drawImage(
    scratch.canvas,
    ink.left,
    ink.top,
    ink.width,
    ink.height,
    (size - width) / 2,
    (size - height) / 2,
    width,
    height,
  );

  return target.context.getImageData(0, 0, size, size);
}

/** Bounding box of everything that is not fully transparent. */
function inkBounds(image: ImageData): InkBounds | null {
  let left = image.width;
  let top = image.height;
  let right = -1;
  let bottom = -1;

  for (let y = 0; y < image.height; y += 1) {
    for (let x = 0; x < image.width; x += 1) {
      const alpha = image.data[(y * image.width + x) * 4 + 3] ?? 0;
      if (alpha <= 8) continue;
      if (x < left) left = x;
      if (x > right) right = x;
      if (y < top) top = y;
      if (y > bottom) bottom = y;
    }
  }

  if (right < 0 || bottom < 0) return null;
  return { left, top, width: right - left + 1, height: bottom - top + 1 };
}

/** DOM canvas in the popup, `OffscreenCanvas` inside the service worker. */
function createCanvas(size: number): Canvas | null {
  if (typeof document !== 'undefined') {
    const canvas = document.createElement('canvas');
    canvas.width = size;
    canvas.height = size;
    const context = canvas.getContext('2d');
    return context === null ? null : { canvas, context };
  }

  if (typeof OffscreenCanvas !== 'undefined') {
    const canvas = new OffscreenCanvas(size, size);
    const context = canvas.getContext('2d');
    return context === null ? null : { canvas, context };
  }

  return null;
}
