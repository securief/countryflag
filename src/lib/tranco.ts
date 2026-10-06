import type { TrancoResponse } from '../types/api';
import { cacheKey, cached } from './cache';

const TRANCO_ENDPOINT = 'https://tranco-list.eu/api/ranks/domain';
const RANK_TTL_MS = 24 * 60 * 60 * 1000;

/** `https://tranco-list.eu/api/ranks/domain/google.com` */
export function trancoApiUrl(domain: string): string {
  return `${TRANCO_ENDPOINT}/${encodeURIComponent(domain)}`;
}

/**
 * Latest Tranco rank of a domain.
 *
 * Resolves to `null` when the domain is not in the list and rejects when the
 * API failed, so a Tranco hiccup can never hide the IP or country rows.
 */
export function lookupRank(domain: string): Promise<number | null> {
  return cached(cacheKey('rank', domain), RANK_TTL_MS, async () => {
    const response = await fetch(trancoApiUrl(domain));
    if (response.status === 404) return null;
    if (!response.ok) throw new Error(`Rank lookup failed with status ${response.status}`);

    return latestRank((await response.json()) as TrancoResponse);
  });
}

/** The API returns one entry per list date, newest first. */
export function latestRank(response: TrancoResponse): number | null {
  const entries = Array.isArray(response.ranks) ? response.ranks : [];

  let newestDate = '';
  let newestRank: number | null = null;
  for (const entry of entries) {
    if (typeof entry.rank !== 'number' || !Number.isFinite(entry.rank) || entry.rank <= 0) continue;

    const date = typeof entry.date === 'string' ? entry.date : '';
    if (newestRank === null || date > newestDate) {
      newestRank = entry.rank;
      newestDate = date;
    }
  }
  return newestRank;
}
