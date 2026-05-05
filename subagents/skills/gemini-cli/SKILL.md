---
name: gemini-cli
description: Run the Gemini CLI non-interactively (`gemini -p`) to delegate a coding, review, or analysis task to a separate model from the shell. Use whenever the user asks to invoke "gemini".
---

Binary: `/opt/homebrew/bin/gemini` (verify with `which gemini`). Always pass `-p/--prompt` — bare `gemini` opens an interactive TUI that blocks.

# Minimal command

```sh
gemini -p "PROMPT"
```

Pipe stdin to provide context (stdin is appended to the prompt):

```sh
git diff | gemini -p "Review this diff"
cat file.ts | gemini -p "Explain this file"
```

Keep stderr by default — auth failures, sandbox denials, and missing-binary errors all surface there. Append `2>/dev/null` only when stderr is known noise.

# Pick the right knobs

Add flags only when the task actually needs them. The most common ones:

- `-m <MODEL>` — explicit model id (omit to let Gemini choose its default)
- `-o text|json|stream-json` — output format (default `text`)
- `-s` / `--approval-mode default|auto_edit|yolo|plan` — needed only for agentic filesystem/tool execution
- `--include-directories <DIR,...>` — extra workspace dirs
- `-r latest|<N>` / `--list-sessions` / `--delete-session <N>` — session management
- `-y, --yolo` — auto-approve everything; only with explicit user consent
- `-e, --extensions` / `--allowed-mcp-server-names` / `--allowed-tools` — scope agent capabilities

For anything else (full flag list, subcommands like `mcp`, `extensions`, `skills`, `hooks`, `gemma`) read the local help:

```sh
gemini --help
gemini <subcommand> --help
```

# Long-running calls

A gemini run can take minutes. Don't block the chat:

- **Default — fire and forget**: invoke through `Bash` with `run_in_background: true`. The harness sends one completion notification when the process exits; read the output with `Read` afterwards. For big results redirect stdout to a file (`gemini -p "..." > /tmp/gemini.out`).
- **Live progress through `Monitor`**: use `-o stream-json` and pipe the stream through a *selective* filter into `Monitor`. Every stdout line becomes a chat notification, so the filter must emit only the event kinds you'd act on (turn boundaries, tool calls, errors) — never raw token deltas. Sanity-check the event shape first with `gemini -p "ping" -o stream-json | head` before writing the filter, and use `grep --line-buffered` / `jq --unbuffered` so events arrive promptly.

When the prompt depends on stdin, say so explicitly in the prompt text (e.g. "Review the diff on stdin"). Don't force `--model`, `--sandbox`, or `--yolo` unless the task actually requires them.
