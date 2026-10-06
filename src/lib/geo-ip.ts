import type { IpSbGeoIpResponse } from '../types/api';
import { cacheKey, cached } from './cache';
import {
  countryCodeToFlag,
  countryNameFromCode,
  normalizeCountryCode,
} from './country-codes';

/**
 * One GEO-IP lookup answers two rows: the country (from `country_code`) and the
 * network provider (from `asn_organization`), so the popup never needs a second
 * request for the Provider row.
 */
const GEO_ENDPOINT = 'https://api.ip.sb/geoip';
export const GEO_TTL_MS = 24 * 60 * 60 * 1000;

/** Longest provider name rendered; the row truncates with an ellipsis anyway. */
const MAX_PROVIDER_LENGTH = 120;

export interface CountryInfo {
  /** ISO 3166-1 alpha-2 code, e.g. `US`. */
  code: string;
  /** Locally resolved English name, e.g. `United States`. */
  name: string;
  /** Unicode flag emoji, e.g. `🇺🇸`. */
  flag: string;
}

export interface GeoIpInfo {
  /** `null` when the IP has no country in the database. */
  country: CountryInfo | null;
  /** Owner of the autonomous system, e.g. `Google LLC`. */
  provider: string | null;
  /** Autonomous system number, e.g. `15169`. */
  asn: number | null;
}

/** `https://api.ip.sb/geoip/8.8.8.8` */
export function geoIpLookupUrl(ip: string): string {
  return `${GEO_ENDPOINT}/${encodeURIComponent(ip)}`;
}

/**
 * Country + provider of an IP address.
 *
 * Resolves to `null` when the service has no data for the IP (its `403` and
 * `404` answers are cacheable results) and rejects only when the service itself
 * failed, so a lookup problem can never hide the IP row.
 */
export function lookupGeoIp(ip: string): Promise<GeoIpInfo | null> {
  return cached(cacheKey('geo', ip), GEO_TTL_MS, async () => {
    const response = await fetch(geoIpLookupUrl(ip));
    if (response.status === 403 || response.status === 404) return null;
    if (!response.ok) throw new Error(`GEO-IP lookup failed with status ${response.status}`);

    const data = (await response.json()) as IpSbGeoIpResponse;
    return {
      country: describeCountry(data.country_code),
      provider: readProvider(data.asn_organization),
      asn: readAsn(data.asn),
    };
  });
}

/** Turns an ISO alpha-2 code into flag + name without any further API call. */
export function describeCountry(code: string | null | undefined): CountryInfo | null {
  const normalized = normalizeCountryCode(code);
  if (!normalized) return null;

  return {
    code: normalized,
    name: countryNameFromCode(normalized) ?? normalized,
    flag: countryCodeToFlag(normalized),
  };
}

function readProvider(organization: string | undefined): string | null {
  if (typeof organization !== 'string') return null;

  const value = organization.trim();
  return value === '' ? null : value.slice(0, MAX_PROVIDER_LENGTH);
}

/** ASNs are 32 bit positive integers; anything else is not a link target. */
function readAsn(asn: number | undefined): number | null {
  if (typeof asn !== 'number' || !Number.isInteger(asn)) return null;
  return asn > 0 ? asn : null;
}
