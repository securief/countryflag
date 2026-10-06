import { browser } from 'wxt/browser';

/**
 * User settings, stored next to the cache in `chrome.storage.local`.
 *
 * The theme is a preference, not a cached value: it has no TTL and is never
 * touched by `clearCache()`.
 */
export type ThemePreference = 'system' | 'light' | 'dark';

const THEME_KEY = 'settings:theme';
const THEME_VALUES: readonly string[] = ['system', 'light', 'dark'];

/** Theme the popup and options page follow; the operating system by default. */
export async function getThemePreference(): Promise<ThemePreference> {
  const stored = await browser.storage.local.get(THEME_KEY);
  const value: unknown = stored[THEME_KEY];

  return isThemePreference(value) ? value : 'system';
}

export async function setThemePreference(value: ThemePreference): Promise<void> {
  await browser.storage.local.set({ [THEME_KEY]: value });
}

/**
 * Applies a preference to a document. `system` removes the attribute, so the
 * `prefers-color-scheme` media query takes over again.
 */
export function applyThemePreference(
  value: ThemePreference,
  element: HTMLElement = document.documentElement,
): void {
  if (value === 'system') element.removeAttribute('data-theme');
  else element.dataset.theme = value;
}

export function isThemePreference(value: unknown): value is ThemePreference {
  return typeof value === 'string' && THEME_VALUES.includes(value);
}
