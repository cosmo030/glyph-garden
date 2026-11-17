// The Meadow's colours through the day, for when Sky follows the clock is on.
//
// A day is a list of keyframes: at a time of day, the sky at the top and at the horizon, the far and
// near hills, the field far and near, and how visible the stars are. Between two keyframes every
// colour blends smoothly (smoothstep, so there are no sudden turns). The keyframes are a design, like
// the greeting lines, so they live here as a table rather than as Tune sliders; with the clock off the
// Meadow uses its colour sliders instead.
//
// The shape of the night: dusk turns the horizon warm and the sky deep blue, it is darkest after
// midnight, and before dawn a faint warm line comes back along the horizon. During the day the sky
// stays a soft, muted blue with no stars, so the white page text stays readable.
import { hexToRgb, type RGB } from '../render/color';

/** The colours of one moment, written in place by `skyAt` (no allocation). */
export type SkyColors = {
  top: RGB;
  horizon: RGB;
  hillFar: RGB;
  hillNear: RGB;
  groundFar: RGB;
  groundNear: RGB;
  /** 0 to 1: how visible the stars (and shooting stars) are. */
  stars: number;
};

type Key = [
  time: string,
  top: string,
  horizon: string,
  hillFar: string,
  hillNear: string,
  groundFar: string,
  groundNear: string,
  stars: number,
];

// prettier-ignore
const KEYS: Key[] = [
  //  time     sky top    horizon    far hills  near hills field far  field near stars
  ['00:00', '#03060e', '#0f1a33', '#0a1326', '#060c17', '#070f19', '#08130f', 1],
  ['03:30', '#03060e', '#0f1a33', '#0a1326', '#060c17', '#070f19', '#08130f', 1],
  ['05:00', '#070d1d', '#2a2740', '#121a2e', '#0a1120', '#0a121b', '#0a150f', 0.85], // a faint warm line
  ['06:15', '#16234a', '#6a4a52', '#2a2c45', '#161b2c', '#121a22', '#10190f', 0.35], // dawn
  ['07:30', '#1e3463', '#6d6a7a', '#2f3a58', '#1d2639', '#16211f', '#13201a', 0.1],
  ['09:00', '#1d3a6e', '#5f7fa8', '#2e4566', '#1d2c40', '#1a2a28', '#16261c', 0],
  ['16:30', '#1d3a6e', '#5f7fa8', '#2e4566', '#1d2c40', '#1a2a28', '#16261c', 0],
  ['18:00', '#1b2a55', '#7a5260', '#2b2840', '#171a2c', '#141b22', '#111a12', 0.15], // sunset
  ['19:30', '#0d1634', '#3a3358', '#161a33', '#0c1222', '#0b141e', '#0b1610', 0.55], // dusk
  ['21:00', '#050a17', '#1b2d55', '#0e1a33', '#08101d', '#09131f', '#0a1812', 1], // night
];

// Parsed once at load: minutes since midnight, the six colours, the star visibility
const PARSED = KEYS.map(([time, ...rest]) => {
  const [h, m] = time.split(':').map(Number);
  const colours = rest.slice(0, 6).map((c) => hexToRgb(c as string));
  return { at: h! * 60 + m!, colours, stars: rest[6] as number };
});

/** Fresh SkyColors to write into (call once, then reuse). */
export function makeSkyColors(): SkyColors {
  return {
    top: [0, 0, 0],
    horizon: [0, 0, 0],
    hillFar: [0, 0, 0],
    hillNear: [0, 0, 0],
    groundFar: [0, 0, 0],
    groundNear: [0, 0, 0],
    stars: 1,
  };
}

/** Writes the colours for `minutes` since midnight into `out`, blending the two keyframes around it. */
export function skyAt(minutes: number, out: SkyColors): SkyColors {
  const day = 24 * 60;
  const t = ((minutes % day) + day) % day;
  // The keyframe at or before t; after the last one the night blends on into the first (midnight)
  let a = PARSED.length - 1;
  for (let i = 0; i < PARSED.length; i++) if (PARSED[i]!.at <= t) a = i;
  const b = (a + 1) % PARSED.length;
  const ka = PARSED[a]!;
  const kb = PARSED[b]!;
  const span = (kb.at - ka.at + day) % day || day;
  const u = ((t - ka.at + day) % day) / span;
  const s = u * u * (3 - 2 * u);
  const ca = ka.colours;
  const cb = kb.colours;
  mix(out.top, ca[0]!, cb[0]!, s);
  mix(out.horizon, ca[1]!, cb[1]!, s);
  mix(out.hillFar, ca[2]!, cb[2]!, s);
  mix(out.hillNear, ca[3]!, cb[3]!, s);
  mix(out.groundFar, ca[4]!, cb[4]!, s);
  mix(out.groundNear, ca[5]!, cb[5]!, s);
  out.stars = ka.stars + (kb.stars - ka.stars) * s;
  return out;
}

/** Writes the blend of a and b (s from 0 to 1) into out. */
function mix(out: RGB, a: RGB, b: RGB, s: number) {
  out[0] = a[0] + (b[0] - a[0]) * s;
  out[1] = a[1] + (b[1] - a[1]) * s;
  out[2] = a[2] + (b[2] - a[2]) * s;
}
