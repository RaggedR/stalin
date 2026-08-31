#!/bin/sh
if [ -f /tmp/stalin.pids ]; then
  while read -r pid; do kill "$pid" 2>/dev/null || true; done < /tmp/stalin.pids
  rm -f /tmp/stalin.pids
fi
for p in 8801 8802 8803 8804 8805; do
  pid=$(lsof -ti "tcp:$p" 2>/dev/null || true)
  [ -n "$pid" ] && kill $pid 2>/dev/null || true
done
exit 0
