import type { GlyphRenderer } from '../render/renderer';
import { packRgb } from '../render/color';
import { glyph } from '../render/atlas';
import { rgb } from './colors';
import type { World } from './world';

const DOT = glyph('•');

/** Draws every ripple as a ring of dot characters that grows and fades. */
export function drawEffects(r: GlyphRenderer, world: World) {
  const e = world.effects;
  const p = world.params.ripple;
  const col = rgb(p.color);
  for (let i = 0; i < e.n; i++) {
    const k = e.age[i] / e.life[i];
    const radius = 0.6 + p.speed * e.size[i] * e.age[i];
    const alpha = p.opacity * Math.pow(1 - k, 1.5);
    if (alpha <= 0.01) continue;
    const fg = packRgb(col, alpha);
    const dots = Math.max(6, Math.floor((Math.PI * 2 * radius) / p.spacing));
    let lastX = 1e9;
    let lastY = 1e9;
    for (let d = 0; d < dots; d++) {
      const a = (d / dots) * Math.PI * 2;
      const cx = Math.floor(e.x[i] + Math.cos(a) * radius);
      const cy = Math.floor(e.y[i] + Math.sin(a) * radius);
      if (cx === lastX && cy === lastY) continue;
      lastX = cx;
      lastY = cy;
      r.push(cx, cy, 0, fg, DOT);
    }
  }
}
