// The clock and the greeting line at the top of the page.
//
// The greeting is a short, calm sentence chosen by the time of day. Each scene supplies its own
// lines for each band. The bands below are about wording only (when it feels like "evening");
// the hours that switch scenes are separate and live in the Page settings.
import type { Band } from '../sim/world';

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
 * The greeting for `date`, picked from the active scene's `linesByBand`. The line is fixed for a
 * whole band of a day (so it doesn't change under you at the minute), and a different line comes up
 * the next day. With a name it reads like "cosmo, the water is still."
 */
export function greetingFor(date: Date, name: string, linesByBand: Record<Band, readonly string[]>): string {
  const band = bandOf(date.getHours());
  const lines = linesByBand[band];
  if (lines.length === 0) return '';
  const line = lines[(dayOfYear(date) + BAND_ORDER.indexOf(band)) % lines.length]!;
  const who = name.trim();
  return who ? `${who}, ${line.charAt(0).toLowerCase()}${line.slice(1)}` : line;
}

/** The time as HH:MM on a 24-hour clock, for example "07:05". */
export function clockText(date: Date): string {
  return `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`;
}
