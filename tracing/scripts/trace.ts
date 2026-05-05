#!/usr/bin/env bun
/**
 * Claude Code session tracer
 * ──────────────────────────
 *
 * Что делает:
 *   Запускается из hooks.json на каждое hook-событие Claude Code
 *   (SessionStart, UserPromptSubmit, PreToolUse, PostToolUse, Stop, ...).
 *   Кладёт весь payload события одной строкой JSONL в общий лог-файл сессии.
 *
 * Зачем:
 *   Полный read-only лог сессии для дебага воркфлоу — что вводил юзер,
 *   что вызывал агент, что нашли тулзы, что отвечал Клод (Stop.message),
 *   ошибки, subagent-активность, permissions и т.д.
 *
 * Куда пишет:
 *   $CLAUDE_TRACING_DIR (если задана) или ~/.claude/tracing/<session_id>.jsonl
 *
 * Полный список hook-событий и схема payload:
 *   https://code.claude.com/docs/en/hooks
 *
 * Дизайн-принципы:
 *   1. Никогда не падать. Hook не должен ломать сессию Клода → try/catch + exit 0.
 *   2. Сохраняем весь payload (spread `...data`), без фильтрации полей —
 *      чтобы трейс автоматически расширялся при апдейтах Claude Code.
 *   3. Async I/O (node:fs/promises), чтобы не блокировать event loop.
 */
import { appendFile, mkdir } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";

try {
  // Bun.stdin — это BunFile (типы: bun-types/bun.d.ts:4508).
  // .text() читает stdin до EOF одним вызовом — для hook payload (мелкий JSON) этого достаточно.
  const input = await Bun.stdin.text();

  // Пустой stdin — нечего логировать. Просто выходим.
  if (!input.trim()) process.exit(0);

  // Все hook-payload'ы — JSON-объекты, минимум с полями session_id, hook_event_name, cwd.
  // Тип Record<string, unknown>: схемы у Claude Code нет, поля могут добавляться.
  const data = JSON.parse(input) as Record<string, unknown>;

  // session_id определяет имя файла лога. Fallback "unknown" — на случай corrupt payload,
  // чтобы запись всё-таки попала на диск (а не молча терялась).
  const sessionId =
    typeof data.session_id === "string" ? data.session_id : "unknown";

  // Куда писать. Bun.env — snapshot env vars на момент старта процесса
  // (типы: bun-types/bun.d.ts:518). Для hook-скрипта эквивалентно process.env.
  const dir =
    Bun.env.CLAUDE_TRACING_DIR ?? join(homedir(), ".claude", "tracing");

  // recursive: true — не падаем если папка уже есть.
  await mkdir(dir, { recursive: true });

  // Кладём timestamp первым полем — удобно для grep/jq и сортировки строк.
  const entry = { timestamp: new Date().toISOString(), ...data };

  // appendFile (node:fs/promises) — единственный async-append путь.
  // Bun.write() / BunFile.write() всегда truncate, append-режима у них нет.
  await appendFile(
    join(dir, `${sessionId}.jsonl`),
    `${JSON.stringify(entry)}\n`,
  );
} catch {
  // Любая ошибка — сломанный JSON, нет прав на папку, переполненный диск —
  // тихо exit 0. Hook не должен ронять пользовательскую сессию ни при каких условиях.
  process.exit(0);
}
