// The clock and the greeting line at the top of the page.
//
// The greeting is a short, calm sentence chosen by the time of day. The bands below are
// about wording only (when it feels like "evening"); the hours that switch scenes are
// separate and live in the Page settings.

/** Which part of the day it is, for choosing the wording. */
export type Band = 'morning' | 'afternoon' | 'evening' | 'night';

// Three lines per band. The first letter may be lowercased when a name is put in front,
// so no line starts with a proper noun.
const LINES: Record<Band, readonly string[]> = {
  morning: ['The water is still.', 'A slow start is a fine start.', 'Soft light on the pond.'],
  afternoon: ['Warm water, slow fish.', 'Take a breath. Then go on.', 'The pond is wide awake.'],
  evening: ['The light is turning gold.', 'Easy now. The day is done.', 'Quiet is on its way.'],
  night: ['The pond is resting.', 'Dark water, soft ripples.', 'It is late and calm.'],
};

const BAND_ORDER: readonly Band[] = ['morning', 'afternoon', 'evening', 'night'];

/** The wording band for an hour (0-23): morning from 5, afternoon from 12, evening from 17, night from 22. */
export function bandOf(hour: number): Band {
  if (hour >= 5 && hour < 12) return 'morning';
  if (hour >= 12 && hour < 17) return 'afternoon';
  if (hour >= 17 && hour < 22) return 'evening';
  return 'night';
}

/** Whole days since the start of the year, used to rotate through the lines. */
function dayOfYear(d: Date): number {
  return Math.floor(
    (Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()) - Date.UTC(d.getFullYear(), 0, 0)) / 86_400_000,
  );
}

/**
 * The greeting for `date`. The line is fixed for a whole band of a day (so it doesn't change
 * under you at the minute), and a different line comes up the next day. With a name it reads
 * like "cosmo, the water is still."
 */
export function greetingFor(date: Date, name: string): string {
  const band = bandOf(date.getHours());
  const lines = LINES[band];
  const line = lines[(dayOfYear(date) + BAND_ORDER.indexOf(band)) % lines.length]!;
  const who = name.trim();
  return who ? `${who}, ${line.charAt(0).toLowerCase()}${line.slice(1)}` : line;
}

/** The time as HH:MM on a 24-hour clock, for example "07:05". */
export function clockText(date: Date): string {
  return `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`;
}
