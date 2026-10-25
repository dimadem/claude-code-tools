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
  // Absent until the first API response; timestamps in epoch seconds
  prompt_cache?: {
    warm: boolean;
    ttl: "5m" | "1h";
    expires_at: number | null;
    hit_ratio: number | null;
  };
  // Claude.ai Pro/Max only, absent for API-key auth; each window can be absent
  rate_limits?: {
    five_hour?: RateLimitWindow;
    seven_day?: RateLimitWindow;
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

// Claude Code blanks the status line when the script fails, so bad input
// must still give a line.
async function readStdinJson<T>(): Promise<T | null> {
  try {
    return (await Bun.stdin.json()) as T;
  } catch {
    return null;
  }
}

const data = (await readStdinJson<StatuslineInput>()) ?? ({} as StatuslineInput);

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

const clampPct = (pct: number): number => Math.min(100, Math.max(0, pct));

function formatTokens(n: number): string {
  const k = Math.round(n / 1000);
  if (k >= 1000) return `${+(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1000) return `${k}k`;
  return String(n);
}

function formatResetTime(secondsUntil: number): string {
  if (secondsUntil < 60) return "<1m";
  const totalMinutes = Math.floor(secondsUntil / 60);
  const days = Math.floor(totalMinutes / 1440);
  const hours = Math.floor((totalMinutes % 1440) / 60);
  const minutes = totalMinutes % 60;
  if (days > 0) return `${days}d ${hours}h`;
  return `${hours}h ${minutes}m`;
}

// ── Parse ─────────────────────────────────────────────────────────────────────

const modelName = data.model?.display_name ?? "?";
const effortLevel = data.effort?.level;

const ctxPct = clampPct(Math.floor(data.context_window?.used_percentage ?? 0));

const usage = data.context_window?.current_usage;
const ctxTokens =
  (usage?.input_tokens ?? 0) +
  (usage?.cache_creation_input_tokens ?? 0) +
  (usage?.cache_read_input_tokens ?? 0);

const now = Math.floor(Date.now() / 1000);
const FIVE_HOURS = 5 * 3600;
const SEVEN_DAYS = 7 * 86400;

// ── Segments ──────────────────────────────────────────────────────────────────

interface Layout {
  barWidth: number; // 0 = no bar
  showReset: boolean;
  show7d: boolean;
  showEffort: boolean;
  showCache: boolean;
}

function modelBlock(layout: Layout): string {
  return effortLevel && layout.showEffort
    ? `${TERRACOTTA}${modelName} ${DIM}[${effortLevel}]${RESET}`
    : `${TERRACOTTA}${modelName}${RESET}`;
}

function ctxBlock(layout: Layout): string {
  const filled = Math.floor((ctxPct * layout.barWidth) / 100);
  let bar = "";
  for (let i = 0; i < filled; i++) {
    const pos = (i * 100) / (layout.barWidth - 1);
    bar += gradientColor(pos) + "█";
  }
  bar += RESET;
  bar += "░".repeat(layout.barWidth - filled);

  const tokenColor = usage == null ? DIM : gradientColor(ctxPct);
  const tokens = `${tokenColor}${formatTokens(ctxTokens)}${RESET}`;
  return layout.barWidth > 0 ? `${bar} ${tokens}` : tokens;
}

// Over pace: more of the limit is used than of the window has passed, so at
// this rate the limit runs out before the reset. Below 10% it is only noise.
function overPace(pct: number, secondsLeft: number, windowSeconds: number): boolean {
  const elapsedPct = (1 - secondsLeft / windowSeconds) * 100;
  return pct >= 10 && pct > elapsedPct;
}

function formatWindow(
  label: string,
  win: RateLimitWindow | undefined,
  windowSeconds: number,
  emptyPlaceholder: string,
  layout: Layout,
): string {
  const pct = clampPct(Math.round(win?.used_percentage ?? 0));
  if (win?.resets_at == null) {
    const reset = layout.showReset ? ` ⋯ ${emptyPlaceholder}` : "";
    return `${DIM}${label} ${pct}%${reset}${RESET}`;
  }
  const delta = Math.max(0, win.resets_at - now);
  const fast = overPace(pct, delta, windowSeconds);
  const arrow = `${gradientColor(100)}▲${RESET}`;
  const head = `${label} ${gradientColor(pct)}${pct}%${RESET}`;
  if (!layout.showReset) return fast ? `${head} ${arrow}` : head;
  const mark = fast ? arrow : `${DIM}⋯${RESET}`;
  return `${head} ${mark} ${DIM}${formatResetTime(delta)}${RESET}`;
}

// Time until the cached prompt goes cold. The next request after that
// writes the full context to the cache again.
function cacheBlock(): string {
  const cache = data.prompt_cache;
  if (cache == null) return `${DIM}cache —m${RESET}`;
  const left = cache.expires_at == null ? 0 : cache.expires_at - now;
  if (!cache.warm || left <= 0) return `${DIM}cache cold${RESET}`;
  const ttl = cache.ttl === "1h" ? 3600 : 300;
  const usedPct = clampPct(100 - (left / ttl) * 100);
  const time = left < 60 ? "<1m" : `${Math.floor(left / 60)}m`;
  return `cache ${gradientColor(usedPct)}${time}${RESET}`;
}

function render(layout: Layout): string {
  const parts = [modelBlock(layout), ctxBlock(layout)];
  if (layout.showCache) parts.push(cacheBlock());
  parts.push(formatWindow("5h", data.rate_limits?.five_hour, FIVE_HOURS, "—h —m", layout));
  if (layout.show7d) {
    parts.push(formatWindow("7d", data.rate_limits?.seven_day, SEVEN_DAYS, "—d —h", layout));
  }
  return parts.join(" | ");
}

// ── Width ─────────────────────────────────────────────────────────────────────

// From full to short. The first layout that fits the terminal is used.
const LAYOUTS: Layout[] = [
  { barWidth: 20, showReset: true, show7d: true, showEffort: true, showCache: true },
  { barWidth: 10, showReset: true, show7d: true, showEffort: true, showCache: true },
  { barWidth: 10, showReset: false, show7d: true, showEffort: true, showCache: true },
  { barWidth: 0, showReset: false, show7d: true, showEffort: true, showCache: true },
  { barWidth: 0, showReset: false, show7d: false, showEffort: true, showCache: true },
  { barWidth: 0, showReset: false, show7d: false, showEffort: true, showCache: false },
  { barWidth: 0, showReset: false, show7d: false, showEffort: false, showCache: false },
];

// Claude Code sets COLUMNS for the script; room is left for the row indent.
const MARGIN = 2;
const columns = Number(process.env.COLUMNS) || Infinity;

function fit(): string {
  for (const layout of LAYOUTS) {
    const line = render(layout);
    if (Bun.stringWidth(line) <= columns - MARGIN) return line;
  }
  return render(LAYOUTS[LAYOUTS.length - 1]);
}

// ── Output ────────────────────────────────────────────────────────────────────

let out: string;
try {
  out = fit();
} catch {
  out = `${TERRACOTTA}${modelName}${RESET}`;
}
await Bun.write(Bun.stdout, out);

export {};
