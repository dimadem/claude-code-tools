#!/usr/bin/env bun

const input = await new Response(Bun.stdin.stream()).text();
const data = JSON.parse(input);

// ── Helpers ───────────────────────────────────────────────────────────────────

const ansi = (r: number, g: number, b: number) => `\x1b[38;2;${r};${g};${b}m`;
const RESET = "\x1b[0m";
const TERRACOTTA = ansi(207, 108, 79);
const DIM = ansi(100, 100, 100);

// green → yellow → red
function gradientColor(pct: number): string {
  const r = Math.round((pct / 100) * 255);
  const g = Math.round(((100 - pct) / 100) * 200);
  return ansi(r, g, 0);
}

function formatTokens(n: number): string {
  if (n >= 1000) return `${(n / 1000).toFixed(1)}k`;
  return String(n);
}

// ── Parse ─────────────────────────────────────────────────────────────────────

const modelName = data.model?.display_name ?? "?";

const ctxPct = Math.floor(data.context_window?.used_percentage ?? 0);

const usage = data.context_window?.current_usage;
const ctxTokens =
  (usage?.input_tokens ?? 0) +
  (usage?.cache_creation_input_tokens ?? 0) +
  (usage?.cache_read_input_tokens ?? 0);

const rl5 = Math.round(data.rate_limits?.five_hour?.used_percentage ?? 0);
const rl7 = Math.round(data.rate_limits?.seven_day?.used_percentage ?? 0);
const reset5: number | undefined = data.rate_limits?.five_hour?.resets_at;
const reset7: number | undefined = data.rate_limits?.seven_day?.resets_at;

function formatResetTime(secondsUntil: number): string {
  if (secondsUntil < 60) return "<1m";
  const totalMinutes = Math.floor(secondsUntil / 60);
  const days = Math.floor(totalMinutes / 1440);
  const hours = Math.floor((totalMinutes % 1440) / 60);
  const minutes = totalMinutes % 60;
  if (days > 0) return `${days}d ${hours}h`;
  return `${hours}h ${minutes}m`;
}

function formatWindow(
  label: string,
  pct: number,
  resetsAt: number | undefined,
  emptyPlaceholder: string,
): string {
  if (resetsAt == null) {
    return `${DIM}⌜${label}⌟ ${pct}% ⋯ ${emptyPlaceholder}${RESET}`;
  }
  const delta = Math.max(0, resetsAt - Math.floor(Date.now() / 1000));
  return `⌜${label}⌟ ${gradientColor(pct)}${pct}%${RESET} ${DIM}⋯ ${formatResetTime(delta)}${RESET}`;
}

// ── Context bar ───────────────────────────────────────────────────────────────

const BAR_WIDTH = 20;
const filled = Math.floor((ctxPct * BAR_WIDTH) / 100);

let bar = "";
for (let i = 0; i < filled; i++) {
  const pos = (i * 100) / (BAR_WIDTH - 1);
  bar += gradientColor(pos) + "█";
}
bar += RESET;
bar += "░".repeat(BAR_WIDTH - filled);

let tokenColor: string;
if (usage == null) {
  tokenColor = DIM;
} else {
  tokenColor = gradientColor(ctxPct);
}
const tokenLabel = ` ${tokenColor}${formatTokens(ctxTokens)}${RESET}`;
const ctxBlock = ` | [${bar}]${tokenLabel}`;

// ── Rate limits ───────────────────────────────────────────────────────────────

const rate = `${formatWindow("5h", rl5, reset5, "—h —m")} | ${formatWindow("7d", rl7, reset7, "—d —h")}`;

// ── Output ────────────────────────────────────────────────────────────────────

process.stdout.write(`${TERRACOTTA}${modelName}${RESET}${ctxBlock} | ${rate}`);

export {};
