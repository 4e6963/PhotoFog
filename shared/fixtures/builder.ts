// Synthetic forecasts for scoring tests. Neutral, clear, breezy weather unless overridden.
import type { Forecast } from "../types.ts";
import { PRESSURE_LEVELS } from "../forecast.ts";

export const T0 = Date.UTC(2026, 0, 10); // midnight UTC
export const HOURS = 48;
const H = 3_600_000;

const STD_HEIGHT: Record<number, number> = {
  1000: 100,
  975: 320,
  950: 540,
  925: 760,
  900: 990,
  850: 1460,
  800: 1950,
  700: 3010,
  600: 4200,
};

export interface HourOverride {
  temp?: number;
  dewPoint?: number;
  rh?: number;
  visibility?: number;
  wind?: number;
  cloudLow?: number;
  cloudMid?: number;
  cloudHigh?: number;
  precip?: number;
  weatherCode?: number;
  horizonLowEast?: number | null;
  horizonLowWest?: number | null;
  /** Per pressure level overrides. */
  levels?: Record<number, { temp?: number; rh?: number; cloud?: number }>;
}

/** `at(hourIndex)` returns overrides for that hour (hour 0 = 00:00 UTC day 1). */
export function buildForecast(
  at: (hour: number) => HourOverride = () => ({}),
  elevation = 400,
): Forecast {
  const time = Array.from({ length: HOURS }, (_, i) => T0 + i * H);
  const o = time.map((_, i) => at(i));
  const pick = <K extends keyof HourOverride>(k: K, d: number) =>
    o.map((x) => (x[k] as number) ?? d);
  return {
    lat: 47.5,
    lon: 9.5,
    elevation,
    timezone: "UTC",
    utcOffsetSeconds: 0,
    fetchedAt: T0,
    hourly: {
      time,
      temp: pick("temp", 10),
      dewPoint: pick("dewPoint", 4),
      rh: pick("rh", 65),
      visibility: pick("visibility", 30000),
      wind: pick("wind", 5),
      cloudLow: pick("cloudLow", 0),
      cloudMid: pick("cloudMid", 0),
      cloudHigh: pick("cloudHigh", 0),
      precip: pick("precip", 0),
      weatherCode: pick("weatherCode", 0),
      isDay: time.map((t) => ((t / H) % 24 >= 7 && (t / H) % 24 < 17 ? 1 : 0)),
      levels: PRESSURE_LEVELS.map((p) => ({
        hPa: p,
        height: time.map(() => STD_HEIGHT[p]),
        temp: o.map((x) => x.levels?.[p]?.temp ?? 12 - 0.0065 * STD_HEIGHT[p]),
        rh: o.map((x) => x.levels?.[p]?.rh ?? 60),
        cloud: o.map((x) => x.levels?.[p]?.cloud ?? 0),
      })),
      horizonLowEast: o.map((x) => x.horizonLowEast === undefined ? 0 : x.horizonLowEast),
      horizonLowWest: o.map((x) => x.horizonLowWest === undefined ? 0 : x.horizonLowWest),
    },
    daily: {
      sunrise: [T0 + 7 * H + 20 * 60_000, T0 + 31 * H + 20 * 60_000], // 07:20
      sunset: [T0 + 16 * H + 50 * 60_000, T0 + 40 * H + 50 * 60_000], // 16:50
    },
  };
}
