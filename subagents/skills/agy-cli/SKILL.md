---
name: agy-cli
description: Run the Antigravity CLI (`agy -p`) non-interactively to delegate a coding, review, or analysis task to a separate model from the shell. Use whenever the user asks to invoke "agy" or "antigravity".
---

Binary: resolve with `which agy`. `-p/--print` is mandatory; bare `agy` opens a blocking TUI. The flag set is version-dependent — the CLI self-updates, and `agy help` is authoritative.

# Minimal command

```sh
agy -p "PROMPT"
```

Stdin is ignored: no `<stdin>` block, no prompt-from-stdin. Context goes into the prompt string, or into the workspace via `--add-dir`.

```sh
agy --add-dir "$PWD" -p "Review the uncommitted changes in this repo"
agy -p "Review this diff:
$(git diff)"
```

Canonical capture — no `-o` flag exists; stdout redirection plus the `--output-format json` envelope:

```sh
agy --add-dir "$PWD" --output-format json --print-timeout 30m -p "PROMPT" >/tmp/agy.json 2>/tmp/agy.err
jq -e '.status == "SUCCESS" and .response != ""' /tmp/agy.json    # the only reliable success test
```

Exit status is not that test:

- exit 0, `status: "SUCCESS"`, empty `response` — a tool was auto-denied; the `jetski: ... auto-denied` notice on stderr names the permission.
- exit 0, `status: "ERROR"` — the run failed, e.g. `--model` combined with `--effort`.
- exit 1 — `--print-timeout` expired (`Error: timeout waiting for response`), or `--model` is unknown and stderr lists the valid slugs.

# Flags

- `-p, --print` / `--prompt` — one non-interactive run
- `--output-format text|json|stream-json` — `text` default, `json` envelope, `stream-json` NDJSON events
- `--json-schema <SCHEMA|FILE>` — structured output, parsed into `structured_output`
- `--add-dir <DIR>` — directory added to the workspace, repeatable; position relative to `-p` is irrelevant
- `--print-timeout <DUR>` — response wait, default `5m0s`
- `--dangerously-skip-permissions` — every tool auto-approved; explicit user consent only
- `--sandbox` — terminal restrictions
- `--model <SLUG|"Display Name">` — catalog: `agy models`
- `--effort low|medium|high` — mutually exclusive with `--model`
- `--mode accept-edits|plan` — `plan` does not block edits headless
- `--agent <NAME>` — catalog: `agy agents`
- `-c, --continue` / `--conversation <ID>` — follow-up turn
- `--log-file <PATH>` — CLI log location

Workspace root is `~/.gemini/antigravity-cli/scratch`, not the shell cwd — project files need `--add-dir "$PWD"`. The `init.cwd` field in `stream-json` reports the shell cwd, not the workspace.

Permissions: read tools (`list_dir`, `view_file`) run unprompted. Shell commands and edits are auto-denied headless — the run returns an empty `response` and exits 0. Allow-rules live in `~/.gemini/antigravity-cli/settings.json` under `permissions.allow` (e.g. `command(git diff)`); `--dangerously-skip-permissions` approves every tool.

Model and effort come from that same `settings.json` — leave both unless the user names one. `agy models` lists slugs, most with the effort level baked in (`gemini-3.6-flash-medium`); display names are also accepted. `--model` and `--effort` in one command fail the run with `status: "ERROR"`.

`-i` is `--prompt-interactive`, not an image flag.

Follow-up turn: `-c` continues the most recent conversation. `--conversation <ID>` targets the `conversation_id` from the envelope — the required form while several runs are in flight.

# Long-running calls

Two limits truncate a delegated run: the `Bash` foreground timeout (120s default, 600s max) and `--print-timeout` (default `5m0s`). Background the call and raise the second:

```sh
agy --add-dir "$PWD" --output-format json --print-timeout 30m -p "PROMPT" >/tmp/agy-<slug>.json 2>/tmp/agy-<slug>.err
```

- `run_in_background: true` — one completion notification on exit.
- `Read` the `.json` file: `status`, `response`, `usage`, `conversation_id`.
- `Read` the `.err` file when `response` is empty — the `jetski:` notice names the denied permission.
- One `<slug>` per call — parallel runs are independent, each with its own `conversation_id`. `TaskStop` cancels one.

Live progress: `Monitor` over `stream-json` through a selective filter, since each stdout line becomes a notification.

```sh
agy --add-dir "$PWD" --output-format stream-json --print-timeout 30m -p "PROMPT" 2>>/tmp/agy.err | jq -r --unbuffered '
  if .event=="step_update" and .step_update.step_type=="tool" and .step_update.state!="DONE"
    then .step_update.state + " " + .step_update.tool_name
  elif .event=="result" then .result.status + " " + (.result.duration_seconds|tostring) + "s"
  else empty end'
```

Tool `state` is `ACTIVE` at start, `ERROR` on an auto-denied tool — the filter keeps both. `ERROR run_command` followed by `SUCCESS` marks a run that finished having done nothing. `agent_response` steps stay out: one `text_delta` per chunk. Stderr stays out of the pipe — non-JSON lines break `jq`.

Events: `init` (`cwd`, `permission_mode`, `tools`) → `step_update` (`step_index`, `state`, `step_type` of `user_input|agent_response|tool|checkpoint|unknown`, `tool_name`, `tool_info{name,parameters,output}`, `text_delta`, `usage`) → `result` (`status`, `response`, `duration_seconds`, `num_turns`, `usage`, `structured_output`). An expired `--print-timeout` lands as a `result` with `status: "ERROR"`.
