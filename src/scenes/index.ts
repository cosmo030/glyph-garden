// The scene registry: every habitat the page can show, and the rules for picking one by the clock.
//
// To add a scene: import it here and add one entry to `scenes`. See docs/ARCHITECTURE.md.
import type { Values } from '../params/schema';
import type { Hour, Scene } from '../sim/world';
import { Pond } from './pond';

/** Every scene, in the order the name button cycles through them. */
export const scenes: Scene[] = [new Pond()];

/** Turns an Hour into a number of hours, reading "Day starts" or "Night starts" from the Page settings. */
function hourOf(h: Hour, page: Values['page']): number {
  return typeof h === 'number' ? h : page[h];
}

/** True when `hour` (0 up to 24, minutes as a fraction) is inside the scene's time-of-day window. */
export function isInWindow(scene: Scene, hour: number, page: Values['page']): boolean {
  const start = hourOf(scene.timeOfDay.start, page);
  const end = hourOf(scene.timeOfDay.end, page);
  if (start === end) return true; // no gap between start and end: shown all day
  // A window like 19 -> 6 runs through midnight, so it is "after the start OR before the end".
  return start < end ? hour >= start && hour < end : hour >= start || hour < end;
}

/**
 * The scene to show at `hour`: the first one whose window contains it. If none does (for example
 * a night with only a daytime scene registered), the first scene stays on rather than showing nothing.
 */
export function sceneForHour(list: readonly Scene[], hour: number, page: Values['page']): Scene {
  return list.find((s) => isInWindow(s, hour, page)) ?? list[0]!;
}

/** Finds a scene by its id, or undefined if there is none (for example a stale saved id). */
export function sceneById(list: readonly Scene[], id: string): Scene | undefined {
  return list.find((s) => s.id === id);
}
