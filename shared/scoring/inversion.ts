// Sea of clouds: cloud/humid layer below the location, temperature inversion, clear air above.
import type { Forecast, HourScore } from "../types.ts";
import { invRamp, lightFactor, ramp, round } from "./util.ts";

/** Levels closer than this to the location count as "at" the location. */
const AT_BAND = 100;
/** How far above the location to look for clear air / the inversion top. */
const ABOVE_RANGE = 1500;

export function scoreInversion(f: Forecast, elevation: number): HourScore[] {
  const h = f.hourly;
  return h.time.map((time, i) => {
    const levels = h.levels
      .map((l) => ({ hPa: l.hPa, z: l.height[i], t: l.temp[i], rh: l.rh[i], cloud: l.cloud[i] }))
      .filter((l) => Number.isFinite(l.z) && Number.isFinite(l.t))
      .sort((a, b) => a.z - b.z);

    const below = levels.filter((l) => l.z < elevation - AT_BAND);
    const at = levels.filter((l) => Math.abs(l.z - elevation) <= AT_BAND);
    const above = levels.filter((l) => l.z > elevation + AT_BAND && l.z < elevation + ABOVE_RANGE);
    if (below.length === 0) {
      return { time, score: 0, reasons: ["no atmosphere levels below location"] };
    }

    // Cloud proxy per level: modelled cloud cover or saturation.
    const cloudiness = (l: { cloud: number; rh: number }) =>
      Math.max(Number.isFinite(l.cloud) ? l.cloud : 0, ramp(l.rh, 90, 100) * 100);
    const belowCloud = Math.max(...below.map(cloudiness));
    const aboveCloud = above.length
      ? above.reduce((sum, l) => sum + cloudiness(l), 0) / above.length
      : h.cloudMid[i];
    const atCloud = at.length ? Math.max(...at.map(cloudiness)) : 0;

    // Strongest temperature increase with height, from the valley up to just above the location.
    let inversion = 0;
    const column = levels.filter((l) => l.z < elevation + 800);
    for (let a = 0; a < column.length; a++) {
      for (let b = a + 1; b < column.length; b++) {
        inversion = Math.max(inversion, column[b].t - column[a].t);
      }
    }

    let s = ramp(belowCloud, 50, 90) * invRamp(aboveCloud, 20, 60) *
      (0.4 + 0.6 * ramp(inversion, 0, 3));
    s *= invRamp(h.cloudHigh[i], 60, 100) * 0.3 + 0.7; // high overcast flattens the light
    if (atCloud > 70) s *= 0.4; // you're standing in it
    s *= lightFactor(f, time);

    const reasons = [
      `clouds below ${Math.round(belowCloud)}%`,
      `clouds above ${Math.round(aboveCloud)}%`,
      `inversion +${round(inversion, 1)} °C`,
    ];
    if (atCloud > 70) reasons.push("location inside cloud layer");
    return { time, score: Math.round(Math.min(1, s) * 100), reasons };
  });
}
