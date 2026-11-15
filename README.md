# Glyph Garden

A browser new-tab page where animals made of keyboard characters live in habitats that change with
the time of day. Right now there is a koi pond: click to feed the koi.

Every animal is drawn as a grid of small tiles, each holding a character like `#`, `%` or `/`.
The koi swim like real fish: their body bends along the path they take, a swimming wave runs from
head to tail, and they alternate between bursts of tail beats and gliding.

Works in Chrome, Brave, Edge and other Chromium browsers, and in Firefox.

## Features

- **Scenes**: each habitat is a scene with its own hours of the day, and by default the scene follows
  your clock: the Pond by day (06:00 to 19:00 by default) and the Meadow by night (change the hours in
  Tune > Page). Click the scene name at the bottom left, or press the left and right arrow keys, to
  step through Auto and each scene.
- **Night meadow**: fireflies drift over swaying grass under a few twinkling stars. Each firefly
  flashes on its own cycle, and neighbours nudge each other, so over half a minute or so the meadow
  falls into flashing waves and groups. Press and hold to light a soft ring that the fireflies gather
  and circle around; tap to make the nearby ones flash.
- **Koi pond**: schooling koi in five colour types. Click to drop food: nearby fish startle away from
  the splash, then race back to eat and grow a little.
- **Tune panel**: every number in the simulation is a live slider. Settings save automatically,
  and you can copy and paste them as presets.
- **Fast**: a WebGL2 renderer draws every cell in a single draw call, the simulation creates no
  garbage while running, and everything pauses while the tab is hidden.
- **Private**: no network requests, no analytics. See [Privacy](#privacy).

Coming next: more scenes. Butterflies, jellyfish, dragonflies, frogs, cranes and crabs are planned.

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

- It asks for two permissions: `storage`, to save your Tune settings on your device, and `search`, so the
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
