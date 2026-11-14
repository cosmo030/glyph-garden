// Colours are packed into one 32-bit number (bytes r, g, b, a in memory order)
// so a whole cell fits in a few bytes of the GPU buffer.

export type RGB = [number, number, number];

export function hexToRgb(hex: string): RGB {
  const n = parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

export function pack(r: number, g: number, b: number, a: number): number {
  return (
    ((Math.round(a * 255) & 255) << 24) |
    ((b & 255) << 16) |
    ((g & 255) << 8) |
    (r & 255)
  ) >>> 0;
}

export function packRgb(c: RGB, alpha: number): number {
  return pack(c[0], c[1], c[2], alpha < 0 ? 0 : alpha > 1 ? 1 : alpha);
}

/** Mixes a colour toward black (amount < 0) or white (amount > 0). */
export function shade(c: RGB, amount: number): RGB {
  const t = amount < 0 ? 0 : 255;
  const k = Math.abs(amount);
  return [c[0] + (t - c[0]) * k, c[1] + (t - c[1]) * k, c[2] + (t - c[2]) * k] as RGB;
}

/** Same as packRgb(shade(c, amount), alpha) but without allocating. */
export function packShade(c: RGB, amount: number, alpha: number): number {
  const t = amount < 0 ? 0 : 255;
  const k = Math.abs(amount);
  return packRgb3(c[0] + (t - c[0]) * k, c[1] + (t - c[1]) * k, c[2] + (t - c[2]) * k, alpha);
}

/** Writes shade(c, amount) into out and returns it. */
export function shadeInto(out: RGB, c: RGB, amount: number): RGB {
  const t = amount < 0 ? 0 : 255;
  const k = Math.abs(amount);
  out[0] = c[0] + (t - c[0]) * k;
  out[1] = c[1] + (t - c[1]) * k;
  out[2] = c[2] + (t - c[2]) * k;
  return out;
}

function packRgb3(r: number, g: number, b: number, alpha: number): number {
  return pack(r, g, b, alpha < 0 ? 0 : alpha > 1 ? 1 : alpha);
}
