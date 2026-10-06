import { useEffect, useRef } from "preact/hooks";
import type { EventWindow, Location } from "../../../shared/types.ts";
import { EVENT_ICONS, EVENT_LABELS } from "../../../shared/types.ts";
import { dayLabel, relative, scoreClass, timeOf } from "../format.ts";
import { visibleWindows } from "../filtering.ts";
import { evaluationFor, filters, forecastFor, loadForecast, now } from "../store.ts";
import { LocationEditor } from "./LocationEditor.tsx";
import { Timeline } from "./Timeline.tsx";

interface Props {
  loc: Location;
  expanded: boolean;
  onToggle: () => void;
}

export function LocationCard({ loc, expanded, onToggle }: Props) {
  const state = forecastFor(loc);
  const f = state.forecast;
  const ref = useRef<HTMLElement>(null);

  useEffect(() => {
    if (!f && !state.loading && !state.error) void loadForecast(loc);
  }, [loc.lat, loc.lon]);

  useEffect(() => {
    if (expanded) ref.current?.scrollIntoView({ behavior: "smooth", block: "nearest" });
  }, [expanded]);

  const windows = f ? visibleWindows(loc, f, filters.value) : [];
  const elevation = loc.elevation ?? f?.elevation;
  const shownEvents = loc.events.filter((e) => filters.value.events.includes(e));

  return (
    <article class={`card ${expanded ? "expanded" : ""}`} ref={ref} id={`loc-${loc.id}`}>
      <button type="button" class="card-head" onClick={onToggle} aria-expanded={expanded}>
        <div>
          <h2>{loc.name}</h2>
          <div class="muted small">
            {loc.lat.toFixed(3)}, {loc.lon.toFixed(3)}
            {elevation !== undefined && ` · ${Math.round(elevation)} m`}
            {f && ` · updated ${relative(f.fetchedAt, now.value)}`}
          </div>
        </div>
        <span class="chevron" aria-hidden="true">{expanded ? "▴" : "▾"}</span>
      </button>

      {state.error && (
        <div class="error small">
          {f ? "Showing cached forecast — " : ""}Could not load forecast: {state.error}{" "}
          <button type="button" class="link" onClick={() => loadForecast(loc)}>Retry</button>
        </div>
      )}
      {!f && state.loading && <div class="muted small pad">Loading forecast…</div>}

      {f && (
        <div class="windows">
          {windows.length === 0
            ? (
              <div class="muted small">
                Nothing promising in the next days with the current filters.
              </div>
            )
            : windows.map((w) => <WindowChip key={`${w.type}${w.start}`} w={w} tz={f.timezone} />)}
        </div>
      )}

      {expanded && f && (
        <div class="card-body">
          {shownEvents.length > 0
            ? <Timeline forecast={f} evaluation={evaluationFor(loc, f)} events={shownEvents} />
            : <div class="muted small">No events enabled for this location.</div>}
          <LocationEditor loc={loc} gridElevation={f.elevation} />
        </div>
      )}
      {expanded && !f && (
        <div class="card-body">
          <LocationEditor loc={loc} />
        </div>
      )}
    </article>
  );
}

function WindowChip({ w, tz }: { w: EventWindow; tz: string }) {
  const long = w.end - w.start > 2 * 3_600_000;
  const when = w.at
    ? `${dayLabel(w.at, tz)} ${timeOf(w.at, tz)}`
    : `${dayLabel(w.start, tz)} ${timeOf(w.start, tz)}–${timeOf(w.end, tz)}` +
      (long ? ` · best ${timeOf(w.peakTime, tz)}` : "");
  return (
    <div class="chip" title={w.reasons.join(", ")}>
      <span class="chip-icon">{EVENT_ICONS[w.type]}</span>
      <span class="chip-text">
        <span class="chip-title">{EVENT_LABELS[w.type]}</span>
        <span class="muted small">{when}</span>
      </span>
      <span class={`score ${scoreClass(w.peak)}`}>{w.peak}</span>
    </div>
  );
}
