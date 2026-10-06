/**
 * ISO 3166-1 alpha-2 helpers. Kept free of any API logic so the mapping can be
 * unit tested on its own.
 *
 * Country *names* come from the API (`country.name`); only the flag emoji
 * fallback and code validation live here.
 */

const ISO_ALPHA2 = /^[A-Z]{2}$/;
const REGIONAL_INDICATOR_A = 0x1f1e6;
const LATIN_CAPITAL_A = 65;

/** Uppercases a country code and returns `null` when it is not ISO alpha-2. */
export function normalizeCountryCode(input: string | null | undefined): string | null {
  if (typeof input !== 'string') return null;
  const code = input.trim().toUpperCase();
  return ISO_ALPHA2.test(code) ? code : null;
}

/** `US` -> `🇺🇸`, built from Unicode regional indicator symbols. */
export function countryCodeToFlag(input: string): string {
  const code = normalizeCountryCode(input);
  if (!code) return '';

  return String.fromCodePoint(
    ...[...code].map((char) => REGIONAL_INDICATOR_A + char.charCodeAt(0) - LATIN_CAPITAL_A),
  );
}
