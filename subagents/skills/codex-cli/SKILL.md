---
name: codex-cli
description: Run the Codex CLI (`codex exec`) non-interactively to delegate a coding, review, or analysis task to a separate model from the shell. Use whenever the user asks to invoke "codex".
---

Binary: resolve with `which codex` — it may be a wrapper shim. The `exec` subcommand is mandatory; bare `codex` opens a blocking TUI.

# Minimal command

```sh
codex exec "PROMPT" </dev/null
```

`</dev/null` forces stdin EOF — without it a non-TTY run waits on an open pipe. Drop it when piping context.

Stdin plus a prompt arg → appended as a `<stdin>` block. Stdin with `-` → becomes the prompt.

```sh
git diff | codex exec "Review this diff"
cat file.ts | codex exec -
```

Canonical capture — final message in a file, exit status from the run:

```sh
codex exec -C "$PWD" -s read-only -o /tmp/codex.out "PROMPT" </dev/null
status=$?    # 0 = success; non-zero = auth/sandbox/runtime failure
cat /tmp/codex.out
```

Stderr carries auth failures, sandbox denials, missing-binary errors — keep it. `2>/dev/null` only for known noise.

# Flags

- `-s read-only|workspace-write|danger-full-access` — sandbox policy
- `-C <DIR>` / `--add-dir <DIR>` — working root / extra writable dirs
- `-o, --output-last-message <FILE>` — final agent message, one message, no event stream
- `--json` — JSONL event stream on stdout; combines with `-o`
- `--output-schema <FILE>` — final answer constrained to a JSON Schema
- `-i, --image <FILE>` — attach screenshots
- `-p, --profile <NAME>` — layer `$CODEX_HOME/<NAME>.config.toml`
- `-c key=value` — single TOML override
- `--color never` — no ANSI in captured output
- `--ephemeral` — session not persisted
- `--skip-git-repo-check` — run outside a git repo
- `--dangerously-bypass-approvals-and-sandbox` (`--yolo`) — no sandbox, no prompts; explicit user consent only

Defaults: `exec` starts at `approval: never`, `sandbox: read-only`. Project trust does not change this, and no flag unblocks a run mid-flight. Edits need `-s workspace-write`.

`--search` goes before the subcommand: `codex --search exec "PROMPT"`.

Model and reasoning effort come from `~/.codex/config.toml` — leave both alone unless the user names one. Catalog with per-model effort levels: `codex debug models`. Effective values: the run header. A bogus `-m` silently degrades to fallback model metadata, exit code stays 0.

Review: `codex exec review` takes `--uncommitted`, `--base <BRANCH>`, `--commit <SHA>`. Top-level `codex review` has no `-o` and no `--json` — uncapturable.

```sh
codex exec review --base main -o /tmp/codex.out </dev/null
```

Follow-up turn: `codex exec resume --last "PROMPT"`, or `resume <SESSION_ID>`. `--ephemeral` kills resumability.

Everything else: `codex <subcmd> --help`.

# Long-running calls

The `Bash` foreground timeout — 120s default, 600s max — kills a typical codex run mid-work. Background it:

```sh
codex exec -s read-only -o /tmp/codex-<slug>.out "PROMPT" </dev/null >/tmp/codex-<slug>.log 2>&1
```

- `run_in_background: true` — one completion notification on exit.
- `Read` the `.out` file: the final message.
- `Read` the `.log` file on non-zero exit only: full transcript plus shim noise (`hook:` lines, `tokens used`).
- One `<slug>` per call — concurrent runs fan out. `TaskStop` cancels one.

Live progress: `Monitor` over `--json` through a selective filter, since each stdout line becomes a notification.

```sh
codex exec --json -o /tmp/codex.out "PROMPT" </dev/null 2>>/tmp/codex.log | jq -r --unbuffered '
  select(.type=="turn.failed" or .type=="error"
      or (.type=="item.started" and .item.type=="command_execution")
      or (.type=="item.completed" and (.item.type=="agent_message" or .item.type=="error")))
  | .item.command // .item.text // .item.message // tostring'
```

Stderr stays out of the pipe — non-JSON lines break `jq`.

Events: `thread.started`, `turn.started`, `turn.completed` (carries `usage`), `turn.failed`, `item.started|updated|completed` with `item.type` of `agent_message`, `command_execution`, `error`. Shim hook-trust warnings arrive as `item.type=="error"` — noise, not failure.
