---
name: codex-cli
description: Run the Codex CLI (`codex exec`) non-interactively to delegate a coding, review, or analysis task to a separate model from the shell. Use whenever the user asks to invoke "codex".
---

Binary: `/opt/homebrew/bin/codex` (verify with `which codex`). Always use the `exec` subcommand — bare `codex` opens an interactive TUI that blocks.

# Minimal command

```sh
codex exec "PROMPT"
```

Pipe stdin to provide context (stdin is appended as a `<stdin>` block after the prompt):

```sh
git diff | codex exec "Review this diff"
cat file.ts | codex exec -
```

Canonical capture for delegated work — final message in a file, exit status from the run:

```sh
codex exec -C "$PWD" -o /tmp/codex.out "PROMPT"
status=$?    # 0 = success; non-zero = auth/sandbox/runtime failure
cat /tmp/codex.out
```

Keep stderr by default — auth failures, sandbox denials, and missing-binary errors all surface there. Append `2>/dev/null` only when stderr is known noise.

# Pick the right knobs

Common `exec` flags:

- `-m <MODEL>` — explicit model
- `-c key=value` — TOML config override (e.g. `-c 'model_reasoning_effort="high"'`)
- `-s read-only|workspace-write|danger-full-access` — sandbox policy
- `-C <DIR>` / `--add-dir <DIR>` — working dir / extra writable dirs
- `-o, --output-last-message <FILE>` — write the final agent message to a file (single message, not the event stream)
- `--json` — JSONL event stream on stdout (use *instead of* `-o` when progress matters)
- `--output-schema <FILE>` — constrain final answer to a JSON Schema
- `--ephemeral` — don't persist the session
- `--skip-git-repo-check` — run outside a git repo
- `--dangerously-bypass-approvals-and-sandbox` — skip prompts AND sandboxing; only with explicit user consent

Other subcommands (`review`, `apply`, `resume`, `mcp`, `cloud`, `doctor`, `sandbox`): `codex <subcmd> --help`.

# Long-running calls

A codex run can take minutes (more with high reasoning). Don't block the chat:

- **Default — fire and forget**: invoke through `Bash` with `run_in_background: true`. The harness sends one completion notification when the process exits; read the output with `Read` afterwards. Route big final messages to a file with `-o /tmp/codex.out`.
- **Live progress through `Monitor`**: run with `--json` and pipe through a *selective* filter — every stdout line becomes a notification, so emit only lifecycle/tool-call/error events, never token deltas. Use unbuffered tools (`grep --line-buffered`, `jq --unbuffered`). Sanity-check event shape first: `codex exec --json "ping" | head`.

Don't hard-code a model or reasoning level unless the user asks — defaults from `config.toml` already apply.
