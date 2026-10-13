// Privacy policy (GDPR Art. 13). Keep in sync with what the app and server actually do.

const UPDATED = "2026-10-13";

export function Privacy() {
  return (
    <main class="container">
      <section class="panel prose">
        <h2>Privacy policy</h2>
        <p class="small muted">Last updated: {UPDATED}</p>

        <h3>1. Summary</h3>
        <p class="small">
          PhotoFog has no accounts, no cookies, no analytics and no advertising. Your locations and
          settings are stored only in your browser. Data reaches our server only to fetch forecasts
          and, if you turn them on, to send push notifications.
        </p>

        <h3>2. Hosting and server logs</h3>
        <p class="small">
          When you open the app, your browser sends technical data to our server: IP address, date
          and time, requested URL, browser type (user agent). This is necessary to deliver the app
          and keep it secure. Your IP address is held in memory for up to one minute to limit
          requests per client; we do not store it. Our hosting provider may keep short-lived access
          logs for operation and abuse prevention. The app is hosted by Deno Land Inc., USA (Deno
          Deploy); transfers to the USA are covered by the EU standard contractual clauses. Legal
          basis: Art. 6(1)(f) GDPR (our legitimate interest in a secure, working service).
        </p>

        <h3>3. Data stored in your browser</h3>
        <p class="small">
          Locations (name and coordinates), filters and preferences are saved in your browser's
          local storage, and loaded forecasts are cached by the service worker for offline use. This
          data never leaves your device unless you enable push notifications (see 5). You can delete
          it at any time by clearing this site's data in your browser. This storage is strictly
          necessary to provide the features you use (§ 25(2) no. 2 TDDDG, Art. 6(1)(b) GDPR).
        </p>

        <h3>4. Weather forecasts and place search</h3>
        <p class="small">
          To fetch forecasts, your browser sends a location's coordinates to our server, which
          requests the data from{" "}
          <a href="https://open-meteo.com/" target="_blank" rel="noopener">Open-Meteo</a>{" "}
          (Open-Meteo.com, Switzerland). Open-Meteo receives only the coordinates, not your IP
          address. When you search for a place by name, your browser sends the search term directly
          to Open-Meteo's geocoding API, so Open-Meteo also receives your IP address. Switzerland
          has an EU adequacy decision. See the{" "}
          <a href="https://open-meteo.com/en/terms" target="_blank" rel="noopener">
            Open-Meteo terms and privacy policy
          </a>
          . "Use my location" reads your position via your browser only after you allow it; it is
          stored like any other location (see 3). Legal basis: Art. 6(1)(b) GDPR (providing the
          service you requested).
        </p>

        <h3>5. Push notifications (optional)</h3>
        <p class="small">
          If you enable notifications, our server stores: your browser's push subscription (endpoint
          URL and encryption keys), your saved locations, your notification settings and your time
          zone, plus markers of which alerts were already sent (kept 48 hours). This data is not
          linked to your name or account. It is refreshed when you open the app, deleted immediately
          when you turn notifications off, and deleted automatically after 30 days without opening
          the app. Notifications are delivered through your browser vendor's push service (e.g.
          Google Firebase Cloud Messaging, Mozilla Push Service, Apple Push Notification service),
          which receives the encrypted message and the subscription endpoint; these services may be
          located outside the EU. Legal basis: Art. 6(1)(a) GDPR (your consent, given by enabling
          notifications), which you can withdraw at any time by turning notifications off in
          Settings or blocking them in your browser.
        </p>

        <h3>6. Your rights</h3>
        <p class="small">
          You have the right to access (Art. 15 GDPR), rectification (Art. 16), erasure (Art. 17),
          restriction of processing (Art. 18), data portability (Art. 20) and to object to
          processing based on legitimate interests (Art. 21). Since we cannot identify you, the
          quickest way to exercise these rights for push data is to turn notifications off, which
          deletes it. You may also lodge a complaint with a data protection supervisory authority
          (Art. 77 GDPR), in particular in your place of residence.
        </p>

        <h3>7. Changes</h3>
        <p class="small">
          We update this policy when the app changes how it handles data. The current version is
          always available in the app under Settings → Privacy.
        </p>
      </section>
    </main>
  );
}
