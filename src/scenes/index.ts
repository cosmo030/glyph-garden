// The scene registry: every habitat the page can show, in the order the name button steps through them.
//
// To add a scene: import it here and add one entry to `scenes`. See docs/ARCHITECTURE.md.
import type { Scene } from '../sim/world';
import { Meadow } from './meadow';
import { Pond } from './pond';

/** Every scene, in the order the name button cycles through them. */
export const scenes: Scene[] = [new Pond(), new Meadow()];

/** Finds a scene by its id, or undefined if there is none (for example a stale saved id). */
export function sceneById(list: readonly Scene[], id: string): Scene | undefined {
  return list.find((s) => s.id === id);
}
