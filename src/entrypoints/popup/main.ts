import { browser } from 'wxt/browser';
import { resetTabIcon, setTabIcon } from '@/lib/action-icon';
import { flagDataUrl, getFlagData } from '@/lib/flag-image';
import { lookupGeoIp } from '@/lib/geo-ip';
import { asnDetailUrl, countryMapUrl, domainDetailUrl, ipDetailUrl } from '@/lib/links';
import { isLocalHostname } from '@/lib/domain';
import { applyThemePreference, getThemePreference } from '@/lib/settings';
import { resolveSiteIp, siteFromUrl, type Site } from '@/lib/site';
import { lookupRank } from '@/lib/tranco';
import {
  createEmptyState,
  createInfoHeader,
  createInfoList,
  type EmptyStateKind,
  type InfoHeaderHandle,
  type InfoListHandle,
  type InfoRowHandle,
  type InfoRowOptions,
} from './components';
import '@/assets/theme.css';
import './style.css';

const ROWS: readonly InfoRowOptions[] = [
  { id: 'ip', label: 'IP' },
  { id: 'provider', label: 'Provider' },
  { id: 'country', label: 'Country' },
  { id: 'rank', label: 'Rank' },
];

interface ActiveTab {
  /** Tab the popup was opened on; scopes the toolbar icon. */
  id: number | undefined;
  /** `null` for chrome://, file://, ... - pages the extension cannot inspect. */
  site: Site | null;
}

/** Outcome of a single data source; a failure never leaks into the other rows. */
type Settled<T> = { ok: true; value: T } | { ok: false };

async function boot(): Promise<void> {
  // Theme first: the popup builds its DOM below, so nothing flashes.
  applyThemePreference(await getThemePreference());

  const root = document.querySelector<HTMLElement>('#app');
  if (!root) throw new Error('Popup root element is missing');

  // `#app` is the card itself: header and list go straight into it.
  const header = createInfoHeader();
  const list = createInfoList(ROWS);
  root.append(header.element, list.element);

  void hydrate(header, list).finally(() => root.setAttribute('aria-busy', 'false'));
}

async function hydrate(header: InfoHeaderHandle, list: InfoListHandle): Promise<void> {
  const root = document.querySelector<HTMLElement>('#app');
  const tab = await readActiveTab();
  const site = tab.site;

  if (site === null) {
    // chrome://, file://, the new tab page, ... - not inspectable.
    showEmptyState(root, 'unsupported');
    await resetTabIcon(tab.id);
    return;
  }

  if (isLocalHostname(site.domain)) {
    // localhost, 192.168.x.x, ... - there is nothing to look up.
    showEmptyState(root, 'private');
    await resetTabIcon(tab.id);
    return;
  }

  header.setDomain(site.domain);
  header.setLink(domainDetailUrl(site.domain));

  // Independent sources run at the same time: a slow Tranco call must not delay
  // the IP/Provider/Country rows. The service worker has usually detected the
  // country already, so these lookups are normally cache hits.
  await Promise.all([
    loadAddress(
      tab.id,
      site,
      list.row('ip'),
      list.row('provider'),
      list.row('country'),
      header,
    ),
    loadRank(site, list.row('rank')),
  ]);
}

async function loadAddress(
  tabId: number | undefined,
  site: Site,
  ipRow: InfoRowHandle,
  providerRow: InfoRowHandle,
  countryRow: InfoRowHandle,
  header: InfoHeaderHandle,
): Promise<void> {
  const ipResult = await settle(resolveSiteIp(site));
  const ip = ipResult.ok ? ipResult.value : null;

  if (ip === null) {
    // No A record, or the DNS service itself failed: both mean "no address".
    ipRow.setValue('Unavailable', 'muted');
    providerRow.setValue('Unavailable', 'muted');
    countryRow.setValue('Unavailable', 'muted');
    await resetTabIcon(tabId);
    return;
  }

  ipRow.setValue(ip);
  ipRow.setLink(ipDetailUrl(ip));

  // One lookup fills both the Provider and the Country row.
  const geoResult = await settle(lookupGeoIp(ip));
  if (!geoResult.ok) {
    providerRow.setValue('Unavailable', 'muted');
    countryRow.setValue('Unavailable', 'muted');
    await resetTabIcon(tabId);
    return;
  }

  const { provider, country, asn } = geoResult.value ?? { provider: null, country: null, asn: null };
  providerRow.setValue(provider ?? 'Unknown', provider === null ? 'muted' : 'default');
  // The ASN comes from the same response, so this link costs no extra request.
  providerRow.setLink(asn === null ? null : asnDetailUrl(asn));

  if (country === null) {
    countryRow.setValue('Unknown', 'muted');
    await resetTabIcon(tabId);
    return;
  }

  countryRow.setValue(country.name);
  countryRow.setLink(countryMapUrl(country.name));

  // Real flag image (cached after the first visit per country); the emoji is
  // only used when the image cannot be loaded, e.g. while offline.
  const flagData = await getFlagData(country.code);
  if (flagData === null) header.setFlag(country.flag);
  else header.setFlagImage(flagDataUrl(flagData));

  await setTabIcon(tabId, country.code);
}

async function loadRank(site: Site, rankRow: InfoRowHandle): Promise<void> {
  const rankResult = await settle(lookupRank(site.domain));
  if (!rankResult.ok) {
    rankRow.setValue('Unavailable', 'muted');
    return;
  }

  const rank = rankResult.value;
  rankRow.setValue(
    rank === null ? 'Not ranked' : formatRank(rank),
    rank === null ? 'muted' : 'default',
  );
}

/** Replaces the rows with an empty state; the popup element keeps being the card. */
function showEmptyState(root: HTMLElement | null, kind: EmptyStateKind): void {
  if (!root) return;
  root.replaceChildren(createEmptyState(kind));
  root.classList.add('card--empty');
}

async function readActiveTab(): Promise<ActiveTab> {  try {
    const tabs = await browser.tabs.query({ active: true, currentWindow: true });
    const tab = tabs[0];
    return { id: tab?.id, site: siteFromUrl(tab?.url) };
  } catch {
    return { id: undefined, site: null };
  }
}

function formatRank(rank: number): string {
  return `#${rank.toLocaleString('en-US')}`;
}

function settle<T>(task: Promise<T>): Promise<Settled<T>> {
  return task.then(
    (value): Settled<T> => ({ ok: true, value }),
    (): Settled<T> => ({ ok: false }),
  );
}

void boot();
