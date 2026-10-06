// Push subscription handling. The server only gets a copy of locations + prefs for subscribed
// browsers, refreshed on every app start and change (it expires after 30 days without sync).
import { effect, signal } from "@preact/signals";
import type { SyncPayload } from "../../shared/types.ts";
import { locations, prefs } from "./store.ts";

export type PushStatus = "unsupported" | "needs-install" | "denied" | "off" | "on" | "busy";

export const pushStatus = signal<PushStatus>("off");
export const pushError = signal<string | null>(null);
export const lastSync = signal<number | null>(null);

const isIos = () => /iPad|iPhone|iPod/.test(navigator.userAgent);
const isStandalone = () =>
  matchMedia("(display-mode: standalone)").matches ||
  (navigator as unknown as { standalone?: boolean }).standalone === true;

function supported() {
  return "serviceWorker" in navigator && "PushManager" in window && "Notification" in window;
}

async function registration() {
  return await navigator.serviceWorker.ready;
}

async function currentSubscription(): Promise<PushSubscription | null> {
  if (!supported()) return null;
  return await (await registration()).pushManager.getSubscription();
}

function urlBase64ToUint8Array(base64: string): Uint8Array<ArrayBuffer> {
  const padded = (base64 + "=".repeat((4 - (base64.length % 4)) % 4)).replace(/-/g, "+").replace(
    /_/g,
    "/",
  );
  const raw = atob(padded);
  return Uint8Array.from(raw, (c) => c.charCodeAt(0));
}

function payload(sub: PushSubscription): SyncPayload {
  const json = sub.toJSON();
  return {
    subscription: {
      endpoint: json.endpoint!,
      keys: { auth: json.keys!.auth, p256dh: json.keys!.p256dh },
    },
    locations: locations.value,
    prefs: prefs.value,
    tz: Intl.DateTimeFormat().resolvedOptions().timeZone,
  };
}

async function api(method: string, path: string, body: unknown) {
  const res = await fetch(path, {
    method,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error ?? `HTTP ${res.status}`);
  return data;
}

export async function syncNow() {
  const sub = await currentSubscription();
  if (!sub || !prefs.value.notify.enabled) return;
  try {
    await api("PUT", "/api/subscription", payload(sub));
    lastSync.value = Date.now();
    pushError.value = null;
  } catch (e) {
    pushError.value = `Sync failed: ${(e as Error).message}`;
  }
}

export async function enablePush() {
  pushError.value = null;
  pushStatus.value = "busy";
  try {
    const permission = await Notification.requestPermission();
    if (permission !== "granted") {
      pushStatus.value = permission === "denied" ? "denied" : "off";
      return;
    }
    const { key } = await (await fetch("/api/vapid-public-key")).json();
    const reg = await registration();
    const sub = (await reg.pushManager.getSubscription()) ??
      (await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(key),
      }));
    prefs.value = { ...prefs.value, notify: { ...prefs.value.notify, enabled: true } };
    await api("PUT", "/api/subscription", payload(sub));
    lastSync.value = Date.now();
    pushStatus.value = "on";
  } catch (e) {
    pushError.value = (e as Error).message;
    pushStatus.value = "off";
  }
}

export async function disablePush() {
  pushStatus.value = "busy";
  prefs.value = { ...prefs.value, notify: { ...prefs.value.notify, enabled: false } };
  try {
    const sub = await currentSubscription();
    if (sub) {
      await api("DELETE", "/api/subscription", { endpoint: sub.endpoint }).catch(() => {});
      await sub.unsubscribe();
    }
  } finally {
    pushStatus.value = "off";
  }
}

export async function testPush() {
  const sub = await currentSubscription();
  if (!sub) throw new Error("not subscribed");
  await syncNow(); // make sure the server knows this subscription
  await api("POST", "/api/test-push", { subscription: sub.toJSON() });
}

export async function initPush() {
  if (!supported()) {
    pushStatus.value = isIos() && !isStandalone() ? "needs-install" : "unsupported";
    return;
  }
  if (Notification.permission === "denied") {
    pushStatus.value = "denied";
    return;
  }
  const sub = await currentSubscription();
  pushStatus.value = sub && prefs.value.notify.enabled ? "on" : "off";
  if (pushStatus.value === "on") await syncNow();

  // Re-sync (debounced) whenever locations or notification prefs change.
  let timer: number | undefined;
  let first = true;
  effect(() => {
    void locations.value;
    void prefs.value;
    if (first) {
      first = false;
      return;
    }
    clearTimeout(timer);
    timer = setTimeout(() => void syncNow(), 1000);
  });
}
