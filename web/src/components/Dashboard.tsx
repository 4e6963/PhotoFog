import { useState } from "preact/hooks";
import { bestScore, visibleWindows } from "../filtering.ts";
import { filters, forecastFor, locations } from "../store.ts";
import { AddLocation } from "./AddLocation.tsx";
import { FilterBar } from "./FilterBar.tsx";
import { LocationCard } from "./LocationCard.tsx";

export function Dashboard({ focus }: { focus: string | null }) {
  const [adding, setAdding] = useState(false);
  const [expanded, setExpanded] = useState<string | null>(focus);
  const f = filters.value;

  let list = locations.value;
  if (f.sort === "name") list = [...list].sort((a, b) => a.name.localeCompare(b.name));
  if (f.sort === "score") {
    const score = (id: string) => {
      const loc = list.find((l) => l.id === id)!;
      const fc = forecastFor(loc).forecast;
      return fc ? bestScore(visibleWindows(loc, fc, f)) : -1;
    };
    list = [...list].sort((a, b) => score(b.id) - score(a.id));
  }

  return (
    <main class="container">
      {adding && (
        <AddLocation
          onDone={(id) => {
            setAdding(false);
            if (id) setExpanded(id);
          }}
        />
      )}

      {locations.value.length === 0 && !adding
        ? (
          <div class="empty">
            <p>
              Add the spots you like to shoot. PhotoFog scores fog, colorful sunrises/sunsets and
              seas of clouds for each of them.
            </p>
            <button type="button" class="btn btn-primary" onClick={() => setAdding(true)}>
              + Add first location
            </button>
            <p class="muted small">Your locations and settings are stored only in this browser.</p>
          </div>
        )
        : (
          <>
            <FilterBar />
            <div class="cards">
              {list.map((loc) => (
                <LocationCard
                  key={loc.id}
                  loc={loc}
                  expanded={expanded === loc.id}
                  onToggle={() => setExpanded(expanded === loc.id ? null : loc.id)}
                />
              ))}
            </div>
            {!adding && (
              <button type="button" class="btn add-btn" onClick={() => setAdding(true)}>
                + Add location
              </button>
            )}
          </>
        )}
    </main>
  );
}
