---
name: agy-cli
description: Run the Antigravity CLI (`agy -p`) non-interactively to delegate a coding, review, or analysis task to a separate model from the shell. Use whenever the user asks to invoke "agy" or "antigravity".
---

Binary: `/Users/dima_dem/.local/bin/agy` (verify with `which agy`). Always pass `-p/--print` — bare `agy` opens an interactive TUI that blocks.

# Minimal command

```sh
agy -p "PROMPT"
```

Pipe stdin to provide context (stdin is exposed to the model as input):

```sh
git diff | agy -p "Review the diff above"
cat file.ts | agy -p "Explain the file above"
```

Canonical capture for delegated work — final answer in a file, exit status from the run:

```sh
agy -p "PROMPT" > /tmp/agy.out
status=$?    # 0 = success; non-zero = auth/sandbox/runtime failure
cat /tmp/agy.out
```

There is no `-o`/`--output-file` flag — redirect stdout. There is no `--json` event stream either; only the final text answer is printed.

Keep stderr by default — auth failures, sandbox denials, and missing-binary errors all surface there. Append `2>/dev/null` only when stderr is known noise.

# Pick the right knobs

Common flags:

- `-p, --print` / `--prompt` — non-interactive single-shot mode (mandatory for delegation)
- `--print-timeout <DUR>` — wait limit for `-p` (default `5m0s`); raise for heavier tasks
- `--add-dir <DIR>` — add a directory to the workspace (repeatable)
- `--sandbox` — run with terminal restrictions enabled
- `--dangerously-skip-permissions` — auto-approve every tool prompt; only with explicit user consent
- `-c, --continue` — continue the most recent conversation
- `--conversation <ID>` — resume a specific prior conversation by ID
- `--log-file <PATH>` — override the CLI log file location

By default `-p` runs in agy's own internal directory (`~/.gemini/antigravity-cli`), **not** the current shell cwd. Pass `--add-dir "$PWD"` (or the specific project path) when the task needs to see project files.

**Flag order matters**: put `--add-dir` (and other flags) *before* `-p`, or use the explicit `=` form. `agy -p "PROMPT" --add-dir DIR` silently drops `--add-dir`; `agy --add-dir DIR -p "PROMPT"` works.

# Safe defaults

- **Read-only review/analysis**: omit `--dangerously-skip-permissions`. Without it, every tool call needs approval — in `-p` mode that means the model will work within its own reasoning and only read/write through approved tools.
- **Sandboxed run**: add `--sandbox` to restrict terminal access for this invocation.
- **Fully autonomous (explicit user consent required)**: `--dangerously-skip-permissions`. Pair with `--sandbox` when you want autonomy but bounded blast radius.

# Long-running calls

An agy run can take minutes and is capped by `--print-timeout` (default 5m). Don't block the chat:

- **Default — fire and forget**: invoke through `Bash` with `run_in_background: true`. The harness sends one completion notification when the process exits; read the output with `Read` afterwards. Redirect stdout to a file for large results (`agy -p "..." > /tmp/agy.out`). Bump `--print-timeout` if the task may exceed 5 minutes.
- **No live event stream**: agy doesn't emit `--json` progress events, so `Monitor` only sees the final blob on stdout. If you need intermediate visibility, split the task into smaller `-p` calls instead.

When the prompt depends on stdin, say so explicitly in the prompt text ("Review the diff above"). Don't force `--sandbox` or `--dangerously-skip-permissions` unless the task actually requires them.
