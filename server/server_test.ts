import { assert, assertEquals, assertThrows } from "@std/assert";
import { buildForecast, T0 } from "../shared/fixtures/builder.ts";
import { DEFAULT_PREFS, type SyncPayload } from "../shared/types.ts";
import { getSub, listSubs, openStore, putSub } from "./kv.ts";
import { checkSub, dueWindows, inQuietHours } from "./scheduler.ts";
import { validateSync, ValidationError } from "./validate.ts";
import { createApp } from "./main.ts";
import type { PushPayload } from "./push.ts";

await openStore(":memory:");

const H = 3_600_000;
const ENDPOINT = "https://fcm.googleapis.com/fcm/send/abc123";

function payload(over: Partial<SyncPayload> = {}): SyncPayload {
  return {
    subscription: { endpoint: ENDPOINT, keys: { auth: "a", p256dh: "p" } },
    locations: [{ id: "l1", name: "Lake", lat: 47.5, lon: 9.5, events: ["fog"] }],
    prefs: {
      ...DEFAULT_PREFS,
      notify: { ...DEFAULT_PREFS.notify, enabled: true, quietStart: "00:00", quietEnd: "00:00" },
    },
    tz: "UTC",
    ...over,
  };
}

// Fog from 05:00–09:00 on day 2 (hours 29–33).
const foggy = buildForecast((i) =>
  i >= 29 && i <= 33
    ? { temp: 3, dewPoint: 2.8, rh: 99, visibility: 200, wind: 0.5, weatherCode: 45 }
    : {}
);

function fakeDeps(result: "ok" | "gone" | "error" = "ok") {
  const sent: PushPayload[] = [];
  return {
    sent,
    deps: {
      forecast: () => Promise.resolve(foggy),
      push: (_s: unknown, p: PushPayload) => {
        sent.push(p);
        return Promise.resolve(result);
      },
    },
  };
}

// ---- scheduler -------------------------------------------------------------

Deno.test("inQuietHours handles ranges wrapping midnight", () => {
  const at = (h: number) => T0 + h * H;
  assert(inQuietHours(at(23), "UTC", "22:00", "07:00"));
  assert(inQuietHours(at(3), "UTC", "22:00", "07:00"));
  assert(!inQuietHours(at(12), "UTC", "22:00", "07:00"));
  assert(inQuietHours(at(13), "UTC", "12:00", "14:00"));
  assert(!inQuietHours(at(13), "UTC", "00:00", "00:00"));
  // 23:00 UTC = 00:00 Berlin (winter)
  assert(inQuietHours(at(23), "Europe/Berlin", "23:30", "06:00"));
});

Deno.test("dueWindows respects the lead time range", () => {
  const w = (h: number) => ({
    type: "fog" as const,
    start: h * H,
    end: h * H + H,
    peak: 80,
    peakTime: h * H,
    reasons: [],
  });
  assertEquals(dueWindows([w(1), w(5), w(20)], 0, 2, 18).map((x) => x.start), [5 * H]);
});

Deno.test("checkSub sends one push per window and dedups", async () => {
  const sub = await putSub(
    payload({ subscription: { endpoint: ENDPOINT + "dedup", keys: { auth: "a", p256dh: "p" } } }),
  );
  const now = T0 + 18 * H; // 18:00 day 1, fog starts in ~11 h
  const { sent, deps } = fakeDeps();
  assertEquals((await checkSub(sub, now, deps)).sent, 1);
  assertEquals(sent.length, 1);
  assert(sent[0].title.includes("Fog"), sent[0].title);
  assert(sent[0].body.includes("tomorrow"), sent[0].body);
  assertEquals(sent[0].url, "/?loc=l1");

  assertEquals((await checkSub(sub, now + H, deps)).sent, 0, "dedup");
});

Deno.test("checkSub skips quiet hours and disabled notifications", async () => {
  const quiet = await putSub(payload({
    subscription: { endpoint: ENDPOINT + "quiet", keys: { auth: "a", p256dh: "p" } },
    prefs: { ...DEFAULT_PREFS, notify: { ...DEFAULT_PREFS.notify, enabled: true } }, // 22–07
  }));
  const { sent, deps } = fakeDeps();
  await checkSub(quiet, T0 + 23 * H, deps);
  const off = {
    ...quiet,
    prefs: { ...quiet.prefs, notify: { ...quiet.prefs.notify, enabled: false } },
  };
  await checkSub(off, T0 + 18 * H, deps);
  assertEquals(sent.length, 0);
});

Deno.test("checkSub ignores quiet hours when the toggle is off", async () => {
  const sub = await putSub(payload({
    subscription: { endpoint: ENDPOINT + "quietoff", keys: { auth: "a", p256dh: "p" } },
    prefs: {
      ...DEFAULT_PREFS,
      notify: { ...DEFAULT_PREFS.notify, enabled: true, quietEnabled: false }, // 22–07, but off
    },
  }));
  const { sent, deps } = fakeDeps();
  assertEquals((await checkSub(sub, T0 + 23 * H, deps)).sent, 1);
  assertEquals(sent.length, 1);
});

Deno.test("validateSync defaults quietEnabled to true for older clients", () => {
  const p = payload();
  delete (p.prefs.notify as Partial<typeof p.prefs.notify>).quietEnabled;
  assertEquals(validateSync(p).prefs.notify.quietEnabled, true);
  assertEquals(
    validateSync(payload({
      prefs: { ...DEFAULT_PREFS, notify: { ...DEFAULT_PREFS.notify, quietEnabled: false } },
    })).prefs.notify.quietEnabled,
    false,
  );
});

Deno.test("checkSub deletes gone subscriptions and retries after errors", async () => {
  const ep = ENDPOINT + "gone";
  const sub = await putSub(
    payload({ subscription: { endpoint: ep, keys: { auth: "a", p256dh: "p" } } }),
  );
  const now = T0 + 18 * H;

  const failing = fakeDeps("error");
  await checkSub(sub, now, failing.deps);
  const ok = fakeDeps("ok");
  assertEquals((await checkSub(sub, now, ok.deps)).sent, 1, "error un-marks dedup key");

  const fresh = await putSub(
    payload({ subscription: { endpoint: ep + "2", keys: { auth: "a", p256dh: "p" } } }),
  );
  assert((await checkSub(fresh, now, fakeDeps("gone").deps)).gone);
  assertEquals(await getSub(ep + "2"), null);
});

// ---- validation ------------------------------------------------------------

Deno.test("validateSync accepts a good payload and drops unknown events", () => {
  const p = payload();
  (p.locations[0].events as string[]).push("tornado");
  assertEquals(validateSync(p).locations[0].events, ["fog"]);
});

Deno.test("validateSync rejects non-push endpoints, bad tz and bad coordinates", () => {
  const bad = [
    payload({
      subscription: { endpoint: "https://evil.example.com/x", keys: { auth: "a", p256dh: "p" } },
    }),
    payload({
      subscription: { endpoint: "http://fcm.googleapis.com/x", keys: { auth: "a", p256dh: "p" } },
    }),
    payload({ tz: "Mars/Olympus" }),
    payload({ locations: [{ id: "x", name: "x", lat: 120, lon: 0, events: [] }] }),
    payload({
      locations: Array.from(
        { length: 30 },
        (_, i) => ({ id: `${i}`, name: "x", lat: 0, lon: 0, events: [] }),
      ),
    }),
  ];
  for (const b of bad) assertThrows(() => validateSync(b), ValidationError);
});

// ---- API -------------------------------------------------------------------

Deno.test("API: subscription upsert/delete and validation errors", async () => {
  const app = createApp();
  const ep = ENDPOINT + "api";
  const put = await app.request("/api/subscription", {
    method: "PUT",
    body: JSON.stringify(
      payload({ subscription: { endpoint: ep, keys: { auth: "a", p256dh: "p" } } }),
    ),
  });
  assertEquals(put.status, 200);
  assert(await getSub(ep));

  const bad = await app.request("/api/subscription", { method: "PUT", body: "{nope" });
  assertEquals(bad.status, 400);

  const del = await app.request("/api/subscription", {
    method: "DELETE",
    body: JSON.stringify({ endpoint: ep }),
  });
  assertEquals(del.status, 200);
  assertEquals(await getSub(ep), null);

  assertEquals((await app.request("/api/forecast?lat=999&lon=0")).status, 400);
  assertEquals((await app.request("/api/nope")).status, 404);
});

Deno.test("listSubs yields stored subscriptions", async () => {
  let n = 0;
  for await (const _ of listSubs()) n++;
  assert(n >= 1);
});
