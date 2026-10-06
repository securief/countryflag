import { countCacheEntries, clearCache } from '@/lib/cache';
import {
  applyThemePreference,
  getThemePreference,
  isThemePreference,
  setThemePreference,
  type ThemePreference,
} from '@/lib/settings';
import '@/assets/theme.css';
import './style.css';

/** Options page: theme preference + cache controls. */
function readElements() {
  return {
    theme: document.querySelector<HTMLElement>('#theme'),
    cacheCount: document.querySelector<HTMLElement>('#cache-count'),
    clearButton: document.querySelector<HTMLButtonElement>('#clear-cache'),
    status: document.querySelector<HTMLElement>('#status'),
  };
}

async function boot(): Promise<void> {
  const { theme, cacheCount, clearButton, status } = readElements();
  if (!theme || !cacheCount || !clearButton || !status) return;

  // Theme: apply before anything else so the page never flashes the wrong one.
  const preference = await getThemePreference();
  applyThemePreference(preference);
  markSelected(theme, preference);

  theme.addEventListener('click', (event) => {
    const option = (event.target as Element).closest<HTMLButtonElement>('button[data-value]');
    const value: unknown = option?.dataset.value;
    if (!isThemePreference(value)) return;

    applyThemePreference(value);
    markSelected(theme, value);
    void setThemePreference(value);
  });

  await showCacheCount(cacheCount);

  clearButton.addEventListener('click', () => {
    void (async () => {
      clearButton.disabled = true;
      await clearCache();
      await showCacheCount(cacheCount);
      clearButton.disabled = false;
      status.textContent = 'Cache cleared. Everything will be looked up again on the next visit.';
    })();
  });
}

function markSelected(group: HTMLElement, value: ThemePreference): void {
  for (const option of group.querySelectorAll<HTMLButtonElement>('button[data-value]')) {
    const selected = option.dataset.value === value;
    option.classList.toggle('segmented__option--selected', selected);
    option.setAttribute('aria-pressed', String(selected));
  }
}

async function showCacheCount(element: HTMLElement): Promise<void> {
  const count = await countCacheEntries();
  element.textContent = count === 1 ? '1 entry' : `${count} entries`;
}

void boot();
