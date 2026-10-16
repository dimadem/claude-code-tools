#!/usr/bin/env bash
# Run a long nmap scan with background-safe flags, then print a summary.
#
# Stop: kill PID, or kill this script (it stops nmap too). SIGINT does not
# reach a job that runs in the background.
#
# usage: nmap-run.sh [--dir DIR] [--sudo] [--stats TIME] -- NMAP_ARGS...
#   --dir DIR     run directory (default: new mktemp -d); gets scan.{nmap,xml,gnmap} and log
#   --sudo        run nmap with `sudo -n` (no password prompt; run `sudo -v` before)
#   --stats TIME  status line interval in the log (default 30s)
#
# Adds --noninteractive --stats-every TIME -oA DIR/scan. Do not pass -o* flags.
# Prints dir=DIR and pid=PID (nmap) first, then the summary (nmap-summary.sh) and rc=<code> at the end.
# Progress: tail DIR/log. Summary of a partial scan: nmap-summary.sh DIR/scan.xml.
# Resume after a stop: nmap --resume DIR/scan.gnmap (with sudo if the scan used it).
set -euo pipefail

usage() {
  echo "usage: nmap-run.sh [--dir DIR] [--sudo] [--stats TIME] -- NMAP_ARGS..." >&2
  exit 2
}

dir=""
sudo=()
stats=30s
while [ $# -gt 0 ]; do
  case "$1" in
    --dir) [ $# -ge 2 ] || usage; dir=$2; shift 2 ;;
    --sudo) sudo=(sudo -n); shift ;;
    --stats) [ $# -ge 2 ] || usage; stats=$2; shift 2 ;;
    --) shift; break ;;
    *) usage ;;
  esac
done
[ $# -gt 0 ] || usage
for a in "$@"; do
  case "$a" in
    # nmap also accepts long options with one dash and as unique prefixes.
    -o|-o[NXGSAMH]*|--o[NXGSAMH]*|-app*|--app*|-resu*|--resu*)
      echo "error: $a is not allowed; the script sets -oA DIR/scan" >&2; exit 2 ;;
  esac
done

if [ ${#sudo[@]} -gt 0 ] && ! sudo -n true 2>/dev/null; then
  echo "error: sudo needs a password; tell the user to run: ! sudo -v" >&2
  exit 3
fi

if [ -n "$dir" ]; then
  mkdir -p -- "$dir"
else
  dir=$(mktemp -d "${TMPDIR:-/tmp}/nmap.XXXXXX")
fi
dir=$(CDPATH='' cd -- "$dir" && pwd)
echo "dir=$dir"

# Find nmap-summary.sh next to the real file, also when $0 is a symlink.
self=$0
while [ -L "$self" ]; do
  link=$(readlink -- "$self")
  case "$link" in
    /*) self=$link ;;
    *) self=$(dirname -- "$self")/$link ;;
  esac
done
summary=$(dirname -- "$self")/nmap-summary.sh

# A kill of this script also stops nmap.
pid=""
trap '[ -n "$pid" ] && kill -TERM "$pid" 2>/dev/null' TERM INT HUP

# A background job gets /dev/null as stdin; keep stdin for -iL -.
exec 3<&0
${sudo[@]+"${sudo[@]}"} nmap --noninteractive --stats-every "$stats" -oA "$dir/scan" "$@" <&3 >"$dir/log" 2>&1 &
pid=$!
echo "pid=$pid"
rc=0
wait "$pid" || rc=$?
# A trapped signal ends wait before nmap exits; wait for the real exit status.
while kill -0 "$pid" 2>/dev/null; do
  rc=0
  wait "$pid" || rc=$?
done

if [ -s "$dir/scan.xml" ]; then
  "$summary" "$dir/scan.xml" | tee "$dir/summary.txt" || echo "error: $summary failed" >&2
fi
if [ "$rc" != 0 ]; then
  echo "--- last lines of $dir/log:"
  tail -n 5 "$dir/log"
fi
echo "rc=$rc"
exit "$rc"
