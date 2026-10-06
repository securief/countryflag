import type { DomainLookup, LookupAsn, LookupCountry } from '../types/api';
import { cacheKey, cached } from './cache';
import { normalizeCountryCode } from './country-codes';
import { isValidIPv4 } from './domain';
import { fetchTrancoRank } from './tranco';

/**
 * The single API this extension talks to. It aggregates DNS resolution,
 * GEO-IP (country + ASN) and the Tranco rank behind one endpoint, so the popup
 * needs exactly one request per domain.
 */
const LOOKUP_ENDPOINT = 'https://geoip.kristal.id/v1/lookup';

/**
 * How long a settled answer is trusted: 10 minutes. The API caches the same
 * answer for an hour on its side, so this only re-checks often enough to pick up
 * changes without asking on every navigation.
 */
export const LOOKUP_TTL_MS = 10 * 60 * 1000;

/** A domain that does not resolve is retried less often, but never "never". */
export const NOT_FOUND_TTL_MS = 10 * 60 * 1000;

/**
 * When the rank could not be determined at all (Tranco itself was unreachable),
 * the answer is re-checked quickly instead of showing "Not ranked" for minutes.
 */
export const UNSETTLED_RANK_TTL_MS = 60 * 1000;

/** Upper bounds for untrusted text, so a hostile payload cannot bloat the UI. */
const MAX_TEXT_LENGTH = 120;
const MAX_FLAG_LENGTH = 64 * 1024;

/** Everything the popup and the toolbar icon need, fully validated. */
export interface LookupData {
  domain: string;
  ip: string;
  country: { code: string; name: string; flag: string | null };
  asn: { number: number; name: string } | null;
  rank: number | null;
}

/** What actually gets cached: the answer plus whether the rank question is settled. */
interface CachedLookup {
  data: LookupData;
  /**
   * `false` only when the rank is unknown - the API had no rank *and* Tranco
   * could not be reached. `true` means `data.rank` is final: either a real rank
   * or a confirmed "not ranked".
   */
  rankSettled: boolean;
}

/** Outcome of one lookup; each state maps to a distinct UI state. */
export type SiteLookup =
  | { outcome: 'ok'; data: LookupData }
  /** 404: the domain could not be resolved. */
  | { outcome: 'not-found' }
  /** 400: the API rejected the domain. */
  | { outcome: 'invalid' }
  /** 429: too many requests from this address. */
  | { outcome: 'rate-limited' }
  /** 5xx, timeout, network failure or an unexpected payload. */
  | { outcome: 'failed' };

/** `https://geoip.kristal.id/v1/lookup/google.com` */
export function lookupUrl(domain: string): string {
  return `${LOOKUP_ENDPOINT}/${encodeURIComponent(domain)}`;
}

/**
 * Looks a domain up. Never rejects: every failure becomes an outcome, so a
 * broken API can never break the popup or the toolbar icon.
 *
 * Successful answers and "does not resolve" answers are cached; transient
 * failures are not, so the next open retries. A `rank: null` from the API is
 * ambiguous (it also tolerates a Tranco failure), so it is checked against
 * Tranco directly; only a settled rank outcome gets the long cache life.
 */
export async function lookupDomain(domain: string): Promise<SiteLookup> {
  try {
    const answer = await cached<CachedLookup>(cacheKey('lookup', domain), ttlFor, () =>
      requestLookup(domain),
    );
    return answer === null ? { outcome: 'not-found' } : { outcome: 'ok', data: answer.data };
  } catch (error) {
    return outcomeFor(error);
  }
}

/** Settled answers live long, an "unknown rank" only a minute. */
function ttlFor(answer: CachedLookup | null): number {
  if (answer === null) return NOT_FOUND_TTL_MS;
  return answer.rankSettled ? LOOKUP_TTL_MS : UNSETTLED_RANK_TTL_MS;
}

/** Carries the HTTP status so the caller can turn it into an outcome. */
class LookupError extends Error {
  constructor(readonly status: number) {
    super(`Lookup failed with status ${status}`);
    this.name = 'LookupError';
  }
}

async function requestLookup(domain: string): Promise<CachedLookup | null> {
  const response = await fetch(lookupUrl(domain), { headers: { accept: 'application/json' } });

  // "Does not resolve" is a normal, cacheable answer, not an error.
  if (response.status === 404) return null;
  if (!response.ok) throw new LookupError(response.status);

  const payload: unknown = await response.json().catch(() => null);
  const data = parseLookup(payload);

  // A rank is already final.
  if (data.rank !== null) return { data, rankSettled: true };

  // Otherwise the API's `null` is ambiguous, so ask Tranco directly. A rank
  // found here is what gets cached, so the fallback only runs on a cache miss.
  const tranco = await fetchTrancoRank(domain);
  if (tranco.status === 'ranked') {
    return { data: { ...data, rank: tranco.rank }, rankSettled: true };
  }

  // "not ranked" is final; "unavailable" is not, and shortens the cache life.
  return { data, rankSettled: tranco.status === 'not-ranked' };
}

function outcomeFor(error: unknown): SiteLookup {
  if (error instanceof LookupError) {
    if (error.status === 400) return { outcome: 'invalid' };
    if (error.status === 429) return { outcome: 'rate-limited' };
  }
  return { outcome: 'failed' };
}

/** Validates an untrusted payload; anything unexpected counts as a failure. */
function parseLookup(payload: unknown): LookupData {
  if (typeof payload !== 'object' || payload === null) throw new LookupError(0);

  const raw = payload as DomainLookup;
  const domain = readText(raw.domain);
  const ip = readText(raw.ip);
  const country = readCountry(raw.country);
  if (domain === null || ip === null || country === null || !isValidIPv4(ip)) {
    throw new LookupError(0);
  }

  return { domain, ip, country, asn: readAsn(raw.asn), rank: readRank(raw.rank) };
}

function readText(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const text = value.trim();
  return text === '' ? null : text.slice(0, MAX_TEXT_LENGTH);
}

function readCountry(value: unknown): LookupData['country'] | null {
  if (typeof value !== 'object' || value === null) return null;

  const { code, name, flag } = value as LookupCountry;
  const normalized = normalizeCountryCode(code);
  const countryName = readText(name);
  if (normalized === null || countryName === null) return null;

  return { code: normalized, name: countryName, flag: readFlag(flag) };
}

/** Only a `data:image/...` URI is accepted; anything else falls back to emoji. */
function readFlag(value: unknown): string | null {
  if (typeof value !== 'string') return null;

  const uri = value.trim();
  if (!uri.startsWith('data:image/') || uri.length > MAX_FLAG_LENGTH) return null;
  return uri;
}

function readAsn(value: unknown): LookupData['asn'] {
  if (typeof value !== 'object' || value === null) return null;

  const { number, name } = value as LookupAsn;
  const asnName = readText(name);
  if (typeof number !== 'number' || !Number.isInteger(number) || number <= 0 || asnName === null) {
    return null;
  }
  return { number, name: asnName };
}

function readRank(value: unknown): number | null {
  if (typeof value !== 'number' || !Number.isInteger(value) || value <= 0) return null;
  return value;
}
