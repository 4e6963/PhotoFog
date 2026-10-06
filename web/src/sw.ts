// Service worker: offline app shell, cached forecasts, push notifications.
import {
  cleanupOutdatedCaches,
  createHandlerBoundToURL,
  precacheAndRoute,
} from "workbox-precaching";
import { NavigationRoute, registerRoute } from "workbox-routing";
import { NetworkFirst } from "workbox-strategies";
import { ExpirationPlugin } from "workbox-expiration";

// Minimal SW typings (lib.webworker conflicts with the DOM lib used by the rest of the app).
interface ExtendableEvent extends Event {
  waitUntil(p: Promise<unknown>): void;
}
interface PushEvent extends ExtendableEvent {
  data: { json(): unknown; text(): string } | null;
}
interface NotificationEvent extends ExtendableEvent {
  notification: Notification & { data?: { url?: string } };
}
interface WindowClient {
  url: string;
  focus(): Promise<WindowClient>;
  navigate(url: string): Promise<WindowClient | null>;
}
interface SWScope {
  __WB_MANIFEST: Array<{ url: string; revision: string | null }>;
  location: Location;
  registration: { showNotification(title: string, options?: NotificationOptions): Promise<void> };
  clients: {
    matchAll(o: { type: "window"; includeUncontrolled: boolean }): Promise<WindowClient[]>;
    openWindow(url: string): Promise<WindowClient | null>;
  };
  skipWaiting(): Promise<void>;
  addEventListener(type: "push", fn: (e: PushEvent) => void): void;
  addEventListener(type: "notificationclick", fn: (e: NotificationEvent) => void): void;
  addEventListener(type: "message", fn: (e: MessageEvent) => void): void;
}
declare const self: SWScope;

const manifest = self.__WB_MANIFEST;
cleanupOutdatedCaches();
precacheAndRoute(manifest);
// The dev server precaches nothing; binding to an unprecached index.html would throw.
if (manifest.some((e) => e.url === "index.html")) {
  registerRoute(
    new NavigationRoute(createHandlerBoundToURL("index.html"), { denylist: [/^\/api\//] }),
  );
}

// Forecasts: fresh when online, last known when offline.
registerRoute(
  ({ url }) => url.pathname === "/api/forecast",
  new NetworkFirst({
    cacheName: "forecasts",
    networkTimeoutSeconds: 8,
    plugins: [new ExpirationPlugin({ maxEntries: 50, maxAgeSeconds: 3 * 24 * 3600 })],
  }),
);

self.addEventListener("message", (e) => {
  if (e.data?.type === "SKIP_WAITING") void self.skipWaiting();
});

interface PushData {
  title?: string;
  body?: string;
  tag?: string;
  url?: string;
}

self.addEventListener("push", (event) => {
  let data: PushData = {};
  try {
    data = (event.data?.json() ?? {}) as PushData;
  } catch {
    data = { body: event.data?.text() };
  }
  event.waitUntil(
    self.registration.showNotification(data.title ?? "PhotoFog", {
      body: data.body,
      tag: data.tag,
      icon: "/icon-192.png",
      badge: "/icon-192.png",
      data: { url: data.url ?? "/" },
    }),
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const target = new URL(event.notification.data?.url ?? "/", self.location.origin).href;
  event.waitUntil((async () => {
    const windows = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
    const existing = windows.find((w) => new URL(w.url).origin === self.location.origin);
    if (existing) {
      await existing.focus();
      await existing.navigate(target);
    } else {
      await self.clients.openWindow(target);
    }
  })());
});
