/**
 * Response contract of the single API this extension talks to:
 * `GET https://geoip.kristal.id/v1/lookup/{domain}`.
 *
 * Everything that comes from the network is untrusted data, so every field is
 * optional here and validated in `lib/lookup.ts` before the UI uses it.
 */

/** `data:image/png;base64,...` for the country flag, or `null` when unavailable. */
export interface LookupCountry {
  /** ISO 3166-1 alpha-2 code, e.g. `US`. */
  code?: string;
  /** English country name, e.g. `United States`. */
  name?: string;
  flag?: string | null;
}

export interface LookupAsn {
  /** Numeric ASN without the `AS` prefix, e.g. `15169`. */
  number?: number;
  /** Organization owning the network, e.g. `Google LLC`. */
  name?: string;
}

/** `{ domain, ip, country, asn, rank }` */
export interface DomainLookup {
  domain?: string;
  ip?: string;
  country?: LookupCountry;
  asn?: LookupAsn | null;
  /** Tranco rank, or `null` when the domain is not ranked (yet). */
  rank?: number | null;
}

/** Every non-2xx answer uses this shape. */
export interface ApiErrorBody {
  error?: {
    code?: string;
    message?: string;
  };
}

/** Response of `https://tranco-list.eu/api/ranks/domain/<domain>`. */
export interface TrancoRankEntry {
  /** ISO date of the Tranco list, e.g. `2026-10-05`. */
  date?: string;
  rank?: number;
}

export interface TrancoResponse {
  domain?: string;
  /** Daily ranks, most recent first. Empty when the domain is not ranked. */
  ranks?: TrancoRankEntry[];
}
