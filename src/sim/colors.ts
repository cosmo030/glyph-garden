import { hexToRgb, type RGB } from '../render/color';

const cache = new Map<string, RGB>();

/** Parses a #rrggbb colour once and reuses the result (no per-frame allocation). */
export function rgb(hex: string): RGB {
  let c = cache.get(hex);
  if (!c) {
    c = hexToRgb(hex);
    if (cache.size > 512) cache.clear();
    cache.set(hex, c);
  }
  return c;
}
