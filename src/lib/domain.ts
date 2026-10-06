/**
 * Hostname normalization and validation.
 *
 * The extension never tries to guess the "registrable domain" with a naive
 * string split (that breaks on `co.uk`, `github.io`, ...): whatever hostname
 * the browser reports is used as-is for DNS and for the external detail pages.
 */

const HOSTNAME_LABEL = /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/;
const IPV4_OCTET = /^(?:0|[1-9]\d{0,2})$/;

/**
 * Extracts a normalized hostname from a tab URL.
 *
 * Returns `null` for anything that is not a regular http(s) website, so
 * `chrome://`, `chrome-extension://`, `edge://`, `about:`, `file://`,
 * `view-source:` and friends all end up in the same empty state.
 */
export function hostnameFromUrl(url: string | null | undefined): string | null {
  if (!url) return null;

  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return null;
  }

  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return null;
  return normalizeHostname(parsed.hostname);
}

/** Lowercases, removes the trailing root dot and rejects invalid hostnames. */
export function normalizeHostname(host: string): string | null {
  let value = host.trim().toLowerCase();
  if (value.endsWith('.')) value = value.slice(0, -1);
  if (value.length === 0 || value.length > 253) return null;

  return value.split('.').every((label) => HOSTNAME_LABEL.test(label)) ? value : null;
}

/**
 * Display/DNS policy: `www.` is not a meaningful subdomain, so it is dropped
 * when another multi-label name is left. Every other subdomain is preserved.
 */
export function stripWww(host: string): string {
  if (!host.startsWith('www.')) return host;
  const rest = host.slice('www.'.length);
  return rest.includes('.') ? rest : host;
}

/** True for dotted-quad IPv4 addresses whose octets are all 0-255. */
export function isValidIPv4(value: string): boolean {
  const parts = value.split('.');
  if (parts.length !== 4) return false;
  return parts.every((part) => IPV4_OCTET.test(part) && Number(part) <= 255);
}

/** True for addresses that only exist inside the local network. */
export function isPrivateIPv4(value: string): boolean {
  if (!isValidIPv4(value)) return false;

  const parts = value.split('.').map((part) => Number(part));
  const first = parts[0] ?? -1;
  const second = parts[1] ?? -1;

  if (first === 10 || first === 127) return true; // 10/8 and loopback.
  if (first === 192 && second === 168) return true; // 192.168/16.
  if (first === 172 && second >= 16 && second <= 31) return true; // 172.16/12.
  if (first === 169 && second === 254) return true; // Link-local.
  if (first === 100 && second >= 64 && second <= 127) return true; // CGNAT 100.64/10.

  return false;
}

/** True for localhost, mDNS/private suffixes and private IPv4 addresses. */
export function isLocalHostname(host: string): boolean {
  const value = host.toLowerCase();

  if (value === 'localhost' || value.endsWith('.localhost')) return true;
  if (value === 'local' || value.endsWith('.local')) return true;
  if (value.endsWith('.internal') || value.endsWith('.home.arpa')) return true;

  return isPrivateIPv4(value);
}

/**
 * Labels that belong to the public suffix of a ccTLD, so `example.co.uk` keeps
 * three labels while `dash.cloudflare.com` is reduced to two.
 *
 * This is a deliberately small heuristic, not the Public Suffix List: the list
 * is ~200 KB and would dwarf this 34 KB extension. It is only ever used for the
 * Tranco fallback, which indexes *registrable* domains - DNS and the detail
 * links keep using the hostname the tab reported.
 */
const SECOND_LEVEL_LABELS = new Set([
  'ac', 'co', 'com', 'edu', 'gen', 'go', 'gob', 'gov', 'gouv', 'govt',
  'id', 'in', 'ind', 'ltd', 'ne', 'net', 'or', 'org', 'plc', 'sch',
]);

/** `dash.cloudflare.com` -> `cloudflare.com`; `blog.example.co.uk` -> `example.co.uk`. */
export function registrableDomain(host: string): string {
  // An IP literal is already what it is - never chop it into `1.1`.
  if (isValidIPv4(host)) return host;

  const labels = host.split('.');
  if (labels.length <= 2) return host;

  const tld = labels[labels.length - 1] ?? '';
  const secondLevel = labels[labels.length - 2] ?? '';
  const suffix = tld.length === 2 && SECOND_LEVEL_LABELS.has(secondLevel);

  return labels.slice(suffix ? -3 : -2).join('.');
}
