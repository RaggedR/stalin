#!/bin/sh
# up.sh [--agent] — the commissariats, listening.
#
# Five servers by default, and the game is deterministic: a seed plays the same
# game twice, which is what playthrough.sh, search.ts, calibrate.ts and
# optimise.py all rest on. --agent starts a sixth on :8806 whose answers come
# from a language model, and that property is given up for as long as it runs.
set -e
cd "$(dirname "$0")"

agent=0
[ "$1" = "--agent" ] && agent=1

./down.sh >/dev/null 2>&1 || true
./wait-ports.sh free
export STALIN_SEED="${STALIN_SEED:-1928}"
# Passed through to the commissariats so the balance harness can turn off the
# process-per-hop. Unset for every normal game.
export STALIN_INPROC="${STALIN_INPROC:-0}"
# Read by gosplan.server.ts and play.ts. Neither offers the commissar without it.
export STALIN_AGENT="$agent"

servers="agriculture industry transport trade gosplan"
for s in $servers; do
  deno run --quiet --allow-net --allow-run --allow-read --allow-env \
    "$s.server.ts" > "/tmp/stalin-$s.log" 2>&1 &
  echo "$!" >> /tmp/stalin.pids
done

if [ "$agent" = 1 ]; then
  # Scoped --allow-run: this is the only server that spawns something other
  # than deno, and naming the two binaries it may spawn costs nothing.
  deno run --quiet --allow-net --allow-run=deno,claude --allow-read --allow-env \
    commissar.server.ts > /tmp/stalin-commissar.log 2>&1 &
  echo "$!" >> /tmp/stalin.pids
  ./wait-ports.sh up 6
  echo "up: gosplan :8801  agriculture :8802  industry :8803  transport :8804  trade :8805  commissar :8806"
  echo "    the commissar is answered by claude; this game is no longer reproducible from its seed"
else
  ./wait-ports.sh up 5
  echo "up: gosplan :8801  agriculture :8802  industry :8803  transport :8804  trade :8805"
fi
