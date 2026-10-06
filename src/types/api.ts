/**
 * Raw shapes of the third-party API responses used by the extension.
 *
 * Everything that comes from the network is untrusted data, so every field is
 * optional and validated before the UI uses it.
 */

/** Response of `https://dns.google/resolve?name=<domain>&type=A`. */
export interface DohAnswer {
  name?: string;
  /** DNS record type, `1` is an A record. */
  type?: number;
  TTL?: number;
  data?: string;
}

export interface DohResponse {
  /** DNS status code, `0` means NOERROR. */
  Status?: number;
  Answer?: DohAnswer[];
  Comment?: string;
}

/** Response of `https://api.ip.sb/geoip/<ip>`. */
export interface IpSbGeoIpResponse {
  ip?: string;
  /** ISO 3166-1 alpha-2 country code, e.g. `US`. */
  country_code?: string;
  /** English country name, resolved locally instead of trusting this field. */
  country?: string;
  /** Autonomous system number, e.g. `15169`. */
  asn?: number;
  /** Owner of that autonomous system, e.g. `Google LLC`. */
  asn_organization?: string;
}

export interface TrancoRankEntry {
  /** ISO date of the Tranco list, e.g. `2026-10-05`. */
  date?: string;
  rank?: number;
}

/** Response of `https://tranco-list.eu/api/ranks/domain/<domain>`. */
export interface TrancoResponse {
  domain?: string;
  /** Daily ranks, most recent first. Empty when the domain is not ranked. */
  ranks?: TrancoRankEntry[];
}
