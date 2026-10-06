import { defineConfig } from 'wxt';

export default defineConfig({
  srcDir: 'src',
  manifest: {
    name: 'Country Flag',
    description:
      'Shows the country flag, server IP, country and Tranco rank of the active website.',
    // Only what the popup really needs: read the active tab URL + cache results.
    permissions: ['storage', 'tabs'],
    // Narrow host permissions for the public services the extension talks to.
    // flagsapi.com sends no CORS header, so this one is required.
    host_permissions: [
      'https://dns.google/*',
      'https://api.ip.sb/*',
      'https://tranco-list.eu/*',
      'https://flagsapi.com/*',
    ],
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
