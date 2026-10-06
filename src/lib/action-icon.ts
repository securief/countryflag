import { browser } from 'wxt/browser';
import { countryCodeToFlag } from './country-codes';

/**
 * The toolbar icon follows the detected country. The flag image arrives from
 * the lookup API as a base64 data URI; the Unicode emoji is only the fallback
 * for when that API had no flag (or the image could not be rendered).
 */

/** Icon sizes Chrome asks for: 16 for the toolbar, 32 for HiDPI displays. */
const ICON_SIZES = [16, 32] as const;

/** Used when no flag can be drawn, so a tab always falls back to the globe. */
const DEFAULT_ICON_PATHS = { 16: 'icon/16.png', 32: 'icon/32.png' };

const EMOJI_FONT = '"Apple Color Emoji", "Segoe UI Emoji", "Noto Color Emoji", sans-serif';

/** Share of the icon left empty around a rendered emoji glyph. */
const EMOJI_MARGIN_RATIO = 0.04;

/** What the icon needs to know about a country. */
export interface FlagSource {
  /** ISO 3166-1 alpha-2 code, used for the emoji fallback. */
  code: string;
  /** `data:image/...;base64,...` URI, or `null` when the API had no flag. */
  flag: string | null;
}

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
export async function setTabIcon(tabId: number | undefined, country: FlagSource): Promise<void> {
  if (tabId === undefined) return;

  let imageData = renderedIcons.get(country.code);
  if (imageData === undefined) {
    const rendered = await renderIcon(country);
    if (rendered === null) return;
    renderedIcons.set(country.code, rendered);
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

/** The flag image first, the emoji only when there is no usable image. */
async function renderIcon(country: FlagSource): Promise<IconImageData | null> {
  if (country.flag !== null) {
    const images = await renderImage(country.flag);
    if (images !== null) return images;
  }

  return renderEmoji(countryCodeToFlag(country.code));
}

/** Decodes the data URI and fits the flag into every toolbar size. */
async function renderImage(dataUri: string): Promise<IconImageData | null> {
  const blob = dataUriToBlob(dataUri);
  if (blob === null) return null;

  try {
    const bitmap = await createImageBitmap(blob);

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

/**
 * `data:image/png;base64,...` -> Blob. Decoded by hand instead of with `fetch`
 * so it works identically in the popup and in the service worker.
 */
function dataUriToBlob(dataUri: string): Blob | null {
  const comma = dataUri.indexOf(',');
  if (comma < 0 || !dataUri.startsWith('data:')) return null;

  const [mime, encoding] = dataUri.slice('data:'.length, comma).split(';');
  if (!mime || encoding !== 'base64') return null;

  try {
    const binary = atob(dataUri.slice(comma + 1));
    const bytes = new Uint8Array(binary.length);
    for (let index = 0; index < binary.length; index += 1) {
      bytes[index] = binary.charCodeAt(index);
    }
    return new Blob([bytes], { type: mime });
  } catch {
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
