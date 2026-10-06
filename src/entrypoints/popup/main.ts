import { browser } from 'wxt/browser';
import { resetTabIcon, setTabIcon } from '@/lib/action-icon';
import { countryCodeToFlag } from '@/lib/country-codes';
import { isLocalHostname } from '@/lib/domain';
import { asnDetailUrl, countryMapUrl, domainDetailUrl, ipDetailUrl } from '@/lib/links';
import { lookupDomain } from '@/lib/lookup';
import { applyThemePreference, getThemePreference } from '@/lib/settings';
import { siteFromUrl, type Site } from '@/lib/site';
import {
  createEmptyState,
  createInfoHeader,
  createInfoList,
  type EmptyStateKind,
  type InfoHeaderHandle,
  type InfoListHandle,
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

  const ipRow = list.row('ip');
  const providerRow = list.row('provider');
  const countryRow = list.row('country');
  const rankRow = list.row('rank');

  // One request answers every row; the service worker usually warmed the cache.
  const result = await lookupDomain(site.domain);
  if (result.outcome !== 'ok') {
    // "does not resolve", "rejected", "rate limited" and hard failures all mean
    // the same thing here: there is nothing to show for this domain.
    for (const row of [ipRow, providerRow, countryRow, rankRow]) {
      row.setValue('Unavailable', 'muted');
    }
    await resetTabIcon(tab.id);
    return;
  }

  const { ip, country, asn, rank } = result.data;

  ipRow.setValue(ip);
  ipRow.setLink(ipDetailUrl(ip));

  providerRow.setValue(asn?.name ?? 'Unknown', asn === null ? 'muted' : 'default');
  providerRow.setLink(asn === null ? null : asnDetailUrl(asn.number));

  countryRow.setValue(country.name);
  countryRow.setLink(countryMapUrl(country.name));

  rankRow.setValue(
    rank === null ? 'Not ranked' : formatRank(rank),
    rank === null ? 'muted' : 'default',
  );

  // The flag image comes straight from the API; the emoji is the fallback for
  // when the API had no flag for this country.
  if (country.flag !== null) header.setFlagImage(country.flag);
  else header.setFlag(countryCodeToFlag(country.code));

  await setTabIcon(tab.id, country);
}

/** Replaces the rows with an empty state; the popup element keeps being the card. */
function showEmptyState(root: HTMLElement | null, kind: EmptyStateKind): void {
  if (!root) return;
  root.replaceChildren(createEmptyState(kind));
  root.classList.add('card--empty');
}

async function readActiveTab(): Promise<ActiveTab> {
  try {
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

void boot();
