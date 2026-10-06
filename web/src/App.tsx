import { signal } from "@preact/signals";
import { useEffect } from "preact/hooks";
import { Dashboard } from "./components/Dashboard.tsx";
import { Settings } from "./components/Settings.tsx";
import { relative, timeOf } from "./format.ts";
import { anyLoading, now, oldestUpdate, refreshAll } from "./store.ts";

type Route = "dashboard" | "settings";
const route = signal<Route>(location.hash === "#settings" ? "settings" : "dashboard");
addEventListener(
  "hashchange",
  () => (route.value = location.hash === "#settings" ? "settings" : "dashboard"),
);

export const updateReady = signal<(() => void) | null>(null);
const online = signal(navigator.onLine);
addEventListener("online", () => (online.value = true));
addEventListener("offline", () => (online.value = false));

/** Location to open from a notification deep link (/?loc=id). */
const focus = new URLSearchParams(location.search).get("loc");

export function App() {
  useEffect(() => {
    refreshAll();
    // Refresh when the app comes back to the foreground after a while.
    const onVisible = () => {
      if (document.visibilityState !== "visible") return;
      const oldest = oldestUpdate.value;
      if (oldest === null || Date.now() - oldest > 30 * 60_000) refreshAll();
    };
    document.addEventListener("visibilitychange", onVisible);
    if (focus) history.replaceState(null, "", location.pathname + location.hash);
    return () => document.removeEventListener("visibilitychange", onVisible);
  }, []);

  const loading = anyLoading.value;

  return (
    <>
      <header class="topbar">
        <a href="#" class="brand">
          <img src="/icon.svg" alt="" width={28} height={28} />
          PhotoFog
        </a>
        <nav class="row gap">
          {route.value === "dashboard" && <UpdatedIndicator />}
          {route.value === "dashboard" && (
            <button
              type="button"
              class="btn-ghost"
              onClick={refreshAll}
              disabled={loading}
              aria-label="Refresh"
            >
              <span class={loading ? "spin" : ""}>↻</span>
            </button>
          )}
          <a
            href={route.value === "settings" ? "#" : "#settings"}
            class="btn-ghost"
            aria-label="Settings"
          >
            {route.value === "settings" ? "Done" : "⚙︎"}
          </a>
        </nav>
      </header>
      {updateReady.value && (
        <div class="banner">
          A new version is available.{" "}
          <button type="button" class="link" onClick={updateReady.value}>Reload</button>
        </div>
      )}
      {!online.value && <div class="banner">Offline — showing last loaded forecasts.</div>}
      {route.value === "settings" ? <Settings /> : <Dashboard focus={focus} />}
    </>
  );
}

const STALE_MS = 60 * 60_000;

/** "Updated 5 min ago" for the stalest forecast on the dashboard. */
function UpdatedIndicator() {
  const t = oldestUpdate.value;
  if (anyLoading.value) return <span class="updated">Updating…</span>;
  if (t === null) return null;
  const stale = now.value - t > STALE_MS;
  return (
    <span
      class={`updated ${stale ? "stale" : ""}`}
      title={`Weather data from ${timeOf(t, Intl.DateTimeFormat().resolvedOptions().timeZone)}`}
    >
      Updated {relative(t, now.value)}
    </span>
  );
}
