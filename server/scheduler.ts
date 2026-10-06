// Hourly check: evaluate every subscriber's locations and push new, upcoming windows.
import { evaluate } from "../shared/scoring/index.ts";
import { EVENT_ICONS, EVENT_LABELS } from "../shared/types.ts";
import type { EventWindow, Forecast, Location } from "../shared/types.ts";
import { deleteSub, listSubs, markSent, type StoredSub, unmarkSent } from "./kv.ts";
import { type PushPayload, sendPush } from "./push.ts";
import { getForecast } from "./weather.ts";

const HOUR = 3_600_000;

function localParts(t: number, tz: string) {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: tz,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    weekday: "short",
    hourCycle: "h23",
  }).formatToParts(t);
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? "";
  return {
    date: `${get("year")}-${get("month")}-${get("day")}`,
    time: `${get("hour")}:${get("minute")}`,
    weekday: get("weekday"),
  };
}

/** True if local "HH:MM" of `now` falls in [start, end), wrapping over midnight. */
export function inQuietHours(now: number, tz: string, start: string, end: string): boolean {
  if (start === end) return false;
  const t = localParts(now, tz).time;
  return start < end ? t >= start && t < end : t >= start || t < end;
}

/** Windows worth alerting for: score high enough, starting within the lead-time range. */
export function dueWindows(windows: EventWindow[], now: number, leadMin: number, leadMax: number) {
  return windows.filter((w) => w.start >= now + leadMin * HOUR && w.start <= now + leadMax * HOUR);
}

function describe(w: EventWindow, tz: string, now: number): string {
  const s = localParts(w.at ?? w.start, tz);
  const day = s.date === localParts(now, tz).date
    ? "today"
    : s.date === localParts(now + 24 * HOUR, tz).date
    ? "tomorrow"
    : s.weekday;
  const when = w.at ? `${day} ${s.time}` : `${day} ${s.time}–${localParts(w.end, tz).time}`;
  return `${EVENT_ICONS[w.type]} ${EVENT_LABELS[w.type]} ${when} (score ${w.peak})`;
}

export function buildPush(
  loc: Location,
  windows: EventWindow[],
  tz: string,
  now: number,
): PushPayload {
  const best = windows.reduce((a, b) => (b.peak > a.peak ? b : a));
  return {
    title: `${EVENT_ICONS[best.type]} ${EVENT_LABELS[best.type]} likely at ${loc.name}`,
    body: windows.map((w) => describe(w, tz, now)).join("\n"),
    tag: `loc-${loc.id}`,
    url: `/?loc=${encodeURIComponent(loc.id)}`,
  };
}

export interface CheckDeps {
  forecast: (lat: number, lon: number) => Promise<Forecast>;
  push: typeof sendPush;
}

export async function checkSub(
  sub: StoredSub,
  now = Date.now(),
  { forecast, push }: CheckDeps = { forecast: getForecast, push: sendPush },
) {
  const n = sub.prefs.notify;
  if (!n.enabled) return { sent: 0 };
  if (n.quietEnabled && inQuietHours(now, sub.tz, n.quietStart, n.quietEnd)) return { sent: 0 };

  let sent = 0;
  for (const loc of sub.locations) {
    if (loc.events.length === 0) continue;
    let f: Forecast;
    try {
      f = await forecast(loc.lat, loc.lon);
    } catch (e) {
      console.warn(`forecast failed for ${loc.name}:`, (e as Error).message);
      continue;
    }
    const { windows } = evaluate(f, {
      elevation: loc.elevation,
      events: loc.events,
      sensitivity: loc.sensitivity,
      minScore: n.minScore,
    });

    // One alert per (location, event, local day): claim the dedup keys first.
    const fresh: { w: EventWindow; key: string }[] = [];
    for (const w of dueWindows(windows, now, n.leadMinHours, n.leadMaxHours)) {
      const key = `${loc.id}:${w.type}:${localParts(w.start, sub.tz).date}`;
      if (await markSent(sub.id, key)) fresh.push({ w, key });
    }
    if (fresh.length === 0) continue;

    const result = await push(sub.subscription, buildPush(loc, fresh.map((x) => x.w), sub.tz, now));
    if (result === "gone") {
      await deleteSub(sub.id, true);
      return { sent, gone: true };
    }
    if (result === "error") {
      for (const x of fresh) await unmarkSent(sub.id, x.key); // retry next run
    } else {
      sent++;
    }
  }
  return { sent };
}

export async function runCheck(now = Date.now()) {
  const started = performance.now();
  let subs = 0, sent = 0, gone = 0;
  for await (const sub of listSubs()) {
    subs++;
    try {
      const r = await checkSub(sub, now);
      sent += r.sent;
      if (r.gone) gone++;
    } catch (e) {
      console.error(`check failed for sub ${sub.id}:`, e);
    }
  }
  const ms = Math.round(performance.now() - started);
  console.log(`check: ${subs} subs, ${sent} pushes, ${gone} gone, ${ms} ms`);
  return { subs, sent, gone, ms };
}
