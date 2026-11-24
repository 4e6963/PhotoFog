import { assert, assertEquals } from "@std/assert";
import { buildForecast } from "../fixtures/builder.ts";
import { scoreFog } from "./fog.ts";
import { scoreGlow } from "./glow.ts";
import { scoreInversion } from "./inversion.ts";
import { scoreSnow } from "./snow.ts";
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

// ---- Snow ---------------------------------------------------------------

Deno.test("snow: deep fresh snow on a cold day scores high in daylight", () => {
  const s = scoreSnow(
    buildForecast((i) => ({ temp: -3, snowDepth: 0.25, snowfall: i < 10 ? 1 : 0 })),
  );
  assert(s[12].score >= 90, `got ${s[12].score}`);
  assert(s[12].reasons.some((r) => r.startsWith("fresh snow")));
  assertEquals(s[2].score, 0, "snow cover is only scored in daylight");
});

Deno.test("snow: patchy or no snow scores zero", () => {
  assertEquals(maxScore(scoreSnow(buildForecast(() => ({ snowDepth: 0.01 })))), 0);
  assertEquals(maxScore(scoreSnow(buildForecast())), 0);
});

Deno.test("snow: forecasts without snow fields (old cache) do not throw", () => {
  const f = buildForecast();
  // deno-lint-ignore no-explicit-any
  const h = f.hourly as any;
  delete h.snowDepth;
  delete h.snowfall;
  assertEquals(maxScore(scoreSnow(f)), 0);
  evaluate(f, { minScore: 40 });
});

Deno.test("snow: one window per day even if the score dips below the threshold", () => {
  // Day 1 midday thaw dips the score; nights are 0.
  const f = buildForecast((i) => ({ snowDepth: 0.2, temp: i % 24 >= 11 && i % 24 <= 13 ? 8 : -2 }));
  const e = evaluate(f, { minScore: 60, events: ["snow"] });
  assertEquals(e.windows.length, 2);
  assert(e.hourly.snow[12].score < 60);
});

Deno.test("snow: rising snow depth counts as fresh snow, not rain", () => {
  const f = buildForecast((i) => ({
    temp: 1.5,
    precip: 2,
    snowfall: 0,
    snowDepth: 0.1 + 0.02 * i,
  }));
  const s = scoreSnow(f)[12];
  assert(s.reasons.some((r) => r.startsWith("fresh snow")), s.reasons.join());
  assert(!s.reasons.some((r) => r.startsWith("rain")), s.reasons.join());
});

Deno.test("snow: max sensitivity reaches 60 points at 2 cm", () => {
  const f = buildForecast(() => ({ temp: -3, snowDepth: 0.02 }));
  assertEquals(evaluate(f, { minScore: 40, sensitivity: { snow: 0 } }).hourly.snow[12].score, 0);
  assertEquals(evaluate(f, { minScore: 40, sensitivity: { snow: 20 } }).hourly.snow[12].score, 60);
  const deep = buildForecast(() => ({ temp: -3, snowDepth: 0.1 }));
  assertEquals(scoreSnow(deep, 20)[12].score, scoreSnow(deep)[12].score, "deep snow unchanged");
});

Deno.test("snow: thaw and rain lower the score", () => {
  const cold = scoreSnow(buildForecast(() => ({ temp: -2, snowDepth: 0.2 })))[12].score;
  const wet = scoreSnow(buildForecast(() => ({ temp: 7, snowDepth: 0.2, precip: 2 })))[12].score;
  assert(wet < cold * 0.5, `${wet} vs ${cold}`);
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
