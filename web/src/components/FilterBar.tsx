import { EVENT_ICONS, EVENT_LABELS, EVENT_TYPES } from "../../../shared/types.ts";
import type { EventType } from "../../../shared/types.ts";
import { type Filters, filters } from "../store.ts";

const set = (patch: Partial<Filters>) => (filters.value = { ...filters.value, ...patch });

export function FilterBar() {
  const f = filters.value;
  const toggle = (e: EventType) =>
    set({ events: f.events.includes(e) ? f.events.filter((x) => x !== e) : [...f.events, e] });

  return (
    <div class="filters">
      <div class="toggles" role="group" aria-label="Event types">
        {EVENT_TYPES.map((e) => (
          <button
            type="button"
            key={e}
            class={`toggle ${f.events.includes(e) ? "on" : ""}`}
            aria-pressed={f.events.includes(e)}
            onClick={() => toggle(e)}
            title={EVENT_LABELS[e]}
          >
            {EVENT_ICONS[e]} <span class="toggle-label">{EVENT_LABELS[e]}</span>
          </button>
        ))}
      </div>
      <div class="row gap wrap">
        <label class="inline">
          Min score
          <input
            type="range"
            min={0}
            max={90}
            step={5}
            value={f.minScore}
            onInput={(e) => set({ minScore: Number(e.currentTarget.value) })}
          />
          <span class="sens-value">{f.minScore}</span>
        </label>
        <select
          value={f.timeOfDay}
          onChange={(e) => set({ timeOfDay: e.currentTarget.value as Filters["timeOfDay"] })}
          aria-label="Time of day"
        >
          <option value="any">Any time</option>
          <option value="morning">Mornings</option>
          <option value="evening">Afternoons / evenings</option>
        </select>
        <select
          value={f.sort}
          onChange={(e) => set({ sort: e.currentTarget.value as Filters["sort"] })}
          aria-label="Sort"
        >
          <option value="manual">My order</option>
          <option value="score">Best score</option>
          <option value="name">Name</option>
        </select>
      </div>
    </div>
  );
}
