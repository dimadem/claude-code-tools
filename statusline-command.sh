#!/bin/bash
# Claude Code statusline
# Output: Model | [gradient bar] 19.6k | 5h: X% | 7d: X%

INPUT=$(cat)

RESET=$'\033[0m'
TERRACOTTA=$'\033[38;2;207;108;79m'  # #CF6C4F — фирменный «терракотовый» Anthropic

# ANSI 24-bit foreground на градиенте зелёный → жёлтый → красный, аргумент — процент 0..100
gradient_color() {
  local pct=$1
  local r=$(( pct * 255 / 100 ))
  local g=$(( (100 - pct) * 200 / 100 ))
  printf '\033[38;2;%d;%d;0m' "$r" "$g"
}

# ── Parse (single jq call, tab-separated so spaces in model name are safe) ────

IFS=$'\t' read -r MODEL_NAME CTX_PCT CTX_TOKENS RL5 RL7 < <(echo "$INPUT" | jq -r '
  [
    (.model.display_name                              // "?"),
    (.context_window.used_percentage                  // 0 | floor),
    (.context_window.total_input_tokens               // ""),
    (.rate_limits.five_hour.used_percentage           // "" | if . == "" then "" else (. + 0.5 | floor | tostring) end),
    (.rate_limits.seven_day.used_percentage           // "" | if . == "" then "" else (. + 0.5 | floor | tostring) end)
  ] | @tsv
')

# ── Context bar (20 chars, green → yellow → red gradient) ─────────────────────

BAR_WIDTH=20
BAR_FILLED=$(( CTX_PCT * BAR_WIDTH / 100 ))
BAR=""

for (( i = 0; i < BAR_FILLED; i++ )); do
  pos=$(( i * 100 / (BAR_WIDTH - 1) ))
  BAR+="$(gradient_color "$pos")█"
done
BAR+="${RESET}"
for (( i = BAR_FILLED; i < BAR_WIDTH; i++ )); do BAR+="░"; done

# ── Token label (e.g. 19.6k), same gradient color as bar fill level ───────────

TOKEN_LABEL=""
if [ -n "$CTX_TOKENS" ]; then
  fmt=$(awk -v v="$CTX_TOKENS" 'BEGIN { if (v >= 1000) printf "%.1fk", v/1000; else printf "%d", v }')
  TOKEN_LABEL=" $(gradient_color "$CTX_PCT")${fmt}${RESET}"
fi

# ── Rate limits ───────────────────────────────────────────────────────────────

RATE=""
[ -n "$RL5" ] && RATE="5h: ${RL5}%"
[ -n "$RL7" ] && RATE="${RATE:+$RATE | }7d: ${RL7}%"

# ── Output ────────────────────────────────────────────────────────────────────

OUTPUT="${TERRACOTTA}${MODEL_NAME}${RESET} | [${BAR}]${TOKEN_LABEL}${RATE:+ | $RATE}"
printf "%s" "$OUTPUT"
