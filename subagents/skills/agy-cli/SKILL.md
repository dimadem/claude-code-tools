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
agy --add-dir "$PWD" -p "PROMPT" > /tmp/agy.out
status=$?    # 0 = success; non-zero = auth/sandbox/runtime failure
cat /tmp/agy.out
```

There is no `-o`/`--output-file` flag — redirect stdout. There is no `--json` event stream either; only the final text answer is printed.

Keep stderr by default — auth failures, sandbox denials, and missing-binary errors all surface there. Append `2>/dev/null` only when stderr is known noise.

# Pick the right knobs

Common flags:

- `-p, --print` / `--prompt` — non-interactive single-shot mode (mandatory for delegation)
- `--model <NAME>` — route to a specific model; list options with `agy models`
- `--print-timeout <DUR>` — response wait for `-p` (default `5m0s`); not a hard kill — a stalled run can outlive it
- `--add-dir <DIR>` — add a directory to the workspace (repeatable)
- `--sandbox` — run with terminal restrictions enabled
- `--dangerously-skip-permissions` — auto-approve every tool prompt; only with explicit user consent
- `-c, --continue` — continue the most recent conversation
- `--conversation <ID>` — resume a specific prior conversation by ID
- `--log-file <PATH>` — override the CLI log file location

By default `-p` runs in agy's own internal directory (`~/.gemini/antigravity-cli`), **not** the current shell cwd. Pass `--add-dir "$PWD"` (or the specific project path) when the task needs to see project files.

**Flag order matters**: put `--add-dir` (and other flags) *before* `-p`, or use the explicit `=` form. `agy -p "PROMPT" --add-dir DIR` silently drops `--add-dir`; `agy --add-dir DIR -p "PROMPT"` works.

# Safe defaults

- **Read-only review/analysis**: omit `--dangerously-skip-permissions`; supply all context via stdin/prompt. A tool call that needs approval stalls — `-p` has no TTY to approve it.
- **Repo read or edits**: pass `--dangerously-skip-permissions` (explicit user consent) plus `--add-dir "$PWD"`, else the run hangs on the first tool approval.
- **Sandboxed run**: add `--sandbox` to bound blast radius; pair with `--dangerously-skip-permissions` for autonomy within limits.

# Long-running calls

An agy run can take minutes and is capped by `--print-timeout` (default 5m). Don't block the chat:

- **Default — fire and forget**: invoke through `Bash` with `run_in_background: true`. The harness sends one completion notification when the process exits; read the output with `Read` afterwards. Redirect stdout to a file for large results (`agy -p "..." > /tmp/agy.out`). Bump `--print-timeout` if the task may exceed 5 minutes.
- **No live event stream**: agy doesn't emit `--json` progress events, so `Monitor` only sees the final blob on stdout. If you need intermediate visibility, split the task into smaller `-p` calls instead.

When the prompt depends on stdin, say so explicitly ("Review the diff from stdin"). Don't force `--sandbox` or `--dangerously-skip-permissions` unless the task requires them.
