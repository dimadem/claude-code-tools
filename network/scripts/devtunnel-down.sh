#!/usr/bin/env bash
# Stop a host that devtunnel-up.sh started. Optionally delete the tunnel.
#
# usage: devtunnel-down.sh [--delete] DIR
#   DIR       the dir= value from devtunnel-up.sh (has pid and tunnel)
#   --delete  also delete the tunnel object on the service
#             (without it, the tunnel and its URL stay until expiration)
set -euo pipefail

usage() {
  echo "usage: devtunnel-down.sh [--delete] DIR" >&2
  exit 2
}

delete=0
while [ $# -gt 0 ]; do
  case "$1" in
    --delete) delete=1; shift ;;
    --) shift; break ;;
    -*) usage ;;
    *) break ;;
  esac
done
[ $# -eq 1 ] || usage
dir=$1
[ -d "$dir" ] || { echo "error: no directory $dir" >&2; exit 2; }

if [ -r "$dir/pid" ]; then
  pid=$(cat "$dir/pid")
  started=$(cat "$dir/started" 2>/dev/null || true)
  # Kill only the same process: same start time and a devtunnel host command.
  # After a reboot, a different process can have this PID.
  if [ -n "$started" ] && [ "$(ps -p "$pid" -o lstart= 2>/dev/null)" = "$started" ] \
    && ps -p "$pid" -o command= | grep -q 'devtunnel host'; then
    kill "$pid"
    for _ in 1 2 3 4 5; do
      kill -0 "$pid" 2>/dev/null || break
      sleep 1
    done
    echo "stopped pid=$pid"
  else
    echo "pid=$pid is not the host of $dir (it stopped before)"
  fi
  rm -f "$dir/pid" "$dir/started"
else
  echo "no host in $dir"
fi

if [ "$delete" = 1 ]; then
  [ -r "$dir/tunnel" ] || { echo "error: no $dir/tunnel" >&2; exit 2; }
  devtunnel delete "$(cat "$dir/tunnel")" -f
  rm -f "$dir/tunnel"
fi
