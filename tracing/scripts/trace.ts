#!/usr/bin/env bun
import { appendFile, mkdir } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";

try {
  const input = await Bun.stdin.text();
  if (!input.trim()) process.exit(0);

  const data = JSON.parse(input) as Record<string, unknown>;
  const sessionId =
    typeof data.session_id === "string" ? data.session_id : "unknown";

  const cwd = typeof data.cwd === "string" ? data.cwd : null;
  const dir =
    Bun.env.CLAUDE_TRACING_DIR ??
    (cwd ? join(cwd, "tracing") : join(homedir(), ".claude", "tracing"));

  await mkdir(dir, { recursive: true });

  const entry = { timestamp: new Date().toISOString(), ...data };
  await appendFile(join(dir, `${sessionId}.jsonl`), `${JSON.stringify(entry)}\n`);
} catch {
  process.exit(0);
}
