// Open-Meteo request building and response normalization.
import type { Forecast, PressureLevel } from "./types.ts";
import { destination, riseSetAzimuth } from "./solar.ts";

export const OPEN_METEO_URL = "https://api.open-meteo.com/v1/forecast";
export const PRESSURE_LEVELS = [1000, 975, 950, 925, 900, 850, 800, 700, 600] as const;
export const HORIZON_DISTANCE_KM = 80;
const FORECAST_DAYS = 3;

const SURFACE_VARS = [
  "temperature_2m",
  "dew_point_2m",
  "relative_humidity_2m",
  "visibility",
  "wind_speed_10m",
  "cloud_cover_low",
  "cloud_cover_mid",
  "cloud_cover_high",
  "precipitation",
  "weather_code",
  "is_day",
];

const LEVEL_VARS = ["temperature", "relative_humidity", "cloud_cover", "geopotential_height"];

function levelVars(): string[] {
  return PRESSURE_LEVELS.flatMap((p) => LEVEL_VARS.map((v) => `${v}_${p}hPa`));
}

export function forecastUrl(lat: number, lon: number, base = OPEN_METEO_URL): string {
  const params = new URLSearchParams({
    latitude: lat.toFixed(4),
    longitude: lon.toFixed(4),
    hourly: [...SURFACE_VARS, ...levelVars()].join(","),
    daily: "sunrise,sunset",
    timezone: "auto",
    timeformat: "unixtime",
    wind_speed_unit: "ms",
    forecast_days: String(FORECAST_DAYS),
  });
  return `${base}?${params}`;
}

/** One request for two points: towards the sunrise (index 0) and sunset (index 1) azimuths. */
export function horizonUrl(
  lat: number,
  lon: number,
  date = new Date(),
  base = OPEN_METEO_URL,
): string {
  const az = riseSetAzimuth(lat, date);
  const east = destination(lat, lon, az.sunrise, HORIZON_DISTANCE_KM);
  const west = destination(lat, lon, az.sunset, HORIZON_DISTANCE_KM);
  const params = new URLSearchParams({
    latitude: `${east.lat.toFixed(4)},${west.lat.toFixed(4)}`,
    longitude: `${east.lon.toFixed(4)},${west.lon.toFixed(4)}`,
    hourly: "cloud_cover_low",
    timezone: "auto",
    timeformat: "unixtime",
    forecast_days: String(FORECAST_DAYS),
  });
  return `${base}?${params}`;
}

// deno-lint-ignore no-explicit-any
type Raw = any;

const ms = (secs: number[]) => secs.map((s) => s * 1000);
const nums = (arr: (number | null)[] | undefined, len: number, fallback = NaN): number[] =>
  arr ? arr.map((v) => v ?? fallback) : new Array(len).fill(fallback);

function alignHorizon(time: number[], raw: Raw | undefined): (number | null)[] {
  if (!raw?.hourly?.time) return time.map(() => null);
  const byTime = new Map<number, number | null>();
  raw.hourly.time.forEach((t: number, i: number) =>
    byTime.set(t * 1000, raw.hourly.cloud_cover_low[i])
  );
  return time.map((t) => byTime.get(t) ?? null);
}

export function normalizeForecast(
  main: Raw,
  horizon?: Raw[] | null,
  fetchedAt = Date.now(),
): Forecast {
  const h = main.hourly;
  const time = ms(h.time);
  const n = time.length;
  const levels: PressureLevel[] = PRESSURE_LEVELS.map((p) => ({
    hPa: p,
    temp: nums(h[`temperature_${p}hPa`], n),
    rh: nums(h[`relative_humidity_${p}hPa`], n),
    cloud: nums(h[`cloud_cover_${p}hPa`], n),
    height: nums(h[`geopotential_height_${p}hPa`], n),
  }));
  return {
    lat: main.latitude,
    lon: main.longitude,
    elevation: main.elevation ?? 0,
    timezone: main.timezone ?? "UTC",
    utcOffsetSeconds: main.utc_offset_seconds ?? 0,
    fetchedAt,
    hourly: {
      time,
      temp: nums(h.temperature_2m, n),
      dewPoint: nums(h.dew_point_2m, n),
      rh: nums(h.relative_humidity_2m, n),
      visibility: nums(h.visibility, n),
      wind: nums(h.wind_speed_10m, n),
      cloudLow: nums(h.cloud_cover_low, n, 0),
      cloudMid: nums(h.cloud_cover_mid, n, 0),
      cloudHigh: nums(h.cloud_cover_high, n, 0),
      precip: nums(h.precipitation, n, 0),
      weatherCode: nums(h.weather_code, n, 0),
      isDay: nums(h.is_day, n, 0),
      levels,
      horizonLowEast: alignHorizon(time, horizon?.[0]),
      horizonLowWest: alignHorizon(time, horizon?.[1]),
    },
    daily: {
      sunrise: ms(main.daily?.sunrise ?? []),
      sunset: ms(main.daily?.sunset ?? []),
    },
  };
}
