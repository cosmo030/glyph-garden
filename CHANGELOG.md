# Changelog

All notable changes are listed here. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and versions follow
[Semantic Versioning](https://semver.org/).

## [Unreleased]

### Added

- MIT license, architecture guide, contributing guide, security policy.
- Continuous integration: type check, formatting check and all builds on every push and pull request.

### Changed

- New default tuning: 77 koi, smaller and dimmer tiles (cell size 9, tile size 0.77, grid opacity
  0.02), a stronger and more opaque search glass, a less flexible tail fin, longer glides and 10
  pellets per click. The hint is now hidden by default. Settings you have already saved are not
  affected.

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
