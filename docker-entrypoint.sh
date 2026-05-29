#!/bin/sh
set -e

# ~/.claude.json is a single mutable file rewritten by every claude process.
# Sharing the host file as a live bind mount over VirtioFS produced torn reads
# (atomic renames on the host are not atomic for the container), corrupting the
# JSON. Instead the host file is mounted read-only at /seed and copied to a
# container-local path once, so the CLI reads/writes a real local file.
if [ -f /seed/.claude.json ] && [ ! -f /root/.claude.json ]; then
  cp /seed/.claude.json /root/.claude.json
  echo "[entrypoint] seeded /root/.claude.json from host (read-only seed)"
fi

exec "$@"
