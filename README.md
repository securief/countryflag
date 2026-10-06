# Country Flag

A lightweight Chrome extension (Manifest V3) that shows what the tab you are on
is actually serving:

```
┌────────────────────────────────────────┐
│ 🇺🇸                         google.com   │
├────────────────────────────────────────┤
│ IP                         142.250.x.x ›│
├────────────────────────────────────────┤
│ Provider                      Google LLC│
├────────────────────────────────────────┤
│ Country                  United States ›│
├────────────────────────────────────────┤
│ Rank                                  #1│
└────────────────────────────────────────┘
```

The header, the IP, Provider and Country rows open the matching public detail
page in a new tab. The Rank row is intentionally not a link: Tranco only exposes
a raw API endpoint, there is no page a user would want to land on.

## Getting started

```bash
npm install     # also runs `wxt prepare`
npm run dev     # launches Chrome with the extension loaded
npm run build   # production build in .output/chrome-mv3
npm run zip     # distributable archive in .output
npm run compile # TypeScript check (tsc --noEmit)
npm run icons   # regenerate public/icon/*.png
```

## Architecture

```
src/
├── assets/
│   └── theme.css              # shared palette + data-theme switching
├── entrypoints/
│   ├── background.ts          # wires the icon sync + cache reset on update
│   ├── options/
│   │   ├── index.html         # theme + cache controls (open_in_tab)
│   │   ├── main.ts
│   │   └── style.css
│   └── popup/
│       ├── index.html
│       ├── main.ts            # active tab → domain → parallel lookups → rows
│       ├── components.ts      # InfoHeader / InfoList / InfoListItem
│       └── style.css          # inset grouped list
├── lib/
│   ├── icon-sync.ts           # per-tab toolbar icon: events, races, re-apply
│   ├── action-icon.ts         # renders flags into the toolbar icon
│   ├── cache.ts               # generic chrome.storage.local cache with TTLs
│   ├── settings.ts            # stored preferences (theme)
│   ├── site.ts                # domain + IP + country of a tab (shared)
│   ├── domain.ts              # hostname normalization, private ranges
│   ├── dns.ts                 # DNS-over-HTTPS A records (dns.google)
│   ├── geo-ip.ts              # api.ip.sb GEO-IP lookup (country + provider)
│   ├── country-codes.ts       # ISO alpha-2 → emoji + local region names
│   ├── flag-image.ts          # flagsapi.com download + local flag cache
│   ├── tranco.ts              # tranco-list.eu rank lookup
│   └── links.ts               # every external URL + "open in a new tab"
└── types/
    └── api.ts                 # shapes of the untrusted API responses
```

Networking lives in `lib/`, never in the UI. The popup does not message the
service worker: it has host permissions itself, so every request goes out
directly. `background.ts` only wires lifecycle work.

The popup element *is* the card (`<main id="app" class="app card">`), so the
header and the row list sit directly inside it: a flat, full-bleed surface with
no nested wrapper, no outer padding and no border or rounded corners.

## Data sources

| Row | Source | Notes |
| --- | --- | --- |
| IP | `https://dns.google/resolve?name=<domain>&type=A` | First valid A record. AAAA-only hosts show `Unavailable`. |
| Country | `https://api.ip.sb/geoip/<ip>` | `country_code` is used; `403`/`404` → `Unknown`. |
| Provider | `https://api.ip.sb/geoip/<ip>` | `asn_organization` plus `asn` from the same response — no second request. |
| Rank | `https://tranco-list.eu/api/ranks/domain/<domain>` | Newest daily entry. Empty list → `Not ranked`. |
| Flag | `https://flagsapi.com/<CC>/flat/24.png` | Flat PNG, ~0.2 KB of base64 per country. Not called when the country is unknown. |

Country **names** are resolved locally with `Intl.DisplayNames` — no extra
request. Flag **images** are downloaded once per country and cached as base64,
so later visits work offline. Flags API serves a 4:3 flag centred in a square
`24x24` canvas (`flat` style), which keeps the cached string around 250
characters. The size is the *source resolution* only: the toolbar icon is always
Chrome's 16/32px and the popup header is sized by `--flag-size` in `style.css`.
The Unicode emoji is only a fallback for when the image cannot be loaded:
platforms such as Windows render regional indicators as the two-letter code
instead of a flag, which is why the image is fetched at all.

### External rows

* Header (domain) → `https://ip.sb/domain/<domain>`
* IP → `https://ip.sb/geoip/<ip>`
* Provider → `https://bgp.tools/as/<asn>`
* Country → `https://www.google.com/maps/place/<Country+Name>/`
* Rank → not clickable

## Toolbar icon

The extension starts with a globe icon. Opening a page (or switching to its tab)
makes the service worker detect the country and replace the icon of *that tab*
with that country's flag — no need to open the popup. The icon is re-applied on
every load event, because a refresh reports no URL change and Chrome drops
per-tab icons when a page navigates. The flag image is fetched once per country
and cached, so every later visit is instant and offline; requests are shared
between the worker and the popup, so a page is never looked up twice. Tabs whose
country cannot be determined (no A record, API failure, `chrome://`, `file://`,
...) keep the globe, never a wrong flag. If the flag image itself cannot be
downloaded the icon falls back to the emoji, i.e. the two-letter country code on
Windows.

## Options page

Open it from `chrome://extensions` → **Details** → **Extension options**, or by
right-clicking the toolbar icon → **Options**. It opens in its own tab
(`options_ui.open_in_tab`).

| Setting | What it does |
| --- | --- |
| **Appearance**: System / Light / Dark | Stored as `settings:theme` in `chrome.storage.local` and applied to both the popup and the options page. `System` follows `prefers-color-scheme`; Light and Dark override it (useful when the OS theme and the popup should differ). |
| **Cache**: count + **Clear cache** | Shows how many lookups are cached and clears them all in one click (DNS, country/provider, rank and the stored flag images). |

Settings are not cache: clearing the cache never touches them, and the theme is
applied before the popup renders its DOM, so nothing flashes.

## Behaviour

* **Loading**: the popup renders instantly and every value is replaced as soon
  as it arrives. DNS/rank run in parallel, country follows the IP.
* **Isolation**: each source has its own state (`Loading`, `Available`,
  `Unavailable`, `Unknown`, `Not ranked`). A Tranco `429` never hides the IP,
  and a failed GEO-IP lookup never hides the domain.
* **Unsupported pages**: `chrome://`, `chrome-extension://`, `edge://`,
  `about:`, `file://` and `view-source:` show "No website information". Pages on
  the machine itself (`localhost`, `*.local`, `*.internal`, `10/8`, `172.16/12`,
  `192.168/16`, `127/8`, link-local, CGNAT) show "Private connection - Localhost
  or Private IP address" and are never sent to any API.
* **Caching** (`chrome.storage.local`, `{ value, cachedAt }`): DNS 10 minutes,
  country 24 hours, rank 24 hours, flags a year. Only successful lookups are
  cached, so a failing API is retried on the next open. `background.ts` clears
  the cache after an extension update.

## Hostnames

`https://www.google.com/search?q=test` becomes `google.com`: the hostname is
lowercased, the trailing root dot and the port are removed, and a leading
`www.` is dropped because it is never meaningful. Other subdomains are preserved
(`blog.example.com` stays `blog.example.com`). If the short form has no A record,
DNS is retried once with the hostname exactly as the tab reported it.

The registrable domain is intentionally *not* guessed with a string split — that
breaks on `co.uk`, `github.io`, `s3.amazonaws.com` and friends.

## Permissions

| Permission | Why |
| --- | --- |
| `storage` | Cache lookups and flag images. |
| `tabs` | Read tab URLs and keep the per-tab toolbar icon in sync. |
| `https://dns.google/*`, `https://api.ip.sb/*`, `https://tranco-list.eu/*`, `https://flagsapi.com/*` | Fetch the public services the extension needs. Flags API sends no CORS header, so this permission is required for its requests to work at all. |

No `<all_urls>`, no content scripts, no injected code. Remote responses are
treated as untrusted: values are validated, rendered with `textContent` and
every external URL is built by a validating helper.

## Tech

WXT + TypeScript + vanilla HTML/CSS, Manifest V3, no runtime dependencies.
