import type { EventWindow, Forecast, Location } from "../../shared/types.ts";
import { localHour } from "./format.ts";
import { evaluationFor, type Filters } from "./store.ts";

/** Upcoming windows for a location that pass the dashboard filters, best first. */
export function visibleWindows(
  loc: Location,
  f: Forecast,
  filters: Filters,
  now = Date.now(),
): EventWindow[] {
  const { windows } = evaluationFor(loc, f, filters.minScore);
  return windows
    .filter((w) => w.end > now && filters.events.includes(w.type))
    .filter((w) => {
      if (filters.timeOfDay === "any") return true;
      const hour = localHour(w.at ?? w.peakTime, f.timezone);
      return filters.timeOfDay === "morning" ? hour < 12 : hour >= 12;
    });
}

export const bestScore = (windows: EventWindow[]) =>
  windows.reduce((m, w) => Math.max(m, w.peak), 0);
