#!/bin/sh
# playthrough.sh — a scripted game. Deterministic, so it doubles as a
# regression test: the same seed must always give the same reckoning.
#
# A year is two turns now, so arguments alternate: a sow line, then a reap
# line, then a sow line, and so on. Ten in all.
#
#   ./playthrough.sh \
#     "--labour 90,0,14,10 --procure firm" \
#     "--export surplus --buy engineers --build tractors" \
#     ...
set -e
cd "$(dirname "$0")"
STALIN_SEED="${STALIN_SEED:-1928}" ./up.sh >/dev/null
S="deno run --quiet --allow-net stalin.ts"
$S new --seed "${STALIN_SEED:-1928}" >/dev/null
season=sow
for line in "$@"; do
  # shellcheck disable=SC2086
  $S $season $line
  if [ "$season" = sow ]; then season=reap; else season=sow; fi
done
$S reckoning
./down.sh >/dev/null 2>&1 || true
