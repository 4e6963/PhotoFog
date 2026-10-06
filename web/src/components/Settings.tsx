import { useState } from "preact/hooks";
import type { NotifyPrefs } from "../../../shared/types.ts";
import { relative } from "../format.ts";
import { disablePush, enablePush, lastSync, pushError, pushStatus, testPush } from "../push.ts";
import { importState, locations, now, prefs, refreshAll, snapshot } from "../store.ts";

const setNotify = (
  patch: Partial<NotifyPrefs>,
) => (prefs.value = { ...prefs.value, notify: { ...prefs.value.notify, ...patch } });

export function Settings() {
  return (
    <main class="container">
      <Notifications />
      <Backup />
      <section class="panel">
        <h2>About the scores</h2>
        <p class="small">
          Scores (0–100) are computed from the{" "}
          <a href="https://open-meteo.com/" target="_blank" rel="noopener">Open-Meteo</a> forecast.
          {" "}
          <b>Fog</b> uses visibility, temperature/dew-point spread, humidity and wind.{" "}
          <b>Sunrise/sunset</b>{" "}
          looks for 30–70% mid/high clouds with a clear horizon ~80 km towards the sun.{" "}
          <b>Sea of clouds</b>{" "}
          needs a cloud layer below your elevation, an inversion, and clear air above. Models are
          imperfect — treat high scores as "worth checking the webcam".
        </p>
      </section>
    </main>
  );
}

function Notifications() {
  const n = prefs.value.notify;
  const status = pushStatus.value;
  const [testMsg, setTestMsg] = useState<string | null>(null);

  const runTest = async () => {
    setTestMsg("Sending…");
    try {
      await testPush();
      setTestMsg("Sent — it should arrive in a few seconds.");
    } catch (e) {
      setTestMsg(`Failed: ${(e as Error).message}`);
    }
  };

  return (
    <section class="panel">
      <h2>Push notifications</h2>
      {status === "unsupported" && (
        <p class="muted">This browser does not support push notifications.</p>
      )}
      {status === "needs-install" && (
        <p class="muted">
          On iPhone/iPad, push only works for installed apps: tap{" "}
          <b>Share → Add to Home Screen</b>, then open PhotoFog from the home screen.
        </p>
      )}
      {status === "denied" && (
        <p class="muted">
          Notifications are blocked. Allow them in your browser's site settings, then reload.
        </p>
      )}
      {(status === "off" || status === "busy") && (
        <>
          <p class="small">
            Get a push when a high-scoring window is coming up at one of your locations. To do this,
            a copy of your locations and these notification settings is kept on the server, tied to
            an anonymous push subscription. It's deleted when you turn notifications off, or after
            30 days without opening the app.
          </p>
          <button
            type="button"
            class="btn btn-primary"
            disabled={status === "busy"}
            onClick={enablePush}
          >
            Enable notifications
          </button>
        </>
      )}
      {status === "on" && (
        <>
          <p class="small">
            ✅ Enabled for {locations.value.length}{" "}
            location{locations.value.length === 1 ? "" : "s"}
            {lastSync.value && (
              <span class="muted">{` · synced ${relative(lastSync.value, now.value)}`}</span>
            )}
          </p>
          <div class="grid2">
            <label class="field">
              <span>Notify from score</span>
              <input
                type="number"
                min={0}
                max={100}
                step={5}
                value={n.minScore}
                onChange={(e) =>
                  setNotify({ minScore: clamp(Number(e.currentTarget.value), 0, 100) })}
              />
            </label>
            <label class="field">
              <span>Earliest alert (h before)</span>
              <input
                type="number"
                min={0}
                max={72}
                value={n.leadMaxHours}
                onChange={(e) =>
                  setNotify({
                    leadMaxHours: Math.max(
                      n.leadMinHours,
                      clamp(Number(e.currentTarget.value), 0, 72),
                    ),
                  })}
              />
            </label>
            <label class="field">
              <span>Latest alert (h before)</span>
              <input
                type="number"
                min={0}
                max={72}
                value={n.leadMinHours}
                onChange={(e) =>
                  setNotify({
                    leadMinHours: Math.min(
                      n.leadMaxHours,
                      clamp(Number(e.currentTarget.value), 0, 72),
                    ),
                  })}
              />
            </label>
            <div class="field">
              <div class="field-head">
                <span id="quiet-label">Quiet hours</span>
                <label class="switch">
                  <input
                    type="checkbox"
                    role="switch"
                    aria-labelledby="quiet-label"
                    checked={n.quietEnabled}
                    onChange={(e) => setNotify({ quietEnabled: e.currentTarget.checked })}
                  />
                  <span class="switch-track" aria-hidden="true" />
                </label>
              </div>
              <span class="row gap">
                <input
                  type="time"
                  aria-label="Quiet hours start"
                  disabled={!n.quietEnabled}
                  value={n.quietStart}
                  onChange={(e) => setNotify({ quietStart: e.currentTarget.value || "22:00" })}
                />
                –
                <input
                  type="time"
                  aria-label="Quiet hours end"
                  disabled={!n.quietEnabled}
                  value={n.quietEnd}
                  onChange={(e) => setNotify({ quietEnd: e.currentTarget.value || "07:00" })}
                />
              </span>
            </div>
          </div>
          <p class="muted small">
            Each event is announced at most once per location and day. Alerts found during quiet
            hours are sent afterwards if still within the lead time.
          </p>
          <div class="row gap wrap">
            <button type="button" class="btn" onClick={runTest}>Send test notification</button>
            <button type="button" class="btn btn-ghost" onClick={disablePush}>Turn off</button>
          </div>
          {testMsg && <p class="small">{testMsg}</p>}
        </>
      )}
      {pushError.value && <p class="error small">{pushError.value}</p>}
    </section>
  );
}

function Backup() {
  const [msg, setMsg] = useState<string | null>(null);

  const exportJson = () => {
    const blob = new Blob([JSON.stringify(snapshot.value, null, 2)], { type: "application/json" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `photofog-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(a.href);
  };

  const importJson = async (file: File | undefined) => {
    if (!file) return;
    try {
      importState(JSON.parse(await file.text()));
      refreshAll();
      setMsg(`Imported ${locations.value.length} locations.`);
    } catch (e) {
      setMsg(`Import failed: ${(e as Error).message}`);
    }
  };

  return (
    <section class="panel">
      <h2>Backup</h2>
      <p class="small">
        Locations and settings live only in this browser. Export them to move to another device or
        to keep a backup.
      </p>
      <div class="row gap wrap">
        <button type="button" class="btn" onClick={exportJson}>Export JSON</button>
        <label class="btn">
          Import JSON
          <input
            type="file"
            accept="application/json,.json"
            hidden
            onChange={(e) => importJson(e.currentTarget.files?.[0])}
          />
        </label>
      </div>
      {msg && <p class="small">{msg}</p>}
    </section>
  );
}

const clamp = (
  v: number,
  min: number,
  max: number,
) => (Number.isFinite(v) ? Math.min(max, Math.max(min, v)) : min);
