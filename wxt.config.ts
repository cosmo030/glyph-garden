import { defineConfig } from 'wxt';

// The new-tab page lives in entrypoints/newtab. WXT turns that folder into
// chrome_url_overrides.newtab for Chrome and Firefox automatically.
export default defineConfig({
  manifest: ({ browser }) => ({
    name: 'Glyph Garden',
    description: 'A new tab full of animals made of keyboard characters. Feed the koi.',
    // storage: saves your Tune settings. search: sends the search box to your default engine.
    permissions: ['storage', 'search'],
    ...(browser === 'firefox'
      ? {
          browser_specific_settings: {
            gecko: { id: 'glyph-garden@cosmo030', strict_min_version: '115.0' },
          },
        }
      : {}),
  }),
});
