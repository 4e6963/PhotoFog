// Small solar-geometry helpers (good to ~1°, plenty for picking a horizon sample point).

const RAD = Math.PI / 180;
const EARTH_RADIUS_KM = 6371;

function dayOfYear(date: Date): number {
  const start = Date.UTC(date.getUTCFullYear(), 0, 0);
  return Math.floor((date.getTime() - start) / 86_400_000);
}

/** Solar declination in degrees. */
export function declination(date: Date): number {
  return 23.44 * Math.sin(2 * Math.PI * (284 + dayOfYear(date)) / 365);
}

/** Azimuth (degrees from north, clockwise) of the sun at sunrise and sunset. */
export function riseSetAzimuth(lat: number, date: Date): { sunrise: number; sunset: number } {
  const cosAz = Math.sin(declination(date) * RAD) / Math.cos(lat * RAD);
  const az = Math.acos(Math.max(-1, Math.min(1, cosAz))) / RAD;
  return { sunrise: az, sunset: 360 - az };
}

/** Point reached travelling `distanceKm` from (lat, lon) along `bearing` degrees. */
export function destination(
  lat: number,
  lon: number,
  bearing: number,
  distanceKm: number,
): { lat: number; lon: number } {
  const d = distanceKm / EARTH_RADIUS_KM;
  const φ1 = lat * RAD;
  const λ1 = lon * RAD;
  const θ = bearing * RAD;
  const φ2 = Math.asin(Math.sin(φ1) * Math.cos(d) + Math.cos(φ1) * Math.sin(d) * Math.cos(θ));
  const λ2 = λ1 +
    Math.atan2(Math.sin(θ) * Math.sin(d) * Math.cos(φ1), Math.cos(d) - Math.sin(φ1) * Math.sin(φ2));
  return { lat: φ2 / RAD, lon: ((λ2 / RAD + 540) % 360) - 180 };
}
