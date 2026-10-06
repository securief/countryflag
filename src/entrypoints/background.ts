import { browser } from 'wxt/browser';
import { clearCache } from '@/lib/cache';
import { syncVisibleTabs, watchTabIcons } from '@/lib/icon-sync';

/**
 * The popup talks to the public APIs directly, so the service worker only
 * handles extension lifecycle work:
 *
 * - the toolbar icon of every tab follows its page (see `lib/icon-sync.ts`);
 * - after an update the cached values are dropped, so a change to the cache
 *   format can never break the popup.
 */
export default defineBackground(() => {
  browser.runtime.onInstalled.addListener(({ reason }) => {
    if (reason === 'update') void clearCache();
  });

  watchTabIcons();
  void syncVisibleTabs();
});
