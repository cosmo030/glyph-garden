// The time of day the page shows: the clock, the greeting, and scenes that follow the time (the
// Meadow's sky and moon).
//
// Normally that is the real local time. For checking the time-of-day looks without waiting for them,
// `?at=2026-11-20T05:30` in the URL shifts it to that moment, and it keeps running from there.

const offset = (() => {
  const at = new URLSearchParams(location.search).get('at');
  if (!at) return 0;
  const t = Date.parse(at);
  return Number.isNaN(t) ? 0 : t - Date.now();
})();

/** The current time as the page shows it. Allocates a Date, so call it at most about once a second. */
export function now(): Date {
  return new Date(Date.now() + offset);
}

/** Minutes since local midnight (with fractions), the moment `now()` returns. */
export function minutesOfDay(d: Date): number {
  return d.getHours() * 60 + d.getMinutes() + d.getSeconds() / 60;
}
