// Closed snow cover: enough snow on the ground to hide grass, ideally fresh and not thawing.
// Snow cover is a state, not an event: it is only scored in daylight (night = 0), so each day
// yields at most one window (see mergeSnowWindows).
import type { EventWindow, Forecast, HourScore } from "../types.ts";
import { invRamp, lightFactor, ramp, round } from "./util.ts";

/** Fresh snow is summed over this many preceding hours (incl. the current one). */
const FRESH_HOURS = 24;

export function scoreSnow(f: Forecast): HourScore[] {
  const h = f.hourly;
  // Forecasts cached before snow fields existed (service worker, server cache) lack them.
  const depth = h.snowDepth ?? [];
  const snowfall = h.snowfall ?? [];
  const depthAt = (k: number) => depth[Math.max(0, k)] ?? 0;

  return h.time.map((time, i) => {
    if (lightFactor(f, time) < 1) return { time, score: 0, reasons: [] };
    const depthCm = depthAt(i) * 100;
    // ~2 cm is patchy, from ~10 cm the ground is reliably closed.
    const depthS = ramp(depthCm, 2, 10);
    if (depthS === 0) return { time, score: 0, reasons: [] };

    // Model snowfall and snow depth do not always agree, so also count the depth increase.
    let fallen = 0;
    for (let k = Math.max(0, i - FRESH_HOURS + 1); k <= i; k++) fallen += snowfall[k] ?? 0;
    const grown = Math.max(0, depthCm - depthAt(i - FRESH_HOURS + 1) * 100);
    const fresh = Math.max(fallen, grown);
    const freshS = ramp(fresh, 0.5, 5);
    const temp = h.temp[i];

    let s = depthS * (0.7 + 0.3 * freshS); // fresh snow on trees & roofs looks best
    s *= 0.6 + 0.4 * invRamp(temp, 1, 6); // thaw: wet, grey, patchy
    const snowing = (snowfall[i] ?? 0) >= 0.1 || depthAt(i) - depthAt(i - 3) >= 0.01;
    const rain = h.precip[i] > 0.3 && !snowing;
    if (rain) s *= 0.6;

    const reasons = [`snow depth ${Math.round(depthCm)} cm`];
    if (fresh >= 0.5) reasons.push(`fresh snow ${round(fresh, 1)} cm/24 h`);
    if (Number.isFinite(temp) && temp > 1) reasons.push(`thaw ${round(temp, 1)} °C`);
    if (rain) reasons.push(`rain ${round(h.precip[i], 1)} mm`);

    return { time, score: Math.round(Math.min(1, s) * 100), reasons };
  });
}

/**
 * Joins snow windows that are only separated by a dip below the threshold during the same
 * day (all hours in between still score > 0), so a day shows one entry instead of several.
 */
export function mergeSnowWindows(windows: EventWindow[], hours: HourScore[]): EventWindow[] {
  const out: EventWindow[] = [];
  const idx = new Map(hours.map((h, i) => [h.time, i]));
  for (const w of windows) {
    const prev = out.at(-1);
    const from = prev && idx.get(prev.end);
    const to = idx.get(w.start);
    if (
      prev && from !== undefined && to !== undefined &&
      hours.slice(from, to).every((h) => h.score > 0)
    ) {
      prev.end = w.end;
      if (w.peak > prev.peak) {
        Object.assign(prev, { peak: w.peak, peakTime: w.peakTime, reasons: w.reasons });
      }
    } else {
      out.push(w);
    }
  }
  return out;
}
