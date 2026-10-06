// Open-Meteo fetch with a small in-memory cache shared by API requests and the scheduler.
import type { Forecast } from "../shared/types.ts";
import { forecastUrl, horizonUrl, normalizeForecast, OPEN_METEO_URL } from "../shared/forecast.ts";

const BASE = Deno.env.get("OPEN_METEO_URL") ?? OPEN_METEO_URL;
const TTL_MS = 30 * 60_000;
const MAX_ENTRIES = 500;

const cache = new Map<string, { at: number; value: Promise<Forecast> }>();

/** ~1 km grid so nearby locations share one upstream request. */
export const cacheKey = (lat: number, lon: number) => `${lat.toFixed(2)},${lon.toFixed(2)}`;

async function fetchJson(url: string) {
  const res = await fetch(url, { signal: AbortSignal.timeout(15_000) });
  if (!res.ok) throw new Error(`Open-Meteo ${res.status}: ${(await res.text()).slice(0, 200)}`);
  return res.json();
}

async function load(lat: number, lon: number): Promise<Forecast> {
  const [main, horizon] = await Promise.all([
    fetchJson(forecastUrl(lat, lon, BASE)),
    // The horizon sample only improves glow scores, so it must not fail the whole forecast.
    fetchJson(horizonUrl(lat, lon, new Date(), BASE)).catch((e) => {
      console.warn("horizon fetch failed:", e.message);
      return null;
    }),
  ]);
  return normalizeForecast(main, Array.isArray(horizon) ? horizon : null);
}

export function getForecast(lat: number, lon: number): Promise<Forecast> {
  const key = cacheKey(lat, lon);
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < TTL_MS) return hit.value;

  const value = load(Number(lat.toFixed(2)), Number(lon.toFixed(2)));
  cache.set(key, { at: Date.now(), value });
  value.catch(() => cache.delete(key)); // don't cache failures

  if (cache.size > MAX_ENTRIES) {
    const oldest = [...cache.entries()].sort((a, b) => a[1].at - b[1].at)[0];
    cache.delete(oldest[0]);
  }
  return value;
}
