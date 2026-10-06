import { browser } from 'wxt/browser';
import { isValidIPv4, normalizeHostname } from './domain';

/**
 * External detail pages. All URL construction lives here, and every builder
 * validates its input first so no API value can be smuggled into a link.
 *
 * There is deliberately no Tranco builder: Tranco has no website, only a raw
 * API endpoint, so the Rank row stays a plain, non-clickable row.
 */

const IP_SB_ORIGIN = 'https://ip.sb';

/** `https://ip.sb/domain/google.com` */
export function domainDetailUrl(domain: string): string | null {
  const host = normalizeHostname(domain);
  return host ? `${IP_SB_ORIGIN}/domain/${encodeURIComponent(host)}` : null;
}

/** `https://ip.sb/geoip/8.8.8.8` */
export function ipDetailUrl(ip: string): string | null {
  return isValidIPv4(ip) ? `${IP_SB_ORIGIN}/geoip/${encodeURIComponent(ip)}` : null;
}

/**
 * `https://www.google.com/maps/place/United+States/`
 *
 * The country *name* is used instead of the ISO code, because Maps reads that
 * segment as a search: it lands on the country itself and stays readable. The
 * name always comes from `Intl.DisplayNames` for an already validated code, and
 * spaces become `+`, the way Maps writes them.
 */
export function countryMapUrl(countryName: string): string | null {
  const name = countryName.trim();
  if (name === '' || name.length > 64) return null;

  const query = encodeURIComponent(name).replaceAll('%20', '+');
  return `https://www.google.com/maps/place/${query}/`;
}

/** `https://bgp.tools/as/15169` - one page per autonomous system. */
export function asnDetailUrl(asn: number): string | null {
  if (!Number.isInteger(asn) || asn <= 0 || asn > 4294967295) return null;
  return `https://bgp.tools/as/${asn}`;
}

/** Opens an external detail page in a new tab instead of the popup itself. */
export async function openExternal(url: string): Promise<void> {
  await browser.tabs.create({ url });
}
