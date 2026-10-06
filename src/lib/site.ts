import { hostnameFromUrl, stripWww } from './domain';

/**
 * A website the extension can inspect. Shared by the popup (which renders it)
 * and the service worker (which keeps the toolbar icon in sync). Everything the
 * extension knows about a site comes from `lib/lookup.ts`.
 */
export interface Site {
  /** Normalized domain: shown in the popup and used for the lookup + links. */
  domain: string;
  /** Hostname exactly as the tab reported it. */
  rawHost: string;
}

/** Builds a `Site` from a tab URL; `null` for pages that cannot be inspected. */
export function siteFromUrl(url: string | null | undefined): Site | null {
  const rawHost = hostnameFromUrl(url);
  return rawHost === null ? null : { domain: stripWww(rawHost), rawHost };
}
