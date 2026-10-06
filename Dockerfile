# ---- build: install npm deps, build the PWA ----
FROM denoland/deno:2.9.7 AS build
WORKDIR /app
COPY deno.json deno.lock package.json ./
COPY web/deno.json web/
RUN deno install --frozen
COPY shared shared
COPY server server
COPY web web
RUN deno task build

# ---- runtime: server + static files only ----
FROM denoland/deno:2.9.7
WORKDIR /app
COPY --from=build /app/deno.json /app/deno.lock ./
COPY --from=build /app/web/deno.json web/
COPY --from=build /app/shared shared
COPY --from=build /app/server server
COPY --from=build /app/web/dist web/dist
COPY --chmod=755 docker-entrypoint.sh /usr/local/bin/photofog-entrypoint
RUN mkdir -p /data && chown -R deno:deno /data /app
USER deno
RUN deno cache server/main.ts
# The entrypoint starts as root to fix /data ownership, then drops to the deno user.
USER root

ENV PORT=8000 \
    KV_PATH=/data/kv.sqlite3 \
    VAPID_FILE=/data/vapid.json
VOLUME /data
EXPOSE 8000
HEALTHCHECK --interval=60s --timeout=5s CMD deno eval "const r = await fetch('http://localhost:8000/api/health'); Deno.exit(r.ok ? 0 : 1)" || exit 1
ENTRYPOINT ["/tini", "--", "photofog-entrypoint"]
CMD ["run", "--allow-net", "--allow-env", "--allow-read", "--allow-write=/data", "server/main.ts"]
