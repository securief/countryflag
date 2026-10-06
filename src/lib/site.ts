import { lookupGeoIp, type CountryInfo } from './geo-ip';
import { lookupIpv4 } from './dns';
import { hostnameFromUrl, isValidIPv4, stripWww } from './domain';

/**
 * A website the extension can inspect. Shared by the popup (which renders it)
 * and the service worker (which keeps the toolbar icon in sync).
 */
export interface Site {
  /** Normalized domain: shown in the popup and used for the detail links. */
  domain: string;
  /** Hostname exactly as the tab reported it, kept as a DNS fallback. */
  rawHost: string;
}

/** Builds a `Site` from a tab URL; `null` for pages that cannot be inspected. */
export function siteFromUrl(url: string | null | undefined): Site | null {
  const rawHost = hostnameFromUrl(url);
  return rawHost === null ? null : { domain: stripWww(rawHost), rawHost };
}

/** IPv4 address of a site, `null` when it has none (or DNS failed). */
export async function resolveSiteIp(site: Site): Promise<string | null> {
  // The tab itself is an IP literal (http://192.168.0.1/): nothing to resolve.
  if (isValidIPv4(site.domain)) return site.domain;

  const address = await lookupIpv4(site.domain);
  if (address !== null) return address;

  // Some hosts only exist under `www.`, retry the hostname the tab reported.
  return site.rawHost === site.domain ? null : lookupIpv4(site.rawHost);
}

/** Country of a site, `null` when it cannot be determined. */
export async function detectCountry(site: Site): Promise<CountryInfo | null> {
  const ip = await resolveSiteIp(site);
  if (ip === null) return null;

  const geo = await lookupGeoIp(ip);
  return geo?.country ?? null;
}
