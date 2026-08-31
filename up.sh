#!/bin/sh
# up.sh — the commissariats, listening.
set -e
cd "$(dirname "$0")"
./down.sh >/dev/null 2>&1 || true
./wait-ports.sh free
export STALIN_SEED="${STALIN_SEED:-1928}"
for s in agriculture industry transport trade gosplan; do
  deno run --quiet --allow-net --allow-run --allow-read --allow-env \
    "$s.server.ts" > "/tmp/stalin-$s.log" 2>&1 &
  echo "$!" >> /tmp/stalin.pids
done
./wait-ports.sh up
echo "up: gosplan :8801  agriculture :8802  industry :8803  transport :8804  trade :8805"
