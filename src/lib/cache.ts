import { browser } from 'wxt/browser';

/**
 * Tiny cache on top of `chrome.storage.local`.
 *
 * Keys are namespaced per data source (`lookup:google.com`) and every entry
 * stores `{ value, cachedAt }`. Only successful lookups are cached, so a failing
 * API is retried on the next popup open instead of being remembered for hours.
 *
 * The TTL may be a function of the value: an answer whose rank could not be
 * determined deserves a much shorter life than a final one.
 */
export type CacheScope = 'lookup';

const CACHE_SCOPES: readonly CacheScope[] = ['lookup'];

/** Requests that are already running, so parallel callers share one fetch. */
const inFlight = new Map<string, Promise<unknown>>();

interface CacheEntry<T> {
  value: T | null;
  cachedAt: number;
}

export function cacheKey(scope: CacheScope, id: string): string {
  return `${scope}:${id}`;
}

/**
 * Returns the cached value, or `undefined` on a miss/expired entry. `null` is a
 * cacheable answer of its own ("this domain has nothing to show").
 */
export async function cached<T>(
  key: string,
  ttlMs: number | ((value: T | null) => number),
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

async function readCache<T>(
  key: string,
  ttlMs: number | ((value: T | null) => number),
): Promise<CacheEntry<T> | undefined> {
  const stored = await browser.storage.local.get(key);
  const entry: unknown = stored[key];
  if (!isCacheEntry<T>(entry)) return undefined;

  const ttl = typeof ttlMs === 'function' ? ttlMs(entry.value) : ttlMs;
  if (Date.now() - entry.cachedAt > ttl) {
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
