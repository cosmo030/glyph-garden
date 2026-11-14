import { buildAtlas, SLOT } from './atlas';
import type { RGB } from './color';

// WebGL2 renderer for a grid of character cells.
// Each cell is: grid position, tile colour, glyph colour, glyph index.
// All cells are uploaded once per frame and drawn with ONE instanced draw call.

const STRIDE = 20; // bytes per cell: x f32, y f32, bg u32, fg u32, glyph f32

const CELL_VS = `#version 300 es
layout(location=0) in vec2 a_corner;
layout(location=1) in vec2 a_cell;
layout(location=2) in vec4 a_bg;
layout(location=3) in vec4 a_fg;
layout(location=4) in float a_glyph;
uniform vec2 u_cellPx;
uniform vec2 u_viewPx;
uniform float u_atlasCols;
out vec2 v_local;
out vec4 v_bg;
out vec4 v_fg;
flat out vec2 v_slot;
void main() {
  vec2 px = (a_cell + a_corner) * u_cellPx;
  vec2 clip = px / u_viewPx * 2.0 - 1.0;
  gl_Position = vec4(clip.x, -clip.y, 0.0, 1.0);
  v_local = a_corner;
  v_bg = a_bg;
  v_fg = a_fg;
  v_slot = vec2(mod(a_glyph, u_atlasCols), floor(a_glyph / u_atlasCols));
}`;

const CELL_FS = `#version 300 es
precision highp float;
in vec2 v_local;
in vec4 v_bg;
in vec4 v_fg;
flat in vec2 v_slot;
uniform sampler2D u_atlas;
uniform vec2 u_atlasGrid;
uniform float u_fill;
uniform float u_radius;
uniform float u_glyphScale;
uniform float u_lod;
uniform float u_cellPxF;
out vec4 outColor;
void main() {
  vec2 p = v_local - 0.5;
  float h = u_fill * 0.5;
  float r = u_radius * h;
  vec2 q = abs(p) - vec2(h - r);
  float d = length(max(q, 0.0)) + min(max(q.x, q.y), 0.0) - r;
  float aa = 0.75 / u_cellPxF; // one pixel, in cell units (fwidth breaks on some GPUs)
  float tile = 1.0 - smoothstep(-aa, aa, d);
  // The mip level is the same for every cell, so pass it in instead of letting
  // the GPU estimate it per pixel (that estimate breaks along the quad diagonal).
  vec2 g = p / u_glyphScale + 0.5;
  vec2 inside = step(vec2(0.0), g) * step(g, vec2(1.0));
  float ga = textureLod(u_atlas, (v_slot + clamp(g, 0.0, 1.0)) / u_atlasGrid, u_lod).a * inside.x * inside.y;
  float bgA = v_bg.a * tile;
  float fgA = v_fg.a * ga;
  vec4 col = vec4(v_bg.rgb * bgA, bgA);
  col = col * (1.0 - fgA) + vec4(v_fg.rgb * fgA, fgA);
  outColor = col;
}`;

const BG_VS = `#version 300 es
const vec2 P[3] = vec2[3](vec2(-1.0, -1.0), vec2(3.0, -1.0), vec2(-1.0, 3.0));
void main() { gl_Position = vec4(P[gl_VertexID], 0.0, 1.0); }`;

const BG_FS = `#version 300 es
precision highp float;
uniform vec3 u_bg;
uniform float u_gridAlpha;
uniform float u_cellPx;
uniform float u_every;
uniform float u_viewH;
out vec4 outColor;
void main() {
  vec2 px = vec2(gl_FragCoord.x, u_viewH - gl_FragCoord.y);
  float period = u_cellPx * u_every;
  vec2 f = mod(px, period);
  float line = (f.x < 1.0 || f.y < 1.0) ? 1.0 : 0.0;
  outColor = vec4(mix(u_bg, vec3(1.0), line * u_gridAlpha), 1.0);
}`;

export type DrawStyle = {
  background: RGB;
  gridOpacity: number;
  gridEvery: number;
  tileFill: number;
  tileRadius: number;
  glyphScale: number;
};

export class GlyphRenderer {
  readonly gl: WebGL2RenderingContext;
  private cellProg: WebGLProgram;
  private bgProg: WebGLProgram;
  private vao: WebGLVertexArrayObject;
  private bgVao: WebGLVertexArrayObject;
  private instBuf: WebGLBuffer;
  private capacity = 0;
  private data!: ArrayBuffer;
  private f32!: Float32Array;
  private u32!: Uint32Array;
  private u8!: Uint8Array;
  private atlasGrid: [number, number];
  private u: Record<string, WebGLUniformLocation | null> = {};

  count = 0;
  cols = 1; // visible grid size in cells
  rows = 1;
  cellPx = 10; // cell size in device pixels
  width = 1;
  height = 1;

  constructor(private canvas: HTMLCanvasElement) {
    const gl = canvas.getContext('webgl2', { antialias: false, alpha: false, premultipliedAlpha: true });
    if (!gl) throw new Error('WebGL2 is not available');
    this.gl = gl;

    this.cellProg = program(gl, CELL_VS, CELL_FS);
    this.bgProg = program(gl, BG_VS, BG_FS);
    for (const n of ['u_cellPx', 'u_viewPx', 'u_atlasCols', 'u_atlas', 'u_atlasGrid', 'u_fill', 'u_radius', 'u_glyphScale', 'u_lod', 'u_cellPxF'])
      this.u[n] = gl.getUniformLocation(this.cellProg, n);
    for (const n of ['u_bg', 'u_gridAlpha', 'u_every', 'u_viewH'])
      this.u['bg_' + n] = gl.getUniformLocation(this.bgProg, n);
    this.u['bg_u_cellPx'] = gl.getUniformLocation(this.bgProg, 'u_cellPx');

    // Atlas texture
    const atlas = buildAtlas();
    this.atlasGrid = [atlas.cols, atlas.rows];
    const tex = gl.createTexture()!;
    gl.bindTexture(gl.TEXTURE_2D, tex);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, atlas.canvas);
    gl.generateMipmap(gl.TEXTURE_2D);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);

    // Quad corners + per-instance cell data
    this.vao = gl.createVertexArray()!;
    gl.bindVertexArray(this.vao);
    const quad = gl.createBuffer()!;
    gl.bindBuffer(gl.ARRAY_BUFFER, quad);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([0, 0, 1, 0, 0, 1, 1, 1]), gl.STATIC_DRAW);
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);

    this.instBuf = gl.createBuffer()!;
    gl.bindBuffer(gl.ARRAY_BUFFER, this.instBuf);
    gl.enableVertexAttribArray(1);
    gl.vertexAttribPointer(1, 2, gl.FLOAT, false, STRIDE, 0);
    gl.vertexAttribDivisor(1, 1);
    gl.enableVertexAttribArray(2);
    gl.vertexAttribPointer(2, 4, gl.UNSIGNED_BYTE, true, STRIDE, 8);
    gl.vertexAttribDivisor(2, 1);
    gl.enableVertexAttribArray(3);
    gl.vertexAttribPointer(3, 4, gl.UNSIGNED_BYTE, true, STRIDE, 12);
    gl.vertexAttribDivisor(3, 1);
    gl.enableVertexAttribArray(4);
    gl.vertexAttribPointer(4, 1, gl.FLOAT, false, STRIDE, 16);
    gl.vertexAttribDivisor(4, 1);
    gl.bindVertexArray(null);
    this.bgVao = gl.createVertexArray()!;

    this.grow(16384);
  }

  private grow(min: number) {
    let cap = Math.max(this.capacity, 1024);
    while (cap < min) cap *= 2;
    const old = this.data;
    this.data = new ArrayBuffer(cap * STRIDE);
    this.f32 = new Float32Array(this.data);
    this.u32 = new Uint32Array(this.data);
    this.u8 = new Uint8Array(this.data);
    if (old) this.u8.set(new Uint8Array(old));
    this.capacity = cap;
    const gl = this.gl;
    gl.bindBuffer(gl.ARRAY_BUFFER, this.instBuf);
    gl.bufferData(gl.ARRAY_BUFFER, this.data.byteLength, gl.DYNAMIC_DRAW);
  }

  /** Fits the canvas to its CSS size. Returns true if the grid size changed. */
  resize(cssW: number, cssH: number, dpr: number, cellCss: number): boolean {
    const w = Math.max(1, Math.round(cssW * dpr));
    const h = Math.max(1, Math.round(cssH * dpr));
    const cellPx = cellCss * dpr;
    const changed = w !== this.width || h !== this.height || cellPx !== this.cellPx;
    if (w !== this.canvas.width) this.canvas.width = w;
    if (h !== this.canvas.height) this.canvas.height = h;
    this.width = w;
    this.height = h;
    this.cellPx = cellPx;
    this.cols = w / cellPx;
    this.rows = h / cellPx;
    return changed;
  }

  begin() {
    this.count = 0;
  }

  /** Adds one cell. x, y are integer grid coordinates; bg/fg are packed colours. */
  push(x: number, y: number, bg: number, fg: number, glyph: number) {
    if (x < -1 || y < -1 || x > this.cols + 1 || y > this.rows + 1) return;
    if (this.count >= this.capacity) this.grow(this.count + 1);
    const i = this.count++ * 5;
    this.f32[i] = x;
    this.f32[i + 1] = y;
    this.u32[i + 2] = bg;
    this.u32[i + 3] = fg;
    this.f32[i + 4] = glyph;
  }

  draw(s: DrawStyle) {
    const gl = this.gl;
    gl.viewport(0, 0, this.width, this.height);

    // Background + grid lines
    gl.disable(gl.BLEND);
    gl.useProgram(this.bgProg);
    gl.bindVertexArray(this.bgVao);
    gl.uniform3f(this.u.bg_u_bg, s.background[0] / 255, s.background[1] / 255, s.background[2] / 255);
    gl.uniform1f(this.u.bg_u_gridAlpha, s.gridOpacity);
    gl.uniform1f(this.u.bg_u_cellPx, this.cellPx);
    gl.uniform1f(this.u.bg_u_every, s.gridEvery);
    gl.uniform1f(this.u.bg_u_viewH, this.height);
    gl.drawArrays(gl.TRIANGLES, 0, 3);

    if (this.count === 0) return;

    // All cells in one instanced draw call
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
    gl.useProgram(this.cellProg);
    gl.bindVertexArray(this.vao);
    gl.bindBuffer(gl.ARRAY_BUFFER, this.instBuf);
    gl.bufferSubData(gl.ARRAY_BUFFER, 0, this.u8, 0, this.count * STRIDE);
    gl.uniform2f(this.u.u_cellPx, this.cellPx, this.cellPx);
    gl.uniform2f(this.u.u_viewPx, this.width, this.height);
    gl.uniform1f(this.u.u_atlasCols, this.atlasGrid[0]);
    gl.uniform2f(this.u.u_atlasGrid, this.atlasGrid[0], this.atlasGrid[1]);
    gl.uniform1i(this.u.u_atlas, 0);
    gl.uniform1f(this.u.u_fill, s.tileFill);
    gl.uniform1f(this.u.u_radius, s.tileRadius);
    gl.uniform1f(this.u.u_glyphScale, s.glyphScale);
    gl.uniform1f(this.u.u_cellPxF, this.cellPx);
    gl.uniform1f(this.u.u_lod, Math.max(0, Math.log2(SLOT / Math.max(1, this.cellPx * s.glyphScale))));
    gl.drawArraysInstanced(gl.TRIANGLE_STRIP, 0, 4, this.count);
    gl.bindVertexArray(null);
  }
}

function program(gl: WebGL2RenderingContext, vs: string, fs: string): WebGLProgram {
  const p = gl.createProgram()!;
  for (const [type, src] of [
    [gl.VERTEX_SHADER, vs],
    [gl.FRAGMENT_SHADER, fs],
  ] as const) {
    const sh = gl.createShader(type)!;
    gl.shaderSource(sh, src);
    gl.compileShader(sh);
    if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(sh) ?? 'shader error');
    gl.attachShader(p, sh);
  }
  gl.linkProgram(p);
  if (!gl.getProgramParameter(p, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(p) ?? 'link error');
  return p;
}
