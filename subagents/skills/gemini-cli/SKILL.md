---
name: gemini-cli
description: Run the Gemini CLI non-interactively (`gemini -p`) to delegate a coding, review, or analysis task to a separate model from the shell. Use whenever the user asks to invoke "gemini".
---

Binary: `/opt/homebrew/bin/gemini` (verify with `which gemini`). Always pass `-p/--prompt` — bare `gemini` opens an interactive TUI that blocks.

# Minimal command

```sh
gemini -p "PROMPT"
```

Pipe stdin to provide context (the prompt is appended *after* whatever arrives on stdin):

```sh
git diff | gemini -p "Review the diff above"
cat file.ts | gemini -p "Explain the file above"
```

Capture the answer for delegated work:

```sh
gemini -p "PROMPT" > /tmp/gemini.out
status=$?    # 0 = success; non-zero = auth/sandbox/runtime failure
```

Keep stderr by default — auth failures, sandbox denials, and missing-binary errors all surface there. Append `2>/dev/null` only when stderr is known noise.

# Pick the right knobs

Common flags (each is independent — don't conflate `-s`, `--approval-mode`, `-y`):

- `-m <MODEL>` — explicit model id (omit to use Gemini's default)
- `-o, --output-format text|json|stream-json` — output **format** (default `text`). Not a file path.
- `-s, --sandbox` — boolean; run this invocation inside the sandbox
- `--approval-mode default|auto_edit|yolo|plan` — tool-call approval policy (`plan` is read-only / planning, `auto_edit` auto-approves edits but still prompts on shell/tool calls)
- `-y, --yolo` — boolean; equivalent to `--approval-mode yolo`. Auto-approves everything — only with explicit user consent.
- `--include-directories <DIR,...>` — extra workspace dirs
- `-e, --extensions <list>` — restrict which extensions load this run
- `--allowed-mcp-server-names <list>` — whitelist MCP servers
- `--policy <FILE>` / `--admin-policy <FILE>` — Policy Engine files (the new home for tool whitelisting; `--allowed-tools` is **deprecated** per `gemini --help`)
- `-r latest|<N>` / `--list-sessions` / `--delete-session <N>` — session management

Subcommands (`mcp`, `extensions`, `skills`, `hooks`, `gemma`): `gemini <subcommand> --help`.

# Safe defaults

- **Read-only review/analysis** (no FS edits): omit `-s`, `-y`, `--approval-mode`. Gemini won't apply edits without approval. For an even stricter "look but don't touch" guarantee: `--approval-mode plan`.
- **File-edit task with light supervision**: `--approval-mode auto_edit` — auto-approves edit tools; shell/other tools still prompt. Pair with `-s` to sandbox.
- **Fully autonomous (explicit user consent required)**: `-y` or `--approval-mode yolo`.

# Long-running calls

A gemini run can take minutes. Don't block the chat:

- **Default — fire and forget**: invoke through `Bash` with `run_in_background: true`. The harness sends one completion notification when the process exits; read the output with `Read` afterwards. Redirect stdout to a file for large results (`gemini -p "..." > /tmp/gemini.out`).
- **Live progress through `Monitor`**: use `-o stream-json` and pipe through a *selective* filter — every stdout line becomes a notification, so emit only turn-boundary/tool-call/error events, never token deltas. Use unbuffered tools (`grep --line-buffered`, `jq --unbuffered`). Sanity-check event shape first: `gemini -p "ping" -o stream-json | head`.

When the prompt depends on stdin, say so explicitly in the prompt text ("Review the diff above"). Don't force `-m`, `-s`, `--approval-mode`, or `-y` unless the task actually requires them.
