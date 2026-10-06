import type { Forecast } from "../types.ts";

export const HOUR = 3_600_000;

/** 0 at x<=a, 1 at x>=b, linear in between. */
export function ramp(x: number, a: number, b: number): number {
  if (!Number.isFinite(x)) return 0;
  return Math.max(0, Math.min(1, (x - a) / (b - a)));
}

/** 1 at x<=a, 0 at x>=b. */
export function invRamp(x: number, a: number, b: number): number {
  return Number.isFinite(x) ? 1 - ramp(x, a, b) : 0;
}

export const round = (x: number, digits = 0) => {
  const f = 10 ** digits;
  return Math.round(x * f) / f;
};

/** Nearest sunrise/sunset to `t` (unix ms), or undefined. */
export function nearest(times: number[], t: number): number | undefined {
  let best: number | undefined;
  for (const s of times) if (best === undefined || Math.abs(s - t) < Math.abs(best - t)) best = s;
  return best;
}

/**
 * Light factor for an hour starting at `t`: 1 between civil dawn and dusk (~1 h margin),
 * 0.6 in the dark — night fog / inversions are less useful for photography.
 */
export function lightFactor(f: Forecast, t: number): number {
  const mid = t + HOUR / 2;
  for (let d = 0; d < f.daily.sunrise.length; d++) {
    if (mid >= f.daily.sunrise[d] - HOUR && mid <= f.daily.sunset[d] + HOUR) return 1;
  }
  return 0.6;
}

/** True if the hour starting at `t` is within the "morning" fog window (sunrise -2h .. +3h). */
export function nearSunrise(f: Forecast, t: number): boolean {
  const sr = nearest(f.daily.sunrise, t);
  return sr !== undefined && t + HOUR > sr - 2 * HOUR && t < sr + 3 * HOUR;
}
