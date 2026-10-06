import { assert, assertEquals } from "@std/assert";
import { normalizeForecast, PRESSURE_LEVELS } from "./forecast.ts";
import { evaluate } from "./scoring/index.ts";
import { destination, riseSetAzimuth } from "./solar.ts";

const main = JSON.parse(
  await Deno.readTextFile(new URL("./fixtures/main_47.5_9.5.json", import.meta.url)),
);
const horizon = JSON.parse(
  await Deno.readTextFile(new URL("./fixtures/horizon_47.5_9.5.json", import.meta.url)),
);

Deno.test("normalizeForecast maps a real Open-Meteo response", () => {
  const f = normalizeForecast(main, horizon);
  const n = f.hourly.time.length;
  assertEquals(n, 72);
  assertEquals(f.hourly.time[0], main.hourly.time[0] * 1000);
  assertEquals(f.hourly.levels.length, PRESSURE_LEVELS.length);
  for (
    const arr of [
      f.hourly.temp,
      f.hourly.visibility,
      f.hourly.horizonLowWest,
      f.hourly.levels[0].height,
    ]
  ) {
    assertEquals(arr.length, n);
  }
  assert(f.hourly.horizonLowEast.some((v) => v !== null), "horizon aligned by timestamp");
  assertEquals(f.daily.sunrise.length, 3);
  assert(f.elevation > 0);
});

Deno.test("evaluate runs on a real forecast without NaN scores", () => {
  const f = normalizeForecast(main, horizon);
  const e = evaluate(f, { minScore: 0 });
  for (const hours of Object.values(e.hourly)) {
    assert(hours.every((h) => Number.isFinite(h.score) && h.score >= 0 && h.score <= 100));
  }
});

Deno.test("normalizeForecast tolerates a missing horizon", () => {
  const f = normalizeForecast(main, null);
  assert(f.hourly.horizonLowWest.every((v) => v === null));
});

Deno.test("solar: sunrise is north-east in June, south-east in December (47.5°N)", () => {
  const june = riseSetAzimuth(47.5, new Date(Date.UTC(2026, 5, 21)));
  const dec = riseSetAzimuth(47.5, new Date(Date.UTC(2026, 11, 21)));
  assert(june.sunrise > 45 && june.sunrise < 60, `${june.sunrise}`);
  assert(dec.sunrise > 120 && dec.sunrise < 135, `${dec.sunrise}`);
  assertEquals(Math.round(june.sunset), Math.round(360 - june.sunrise));
});

Deno.test("solar: destination 80 km due east", () => {
  const p = destination(47.5, 9.5, 90, 80);
  assert(Math.abs(p.lat - 47.5) < 0.05);
  assert(Math.abs(p.lon - (9.5 + 80 / (111.32 * Math.cos(47.5 * Math.PI / 180)))) < 0.01);
});
