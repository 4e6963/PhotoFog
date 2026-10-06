#!/bin/sh
# Starts as root only to make /data writable (bind mounts and pre-existing volumes are often
# root-owned), then drops to the unprivileged deno user for the actual server.
set -e

if [ "$(id -u)" = "0" ]; then
  mkdir -p /data
  find /data ! -user deno -exec chown deno:deno {} +
  exec setpriv --reuid=deno --regid=deno --init-groups deno "$@"
fi

# Already running as a non-root user (e.g. `user:` set in compose): /data must be writable.
exec deno "$@"
