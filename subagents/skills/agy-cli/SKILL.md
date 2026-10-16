---
name: agy-cli
description: Run the Antigravity CLI (`agy -p`) non-interactively to delegate a coding, review, or analysis task to a separate model from the shell. Use whenever the user asks to invoke "agy" or "antigravity".
allowed-tools: Bash(${CLAUDE_PLUGIN_ROOT}/scripts/herdr-run.sh *)
---

For more information, run `agy help`, or read `antigravity.google/docs`. If the online documentation and `agy help` are different, use `agy help`.

# Rules

- Use `-p`. `agy` without `-p` starts an interactive TUI. Use it only in Mode B.
- Use `--effort low`. Do not set `--model`. The file `settings.json` sets the model.
- Add the project with `--add-dir "$PWD"`. In `-p`, the workspace root is `~/.gemini/antigravity-cli/scratch`.
- Put all context in the prompt string. In `-p`, `agy` does not read stdin.
- Add `--disable-slash-commands`. If a prompt starts with `/` and this flag is not there, `agy` runs the slash command.
- When `HERDR_ENV` is `1`, the user sees the agent in a Herdr pane next to your pane. When `HERDR_ENV` is not `1`, Mode A operates without a pane, and you cannot use Mode B.

Select a mode:

- Mode A (one task in a pane): Use it for code review and analysis. `agy` writes the result to a file.
- Mode B (interactive agent): Use it to change files and to run commands that have no `allow` rule. Use it when the user must give more instructions to the agent.

# Command rules

In `-p`, `agy` reads files without a dialog. It does not run a shell command that has no `allow` rule. The file `${CLAUDE_SKILL_DIR}/command-rules.json` contains `allow` rules for commands that show data.

To find the rules in the settings file, run `jq -e '.permissions.allow | index("command(git status)")' ~/.gemini/antigravity-cli/settings.json`. If the result is `null`, the user must give approval before you install the rules. All projects use this file. After the approval, run:

```sh
f=~/.gemini/antigravity-cli/settings.json; cp -p "$f" "$f.bak"
jq -s '.[0] * {permissions: {allow: (((.[0].permissions.allow // []) + .[1].permissions.allow) | unique)}}' \
  "$f" "${CLAUDE_SKILL_DIR}/command-rules.json" >"$f.tmp" && mv "$f.tmp" "$f"
```

A rule lets a command run when the command starts with the rule text. The arguments of the command have no effect on this. In the prompt, tell the agent which commands it can use.

# Mode A: code review and analysis

1. Make a directory: `d=$(mktemp -d "${TMPDIR:-/tmp}/agy.XXXXXX"); echo "$d"`.
2. Write the prompt to `$d/prompt.md`.
3. Write this command to `$d/cmd.sh`. The pane shows the tool steps and the output text:

   ```sh
   agy --add-dir "$PWD" --effort low --disable-slash-commands --output-format stream-json --print-timeout 30m \
     -p "$(cat "$d/prompt.md")" </dev/null 2>"$d/err" | tee "$d/events.jsonl" | jq -rj --unbuffered '
     if .event=="step_update" and .step_update.step_type=="tool" and .step_update.state!="DONE"
       then "\n[" + .step_update.state + " " + (.step_update.tool_name // "") + "]\n"
     elif .event=="step_update" then (.step_update.text_delta // "")
     elif .event=="result" then "\n[" + .result.status + "]\n" else empty end'
   rc=$?
   jq -c 'select(.event=="result").result' "$d/events.jsonl" >"$d/out.json"
   jq -r '.response // empty' "$d/out.json" >"$d/out.md"
   exit "$rc"
   ```

4. Run the script with `run_in_background: true`: `${CLAUDE_PLUGIN_ROOT}/scripts/herdr-run.sh --label "agy: <task>" "$d"`.
5. Wait for the task notification. The script shows `pane=` and `rc=`.
6. Do the steps in "Result check". Then read `$d/out.md`.

For two or more code reviews at the same time, use a different `$d` for each agent.

The script sets `$d` and runs `cmd.sh` in your directory with `pipefail`. The pane stays open. At the end, the pane shows `$d/out.md` with `bat`, and Herdr shows a notification. The script puts a new pane to the right of your pane. If there is a pane to the right of your pane, the script puts the new pane below the last pane in that column.

# Mode B: task with file changes

1. Make a pane: `${CLAUDE_PLUGIN_ROOT}/scripts/herdr-run.sh --pane-only --label "agy: <task>"`. The script shows `pane=<ID>`.
2. Start the agent: `herdr agent start <name> --kind agy --pane <ID> -- --effort low`. In Mode B, the workspace is the shell directory.
3. Send the task with `run_in_background: true`: `herdr agent prompt <name> "PROMPT" --wait --timeout 1200000`.
4. Make sure that the turn is at its end. Herdr can show `idle` before the end of the turn. If the screen shows `esc to cancel`, run `herdr agent wait <name>` again.
5. Read the output: `herdr agent read <name> --source recent --lines 200`.
6. Make sure that the agent ran the commands. Find a `Bash(...)` line for each necessary command. `agy` can give a result without these commands.
7. If the output is not full, send this prompt: "Write your full reply as Markdown to `<file>`. Reply only with the path." Then read the file.

The user gives approval for changes and commands in the pane. `agy` can show `idle` while its subagents continue to run.

> **CAUTION:** Do not press a key in a dialog for the user. A dialog can give approval for changes to files. `agent_not_ready` or `blocked` shows that the agent shows a dialog, for example for trust or an approval. Read the dialog with `herdr agent read <name> --source visible`. Tell the user about the dialog.

- After a timeout, read the screen before you send the prompt again. Herdr can send a prompt and then show a timeout.
- Keep the pane open. Close the pane only when the user tells you to close it.
- To stop the agent, run `herdr pane send-text <ID> "/quit"`. Then run `herdr pane send-keys <ID> enter`.

# Next prompt in the same conversation

- Mode B: Send the next prompt to the same agent name.
- Mode A: Find `conversation_id` in `$d/out.json`. Run the next prompt with `--conversation <ID>`. Use the flags from that command again.

Do not use `-c` while other `agy` tasks are in progress. This flag can select a different conversation.

# Result check

```sh
jq -e '.status == "SUCCESS" and ((.response // "") != "" or .structured_output != null)' "$d/out.json"
```

| Signal | Action |
|---|---|
| `rc` is 1 or 2 | A flag, model or agent name is not correct. Read `$d/err`. Change the command. |
| `rc=3`, `AGY_ERROR` in `$d/err` | A model or API error stopped the turn. Read the error line. If the error line shows that you can try again, run the command again. |
| Empty `response`, `denied_actions` is not null | A tool has no permission. See "Command rules". |
| Empty `response`, `print timeout after` in `$d/err` | Increase `--print-timeout`, or divide the task. |

`status: "SUCCESS"` does not show that the result is correct.

> **CAUTION:** Do not use `--dangerously-skip-permissions` without an instruction from the user. This flag gives approval for all tools. Then the agent can change or delete files.
