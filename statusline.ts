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
  return n >= 1000 ? `${(n / 1000).toFixed(1)}k` : String(n);
}

// ── Parse ─────────────────────────────────────────────────────────────────────

const modelName: string = data.model?.display_name ?? "?";

const ctxPct: number = Math.floor(data.context_window?.used_percentage ?? 0);

const usage = data.context_window?.current_usage;
const ctxTokens: number =
  (usage?.input_tokens ?? 0) +
  (usage?.cache_creation_input_tokens ?? 0) +
  (usage?.cache_read_input_tokens ?? 0);

const rl5: number = Math.round(data.rate_limits?.five_hour?.used_percentage ?? 0);
const rl7: number = Math.round(data.rate_limits?.seven_day?.used_percentage ?? 0);

// ── Context bar ───────────────────────────────────────────────────────────────

const BAR_WIDTH = 20;
const filled = Math.floor((ctxPct * BAR_WIDTH) / 100);

let bar = "";
for (let i = 0; i < filled; i++) {
  const pos = BAR_WIDTH > 1 ? (i * 100) / (BAR_WIDTH - 1) : 0;
  bar += gradientColor(pos) + "█";
}
bar += RESET;
bar += "░".repeat(BAR_WIDTH - filled);

const tokenColor = usage === null ? DIM : gradientColor(ctxPct);
const tokenLabel = ` ${tokenColor}${formatTokens(ctxTokens)}${RESET}`;
const ctxBlock = ` | [${bar}]${tokenLabel}`;

// ── Rate limits ───────────────────────────────────────────────────────────────

const hasRateLimits = data.rate_limits != null;
const rate = hasRateLimits
  ? `5h: ${rl5}% | 7d: ${rl7}%`
  : `${DIM}5h: ${rl5}% | 7d: ${rl7}%${RESET}`;

// ── Output ────────────────────────────────────────────────────────────────────

process.stdout.write(`${TERRACOTTA}${modelName}${RESET}${ctxBlock} | ${rate}`);
