# Glyph Garden

A browser new-tab page full of animals made of keyboard characters. Click to feed the koi.

Every animal is drawn as a grid of small tiles, each holding a character like `#`, `%` or `/`.
The koi swim like real fish: their body bends along the path they take, a swimming wave runs from
head to tail, and they alternate between bursts of tail beats and gliding.

Works in Chrome, Brave, Edge and other Chromium browsers, and in Firefox.

## Features

- **Koi pond**: schooling koi in five colour types. Click to drop food: nearby fish startle away from
  the splash, then race back to eat and grow a little.
- **Tweaks panel**: every number in the simulation is a live slider. Settings save automatically,
  and you can copy and paste them as presets.
- **Fast**: a WebGL2 renderer draws every cell in a single draw call, the simulation creates no
  garbage while running, and everything pauses while the tab is hidden.
- **Private**: no network requests, no analytics. See [Privacy](#privacy).

Coming next: butterflies, jellyfish, dragonflies, frogs, cranes and crabs.

## Install from source

You need [Node.js](https://nodejs.org/) 22 or newer.

```bash
git clone https://github.com/cosmo030/glyph-garden.git
cd glyph-garden
npm install
npm run build
```

Then load it into your browser:

- **Chrome, Brave, Edge**: open `chrome://extensions` (or `brave://extensions`), turn on **Developer mode**,
  click **Load unpacked** and choose the `.output/chrome-mv3` folder.
- **Firefox**: run `npm run build:firefox`, open `about:debugging#/runtime/this-firefox`, click
  **Load Temporary Add-on** and choose any file in `.output/firefox-mv2`.

Open a new tab.

## Development

| Command                 | What it does                                                 |
| ----------------------- | ------------------------------------------------------------ |
| `npm run dev`           | Opens Chrome with the extension loaded and live reload       |
| `npm run dev:firefox`   | The same in Firefox                                          |
| `npm run preview:serve` | Runs the page as a normal website (handy for testing phones) |
| `npm run build`         | Builds the Chrome extension into `.output/chrome-mv3`        |
| `npm run build:firefox` | Builds the Firefox add-on into `.output/firefox-mv2`         |
| `npm run zip`           | Creates store-ready zips for both browsers                   |
| `npm run check`         | Type-checks and checks formatting (what CI runs)             |
| `npm run format`        | Formats all files with Prettier                              |

How the code is organised, and how to add a parameter or a new animal:
[docs/ARCHITECTURE.md](docs/ARCHITECTURE.md).

## Privacy

Glyph Garden collects nothing and sends nothing anywhere.

- It asks for two permissions: `storage`, to save your Tweaks on your device, and `search`, so the
  search box uses the search engine you already chose in your browser.
- It makes no network requests of its own.

## Contributing

Contributions are welcome. Please read [CONTRIBUTING.md](CONTRIBUTING.md) first. To report a
security problem, see [SECURITY.md](SECURITY.md).

## Credits

Inspired by a short video of ASCII animals on a new-tab page by stephenz.mp4. This is an independent
implementation; no code was copied.

## License

[MIT](LICENSE) © 2026 cosmo030
