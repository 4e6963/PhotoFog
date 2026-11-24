// Closed snow cover: enough snow on the ground to hide grass, ideally fresh and not thawing.
import type { Forecast, HourScore } from "../types.ts";
import { invRamp, lightFactor, ramp, round } from "./util.ts";

/** Fresh snow is summed over this many preceding hours (incl. the current one). */
const FRESH_HOURS = 24;

export function scoreSnow(f: Forecast): HourScore[] {
  const h = f.hourly;
  return h.time.map((time, i) => {
    const depthCm = h.snowDepth[i] * 100;
    // ~2 cm is patchy, from ~10 cm the ground is reliably closed.
    const depthS = ramp(depthCm, 2, 10);
    if (depthS === 0) return { time, score: 0, reasons: [] };

    let fresh = 0;
    for (let k = Math.max(0, i - FRESH_HOURS + 1); k <= i; k++) fresh += h.snowfall[k];
    const freshS = ramp(fresh, 0.5, 5);
    const temp = h.temp[i];

    let s = depthS * (0.7 + 0.3 * freshS); // fresh snow on trees & roofs looks best
    s *= 0.6 + 0.4 * invRamp(temp, 1, 6); // thaw: wet, grey, patchy
    const rain = h.precip[i] > 0.3 && h.snowfall[i] < 0.1;
    if (rain) s *= 0.6;
    s *= lightFactor(f, time);

    const reasons = [`snow depth ${Math.round(depthCm)} cm`];
    if (fresh >= 0.5) reasons.push(`fresh snow ${round(fresh, 1)} cm/24 h`);
    if (Number.isFinite(temp) && temp > 1) reasons.push(`thaw ${round(temp, 1)} °C`);
    if (rain) reasons.push(`rain ${round(h.precip[i], 1)} mm`);

    return { time, score: Math.round(Math.min(1, s) * 100), reasons };
  });
}
