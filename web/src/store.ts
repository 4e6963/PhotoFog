// App state. Everything the user configures lives here and in localStorage only.
import { computed, effect, signal } from "@preact/signals";
import { DEFAULT_PREFS, EVENT_TYPES } from "../../shared/types.ts";
import type { Evaluation, EventType, Forecast, Location, Preferences } from "../../shared/types.ts";
import { evaluate } from "../../shared/scoring/index.ts";

const STORAGE_KEY = "photofog:v1";
const SCHEMA_VERSION = 1;

export interface Filters {
  events: EventType[];
  minScore: number;
  timeOfDay: "any" | "morning" | "evening";
  sort: "manual" | "score" | "name";
}

export const DEFAULT_FILTERS: Filters = {
  events: [...EVENT_TYPES],
  minScore: 40,
  timeOfDay: "any",
  sort: "manual",
};

export interface Persisted {
  version: number;
  locations: Location[];
  prefs: Preferences;
  filters: Filters;
}

function safeGet(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

function safeSet(key: string, value: string) {
  try {
    localStorage.setItem(key, value);
  } catch (e) {
    console.warn("could not persist settings", e);
  }
}

function sanitizeLocation(l: Partial<Location>): Location | null {
  if (typeof l?.name !== "string" || !(Math.abs(l.lat!) <= 90) || !(Math.abs(l.lon!) <= 180)) {
    return null;
  }
  const elevation = Number.isFinite(l.elevation) ? l.elevation : undefined;
  return {
    id: typeof l.id === "string" && l.id ? l.id.slice(0, 64) : crypto.randomUUID().slice(0, 8),
    name: l.name.slice(0, 100) || "Unnamed",
    lat: l.lat!,
    lon: l.lon!,
    elevation,
    events: Array.isArray(l.events)
      ? l.events.filter((e) => EVENT_TYPES.includes(e))
      : [...EVENT_TYPES],
    sensitivity: typeof l.sensitivity === "object" && l.sensitivity ? l.sensitivity : {},
  };
}

/** Merges unknown/partial data with defaults so old or hand-edited exports keep working. */
export function normalizeState(raw: Partial<Persisted> | null | undefined): Persisted {
  return {
    version: SCHEMA_VERSION,
    locations: Array.isArray(raw?.locations)
      ? raw.locations.map(sanitizeLocation).filter((l): l is Location => l !== null)
      : [],
    prefs: {
      ...DEFAULT_PREFS,
      ...raw?.prefs,
      notify: { ...DEFAULT_PREFS.notify, ...raw?.prefs?.notify },
    },
    filters: { ...DEFAULT_FILTERS, ...raw?.filters },
  };
}

function load(): Persisted {
  const text = safeGet(STORAGE_KEY);
  try {
    return normalizeState(text ? JSON.parse(text) : null);
  } catch {
    return normalizeState(null);
  }
}

const initial = load();
export const locations = signal<Location[]>(initial.locations);
export const prefs = signal<Preferences>(initial.prefs);
export const filters = signal<Filters>(initial.filters);

export const snapshot = computed<Persisted>(() => ({
  version: SCHEMA_VERSION,
  locations: locations.value,
  prefs: prefs.value,
  filters: filters.value,
}));

effect(() => safeSet(STORAGE_KEY, JSON.stringify(snapshot.value)));

export function importState(data: unknown) {
  const s = normalizeState(data as Partial<Persisted>);
  locations.value = s.locations;
  prefs.value = s.prefs;
  filters.value = s.filters;
}

// ---- locations -------------------------------------------------------------

export function addLocation(
  loc: Omit<Location, "id" | "events"> & Partial<Pick<Location, "events">>,
) {
  const id = crypto.randomUUID().slice(0, 8);
  locations.value = [...locations.value, { events: [...EVENT_TYPES], ...loc, id }];
  void loadForecast(locations.value.at(-1)!);
  return id;
}

export function updateLocation(id: string, patch: Partial<Location>) {
  locations.value = locations.value.map((l) => (l.id === id ? { ...l, ...patch, id } : l));
}

export function removeLocation(id: string) {
  locations.value = locations.value.filter((l) => l.id !== id);
}

export function moveLocation(id: string, delta: -1 | 1) {
  const list = [...locations.value];
  const i = list.findIndex((l) => l.id === id);
  const j = i + delta;
  if (i < 0 || j < 0 || j >= list.length) return;
  [list[i], list[j]] = [list[j], list[i]];
  locations.value = list;
}

// ---- forecasts (not persisted; the service worker caches /api/forecast for offline use) ----

export interface ForecastState {
  loading: boolean;
  error?: string;
  forecast?: Forecast;
}

export const forecasts = signal<Record<string, ForecastState>>({});

const coordKey = (l: Pick<Location, "lat" | "lon">) => `${l.lat.toFixed(2)},${l.lon.toFixed(2)}`;

export async function loadForecast(loc: Location) {
  const key = coordKey(loc);
  forecasts.value = {
    ...forecasts.value,
    [key]: { ...forecasts.value[key], loading: true, error: undefined },
  };
  try {
    const res = await fetch(`/api/forecast?lat=${loc.lat}&lon=${loc.lon}`);
    if (!res.ok) {
      throw new Error((await res.json().catch(() => null))?.error ?? `HTTP ${res.status}`);
    }
    const forecast = (await res.json()) as Forecast;
    forecasts.value = { ...forecasts.value, [key]: { loading: false, forecast } };
  } catch (e) {
    forecasts.value = {
      ...forecasts.value,
      [key]: { ...forecasts.value[key], loading: false, error: (e as Error).message },
    };
  }
}

export function refreshAll() {
  const seen = new Set<string>();
  for (const l of locations.value) {
    if (seen.has(coordKey(l))) continue;
    seen.add(coordKey(l));
    void loadForecast(l);
  }
}

export function forecastFor(loc: Location): ForecastState {
  return forecasts.value[coordKey(loc)] ?? { loading: false };
}

/** Ticks so "x min ago" labels stay current while the app is open. */
export const now = signal(Date.now());
setInterval(() => (now.value = Date.now()), 30_000);
document.addEventListener("visibilitychange", () => (now.value = Date.now()));

/** Age of the stalest forecast on the dashboard (fetchedAt is when the server got it upstream). */
export const oldestUpdate = computed<number | null>(() => {
  const times = locations.value
    .map((l) => forecastFor(l).forecast?.fetchedAt)
    .filter((t): t is number => t !== undefined);
  return times.length ? Math.min(...times) : null;
});

export const anyLoading = computed(() => Object.values(forecasts.value).some((s) => s.loading));

/** Scores with the location's elevation/sensitivity and the dashboard threshold. */
export function evaluationFor(
  loc: Location,
  f: Forecast,
  minScore = filters.value.minScore,
): Evaluation {
  return evaluate(f, {
    elevation: loc.elevation,
    events: loc.events,
    sensitivity: loc.sensitivity,
    minScore,
  });
}
