// Strict validation of client payloads. The server POSTs to subscription endpoints, so they are
// restricted to known push services to avoid being used as an open request relay.
import { DEFAULT_PREFS, EVENT_TYPES } from "../shared/types.ts";
import type { EventType, Location, Preferences, SyncPayload } from "../shared/types.ts";

const DEFAULT_PUSH_HOSTS = [
  "fcm.googleapis.com",
  "android.googleapis.com",
  ".push.services.mozilla.com",
  ".notify.windows.com",
  "web.push.apple.com",
  ".push.apple.com",
];
const PUSH_HOSTS = Deno.env.get("PUSH_HOST_ALLOWLIST")?.split(",").map((s) => s.trim()) ??
  DEFAULT_PUSH_HOSTS;

export const MAX_LOCATIONS = 25;

export class ValidationError extends Error {}

function fail(msg: string): never {
  throw new ValidationError(msg);
}

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null;
const str = (v: unknown, max: number, name: string) =>
  typeof v === "string" && v.length > 0 && v.length <= max ? v : fail(`invalid ${name}`);
const num = (v: unknown, min: number, max: number, name: string) =>
  typeof v === "number" && Number.isFinite(v) && v >= min && v <= max ? v : fail(`invalid ${name}`);
const hhmm = (v: unknown, name: string) =>
  typeof v === "string" && /^([01]\d|2[0-3]):[0-5]\d$/.test(v) ? v : fail(`invalid ${name}`);

export function validateEndpoint(v: unknown): string {
  const endpoint = str(v, 2048, "endpoint");
  let url: URL;
  try {
    url = new URL(endpoint);
  } catch {
    fail("invalid endpoint");
  }
  if (url.protocol !== "https:") fail("endpoint must be https");
  const ok = PUSH_HOSTS.some((h) =>
    h.startsWith(".") ? url.hostname.endsWith(h) : url.hostname === h
  );
  if (!ok) fail(`push service ${url.hostname} not allowed`);
  return endpoint;
}

export function validateSubscription(v: unknown): SyncPayload["subscription"] {
  if (!isObj(v) || !isObj(v.keys)) fail("invalid subscription");
  return {
    endpoint: validateEndpoint(v.endpoint),
    keys: {
      auth: str(v.keys.auth, 256, "auth key"),
      p256dh: str(v.keys.p256dh, 256, "p256dh key"),
    },
  };
}

function validateLocation(v: unknown): Location {
  if (!isObj(v)) fail("invalid location");
  const events = Array.isArray(v.events)
    ? v.events.filter((e): e is EventType => EVENT_TYPES.includes(e as EventType))
    : [];
  const sensitivity: Location["sensitivity"] = {};
  if (isObj(v.sensitivity)) {
    for (const t of EVENT_TYPES) {
      if (v.sensitivity[t] !== undefined) {
        sensitivity[t] = num(v.sensitivity[t], -20, 20, "sensitivity");
      }
    }
  }
  return {
    id: str(v.id, 64, "location id"),
    name: str(v.name, 100, "location name"),
    lat: num(v.lat, -90, 90, "lat"),
    lon: num(v.lon, -180, 180, "lon"),
    elevation: v.elevation === undefined || v.elevation === null
      ? undefined
      : num(v.elevation, -500, 9000, "elevation"),
    events,
    sensitivity,
  };
}

function validatePrefs(v: unknown): Preferences {
  if (!isObj(v) || !isObj(v.notify)) fail("invalid prefs");
  const n = v.notify;
  const prefs: Preferences = {
    minScore: num(v.minScore ?? DEFAULT_PREFS.minScore, 0, 100, "minScore"),
    notify: {
      enabled: n.enabled === true,
      minScore: num(n.minScore, 0, 100, "notify.minScore"),
      leadMinHours: num(n.leadMinHours, 0, 72, "leadMinHours"),
      leadMaxHours: num(n.leadMaxHours, 0, 72, "leadMaxHours"),
      // Missing = enabled, so clients synced before the toggle existed keep their quiet hours.
      quietEnabled: n.quietEnabled !== false,
      quietStart: hhmm(n.quietStart, "quietStart"),
      quietEnd: hhmm(n.quietEnd, "quietEnd"),
    },
  };
  if (prefs.notify.leadMinHours > prefs.notify.leadMaxHours) fail("leadMinHours > leadMaxHours");
  return prefs;
}

function validateTz(v: unknown): string {
  const tz = str(v, 64, "tz");
  try {
    new Intl.DateTimeFormat("en", { timeZone: tz });
  } catch {
    fail("invalid tz");
  }
  return tz;
}

export function validateSync(v: unknown): SyncPayload {
  if (!isObj(v)) fail("invalid body");
  if (!Array.isArray(v.locations) || v.locations.length > MAX_LOCATIONS) {
    fail(`locations must be an array of at most ${MAX_LOCATIONS}`);
  }
  return {
    subscription: validateSubscription(v.subscription),
    locations: v.locations.map(validateLocation),
    prefs: validatePrefs(v.prefs),
    tz: validateTz(v.tz),
  };
}
