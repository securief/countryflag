import { browser } from 'wxt/browser';
import { resetTabIcon, setTabIcon } from './action-icon';
import { isLocalHostname } from './domain';
import { detectCountry, siteFromUrl } from './site';

/**
 * Keeps the toolbar icon of every tab in sync with the page it shows.
 *
 * Why this exists: Chrome *"resets the icon when the user navigates this tab to
 * a new page"* (action.setIcon with a `tabId` is tab state, not a permanent
 * setting), and a reload reports no `changeInfo.url` at all. So the icon is
 * written again on every load event, and a missing URL is never treated as
 * "unsupported page" - an unknown URL means "leave the icon alone".
 */

/** Which run is the current one per tab, so stale lookups cannot win. */
const tabRuns = new Map<number, number>();

/**
 * Chrome can reset a tab icon around the load event; writing the icon once more
 * shortly after "complete" makes the flag survive that.
 */
const REAPPLY_DELAY_MS = 500;

/** Wires the tab lifecycle to the icon. Called once from the service worker. */
export function watchTabIcons(): void {
  browser.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
    // Ignore title/favicon/audio updates: only loads and navigations matter.
    if (changeInfo.url === undefined && changeInfo.status === undefined) return;

    // Only the second pass (after the page loaded) re-applies the icon.
    void syncTabIcon(tabId, changeInfo.url ?? tab.url, changeInfo.status === 'complete');
  });

  browser.tabs.onActivated.addListener(({ tabId }) => {
    void syncActivatedTab(tabId);
  });

  browser.tabs.onRemoved.addListener((tabId) => {
    tabRuns.delete(tabId);
  });

  // A freshly loaded extension sees no events for already-open tabs.
  browser.runtime.onInstalled.addListener(() => void syncVisibleTabs());
  browser.runtime.onStartup.addListener(() => void syncVisibleTabs());
}

/** Restores the icons of the tab(s) the user is looking at right now. */
export async function syncVisibleTabs(): Promise<void> {
  try {
    const tabs = await browser.tabs.query({ active: true });
    await Promise.all(
      tabs.map((tab) => (tab.id === undefined ? undefined : syncTabIcon(tab.id, tab.url))),
    );
  } catch {
    // Nothing visible to sync.
  }
}

async function syncActivatedTab(tabId: number): Promise<void> {
  try {
    const tab = await browser.tabs.get(tabId);
    await syncTabIcon(tabId, tab.url);
  } catch {
    // The tab may be gone before we get to look at it.
  }
}

/**
 * Points the toolbar icon of one tab at the flag of the page it shows.
 *
 * `url` is optional on purpose: reloads do not report it, and the tab snapshot
 * handed to `tabs.onUpdated` can be empty. In that case the tab is re-read, and
 * if the URL is still unknown the icon is left untouched instead of being reset.
 */
export async function syncTabIcon(
  tabId: number,
  url: string | undefined,
  reapply = false,
): Promise<void> {
  const run = (tabRuns.get(tabId) ?? 0) + 1;
  tabRuns.set(tabId, run);

  const target = await resolveUrl(tabId, url);
  if (!isCurrentRun(tabId, run)) return;
  if (target === undefined) return; // Unknown page: keep whatever icon is there.

  const site = siteFromUrl(target);
  if (site === null || isLocalHostname(site.domain)) {
    // chrome://, file://, localhost, private IPs: nothing to look up.
    await resetTabIcon(tabId);
    return;
  }

  // A failed lookup (DNS or GEO-IP down) means "no country" - never let it
  // escape as an unhandled rejection, and never leave a stale flag behind.
  const country = await detectCountry(site).catch(() => null);
  if (!isCurrentRun(tabId, run)) return; // The tab navigated while we looked.
  if (country === null) {
    await resetTabIcon(tabId);
    return;
  }

  await setTabIcon(tabId, country.code);
  if (reapply) scheduleReapply(tabId, run, country.code);
}

/** Reads the tab when no URL was reported (reloads, empty snapshots). */
async function resolveUrl(tabId: number, url: string | undefined): Promise<string | undefined> {
  if (url) return url;

  try {
    const tab = await browser.tabs.get(tabId);
    return tab.url ?? undefined;
  } catch {
    return undefined;
  }
}

function scheduleReapply(tabId: number, run: number, countryCode: string): void {
  setTimeout(() => {
    if (!isCurrentRun(tabId, run)) return;
    void setTabIcon(tabId, countryCode);
  }, REAPPLY_DELAY_MS);
}

function isCurrentRun(tabId: number, run: number): boolean {
  return tabRuns.get(tabId) === run;
}
