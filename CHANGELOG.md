# Changelog

All notable changes are listed here. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and versions follow
[Semantic Versioning](https://semver.org/).

## [Unreleased]

### Added

- MIT license, architecture guide, contributing guide, security policy.
- Continuous integration: type check, formatting check and all builds on every push and pull request.
- Scenes: each habitat is a scene with its own hours of the day. The koi are now the "Pond" scene.
  The scene follows your clock by default (new Page settings: Scene follows the clock, Day starts,
  Night starts), is re-checked every minute, and can be picked by hand with the scene name at the
  bottom left or the left and right arrow keys. A hand pick is saved.
- A clock above the greeting, and new calm greeting lines for the morning, afternoon, evening and
  night.
- Night meadow scene, shown from the night start to the day start: fireflies that flash and
  synchronise into waves and groups (pulse-coupled), swaying grass, twinkling stars and a deep
  blue-black sky. Each flash glows as a round ramp of characters (. : + *) on faint tiles, with a
  solid bright core. Press and hold lights a pulsing ring with a faint tinted fill that fireflies
  gather around; tap to make nearby ones flash. The grass has two greens and lighter tips that lean
  with the wind. New Tune group "Meadow" with sliders for all of it.
- Each scene can set its own background colour (the Meadow does) and its own greeting lines. The Pond
  keeps its colour and its lines, and the Meadow has its own calm lines for every part of the day.

### Changed

- New default tuning: 77 koi, smaller and dimmer tiles (cell size 9, tile size 0.77, grid opacity
  0.02), a stronger and more opaque search glass, a less flexible tail fin, longer glides and 10
  pellets per click. The hint is now hidden by default. Settings you have already saved are not
  affected.
- The "Search glass blur" slider now goes from 0 to 10 px (was 0 to 40) and defaults to 10. A saved
  value above 10 is clamped to 10.
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
