import type { GlyphRenderer } from '../render/renderer';
import { packRgb, packShade, shadeInto, type RGB } from '../render/color';
import { glyph } from '../render/atlas';
import { hash2, noise2, gauss, rand } from '../sim/noise';
import { rgb } from '../sim/colors';
import type { Species, World } from '../sim/world';

// Koi: a school of fish drawn as tiles of characters.
// Clicking drops food pellets; nearby fish startle, then swim over and eat.
//
// The fish shape is not a fixed sprite. For every grid cell near a fish we ask
// "which part of the fish is here?" in the fish's own rotated, tail-bent
// coordinates. That gives smooth turning and swimming at any size and angle,
// and every proportion (length, width, tail, fins) is a live slider.

const CAP = 160; // max fish
const PCAP = 128; // max pellets

const BODY_CHARS = '#%&@8$=+*0'.split('').map(glyph);
const FRINGE = ['-', '\\', '|', '/'].map(glyph);
const EYE = glyph('•');
const PELLET = glyph('°');

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
  private x = new Float32Array(CAP);
  private y = new Float32Array(CAP);
  private heading = new Float32Array(CAP);
  private speed = new Float32Array(CAP);
  private kx = new Float32Array(CAP); // startle velocity, decays over time
  private ky = new Float32Array(CAP);
  private wanderA = new Float32Array(CAP);
  private phase = new Float32Array(CAP);
  private size = new Float32Array(CAP);
  private grow = new Float32Array(CAP);
  private pace = new Float32Array(CAP); // personal speed preference
  private variant = new Uint8Array(CAP);
  private seed = new Uint32Array(CAP);

  // Pellets
  private pn = 0;
  private px = new Float32Array(PCAP);
  private py = new Float32Array(PCAP);
  private pvx = new Float32Array(PCAP);
  private pvy = new Float32Array(PCAP);
  private page = new Float32Array(PCAP);
  private plife = new Float32Array(PCAP);

  // Scratch colours reused every frame
  private patchOrange: RGB = [0, 0, 0];
  private patchGold: RGB = [0, 0, 0];

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
    for (let i = 0; i < this.pn; i++) {
      this.px[i] *= sx;
      this.py[i] *= sy;
    }
  }

  private margin(world: World) {
    const k = world.params.koi;
    return (k.length * Math.max(k.sizeMin, k.sizeMax) * world.params.food.maxGrowth) / 2 + 4;
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
    this.x[i] = rand(-m, world.cols + m);
    this.y[i] = rand(-m, world.rows + m);
    this.heading[i] = (world.params.world.currentAngle * Math.PI) / 180 + gauss() * 0.8;
    this.speed[i] = k.cruiseSpeed;
    this.kx[i] = this.ky[i] = 0;
    this.wanderA[i] = gauss() * 0.5;
    this.phase[i] = Math.random() * Math.PI * 2;
    const lo = Math.min(k.sizeMin, k.sizeMax);
    const hi = Math.max(k.sizeMin, k.sizeMax);
    this.size[i] = lo + (hi - lo) * Math.pow(Math.random(), 1.4);
    this.grow[i] = 1;
    this.pace[i] = rand(0.8, 1.2);
    this.seed[i] = (Math.random() * 1e9) | 0;
    this.variant[i] = pickVariant(k);
  }

  pointerDown(x: number, y: number, world: World) {
    const f = world.params.food;
    // Drop pellets
    for (let j = 0; j < f.perClick; j++) {
      if (this.pn >= PCAP) this.removePellet(0);
      const i = this.pn++;
      this.px[i] = x + gauss() * f.spread * 0.6;
      this.py[i] = y + gauss() * f.spread * 0.6;
      const a = Math.random() * Math.PI * 2;
      const s = Math.random() * f.drift;
      this.pvx[i] = Math.cos(a) * s;
      this.pvy[i] = Math.sin(a) * s;
      this.page[i] = 0;
      this.plife[i] = f.life * rand(0.8, 1.2);
    }
    world.effects.ripple(x, y, world.params.ripple.life, 1);
    // The splash startles nearby fish
    const R = f.startleRadius;
    if (R > 0 && f.startle > 0) {
      for (let i = 0; i < this.n; i++) {
        const dx = this.x[i] - x;
        const dy = this.y[i] - y;
        const d = Math.hypot(dx, dy);
        if (d < R && d > 1e-3) {
          const s = (f.startle * (1 - d / R)) / d;
          this.kx[i] += dx * s;
          this.ky[i] += dy * s;
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
      const c = this.cellOf(this.x[i], this.y[i]);
      this.gridNext[i] = this.gridHead[c];
      this.gridHead[c] = i;
    }
  }

  private cellOf(x: number, y: number) {
    const cx = Math.min(this.gw - 1, Math.max(0, Math.floor((x - this.gx0) / this.gcell)));
    const cy = Math.min(this.gh - 1, Math.max(0, Math.floor((y - this.gy0) / this.gcell)));
    return cy * this.gw + cx;
  }

  step(dt: number, world: World) {
    this.syncCount(world);
    const k = world.params.koi;
    const f = world.params.food;
    const w = world.params.world;

    // Pellets drift, slow down, and dissolve
    for (let i = 0; i < this.pn; ) {
      this.page[i] += dt;
      if (this.page[i] >= this.plife[i]) {
        this.removePellet(i);
        continue;
      }
      const damp = Math.exp(-1.2 * dt);
      this.pvx[i] *= damp;
      this.pvy[i] *= damp;
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

    for (let i = 0; i < this.n; i++) {
      const xi = this.x[i];
      const yi = this.y[i];
      const h = this.heading[i];
      const s = this.size[i] * this.grow[i];

      // Forward momentum + gentle wandering + water current
      this.wanderA[i] = this.wanderA[i] * Math.exp(-0.3 * dt) + gauss() * k.wanderRate * Math.sqrt(dt);
      let dx = Math.cos(h) + Math.cos(h + this.wanderA[i]) * k.wander + curX;
      let dy = Math.sin(h) + Math.sin(h + this.wanderA[i]) * k.wander + curY;

      // Schooling: separation, alignment, cohesion with nearby fish
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

      // Food: head for the nearest pellet we can smell
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
        // Mouth is at the front of the fish
        const mouthX = xi + Math.cos(h) * k.length * s * 0.45;
        const mouthY = yi + Math.sin(h) * k.length * s * 0.45;
        if (landed && Math.hypot(this.px[best] - mouthX, this.py[best] - mouthY) < f.eatRadius * Math.max(1, s)) {
          world.effects.ripple(this.px[best], this.py[best], world.params.ripple.life * 0.6, 0.35);
          this.removePellet(best);
          this.grow[i] = Math.min(f.maxGrowth, this.grow[i] + f.growth);
        } else {
          hungry = true;
          dx += ((this.px[best] - xi) / d) * f.hunger;
          dy += ((this.py[best] - yi) / d) * f.hunger;
        }
      }

      // Cursor gently pushes fish away
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

      // A startled fish also turns away from the splash
      dx += this.kx[i] * 0.3;
      dy += this.ky[i] * 0.3;

      // Turn toward the desired direction, limited by turn rate
      const want = Math.atan2(dy, dx);
      let diff = want - h;
      diff = Math.atan2(Math.sin(diff), Math.cos(diff));
      const maxTurn = k.turnRate * dt * (hungry ? 1.6 : 1);
      this.heading[i] = h + Math.max(-maxTurn, Math.min(maxTurn, diff));

      const target = hungry ? k.sprintSpeed : k.cruiseSpeed * this.pace[i];
      this.speed[i] += (target - this.speed[i]) * Math.min(1, k.acceleration * dt);

      this.kx[i] *= kickDecay;
      this.ky[i] *= kickDecay;
      const nh = this.heading[i];
      let nx = xi + (Math.cos(nh) * this.speed[i] + this.kx[i]) * dt;
      let ny = yi + (Math.sin(nh) * this.speed[i] + this.ky[i]) * dt;

      // Wrap around the edges (with an off-screen margin so fish swim out and back in)
      if (nx < -m) nx += spanX;
      else if (nx >= world.cols + m) nx -= spanX;
      if (ny < -m) ny += spanY;
      else if (ny >= world.rows + m) ny -= spanY;
      this.x[i] = nx;
      this.y[i] = ny;

      const effort = 0.35 + (0.65 * (this.speed[i] + Math.hypot(this.kx[i], this.ky[i]))) / Math.max(0.5, k.cruiseSpeed);
      this.phase[i] += dt * k.wiggleFreq * Math.PI * 2 * Math.min(3, effort);
    }
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
    const fringeA = k.fringeOpacity;
    const eyeFg = packRgb(black, 0.9);
    const eyeBg = packRgb(eye, 1);
    shadeInto(this.patchOrange, orange, 0.28);
    shadeInto(this.patchGold, gold, 0.35);

    for (let i = 0; i < this.n; i++) {
      const s = this.size[i] * this.grow[i];
      const L = k.length * s;
      const W = k.width * s;
      const half = L / 2;
      const tailF = k.tailLength;
      const finLen = k.finLength * s;
      const eyeR = k.eyeSize * Math.max(0.7, s);
      const h = this.heading[i];
      const c = Math.cos(h);
      const sn = Math.sin(h);
      const xi = this.x[i];
      const yi = this.y[i];
      const ph = this.phase[i];
      const wig = k.wiggleAmp * s;
      const seed = this.seed[i];
      const v = this.variant[i] as Variant;
      const base = v === Variant.Orange ? orange : v === Variant.Gold ? gold : v === Variant.Chagoi ? brown : white;
      const patch =
        v === Variant.Orange ? this.patchOrange : v === Variant.Gold ? this.patchGold : v === Variant.Chagoi ? orange : red;
      const pscale = k.patchScale / Math.max(0.3, s);
      const pthr = 1 - k.patchAmount;

      const R = Math.hypot(half + 1, W * (0.5 + k.tailSpread * 0.5) + finLen) + 1;
      const x0 = Math.floor(xi - R);
      const x1 = Math.ceil(xi + R);
      const y0 = Math.floor(yi - R);
      const y1 = Math.ceil(yi + R);

      for (let gy = y0; gy <= y1; gy++) {
        for (let gx = x0; gx <= x1; gx++) {
          const ox = gx + 0.5 - xi;
          const oy = gy + 0.5 - yi;
          const u = ox * c + oy * sn; // along the fish (head is +)
          let lv = -ox * sn + oy * c; // across the fish
          const t = (u + half) / L; // 0 = tail tip, 1 = nose
          if (t < -0.02 || t > 1.02) continue;
          // Swimming: the body bends in a travelling wave, strongest at the tail
          lv -= wig * Math.sin(ph - t * 4.2) * Math.pow(Math.max(0, 1 - t), 1.6);
          const av = Math.abs(lv);

          if (t >= tailF) {
            const sN = (t - tailF) / (1 - tailF);
            const prof =
              sN < 0.62 ? 0.3 + 0.7 * smooth(sN / 0.62) : Math.sqrt(Math.max(0, 1 - ((sN - 0.62) / 0.38) ** 2));
            const hw = (W / 2) * prof;
            if (av <= hw + 0.2) {
              // Eye
              const du = (sN - 0.84) * (1 - tailF) * L;
              const dv = av - hw * 0.55;
              if (eyeR > 0 && du * du + dv * dv <= eyeR * eyeR) {
                r.push(gx, gy, eyeBg, eyeFg, EYE);
                continue;
              }
              // Body tile with pattern
              const nu = u * pscale;
              const nv = lv * pscale;
              let col: RGB = base;
              if (noise2(nu + 11.3, nv + 5.7, seed) > pthr) col = patch;
              if (v === Variant.Showa && noise2(nu - 3.1, nv + 9.2, seed + 77) > 1 - k.patchAmount * 0.55) col = black;
              const qu = Math.floor(u / Math.max(0.5, s));
              const qv = Math.floor(lv / Math.max(0.5, s));
              const jit = (hash2(qu, qv, seed) - 0.5) * 2 * k.shadeJitter;
              const ch = BODY_CHARS[Math.floor(hash2(qv, qu, seed + 1) * BODY_CHARS.length)];
              r.push(gx, gy, packShade(col, jit, 1), packShade(col, -0.5, glyphA), ch);
              continue;
            }
            // Pectoral fins (front) and pelvic fins (back)
            const out = av - hw;
            let finReach = 0;
            let rootU = 0;
            if (sN > 0.52 && sN < 0.74) {
              finReach = finLen * (1 - (sN - 0.52) / 0.22);
              rootU = (0.74 * (1 - tailF) + tailF) * L - half;
            } else if (sN > 0.22 && sN < 0.34) {
              finReach = finLen * 0.55 * (1 - (sN - 0.22) / 0.12);
              rootU = (0.34 * (1 - tailF) + tailF) * L - half;
            }
            if (finReach > 0 && out < finReach) {
              r.push(gx, gy, 0, packRgb(fin, fringeA), this.fringeChar(h, u - rootU, lv));
            }
          } else {
            // Tail fin: a forked fan of line characters
            const tt = t / tailF; // 0 = tip, 1 = where it meets the body
            const spread = (W / 2) * (0.3 * tt + k.tailSpread * Math.pow(1 - tt, 0.9));
            const notch = tt < 0.4 && av < spread * 0.45 * (1 - tt / 0.4);
            if (av <= spread && !notch) {
              const baseU = tailF * L - half;
              r.push(gx, gy, 0, packRgb(fin, fringeA * (0.55 + 0.45 * tt)), this.fringeChar(h, u - baseU, lv));
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
      // Small tan tile with a darker ring: reads as a floating pellet
      r.push(Math.floor(this.px[i]), Math.floor(this.py[i]), packRgb(pc, a), packShade(pc, -0.55, a), PELLET);
    }
  }

  /** Picks - \ | / to match the direction a fin or tail ray points on screen. */
  private fringeChar(heading: number, lu: number, lv: number) {
    let a = heading + Math.atan2(lv, lu);
    a = ((a % Math.PI) + Math.PI) % Math.PI;
    return FRINGE[Math.round(a / (Math.PI / 4)) % 4];
  }
}

function smooth(x: number) {
  const t = Math.min(1, Math.max(0, x));
  return t * t * (3 - 2 * t);
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
