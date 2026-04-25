#!/bin/bash

# context_window: {
#   total_input_tokens:  5774,       // number — cumulative input tokens for the session
#   total_output_tokens: 18143,      // number — cumulative output tokens for the session
#   context_window_size: 200000,     // number — max context size for the model
#   current_usage: {
#     input_tokens:                3,      // number — non-cached input tokens in last call
#     output_tokens:               8,      // number — output tokens in last call
#     cache_creation_input_tokens: 258,    // number — tokens written to cache
#     cache_read_input_tokens:     53533   // number — tokens read from cache
#   },
#   used_percentage:      27,        // number — (sum of current_usage inputs) / context_window_size * 100
#   remaining_percentage: 73         // number — 100 - used_percentage
# }

INPUT=$(cat)

RESET=$'\033[0m'
TERRACOTTA=$'\033[38;2;207;108;79m'

# ── Gradient color: green → yellow → red by percent ──────────────────────────

gradient_color() {
  local pct=$1
  printf '\033[38;2;%d;%d;0m' "$(( pct * 255 / 100 ))" "$(( (100 - pct) * 200 / 100 ))"
}

# ── Parse ─────────────────────────────────────────────────────────────────────

IFS=$'\t' read -r MODEL_NAME CTX_PCT CTX_TOKENS RL5 RL7 < <(echo "$INPUT" | jq -r '
  def round_pct: . + 0.5 | floor | tostring;
  def ctx_tokens:
    (.context_window.current_usage.input_tokens               // 0)
    + (.context_window.current_usage.cache_creation_input_tokens // 0)
    + (.context_window.current_usage.cache_read_input_tokens  // 0)
    | if . == 0 then "" else tostring end;
  [
    (.model.display_name                         // "?"),
    (.context_window.used_percentage             // 0 | floor),
    ctx_tokens,
    (.rate_limits.five_hour.used_percentage      // "" | if . == "" then "" else round_pct end),
    (.rate_limits.seven_day.used_percentage      // "" | if . == "" then "" else round_pct end)
  ] | @tsv
')

# ── Context bar ───────────────────────────────────────────────────────────────

BAR_WIDTH=20
BAR_FILLED=$(( CTX_PCT * BAR_WIDTH / 100 ))
BAR=""
for (( i = 0; i < BAR_FILLED; i++ )); do
  BAR+="$(gradient_color "$(( i * 100 / (BAR_WIDTH - 1) ))")█"
done
BAR+="${RESET}"
for (( i = BAR_FILLED; i < BAR_WIDTH; i++ )); do BAR+="░"; done

# ── Token label ───────────────────────────────────────────────────────────────

TOKEN_LABEL=""
if [ -n "$CTX_TOKENS" ]; then
  fmt=$(awk -v v="$CTX_TOKENS" 'BEGIN { printf (v >= 1000) ? "%.1fk" : "%d", v / (v >= 1000 ? 1000 : 1) }')
  TOKEN_LABEL=" $(gradient_color "$CTX_PCT")${fmt}${RESET}"
fi

# ── Rate limits ───────────────────────────────────────────────────────────────

RATE=""
[ -n "$RL5" ] && RATE="5h: ${RL5}%"
[ -n "$RL7" ] && RATE="${RATE:+$RATE | }7d: ${RL7}%"

# ── Output ────────────────────────────────────────────────────────────────────

printf "%s" "${TERRACOTTA}${MODEL_NAME}${RESET} | [${BAR}]${TOKEN_LABEL}${RATE:+ | $RATE}"
