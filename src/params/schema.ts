// Every tunable value in the app is declared exactly once, here.
// The Tune panel, saved settings, presets and defaults are all generated
// from this list. Add a line here and its slider appears automatically.

export type NumberParam = {
  kind: 'number';
  label: string;
  min: number;
  max: number;
  step: number;
  value: number;
};
export type ColorParam = { kind: 'color'; label: string; value: string };
/** A text value. `hidden` keeps it saved and in presets, but out of the Tune panel. */
export type TextParam = { kind: 'text'; label: string; value: string; hidden?: boolean };
export type BoolParam = { kind: 'bool'; label: string; value: boolean };
export type Param = NumberParam | ColorParam | TextParam | BoolParam;

export type Group = { label: string; expanded?: boolean; params: Record<string, Param> };

const num = (label: string, min: number, max: number, step: number, value: number): NumberParam => ({
  kind: 'number',
  label,
  min,
  max,
  step,
  value,
});
const color = (label: string, value: string): ColorParam => ({ kind: 'color', label, value });
const text = (label: string, value: string, hidden = false): TextParam => ({ kind: 'text', label, value, hidden });
const bool = (label: string, value: boolean): BoolParam => ({ kind: 'bool', label, value });

export const schema = {
  page: {
    label: 'Page',
    params: {
      name: text('Your name', ''),
      searchBlur: num('Search glass blur', 0, 10, 1, 2),
      searchOpacity: num('Search glass tint', 0, 1, 0.01, 0),
      showHint: bool('Show hint', false),
      // The id of the scene picked by hand. Not shown in Tune; the first scene is used while it is empty.
      scene: text('Scene', '', true),
    },
  },
  world: {
    label: 'World',
    expanded: true,
    params: {
      cellSize: num('Cell size (px)', 5, 28, 1, 9),
      tileFill: num('Tile size', 0.4, 1, 0.01, 0.77),
      tileRadius: num('Tile roundness', 0, 1, 0.01, 0.22),
      glyphScale: num('Glyph size', 0.2, 1.2, 0.01, 0.82),
      glyphOpacity: num('Glyph strength', 0, 1, 0.01, 0.6),
      background: color('Background', '#0b0c0e'),
      gridOpacity: num('Grid opacity', 0, 0.3, 0.005, 0.02),
      gridEvery: num('Grid every n cells', 1, 8, 1, 1),
      timeScale: num('Time scale', 0, 3, 0.01, 1),
      currentAngle: num('Current direction (deg)', -180, 180, 1, -40),
      currentStrength: num('Current strength', 0, 3, 0.01, 0.35),
      cursorRadius: num('Cursor radius (cells)', 0, 40, 0.5, 9),
      cursorPush: num('Cursor push', 0, 30, 0.1, 6),
      maxDpr: num('Max pixel ratio', 1, 3, 0.25, 2),
    },
  },
  koi: {
    label: 'Koi',
    expanded: true,
    params: {
      count: num('Count', 0, 150, 1, 77),
      sizeMin: num('Size min', 0.3, 2.5, 0.01, 0.7),
      sizeMax: num('Size max', 0.3, 2.5, 0.01, 1.33),
      // Body shape
      length: num('Body length', 6, 32, 0.5, 13),
      width: num('Body width', 1.5, 12, 0.1, 3.4),
      tailLength: num('Tail fin length', 0.05, 0.7, 0.01, 0.34),
      tailFan: num('Tail fin spread (deg)', 5, 80, 1, 30),
      tailFlex: num('Tail fin flex', 0, 3, 0.01, 0.65),
      finLength: num('Fin length', 0, 6, 0.05, 2),
      finSweep: num('Fin sweep (deg)', 10, 100, 1, 55),
      finPaddle: num('Fin paddle', 0, 1.2, 0.01, 0.4),
      finFreq: num('Fin paddle rate', 0, 4, 0.01, 0.9),
      eyeSize: num('Eye size', 0, 1.5, 0.01, 0.55),
      // Swimming
      tailSwing: num('Tail swing', 0, 0.45, 0.005, 0.15),
      headSway: num('Head sway', 0, 0.12, 0.002, 0.015),
      waveLength: num('Body wave length', 0.3, 3, 0.01, 1.05),
      beatRate: num('Tail beat rate (Hz)', 0, 6, 0.05, 1.5),
      beatPerSpeed: num('Beat rate per speed', 0, 0.5, 0.005, 0.12),
      strokeBeats: num('Beats per burst', 0.5, 10, 0.1, 2.5),
      glideTime: num('Glide time (s)', 0, 6, 0.05, 3),
      glideChance: num('Glide chance', 0, 1, 0.01, 0.7),
      glideDrag: num('Glide drag', 0, 4, 0.01, 0.55),
      surge: num('Stroke surge', 0, 0.6, 0.01, 0.15),
      spineStiffness: num('Spine stiffness', 0, 0.6, 0.005, 0.12),
      cruiseSpeed: num('Cruise speed', 0, 20, 0.1, 4.2),
      sprintSpeed: num('Sprint speed', 0, 40, 0.1, 11),
      acceleration: num('Acceleration', 0.1, 20, 0.1, 2.6),
      turnRate: num('Turn rate', 0.1, 10, 0.05, 1.9),
      turnRadius: num('Tightest turn (body lengths)', 0.05, 3, 0.01, 0.5),
      escapeTurn: num('Escape turn boost', 1, 6, 0.05, 3.2),
      wander: num('Wander', 0, 5, 0.01, 1.1),
      wanderRate: num('Wander change rate', 0, 5, 0.01, 0.8),
      // Schooling
      schoolRadius: num('School radius', 0, 30, 0.5, 10),
      separationDist: num('Personal space', 0, 15, 0.1, 6),
      separation: num('Separation', 0, 10, 0.05, 3.5),
      alignment: num('Alignment', 0, 5, 0.05, 0.7),
      cohesion: num('Cohesion', 0, 5, 0.05, 0.2),
      kickDamping: num('Splash push damping', 0.1, 10, 0.05, 2.2),
      // Look
      patchAmount: num('Pattern amount', 0, 1, 0.01, 0.45),
      patchScale: num('Pattern scale', 0.05, 1.2, 0.01, 0.38),
      fringeOpacity: num('Fin & tail line opacity', 0, 1, 0.01, 0.85),
      finTile: num('Fin & tail membrane', 0, 1, 0.01, 0.2),
      shadeJitter: num('Tile shade variation', 0, 0.4, 0.005, 0.09),
      mixKohaku: num('Mix: red & white', 0, 1, 0.01, 0.45),
      mixOrange: num('Mix: orange', 0, 1, 0.01, 0.2),
      mixGold: num('Mix: gold', 0, 1, 0.01, 0.12),
      mixChagoi: num('Mix: brown', 0, 1, 0.01, 0.1),
      mixShowa: num('Mix: black, red & white', 0, 1, 0.01, 0.13),
      colWhite: color('White', '#ebe7df'),
      colRed: color('Red', '#c81f2b'),
      colOrange: color('Orange', '#e06a26'),
      colGold: color('Gold', '#d9a623'),
      colBrown: color('Brown', '#8c4a22'),
      colBlack: color('Black', '#2b2b2e'),
      colFin: color('Fins', '#a3a8b0'),
      colEye: color('Eye', '#f4f4f4'),
    },
  },
  meadow: {
    label: 'Meadow',
    params: {
      // The landscape: a sky gradient, two ranges of hills and a field that runs to the horizon
      background: color('Sky colour (top)', '#040812'),
      colHorizon: color('Sky colour (horizon)', '#1b2d55'),
      skyCurve: num('Sky gradient curve', 0.3, 4, 0.05, 1.8),
      horizon: num('Horizon (share of height)', 0.4, 0.9, 0.01, 0.66),
      farHills: num('Far hills (cells)', 0, 20, 0.5, 4.5),
      nearHills: num('Near hills (cells)', 0, 15, 0.5, 2),
      colHillFar: color('Far hills colour', '#0e1a33'),
      colHillNear: color('Near hills colour', '#08101d'),
      colGroundFar: color('Field colour (far)', '#09131f'),
      colGroundNear: color('Field colour (near)', '#0a1812'),
      // Fireflies: each has a depth in the field; far ones are small and dim, near ones larger
      count: num('Fireflies', 0, 300, 1, 60),
      hoverHeight: num('Hover height (cells, nearest)', 0.5, 20, 0.5, 6),
      hover: num('Hover pull', 0, 3, 0.01, 0.6),
      drift: num('Drift speed (cells/s, nearest)', 0, 6, 0.05, 0.9),
      wander: num('Wander', 0, 3, 0.01, 1),
      colFirefly: color('Firefly colour', '#d6ea5a'),
      // Flashing. Each firefly has a flash cycle (phase 0 to 1); the flash is the first part of it.
      flashRate: num('Flash rate (Hz)', 0.1, 2, 0.01, 0.45),
      rateSpread: num('Rate spread', 0, 0.5, 0.01, 0.12),
      flashLength: num('Flash length (of cycle)', 0.05, 0.6, 0.01, 0.3),
      glowRadius: num('Glow radius (cells, nearest)', 0, 12, 0.1, 2.2),
      glowStrength: num('Glow strength', 0, 2, 0.01, 0.75),
      tileGlow: num('Glow tile strength', 0, 1, 0.01, 0.2),
      coreTile: num('Firefly tile strength', 0, 1, 0.01, 0.35),
      restGlow: num('Resting body', 0, 1, 0.01, 0.24),
      // Synchronising: when a firefly flashes, flashing neighbours' cycles jump ahead by up to `coupling`
      coupling: num('Coupling', 0, 0.4, 0.005, 0.05),
      syncRadius: num('Sync radius (cells)', 2, 60, 0.5, 12),
      // Touch: a tap makes the fireflies near it flash
      tapTime: num('Tap length (s)', 0.05, 1, 0.01, 0.25),
      tapRadius: num('Tap flash radius (cells)', 5, 100, 0.5, 30),
      // The field: rows of grass from the horizon to the bottom; near blades are tall and sway most
      grassHeight: num('Grass height (cells, nearest)', 0, 30, 0.5, 9),
      grassDensity: num('Grass cover (near)', 0, 1, 0.01, 0.5),
      farGrass: num('Grass cover (far)', 0, 1, 0.01, 0.5),
      haze: num('Distance haze', 0, 1, 0.01, 0.8),
      grassTile: num('Grass tile strength', 0, 0.6, 0.01, 0.1),
      grassSway: num('Grass sway', 0, 3, 0.01, 1),
      windSpeed: num('Wind speed', 0, 3, 0.01, 0.6),
      gusts: num('Gusts', 0, 1, 0.01, 0.6),
      colGrassDark: color('Grass colour (dark)', '#3fa863'),
      colGrass: color('Grass colour', '#6fdc8c'),
      colGrassTip: color('Grass tip colour', '#d2fba6'),
      // The night sky: stars and now and then a shooting star
      starDensity: num('Stars (per 1000 sky cells)', 0, 120, 0.5, 48),
      twinkle: num('Twinkle', 0, 1, 0.01, 0.35),
      colStar: color('Star colour', '#b9c6e8'),
      shootEvery: num('Shooting star every (s)', 2, 120, 0.5, 9),
      shootSpeed: num('Shooting star speed (cells/s)', 10, 150, 1, 62),
      shootLength: num('Shooting star trail (cells)', 2, 30, 0.5, 12),
      colShoot: color('Shooting star colour', '#eef3ff'),
    },
  },
  food: {
    label: 'Koi food',
    params: {
      perClick: num('Pellets per click', 1, 30, 1, 10),
      spread: num('Spread (cells)', 0, 12, 0.1, 2.6),
      life: num('Pellet life (s)', 1, 60, 0.5, 10),
      drift: num('Drift', 0, 3, 0.01, 0.35),
      senseRadius: num('Smell radius (cells)', 0, 120, 1, 38),
      hunger: num('Hunger pull', 0, 15, 0.1, 5),
      eatRadius: num('Bite radius', 0.2, 5, 0.05, 1.3),
      landDelay: num('Splash-down delay (s)', 0, 3, 0.05, 0.5),
      startle: num('Splash startle', 0, 40, 0.5, 9),
      startleRadius: num('Splash radius', 0, 30, 0.5, 7),
      growth: num('Growth per pellet', 0, 0.3, 0.005, 0.03),
      maxGrowth: num('Max growth', 1, 2.5, 0.01, 1.35),
      color: color('Pellet colour', '#d8b47a'),
    },
  },
  ripple: {
    label: 'Ripples',
    params: {
      speed: num('Speed (cells/s)', 1, 80, 0.5, 16),
      life: num('Life (s)', 0.1, 4, 0.05, 0.9),
      spacing: num('Dot spacing', 0.8, 8, 0.1, 1.8),
      opacity: num('Opacity', 0, 1, 0.01, 1),
      color: color('Colour', '#a7adb6'),
    },
  },
} satisfies Record<string, Group>;

export type Schema = typeof schema;
type ValueOf<P> = P extends { value: infer V } ? V : never;
export type Values = {
  [G in keyof Schema]: { [K in keyof Schema[G]['params']]: ValueOf<Schema[G]['params'][K]> };
};

/** A fresh copy of every parameter at its default value. */
export function defaultValues(): Values {
  const out: Record<string, Record<string, unknown>> = {};
  for (const [g, group] of Object.entries(schema)) {
    out[g] = {};
    for (const [k, p] of Object.entries(group.params as Record<string, Param>)) out[g][k] = p.value;
  }
  return out as Values;
}

/** Copies saved values onto the defaults, ignoring unknown keys and clamping numbers. */
export function mergeValues(target: Values, saved: unknown): void {
  if (!saved || typeof saved !== 'object') return;
  for (const [g, group] of Object.entries(schema)) {
    const src = (saved as Record<string, Record<string, unknown>>)[g];
    if (!src || typeof src !== 'object') continue;
    const dst = (target as unknown as Record<string, Record<string, unknown>>)[g];
    for (const [k, p] of Object.entries(group.params as Record<string, Param>)) {
      const v = src[k];
      if (p.kind === 'number' && typeof v === 'number' && Number.isFinite(v)) {
        dst[k] = Math.min(p.max, Math.max(p.min, v));
      } else if (p.kind === 'color' && typeof v === 'string' && /^#[0-9a-f]{6}$/i.test(v)) {
        dst[k] = v;
      } else if (p.kind === 'text' && typeof v === 'string') {
        dst[k] = v.slice(0, 40);
      } else if (p.kind === 'bool' && typeof v === 'boolean') {
        dst[k] = v;
      }
    }
  }
}
