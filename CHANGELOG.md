# Changelog

All notable changes are listed here. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and versions follow
[Semantic Versioning](https://semver.org/).

## [Unreleased]

### Added

- A website demo at glyph.cosmo030.com: the garden runs in any browser without installing anything.
  There the hint is on by default, a thin bar at the top links to the Chrome Web Store, the source
  and cosmo030.com, and the search box doesn't take focus on load and opens results in a new tab so
  the garden stays open. The extension itself works the same as before.
- The website version has a real title, a description for link previews and the Glyph Garden icon.
- Add `?newtab` to the website's URL to see the plain new-tab look (the store screenshots use it).
- The README links to the demo and the Chrome Web Store.
- Shooting stars in the Meadow: now and then one crosses the upper sky and fades (`*--···`). New Tune
  sliders for how often, how fast and how long the trail is.
- The Meadow is now a field that runs to the horizon. A sky gradient, two ranges of rolling hills and
  the field are painted behind the characters (new Landscape settings: sky colours and curve,
  horizon height, hill heights and colours, field colours). The grass is drawn in rows from the
  horizon to the front: far rows are tiny hazy marks that barely move, near blades are tall and sway,
  clumps and gaps break it up, and gusts of wind roll through the field toward you (Grass cover far
  and near, Distance haze, Gusts).
- Fireflies have a depth in the field: far ones are small, dim and slow, near ones hover higher and
  glow a little wider. Grass in front of a firefly hides it.
- Stray fireflies: now and then one drifts up out of the field into the low sky and fades away, and a
  new one fades in somewhere over the field (Strays per minute, Stray rise, Stray time).

### Changed

- The Meadow is calmer and reads more like a real night: the fireflies stay over the field (new Hover
  height and Hover pull sliders) and are smaller and softer. The sky above is open and clear, with
  many more stars in three sizes that twinkle slowly.
- Stars are now set as a density (Stars per 1000 sky cells), so large screens are as starry as small
  ones. The old Stars count is replaced.
- A new night greeting in the Meadow: "Keep an eye on the sky."
- Settings you have already saved keep their values, so you may still see the old, bigger fireflies.
  Use "Reset meadow" in the Tune panel's Meadow group to get the new defaults.
- The Meadow's hint now reads "tap the fireflies".

### Removed

- Press and hold on the Meadow (the light ring that fireflies gathered around), with its eight Tune
  sliders. A tap still makes the fireflies nearby flash.
- Store screenshot 4 is now the Meadow right after a tap (`04-meadow-tap.png`) instead of while
  holding.

## [0.3.0] - 2026-11-15

### Added

- An icon: a firefly glow drawn as character tiles on a dark rounded square (16, 32, 48 and 128 px).
- Store listing material in `store/`, a privacy policy (`PRIVACY.md`) and scripts that regenerate the
  icon, screenshots and promo images.
- MIT license, architecture guide, contributing guide, security policy.
- Continuous integration: type check, formatting check and all builds on every push and pull request.
- Scenes: each habitat is a scene with its own creatures, look and greeting lines. The koi are now the
  "Pond" scene. Pick one with the scene name at the bottom left or the left and right arrow keys; the
  pick is saved.
- A clock above the greeting, and new calm greeting lines for the morning, afternoon, evening and
  night.
- Night meadow scene: fireflies that flash and
  synchronise into waves and groups (pulse-coupled), swaying grass, twinkling stars and a deep
  blue-black sky. Each flash glows as a round ramp of characters (. : + *) on faint tiles, with a
  solid bright core. Press and hold lights a pulsing ring with a faint tinted fill that fireflies
  gather around; tap to make nearby ones flash. The grass has two greens and lighter tips that lean
  with the wind. New Tune group "Meadow" with sliders for all of it.
- Each scene can set its own background colour (the Meadow does) and its own greeting lines. The Pond
  keeps its colour and its lines, and the Meadow has its own calm lines for every part of the day.

### Changed

- The extension description is shorter and describes both scenes.
- Firefox: the manifest now declares that the add-on collects no data
  (`data_collection_permissions: { required: ["none"] }`), as Mozilla now asks of new add-ons, and the
  minimum Firefox version is 140, the first version that understands it.
- New default tuning: 77 koi, smaller and dimmer tiles (cell size 9, tile size 0.77, grid opacity
  0.02), a stronger and more opaque search glass, a less flexible tail fin, longer glides and 10
  pellets per click. The hint is now hidden by default. Settings you have already saved are not
  affected.
- The "Search glass blur" slider now goes from 0 to 10 px (was 0 to 40) and defaults to 2. The
  search glass tint now defaults to 0 (fully clear) and ripples to full opacity. A saved blur above
  10 is clamped to 10.
- New look for the page: the scene name and hint sit bottom left, and an icon-only sliders button
  (labelled "Tune") sits bottom right. The animal switcher, the "Tweaks" button and the toast are gone.
- "Tweaks" is now called "Tune" (the panel, the README and the docs). Your saved settings are kept.

### Fixed

- The "Search glass blur" slider (and the blur behind the species switcher) now works in the built
  extension in Chrome and Brave. The production CSS only contained the `-webkit-` form of
  `backdrop-filter`, which current Chromium browsers ignore.

## [0.2.0]

### Changed

- Koi swim like real fish: a 12-joint spine follows the swim path, a swimming wave runs from head
  to tail, and fish alternate between bursts of tail beats and glides.
- Splashes trigger an escape turn and fast tail beats.
- Forked tail fin that flexes and lags behind the body; pectoral and pelvic fins paddle.
- Turning is limited to a realistic radius, so fish can't spin on the spot.

### Added

- Translucent fin membranes and about 20 new swimming sliders in Tweaks.

## [0.1.0]

### Added

- New-tab page for Chrome and Firefox with greeting, search box and species switcher.
- WebGL2 glyph-grid renderer that draws every cell in one draw call.
- Koi: schooling, feeding with pellets, startle, growth, five colour types.
- Tweaks panel generated from a single parameter schema, with saving and presets.
