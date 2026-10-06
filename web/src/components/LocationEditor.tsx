import { EVENT_ICONS, EVENT_LABELS, EVENT_TYPES } from "../../../shared/types.ts";
import type { EventType, Location } from "../../../shared/types.ts";
import { moveLocation, removeLocation, updateLocation } from "../store.ts";

export function LocationEditor({ loc, gridElevation }: { loc: Location; gridElevation?: number }) {
  const toggle = (e: EventType) =>
    updateLocation(loc.id, {
      events: loc.events.includes(e) ? loc.events.filter((x) => x !== e) : [...loc.events, e],
    });
  const setSensitivity = (e: EventType, v: number) =>
    updateLocation(loc.id, { sensitivity: { ...loc.sensitivity, [e]: v } });

  return (
    <div class="editor">
      <label class="field">
        <span>Name</span>
        <input
          value={loc.name}
          maxLength={100}
          onChange={(e) =>
            updateLocation(loc.id, { name: e.currentTarget.value.trim() || loc.name })}
        />
      </label>
      <label class="field">
        <span>Elevation (m)</span>
        <input
          type="number"
          inputMode="numeric"
          placeholder={gridElevation !== undefined
            ? `${Math.round(gridElevation)} (from terrain model)`
            : "auto"}
          value={loc.elevation ?? ""}
          onChange={(e) => {
            const v = Number(e.currentTarget.value);
            const valid = e.currentTarget.value !== "" && Number.isFinite(v) && v >= -500 &&
              v <= 9000;
            updateLocation(loc.id, { elevation: valid ? v : undefined });
          }}
        />
        <small class="muted">
          Matters for sea-of-clouds: use your standpoint's height (summit, viewpoint), not the
          valley.
        </small>
      </label>

      <fieldset class="field">
        <legend>Events & sensitivity</legend>
        {EVENT_TYPES.map((e) => (
          <div class="event-row" key={e}>
            <label class="check">
              <input type="checkbox" checked={loc.events.includes(e)} onChange={() => toggle(e)} />
              {EVENT_ICONS[e]} {EVENT_LABELS[e]}
            </label>
            <input
              type="range"
              min={-20}
              max={20}
              step={5}
              disabled={!loc.events.includes(e)}
              value={loc.sensitivity?.[e] ?? 0}
              onInput={(ev) => setSensitivity(e, Number(ev.currentTarget.value))}
              aria-label={`${EVENT_LABELS[e]} sensitivity`}
            />
            <span class="sens-value">{formatSens(loc.sensitivity?.[e] ?? 0)}</span>
          </div>
        ))}
        <small class="muted">
          Sensitivity shifts the score: + alerts more easily, − only for strong signals.
        </small>
      </fieldset>

      <div class="row gap">
        <button
          type="button"
          class="btn-ghost"
          onClick={() => moveLocation(loc.id, -1)}
          aria-label="Move up"
        >
          ↑
        </button>
        <button
          type="button"
          class="btn-ghost"
          onClick={() => moveLocation(loc.id, 1)}
          aria-label="Move down"
        >
          ↓
        </button>
        <span class="spacer" />
        <button
          type="button"
          class="btn-danger"
          onClick={() => confirm(`Remove ${loc.name}?`) && removeLocation(loc.id)}
        >
          Remove
        </button>
      </div>
    </div>
  );
}

const formatSens = (v: number) => (v > 0 ? `+${v}` : `${v}`);
