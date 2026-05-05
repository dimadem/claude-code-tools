#!/usr/bin/env bun
import { mkdirSync, appendFileSync } from "fs";

const input = await new Response(Bun.stdin.stream()).text();
if (!input.trim()) process.exit(0);

const data = JSON.parse(input);
const sessionId = data.session_id ?? "unknown";
const dir = process.env.CLAUDE_TRACING_DIR ?? `${process.env.HOME}/.claude/tracing`;

mkdirSync(dir, { recursive: true });

appendFileSync(
  `${dir}/${sessionId}.jsonl`,
  JSON.stringify({ timestamp: new Date().toISOString(), ...data }) + "\n",
);
