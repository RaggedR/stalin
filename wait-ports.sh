#!/bin/sh
# wait-ports.sh <free|up> [n] — block until the ports are all free, or until
# exactly n of them are listening. The count is an argument because the sixth
# server, the typed agent, is optional.
want="$1"
need="${2:-5}"
for _ in $(seq 1 50); do
  n=0
  for p in 8801 8802 8803 8804 8805 8806; do
    if lsof -ti "tcp:$p" >/dev/null 2>&1; then n=$((n + 1)); fi
  done
  case "$want" in
    free) [ "$n" -eq 0 ] && exit 0 ;;
    up)   [ "$n" -eq "$need" ] && exit 0 ;;
  esac
  sleep 0.2
done
echo "wait-ports: gave up waiting for ports to be $want" >&2
exit 1
