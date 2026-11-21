#!/usr/bin/env bash
# Run a delegated CLI command or agent in a herdr-core (hc) terminal.
#
# usage: hc-run.sh [--name NAME] [--no-wait] DIR [COMMAND]
#        hc-run.sh --agent [--name NAME] -- PROGRAM [ARGS...]
#   NAME         terminal name: 1-32 of a-z 0-9 - _ (default: subagent-<random>)
#   DIR          run directory (create it with mktemp -d); holds cmd.sh, run.sh and rc
#   COMMAND      shell command; if given, it replaces DIR/cmd.sh
#                cmd.sh runs in bash with pipefail, in $PWD, with $d exported as DIR
#   --no-wait    start the command and do not wait for its end
#   --agent      start an interactive program (for example codex) and do not wait
#
# The terminal is a child of the caller terminal ($HC_TERMINAL_ID): it ends when
# the caller ends. Herdr shows it under the caller in the agent list.
# If the caller pane has the focus, the terminal also gets a pane: the first one
# to the right of the caller pane, later ones below the last pane of the tab.
# Then the focus goes back to the caller pane.
# Prints terminal=<address>, then rc=<code> (not with --no-wait or --agent).
# Outside hc, the command runs here without a terminal and prints rc=<code>.
# The exit status is the command's.
set -euo pipefail

usage() {
  echo "usage: hc-run.sh [--name NAME] [--no-wait] DIR [COMMAND] | --agent [--name NAME] -- PROGRAM [ARGS...]" >&2
  exit 2
}

name="subagent-$RANDOM$RANDOM"
wait=1
agent=0
while [ $# -gt 0 ]; do
  case "$1" in
    --name)
      [ $# -ge 2 ] || usage
      name=$2
      shift 2
      ;;
    --no-wait)
      wait=0
      shift
      ;;
    --agent)
      agent=1
      shift
      ;;
    --)
      shift
      break
      ;;
    -*) usage ;;
    *) break ;;
  esac
done

in_hc=0
[ -n "${HC_TERMINAL_ID:-}" ] && in_hc=1

# Give terminal $1 a pane next to the caller pane, only when the caller pane has
# the focus. Herdr places a new pane next to the focused pane.
show_pane() {
  command -v herdr-app >/dev/null || return 0
  local tree me focused tab last
  tree=$(herdr-app ls 2>/dev/null) || return 0
  read -r me tab < <(jq -r --arg t "$HC_TERMINAL_ID" '
    first(.spaces[].tabs[] as $tb | $tb.terminals[] | select(.terminal == $t)
      | "\(.pane) \($tb.id)") // ""' <<<"$tree") || return 0
  [ -n "$me" ] || return 0
  focused=$(herdr-app status 2>/dev/null | jq -r '.focused_pane // ""') || return 0
  [ "$focused" = "$me" ] || return 0
  last=$(jq -r --arg tab "$tab" --arg me "$me" '
    [.spaces[].tabs[] | select(.id == $tab) | .terminals[]
      | select(.pane != null and .pane != $me) | .pane] | last // ""' <<<"$tree")
  if [ -z "$last" ]; then
    herdr-app do terminal.keep --terminal "$1" --place right >/dev/null || true
  else
    herdr-app do pane.focus --pane "$last" >/dev/null || true
    herdr-app do terminal.keep --terminal "$1" --place down >/dev/null || true
  fi
  herdr-app do pane.focus --pane "$me" >/dev/null || true
}

if [ "$agent" = 1 ]; then
  [ "$in_hc" = 1 ] || {
    echo "error: --agent needs an hc terminal (HC_TERMINAL_ID is empty)" >&2
    exit 3
  }
  [ $# -ge 1 ] || usage
  t=$(hc run --bg --json --name "$name" --cwd "$PWD" -- "$@" | jq -er '.address')
  show_pane "$t"
  echo "terminal=$t"
  exit 0
fi

[ $# -eq 1 ] || [ $# -eq 2 ] || usage
dir=$(CDPATH='' cd -- "$1" && pwd)
[ $# -eq 2 ] && printf '%s\n' "$2" >"$dir/cmd.sh"
[ -s "$dir/cmd.sh" ] || {
  echo "error: no COMMAND and no $dir/cmd.sh" >&2
  exit 2
}
rm -f "$dir/rc"

# run.sh = variable lines (quoted by printf %q) + a static body (quoted heredoc).
# cmd.sh runs as a child process, so `exit` in it or a bad cwd cannot skip the rc file.
{
  printf 'd=%q\ncwd=%q\n' "$dir" "$PWD"
  cat <<'EOF'
export d
(cd -- "$cwd" && bash -o pipefail "$d/cmd.sh")
rc=$?
echo "$rc" >"$d/rc"
exit "$rc"
EOF
} >"$dir/run.sh"

if [ "$in_hc" = 0 ]; then
  bash "$dir/run.sh" >"$dir/log.local" 2>&1 || true
  rc=$(cat "$dir/rc" 2>/dev/null || echo 1)
  echo "rc=$rc"
  exit "$rc"
fi

t=$(hc run --bg --json --no-notify --name "$name" --cwd "$PWD" -- bash "$dir/run.sh" | jq -er '.address')
show_pane "$t"
echo "terminal=$t"

[ "$wait" = 1 ] || exit 0

# hc wait checks in after its timeout; wait again until the terminal ends.
while :; do
  res=$(hc wait "$t" --json --timeout 600) || true
  [ "$(jq -r '.ended // false' <<<"$res" 2>/dev/null)" = true ] || continue
  [ "$(hc get "$t" --json 2>/dev/null | jq -r '.state // ""')" = finished ] && break
done
if [ ! -s "$dir/rc" ]; then
  echo "error: terminal $t ended before the command wrote $dir/rc" >&2
  echo "rc=1"
  exit 1
fi
rc=$(cat "$dir/rc")
echo "rc=$rc"
exit "$rc"
