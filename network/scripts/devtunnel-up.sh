#!/usr/bin/env bash
# Share local ports through a Microsoft dev tunnel. Return when the URLs are ready.
#
# usage: devtunnel-up.sh [--name ID] [--anon] [--expire TIME] [--dir DIR] [--timeout SEC] [PORT...]
#   PORT...        local ports; for --name, ports to add to the tunnel if missing
#   --name ID      persistent tunnel: create it and its ports if missing (same URL each run)
#   --anon         allow anonymous access (anyone with the URL) on a new tunnel
#   --expire TIME  expiration of a new tunnel, 1h to 30d (default: 1d, with --name 30d)
#   --dir DIR      run directory (default: new mktemp -d); gets host.log, pid, tunnel
#   --timeout SEC  max wait for the host (default 30)
#
# Prints dir=, pid=, tunnel= and one url=PORT URI line per port, then exits.
# The host keeps running in the background. Stop: devtunnel-down.sh [--delete] DIR.
set -euo pipefail

usage() {
  echo "usage: devtunnel-up.sh [--name ID] [--anon] [--expire TIME] [--dir DIR] [--timeout SEC] [PORT...]" >&2
  exit 2
}

name=""
anon=()
expire=""
dir=""
timeout=30
while [ $# -gt 0 ]; do
  case "$1" in
    --name) [ $# -ge 2 ] || usage; name=$2; shift 2 ;;
    --anon) anon=(-a); shift ;;
    --expire) [ $# -ge 2 ] || usage; expire=$2; shift 2 ;;
    --dir) [ $# -ge 2 ] || usage; dir=$2; shift 2 ;;
    --timeout) [ $# -ge 2 ] || usage; timeout=$2; shift 2 ;;
    --) shift; break ;;
    -*) usage ;;
    *) break ;;
  esac
done
for p in "$@"; do
  case "$p" in ''|*[!0-9]*) echo "error: port is not a number: $p" >&2; exit 2 ;; esac
done
case "$timeout" in ''|*[!0-9]*) usage ;; esac
[ -n "$name" ] || [ $# -gt 0 ] || { echo "error: give a PORT or --name ID" >&2; exit 2; }
# A named tunnel keeps its URL, so it gets the maximum expiration.
if [ -z "$expire" ]; then
  if [ -n "$name" ]; then expire=30d; else expire=1d; fi
fi

# JSON from devtunnel; the CLI can print text lines before the JSON.
dj() { devtunnel "$@" -j 2>/dev/null | sed -n '/^[{[]/,$p'; }

if ! dj user show | jq -e '.status == "Logged in"' >/dev/null 2>&1; then
  echo "error: devtunnel is not logged in; tell the user to type: ! devtunnel user login -g" >&2
  exit 3
fi

if [ -n "$dir" ]; then
  mkdir -p -- "$dir"
else
  dir=$(mktemp -d "${TMPDIR:-/tmp}/devtunnel.XXXXXX")
fi
dir=$(CDPATH='' cd -- "$dir" && pwd)
# One host per directory: a second run must not lose the pid of the first host.
if [ -e "$dir/pid" ]; then
  echo "error: $dir has a host; run devtunnel-down.sh on it, or use a new --dir" >&2
  exit 2
fi
rm -f "$dir/tunnel" "$dir/started"
echo "dir=$dir"

# On a failure, stop the host and delete a tunnel that this run created.
pid=""
created=""
ok=0
cleanup() {
  [ "$ok" = 1 ] && return
  if [ -n "$pid" ]; then
    kill "$pid" 2>/dev/null || true
    { wait "$pid"; } 2>/dev/null || true
  fi
  rm -f "$dir/pid" "$dir/started"
  if [ -n "$created" ]; then
    devtunnel delete "$created" -f >/dev/null 2>&1 || true
    echo "deleted the new tunnel $created" >&2
  fi
}
trap cleanup EXIT

host_args=()
if [ -n "$name" ]; then
  # host ID -p N fails on a tunnel that exists, so add the ports first.
  if ! devtunnel show "$name" -j >/dev/null 2>&1; then
    [ $# -gt 0 ] || { echo "error: tunnel $name does not exist; give a PORT to create it" >&2; exit 2; }
    devtunnel create "$name" -e "$expire" ${anon[@]+"${anon[@]}"} >/dev/null
    created=$name
  elif [ ${#anon[@]} -gt 0 ]; then
    echo "warning: --anon ignored, tunnel $name exists; use: devtunnel access create $name -a" >&2
  fi
  have=$(dj port list "$name" | jq -r '(.ports // [])[].portNumber')
  for p in "$@"; do
    grep -qx "$p" <<<"$have" && continue
    devtunnel port create "$name" -p "$p" >/dev/null
    have=$have$'\n'$p
  done
  host_args=("$name")
else
  for p in "$@"; do host_args+=(-p "$p"); done
  host_args+=(-e "$expire" ${anon[@]+"${anon[@]}"})
fi

nohup devtunnel host "${host_args[@]}" </dev/null >"$dir/host.log" 2>&1 &
pid=$!
echo "$pid" >"$dir/pid"
# The start time identifies the process for devtunnel-down.sh, also after PID reuse.
ps -p "$pid" -o lstart= >"$dir/started"
echo "pid=$pid"

tunnel=""
deadline=$((SECONDS + timeout))
while :; do
  tunnel=$(sed -n 's/^Ready to accept connections for tunnel: //p' "$dir/host.log")
  [ -n "$tunnel" ] && break
  kill -0 "$pid" 2>/dev/null || break
  grep -qE '^(Tunnel service error|Login token expired|Login required)' "$dir/host.log" && break
  [ "$SECONDS" -lt "$deadline" ] || break
  sleep 1
done
if [ -z "$tunnel" ]; then
  echo "error: the host is not ready; last lines of $dir/host.log:" >&2
  tail -n 5 "$dir/host.log" >&2
  [ -n "$name" ] || echo "note: a tunnel without --name can stay until its expiration; see devtunnel list" >&2
  exit 1
fi
echo "$tunnel" >"$dir/tunnel"
ok=1
echo "tunnel=$tunnel"

dj show "$tunnel" | jq -r '(.tunnel.ports // [])[] | "url=\(.portNumber) \(.portUri)"'
