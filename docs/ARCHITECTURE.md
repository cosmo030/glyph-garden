# Architecture

How Glyph Garden is put together, and where to make common changes.

## The big picture

```
 Tune panel ──► param schema ◄── saved settings
                      │
                      ▼
 page UI ──► simulation (active scene) ──► renderer ──► <canvas>
 input   ──►        │
                    └── ripples and other shared effects
```

- **Param schema** (`src/params/schema.ts`) declares every tunable value once: label, min, max,
  step and default. The Tune panel, saved settings, presets and defaults are all generated
  from it.
- **Scenes** (`src/scenes/*`) are the habitats. Each scene owns its creatures, moves them and draws
  them; the registry in `src/scenes/index.ts` picks which one is on show. See [Scenes](#scenes).
- **Simulation** (`src/sim/*` and the active scene) moves the creatures. It runs at a fixed 60 steps
  per second, independent of the screen's refresh rate.
- **Renderer** (`src/render/*`) draws a grid of character cells with WebGL2. Behind them it paints a
  flat colour, or a scene's landscape (sky gradient, hills, field).
- **Page UI** (`entrypoints/newtab/*`, `src/app.ts`) is plain HTML and CSS on top of the canvas:
  clock, greeting, search box, the scene name (bottom left) and the Tune button (bottom right).
  Served as a website, the same page becomes the demo: see [Website demo](#website-demo).

## Folder layout

```
entrypoints/newtab/   the new-tab page: index.html, style.css, main.ts
src/
  app.ts              wires everything together; main loop; input; page UI
  params/
    schema.ts         every parameter, declared once
    panel.ts          Tune panel, generated from the schema (Tweakpane)
    store.ts          saving and loading settings
  render/
    renderer.ts       WebGL2 glyph-grid renderer
    atlas.ts          draws all characters once into a texture
    landscape.ts      the Landscape type and the hill shape (mirrored in the background shader)
    color.ts          colour packing helpers
  sim/
    world.ts          shared World type, Scene interface, ripple effects
    effects-draw.ts   draws ripples
    noise.ts          hashing and smooth noise
    clock.ts          the time of day the page shows (and the ?at= override)
    colors.ts         cached hex-to-RGB parsing
  scenes/
    index.ts          the scene registry (the order the name button cycles through)
    pond.ts           the Pond scene: koi movement, feeding, drawing
    meadow.ts         the Meadow scene (night): fireflies, field, sky
    meadow-sky.ts     the Meadow's colours through the day (keyframes)
  ui/
    greeting.ts       the clock text, and picking a greeting from the scene's lines
    demo.ts           the website demo: adds the top bar with store links
public/icon/          the extension icon PNGs (16, 32, 48, 128), made from art/icon.svg
art/                  icon.svg, the source of the icon
scripts/              make-icons.mjs and store-assets.mjs (Node only, driving a local Chromium browser)
store/                store listing text, screenshots and promo images (see below)
docs/                 this file
```

## Store release files

`npm run icons` redraws `public/icon/*.png` from `art/icon.svg`; WXT finds the PNGs by name and adds
them to both manifests. `npm run store:assets` builds the web preview and takes the store
screenshots (1280x800) and promo images into `store/`, so they can be redone after a visual change.
Both scripts only talk to a browser on this machine. `store/listing.md` and
`store/amo-reviewer-notes.md` hold the text for the two store forms, and `PRIVACY.md` is the privacy
policy both stores link to. `npm run zip` makes the Chrome zip, the Firefox zip and the Firefox
sources zip in `.output/`; `wxt.config.ts` keeps secrets and generated images out of the sources zip.

## Website demo

`npm run preview:build` builds the new-tab page as a plain website into `dist-preview/`. Vercel
deploys that to [glyph.cosmo030.com](https://glyph.cosmo030.com) on every push to `main`
(`vercel.json` holds the build command and output folder).

When the page is not running inside the extension (no `runtime.id`), `src/ui/demo.ts` turns it into
the demo: the hint is on by default, and a thin bar at the top links to the stores, the source and
cosmo030.com. The store links live in `GET_LINKS` in that file. The search box stays, since it is what
makes the page read as a new tab; with no search API it opens a Google search in a new tab (see
`search()` in `src/app.ts`). A small plugin in `vite.preview.config.ts` adds the website's title,
description and favicon and removes the search box's `autofocus`, so arrow keys switch scenes right
away. The extension keeps "New Tab" as its title and its autofocus.

Add `?newtab` to the URL to see the plain new-tab look on the website. `npm run store:assets` does
this, so the store screenshots show the page as the extension does.

## Units and coordinates

- Positions and distances are in **grid cells**, not pixels. A koi of length 13 is 13 cells long,
  whatever the cell size is. Changing **World > Cell size** zooms the whole scene.
- Time is in **seconds**. Speeds are in cells per second.
- Angles are in **radians**, measured clockwise from the right (screen y points down).
  Sliders show degrees where that is easier to read.

## Scenes

A **scene** is a habitat: its own creatures, look and greeting lines. It implements the `Scene`
interface in `src/sim/world.ts`:

- `id`, `name`, `hint`: the saved key, the name shown bottom left ("Pond") and the hint under it.
- `greetings`: the scene's own greeting lines for each band (morning, afternoon, evening, night). The
  page picks one per band per day (`src/ui/greeting.ts`), and puts the name in front if there is one.
- `background?(world)`: an optional background colour (`#rrggbb`). It is a method so it can read the
  scene's own settings and stay tunable. The renderer uses it for the active scene, and falls back to
  World > Background when a scene leaves it out (the Pond does).
- `enter`, `rescale`, `step`, `draw`, `pointerDown`, `pointerUp`, `count`: the same lifecycle the
  koi always had. `pointerUp` is the end of a press that began on the canvas, so a scene can tell a
  quick tap from a long press.

**Which scene is on show** (`src/app.ts`, `src/scenes/index.ts`):

- Scenes are only picked by hand. Clicking the scene name, or pressing the left and right arrow keys
  while no text field has focus, steps through the scenes in registry order and wraps round. The pick
  is saved as the hidden `page.scene`; if it is empty or stale, the first registered scene is used.
  With one scene registered the name is plain text and nothing cycles.
- The clock and greeting are redrawn once a minute (on the minute) and whenever the tab becomes
  visible. The greeting band (morning, afternoon, evening, night) is about wording only.

## Renderer

Each cell has: grid position, tile colour (with alpha), glyph colour (with alpha) and a glyph index.

1. At startup every character is drawn once into a texture (the atlas).
2. Each frame, the active scene calls `renderer.push(x, y, tileColour, glyphColour, glyph)` for every cell.
   Cells live in one preallocated `ArrayBuffer` (20 bytes per cell). Colours are packed into
   32-bit integers.
3. `renderer.draw()` paints the background, uploads the buffer once and draws all cells with a
   single instanced draw call. The fragment shader draws a rounded tile and the glyph on top.

The background is one full-screen triangle. It paints a flat colour and the grid lines, or, when the
active scene returns a `Landscape` from `landscape(world)`, a sky gradient (top to horizon, bent by
Sky gradient curve), two ranges of rolling hills and a field gradient below the horizon. It is done
per pixel so the hill lines are smooth. The hill shape is `hillHeight()` in `src/render/landscape.ts`
and the same formula in the shader, so scene code knows where the hills are; keep the two in step.

A tile colour with alpha 0 draws only the character (used for fins, ripples). Later cells are
drawn on top of earlier ones.

## Simulation loop

`src/app.ts` runs `requestAnimationFrame`. Each frame it advances the simulation in fixed steps of
1/60 s (at most 6 steps per frame, so a slow device slows down instead of freezing), then renders
once. When the tab is hidden the loop stops entirely.

Only the active scene runs. Switching scene calls its `enter()` to spawn its creatures.

## Performance rules

These keep a new tab instant even on older laptops:

- **No allocation per frame.** Animal state is stored in typed arrays (one array per property, one
  slot per animal), not in objects. Scratch values are reused. Colours are parsed once and cached.
- **One draw call.** All cells go through the single instanced draw described above.
- **Neighbour lookups use a grid.** Each koi only checks fish in nearby grid buckets.
- **Pause when hidden.**

Tune > Performance shows frames per second, cells drawn and animal count.

## How the koi work

See the header comment in `src/scenes/pond.ts` for the full description. In short:

- **Steering.** Each step a fish adds up where it wants to go: forward momentum, wandering, the water
  current, schooling (separation, alignment, cohesion), food, the cursor and any splash.
- **Burst and glide.** A fish beats its tail for a few strokes, then glides while slowing down.
  Hungry or frightened fish keep beating, faster.
- **Turning** is limited by a turn rate and by a minimum turning radius relative to body length, so
  a fish cannot spin on the spot. A fright allows a sharp C-turn.
- **Spine.** 12 joints behind the head. Each joint follows the one in front, so the body curves
  along the swim path.
- **Swimming wave.** When drawn, the body is offset sideways by a wave travelling from head to tail,
  small at the head and largest at the tail.
- **Drawing.** The fish is walked in its own body coordinates (along the spine, across the body);
  each point is mapped to the screen and the cell it lands on is drawn. A per-cell stamp buffer
  makes sure each fish draws a cell only once. Eyes are drawn first, then the body, then the tail
  fin and side fins as fans of line characters (`- \ | /`) chosen by direction.

## How the meadow works

See the header comment in `src/scenes/meadow.ts`. In short:

- **Flash cycle.** Each firefly has a phase from 0 to 1 that advances at its own rate (Flash rate, plus
  or minus Rate spread). The flash is the first Flash length of the cycle: a quick rise, then a slower
  fade. The rest of the cycle it is dark, with only a very faint "•" body (Resting body).
- **Glow.** Every cell whose centre is within the glow radius R of a flashing firefly (Glow radius for
  the nearest, less for farther ones) gets an intensity
  `I = flash * (1 - d / R)^2` (d is the distance in cells, so the glow is round), scaled by Glow
  strength. `I` picks a character from dim to bright (`·` `:` `+` `*`) and a faint tile of the firefly
  colour behind it at alpha `I * Glow tile strength`; cells below a small threshold are skipped. The
  firefly's own cell is a solid tile with a bright "•". Intensities go into a per-cell map first and
  the brighter value wins where glows overlap, so the picture does not depend on draw order. The map
  and its list of touched cells are typed arrays that only change size when the grid does.
- **Synchronising** (pulse-coupled oscillators). When a firefly flashes it pushes every unlit
  neighbour within Sync radius forward in its cycle, by up to Coupling (less with distance). A firefly
  pushed past the end of its cycle flashes at once and pushes its own neighbours in the same step, so
  flashes run through the meadow as waves. Neighbours fall into step over time and the meadow flashes
  in groups; with Coupling 0 each firefly flashes on its own. The rates and the coupling are tuned
  together: a smaller Rate spread makes the groups form faster and tighter.
- **Depth.** The field runs from the horizon (depth 0) to the bottom of the screen (depth 1), and
  every firefly has its own depth. Its ground is the row at that depth, and it hovers above it by up
  to Hover height, scaled down with distance. Far fireflies are smaller (glow radius and strength
  shrink with depth), dimmer and slower, so they cross less of the screen, like anything far away.
- **Movement.** Each firefly drifts on a slowly turning heading (half speed vertically, so they mostly
  wander sideways), with a spring (Hover pull) toward its hover height. They wrap at the sides and
  never go into the ground. Heights follow the horizon, so a resized window just moves them along.
- **Strays.** About Strays per minute (across the whole swarm), a firefly starts to stray: its hover
  height eases upward by up to Stray rise over Stray time, and it fades out over the last 40% of that
  time. Then it is placed somewhere new over the field and fades in over a few seconds. So the top of
  the swarm never looks cut off, and the count stays the same.
- **Touch.** A tap (a press shorter than Tap length) makes every firefly within Tap flash radius
  flash at once, and the coupling carries the flash outward. A longer press does nothing.
- **Landscape.** The sky gradient, the far and near hills and the field colour are painted by the
  renderer (see Renderer); the Meadow hands over its colours, the Horizon line and the hill heights.
- **Sky follows the clock** (on by default). The colours come from keyframes through the day in
  `src/scenes/meadow-sky.ts`: sky top and horizon, far and near hills, field far and near, and star
  visibility. Between two keyframes they blend with a smoothstep. Dusk warms the horizon and deepens
  the sky, it is darkest after midnight, a faint warm line comes back before dawn, and by day the sky
  is a soft, muted blue without stars (so the white page text stays readable). Far grass fades into
  the current horizon colour, stars dim with star visibility, and shooting stars only start when it
  is above 0.4. With the setting off, the colour sliders are used and the stars are always on.
- **Field.** One rank of grass is rooted in every row from a few rows below the screen up to the
  horizon, drawn front to back. A `taken` map stops farther blades from drawing over nearer ones.
  For a row at depth z, blades are Grass height times z^1.7 tall (far rows are single small marks:
  `.` `,` `'` and a backtick), fade toward the horizon sky colour and darken with distance (Distance haze), and sway more
  the nearer they are. Grass cover goes from the far to the near setting; since a tall blade covers
  several rows, the chance to root one in a row is 1 - (1 - cover)^(1 / average height), and smooth
  noise thins it into clumps and gaps. The wind is a wave whose phase grows with the distance
  1 / (z + 0.15) plus time, so its crests roll from the horizon toward you, times a slow gust
  envelope (Gusts). The fireflies' light is worked out before the field is drawn: where a blade is
  nearer than the firefly lighting its cell, the blade wins and that light is hidden; where the
  firefly is nearer, the blade leaves the cell out.
- **Night sky.** Stars fill the sky down to the hills: mostly faint "·", some "•" and a few
  bright "+" on a soft tile. Their number is a density (Stars per 1000 sky cells), so big and small
  screens look equally starry. More of them sit high up and the lowest are dimmer, like haze near the
  horizon, and they twinkle slowly (Twinkle). The sky drifts from left to right by Star drift cells
  per minute, wrapping round, the way the night sky turns; the shift is taken from the time of day, so
  the stars stand in the same place at the same hour. Their places and kinds come from a hash, so none are
  stored. Shooting stars start at a random time around every Shooting star every seconds (the
  first a few seconds after the scene opens). About two in three come in over the top edge (fairly
  steep, mostly heading toward the middle), the rest over a side edge in the upper sky (flatter). Each
  crosses about Shooting star path of the screen width, but its path is cut short so it ends 70% of
  the way down to the hills, and it fades out over the last 45% of its life, so it is gone well above
  the field. It is drawn as a "*" head, a "-" streak and a "·" tail (Shooting star speed, trail). Up
  to three are kept in small typed arrays.

## Common changes

### Add a parameter

1. Add one line to the right group in `src/params/schema.ts`, for example
   `wobble: num('Wobble', 0, 2, 0.01, 0.5),`.
2. Read it where you need it: `world.params.koi.wobble`.

The slider appears in Tune automatically, and the value is saved, included in presets, and reset
by the group's Reset button. Always read params through `world.params.<group>.<name>` at the moment
you need them (don't keep a reference to a group object): "Reset everything" replaces the group
objects.

### Add a scene

1. Create `src/scenes/<name>.ts` with a class that implements `Scene` from `src/sim/world.ts`. Give it
   an `id`, a `name`, a `hint` and `greetings`: a few calm lines for each of morning, afternoon, evening and night. If the scene wants its own
   background, add `background(world)` returning a colour from its settings. Use `pond.ts` (or
   `meadow.ts`) as a template: typed arrays for state, no allocation in `step` or `draw`.
2. Add a parameter group for it in `schema.ts` (every tunable number and colour, including its
   background).
3. In `src/scenes/index.ts`, import it and add one entry to the `scenes` array. That is all: the name
   button and the arrow keys pick it up. The array order is the cycling order, and the first scene is
   the one shown until the user picks another.

### Add a character

Add it to `EXTRA` in `src/render/atlas.ts`, then use `glyph('x')` to get its index. Printable ASCII
is already included.

## Settings storage

Settings are saved under one key. In the extension they go to `chrome.storage.local` (Chrome and
Firefox both support it); on the web preview they go to `localStorage`. Loading ignores unknown keys
and clamps numbers to the slider range, so old or hand-edited settings can't break the page.

## Testing hooks

Opening the page with `?debug` in its URL (for example the web preview at `index.html?debug`) exposes `window.__gg = { world, scenes }`
so automated screenshots can place creatures precisely. It has no effect in normal use.

`?at=2026-11-20T05:30` sets the page's clock to that moment (it keeps running from there), so the
time-of-day looks can be checked without waiting: the clock and greeting, the Meadow's sky. It goes
through `now()` in `src/sim/clock.ts`; everything that shows the time reads it there. The world gets
the time once a second as `world.clock` (minutes since midnight, and the moment in milliseconds), so
scenes never make a `Date` in the frame loop.
