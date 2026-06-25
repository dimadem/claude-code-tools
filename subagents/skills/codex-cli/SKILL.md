---
name: codex-cli
description: Run the Codex CLI (`codex exec`) non-interactively to delegate a coding, review, or analysis task to a separate model from the shell. Use whenever the user asks to invoke "codex".
---

Binary: `/opt/homebrew/bin/codex` (verify with `which codex`). Always use the `exec` subcommand — bare `codex` opens an interactive TUI that blocks.

# Minimal command

```sh
codex exec "PROMPT" </dev/null
```

Pipe stdin for context — with a prompt arg it's appended as a `<stdin>` block; with `-` it *becomes* the prompt:

```sh
git diff | codex exec "Review this diff"   # appended as <stdin>
cat file.ts | codex exec -                 # stdin is the prompt
```

Canonical capture for delegated work — final message in a file, exit status from the run:

```sh
codex exec -C "$PWD" -o /tmp/codex.out "PROMPT" </dev/null
status=$?    # 0 = success; non-zero = auth/sandbox/runtime failure
cat /tmp/codex.out
```

`</dev/null` forces stdin EOF so a non-TTY run won't wait on an open pipe. Append it unless you're piping context; unneeded from a real TTY.

Keep stderr by default — auth failures, sandbox denials, and missing-binary errors all surface there. Append `2>/dev/null` only when stderr is known noise.

# Pick the right knobs

Common `exec` flags:

- `-m <MODEL>` — explicit model
- `-c key=value` — TOML config override (e.g. `-c 'model_reasoning_effort="high"'`)
- `-s read-only|workspace-write|danger-full-access` — sandbox policy
- `-C <DIR>` / `--add-dir <DIR>` — working dir / extra writable dirs
- `-o, --output-last-message <FILE>` — write the final agent message to a file (single message, not the event stream)
- `--json` — JSONL progress stream on stdout; combine with `-o` to also save the final message
- `--output-schema <FILE>` — constrain final answer to a JSON Schema
- `--color never` — strip ANSI color for clean captured output
- `--ephemeral` — don't persist the session
- `--skip-git-repo-check` — run outside a git repo
- `--dangerously-bypass-approvals-and-sandbox` — skip prompts AND sandboxing; only with explicit user consent

Don't rely on the sandbox default — it can resolve to `read-only` even in a trusted project. Pass `-s` explicitly: `read-only` to review, `workspace-write` to edit.

`--search` (web search) isn't an `exec` flag — put it before the subcommand: `codex --search exec "PROMPT"`.

Review delegation: prefer `codex exec review` — takes `--uncommitted`, `--base <BRANCH>`, or `--commit <SHA>`, plus capture flags:

```sh
codex exec review --base main -o /tmp/codex.out </dev/null
```

Other subcommands (`apply`, `resume`, `mcp`, `cloud`, `doctor`, `sandbox`): `codex <subcmd> --help`.

# Long-running calls

A codex run can take minutes (more with high reasoning). Don't block the chat:

- **Default — fire and forget**: invoke through `Bash` with `run_in_background: true`. The harness sends one completion notification when the process exits; read the output with `Read` afterwards. Route big final messages to a file with `-o /tmp/codex.out`.
- **Live progress through `Monitor`**: run with `--json` and pipe through a *selective* filter — every stdout line becomes a notification, so emit only lifecycle/tool-call/error events, never token deltas. Use unbuffered tools (`grep --line-buffered`, `jq --unbuffered`). Sanity-check event shape first: `codex exec --json "ping" </dev/null | head`.

Don't hard-code a model or reasoning level unless the user asks — defaults from `config.toml` already apply.
