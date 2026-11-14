// Draws every character we use once into a texture. The GPU then copies
// glyphs from it instead of rendering text each frame.

export const SLOT = 64; // pixels per glyph slot in the texture
export const COLS = 16;

const EXTRA = '°·•○◦';
export const CHARS: string[] = [' '];
for (let c = 33; c <= 126; c++) CHARS.push(String.fromCharCode(c));
for (const ch of EXTRA) CHARS.push(ch);

const index = new Map<string, number>(CHARS.map((c, i) => [c, i]));

/** Index of a character in the atlas (0 = blank). */
export function glyph(ch: string): number {
  return index.get(ch) ?? 0;
}

export function buildAtlas(): { canvas: HTMLCanvasElement; cols: number; rows: number } {
  const rows = Math.ceil(CHARS.length / COLS);
  const canvas = document.createElement('canvas');
  canvas.width = COLS * SLOT;
  canvas.height = rows * SLOT;
  const ctx = canvas.getContext('2d')!;
  ctx.fillStyle = '#fff';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.font = `600 ${Math.round(SLOT * 0.78)}px ui-monospace, "SF Mono", Menlo, Consolas, "Liberation Mono", monospace`;
  CHARS.forEach((ch, i) => {
    const x = (i % COLS) * SLOT + SLOT / 2;
    const y = Math.floor(i / COLS) * SLOT + SLOT / 2 + SLOT * 0.04;
    ctx.fillText(ch, x, y);
  });
  return { canvas, cols: COLS, rows };
}
