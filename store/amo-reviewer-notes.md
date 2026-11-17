# Notes for Firefox Add-ons reviewers

Glyph Garden is a new-tab page. It collects nothing, makes no network requests, loads no remote code
and uses two permissions: `storage` and `search`. The source is public:
https://github.com/cosmo030/glyph-garden

Paste the text below into the "Notes to Reviewer" box when you upload the sources zip.

## Rebuilding the Firefox build from the sources zip

Requirements: Node.js 22 (the `engines` field in `package.json` asks for 22 or newer) and npm, on any OS. No other tools,
accounts or environment variables are needed.

```bash
unzip glyph-garden-0.3.0-sources.zip -d glyph-garden-sources
cd glyph-garden-sources
npm ci
npm run build:firefox
```

The add-on is then in `.output/firefox-mv2/` and matches the uploaded package. To get the same zip
that was uploaded, run `npm run zip` (or `npx wxt zip -b firefox`) instead of the last command; it
writes `.output/glyph-garden-0.3.0-firefox.zip`.

The build is WXT (a Vite wrapper) plus TypeScript. All dependencies are pinned by `package-lock.json`
and come from npm. The only runtime dependency is `tweakpane` (the settings panel), which is bundled
into the add-on; nothing is minified by hand or generated outside the build.

## What is where

- `entrypoints/newtab/`: the new-tab page (HTML, CSS, `main.ts`).
- `src/`: the page code (TypeScript): renderer, scenes, settings panel.
- `public/icon/`: the icon PNGs, generated from `art/icon.svg` by `scripts/make-icons.mjs` (not part of
  the build; the PNGs are committed).
- `wxt.config.ts`: the manifest (name, description, permissions, the Firefox ID and data declaration).

## Permissions and data

- `storage`: saves the user's settings in `storage.local`.
- `search`: the search box calls `search.query` so the query goes to the user's default search engine.
- Data collection: the manifest declares `data_collection_permissions: { required: ["none"] }`.
- There are no content scripts, no background page, no web requests and no `eval`. The add-on does not
  read the pages the user visits.

One thing a reviewer may notice in `src/app.ts`: if neither `browser.search` nor `chrome.search` exists,
the search box opens a plain Google search URL in a new tab. That path exists only for the page served
as a plain website (the development preview, `npm run preview:serve`, and the public demo at
glyph.cosmo030.com); inside the add-on the search API is always there, so it never runs.

## Testing

Open a new tab. Click the scene name (bottom left) or press the left and right arrow keys to switch
between the Pond and the Meadow; click on the Pond to drop food; tap near the fireflies on the Meadow to make
them flash. The sliders button (bottom right) opens the Tune panel.
