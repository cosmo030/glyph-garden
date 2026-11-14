import type { GlyphRenderer } from '../render/renderer';
import { packRgb, packShade, shadeInto, type RGB } from '../render/color';
import { glyph } from '../render/atlas';
import { hash2, noise2, gauss, rand } from '../sim/noise';
import { rgb } from '../sim/colors';
import type { Species, World } from '../sim/world';

// Koi: a school of fish drawn as tiles of characters.
// Clicking drops food pellets; nearby fish do an escape turn, then come back to eat.
//
// How a fish moves (like a real koi):
// - Spine: a chain of joints behind the head. Each joint follows the one in front,
//   so the body curves along the path the fish actually swam.
// - Swimming wave: a sideways wave runs from head to tail. It is small at the head
//   and large at the tail, which is what makes a fish look like it is pushing water.
// - Burst and glide: a few tail beats, then a glide with the body straightening out.
// - Fins: the forked tail fin flexes and lags behind the body; pectoral fins paddle.
//
// Drawing: we walk over the fish in its own body coordinates (along the spine, across
// the body) and mark every grid cell those points land on. Each cell is drawn once per fish.

const CAP = 160; // max fish
const PCAP = 128; // max pellets
const N = 12; // spine segments
const J = N + 1; // spine joints

const BODY_CHARS = '#%&@8$=+*0'.split('').map(glyph);
const FRINGE = ['-', '\\', '|', '/'].map(glyph);
const EYE = glyph('•');
const PELLET = glyph('°');
const TAU = Math.PI * 2;

enum Variant {
  Kohaku, // white with red
  Orange,
  Gold,
  Chagoi, // brown
  Showa, // white with red and black
}

export class Koi implements Species {
  readonly id = 'koi';
  readonly label = 'Koi';
  readonly dot = '#d9a623';
  readonly hint = 'click to feed';

  // Fish, stored as parallel typed arrays (no per-fish objects)
  private n = 0;
  private x = new Float32Array(CAP); // head position
  private y = new Float32Array(CAP);
  private heading = new Float32Array(CAP);
  private speed = new Float32Array(CAP);
  private kx = new Float32Array(CAP); // splash push, decays over time
  private ky = new Float32Array(CAP);
  private wanderA = new Float32Array(CAP);
  private phase = new Float32Array(CAP); // swimming wave phase
  private finPhase = new Float32Array(CAP);
  private env = new Float32Array(CAP); // how hard the tail is beating (0 = gliding)
  private stroking = new Uint8Array(CAP); // 1 = beating, 0 = gliding
  private strokeT = new Float32Array(CAP); // time left in the current beat/glide
  private fright = new Float32Array(CAP); // escape response, decays quickly
  private size = new Float32Array(CAP);
  private grow = new Float32Array(CAP);
  private pace = new Float32Array(CAP);
  private variant = new Uint8Array(CAP);
  private seed = new Uint32Array(CAP);
  private spine = new Float32Array(CAP * J * 2); // joint 0 = head

  // Pellets
  private pn = 0;
  private px = new Float32Array(PCAP);
  private py = new Float32Array(PCAP);
  private pvx = new Float32Array(PCAP);
  private pvy = new Float32Array(PCAP);
  private page = new Float32Array(PCAP);
  private plife = new Float32Array(PCAP);

  // Scratch values reused every frame (nothing allocated while running)
  private patchOrange: RGB = [0, 0, 0];
  private patchGold: RGB = [0, 0, 0];
  private segX = new Float32Array(N); // unit direction of each segment (pointing to the head)
  private segY = new Float32Array(N);
  private sx = 0; // result of spineAt()
  private sy = 0;
  private sdx = 0;
  private sdy = 0;
  private stamp = new Int32Array(1);
  private stampW = 0;
  private stampH = 0;
  private stampId = 0;

  // Spatial grid for neighbour lookups (each fish only checks nearby fish)
  private gridHead = new Int32Array(1);
  private gridNext = new Int32Array(CAP);
  private gw = 1;
  private gh = 1;
  private gcell = 8;
  private gx0 = 0;
  private gy0 = 0;

  enter(world: World) {
    this.n = 0;
    this.pn = 0;
    this.syncCount(world);
  }

  count() {
    return this.n;
  }

  rescale(sx: number, sy: number) {
    for (let i = 0; i < this.n; i++) {
      this.x[i] *= sx;
      this.y[i] *= sy;
    }
    for (let k = 0; k < this.n * J; k++) {
      this.spine[k * 2] *= sx;
      this.spine[k * 2 + 1] *= sy;
    }
    for (let i = 0; i < this.pn; i++) {
      this.px[i] *= sx;
      this.py[i] *= sy;
    }
  }

  private margin(world: World) {
    const k = world.params.koi;
    return k.length * (1 + k.tailLength) * Math.max(k.sizeMin, k.sizeMax) * world.params.food.maxGrowth + 4;
  }

  private syncCount(world: World) {
    const want = Math.min(CAP, Math.round(world.params.koi.count));
    while (this.n < want) this.spawn(world);
    if (this.n > want) this.n = want;
  }

  private spawn(world: World) {
    const k = world.params.koi;
    const i = this.n++;
    const m = this.margin(world);
    const hx = rand(-m, world.cols + m);
    const hy = rand(-m, world.rows + m);
    const h = (world.params.world.currentAngle * Math.PI) / 180 + gauss() * 0.8;
    this.x[i] = hx;
    this.y[i] = hy;
    this.heading[i] = h;
    this.speed[i] = k.cruiseSpeed * rand(0.5, 1);
    this.kx[i] = this.ky[i] = 0;
    this.wanderA[i] = gauss() * 0.5;
    this.phase[i] = Math.random() * TAU;
    this.finPhase[i] = Math.random() * TAU;
    this.env[i] = Math.random();
    this.stroking[i] = Math.random() < 0.5 ? 1 : 0;
    this.strokeT[i] = Math.random() * 1.5;
    this.fright[i] = 0;
    const lo = Math.min(k.sizeMin, k.sizeMax);
    const hi = Math.max(k.sizeMin, k.sizeMax);
    this.size[i] = lo + (hi - lo) * Math.pow(Math.random(), 1.4);
    this.grow[i] = 1;
    this.pace[i] = rand(0.8, 1.2);
    this.seed[i] = (Math.random() * 1e9) | 0;
    this.variant[i] = pickVariant(k);
    // Lay the spine out straight behind the head
    const seg = (k.length * this.size[i]) / N;
    const b = i * J * 2;
    for (let j = 0; j < J; j++) {
      this.spine[b + j * 2] = hx - Math.cos(h) * seg * j;
      this.spine[b + j * 2 + 1] = hy - Math.sin(h) * seg * j;
    }
  }

  pointerDown(x: number, y: number, world: World) {
    const f = world.params.food;
    for (let j = 0; j < f.perClick; j++) {
      if (this.pn >= PCAP) this.removePellet(0);
      const i = this.pn++;
      this.px[i] = x + gauss() * f.spread * 0.6;
      this.py[i] = y + gauss() * f.spread * 0.6;
      const a = Math.random() * TAU;
      const s = Math.random() * f.drift;
      this.pvx[i] = Math.cos(a) * s;
      this.pvy[i] = Math.sin(a) * s;
      this.page[i] = 0;
      this.plife[i] = f.life * rand(0.8, 1.2);
    }
    world.effects.ripple(x, y, world.params.ripple.life, 1);
    // The splash triggers an escape: a sharp turn away and a burst of fast tail beats
    const R = f.startleRadius;
    if (R > 0 && f.startle > 0) {
      for (let i = 0; i < this.n; i++) {
        const dx = this.x[i] - x;
        const dy = this.y[i] - y;
        const d = Math.hypot(dx, dy);
        if (d < R && d > 1e-3) {
          const k = 1 - d / R;
          const s = (f.startle * k) / d;
          this.kx[i] += dx * s;
          this.ky[i] += dy * s;
          this.fright[i] = Math.max(this.fright[i], k);
        }
      }
    }
  }

  private removePellet(i: number) {
    const last = --this.pn;
    this.px[i] = this.px[last];
    this.py[i] = this.py[last];
    this.pvx[i] = this.pvx[last];
    this.pvy[i] = this.pvy[last];
    this.page[i] = this.page[last];
    this.plife[i] = this.plife[last];
  }

  private buildGrid(world: World) {
    const k = world.params.koi;
    const m = this.margin(world);
    this.gcell = Math.max(2, k.schoolRadius, k.separationDist);
    this.gx0 = -m;
    this.gy0 = -m;
    this.gw = Math.max(1, Math.ceil((world.cols + 2 * m) / this.gcell));
    this.gh = Math.max(1, Math.ceil((world.rows + 2 * m) / this.gcell));
    const size = this.gw * this.gh;
    if (this.gridHead.length < size) this.gridHead = new Int32Array(size * 2);
    this.gridHead.fill(-1, 0, size);
    for (let i = 0; i < this.n; i++) {
      const cx = Math.min(this.gw - 1, Math.max(0, Math.floor((this.x[i] - this.gx0) / this.gcell)));
      const cy = Math.min(this.gh - 1, Math.max(0, Math.floor((this.y[i] - this.gy0) / this.gcell)));
      const c = cy * this.gw + cx;
      this.gridNext[i] = this.gridHead[c];
      this.gridHead[c] = i;
    }
  }

  step(dt: number, world: World) {
    this.syncCount(world);
    const k = world.params.koi;
    const f = world.params.food;
    const w = world.params.world;

    // Pellets drift, slow down, and dissolve
    const pdamp = Math.exp(-1.2 * dt);
    for (let i = 0; i < this.pn; ) {
      this.page[i] += dt;
      if (this.page[i] >= this.plife[i]) {
        this.removePellet(i);
        continue;
      }
      this.pvx[i] *= pdamp;
      this.pvy[i] *= pdamp;
      this.px[i] += this.pvx[i] * dt;
      this.py[i] += this.pvy[i] * dt;
      i++;
    }

    this.buildGrid(world);
    const curA = (w.currentAngle * Math.PI) / 180;
    const curX = Math.cos(curA) * w.currentStrength;
    const curY = Math.sin(curA) * w.currentStrength;
    const school2 = k.schoolRadius * k.schoolRadius;
    const sep2 = k.separationDist * k.separationDist;
    const sense2 = f.senseRadius * f.senseRadius;
    const m = this.margin(world);
    const spanX = world.cols + 2 * m;
    const spanY = world.rows + 2 * m;
    const kickDecay = Math.exp(-k.kickDamping * dt);
    const frightDecay = Math.exp(-2.5 * dt);
    const glideDecay = Math.exp(-k.glideDrag * dt);
    const stiff = Math.min(0.95, k.spineStiffness);

    for (let i = 0; i < this.n; i++) {
      const xi = this.x[i];
      const yi = this.y[i];
      const h = this.heading[i];
      const s = this.size[i] * this.grow[i];

      // ---- Where does this fish want to go? ----
      this.wanderA[i] = this.wanderA[i] * Math.exp(-0.3 * dt) + gauss() * k.wanderRate * Math.sqrt(dt);
      let dx = Math.cos(h) + Math.cos(h + this.wanderA[i]) * k.wander + curX;
      let dy = Math.sin(h) + Math.sin(h + this.wanderA[i]) * k.wander + curY;

      // Schooling
      let ax = 0, ay = 0, cx = 0, cy = 0, sx = 0, sy = 0, nb = 0;
      const gcx = Math.floor((xi - this.gx0) / this.gcell);
      const gcy = Math.floor((yi - this.gy0) / this.gcell);
      for (let oy = -1; oy <= 1; oy++) {
        const ry = gcy + oy;
        if (ry < 0 || ry >= this.gh) continue;
        for (let ox = -1; ox <= 1; ox++) {
          const rx = gcx + ox;
          if (rx < 0 || rx >= this.gw) continue;
          for (let j = this.gridHead[ry * this.gw + rx]; j !== -1; j = this.gridNext[j]) {
            if (j === i) continue;
            const ex = this.x[j] - xi;
            const ey = this.y[j] - yi;
            const d2 = ex * ex + ey * ey;
            if (d2 > school2) continue;
            nb++;
            ax += Math.cos(this.heading[j]);
            ay += Math.sin(this.heading[j]);
            cx += ex;
            cy += ey;
            if (d2 < sep2 && d2 > 1e-4) {
              sx -= ex / d2;
              sy -= ey / d2;
            }
          }
        }
      }
      if (nb > 0) {
        dx += (ax / nb) * k.alignment;
        dy += (ay / nb) * k.alignment;
        const cl = Math.hypot(cx, cy) || 1;
        dx += (cx / cl) * k.cohesion;
        dy += (cy / cl) * k.cohesion;
      }
      dx += sx * k.separation * k.separationDist;
      dy += sy * k.separation * k.separationDist;

      // Food
      let hungry = false;
      let best = -1;
      let bestD2 = sense2;
      for (let p = 0; p < this.pn; p++) {
        const ex = this.px[p] - xi;
        const ey = this.py[p] - yi;
        const d2 = ex * ex + ey * ey;
        if (d2 < bestD2) {
          bestD2 = d2;
          best = p;
        }
      }
      if (best >= 0) {
        const d = Math.sqrt(bestD2);
        const landed = this.page[best] >= f.landDelay;
        if (landed && d < f.eatRadius * Math.max(1, s)) {
          world.effects.ripple(this.px[best], this.py[best], world.params.ripple.life * 0.6, 0.35);
          this.removePellet(best);
          this.grow[i] = Math.min(f.maxGrowth, this.grow[i] + f.growth);
        } else {
          hungry = true;
          dx += ((this.px[best] - xi) / d) * f.hunger;
          dy += ((this.py[best] - yi) / d) * f.hunger;
        }
      }

      // Cursor
      if (world.cursor.active && w.cursorRadius > 0) {
        const ex = xi - world.cursor.x;
        const ey = yi - world.cursor.y;
        const d = Math.hypot(ex, ey);
        if (d < w.cursorRadius && d > 1e-3) {
          const push = (w.cursorPush * (1 - d / w.cursorRadius)) / d;
          dx += ex * push;
          dy += ey * push;
        }
      }

      dx += this.kx[i] * 0.5;
      dy += this.ky[i] * 0.5;

      // ---- Burst and glide ----
      const fr = this.fright[i];
      const urgent = hungry || fr > 0.05;
      const baseRate = k.beatRate * (1 + k.beatPerSpeed * this.speed[i]);
      this.strokeT[i] -= dt;
      if (urgent && !this.stroking[i]) {
        this.stroking[i] = 1;
        this.strokeT[i] = 0.4;
      }
      if (this.strokeT[i] <= 0) {
        if (this.stroking[i] && !urgent && Math.random() < k.glideChance && k.glideTime > 0) {
          this.stroking[i] = 0;
          this.strokeT[i] = k.glideTime * rand(0.5, 1.5);
        } else {
          this.stroking[i] = 1;
          this.strokeT[i] = (k.strokeBeats * rand(0.6, 1.4)) / Math.max(0.2, baseRate);
        }
      }
      const envTarget = this.stroking[i] ? 1 + fr * 0.8 : 0.1;
      this.env[i] += (envTarget - this.env[i]) * Math.min(1, (this.stroking[i] ? 5 : 1.6) * dt);
      const env = this.env[i];
      const rate = baseRate * (hungry ? 1.35 : 1) * (1 + fr * 1.5);
      this.phase[i] += TAU * rate * dt * (0.2 + 0.8 * Math.min(1, env));
      this.finPhase[i] += TAU * k.finFreq * dt * (1.4 - Math.min(1, env) * 0.6);

      // ---- Turning: faster while beating, a sharp C-turn when frightened ----
      const want = Math.atan2(dy, dx);
      let diff = want - h;
      diff = Math.atan2(Math.sin(diff), Math.cos(diff));
      // A fish can't turn on the spot: the tightest circle it can swim is a fraction
      // of its body length, so slow fish turn slowly. A fright allows a tighter C-turn.
      const radius = Math.max(0.05, k.turnRadius * k.length * s * (1 - 0.7 * Math.min(1, fr)));
      const byRadius = ((this.speed[i] + 0.6) * dt) / radius;
      const maxTurn = Math.min(
        k.turnRate * dt * (0.45 + 0.55 * Math.min(1, env)) * (hungry ? 1.5 : 1) * (1 + (k.escapeTurn - 1) * fr),
        byRadius,
      );
      const nh = h + Math.max(-maxTurn, Math.min(maxTurn, diff));
      this.heading[i] = nh;

      // ---- Speed: each beat pushes, gliding slowly loses speed ----
      if (this.stroking[i]) {
        const target = (hungry ? k.sprintSpeed : k.cruiseSpeed * this.pace[i]) * (1 + fr);
        this.speed[i] += (target - this.speed[i]) * Math.min(1, k.acceleration * dt * Math.min(1.5, env));
      } else {
        this.speed[i] *= glideDecay;
      }
      // Thrust peaks twice per tail beat
      const surge = 1 + k.surge * Math.min(1, env) * Math.sin(this.phase[i] * 2);

      this.kx[i] *= kickDecay;
      this.ky[i] *= kickDecay;
      this.fright[i] *= frightDecay;
      let nx = xi + (Math.cos(nh) * this.speed[i] * surge + this.kx[i]) * dt;
      let ny = yi + (Math.sin(nh) * this.speed[i] * surge + this.ky[i]) * dt;

      // Wrap around (with an off-screen margin), moving the whole spine along
      let shiftX = 0;
      let shiftY = 0;
      if (nx < -m) shiftX = spanX;
      else if (nx >= world.cols + m) shiftX = -spanX;
      if (ny < -m) shiftY = spanY;
      else if (ny >= world.rows + m) shiftY = -spanY;
      nx += shiftX;
      ny += shiftY;
      this.x[i] = nx;
      this.y[i] = ny;

      // ---- Spine: every joint follows the one in front of it ----
      const b = i * J * 2;
      const sp = this.spine;
      if (shiftX || shiftY) {
        for (let j = 1; j < J; j++) {
          sp[b + j * 2] += shiftX;
          sp[b + j * 2 + 1] += shiftY;
        }
      }
      sp[b] = nx;
      sp[b + 1] = ny;
      const seg = (k.length * s) / N;
      let pdx = Math.cos(nh);
      let pdy = Math.sin(nh);
      for (let j = 1; j < J; j++) {
        const fx = sp[b + (j - 1) * 2];
        const fy = sp[b + (j - 1) * 2 + 1];
        let ux = fx - sp[b + j * 2];
        let uy = fy - sp[b + j * 2 + 1];
        const len = Math.hypot(ux, uy) || 1;
        ux /= len;
        uy /= len;
        // Stiffness: lean toward the direction of the segment in front
        ux += (pdx - ux) * stiff;
        uy += (pdy - uy) * stiff;
        const l2 = Math.hypot(ux, uy) || 1;
        ux /= l2;
        uy /= l2;
        sp[b + j * 2] = fx - ux * seg;
        sp[b + j * 2 + 1] = fy - uy * seg;
        pdx = ux;
        pdy = uy;
      }
    }
  }

  /** Position and forward direction on the spine at s (0 = nose, 1 = tail base). */
  private spineAt(b: number, s: number) {
    const f = Math.min(N - 1e-4, Math.max(0, s * N));
    const j = Math.floor(f);
    const t = f - j;
    const sp = this.spine;
    this.sx = sp[b + j * 2] + (sp[b + (j + 1) * 2] - sp[b + j * 2]) * t;
    this.sy = sp[b + j * 2 + 1] + (sp[b + (j + 1) * 2 + 1] - sp[b + j * 2 + 1]) * t;
    // Blend segment directions so the body bends smoothly between joints
    const j0 = t < 0.5 ? Math.max(0, j - 1) : j;
    const j1 = t < 0.5 ? j : Math.min(N - 1, j + 1);
    const tt = t < 0.5 ? t + 0.5 : t - 0.5;
    let dx = this.segX[j0] + (this.segX[j1] - this.segX[j0]) * tt;
    let dy = this.segY[j0] + (this.segY[j1] - this.segY[j0]) * tt;
    const l = Math.hypot(dx, dy) || 1;
    this.sdx = dx / l;
    this.sdy = dy / l;
  }

  private prepareStamp(r: GlyphRenderer) {
    const w = Math.ceil(r.cols) + 2;
    const h = Math.ceil(r.rows) + 2;
    if (w * h > this.stamp.length) {
      this.stamp = new Int32Array(w * h);
      this.stampId = 0;
    }
    this.stampW = w;
    this.stampH = h;
    if (this.stampId > 2_000_000_000) {
      this.stamp.fill(0);
      this.stampId = 0;
    }
  }

  /** Marks a cell for the current fish. Returns false if off-screen or already drawn. */
  private claim(cx: number, cy: number): boolean {
    const ix = cx + 1;
    const iy = cy + 1;
    if (ix < 0 || iy < 0 || ix >= this.stampW || iy >= this.stampH) return false;
    const idx = iy * this.stampW + ix;
    if (this.stamp[idx] === this.stampId) return false;
    this.stamp[idx] = this.stampId;
    return true;
  }

  draw(r: GlyphRenderer, world: World) {
    const k = world.params.koi;
    const white = rgb(k.colWhite);
    const red = rgb(k.colRed);
    const orange = rgb(k.colOrange);
    const gold = rgb(k.colGold);
    const brown = rgb(k.colBrown);
    const black = rgb(k.colBlack);
    const fin = rgb(k.colFin);
    const eye = rgb(k.colEye);
    const glyphA = world.params.world.glyphOpacity;
    const eyeFg = packRgb(black, 0.9);
    const eyeBg = packRgb(eye, 1);
    shadeInto(this.patchOrange, orange, 0.28);
    shadeInto(this.patchGold, gold, 0.35);
    this.prepareStamp(r);

    for (let i = 0; i < this.n; i++) {
      this.stampId++;
      const s = this.size[i] * this.grow[i];
      const Lb = k.length * s;
      const W = k.width * s;
      const b = i * J * 2;
      const sp = this.spine;

      // Quick reject: skip fish that are fully off-screen
      const reach = Lb * (1 + k.tailLength) + W + k.finLength * s;
      const mx = sp[b + N * 2] * 0.5 + this.x[i] * 0.5;
      const my = sp[b + N * 2 + 1] * 0.5 + this.y[i] * 0.5;
      if (mx < -reach || my < -reach || mx > r.cols + reach || my > r.rows + reach) continue;

      for (let j = 0; j < N; j++) {
        const ux = sp[b + j * 2] - sp[b + (j + 1) * 2];
        const uy = sp[b + j * 2 + 1] - sp[b + (j + 1) * 2 + 1];
        const l = Math.hypot(ux, uy) || 1;
        this.segX[j] = ux / l;
        this.segY[j] = uy / l;
      }

      const env = Math.min(1.6, this.env[i]);
      const ph = this.phase[i];
      const waveK = TAU / Math.max(0.1, k.waveLength);
      const ampHead = k.headSway * Lb * env;
      const ampTail = k.tailSwing * Lb * env;
      const seed = this.seed[i];
      const v = this.variant[i] as Variant;
      const base = v === Variant.Orange ? orange : v === Variant.Gold ? gold : v === Variant.Chagoi ? brown : white;
      const patch =
        v === Variant.Orange ? this.patchOrange : v === Variant.Gold ? this.patchGold : v === Variant.Chagoi ? orange : red;
      const pscale = k.patchScale / Math.max(0.3, s);
      const pthr = 1 - k.patchAmount;
      const sz = Math.max(0.5, s);

      // ---- Eyes (drawn first so nothing covers them) ----
      const eyeR = k.eyeSize * Math.max(0.7, s);
      if (eyeR > 0) {
        const se = 0.13;
        this.spineAt(b, se);
        const hw = (W / 2) * bodyProfile(se);
        const wv = (ampHead + (ampTail - ampHead) * se * se) * Math.sin(ph - se * waveK);
        const nX = -this.sdy;
        const nY = this.sdx;
        for (let side = -1; side <= 1; side += 2) {
          const ex = this.sx + nX * (side * hw * 0.55 + wv);
          const ey = this.sy + nY * (side * hw * 0.55 + wv);
          const rr = Math.ceil(eyeR);
          for (let oy = -rr; oy <= rr; oy++)
            for (let ox = -rr; ox <= rr; ox++) {
              const cx = Math.floor(ex) + ox;
              const cy = Math.floor(ey) + oy;
              const ddx = cx + 0.5 - ex;
              const ddy = cy + 0.5 - ey;
              if ((ox === 0 && oy === 0) || ddx * ddx + ddy * ddy <= eyeR * eyeR) {
                if (this.claim(cx, cy)) r.push(cx, cy, eyeBg, eyeFg, EYE);
              }
            }
        }
      }

      // ---- Body ----
      const ds = 0.33 / Lb;
      for (let sN = 0; sN <= 1.0001; sN += ds) {
        this.spineAt(b, sN);
        const hw = (W / 2) * bodyProfile(sN);
        const wv = (ampHead + (ampTail - ampHead) * sN * sN) * Math.sin(ph - sN * waveK);
        const nX = -this.sdy;
        const nY = this.sdx;
        const steps = Math.max(1, Math.ceil((hw * 2) / 0.33));
        for (let q = 0; q <= steps; q++) {
          const lv = -hw + (2 * hw * q) / steps;
          const wx = this.sx + nX * (lv + wv);
          const wy = this.sy + nY * (lv + wv);
          const cx = Math.floor(wx);
          const cy = Math.floor(wy);
          if (!this.claim(cx, cy)) continue;
          // Pattern lives in body coordinates, so it bends with the fish
          const bu = sN * Lb;
          let col: RGB = base;
          if (noise2(bu * pscale + 11.3, lv * pscale + 5.7, seed) > pthr) col = patch;
          if (v === Variant.Showa && noise2(bu * pscale - 3.1, lv * pscale + 9.2, seed + 77) > 1 - k.patchAmount * 0.55)
            col = black;
          const qu = Math.floor(bu / sz);
          const qv = Math.floor(lv / sz);
          const jit = (hash2(qu, qv, seed) - 0.5) * 2 * k.shadeJitter;
          const ch = BODY_CHARS[Math.floor(hash2(qv, qu, seed + 1) * BODY_CHARS.length)];
          r.push(cx, cy, packShade(col, jit, 1), packShade(col, -0.5, glyphA), ch);
        }
      }

      // ---- Tail fin: forked fan of rays that flexes and lags behind the body ----
      {
        this.spineAt(b, 1);
        const nX = -this.sdy;
        const nY = this.sdx;
        const wv = ampTail * Math.sin(ph - waveK);
        // Slope of the body wave at the tail: the fin points along it
        const slope = (2 * (ampTail - ampHead) * Math.sin(ph - waveK) - ampTail * waveK * Math.cos(ph - waveK)) / Lb;
        const bx = this.sx + nX * wv;
        const by = this.sy + nY * wv;
        const backA = Math.atan2(-this.sdy + nY * slope, -this.sdx + nX * slope);
        const bend = Math.atan(slope) * k.tailFlex; // extra curl toward the tip
        const TL = k.tailLength * Lb;
        const fan = (k.tailFan * Math.PI) / 180;
        const rays = Math.max(3, Math.ceil((2 * fan * TL) / 0.45));
        for (let q = 0; q <= rays; q++) {
          const a = -fan + (2 * fan * q) / rays;
          const edge = Math.abs(a) / Math.max(1e-3, fan);
          const len = TL * (0.55 + 0.45 * Math.pow(edge, 0.8)); // forked: edges longer than the middle
          let px = bx;
          let py = by;
          for (let d = 0.35; d <= len; d += 0.35) {
            const ang = backA + a + bend * (d / TL);
            const ddx = Math.cos(ang);
            const ddy = Math.sin(ang);
            px += ddx * 0.35;
            py += ddy * 0.35;
            const cx = Math.floor(px);
            const cy = Math.floor(py);
            if (!this.claim(cx, cy)) continue;
            const fade = 1 - 0.45 * (d / TL);
            r.push(cx, cy, packRgb(fin, k.finTile * fade), packRgb(fin, k.fringeOpacity * fade), fringeChar(ang));
          }
        }
      }

      // ---- Pectoral fins (front) and pelvic fins (back) paddle slowly ----
      const finLen = k.finLength * s;
      if (finLen > 0.3) {
        const sweep0 = (k.finSweep * Math.PI) / 180;
        for (let pair = 0; pair < 2; pair++) {
          const sf = pair === 0 ? 0.27 : 0.58;
          const flen = pair === 0 ? finLen : finLen * 0.55;
          this.spineAt(b, sf);
          const hw = (W / 2) * bodyProfile(sf);
          const wv = (ampHead + (ampTail - ampHead) * sf * sf) * Math.sin(ph - sf * waveK);
          const nX = -this.sdy;
          const nY = this.sdx;
          const backX = -this.sdx;
          const backY = -this.sdy;
          for (let side = -1; side <= 1; side += 2) {
            // Fins spread wider while gliding, tuck in while beating hard
            const sw =
              (pair === 0 ? sweep0 : sweep0 * 0.7) +
              k.finPaddle * Math.sin(this.finPhase[i] + side * 0.7 + pair) +
              (1 - Math.min(1, env)) * 0.25;
            const rootX = this.sx + nX * (side * hw + wv);
            const rootY = this.sy + nY * (side * hw + wv);
            for (let ray = -1; ray <= 1; ray++) {
              const swr = sw + ray * 0.22;
              const fx = backX * Math.cos(swr) + nX * side * Math.sin(swr);
              const fy = backY * Math.cos(swr) + nY * side * Math.sin(swr);
              const rl = flen * (ray === 0 ? 1 : 0.8);
              const ang = Math.atan2(fy, fx);
              const ch = fringeChar(ang);
              for (let d = 0.35; d <= rl; d += 0.35) {
                const cx = Math.floor(rootX + fx * d);
                const cy = Math.floor(rootY + fy * d);
                if (!this.claim(cx, cy)) continue;
                const fade = 1 - 0.35 * (d / rl);
                r.push(cx, cy, packRgb(fin, k.finTile * fade), packRgb(fin, k.fringeOpacity * fade), ch);
              }
            }
          }
        }
      }
    }

    // Pellets float on top
    const f = world.params.food;
    const pc = rgb(f.color);
    for (let i = 0; i < this.pn; i++) {
      const k2 = this.page[i] / this.plife[i];
      const a = k2 < 0.7 ? 1 : 1 - (k2 - 0.7) / 0.3;
      r.push(Math.floor(this.px[i]), Math.floor(this.py[i]), packRgb(pc, a), packShade(pc, -0.55, a), PELLET);
    }
  }
}

/** Half-width of the body along its length (0 = nose, 1 = tail base), from 0 to 1. */
function bodyProfile(s: number): number {
  if (s < 0.3) {
    const t = (0.3 - s) / 0.3;
    return Math.sqrt(Math.max(0, 1 - t * t)) * 0.9 + 0.1;
  }
  const t = (s - 0.3) / 0.7;
  return 1 - 0.78 * Math.pow(t, 1.25);
}

/** Picks - \ | / to match the direction a fin ray points on screen. */
function fringeChar(angle: number) {
  const a = ((angle % Math.PI) + Math.PI) % Math.PI;
  return FRINGE[Math.round(a / (Math.PI / 4)) % 4];
}

function pickVariant(k: World['params']['koi']): Variant {
  const w = [k.mixKohaku, k.mixOrange, k.mixGold, k.mixChagoi, k.mixShowa];
  const total = w.reduce((a, b) => a + b, 0);
  if (total <= 0) return Variant.Kohaku;
  let r = Math.random() * total;
  for (let i = 0; i < w.length; i++) {
    r -= w[i];
    if (r <= 0) return i as Variant;
  }
  return Variant.Kohaku;
}
