// Colorful sunrise / sunset: a mid/high cloud "canvas", lit through a clear horizon.
import type { Forecast, HourScore } from "../types.ts";
import { HOUR, invRamp, nearest, ramp } from "./util.ts";

/** Combined mid+high coverage in %, assuming independent layers. */
function canvasCover(mid: number, high: number): number {
  return 100 * (1 - (1 - mid / 100) * (1 - high / 100));
}

/** Peaks between 30 and 70 %; full overcast still scores a little (under-lit decks). */
function canvasScore(c: number): number {
  if (c < 30) return ramp(c, 8, 30);
  if (c <= 70) return 1;
  return 1 - 0.7 * ramp(c, 70, 100);
}

export function scoreGlow(f: Forecast, kind: "sunrise" | "sunset"): HourScore[] {
  const h = f.hourly;
  const events = kind === "sunrise" ? f.daily.sunrise : f.daily.sunset;
  const horizon = kind === "sunrise" ? h.horizonLowEast : h.horizonLowWest;

  return h.time.map((time, i) => {
    const ev = nearest(events, time);
    // Only the hours whose centre lies within ±60 min of the event.
    if (ev === undefined || Math.abs(time + HOUR / 2 - ev) > HOUR) {
      return { time, score: 0, reasons: [] };
    }
    const canvas = canvasCover(h.cloudMid[i], h.cloudHigh[i]);
    const low = h.cloudLow[i];
    const hz = horizon[i];

    let s = canvasScore(canvas);
    s *= 0.5 + 0.5 * invRamp(low, 20, 80);
    if (hz !== null) s *= 0.4 + 0.6 * invRamp(hz, 20, 70);
    if (h.precip[i] > 0.2) s *= 0.6;

    const reasons = [`mid/high clouds ${Math.round(canvas)}%`, `low clouds ${Math.round(low)}%`];
    if (hz !== null) {
      reasons.push(
        `${kind === "sunrise" ? "eastern" : "western"} horizon low clouds ${Math.round(hz)}%`,
      );
    }
    return { time, score: Math.round(s * 100), reasons };
  });
}
