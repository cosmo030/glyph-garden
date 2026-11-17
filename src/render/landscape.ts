// The landscape the renderer's background pass can paint instead of a flat colour: a sky gradient,
// two ranges of rolling hills and a field below the horizon. The hill shape is defined here once, for
// the scene code, and mirrored in the background shader in renderer.ts (keep the two in step).
import type { RGB } from './color';

/** What the background pass paints for a landscape. Distances are in grid cells. */
export type Landscape = {
  /** Sky colour at the top of the screen and at the horizon. */
  skyTop: RGB;
  skyHorizon: RGB;
  /** How the sky blends from top to horizon: above 1 keeps the dark top for longer. */
  skyCurve: number;
  /** The horizon line, in cells from the top. The field starts here. */
  horizon: number;
  /** Heights of the far and near hill ranges above the horizon, in cells. */
  farHills: number;
  nearHills: number;
  hillFar: RGB;
  hillNear: RGB;
  /** Field colour at the horizon and at the bottom of the screen. */
  groundFar: RGB;
  groundNear: RGB;
};

/** Phase seeds of the far and near hill ranges, so the two never line up. */
export const HILL_SEEDS = [1.3, 4.2] as const;

/**
 * Height of a hill range above the horizon at column x, in cells: two slow sine waves of different
 * lengths, so the line rolls gently and doesn't visibly repeat. Same formula as `hill()` in the shader.
 */
export function hillHeight(x: number, amp: number, seed: number): number {
  return amp * (0.55 + 0.3 * Math.sin(x * 0.045 + seed) + 0.15 * Math.sin(x * 0.13 + seed * 2.3));
}
