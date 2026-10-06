/**
 * Popup building blocks, following the "inset grouped list" pattern:
 *
 *   <main class="card">            the popup element itself
 *   ├── InfoHeader                 flag + domain, opens https://ip.sb/domain/<domain>
 *   └── InfoList
 *       ├── InfoListItem IP
 *       ├── InfoListItem Provider
 *       ├── InfoListItem Country
 *       └── InfoListItem Rank
 *
 * Every item is a real <button>, so the whole row is clickable and reachable
 * with Tab/Enter. Only `textContent` is ever used for values - nothing from the
 * network is parsed as markup.
 */

import { openExternal } from '@/lib/links';

export type InfoRowId = 'ip' | 'provider' | 'country' | 'rank';

/** `loading` pulses, `muted` is used for "Unavailable"/"Unknown"/"Not ranked". */
export type RowTone = 'default' | 'muted' | 'loading';

export interface InfoRowOptions {
  id: InfoRowId;
  label: string;
}

export interface InfoRowHandle {
  readonly id: InfoRowId;
  readonly element: HTMLLIElement;
  setValue(value: string, tone?: RowTone): void;
  /** A `null` link turns the row into a non-interactive list item. */
  setLink(url: string | null): void;
}

export interface InfoHeaderHandle {
  readonly element: HTMLButtonElement;
  setDomain(domain: string): void;
  /** Shows a country flag as text (the emoji, or its two-letter fallback). */
  setFlag(flag: string): void;
  /** Shows a real flag image; falls back to `setFlag` when unavailable. */
  setFlagImage(src: string): void;
  setLink(url: string | null): void;
}

export interface InfoListHandle {
  readonly element: HTMLUListElement;
  row(id: InfoRowId): InfoRowHandle;
}

export const LOADING_TEXT = 'Loading…';

export function createInfoHeader(): InfoHeaderHandle {
  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'header';

  const flag = document.createElement('span');
  flag.className = 'header__flag';
  flag.textContent = '🌐';

  const domain = document.createElement('span');
  domain.className = 'header__domain';
  domain.textContent = LOADING_TEXT;
  domain.classList.add('is-loading');

  button.append(flag, domain, createChevron());

  const link = createLinkBehaviour(button);
  setInteractive(button, false);

  return {
    element: button,
    setDomain(value) {
      domain.textContent = value;
      domain.classList.remove('is-loading');
      button.title = value;
    },
    setFlag(value) {
      flag.replaceChildren(value);
    },
    setFlagImage(src) {
      const image = document.createElement('img');
      image.src = src;
      image.alt = '';
      flag.replaceChildren(image);
    },
    setLink(url) {
      link.set(url);
      setInteractive(button, url !== null, 'header--link');
    },
  };
}

export function createInfoList(rows: readonly InfoRowOptions[]): InfoListHandle {
  const list = document.createElement('ul');
  list.className = 'list';

  const handles = new Map<InfoRowId, InfoRowHandle>();
  for (const options of rows) {
    const row = createInfoListItem(options);
    handles.set(options.id, row);
    list.append(row.element);
  }

  return {
    element: list,
    row(id) {
      const handle = handles.get(id);
      if (!handle) throw new Error(`Unknown info row: ${id}`);
      return handle;
    },
  };
}

/** The two empty states the popup can show instead of rows. */
const EMPTY_STATES = {
  /** localhost, private IP ranges, mDNS names: nothing to look up. */
  private: {
    title: 'Private connection',
    text: 'Localhost or Private IP address',
  },
  /** chrome://, file://, view-source:, ... - pages that cannot be inspected. */
  unsupported: {
    title: 'No website information',
    text: 'This page cannot be inspected by the extension.',
  },
} as const;

export type EmptyStateKind = keyof typeof EMPTY_STATES;

/** Content of an empty state; the popup element itself already is the card. */
export function createEmptyState(kind: EmptyStateKind): DocumentFragment {
  const { title, text } = EMPTY_STATES[kind];

  const titleElement = document.createElement('p');
  titleElement.className = 'empty__title';
  titleElement.textContent = title;

  const textElement = document.createElement('p');
  textElement.className = 'empty__text';
  textElement.textContent = text;

  const fragment = document.createDocumentFragment();
  fragment.append(titleElement, textElement);
  return fragment;
}

function createInfoListItem(options: InfoRowOptions): InfoRowHandle {
  const item = document.createElement('li');
  item.className = 'list-item';

  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'row';
  button.dataset.row = options.id;

  const label = document.createElement('span');
  label.className = 'row__label';
  label.textContent = options.label;

  const value = document.createElement('span');
  value.className = 'row__value';

  button.append(label, value, createChevron());
  item.append(button);

  const link = createLinkBehaviour(button);
  setInteractive(button, false);

  const handle: InfoRowHandle = {
    id: options.id,
    element: item,
    setValue(text, tone = 'default') {
      value.textContent = text;
      // Long values truncate with an ellipsis; the tooltip shows the full text.
      value.title = text;
      value.classList.toggle('row__value--muted', tone === 'muted');
      value.classList.toggle('row__value--loading', tone === 'loading');
    },
    setLink(url) {
      link.set(url);
      setInteractive(button, url !== null, 'row--link');
    },
  };

  handle.setValue(LOADING_TEXT, 'loading');
  return handle;
}

function createChevron(): HTMLSpanElement {
  const chevron = document.createElement('span');
  chevron.className = 'chevron';
  chevron.setAttribute('aria-hidden', 'true');
  return chevron;
}

/** Keeps the "open in a new tab" click behaviour in one place. */
function createLinkBehaviour(element: HTMLElement): { set(url: string | null): void } {
  let current: string | null = null;

  element.addEventListener('click', () => {
    if (current !== null) void openExternal(current);
  });

  return {
    set(url) {
      current = url;
    },
  };
}

function setInteractive(element: HTMLElement, interactive: boolean, className?: string): void {
  if (className) element.classList.toggle(className, interactive);
  element.tabIndex = interactive ? 0 : -1;
  element.setAttribute('aria-disabled', String(!interactive));
}
