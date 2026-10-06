import type { DohResponse } from '../types/api';
import { cacheKey, cached } from './cache';
import { isValidIPv4 } from './domain';

const DNS_ENDPOINT = 'https://dns.google/resolve';
export const DNS_TTL_MS = 10 * 60 * 1000;

/** `https://dns.google/resolve?name=google.com&type=A` */
export function dnsResolveUrl(domain: string): string {
  return `${DNS_ENDPOINT}?name=${encodeURIComponent(domain)}&type=A`;
}

/**
 * Resolves the first IPv4 A record of a domain over DNS-over-HTTPS.
 *
 * Resolves to `null` when the domain simply has no A record (only AAAA, CNAME
 * chains without an address, ...) and rejects when the DNS service itself is
 * unreachable, so the popup can tell "no address" from "lookup failed".
 */
export function lookupIpv4(domain: string): Promise<string | null> {
  return cached(cacheKey('dns', domain), DNS_TTL_MS, async () => {
    const response = await fetch(dnsResolveUrl(domain), {
      headers: { accept: 'application/dns-json' },
    });
    if (!response.ok) throw new Error(`DNS lookup failed with status ${response.status}`);

    return firstIpv4((await response.json()) as DohResponse);
  });
}

/** Picks the first usable A record (type 1) out of a DoH response. */
export function firstIpv4(response: DohResponse): string | null {
  const answers = Array.isArray(response.Answer) ? response.Answer : [];
  for (const answer of answers) {
    if (answer.type === 1 && typeof answer.data === 'string' && isValidIPv4(answer.data)) {
      return answer.data;
    }
  }
  return null;
}
