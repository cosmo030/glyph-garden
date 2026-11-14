import type { Values } from '../params/schema';
import type { GlyphRenderer } from '../render/renderer';

/** Shared state every species can read. Units are grid cells and seconds. */
export type World = {
  cols: number;
  rows: number;
  time: number;
  cursor: { x: number; y: number; active: boolean };
  params: Values;
  effects: Effects;
};

/**
 * One kind of animal. Each species owns its creatures, moves them in `step`
 * and draws them in `draw`. Only the active species runs.
 */
export interface Species {
  readonly id: string;
  readonly label: string;
  readonly dot: string; // colour of the dot in the species switcher
  readonly hint: string; // bottom-left hint text
  /** Called when the species becomes active: (re)spawn its animals. */
  enter(world: World): void;
  /** Called when the grid size changes, with the scale factor applied to positions. */
  rescale(sx: number, sy: number, world: World): void;
  /** Advances the simulation by `dt` seconds (always the fixed step). */
  step(dt: number, world: World): void;
  /** Pushes this frame's cells to the renderer. Must not allocate. */
  draw(r: GlyphRenderer, world: World): void;
  /** Click or tap at grid position (x, y), in cells. */
  pointerDown(x: number, y: number, world: World): void;
  /** Number of animals currently alive (shown in Tweaks > Performance). */
  count(): number;
}

// Ripples: rings of dots expanding from a point (clicks, bites).
const MAX_RIPPLES = 96;

/** Pool of ripple effects, stored as parallel typed arrays. */
export class Effects {
  x = new Float32Array(MAX_RIPPLES);
  y = new Float32Array(MAX_RIPPLES);
  age = new Float32Array(MAX_RIPPLES);
  life = new Float32Array(MAX_RIPPLES);
  size = new Float32Array(MAX_RIPPLES); // speed multiplier
  n = 0;

  /** Starts a ripple at (x, y). `size` scales how fast it grows. Replaces the oldest when full. */
  ripple(x: number, y: number, life: number, size = 1) {
    let i = this.n;
    if (i >= MAX_RIPPLES) {
      // Replace the oldest ripple
      let oldest = 0;
      for (let k = 1; k < this.n; k++)
        if (this.age[k] / this.life[k] > this.age[oldest] / this.life[oldest]) oldest = k;
      i = oldest;
    } else this.n++;
    this.x[i] = x;
    this.y[i] = y;
    this.age[i] = 0;
    this.life[i] = life;
    this.size[i] = size;
  }

  /** Ages all ripples and removes finished ones (swap-remove, no allocation). */
  step(dt: number) {
    for (let i = 0; i < this.n;) {
      this.age[i] += dt;
      if (this.age[i] >= this.life[i]) {
        const last = --this.n;
        this.x[i] = this.x[last];
        this.y[i] = this.y[last];
        this.age[i] = this.age[last];
        this.life[i] = this.life[last];
        this.size[i] = this.size[last];
      } else i++;
    }
  }
}
