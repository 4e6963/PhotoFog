import type { Forecast, HourScore } from "../types.ts";
import { invRamp, lightFactor, nearSunrise, ramp, round } from "./util.ts";

const FOG_CODES = new Set([45, 48]);

export function scoreFog(f: Forecast): HourScore[] {
  const h = f.hourly;
  return h.time.map((time, i) => {
    const spread = h.temp[i] - h.dewPoint[i];
    const vis = h.visibility[i];
    const wind = h.wind[i];

    const visS = invRamp(vis, 300, 4000);
    const spreadS = invRamp(spread, 0.5, 3);
    const rhS = ramp(h.rh[i], 85, 100);
    const windS = invRamp(wind, 1.5, 6);
    const coded = FOG_CODES.has(h.weatherCode[i]);

    let s = 0.45 * visS + 0.25 * spreadS + 0.15 * rhS + 0.15 * windS;
    if (coded) s = Math.max(s, 0.9);
    s *= 0.5 + 0.5 * windS; // wind mixes fog away
    if (h.precip[i] > 0.5) s *= 0.5; // rain, not fog
    s *= lightFactor(f, time);
    if (nearSunrise(f, time)) s *= 1.1;

    const reasons: string[] = [];
    if (coded) reasons.push("fog in model");
    if (Number.isFinite(vis) && vis < 5000) reasons.push(`visibility ${round(vis / 1000, 1)} km`);
    if (Number.isFinite(spread)) reasons.push(`spread ${round(spread, 1)} °C`);
    if (Number.isFinite(wind)) reasons.push(`wind ${round(wind, 1)} m/s`);
    if (h.precip[i] > 0.5) reasons.push(`rain ${round(h.precip[i], 1)} mm`);

    return { time, score: Math.round(Math.min(1, s) * 100), reasons };
  });
}
