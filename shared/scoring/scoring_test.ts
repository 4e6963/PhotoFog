import { assert, assertEquals } from "@std/assert";
import { buildForecast } from "../fixtures/builder.ts";
import { scoreFog } from "./fog.ts";
import { scoreGlow } from "./glow.ts";
import { scoreInversion } from "./inversion.ts";
import { evaluate, toWindows } from "./index.ts";

const maxScore = (s: { score: number }[], from = 0, to = s.length) =>
  Math.max(...s.slice(from, to).map((x) => x.score));

// ---- Fog ----------------------------------------------------------------

const foggyMorning = buildForecast((i) =>
  i >= 4 && i <= 9
    ? { temp: 3, dewPoint: 2.7, rh: 99, visibility: 250, wind: 0.8, weatherCode: 45 }
    : {}
);

Deno.test("fog: foggy calm morning scores high around sunrise", () => {
  const s = scoreFog(foggyMorning);
  assert(maxScore(s, 6, 9) >= 85, `got ${maxScore(s, 6, 9)}`);
  assert(s[7].reasons.some((r) => r.includes("visibility")));
});

Deno.test("fog: dark hours are damped compared to dawn", () => {
  const s = scoreFog(foggyMorning);
  assert(s[4].score < s[7].score);
});

Deno.test("fog: windy dry day scores low", () => {
  const s = scoreFog(buildForecast(() => ({ wind: 8, rh: 60, dewPoint: 0, temp: 12 })));
  assert(maxScore(s) < 20, `got ${maxScore(s)}`);
});

Deno.test("fog: rain halves the score", () => {
  const wet = buildForecast(() => ({
    temp: 5,
    dewPoint: 4.8,
    rh: 99,
    visibility: 800,
    wind: 1,
    precip: 2,
  }));
  const dry = buildForecast(() => ({ temp: 5, dewPoint: 4.8, rh: 99, visibility: 800, wind: 1 }));
  assert(scoreFog(wet)[12].score < scoreFog(dry)[12].score * 0.6);
});

// ---- Glow ---------------------------------------------------------------

Deno.test("glow: broken high clouds + clear western horizon = great sunset", () => {
  const f = buildForecast(() => ({ cloudHigh: 50, cloudMid: 10, cloudLow: 5, horizonLowWest: 5 }));
  const s = scoreGlow(f, "sunset");
  assert(s[16].score >= 85, `got ${s[16].score}`);
  assertEquals(s[12].score, 0, "outside sunset window");
});

Deno.test("glow: blocked horizon kills the sunset", () => {
  const f = buildForecast(() => ({ cloudHigh: 50, horizonLowWest: 90 }));
  assert(scoreGlow(f, "sunset")[16].score <= 45);
});

Deno.test("glow: clear sky is not colorful", () => {
  assertEquals(maxScore(scoreGlow(buildForecast(), "sunrise")), 0);
});

Deno.test("glow: sunrise uses the eastern horizon", () => {
  const f = buildForecast(() => ({ cloudHigh: 50, horizonLowEast: 90, horizonLowWest: 0 }));
  assert(scoreGlow(f, "sunrise")[7].score < scoreGlow(f, "sunset")[16].score);
});

// ---- Inversion ----------------------------------------------------------

// Location at 1200 m; stratus between 100 and 760 m, warm dry air above 990 m.
const seaOfClouds = buildForecast(() => ({
  levels: {
    1000: { temp: 1, rh: 100, cloud: 100 },
    975: { temp: 0.5, rh: 100, cloud: 100 },
    950: { temp: 0, rh: 100, cloud: 95 },
    925: { temp: 0, rh: 98, cloud: 80 },
    900: { temp: 5, rh: 30, cloud: 0 },
    850: { temp: 6, rh: 25, cloud: 0 },
    800: { temp: 3, rh: 25, cloud: 0 },
  },
}), 1200);

Deno.test("inversion: classic sea of clouds from a summit scores high in daylight", () => {
  const s = scoreInversion(seaOfClouds, 1200);
  assert(s[10].score >= 80, `got ${s[10].score}`);
  assert(s[10].reasons.some((r) => r.startsWith("inversion +")));
});

Deno.test("inversion: valley-floor location cannot see it", () => {
  assertEquals(maxScore(scoreInversion(seaOfClouds, 50)), 0);
});

Deno.test("inversion: no low clouds -> low score", () => {
  assert(maxScore(scoreInversion(buildForecast(undefined, 1200), 1200)) < 10);
});

// ---- Windows & evaluate -------------------------------------------------

Deno.test("toWindows groups consecutive hours and tracks the peak", () => {
  const H = 3_600_000;
  const hours = [10, 50, 70, 60, 20, 55].map((score, i) => ({
    time: i * H,
    score,
    reasons: [`${score}`],
  }));
  const w = toWindows("fog", hours, 50);
  assertEquals(w.length, 2);
  assertEquals([w[0].start, w[0].end, w[0].peak, w[0].peakTime], [H, 4 * H, 70, 2 * H]);
  assertEquals(w[0].reasons, ["70"]);
});

Deno.test("evaluate applies sensitivity, filters events and sets sunset time", () => {
  const f = buildForecast(() => ({ cloudHigh: 50, horizonLowWest: 5 }));
  const e = evaluate(f, { minScore: 50, events: ["sunset"], sensitivity: { sunset: -10 } });
  assert(e.windows.every((w) => w.type === "sunset"));
  assertEquals(e.windows.length, 2);
  assertEquals(e.windows[0].at, f.daily.sunset[0]);
  assertEquals(e.hourly.sunset[16].score, scoreGlow(f, "sunset")[16].score - 10);
});
