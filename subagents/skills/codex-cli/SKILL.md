---
name: codex-cli
description: Run the Codex CLI (`codex exec`) non-interactively to delegate a coding, review, or analysis task to a separate model from the shell. Use whenever the user asks to invoke "codex".
allowed-tools: Bash(${CLAUDE_PLUGIN_ROOT}/scripts/herdr-run.sh *)
---

For more information, run `codex exec --help` or `codex exec <subcommand> --help`.

# Rules

- Use `codex exec`. `codex` without a subcommand starts an interactive TUI. Use it only in Mode B.
- Set `-s` in each command. Use `read-only` for code review and analysis.
- Do not set `-m` or `model_reasoning_effort`. The file `~/.codex/config.toml` sets them.
- When `HERDR_ENV` is `1`, the user sees the agent in a Herdr pane next to your pane. When `HERDR_ENV` is not `1`, Mode A operates without a pane, and you cannot use Mode B.

Select a mode:

- Mode A (one task in a pane): Use it for code review and analysis. Codex writes the result to a file.
- Mode B (interactive agent): Use it to change files. Use it when the user must give more instructions to the agent.

# Mode A: code review and analysis

1. Make a directory: `d=$(mktemp -d "${TMPDIR:-/tmp}/codex.XXXXXX"); echo "$d"`.
2. Write the prompt to `$d/prompt.md`.
3. Write this command to `$d/cmd.sh`:

   ```sh
   codex exec -C "$PWD" -s read-only --color never -o "$d/out.md" - <"$d/prompt.md" 2>&1 | tee "$d/log"
   ```

4. Run the script with `run_in_background: true`: `${CLAUDE_PLUGIN_ROOT}/scripts/herdr-run.sh --label "codex: <task>" "$d"`.
5. Wait for the task notification. The script shows `pane=` and `rc=`.
6. Do the steps in "Result check". Then read `$d/out.md`.

For a code review of changes, change `- <"$d/prompt.md"` to `review --base main </dev/null`. Other scopes are `--uncommitted` and `--commit <SHA>`.

For two or more code reviews at the same time, use a different `$d` for each agent.

The script sets `$d` and runs `cmd.sh` in your directory with `pipefail`. The pane stays open. At the end, the pane shows `$d/out.md` with `bat`, and Herdr shows a notification. The script puts a new pane to the right of your pane. If there is a pane to the right of your pane, the script puts the new pane below the last pane in that column.

# Mode B: task with file changes

1. Make a pane: `${CLAUDE_PLUGIN_ROOT}/scripts/herdr-run.sh --pane-only --label "codex: <task>"`. The script shows `pane=<ID>`.
2. Start the agent: `herdr agent start <name> --kind codex --pane <ID> -- <start arguments>`.
3. Send the task with `run_in_background: true`: `herdr agent prompt <name> "PROMPT" --wait --timeout 1200000`.
4. Make sure that the turn is at its end. Herdr can show `idle` before the end of the turn. If the screen shows `esc to interrupt`, run `herdr agent wait <name>` again.
5. Read the output: `herdr agent read <name> --source recent --lines 200`. The source `recent-unwrapped` does not always show the full output.
6. If the output is not full, send this prompt: "Write your full reply as Markdown to `<file>`. Reply only with the path." Then read the file.

Start arguments:

- To change files: `-s workspace-write --no-alt-screen`. The user gives approval for each step in the pane.
- To read files without dialogs: `-s read-only -a never --no-alt-screen`.

With `--no-alt-screen`, the pane keeps the full output.

> **CAUTION:** Do not press a key in a dialog for the user. A dialog can give approval for changes to files. `agent_not_ready` or `blocked` shows that the agent shows a dialog, for example for trust, an update or an approval. Read the dialog with `herdr agent read <name> --source visible`. Tell the user about the dialog.

- After a timeout, read the screen before you send the prompt again. Herdr can send a prompt and then show a timeout.
- Keep the pane open. Close the pane only when the user tells you to close it.
- To stop the agent, run `herdr pane send-text <ID> "/quit"`. Then run `herdr pane send-keys <ID> enter`.

# Next prompt in the same session

- Mode B: Send the next prompt to the same agent name.
- Mode A: Find the session ID with `grep -m1 '^session id:' "$d/log"`. Then use `codex exec -C "$PWD" -s read-only --color never -o "$d/out2.md" resume <ID> - <"$d/prompt2.md"`.

Put `-C` and `-s` before `resume`. Do not use `resume --last` while other Codex tasks are in progress. This command can select a different session.

# Result check

| Signal | Action |
|---|---|
| `rc=0`, `out.md` has text | Read the output. Make sure that it does the task. |
| `rc=0`, `out.md` is empty | Read `$d/log`. |
| `rc` is not 0 | Read `$d/log`. Tell the user the error line. |
| `Not inside a trusted directory` | Add `--skip-git-repo-check`. |

`rc=0` does not show that the output is correct.

> **CAUTION:** Do not use `--dangerously-bypass-approvals-and-sandbox` (alias `--yolo`) without an instruction from the user. This flag removes the sandbox and all approvals. Then Codex can change or delete files.

> **CAUTION:** Do not use `--dangerously-bypass-hook-trust` without an instruction from the user. This flag runs hooks without a trust decision from the user.
