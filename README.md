# PhotoFog

PWA dashboard + push notifications for photography weather: **fog/mist**, **colorful
sunrise/sunset** and **sea of clouds (inversions)**. Forecast data from
[Open-Meteo](https://open-meteo.com/) (no API key).

- Locations, filters and preferences live **only in the browser** (localStorage, export/import as
  JSON).
- For push, the browser syncs its subscription + locations + notification prefs to the server (Deno
  KV). That copy is refreshed on every app start, deleted on "Turn off", and expires after 30 days
  without sync.

## Development

```sh
deno install        # npm deps for the frontend
deno task dev       # API on :8000 + Vite on :5173 (proxies /api) — open http://localhost:5173
deno task test      # scoring, scheduler, validation and API tests
deno task check     # type-check server, shared and web
deno task build     # production build into web/dist
deno task start     # serve API + web/dist on :8000
```

With `DEBUG=1` (set by `dev`), `POST /api/debug/run-check` runs the hourly notification check
immediately.

## Layout

| Path      |                                                                                                                          |
| --------- | ------------------------------------------------------------------------------------------------------------------------ |
| `shared/` | Types, Open-Meteo request/normalizer, scoring (`scoring/fog.ts`, `glow.ts`, `inversion.ts`). Used by server and browser. |
| `server/` | Hono API, forecast cache, Deno KV store, Web Push (VAPID), hourly `Deno.cron` scheduler.                                 |
| `web/`    | Preact + Vite PWA (`src/sw.ts` handles offline cache and push).                                                          |

## Deployment (Docker)

**Production** (`docker-compose.yml`) runs the image published by CI:

```sh
cp .env.example .env    # set PHOTOFOG_IMAGE and VAPID_SUBJECT (.env is not committed)
docker compose pull && docker compose up -d
```

The port is bound to `127.0.0.1` for a reverse proxy on the same host. The `photofog-data` volume
holds the push subscriptions and `vapid.json` — back it up.

**Local container build** (`docker-compose.dev.yml`) builds from the checkout, with `DEBUG=1` and a
separate volume:

```sh
docker compose -f docker-compose.dev.yml up --build
```

CI (`.github/workflows/container.yml`) runs fmt/lint/check/tests, then builds a multi-arch image
(amd64 + arm64) and pushes it to `ghcr.io/<owner>/<repo>` on pushes to the default branch (`latest`)
and on `v*` tags (`1.2.3`, `1.2`). Pull requests only build. New GHCR packages are private by
default.

Put it behind an HTTPS reverse proxy (service workers and push require a secure origin).
Configuration (env):

| Variable              | Default                  |                                                                |
| --------------------- | ------------------------ | -------------------------------------------------------------- |
| `PORT`                | `8000`                   |                                                                |
| `KV_PATH`             | `./data/kv.sqlite3`      | `/data/...` in Docker (volume)                                 |
| `VAPID_FILE`          | `./data/vapid.json`      | Generated on first start — keep it, or all subscriptions break |
| `VAPID_KEYS`          | –                        | Alternatively the JWK JSON of the keys                         |
| `VAPID_SUBJECT`       | `mailto:admin@localhost` | Contact for push services                                      |
| `TRUST_PROXY`         | –                        | `1` to use `X-Forwarded-For` for rate limiting                 |
| `PUSH_HOST_ALLOWLIST` | FCM, Mozilla, WNS, Apple | Comma-separated push service hosts (`.suffix` allowed)         |
| `DEBUG`               | –                        | `1` enables `/api/debug/run-check`                             |

## Notes on the scores

Scores are heuristics on model output, 0–100. Per location you can set your standpoint elevation
(important for sea of clouds) and a per-event sensitivity offset. On summits, "fog" usually means
being inside the cloud. iOS delivers push only to PWAs added to the Home Screen.
