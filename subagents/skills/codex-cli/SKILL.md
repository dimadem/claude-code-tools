---
name: codex-cli
description: Run the Codex CLI (`codex exec`) non-interactively to delegate a coding, review, or analysis task to a separate model from the shell. Use whenever the user asks to invoke "codex".
---

Binary: `/opt/homebrew/bin/codex` (verify with `which codex`). Always use the `exec` subcommand — bare `codex` opens an interactive TUI that blocks.

# Minimal command

```sh
codex exec "PROMPT"
```

Pipe stdin to provide context (stdin is appended as a `<stdin>` block):

```sh
git diff | codex exec "Review this diff"
cat file.ts | codex exec -
```

Keep stderr by default — auth failures, sandbox denials, and missing-binary errors all surface there. Append `2>/dev/null` only when stderr is known noise.

# Pick the right knobs

Add flags only when the task actually needs them. The most common ones:

- `-m <MODEL>` — pick a specific model
- `-c key=value` — override any `~/.codex/config.toml` value (e.g. `-c 'model_reasoning_effort="high"'`)
- `-s read-only|workspace-write|danger-full-access` — sandbox policy
- `-C <DIR>` / `--add-dir <DIR>` — working dir / extra writable dirs
- `--output-schema <FILE>` — constrain final answer to a JSON Schema
- `--json` — JSONL event stream; `-o <FILE>` — write the final message to file
- `--ephemeral` — don't persist the session
- `--skip-git-repo-check` — run outside a git repo
- `--full-auto` / `--dangerously-bypass-approvals-and-sandbox` — auto-approve modes; only with explicit user consent

For anything else (full flag list, other subcommands like `review`, `resume`, `apply`, `mcp`, `cloud`, etc.) read the local help:

```sh
codex --help
codex exec --help
codex <subcommand> --help
```

# Long-running calls

A codex run can take minutes (more with high reasoning). Don't block the chat:

- **Default — fire and forget**: invoke through `Bash` with `run_in_background: true`. The harness sends one completion notification when the process exits; read the output with `Read` afterwards. For big final messages route them to a file with `-o /tmp/codex.out`.
- **Live progress through `Monitor`**: run with `--json` and pipe the stream through a *selective* filter into `Monitor`. Every stdout line becomes a chat notification, so the filter must emit only event types you'd act on (task lifecycle, tool calls, errors) — never raw token deltas. Sanity-check the event shape first with `codex exec --json "ping" | head` before writing the filter, and use `grep --line-buffered` / `jq --unbuffered` so events arrive promptly.

Don't hard-code a model or reasoning level unless the user asks — defaults from `config.toml` already apply.
