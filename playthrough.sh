#!/bin/sh
# playthrough.sh — a scripted game. Deterministic, so it doubles as a
# regression test: the same seed must always give the same reckoning.
set -e
cd "$(dirname "$0")"
STALIN_SEED="${STALIN_SEED:-1928}" ./up.sh >/dev/null
S="deno run --quiet --allow-net stalin.ts"
$S new --seed "${STALIN_SEED:-1928}" >/dev/null
for line in "$@"; do
  # shellcheck disable=SC2086
  $S plan $line
done
$S reckoning
./down.sh >/dev/null 2>&1 || true
