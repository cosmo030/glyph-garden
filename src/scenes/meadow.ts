import type { GlyphRenderer } from '../render/renderer';
import { pack, packRgb, packShade } from '../render/color';
import { glyph } from '../render/atlas';
import { hash2, gauss, rand } from '../sim/noise';
import { rgb } from '../sim/colors';
import type { Band, Scene, TimeOfDay, World } from '../sim/world';

// The Meadow scene: a night habitat of fireflies over swaying grass.
//
// Fireflies drift slowly above the grass and flash. Each one has a flash cycle, a "phase" that
// runs from 0 to 1 at its own rate; the flash is the first part of the cycle (a quick rise, a slower
// fade) and it is dark for the rest.
//
// Synchronising (pulse-coupled oscillators, like real fireflies): when a firefly flashes it nudges
// every unlit neighbour within `syncRadius` a little further along its own cycle, by up to
// `coupling` (less the farther away it is). A nudged firefly that reaches the end of its cycle
// flashes too, and nudges its own neighbours in the same step, so flashes run through the meadow as
// waves. Over a few cycles neighbours fall into step and the meadow flashes in groups. With
// coupling 0 nothing is nudged and every firefly flashes on its own, at random.
//
// The glow is an ASCII light ramp. Every cell within `glowRadius` of a flashing firefly gets an
// intensity I = flash * (1 - d / R)^2 (d is the distance in cells from the firefly, so the glow is
// round), and I picks a character from dim to bright (. : + *) with a faint tile of the firefly
// colour behind it. Where two glows overlap the brighter cell wins, so the picture does not depend
// on the order the fireflies are drawn in.
//
// Touch: press and hold lights a pulsing ring with a faint tinted fill at the cursor, and the
// fireflies nearby gather and circle it; let go and they drift apart again. A short tap makes every
// firefly within `tapRadius` flash at once, and the coupling carries that flash outward.

const CAP = 300; // max fireflies
const SEED = 7; // makes the stars and grass the same every time

const CORE = glyph('•'); // a firefly's own cell, and the dots of the hold ring
// The light ramp, dim to bright, and the intensity at which each step starts
const RAMP = [glyph('·'), glyph(':'), glyph('+'), glyph('*')];
const RAMP_FROM = [0, 0.12, 0.28, 0.5];
const GLOW_MIN = 0.04; // cells dimmer than this are skipped
const STAR = glyph('.');
const BLADE = glyph('|');
const LEAN_RIGHT = glyph('/');
const LEAN_LEFT = glyph('\\');
const TIP = glyph("'");
const STUB = glyph(',');
const TAU = Math.PI * 2;

/** The firefly meadow: active from the night start to the day start. */
export class Meadow implements Scene {
  readonly id = 'meadow';
  readonly name = 'Meadow';
  readonly hint = 'hold to glow';
  readonly timeOfDay: TimeOfDay = { start: 'nightStarts', end: 'dayStarts' };
  // The first letter may be lowercased when a name goes in front, so no line starts with a proper noun.
  readonly greetings: Record<Band, readonly string[]> = {
    morning: ['The grass is still wet.', 'The little lights have gone to sleep.', 'Dew on every blade.'],
    afternoon: ['The meadow is dozing in the sun.', 'Nothing here is in a hurry.', 'Warm grass, long shadows to come.'],
    evening: [
      'The first lights are coming on.',
      'Wait a little. They will come out.',
      'Dusk, and the grass goes quiet.',
    ],
    night: [
      'Hold still. The meadow is awake.',
      'The night is full of small lights.',
      'Little lights, all through the dark.',
    ],
  };

  // Fireflies, stored as parallel typed arrays (no per-firefly objects)
  private n = 0;
  private x = new Float32Array(CAP);
  private y = new Float32Array(CAP);
  private vx = new Float32Array(CAP);
  private vy = new Float32Array(CAP);
  private heading = new Float32Array(CAP); // direction it is drifting in
  private wanderA = new Float32Array(CAP); // how fast the heading is turning
  private homeY = new Float32Array(CAP); // the height it likes to hover at
  private pace = new Float32Array(CAP); // personal speed factor
  private phase = new Float32Array(CAP); // flash cycle, 0 to 1; the flash is the first part
  private rateJ = new Float32Array(CAP); // personal flash rate offset, -1 to 1 (times Rate spread)

  // Fireflies that flashed this step and still have to nudge their neighbours
  private queue = new Int32Array(CAP);
  private qn = 0;

  // Glow intensity per cell for the frame being drawn, and the cells that were touched (so clearing
  // is cheap). A value below 1 is a ramp cell; a firefly's own cell holds 1 + its flash. These are
  // only reallocated when the grid size changes, never per frame.
  private glow = new Float32Array(0);
  private touched = new Int32Array(0);
  private tn = 0;

  // Press and hold
  private held = false;
  private pressedAt = 0;
  private light = 0; // 0 to 1: how strongly the light is on (fades in once a press counts as a hold)

  enter(world: World) {
    this.n = 0;
    this.qn = 0;
    this.held = false;
    this.light = 0;
    this.syncCount(world);
  }

  count() {
    return this.n;
  }

  rescale(sx: number, sy: number) {
    for (let i = 0; i < this.n; i++) {
      this.x[i] *= sx;
      this.y[i] *= sy;
      this.homeY[i] *= sy;
    }
  }

  background(world: World) {
    return world.params.meadow.background;
  }

  /** The lowest row a firefly may reach: just above the tallest grass. */
  private skyBottom(world: World) {
    return Math.max(2, world.rows - world.params.meadow.grassHeight - 2);
  }

  /** Spawns or removes fireflies so the count matches the Fireflies slider. */
  private syncCount(world: World) {
    const want = Math.min(CAP, Math.round(world.params.meadow.count));
    while (this.n < want) this.spawn(world);
    if (this.n > want) this.n = want;
  }

  /** Adds one firefly at a random spot, favouring the middle and upper sky, with a random phase and pace. */
  private spawn(world: World) {
    const i = this.n++;
    const sky = this.skyBottom(world);
    this.homeY[i] = sky * rand(0.08, 0.8);
    this.x[i] = rand(0, world.cols);
    this.y[i] = Math.min(sky, Math.max(0, this.homeY[i] + gauss() * 3));
    this.vx[i] = this.vy[i] = 0;
    this.heading[i] = rand(0, TAU);
    this.wanderA[i] = gauss() * 0.5;
    this.pace[i] = rand(0.6, 1.3);
    this.phase[i] = Math.random();
    this.rateJ[i] = rand(-1, 1);
  }

  /** Press: start of a possible hold (it counts as a hold once it lasts longer than the tap length). */
  pointerDown(_x: number, _y: number, world: World) {
    this.held = true;
    this.pressedAt = world.time;
  }

  /** Release: a short press was a tap, so every firefly nearby flashes now; a long one just lets go. */
  pointerUp(x: number, y: number, world: World) {
    const m = world.params.meadow;
    if (this.held && world.time - this.pressedAt < m.tapTime) {
      const r2 = m.tapRadius * m.tapRadius;
      for (let i = 0; i < this.n; i++) {
        const dx = this.x[i] - x;
        const dy = this.y[i] - y;
        if (dx * dx + dy * dy > r2) continue;
        this.phase[i] = 0; // flash starts now
        if (this.qn < CAP) this.queue[this.qn++] = i; // and nudges its neighbours on the next step
      }
    }
    this.held = false;
  }

  /** One fixed step: flash cycles and their coupling first, then the movement. */
  step(dt: number, world: World) {
    this.syncCount(world);
    const m = world.params.meadow;
    const n = this.n;

    // ---- The light under your finger fades in once you have held longer than a tap, and out on release ----
    if (this.held && world.time - this.pressedAt >= m.tapTime)
      this.light = Math.min(1, this.light + dt / (m.lightFade * 0.4));
    else if (!this.held) this.light = Math.max(0, this.light - dt / m.lightFade);

    // ---- Flash cycles: every firefly moves along its own cycle; reaching 1 means it flashes ----
    for (let i = 0; i < n; i++) {
      let p = this.phase[i] + m.flashRate * (1 + m.rateSpread * this.rateJ[i]) * dt;
      if (p >= 1) {
        p -= 1;
        this.queue[this.qn++] = i;
      }
      this.phase[i] = p;
    }

    // ---- Coupling: each flash nudges unlit neighbours forward. A firefly pushed past 1 flashes too ----
    const reach = m.syncRadius;
    const reach2 = reach * reach;
    const lit = m.flashLength;
    for (let head = 0; head < this.qn; head++) {
      if (m.coupling <= 0) break;
      const i = this.queue[head];
      const xi = this.x[i];
      const yi = this.y[i];
      for (let j = 0; j < n; j++) {
        if (j === i || this.phase[j] < lit) continue; // a firefly that is still flashing ignores the others
        const dx = this.x[j] - xi;
        const dy = this.y[j] - yi;
        const d2 = dx * dx + dy * dy;
        if (d2 > reach2) continue;
        const p = this.phase[j] + m.coupling * (1 - Math.sqrt(d2) / reach);
        if (p >= 1) {
          this.phase[j] = 0; // it flashes now, together with the one that pushed it
          if (this.qn < CAP) this.queue[this.qn++] = j;
        } else this.phase[j] = p;
      }
    }
    this.qn = 0;

    // ---- Movement ----
    const sky = this.skyBottom(world);
    const sqrtDt = Math.sqrt(dt);
    const wanderDecay = Math.exp(-0.5 * dt);
    const relax = 1 - Math.exp(-1.5 * dt); // how quickly velocity settles on where it wants to go
    const span = world.cols + 4;
    const gather = this.light > 0.001;
    const cx = world.cursor.x;
    const cy = world.cursor.y;
    const pull = m.gatherPull * this.light;
    const orbit = m.orbitSpeed * this.light;
    for (let i = 0; i < n; i++) {
      // Gentle wandering: the heading turns by a slowly changing amount (a smoothed random walk)
      this.wanderA[i] = this.wanderA[i] * wanderDecay + gauss() * m.wander * sqrtDt;
      this.heading[i] += this.wanderA[i] * dt;
      const speed = m.drift * this.pace[i];
      const tx = Math.cos(this.heading[i]) * speed;
      // A soft spring toward the height it likes, so they stay in the middle and upper sky
      const ty = Math.sin(this.heading[i]) * speed + (Math.min(this.homeY[i], sky - 1) - this.y[i]) * 0.25;
      this.vx[i] += (tx - this.vx[i]) * relax;
      this.vy[i] += (ty - this.vy[i]) * relax;

      // Gather and circle the light: pulled toward a ring around it, pushed sideways along the ring
      if (gather) {
        const dx = cx - this.x[i];
        const dy = cy - this.y[i];
        const d = Math.hypot(dx, dy);
        if (d < m.gatherRadius && d > 1e-3) {
          const fall = Math.min(1, 2 * (1 - d / m.gatherRadius));
          const radial = Math.max(-1, Math.min(1, (d - m.lightRadius) / m.lightRadius));
          const a = pull * fall * radial;
          const b = orbit * fall;
          this.vx[i] += ((dx / d) * a - (dy / d) * b) * dt;
          this.vy[i] += ((dy / d) * a + (dx / d) * b) * dt;
        }
      }

      this.x[i] += this.vx[i] * dt;
      this.y[i] += this.vy[i] * dt;
      // Wrap sideways; at the top and bottom turn softly, and never go into the grass
      if (this.x[i] < -2) this.x[i] += span;
      else if (this.x[i] > world.cols + 2) this.x[i] -= span;
      if (this.y[i] < 0) {
        this.y[i] = 0;
        if (this.vy[i] < 0) this.vy[i] = 0;
      }
      if (this.y[i] > sky) {
        this.y[i] = sky;
        if (this.vy[i] > 0) this.vy[i] = 0;
      }
    }
  }

  /** Draws the stars, then the grass, then the hold light, then the fireflies and their glow. */
  draw(r: GlyphRenderer, world: World) {
    const sky = this.skyBottom(world);
    this.drawStars(r, world, sky);
    this.drawGrass(r, world);
    this.drawLight(r, world);
    this.drawFireflies(r, world);
  }

  /**
   * The fireflies. Lit ones add their glow to a per-cell intensity map (keeping the brighter value
   * where glows overlap), then each touched cell is drawn once: a ramp character with a faint tile,
   * or, for a firefly's own cell, a solid tile with a bright "•". Dark ones keep a very faint body.
   */
  private drawFireflies(r: GlyphRenderer, world: World) {
    const m = world.params.meadow;
    const cols = Math.ceil(world.cols);
    const rows = Math.ceil(world.rows);
    if (this.glow.length !== cols * rows) {
      this.glow = new Float32Array(cols * rows);
      this.touched = new Int32Array(cols * rows);
    }
    const glow = this.glow;
    const touched = this.touched;
    this.tn = 0;

    const col = rgb(m.colFirefly);
    const L = m.flashLength;
    const rise = L * 0.2; // quick rise over the first fifth of the flash, then a slower fade
    const R = m.glowRadius;
    const R2 = R * R;
    const reach = Math.ceil(R);
    const rest = packShade(col, -0.35, m.restGlow);

    for (let i = 0; i < this.n; i++) {
      const p = this.phase[i];
      const px = this.x[i];
      const py = this.y[i];
      const cx = Math.floor(px);
      const cy = Math.floor(py);
      const flash = p >= L ? 0 : p < rise ? p / rise : Math.pow(1 - (p - rise) / (L - rise), 1.6);
      if (flash < 0.02) {
        r.push(cx, cy, 0, rest, CORE); // dark between flashes: only a faint body
        continue;
      }
      // Ramp cells: I = flash * (1 - d / R)^2 for every cell centre within R of the firefly
      if (R > 0.3 && m.glowStrength > 0) {
        for (let oy = -reach; oy <= reach; oy++) {
          const gy = cy + oy;
          if (gy < 0 || gy >= rows) continue;
          for (let ox = -reach; ox <= reach; ox++) {
            const gx = cx + ox;
            if (gx < 0 || gx >= cols) continue;
            const dx = gx + 0.5 - px;
            const dy = gy + 0.5 - py;
            const d2 = dx * dx + dy * dy;
            if (d2 >= R2) continue; // a round glow, no square corners
            const k = 1 - Math.sqrt(d2) / R;
            const I = Math.min(0.999, m.glowStrength * flash * k * k);
            if (I < GLOW_MIN) continue;
            const idx = gy * cols + gx;
            const was = glow[idx];
            if (was === 0) touched[this.tn++] = idx;
            if (I > was) glow[idx] = I;
          }
        }
      }
      // The firefly's own cell holds 1 + flash, so it beats any ramp value and the brighter of two cores wins
      if (cx >= 0 && cx < cols && cy >= 0 && cy < rows) {
        const idx = cy * cols + cx;
        const was = glow[idx];
        if (was === 0) touched[this.tn++] = idx;
        if (1 + flash > was) glow[idx] = 1 + flash;
      }
    }

    // One push per touched cell, then clear the map for the next frame
    for (let k = 0; k < this.tn; k++) {
      const idx = touched[k];
      const v = glow[idx];
      glow[idx] = 0;
      const gy = Math.floor(idx / cols);
      const gx = idx - gy * cols;
      if (v >= 1) {
        const f = v - 1; // a firefly's own cell: a solid tile and a bright "•"
        r.push(gx, gy, packShade(col, 0.2 * f, 0.5 + 0.5 * f), packShade(col, 0.6 + 0.35 * f, 1), CORE);
      } else {
        let step = 0;
        while (step < 3 && v >= RAMP_FROM[step + 1]) step++;
        r.push(gx, gy, packRgb(col, v * m.tileGlow), packShade(col, 0.5 * v, Math.min(1, 0.55 + v)), RAMP[step]);
      }
    }
    this.tn = 0;
  }

  /**
   * The light while held: a very faint tinted fill, and a brighter ring of "•" on faint tiles that
   * breathes in radius and brightness (Light pulse, Light pulse speed).
   */
  private drawLight(r: GlyphRenderer, world: World) {
    if (this.light <= 0.02) return;
    const m = world.params.meadow;
    const col = rgb(m.colFirefly);
    const beat = Math.sin(world.time * TAU * m.lightPulseSpeed);
    const rad = m.lightRadius * (1 + m.lightPulse * beat);
    const glowK = this.light * (0.85 + 0.15 * beat);
    const cx = world.cursor.x;
    const cy = world.cursor.y;
    const x0 = Math.floor(cx);
    const y0 = Math.floor(cy);

    // Fill: every cell centre inside the ring, a little stronger toward the middle
    const reach = Math.ceil(rad);
    for (let oy = -reach; oy <= reach; oy++) {
      for (let ox = -reach; ox <= reach; ox++) {
        const dx = x0 + ox + 0.5 - cx;
        const dy = y0 + oy + 0.5 - cy;
        const d = Math.sqrt(dx * dx + dy * dy);
        if (d >= rad) continue;
        r.push(x0 + ox, y0 + oy, packRgb(col, m.lightFill * this.light * (0.6 + 0.4 * (1 - d / rad))), 0, 0);
      }
    }

    // Ring: "•" about one cell apart, turning slowly, each on a faint tile
    const dots = Math.max(12, Math.floor((TAU * rad) / 1.1));
    const fg = packShade(col, 0.4, Math.min(1, 0.95 * glowK));
    const bg = packRgb(col, 0.45 * glowK);
    let lastX = 1e9;
    let lastY = 1e9;
    for (let d = 0; d < dots; d++) {
      const a = (d / dots) * TAU + world.time * 0.3;
      const px = Math.floor(cx + Math.cos(a) * rad);
      const py = Math.floor(cy + Math.sin(a) * rad);
      if (px === lastX && py === lastY) continue;
      lastX = px;
      lastY = py;
      r.push(px, py, bg, fg, CORE);
    }
    r.push(x0, y0, packRgb(col, 0.35 * glowK), packShade(col, 0.5, Math.min(1, glowK)), CORE);
  }

  /** Faint "." stars in the upper sky. Their places come from a hash, so none are stored. */
  private drawStars(r: GlyphRenderer, world: World, sky: number) {
    const m = world.params.meadow;
    const col = rgb(m.colStar);
    const count = Math.min(300, Math.round(m.starCount));
    for (let i = 0; i < count; i++) {
      const x = Math.floor(hash2(i, 0, SEED) * world.cols);
      const y = Math.floor(hash2(i, 1, SEED) * sky * 0.7); // the top 70% of the sky
      const rate = 0.4 + hash2(i, 2, SEED) * 1.2;
      const twinkle = 0.5 + 0.5 * Math.sin(world.time * rate + hash2(i, 3, SEED) * TAU);
      r.push(x, y, 0, packRgb(col, 0.25 + 0.6 * twinkle), STAR);
    }
  }

  /**
   * A band of grass along the bottom. Each blade is "|", "/" or "\" in one of two greens (dark or
   * mid, picked by a hash), a little darker at the root, and ends in a lighter tip that leans the
   * way the wind pushes it. The wind is a long travelling wave plus a slower one, so it gusts.
   */
  private drawGrass(r: GlyphRenderer, world: World) {
    const m = world.params.meadow;
    if (m.grassHeight <= 0 || m.grassDensity <= 0) return;
    const dark = rgb(m.colGrassDark);
    const mid = rgb(m.colGrass);
    const tip = rgb(m.colGrassTip);
    const bottom = Math.floor(world.rows) - 1;
    const cols = Math.ceil(world.cols);
    const t = world.time * m.windSpeed;
    for (let x = 0; x < cols; x++) {
      if (hash2(x, 4, SEED) > m.grassDensity) continue; // no blade in this column
      const height = Math.max(1, Math.round(m.grassHeight * (0.3 + 0.7 * hash2(x, 5, SEED))));
      const tone = 0.9 + 0.2 * hash2(x, 6, SEED); // each blade is a slightly different green
      const base = hash2(x, 7, SEED) < 0.5 ? dark : mid;
      const wind = Math.sin(x * 0.11 - t * 1.6) + 0.5 * Math.sin(x * 0.047 - t * 0.9 + 1.3);
      const tipOffset = m.grassSway * wind * 0.35 * height; // how far the tip leans, in cells
      let off = 0;
      for (let k = 0; k < height; k++) {
        const u = (k + 1) / height;
        const nextOff = Math.round(tipOffset * u * u); // blades bend more toward the tip
        let g = nextOff > off ? LEAN_RIGHT : nextOff < off ? LEAN_LEFT : BLADE;
        let fg: number;
        if (k === height - 1) {
          // The tip: a lighter shade, leaning with the wind (an apostrophe when it is calm)
          g = tipOffset > 0.6 ? LEAN_RIGHT : tipOffset < -0.6 ? LEAN_LEFT : TIP;
          // (clamped: pack() wraps a channel above 255 instead of capping it)
          fg = pack(Math.min(255, tip[0] * tone), Math.min(255, tip[1] * tone), Math.min(255, tip[2] * tone), 1);
        } else {
          if (height <= 2 && k === 0) g = STUB;
          const shade = tone * (0.8 + 0.2 * u); // a little darker at the root
          fg = pack(base[0] * shade, base[1] * shade, base[2] * shade, 1);
        }
        r.push(x + off, bottom - k, pack(base[0], base[1], base[2], m.grassTile * (0.5 + 0.5 * u)), fg, g);
        off = nextOff;
      }
    }
  }
}
