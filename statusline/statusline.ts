#!/usr/bin/env bun

interface RateLimitWindow {
  used_percentage: number;
  resets_at: number;
}

interface StatuslineInput {
  session_id: string;
  transcript_path: string;
  cwd: string;
  session_name?: string;
  prompt_id?: string;
  effort?: { level: "low" | "medium" | "high" | "xhigh" | "max" };
  model: { id: string; display_name: string };
  workspace: {
    current_dir: string;
    project_dir: string;
    added_dirs: string[];
    git_worktree?: string;
    repo?: { host: string; owner: string; name: string };
  };
  version: string;
  output_style: { name: string };
  cost: {
    total_cost_usd: number;
    total_duration_ms: number;
    total_api_duration_ms: number;
    total_lines_added: number;
    total_lines_removed: number;
  };
  context_window: {
    total_input_tokens: number;
    total_output_tokens: number;
    context_window_size: number;
    used_percentage: number | null;
    remaining_percentage: number | null;
    current_usage: {
      input_tokens: number;
      output_tokens: number;
      cache_creation_input_tokens: number;
      cache_read_input_tokens: number;
    } | null;
  };
  exceeds_200k_tokens: boolean;
  fast_mode: boolean;
  thinking: { enabled: boolean };
  // Claude.ai Pro/Max only, absent for API-key auth
  rate_limits?: {
    five_hour: RateLimitWindow;
    seven_day: RateLimitWindow;
  };
  vim?: { mode: "NORMAL" | "INSERT" | "VISUAL" | "VISUAL LINE" };
  agent?: { name: string };
  pr?: {
    number: number;
    url: string;
    review_state?: "approved" | "pending" | "changes_requested" | "draft";
  };
  worktree?: {
    name: string;
    path: string;
    branch?: string;
    original_cwd: string;
    original_branch?: string;
  };
}

async function readStdinJson<T>(): Promise<T> {
  return (await Bun.stdin.json()) as T;
}

const data = await readStdinJson<StatuslineInput>();

// ── Helpers ───────────────────────────────────────────────────────────────────

const ansi = (r: number, g: number, b: number): string => Bun.color({ r, g, b }, "ansi-16m")!;
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
const effortLevel = data.effort?.level;
const modelLabel = effortLevel
  ? `${modelName} ${DIM}[${effortLevel}]${RESET}`
  : `${modelName}${RESET}`;

const ctxPct = Math.floor(data.context_window?.used_percentage ?? 0);

const usage = data.context_window?.current_usage;
const ctxTokens =
  (usage?.input_tokens ?? 0) +
  (usage?.cache_creation_input_tokens ?? 0) +
  (usage?.cache_read_input_tokens ?? 0);

const rl5 = Math.round(data.rate_limits?.five_hour.used_percentage ?? 0);
const rl7 = Math.round(data.rate_limits?.seven_day.used_percentage ?? 0);
const reset5 = data.rate_limits?.five_hour.resets_at;
const reset7 = data.rate_limits?.seven_day.resets_at;

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
    return `${DIM}${label} ${pct}% ⋯ ${emptyPlaceholder}${RESET}`;
  }
  const delta = Math.max(0, resetsAt - Math.floor(Date.now() / 1000));
  return `${label} ${gradientColor(pct)}${pct}%${RESET} ${DIM}⋯ ${formatResetTime(delta)}${RESET}`;
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
const ctxBlock = ` | ${bar}${tokenLabel}`;

// ── Rate limits ───────────────────────────────────────────────────────────────

const rate = `${formatWindow("5h", rl5, reset5, "—h —m")} | ${formatWindow("7d", rl7, reset7, "—d —h")}`;

// ── Output ────────────────────────────────────────────────────────────────────

await Bun.write(Bun.stdout, `${TERRACOTTA}${modelLabel}${ctxBlock} | ${rate}`);

export {};
