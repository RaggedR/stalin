#!/bin/sh
# wait-ports.sh <free|up> — block until the five ports are all free, or all listening.
want="$1"
for _ in $(seq 1 50); do
  n=0
  for p in 8801 8802 8803 8804 8805; do
    if lsof -ti "tcp:$p" >/dev/null 2>&1; then n=$((n + 1)); fi
  done
  case "$want" in
    free) [ "$n" -eq 0 ] && exit 0 ;;
    up)   [ "$n" -eq 5 ] && exit 0 ;;
  esac
  sleep 0.2
done
echo "wait-ports: gave up waiting for ports to be $want" >&2
exit 1
