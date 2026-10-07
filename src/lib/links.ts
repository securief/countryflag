import { browser } from 'wxt/browser';
import { isValidIPv4, normalizeHostname } from './domain';

/**
 * External detail pages. All URL construction lives here, and every builder
 * validates its input first so no API value can be smuggled into a link.
 *
 * The domain and IP rows both go to check-host.cc, which runs its checks on the
 * visitor's behalf, so the target is passed as a query parameter.
 *
 * There is deliberately no Tranco builder: Tranco has no website, only a raw
 * API endpoint, so the Rank row stays a plain, non-clickable row.
 *
 * None of these are fetched by the extension - they are only opened in a new
 * tab - so no host permission is needed for them.
 */

const CHECK_HOST_ORIGIN = 'https://check-host.cc';

/** `https://check-host.cc/?host=google.com` */
export function domainDetailUrl(domain: string): string | null {
  const host = normalizeHostname(domain);
  return host ? `${CHECK_HOST_ORIGIN}/?host=${encodeURIComponent(host)}` : null;
}

/** `https://check-host.cc/?host=8.8.8.8` */
export function ipDetailUrl(ip: string): string | null {
  return isValidIPv4(ip) ? `${CHECK_HOST_ORIGIN}/?host=${encodeURIComponent(ip)}` : null;
}

/**
 * `https://www.google.com/maps/place/United+States/`
 *
 * The country *name* is used instead of the ISO code, because Maps reads that
 * segment as a search: it lands on the country itself and stays readable. The
 * name comes from the lookup API, and spaces become `+`, the way Maps writes
 * them.
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
