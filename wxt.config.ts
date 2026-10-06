import { defineConfig } from 'wxt';

export default defineConfig({
  srcDir: 'src',
  manifest: {
    name: 'Country Flag',
    description:
      'Shows the country flag, server IP, country and Tranco rank of the active website.',
    // Only what the popup really needs: read the active tab URL + cache results.
    permissions: ['storage', 'tabs'],
    // The single API the extension talks to, plus the direct Tranco fallback
    // used when that API reports no rank.
    host_permissions: ['https://geoip.kristal.id/*', 'https://tranco-list.eu/*'],
    icons: {
      16: 'icon/16.png',
      32: 'icon/32.png',
      48: 'icon/48.png',
      128: 'icon/128.png',
    },
    action: {
      default_title: 'Country Flag',
      default_icon: {
        16: 'icon/16.png',
        32: 'icon/32.png',
        48: 'icon/48.png',
        128: 'icon/128.png',
      },
    },
  },
});
