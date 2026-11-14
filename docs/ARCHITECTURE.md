# Architecture

How Glyph Garden is put together, and where to make common changes.

## The big picture

```
 Tweaks panel ──► param schema ◄── saved settings
                      │
                      ▼
 page UI ──► simulation (active species) ──► renderer ──► <canvas>
 input   ──►        │
                    └── ripples and other shared effects
```

- **Param schema** (`src/params/schema.ts`) declares every tunable value once: label, min, max,
  step and default. The Tweaks panel, saved settings, presets and defaults are all generated
  from it.
- **Simulation** (`src/species/*`, `src/sim/*`) moves the animals. It runs at a fixed 60 steps per
  second, independent of the screen's refresh rate.
- **Renderer** (`src/render/*`) draws a grid of character cells with WebGL2.
- **Page UI** (`entrypoints/newtab/*`, `src/app.ts`) is plain HTML and CSS on top of the canvas:
  greeting, search box, species switcher and the Tweaks button.

## Folder layout

```
entrypoints/newtab/   the new-tab page: index.html, style.css, main.ts
src/
  app.ts              wires everything together; main loop; input; page UI
  params/
    schema.ts         every parameter, declared once
    panel.ts          Tweaks panel, generated from the schema (Tweakpane)
    store.ts          saving and loading settings
  render/
    renderer.ts       WebGL2 glyph-grid renderer
    atlas.ts          draws all characters once into a texture
    color.ts          colour packing helpers
  sim/
    world.ts          shared World type, Species interface, ripple effects
    effects-draw.ts   draws ripples
    noise.ts          hashing and smooth noise
    colors.ts         cached hex-to-RGB parsing
  species/
    koi.ts            koi: movement, feeding, drawing
docs/                 this file
```

## Units and coordinates

- Positions and distances are in **grid cells**, not pixels. A koi of length 13 is 13 cells long,
  whatever the cell size is. Changing **World > Cell size** zooms the whole scene.
- Time is in **seconds**. Speeds are in cells per second.
- Angles are in **radians**, measured clockwise from the right (screen y points down).
  Sliders show degrees where that is easier to read.

## Renderer

Each cell has: grid position, tile colour (with alpha), glyph colour (with alpha) and a glyph index.

1. At startup every character is drawn once into a texture (the atlas).
2. Each frame, species call `renderer.push(x, y, tileColour, glyphColour, glyph)` for every cell.
   Cells live in one preallocated `ArrayBuffer` (20 bytes per cell). Colours are packed into
   32-bit integers.
3. `renderer.draw()` paints the background grid, uploads the buffer once and draws all cells with a
   single instanced draw call. The fragment shader draws a rounded tile and the glyph on top.

A tile colour with alpha 0 draws only the character (used for fins, ripples). Later cells are
drawn on top of earlier ones.

## Simulation loop

`src/app.ts` runs `requestAnimationFrame`. Each frame it advances the simulation in fixed steps of
1/60 s (at most 6 steps per frame, so a slow device slows down instead of freezing), then renders
once. When the tab is hidden the loop stops entirely.

Only the active species runs. Switching species calls its `enter()` to spawn its animals.

## Performance rules

These keep a new tab instant even on older laptops:

- **No allocation per frame.** Animal state is stored in typed arrays (one array per property, one
  slot per animal), not in objects. Scratch values are reused. Colours are parsed once and cached.
- **One draw call.** All cells go through the single instanced draw described above.
- **Neighbour lookups use a grid.** Each koi only checks fish in nearby grid buckets.
- **Pause when hidden.**

Tweaks > Performance shows frames per second, cells drawn and animal count.

## How the koi work

See the header comment in `src/species/koi.ts` for the full description. In short:

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

## Common changes

### Add a parameter

1. Add one line to the right group in `src/params/schema.ts`, for example
   `wobble: num('Wobble', 0, 2, 0.01, 0.5),`.
2. Read it where you need it: `world.params.koi.wobble`.

The slider appears in Tweaks automatically, and the value is saved, included in presets, and reset
by the group's Reset button. Always read params through `world.params.<group>.<name>` at the moment
you need them (don't keep a reference to a group object): "Reset everything" replaces the group
objects.

### Add an animal

1. Create `src/species/<name>.ts` with a class that implements `Species` from `src/sim/world.ts`.
   Use `koi.ts` as a template: typed arrays for state, no allocation in `step` or `draw`.
2. Add a parameter group for it in `schema.ts`.
3. Register it in the `species` array in `src/app.ts`. Its entry in `ROSTER` stops showing "soon".

### Add a character

Add it to `EXTRA` in `src/render/atlas.ts`, then use `glyph('x')` to get its index. Printable ASCII
is already included.

## Settings storage

Settings are saved under one key. In the extension they go to `chrome.storage.local` (Chrome and
Firefox both support it); on the web preview they go to `localStorage`. Loading ignores unknown keys
and clamps numbers to the slider range, so old or hand-edited settings can't break the page.

## Testing hook

Opening the page with `?debug` in its URL (for example the web preview at `index.html?debug`) exposes `window.__gg = { world, species }`
so automated screenshots can place animals precisely. It has no effect in normal use.
