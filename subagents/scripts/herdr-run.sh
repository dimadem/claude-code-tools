#!/usr/bin/env bash
# Run a delegated CLI command, in a new Herdr pane when possible.
#
# usage: herdr-run.sh [--label TEXT] [--no-wait] DIR [COMMAND]
#        herdr-run.sh --pane-only [--label TEXT]
#   DIR          run directory (create it with mktemp -d); holds cmd.sh, run.sh and rc
#   COMMAND      shell command; if given, it replaces DIR/cmd.sh
#                cmd.sh runs in bash with pipefail, in $PWD, with $d exported as DIR
#   --pane-only  make an empty pane by the layout rule and print its ID (Herdr only)
#
# Layout rule: the first pane goes to the right of the caller pane; later panes
# stack down in that right column. The caller pane keeps its full height.
# Inside Herdr: prints pane=<id>, then rc=<code>. Outside Herdr: runs the command
# here, without a pane, and prints rc=<code>. The exit status is the command's.
set -euo pipefail

usage() {
  echo "usage: herdr-run.sh [--label TEXT] [--no-wait] DIR [COMMAND] | --pane-only [--label TEXT]" >&2
  exit 2
}

label="subagent"
wait=1
pane_only=0
while [ $# -gt 0 ]; do
  case "$1" in
    --label) [ $# -ge 2 ] || usage; label=$2; shift 2 ;;
    --no-wait) wait=0; shift ;;
    --pane-only) pane_only=1; shift ;;
    --) shift; break ;;
    -*) usage ;;
    *) break ;;
  esac
done

in_herdr=0
if [ "${HERDR_ENV:-}" = 1 ]; then
  [ -n "${HERDR_PANE_ID:-}" ] || { echo "error: HERDR_ENV is 1, but HERDR_PANE_ID is empty" >&2; exit 3; }
  in_herdr=1
fi

# errexit does not apply inside $(...) in bash 3.2, so each step returns on failure.
new_pane() {
  local target
  target=$(herdr pane layout --current | jq -er --arg p "$HERDR_PANE_ID" '
    .result.layout.panes as $ps
    | first($ps[] | select(.pane_id == $p) | .rect) as $me
    | [$ps[] | select(.rect.x >= $me.x + $me.width)] as $right
    | if ($right | length) == 0 then "right " + $p
      else ($right | map(.rect.x) | min) as $cx
        | [$right[] | select(.rect.x == $cx)] | max_by(.rect.y) | "down " + .pane_id
      end') || return
  herdr pane split "${target#* }" --direction "${target%% *}" --cwd "$PWD" --no-focus \
    | jq -er '.result.pane.pane_id'
}

if [ "$pane_only" = 1 ]; then
  [ "$in_herdr" = 1 ] || { echo "error: --pane-only needs Herdr (HERDR_ENV is not 1)" >&2; exit 3; }
  [ $# -eq 0 ] || usage
  pane=$(new_pane)
  herdr pane rename "$pane" "$label" >/dev/null
  echo "pane=$pane"
  exit 0
fi

[ $# -eq 1 ] || [ $# -eq 2 ] || usage
dir=$(CDPATH='' cd -- "$1" && pwd)
[ $# -eq 2 ] && printf '%s\n' "$2" >"$dir/cmd.sh"
[ -s "$dir/cmd.sh" ] || { echo "error: no COMMAND and no $dir/cmd.sh" >&2; exit 2; }
rm -f "$dir/rc"

# A random marker per run, so command output does not match it by accident.
token="$$_${RANDOM}_${RANDOM}"

# run.sh = variable lines (quoted by printf %q) + a static body (quoted heredoc).
# cmd.sh runs as a child process, so `exit` in it or a bad cwd cannot skip the rc file.
{
  printf 'd=%q\ncwd=%q\nlabel=%q\nin_herdr=%q\ntoken=%q\n' "$dir" "$PWD" "$label" "$in_herdr" "$token"
  cat <<'EOF'
export d
(cd -- "$cwd" && bash -o pipefail "$d/cmd.sh")
rc=$?
echo "$rc" >"$d/rc"
if [ "$in_herdr" = 1 ]; then
  herdr notification show "$label" --body "exit $rc" --sound done >/dev/null 2>&1 || true
fi
printf '\n__SUBAGENT_DONE_%s rc=%d\n' "$token" "$rc"
exit "$rc"
EOF
} >"$dir/run.sh"

if [ "$in_herdr" = 0 ]; then
  bash "$dir/run.sh" >"$dir/log.local" 2>&1 || true
  rc=$(cat "$dir/rc" 2>/dev/null || echo 1)
  echo "rc=$rc"
  exit "$rc"
fi

pane=$(new_pane)
herdr pane rename "$pane" "$label" >/dev/null
# printf %q in bash 3.2 can make bad UTF-8 for non-ASCII paths; the C locale avoids it.
run_line=$(LC_ALL=C; printf 'bash %q' "$dir/run.sh")
herdr pane run "$pane" "$run_line" >/dev/null
echo "pane=$pane"

[ "$wait" = 1 ] || exit 0

wait_rc=0
herdr pane wait-output "$pane" --regex "^__SUBAGENT_DONE_${token} rc=[0-9]+\$" >/dev/null || wait_rc=$?
if [ ! -s "$dir/rc" ]; then
  echo "error: wait-output stopped with code $wait_rc before the command wrote $dir/rc" >&2
  echo "error: the pane can be closed, or the command can still run in pane $pane" >&2
  echo "rc=1"
  exit 1
fi
rc=$(cat "$dir/rc")
echo "rc=$rc"
exit "$rc"
