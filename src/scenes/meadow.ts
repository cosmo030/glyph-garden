import type { GlyphRenderer } from '../render/renderer';
import { pack, packRgb, packShade } from '../render/color';
import { glyph } from '../render/atlas';
import { HILL_SEEDS, hillHeight, type Landscape } from '../render/landscape';
import { makeSkyColors, skyAt } from './meadow-sky';
import { hash2, noise2, gauss, rand } from '../sim/noise';
import { rgb } from '../sim/colors';
import type { Band, Scene, World } from '../sim/world';

// The Meadow scene: a clear night over a field that runs to the horizon, with fireflies above it.
//
// The landscape (a sky gradient, two ranges of rolling hills and the field) is painted by the
// renderer's background pass, so its edges are smooth. Its colours follow the time of day: a warm dusk,
// the darkest sky after midnight, a faint warm line before dawn (see meadow-sky.ts). On top of it, the field is rows of grass from
// the horizon to the bottom of the screen. A row's depth z runs from 0 at the horizon to 1 at the
// bottom: far rows are tiny hazy marks that barely move, near rows are tall blades that sway, and gusts
// of wind roll through the field toward you. Above the hills: stars that twinkle slowly, and now and
// then a shooting star.
//
// Every firefly has a depth too. Far ones are tiny, dim and slow (they cross less of the screen, like
// anything far away); near ones hover higher, glow wider and move faster. Grass that is nearer than a
// firefly hides it. Now and then one strays: it drifts up out of the field into the low sky and fades
// away, and a new one fades in somewhere over the field, so the top of the swarm never looks cut off.
//
// Each firefly has a flash cycle, a "phase" that runs from 0 to 1 at its own rate; the flash is the
// first part of the cycle (a quick rise, a slower fade) and it is dark for the rest.
//
// Synchronising (pulse-coupled oscillators, like real fireflies): when a firefly flashes it nudges
// every unlit neighbour within `syncRadius` a little further along its own cycle, by up to
// `coupling` (less the farther away it is). A nudged firefly that reaches the end of its cycle
// flashes too, and nudges its own neighbours in the same step, so flashes run through the meadow as
// waves. Over a few cycles neighbours fall into step and the meadow flashes in groups. With
// coupling 0 nothing is nudged and every firefly flashes on its own, at random.
//
// The glow is an ASCII light ramp. Every cell within the firefly's glow radius R gets an intensity
// I = flash * (1 - d / R)^2 (d is the distance in cells from the firefly, so the glow is round), and
// I picks a character from dim to bright (. : + *) with a faint tile of the firefly colour behind it.
// Where two glows overlap the brighter cell wins, so the picture does not depend on draw order.
//
// Touch: a tap makes every firefly within `tapRadius` flash at once, and the coupling carries that
// flash outward. A longer press does nothing, so a slow click or a drag doesn't set them off.

const CAP = 300; // max fireflies
const SEED = 7; // makes the stars and grass the same every time

const CORE = glyph('•'); // a firefly's own cell
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
const MILKY_FAINT = glyph('·'); // the Milky Way's own dense, dim stars
const MILKY_DOT = glyph('.');
const SHOOT_CAP = 3; // shooting stars on screen at once
const SHOOT_HEAD = glyph('*');
const SHOOT_STREAK = glyph('-'); // the bright part of the trail, right behind the head
const SHOOT_TRAIL = glyph('·'); // the fading rest of it
const SHOOT_STREAK_PART = 0.4; // how much of the trail is streak
const SHOOT_FROM_TOP = 0.65; // share that come in over the top edge; the rest over a side
const SHOOT_END = 0.7; // a path ends by this share of the way down to the hills
const SHOOT_FADE = 0.45; // the last share of its life it spends fading out
// Grass. Far rows are single marks; nearer rows are blades that end in a tip.
const BLADE = glyph('|');
const LEAN_RIGHT = glyph('/');
const LEAN_LEFT = glyph('\\');
const TIP = glyph("'");
const STUB = glyph(',');
const FAR_MARKS = [glyph('.'), glyph(','), glyph("'"), glyph('`')];
const FAR_UNTIL = 0.3; // rows with a depth below this are far: one small mark per blade
const TAU = Math.PI * 2;

/** The firefly meadow: a night habitat of fireflies over a field that runs to the horizon. */
export class Meadow implements Scene {
  readonly id = 'meadow';
  readonly name = 'Meadow';
  readonly hint = 'tap the fireflies';
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
  private depth = new Float32Array(CAP); // 0 at the horizon, 1 right in front
  private home = new Float32Array(CAP); // how high it likes to hover, 0 to 1 of Hover height
  private pace = new Float32Array(CAP); // personal speed factor
  private phase = new Float32Array(CAP); // flash cycle, 0 to 1; the flash is the first part
  private rateJ = new Float32Array(CAP); // personal flash rate offset, -1 to 1 (times Rate spread)
  private strayT = new Float32Array(CAP); // seconds since it started to stray, 0 while it stays
  private vis = new Float32Array(CAP); // how visible it is, 0 to 1: strays fade out, newcomers fade in

  // Fireflies that flashed this step and still have to nudge their neighbours
  private queue = new Int32Array(CAP);
  private qn = 0;

  // Per-cell maps for the frame being drawn, only reallocated when the grid size changes. `glow` is
  // the firefly light (below 1 a ramp cell, 1 + flash for a firefly's own cell) and `glowZ` the depth
  // of the firefly it came from, so nearer grass can hide it. `touched` lists the glow cells, so
  // clearing is cheap. `taken` marks cells the field has already drawn a blade in.
  private glow = new Float32Array(0);
  private glowZ = new Float32Array(0);
  private glowA = new Float32Array(0); // a firefly's own cell: how visible it is (strays fading)
  private touched = new Int32Array(0);
  private tn = 0;
  private taken = new Uint8Array(0);

  // The press that may become a tap
  private pressed = false;
  private pressedAt = 0;

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

  // The Milky Way, worked out into a list of cells and cached: its noise is too costly for every
  // frame, and it only changes when the sky drifts a whole cell or the grid or settings change.
  private milkyN = 0;
  private milkyX = new Int16Array(0);
  private milkyY = new Int16Array(0);
  private milkyHaze = new Float32Array(0); // tile alpha of the haze, before star visibility
  private milkyStar = new Float32Array(0); // alpha of the cell's own faint star, 0 for none
  private milkyKey = [NaN, NaN, NaN, NaN, NaN, NaN, NaN]; // what the cache was made for

  // The colours of the moment when the sky follows the clock, and how visible the stars are (0 to 1)
  private skyNow = makeSkyColors();
  private starVis = 1;

  // The landscape handed to the renderer, updated in place every frame (no allocation)
  private land: Landscape = {
    skyTop: [0, 0, 0],
    skyHorizon: [0, 0, 0],
    skyCurve: 1,
    horizon: 1,
    farHills: 0,
    nearHills: 0,
    hillFar: [0, 0, 0],
    hillNear: [0, 0, 0],
    groundFar: [0, 0, 0],
    groundNear: [0, 0, 0],
  };

  enter(world: World) {
    this.n = 0;
    this.qn = 0;
    this.pressed = false;
    this.sn = 0;
    // The first one comes soon, so a visitor who only stays a moment still sees one
    this.nextShoot = world.time + rand(2, 5);
    this.syncCount(world);
  }

  count() {
    return this.n;
  }

  rescale(sx: number) {
    // Only sideways: heights follow the horizon and the ground, so after a resize the hover spring
    // brings each firefly back above its own spot in the field
    for (let i = 0; i < this.n; i++) this.x[i] *= sx;
  }

  background(world: World) {
    return world.params.meadow.background;
  }

  /** The sky, hills and field for the renderer's background pass. */
  landscape(world: World): Landscape {
    this.updateLand(world);
    return this.land;
  }

  /**
   * Fills in the landscape: colours from the time of day when Sky follows the clock is on, otherwise
   * from the colour sliders. Also sets how visible the stars are.
   */
  private updateLand(world: World) {
    const m = world.params.meadow;
    const l = this.land;
    if (m.skyClock) {
      const s = skyAt(world.clock.minutes, this.skyNow);
      l.skyTop = s.top;
      l.skyHorizon = s.horizon;
      l.hillFar = s.hillFar;
      l.hillNear = s.hillNear;
      l.groundFar = s.groundFar;
      l.groundNear = s.groundNear;
      this.starVis = s.stars;
    } else {
      l.skyTop = rgb(m.background);
      l.skyHorizon = rgb(m.colHorizon);
      l.hillFar = rgb(m.colHillFar);
      l.hillNear = rgb(m.colHillNear);
      l.groundFar = rgb(m.colGroundFar);
      l.groundNear = rgb(m.colGroundNear);
      this.starVis = 1;
    }
    l.skyCurve = m.skyCurve;
    l.horizon = this.horizon(world);
    l.farHills = m.farHills;
    l.nearHills = m.nearHills;
  }

  // ---- Where things are -------------------------------------------------------------------------

  /** The horizon line, in rows from the top. The field starts here. */
  private horizon(world: World) {
    return world.rows * world.params.meadow.horizon;
  }

  /** The row of the ground at depth z (0 at the horizon, 1 at the bottom of the screen). */
  private groundAt(world: World, z: number) {
    const h = this.horizon(world);
    return h + z * (world.rows - 1 - h);
  }

  /** The lowest row of open sky at column x: just above the far hills there. */
  private skyFloor(world: World, x: number) {
    const m = world.params.meadow;
    return (
      this.horizon(world) -
      Math.max(hillHeight(x, m.farHills, HILL_SEEDS[0]), hillHeight(x, m.nearHills, HILL_SEEDS[1]))
    );
  }

  /** Spawns or removes fireflies so the count matches the Fireflies slider. */
  private syncCount(world: World) {
    const want = Math.min(CAP, Math.round(world.params.meadow.count));
    while (this.n < want) this.spawn(world);
    if (this.n > want) this.n = want;
  }

  /**
   * How high a firefly at depth z hovers above the ground, in cells. Nearer means higher on screen,
   * the same height in the world seen from closer.
   */
  private hoverAt(world: World, i: number) {
    const z = this.depth[i];
    return (0.4 + this.home[i] * world.params.meadow.hoverHeight) * (0.2 + 0.8 * z);
  }

  /** Adds one firefly somewhere over the field, with a random depth, phase and pace. */
  private spawn(world: World) {
    const i = this.n++;
    this.place(world, i);
    this.vis[i] = 1;
  }

  /** Puts firefly i at a new random spot over the field (a newcomer, or a stray coming back). */
  private place(world: World, i: number) {
    this.strayT[i] = 0;
    // More of them in the middle and near part of the field, where there is room to see them
    this.depth[i] = 0.06 + 0.94 * Math.pow(Math.random(), 0.75);
    this.home[i] = Math.random();
    this.x[i] = rand(0, world.cols);
    this.y[i] = this.groundAt(world, this.depth[i]) - this.hoverAt(world, i);
    this.vx[i] = this.vy[i] = 0;
    this.heading[i] = rand(0, TAU);
    this.wanderA[i] = gauss() * 0.5;
    this.pace[i] = rand(0.6, 1.3);
    this.phase[i] = Math.random();
    this.rateJ[i] = rand(-1, 1);
  }

  /** Press: the start of a possible tap. */
  pointerDown(_x: number, _y: number, world: World) {
    this.pressed = true;
    this.pressedAt = world.time;
  }

  /** Release: a press shorter than Tap length was a tap, so every firefly nearby flashes now. */
  pointerUp(x: number, y: number, world: World) {
    const m = world.params.meadow;
    if (this.pressed && world.time - this.pressedAt < m.tapTime) {
      const r2 = m.tapRadius * m.tapRadius;
      for (let i = 0; i < this.n; i++) {
        const dx = this.x[i] - x;
        const dy = this.y[i] - y;
        if (dx * dx + dy * dy > r2) continue;
        this.phase[i] = 0; // flash starts now
        if (this.qn < CAP) this.queue[this.qn++] = i; // and nudges its neighbours on the next step
      }
    }
    this.pressed = false;
  }

  /** One fixed step: flash cycles and their coupling first, then the movement. */
  step(dt: number, world: World) {
    this.syncCount(world);
    const m = world.params.meadow;
    const n = this.n;

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

    // ---- Strays: now and then one starts to drift up; when its time is up it comes back as a newcomer ----
    const strayChance = (m.strayRate / 60) * dt; // per firefly per step, so Strays per minute overall
    for (let i = 0; i < n; i++) {
      if (this.strayT[i] > 0) {
        this.strayT[i] += dt;
        // Fade out over the last 40% of the stray time
        this.vis[i] = Math.min(1, (1 - this.strayT[i] / m.strayTime) / 0.4);
        if (this.strayT[i] >= m.strayTime) {
          this.place(world, i);
          this.vis[i] = 0; // and fade in from nothing at its new spot
        }
      } else {
        if (this.vis[i] < 1) this.vis[i] = Math.min(1, this.vis[i] + dt / 2.5);
        else if (Math.random() < strayChance / Math.max(1, n)) this.strayT[i] = dt;
      }
    }

    // ---- Movement ----
    const sqrtDt = Math.sqrt(dt);
    const wanderDecay = Math.exp(-0.5 * dt);
    const relax = 1 - Math.exp(-1.5 * dt); // how quickly velocity settles on where it wants to go
    const span = world.cols + 4;
    for (let i = 0; i < n; i++) {
      // Gentle wandering: the heading turns by a slowly changing amount (a smoothed random walk)
      this.wanderA[i] = this.wanderA[i] * wanderDecay + gauss() * m.wander * sqrtDt;
      this.heading[i] += this.wanderA[i] * dt;
      // Far away, the same flight covers less of the screen
      const near = 0.3 + 0.7 * this.depth[i];
      const speed = m.drift * this.pace[i] * near;

      // A spring toward its hover height above its own spot in the field (Hover pull). Half the
      // vertical drift, so they mostly wander sideways, the way fireflies over a field do.
      const ground = this.groundAt(world, this.depth[i]);
      let homeY = ground - this.hoverAt(world, i);
      if (this.strayT[i] > 0) {
        // A stray's home rises slowly (eased), so it lifts off gently and keeps climbing
        const e = Math.min(1, this.strayT[i] / m.strayTime);
        homeY -= m.strayRise * (0.3 + 0.7 * this.depth[i]) * e * e * (3 - 2 * e);
      }
      const tx = Math.cos(this.heading[i]) * speed;
      const ty = Math.sin(this.heading[i]) * speed * 0.5 + (homeY - this.y[i]) * m.hover;
      this.vx[i] += (tx - this.vx[i]) * relax;
      this.vy[i] += (ty - this.vy[i]) * relax;

      this.x[i] += this.vx[i] * dt;
      this.y[i] += this.vy[i] * dt;
      // Wrap sideways; never above the top or into the ground
      if (this.x[i] < -2) this.x[i] += span;
      else if (this.x[i] > world.cols + 2) this.x[i] -= span;
      if (this.y[i] < 0) {
        this.y[i] = 0;
        if (this.vy[i] < 0) this.vy[i] = 0;
      }
      if (this.y[i] > ground - 0.3) {
        this.y[i] = ground - 0.3;
        if (this.vy[i] > 0) this.vy[i] = 0;
      }
    }
  }

  /**
   * Starts a shooting star now and then (on average every Shooting star every seconds, but never on
   * a beat), moves the ones in flight along their straight path and drops the ones that have faded.
   *
   * Most come in over the top edge, the rest over a side edge, and cross a good part of the sky
   * (Shooting star path, as a share of the screen width). The path is cut short so it ends well above
   * the hills, and the star has faded out by then, so it never looks like it flies off into the field.
   */
  private stepShootingStars(dt: number, world: World) {
    const m = world.params.meadow;
    if (world.time >= this.nextShoot) {
      this.nextShoot = world.time + m.shootEvery * rand(0.5, 1.5);
      if (this.sn < SHOOT_CAP && this.starVis > 0.4) {
        const sky = this.horizon(world) - m.farHills; // the top of the hills, roughly
        const cols = world.cols;
        let x0: number;
        let y0: number;
        let angle: number; // radians below the horizontal
        let side: number; // 1 flies to the right, -1 to the left
        if (Math.random() < SHOOT_FROM_TOP) {
          // Over the top edge, fairly steep, mostly heading toward the middle of the screen
          x0 = rand(0.05, 0.95) * cols;
          y0 = -1;
          angle = rand(0.35, 0.75);
          side = x0 < cols / 2 !== Math.random() < 0.25 ? 1 : -1;
        } else {
          // Over a side edge, in the upper sky, flatter
          side = Math.random() < 0.5 ? 1 : -1;
          x0 = side > 0 ? -1 : cols + 1;
          y0 = rand(0.02, 0.35) * sky;
          angle = rand(0.12, 0.4);
        }
        const dx = Math.cos(angle) * side;
        const dy = Math.sin(angle);
        // Cross Shooting star path of the width, but end well above the hills
        const want = (rand(0.8, 1.2) * m.shootPath * cols) / Math.abs(dx);
        const room = (sky * SHOOT_END - y0) / dy;
        const length = Math.min(want, room);
        if (length > 8) {
          const i = this.sn++;
          this.sx[i] = x0;
          this.sy[i] = y0;
          this.sdx[i] = dx;
          this.sdy[i] = dy;
          this.sSpeed[i] = m.shootSpeed * rand(0.8, 1.2);
          this.sAge[i] = 0;
          this.sLife[i] = length / this.sSpeed[i];
          this.sDist[i] = 0;
        }
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

  /**
   * Draws the sky (stars, shooting stars), then the field, then the fireflies. The fireflies' light is
   * worked out first so the field can leave out the cells where a firefly is in front of the grass.
   */
  draw(r: GlyphRenderer, world: World) {
    this.updateLand(world);
    this.fitMaps(world);
    this.drawMilkyWay(r, world);
    this.drawStars(r, world);
    this.drawShootingStars(r, world);
    this.lightFireflies(world);
    this.drawField(r, world);
    this.drawFireflies(r, world);
  }

  /** Makes the per-cell maps match the grid (only reallocates when the grid size changed). */
  private fitMaps(world: World) {
    const size = Math.ceil(world.cols) * Math.ceil(world.rows);
    if (this.glow.length !== size) {
      this.glow = new Float32Array(size);
      this.glowZ = new Float32Array(size);
      this.glowA = new Float32Array(size);
      this.touched = new Int32Array(size);
      this.taken = new Uint8Array(size);
    }
  }

  /**
   * Works out every firefly's light into the glow map: lit ones as a round ramp, keeping the brighter
   * value where glows overlap (with the depth it came from), and their own cell as 1 + flash. Size and
   * brightness shrink with distance. Nothing is drawn yet.
   */
  private lightFireflies(world: World) {
    const m = world.params.meadow;
    const cols = Math.ceil(world.cols);
    const rows = Math.ceil(world.rows);
    const glow = this.glow;
    const glowZ = this.glowZ;
    const glowA = this.glowA;
    const touched = this.touched;
    this.tn = 0;

    const L = m.flashLength;
    const rise = L * 0.2; // quick rise over the first fifth of the flash, then a slower fade
    for (let i = 0; i < this.n; i++) {
      const z = this.depth[i];
      const p = this.phase[i];
      const px = this.x[i];
      const py = this.y[i];
      const cx = Math.floor(px);
      const cy = Math.floor(py);
      const a = this.vis[i];
      if (a < 0.02) continue; // faded out completely
      const flash = (p >= L ? 0 : p < rise ? p / rise : Math.pow(1 - (p - rise) / (L - rise), 1.6)) * a;
      // Ramp cells: I = flash * (1 - d / R)^2 for every cell centre within R of the firefly
      const R = m.glowRadius * (0.25 + 0.75 * z);
      const strength = m.glowStrength * (0.4 + 0.6 * z);
      if (flash >= 0.02 && R > 0.3 && strength > 0) {
        const R2 = R * R;
        const reach = Math.ceil(R);
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
            const I = Math.min(0.999, strength * flash * k * k);
            if (I < GLOW_MIN) continue;
            const idx = gy * cols + gx;
            const was = glow[idx];
            if (was === 0) touched[this.tn++] = idx;
            if (I > was) {
              glow[idx] = I;
              glowZ[idx] = z;
            }
          }
        }
      }
      // The firefly's own cell holds 1 + flash, so it beats any ramp value and the brighter of two
      // cores wins. A dark firefly still keeps a faint body (flash 0).
      if (cx >= 0 && cx < cols && cy >= 0 && cy < rows) {
        const idx = cy * cols + cx;
        const was = glow[idx];
        if (was === 0) touched[this.tn++] = idx;
        if (1 + flash > was) {
          glow[idx] = 1 + flash;
          glowZ[idx] = z;
          glowA[idx] = a;
        }
      }
    }
  }

  /**
   * Draws each lit cell once: a ramp character with a faint tile, or for a firefly's own cell a soft
   * tile and a "•" (just a faint body between flashes). Cells the field hid are skipped. Then the
   * map is cleared for the next frame.
   */
  private drawFireflies(r: GlyphRenderer, world: World) {
    const m = world.params.meadow;
    const cols = Math.ceil(world.cols);
    const col = rgb(m.colFirefly);
    const glow = this.glow;
    const glowZ = this.glowZ;
    for (let k = 0; k < this.tn; k++) {
      const idx = this.touched[k];
      const v = glow[idx];
      const z = glowZ[idx];
      glow[idx] = 0;
      if (v <= 0) continue; // hidden behind nearer grass
      const gy = Math.floor(idx / cols);
      const gx = idx - gy * cols;
      if (v >= 1) {
        const f = v - 1;
        if (f < 0.02) {
          // dark: a faint body (fading with a stray)
          r.push(gx, gy, 0, packShade(col, -0.35, m.restGlow * (0.4 + 0.6 * z) * this.glowA[idx]), CORE);
        } else {
          const tile = m.coreTile * (0.2 + 0.8 * z) * (0.4 + 0.6 * f);
          r.push(gx, gy, packShade(col, 0.2 * f, tile), packShade(col, 0.6 + 0.35 * f, 0.5 + 0.5 * f), CORE);
        }
      } else {
        let step = 0;
        while (step < 3 && v >= RAMP_FROM[step + 1]) step++;
        r.push(gx, gy, packRgb(col, v * m.tileGlow), packShade(col, 0.5 * v, Math.min(1, 0.55 + v)), RAMP[step]);
      }
    }
    this.tn = 0;
  }

  /**
   * The Milky Way: a soft band of haze across the sky with many dim stars of its own, drawn behind the
   * other stars. It runs from near the horizon on the left to high up on the right, in sky coordinates
   * that drift with the stars and wrap round the screen; it fades out toward both ends (by
   * sin(pi * u)^0.6, u going 0 to 1 across the screen in sky coordinates), so the wrap never shows.
   * Across the band the haze falls off like a Gaussian, smooth noise makes it clumpy, and a darker
   * lane of dust runs along it, just off its middle.
   */
  private drawMilkyWay(r: GlyphRenderer, world: World) {
    const m = world.params.meadow;
    const vis = this.starVis;
    if (vis < 0.01 || (m.milkyWay <= 0 && m.milkyStars <= 0)) return;
    this.fitMilkyWay(world);
    const col = rgb(m.colMilky);
    for (let k = 0; k < this.milkyN; k++) {
      const haze = this.milkyHaze[k]! * vis;
      const star = this.milkyStar[k]! * vis;
      if (star > 0)
        r.push(
          this.milkyX[k]!,
          this.milkyY[k]!,
          packRgb(col, haze),
          packRgb(col, star),
          k & 1 ? MILKY_FAINT : MILKY_DOT,
        );
      else r.push(this.milkyX[k]!, this.milkyY[k]!, packRgb(col, haze), 0, 0);
    }
  }

  /** Rebuilds the cached Milky Way cells when the sky has drifted a whole cell or anything it depends on changed. */
  private fitMilkyWay(world: World) {
    const m = world.params.meadow;
    const cols = Math.ceil(world.cols);
    const shiftCells = Math.floor(m.starDrift * world.clock.minutes);
    const key = this.milkyKey;
    if (
      key[0] === cols &&
      key[1] === world.rows &&
      key[2] === shiftCells &&
      key[3] === m.milkyWay &&
      key[4] === m.milkyStars &&
      key[5] === m.horizon &&
      key[6] === m.farHills + m.nearHills * 100
    )
      return;
    key[0] = cols;
    key[1] = world.rows;
    key[2] = shiftCells;
    key[3] = m.milkyWay;
    key[4] = m.milkyStars;
    key[5] = m.horizon;
    key[6] = m.farHills + m.nearHills * 100;

    const skyRows = Math.max(1, this.horizon(world) - m.farHills * 0.55 - 1);
    // Enough room for the widest band; grows only when the grid does (this runs rarely, not per frame)
    const room = Math.ceil(cols * skyRows * 0.6);
    if (this.milkyX.length < room) {
      this.milkyX = new Int16Array(room);
      this.milkyY = new Int16Array(room);
      this.milkyHaze = new Float32Array(room);
      this.milkyStar = new Float32Array(room);
    }
    let n = 0;
    for (let x = 0; x < cols; x++) {
      // Sky coordinate of this column: the band moves with the stars and wraps every screen width
      const sx = (((x - shiftCells) % cols) + cols) % cols;
      const u = sx / cols;
      const ends = Math.pow(Math.sin(Math.PI * u), 0.6); // fades out toward both ends
      if (ends < 0.03) continue;
      const centre = skyRows * (0.95 - 0.85 * u); // low on the left, high on the right
      const width = skyRows * (0.09 + 0.06 * Math.sin(Math.PI * u)); // a little wider in the middle
      const y0 = Math.max(0, Math.floor(centre - 2.2 * width));
      const y1 = Math.min(Math.floor(this.skyFloor(world, x + 0.5)) - 1, Math.ceil(centre + 2.2 * width));
      for (let y = y0; y <= y1 && n < room; y++) {
        const d = (y + 0.5 - centre) / width;
        const clump = noise2(sx * 0.11, y * 0.22, SEED + 3);
        const lane = 1 - 0.6 * Math.exp(-((d + 0.15) * (d + 0.15)) / 0.05) * noise2(sx * 0.05, 7.5, SEED + 4);
        const I = ends * Math.exp(-d * d) * (0.45 + 0.55 * clump) * lane;
        if (I < 0.05) continue;
        this.milkyX[n] = x;
        this.milkyY[n] = y;
        this.milkyHaze[n] = m.milkyWay * I;
        // Its own dim stars, most where the band is brightest (places from a hash in sky coordinates)
        this.milkyStar[n] =
          hash2(sx, y, SEED + 5) < m.milkyStars * I ? (0.3 + 0.45 * hash2(sx, y, SEED + 6)) * Math.sqrt(I) : 0;
        n++;
      }
    }
    this.milkyN = n;
  }

  /**
   * The stars: mostly faint "·", some "•", and a few bright "+" with a soft tile. They fill the sky
   * down to the hills, thinning toward the horizon the way haze hides the low ones, and twinkle
   * slowly. Their places come from a hash, so none are stored.
   *
   * The whole sky drifts slowly from left to right, the way the night sky turns (east to west, looking
   * south), wrapping round at the edges. The shift comes from the time of day (Star drift times the
   * minutes since midnight), so the stars stand in the same place at the same hour in every tab.
   */
  private drawStars(r: GlyphRenderer, world: World) {
    const m = world.params.meadow;
    const col = rgb(m.colStar);
    const vis = this.starVis;
    if (vis < 0.01) return; // daytime: no stars
    const skyRows = Math.max(1, this.horizon(world) - m.farHills * 0.55 - 1);
    // A density rather than a count, so a big screen gets as starry a sky as a small one
    const count = Math.min(MAX_STARS, Math.round((m.starDensity / 1000) * world.cols * skyRows));
    const cols = world.cols;
    const shift = m.starDrift * world.clock.minutes;
    for (let i = 0; i < count; i++) {
      const x = Math.floor((((hash2(i, 0, SEED) * cols + shift) % cols) + cols) % cols);
      // u^1.4 puts more stars high up and fewer near the horizon
      const u = Math.pow(hash2(i, 1, SEED), 1.4);
      const y = Math.floor(u * skyRows);
      if (y >= this.skyFloor(world, x + 0.5) - 1) continue; // behind the hills
      const rate = 0.2 + hash2(i, 2, SEED) * 0.6; // slow: a calm sky, not a flickering one
      const tw = 1 - m.twinkle * (0.5 + 0.5 * Math.sin(world.time * rate + hash2(i, 3, SEED) * TAU));
      const haze = (1 - 0.55 * u) * vis; // the lowest stars are a little dimmer; all fade by day
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
   * Shooting stars: a bright "*" head, then a streak of "-" and a tail of "·" that fade with distance
   * (it reads as *--··· in motion). It comes in at full brightness (it enters from off screen) and
   * fades out over the last part of its path, so it is gone before the path ends.
   */
  private drawShootingStars(r: GlyphRenderer, world: World) {
    if (this.sn === 0) return;
    const m = world.params.meadow;
    const col = rgb(m.colShoot);
    const len = m.shootLength;
    for (let i = 0; i < this.sn; i++) {
      const e = this.sAge[i] / this.sLife[i];
      const fadeOut = e < 1 - SHOOT_FADE ? 1 : Math.pow((1 - e) / SHOOT_FADE, 1.3);
      const bright = Math.min(1, e / 0.05) * fadeOut;
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
   * The field: one rank of grass rooted in every row from the bottom of the screen up to the horizon,
   * drawn front to back so nearer blades hide the ones behind them (`taken`). For a row at depth z:
   * - blades get taller (Grass height times z^1.7), so far rows are single marks;
   * - how much of the ground the grass covers goes from Grass density (far) to (near). A tall blade
   *   covers several rows, so the chance to root a blade in a row is lowered to match:
   *   p = 1 - (1 - cover)^(1 / average height). Smooth noise then thins it into clumps and gaps;
   * - the colour fades into the horizon sky with distance (Distance haze), and gets darker;
   * - sway grows with z, so the far field is still and the near grass moves most;
   * - the wind is a wave whose crests move from the horizon toward you (its phase grows with the
   *   distance 1 / (z + 0.15) plus time), times a slow gust envelope, so gusts roll through the field.
   * A grass cell nearer than a firefly in the same cell hides it; a farther one is left out.
   */
  private drawField(r: GlyphRenderer, world: World) {
    const m = world.params.meadow;
    const cols = Math.ceil(world.cols);
    const bottom = Math.floor(world.rows) - 1;
    const top = Math.ceil(this.horizon(world));
    if (m.grassHeight <= 0 || top > bottom) return;
    const dark = rgb(m.colGrassDark);
    const mid = rgb(m.colGrass);
    const tip = rgb(m.colGrassTip);
    const hazeCol = this.land.skyHorizon; // far grass fades into the sky at the horizon
    const t = world.time * m.windSpeed;
    const taken = this.taken;
    taken.fill(0);
    const glow = this.glow;
    const glowZ = this.glowZ;

    // Start a few rows below the screen: blades rooted there still reach up into view, so the nearest
    // grass fills the bottom edge the way it would in a real field
    const below = Math.ceil(m.grassHeight * 0.6);
    for (let row = bottom + below; row >= top; row--) {
      const z = Math.min(1, (row - top) / Math.max(1, bottom - top));
      const far = z < FAR_UNTIL;
      const tall = m.grassHeight * Math.pow(z, 1.7);
      const cover = m.farGrass + (m.grassDensity - m.farGrass) * z;
      const plant = 1 - Math.pow(1 - Math.min(0.99, cover), 1 / Math.max(1, far ? 1 : tall * 0.675));
      // Mix toward the haze colour with distance, and darken: k is how much of the grass colour is left
      const k = 1 - m.haze * Math.pow(1 - z, 1.5);
      const light = 0.35 + 0.65 * z;
      const dist = 1 / (z + 0.15);
      const sway = m.grassSway * Math.pow(z, 1.5);
      for (let x = 0; x < cols; x++) {
        // Clumps: noise that is wide across and, further away, squeezed into fewer rows
        const clump = noise2(x * 0.09, row * (0.15 + 0.35 * (1 - z)), SEED + 1);
        if (hash2(x, row, SEED) > plant * (0.25 + 1.5 * clump * clump)) continue; // no blade rooted here
        const h = far ? 1 : Math.max(1, Math.round(tall * (0.35 + 0.65 * hash2(x, row + 999, SEED))));
        const base = hash2(x, row + 555, SEED) < 0.5 ? dark : mid;
        const tone = (0.9 + 0.2 * hash2(x, row + 777, SEED)) * light;
        const gust = 1 - m.gusts + m.gusts * (0.5 + 0.5 * Math.sin(t * 0.23 + x * 0.013));
        const wind = (Math.sin(x * 0.06 + dist * 1.1 + t * 1.4) + 0.5 * Math.sin(x * 0.021 - t * 0.5)) * gust;
        const tipOffset = sway * wind * 0.35 * h;
        let off = 0;
        for (let s = 0; s < h; s++) {
          const u = (s + 1) / h;
          const nextOff = Math.round(tipOffset * u * u); // blades bend more toward the tip
          const cx = x + off;
          const cy = row - s;
          // The blade leans the way its next cell steps
          let g = nextOff > off ? LEAN_RIGHT : nextOff < off ? LEAN_LEFT : BLADE;
          off = nextOff;
          if (cx < 0 || cx >= cols || cy < 0 || cy > bottom) continue;
          const idx = cy * cols + cx;
          if (taken[idx]) continue; // a nearer blade is already here
          if (glow[idx] > 0) {
            if (glowZ[idx] >= z) continue; // the firefly is in front of this blade
            glow[idx] = -1; // this blade is in front of the firefly: hide its light here
          }
          taken[idx] = 1;
          let fg: number;
          if (far) {
            g = FAR_MARKS[Math.floor(hash2(x, row + 333, SEED) * 4)];
            fg = this.grassColor(base, hazeCol, k, tone * 0.85);
          } else if (s === h - 1 && h > 1) {
            // The tip: a lighter shade, leaning with the wind (an apostrophe when it is calm)
            g = tipOffset > 0.6 ? LEAN_RIGHT : tipOffset < -0.6 ? LEAN_LEFT : TIP;
            fg = this.grassColor(tip, hazeCol, k, tone);
          } else {
            if (h <= 2 && s === 0) g = STUB;
            fg = this.grassColor(base, hazeCol, k, tone * (0.8 + 0.2 * u)); // a little darker at the root
          }
          const tile = m.grassTile * z * (0.5 + 0.5 * u);
          r.push(cx, cy, tile > 0.004 ? pack(base[0], base[1], base[2], tile) : 0, fg, g);
        }
      }
    }
  }

  /** A grass colour faded toward the haze colour (k is how much grass colour is left) and scaled by tone. */
  private grassColor(c: readonly number[], hazeCol: readonly number[], k: number, tone: number) {
    const r = (hazeCol[0] + (c[0] - hazeCol[0]) * k) * tone;
    const g = (hazeCol[1] + (c[1] - hazeCol[1]) * k) * tone;
    const b = (hazeCol[2] + (c[2] - hazeCol[2]) * k) * tone;
    // (clamped: pack() wraps a channel above 255 instead of capping it)
    return pack(Math.min(255, r), Math.min(255, g), Math.min(255, b), 1);
  }
}
