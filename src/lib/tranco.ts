import type { TrancoResponse } from '../types/api';
import { registrableDomain } from './domain';

/**
 * Direct Tranco fallback.
 *
 * The lookup API resolves Tranco in parallel and tolerates a Tranco failure by
 * answering `rank: null`, which is indistinguishable from "not ranked". So when
 * an answer arrives without a rank, the source is asked once more here.
 *
 * Tranco only indexes *registrable* domains, so `dash.cloudflare.com` can never
 * be found there - the hostname is reduced first (`cloudflare.com`). Fine to do
 * here: this is a fallback only, so a slightly wrong reduction costs one wasted
 * request, never a wrong answer.
 *
 * The three outcomes are kept apart on purpose: "not ranked" is a final answer
 * the caller may cache for a long time, while "unavailable" means the rank is
 * simply unknown and should be retried soon.
 */
const TRANCO_ENDPOINT = 'https://tranco-list.eu/api/ranks/domain';

export type TrancoRankResult =
  | { status: 'ranked'; rank: number }
  | { status: 'not-ranked' }
  | { status: 'unavailable' };

/** `https://tranco-list.eu/api/ranks/domain/cloudflare.com` */
export function trancoApiUrl(hostname: string): string {
  return `${TRANCO_ENDPOINT}/${encodeURIComponent(registrableDomain(hostname))}`;
}

export async function fetchTrancoRank(hostname: string): Promise<TrancoRankResult> {
  try {
    const response = await fetch(trancoApiUrl(hostname), {
      headers: { accept: 'application/json' },
    });

    // The API answers 404 for a domain it does not know: that is a real answer.
    if (response.status === 404) return { status: 'not-ranked' };
    if (!response.ok) {
      console.warn(`[country flag] Tranco fallback failed with status ${response.status}`);
      return { status: 'unavailable' };
    }

    const payload: unknown = await response.json().catch(() => null);
    if (!isTrancoResponse(payload)) return { status: 'unavailable' };

    const rank = latestRank(payload);
    return rank === null ? { status: 'not-ranked' } : { status: 'ranked', rank };
  } catch (error) {
    console.warn('[country flag] Tranco fallback request failed', error);
    return { status: 'unavailable' };
  }
}

/** The API returns one entry per list date; the newest one wins. */
export function latestRank(response: TrancoResponse): number | null {
  const entries = Array.isArray(response.ranks) ? response.ranks : [];

  let newestDate = '';
  let newestRank: number | null = null;
  for (const entry of entries) {
    const rank = entry?.rank;
    if (typeof rank !== 'number' || !Number.isInteger(rank) || rank <= 0) continue;

    const date = typeof entry.date === 'string' ? entry.date : '';
    if (newestRank === null || date > newestDate) {
      newestRank = rank;
      newestDate = date;
    }
  }
  return newestRank;
}

function isTrancoResponse(value: unknown): value is TrancoResponse {
  return typeof value === 'object' && value !== null;
}
