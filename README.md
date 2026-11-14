# Glyph Garden

A new-tab page full of animals made of keyboard characters. Feed the koi.

Works in Chrome, Brave, Edge and other Chromium browsers, and in Firefox.

## Status

- [x] Koi: schooling, tail wiggle, click to drop food, startle, eat, grow
- [x] Tweaks panel: every parameter is a live slider, saved automatically, with presets
- [x] WebGL2 renderer: every cell drawn in one instanced draw call
- [ ] Butterfly, Jellyfish, Dragonfly, Frog, Crane, Crab
- [ ] Store listings

## Develop

```bash
npm install
npm run dev            # opens Chrome with the extension loaded, live reload
npm run dev:firefox    # same for Firefox
npm run preview:serve  # the page as a normal website (works on phones)
```

## Build and package

```bash
npm run build          # .output/chrome-mv3
npm run build:firefox  # .output/firefox-mv2
npm run zip            # store-ready zips for both
```

To try it without the stores: open `brave://extensions` (or `chrome://extensions`),
turn on Developer mode, click **Load unpacked** and pick `.output/chrome-mv3`.

## How it fits together

```
src/
  params/schema.ts   every tunable value, declared once (min, max, step, default)
  params/panel.ts    Tweaks panel, generated from the schema
  params/store.ts    saves settings (extension storage, or localStorage on the web)
  render/            WebGL2 glyph-grid renderer and character atlas
  sim/               shared world, ripples, noise helpers
  species/koi.ts     one file per animal: shape, behaviour, drawing
  app.ts             page UI, input, fixed-timestep main loop
entrypoints/newtab/  the new-tab page (HTML + CSS)
```

Add a parameter: add one line to `schema.ts`. Its slider appears in Tweaks automatically.

Add an animal: create `src/species/<name>.ts` implementing `Species`, register it in `app.ts`.

Permissions: `storage` (saves your Tweaks) and `search` (the search box uses your default search engine).
