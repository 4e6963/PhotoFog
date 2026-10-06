import { useEffect, useState } from "preact/hooks";
import { addLocation } from "../store.ts";

interface GeoResult {
  id: number;
  name: string;
  latitude: number;
  longitude: number;
  elevation?: number;
  country?: string;
  admin1?: string;
}

const GEOCODE_URL = "https://geocoding-api.open-meteo.com/v1/search";

export function AddLocation({ onDone }: { onDone: (id?: string) => void }) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<GeoResult[]>([]);
  const [status, setStatus] = useState<string | null>(null);
  const [manual, setManual] = useState({ name: "", lat: "", lon: "" });

  useEffect(() => {
    if (query.trim().length < 2) {
      setResults([]);
      return;
    }
    const ctrl = new AbortController();
    const t = setTimeout(async () => {
      try {
        const params = new URLSearchParams({
          name: query.trim(),
          count: "8",
          language: navigator.language.slice(0, 2),
        });
        const res = await fetch(`${GEOCODE_URL}?${params}`, { signal: ctrl.signal });
        const data = await res.json();
        setResults(data.results ?? []);
        setStatus(
          data.results?.length
            ? null
            : "No places found. Search finds towns and regions — for an exact viewpoint, enter coordinates below.",
        );
      } catch (e) {
        if ((e as Error).name !== "AbortError") setStatus("Search failed (offline?)");
      }
    }, 300);
    return () => {
      clearTimeout(t);
      ctrl.abort();
    };
  }, [query]);

  const pick = (r: GeoResult) =>
    onDone(addLocation({ name: r.name, lat: r.latitude, lon: r.longitude }));

  const useMyLocation = () => {
    setStatus("Locating…");
    navigator.geolocation.getCurrentPosition(
      (p) =>
        onDone(
          addLocation({ name: "My location", lat: p.coords.latitude, lon: p.coords.longitude }),
        ),
      (e) => setStatus(`Location unavailable: ${e.message}`),
      { enableHighAccuracy: true, timeout: 15_000 },
    );
  };

  const addManual = (e: Event) => {
    e.preventDefault();
    const lat = Number(manual.lat), lon = Number(manual.lon);
    if (!(Math.abs(lat) <= 90 && Math.abs(lon) <= 180) || manual.lat === "" || manual.lon === "") {
      setStatus("Enter valid coordinates (lat −90…90, lon −180…180).");
      return;
    }
    onDone(
      addLocation({ name: manual.name.trim() || `${lat.toFixed(3)}, ${lon.toFixed(3)}`, lat, lon }),
    );
  };

  return (
    <div class="panel">
      <div class="row space">
        <h2>Add location</h2>
        <button type="button" class="btn-ghost" onClick={() => onDone()} aria-label="Close">
          ✕
        </button>
      </div>
      <input
        type="search"
        placeholder="Search a town or region, e.g. Bled or Rathen"
        value={query}
        onInput={(e) => setQuery(e.currentTarget.value)}
        autoFocus
      />
      <ul class="results">
        {results.map((r) => (
          <li key={r.id}>
            <button type="button" onClick={() => pick(r)}>
              <strong>{r.name}</strong>
              <span class="muted small">
                {[r.admin1, r.country].filter(Boolean).join(", ")}
                {r.elevation !== undefined && ` · ${Math.round(r.elevation)} m`}
              </span>
            </button>
          </li>
        ))}
      </ul>
      {status && <p class="muted small">{status}</p>}

      <div class="row gap wrap">
        {"geolocation" in navigator && (
          <button type="button" class="btn" onClick={useMyLocation}>📍 Use my location</button>
        )}
      </div>

      <details>
        <summary>Enter coordinates</summary>
        <form class="manual" onSubmit={addManual}>
          <input
            placeholder="Name"
            value={manual.name}
            onInput={(e) => setManual({ ...manual, name: e.currentTarget.value })}
          />
          <input
            placeholder="Latitude"
            inputMode="decimal"
            value={manual.lat}
            onInput={(e) => setManual({ ...manual, lat: e.currentTarget.value })}
          />
          <input
            placeholder="Longitude"
            inputMode="decimal"
            value={manual.lon}
            onInput={(e) => setManual({ ...manual, lon: e.currentTarget.value })}
          />
          <button type="submit" class="btn">Add</button>
        </form>
      </details>
    </div>
  );
}
