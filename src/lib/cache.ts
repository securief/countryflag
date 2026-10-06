import { browser } from 'wxt/browser';

/**
 * Tiny cache on top of `chrome.storage.local`.
 *
 * Keys are namespaced per data source (`dns:google.com`, `country:8.8.8.8`,
 * `rank:google.com`) and every entry stores `{ value, cachedAt }`. Only
 * successful lookups are cached, so a failing API is retried on the next popup
 * open instead of being remembered for hours.
 */
export type CacheScope = 'dns' | 'geo' | 'rank' | 'flag';

const CACHE_SCOPES: readonly CacheScope[] = ['dns', 'geo', 'rank', 'flag'];

/** Requests that are already running, so parallel callers share one fetch. */
const inFlight = new Map<string, Promise<unknown>>();

interface CacheEntry<T> {
  value: T | null;
  cachedAt: number;
}

export function cacheKey(scope: CacheScope, id: string): string {
  return `${scope}:${id}`;
}

/** Returns the cached value, or `undefined` on a miss/expired entry. */
export async function cached<T>(
  key: string,
  ttlMs: number,
  load: () => Promise<T | null>,
): Promise<T | null> {
  const hit = await readCache<T>(key, ttlMs);
  if (hit) return hit.value;

  // Several tabs can ask for the same domain at once: share one request.
  const pending = inFlight.get(key) as Promise<T | null> | undefined;
  if (pending) return pending;

  const task = load()
    .then(async (value) => {
      await writeCache(key, value);
      return value;
    })
    .finally(() => {
      inFlight.delete(key);
    });

  inFlight.set(key, task);
  return task;
}

/** Drops every entry written by the extension (used after an update). */
export async function clearCache(): Promise<void> {
  const stored = await browser.storage.local.get(null);
  const keys = Object.keys(stored).filter(isCacheKey);
  if (keys.length > 0) await browser.storage.local.remove(keys);
}

/** How many entries are cached right now; shown on the options page. */
export async function countCacheEntries(): Promise<number> {
  const stored = await browser.storage.local.get(null);
  return Object.keys(stored).filter(isCacheKey).length;
}

/**
 * Reads a cached value without loading it: `undefined` on a miss or an expired
 * entry, `null` when the cached answer itself was "not found".
 */
export async function peekCache<T>(key: string, ttlMs: number): Promise<T | null | undefined> {
  const hit = await readCache<T>(key, ttlMs);
  return hit === undefined ? undefined : hit.value;
}

async function readCache<T>(key: string, ttlMs: number): Promise<CacheEntry<T> | undefined> {
  const stored = await browser.storage.local.get(key);
  const entry: unknown = stored[key];
  if (!isCacheEntry<T>(entry)) return undefined;

  if (Date.now() - entry.cachedAt > ttlMs) {
    await browser.storage.local.remove(key);
    return undefined;
  }
  return entry;
}

async function writeCache<T>(key: string, value: T | null): Promise<void> {
  const entry: CacheEntry<T> = { value, cachedAt: Date.now() };
  await browser.storage.local.set({ [key]: entry });
}

function isCacheEntry<T>(value: unknown): value is CacheEntry<T> {
  if (typeof value !== 'object' || value === null) return false;
  const entry = value as { value?: unknown; cachedAt?: unknown };
  return 'value' in entry && typeof entry.cachedAt === 'number';
}

function isCacheKey(key: string): boolean {
  return CACHE_SCOPES.some((scope) => key.startsWith(`${scope}:`));
}
