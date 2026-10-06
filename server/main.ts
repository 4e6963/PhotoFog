import { Hono } from "hono";
import { serveStatic } from "hono/deno";
import { deleteSub, getSub, openStore, putSub } from "./kv.ts";
import { initPush, sendPush, vapidPublicKey } from "./push.ts";
import { runCheck } from "./scheduler.ts";
import {
  validateEndpoint,
  validateSubscription,
  validateSync,
  ValidationError,
} from "./validate.ts";
import { getForecast } from "./weather.ts";

const PORT = Number(Deno.env.get("PORT") ?? 8000);
const DEBUG = Deno.env.get("DEBUG") === "1";
/** Set when running behind a reverse proxy that sets X-Forwarded-For. */
const TRUST_PROXY = Deno.env.get("TRUST_PROXY") === "1";
const STATIC_ROOT = Deno.env.get("STATIC_ROOT") ?? "./web/dist";

// ---- tiny per-IP rate limit (protects the upstream Open-Meteo quota) ----
const RATE = { windowMs: 60_000, max: 120 };
const hits = new Map<string, { start: number; count: number }>();
function limited(ip: string): boolean {
  const now = Date.now();
  const h = hits.get(ip);
  if (!h || now - h.start > RATE.windowMs) {
    hits.set(ip, { start: now, count: 1 });
    if (hits.size > 10_000) hits.clear();
    return false;
  }
  return ++h.count > RATE.max;
}

export function createApp() {
  const app = new Hono();

  app.onError((err, c) => {
    if (err instanceof ValidationError) return c.json({ error: err.message }, 400);
    if (err instanceof SyntaxError) return c.json({ error: "invalid JSON" }, 400);
    console.error(err);
    return c.json({ error: "internal error" }, 500);
  });

  app.use("/api/*", async (c, next) => {
    const forwarded = TRUST_PROXY
      ? c.req.header("x-forwarded-for")?.split(",")[0].trim()
      : undefined;
    const ip = forwarded ??
      (c.env as { remoteAddr?: Deno.NetAddr } | undefined)?.remoteAddr?.hostname ?? "unknown";
    if (limited(ip)) return c.json({ error: "rate limited" }, 429);
    await next();
  });

  app.get("/api/health", (c) => c.json({ ok: true }));

  app.get("/api/forecast", async (c) => {
    const lat = Number(c.req.query("lat"));
    const lon = Number(c.req.query("lon"));
    if (!(Math.abs(lat) <= 90 && Math.abs(lon) <= 180)) {
      return c.json({ error: "invalid lat/lon" }, 400);
    }
    try {
      const f = await getForecast(lat, lon);
      c.header("Cache-Control", "public, max-age=600");
      return c.json(f);
    } catch (e) {
      console.warn("forecast failed:", (e as Error).message);
      return c.json({ error: "weather service unavailable" }, 502);
    }
  });

  app.get("/api/vapid-public-key", (c) => c.json({ key: vapidPublicKey() }));

  app.put("/api/subscription", async (c) => {
    const sub = await putSub(validateSync(await c.req.json()));
    return c.json({ ok: true, id: sub.id, expiresAt: sub.updatedAt + 30 * 24 * 3_600_000 });
  });

  app.delete("/api/subscription", async (c) => {
    const body = await c.req.json();
    await deleteSub(validateEndpoint(body?.endpoint));
    return c.json({ ok: true });
  });

  app.post("/api/test-push", async (c) => {
    const subscription = validateSubscription((await c.req.json())?.subscription);
    // Only for subscriptions this server knows, so the endpoint can't be used as a relay.
    if (!(await getSub(subscription.endpoint))) {
      return c.json({ error: "unknown subscription" }, 404);
    }
    const result = await sendPush(subscription, {
      title: "📷 PhotoFog test",
      body: "Push notifications are working.",
      tag: "test",
      url: "/",
    });
    if (result === "gone") await deleteSub(subscription.endpoint);
    return c.json({ result }, result === "ok" ? 200 : 502);
  });

  if (DEBUG) app.post("/api/debug/run-check", async (c) => c.json(await runCheck()));

  app.all("/api/*", (c) => c.json({ error: "not found" }, 404));

  // ---- static frontend ----
  app.use("/assets/*", async (c, next) => {
    await next();
    c.header("Cache-Control", "public, max-age=31536000, immutable");
  });
  app.use("/sw.js", async (c, next) => {
    await next();
    c.header("Cache-Control", "no-cache");
  });
  app.use("*", serveStatic({ root: STATIC_ROOT }));
  app.get("*", serveStatic({ path: `${STATIC_ROOT}/index.html` })); // SPA fallback

  return app;
}

if (import.meta.main) {
  await openStore();
  await initPush();
  Deno.cron("photofog-check", "5 * * * *", () => runCheck().then(() => {}));
  Deno.serve({ port: PORT }, createApp().fetch);
}
