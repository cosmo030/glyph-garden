import { defineConfig } from 'wxt';

// The new-tab page lives in entrypoints/newtab. WXT turns that folder into
// chrome_url_overrides.newtab for Chrome and Firefox automatically. The icons come from
// public/icon/{16,32,48,128}.png (made from art/icon.svg by scripts/make-icons.mjs), which WXT
// adds to the manifest by itself.
export default defineConfig({
  manifest: ({ browser }) => ({
    name: 'Glyph Garden',
    // The stores show this as the short description; Chrome allows at most 132 characters.
    description: 'A calm new tab of animals drawn with keyboard characters. Feed the koi, or hold still for fireflies.',
    // storage: saves your Tune settings. search: sends the search box to your default engine.
    permissions: ['storage', 'search'],
    ...(browser === 'firefox'
      ? {
          browser_specific_settings: {
            gecko: {
              id: 'glyph-garden@cosmo030',
              // 140 is the first Firefox that reads data_collection_permissions (see below).
              strict_min_version: '140.0',
              // Mozilla asks new add-ons to declare what they collect. "none" is the value for an
              // add-on that collects and sends nothing, which is what this one does.
              data_collection_permissions: { required: ['none'] },
            },
          },
        }
      : {}),
  }),
  zip: {
    // Keep the sources zip to what a reviewer needs to rebuild the add-on: no secrets, no installed
    // packages, no build output, no generated store images (they are large and not part of the build).
    excludeSources: ['.env', '.env.*', 'store/screenshots/**', 'store/*.png', 'dist-preview/**'],
  },
});
