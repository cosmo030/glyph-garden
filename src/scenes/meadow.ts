import type { GlyphRenderer } from '../render/renderer';
import { pack, packRgb, packShade } from '../render/color';
import { glyph } from '../render/atlas';
import { hash2, gauss, rand } from '../sim/noise';
import { rgb } from '../sim/colors';
import type { Band, Scene, World } from '../sim/world';

// The Meadow scene: a clear night over swaying grass, with fireflies low above it.
//
// Most of the screen is open sky: stars that twinkle slowly, a faint glow along the horizon, and now
// and then a shooting star. The fireflies keep to a low band just above the grass, small and soft, so
// the sky stays calm.
//
// Fireflies drift slowly in their band and flash. Each one has a flash cycle, a "phase" that
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
// Stars come in three kinds, faint to bright; the share of each is fixed so the sky reads the same
// at any star count
const STAR_FAINT = glyph('·');
const STAR_MID = glyph('•');
const STAR_BRIGHT = glyph('+');
const STAR_MID_FROM = 0.78; // a star's hash above this makes it a mid star, above the next a bright one
const STAR_BRIGHT_FROM = 0.95;
const MAX_STARS = 1500; // a cap for very large screens at a high density
const SHOOT_CAP = 3; // shooting stars on screen at once
const SHOOT_HEAD = glyph('*');
const SHOOT_STREAK = glyph('-'); // the bright part of the trail, right behind the head
const SHOOT_TRAIL = glyph('·'); // the fading rest of it
const SHOOT_STREAK_PART = 0.4; // how much of the trail is streak
const BLADE = glyph('|');
const LEAN_RIGHT = glyph('/');
const LEAN_LEFT = glyph('\\');
const TIP = glyph("'");
const STUB = glyph(',');
const TAU = Math.PI * 2;

/** The firefly meadow: a night habitat of fireflies over swaying grass. */
export class Meadow implements Scene {
  readonly id = 'meadow';
  readonly name = 'Meadow';
  readonly hint = 'hold to glow';
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
      'Keep an eye on the sky.',
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
  // The height it likes to hover at, as a place in the band: 0 at its top, 1 at its bottom. Kept
  // relative so a resized window or a new Firefly band setting moves the whole band along.
  private home = new Float32Array(CAP);
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

  // Shooting stars, also parallel typed arrays: position of the head, unit direction, speed, age and
  // lifetime in seconds, and how far it has travelled (the trail never reaches back past its start)
  private sn = 0;
  private sx = new Float32Array(SHOOT_CAP);
  private sy = new Float32Array(SHOOT_CAP);
  private sdx = new Float32Array(SHOOT_CAP);
  private sdy = new Float32Array(SHOOT_CAP);
  private sSpeed = new Float32Array(SHOOT_CAP);
  private sAge = new Float32Array(SHOOT_CAP);
  private sLife = new Float32Array(SHOOT_CAP);
  private sDist = new Float32Array(SHOOT_CAP);
  private nextShoot = 0; // world time of the next shooting star

  enter(world: World) {
    this.n = 0;
    this.qn = 0;
    this.held = false;
    this.light = 0;
    this.sn = 0;
    // The first one comes soon, so a visitor who only stays a moment still sees one
    this.nextShoot = world.time + rand(2, 5);
    this.syncCount(world);
  }

  count() {
    return this.n;
  }

  rescale(sx: number) {
    for (let i = 0; i < this.n; i++) {
      // Only sideways: the band sits at a fixed height above the bottom, so after a resize the hover
      // spring brings each firefly back to its place in the band
      this.x[i] *= sx;
    }
  }

  background(world: World) {
    return world.params.meadow.background;
  }

  /** The lowest row a firefly may reach: just above the tallest grass. */
  private bandBottom(world: World) {
    return Math.max(2, world.rows - world.params.meadow.grassHeight - 1);
  }

  /** The top of the band the fireflies like to hover in. Above it is open sky. */
  private bandTop(world: World) {
    return Math.max(1, this.bandBottom(world) - world.params.meadow.band);
  }

  /** Spawns or removes fireflies so the count matches the Fireflies slider. */
  private syncCount(world: World) {
    const want = Math.min(CAP, Math.round(world.params.meadow.count));
    while (this.n < want) this.spawn(world);
    if (this.n > want) this.n = want;
  }

  /** Adds one firefly at a random spot in the band above the grass, with a random phase and pace. */
  private spawn(world: World) {
    const i = this.n++;
    const top = this.bandTop(world);
    const bottom = this.bandBottom(world);
    this.home[i] = Math.random();
    this.x[i] = rand(0, world.cols);
    this.y[i] = Math.min(bottom, Math.max(0, top + this.home[i] * (bottom - top) + gauss()));
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

    this.stepShootingStars(dt, world);

    // ---- Movement ----
    const sky = this.bandBottom(world);
    const bandTop = this.bandTop(world);
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

      // How strongly the light holds this firefly: 0 out of reach, up to 1 close to it
      let dx = 0;
      let dy = 0;
      let d = 0;
      let fall = 0;
      if (gather) {
        dx = cx - this.x[i];
        dy = cy - this.y[i];
        d = Math.hypot(dx, dy);
        if (d < m.gatherRadius && d > 1e-3) fall = Math.min(1, 2 * (1 - d / m.gatherRadius));
      }

      // A spring toward the height it likes (Hover pull), so they stay in their band above the grass.
      // The light loosens it, so they can rise to a light held up in the sky and sink back afterwards.
      // Half the vertical drift, so they mostly wander sideways, the way fireflies over a field do.
      const homeY = bandTop + this.home[i] * (sky - bandTop);
      const hoverPull = m.hover * (1 - fall * this.light);
      const tx = Math.cos(this.heading[i]) * speed;
      const ty = Math.sin(this.heading[i]) * speed * 0.5 + (homeY - this.y[i]) * hoverPull;
      this.vx[i] += (tx - this.vx[i]) * relax;
      this.vy[i] += (ty - this.vy[i]) * relax;

      // Gather and circle the light: pulled toward a ring around it, pushed sideways along the ring
      if (fall > 0) {
        const radial = Math.max(-1, Math.min(1, (d - m.lightRadius) / m.lightRadius));
        const a = pull * fall * radial;
        const b = orbit * fall;
        this.vx[i] += ((dx / d) * a - (dy / d) * b) * dt;
        this.vy[i] += ((dy / d) * a + (dx / d) * b) * dt;
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

  /**
   * Starts a shooting star now and then (on average every Shooting star every seconds, but never on
   * a beat), moves the ones in flight along their straight path and drops the ones that have faded.
   */
  private stepShootingStars(dt: number, world: World) {
    const m = world.params.meadow;
    if (world.time >= this.nextShoot) {
      this.nextShoot = world.time + m.shootEvery * rand(0.5, 1.5);
      if (this.sn < SHOOT_CAP) {
        const i = this.sn++;
        const top = this.bandTop(world);
        // A shallow path down to the left or right, starting in the upper part of the sky
        const angle = rand(0.25, 0.6); // radians below the horizontal
        const side = Math.random() < 0.5 ? -1 : 1;
        this.sx[i] = rand(0.1, 0.9) * world.cols;
        this.sy[i] = rand(0.03, 0.4) * top;
        this.sdx[i] = Math.cos(angle) * side;
        this.sdy[i] = Math.sin(angle);
        this.sSpeed[i] = m.shootSpeed * rand(0.8, 1.2);
        this.sAge[i] = 0;
        this.sLife[i] = rand(0.6, 1.1);
        this.sDist[i] = 0;
      }
    }
    for (let i = 0; i < this.sn; i++) {
      this.sAge[i] += dt;
      if (this.sAge[i] >= this.sLife[i]) {
        // Done: move the last one into this slot and look at this slot again
        const last = --this.sn;
        this.sx[i] = this.sx[last];
        this.sy[i] = this.sy[last];
        this.sdx[i] = this.sdx[last];
        this.sdy[i] = this.sdy[last];
        this.sSpeed[i] = this.sSpeed[last];
        this.sAge[i] = this.sAge[last];
        this.sLife[i] = this.sLife[last];
        this.sDist[i] = this.sDist[last];
        i--;
        continue;
      }
      const d = this.sSpeed[i] * dt;
      this.sx[i] += this.sdx[i] * d;
      this.sy[i] += this.sdy[i] * d;
      this.sDist[i] += d;
    }
  }

  /** Draws the sky (horizon glow, stars, shooting stars), the grass, the hold light, then the fireflies. */
  draw(r: GlyphRenderer, world: World) {
    const top = this.bandTop(world);
    this.drawHorizon(r, world);
    this.drawStars(r, world, top);
    this.drawShootingStars(r, world);
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
        const f = v - 1; // a firefly's own cell: a soft tile (Firefly tile strength) and a bright "•"
        r.push(gx, gy, packShade(col, 0.2 * f, m.coreTile * (0.4 + 0.6 * f)), packShade(col, 0.6 + 0.35 * f, 1), CORE);
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

  /**
   * The stars: mostly faint "·", some "•", and a few bright "+" with a soft tile. They fill the sky
   * down to just above the fireflies, thinning toward the horizon the way haze hides the low ones, and
   * twinkle slowly. Their places come from a hash, so none are stored.
   */
  private drawStars(r: GlyphRenderer, world: World, top: number) {
    const m = world.params.meadow;
    const col = rgb(m.colStar);
    const skyRows = Math.max(1, top - 2);
    // A density rather than a count, so a big screen gets as starry a sky as a small one
    const count = Math.min(MAX_STARS, Math.round((m.starDensity / 1000) * world.cols * skyRows));
    for (let i = 0; i < count; i++) {
      const x = Math.floor(hash2(i, 0, SEED) * world.cols);
      // u^1.4 puts more stars high up and fewer near the horizon
      const u = Math.pow(hash2(i, 1, SEED), 1.4);
      const y = Math.floor(u * skyRows);
      const rate = 0.2 + hash2(i, 2, SEED) * 0.6; // slow: a calm sky, not a flickering one
      const tw = 1 - m.twinkle * (0.5 + 0.5 * Math.sin(world.time * rate + hash2(i, 3, SEED) * TAU));
      const haze = 1 - 0.55 * u; // the lowest stars are a little dimmer
      const kind = hash2(i, 8, SEED);
      if (kind >= STAR_BRIGHT_FROM) {
        r.push(x, y, packRgb(col, 0.08 * tw * haze), packRgb(col, tw * haze), STAR_BRIGHT);
      } else if (kind >= STAR_MID_FROM) {
        r.push(x, y, 0, packRgb(col, 0.7 * tw * haze), STAR_MID);
      } else {
        r.push(x, y, 0, packRgb(col, (0.45 + 0.4 * hash2(i, 9, SEED)) * tw * haze), STAR_FAINT);
      }
    }
  }

  /**
   * A faint glow along the horizon, behind the fireflies and the grass: tiles of the horizon colour
   * that fade out upward over Horizon glow height. It gives the sky depth and a little warmth.
   */
  private drawHorizon(r: GlyphRenderer, world: World) {
    const m = world.params.meadow;
    if (m.horizonGlow <= 0 || m.horizonHeight < 1) return;
    const col = rgb(m.colHorizon);
    const bottom = Math.floor(world.rows) - 1;
    const cols = Math.ceil(world.cols);
    const h = Math.round(m.horizonHeight);
    for (let k = 0; k < h; k++) {
      const u = 1 - k / h; // 1 at the bottom row, toward 0 at the top of the glow
      const bg = packRgb(col, m.horizonGlow * u * u);
      for (let x = 0; x < cols; x++) r.push(x, bottom - k, bg, 0, 0);
    }
  }

  /**
   * Shooting stars: a bright "*" head, then a streak of "-" and a tail of "·" that fade with distance
   * (it reads as *--··· in motion). The whole
   * streak fades in fast and out more slowly over its short life.
   */
  private drawShootingStars(r: GlyphRenderer, world: World) {
    if (this.sn === 0) return;
    const m = world.params.meadow;
    const col = rgb(m.colShoot);
    const len = m.shootLength;
    for (let i = 0; i < this.sn; i++) {
      const e = this.sAge[i] / this.sLife[i];
      const bright = Math.min(1, e / 0.12) * Math.pow(1 - e, 0.8);
      const hx = this.sx[i];
      const hy = this.sy[i];
      const trail = Math.min(len, this.sDist[i]);
      let lastX = Math.floor(hx);
      let lastY = Math.floor(hy);
      r.push(lastX, lastY, packRgb(col, 0.3 * bright), packRgb(col, bright), SHOOT_HEAD);
      for (let k = 1; k <= trail; k++) {
        const px = Math.floor(hx - this.sdx[i] * k);
        const py = Math.floor(hy - this.sdy[i] * k);
        if (px === lastX && py === lastY) continue; // a shallow path can land on the same cell twice
        lastX = px;
        lastY = py;
        const fade = Math.pow(1 - k / (len + 1), 1.2);
        const g = k <= len * SHOOT_STREAK_PART ? SHOOT_STREAK : SHOOT_TRAIL;
        r.push(px, py, 0, packRgb(col, bright * fade), g);
      }
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
