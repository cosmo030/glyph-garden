// The shared World, the Scene interface every habitat implements, and the ripple effects
// that any scene can start (clicks, bites).
import type { Values } from '../params/schema';
import type { GlyphRenderer } from '../render/renderer';

/** Shared state every scene can read. Units are grid cells and seconds. */
export type World = {
  cols: number;
  rows: number;
  time: number;
  cursor: { x: number; y: number; active: boolean };
  params: Values;
  effects: Effects;
};

/**
 * An hour of the day: a number from 0 to 23, or the name of the Page setting that holds one
 * (so a scene can follow "Day starts" or "Night starts" instead of a fixed time).
 */
export type Hour = number | 'dayStarts' | 'nightStarts';

/**
 * When a scene is on show, from `start` up to (not including) `end`. A window whose end is
 * before its start wraps past midnight; equal start and end means all day.
 */
export type TimeOfDay = { start: Hour; end: Hour };

/**
 * One habitat: a scene with its own creatures and a window of the day when it is shown.
 * A scene owns its state, moves it in `step` and draws it in `draw`. Only the active scene runs.
 */
export interface Scene {
  /** Stable key, saved in settings when the scene is picked by hand. */
  readonly id: string;
  /** Name shown bottom-left, for example "Pond". */
  readonly name: string;
  /** Hint under the name, for example "click to feed". */
  readonly hint: string;
  /** When this scene is shown while Page > "Scene follows the clock" is on. */
  readonly timeOfDay: TimeOfDay;
  /** Called when the scene becomes active: (re)spawn its creatures. */
  enter(world: World): void;
  /** Called when the grid size changes, with the scale factor applied to positions. */
  rescale(sx: number, sy: number, world: World): void;
  /** Advances the simulation by `dt` seconds (always the fixed step). */
  step(dt: number, world: World): void;
  /** Pushes this frame's cells to the renderer. Must not allocate. */
  draw(r: GlyphRenderer, world: World): void;
  /** Click or tap at grid position (x, y), in cells. */
  pointerDown(x: number, y: number, world: World): void;
  /** The press that began on the canvas ended, at grid position (x, y). Lets a scene react to press-and-hold. */
  pointerUp(x: number, y: number, world: World): void;
  /** Number of creatures currently alive (shown in Tune > Performance). */
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
