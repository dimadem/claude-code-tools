# subagent (mod)

A Claude Code mod that delegates read-only review and analysis tasks to another coding agent in the background, with a live pane beside the chat. Ask in plain words, for example "ask agy to find the bug in the parser", and Claude starts the agent you named.

| Agent | CLI | How it stays read-only |
|-------|-----|------------------------|
| `codex` | [Codex CLI](https://github.com/openai/codex) | `codex exec --json -s read-only`; it can also do a code review (`codex review`) |
| `agy` | Antigravity CLI | `agy -p` denies each write and each shell command that has no allow rule in `~/.gemini/antigravity-cli/settings.json`; the mod also compares `git status` before and after and tells Claude what changed |
| `pi` | [pi](https://pi.dev) | `pi -p --mode json --tools read,grep,find,ls`, with no extensions, MCP servers or skills |

- Tools for the model: `mcp__subagent__run` (start a task; its `agent` is one of the agents found on `PATH` when the session starts), `mcp__subagent__result` (read a task's status and result) and `mcp__subagent__stop` (stop a running task; the pane has a stop button too).
- The pane shows each task's steps (tool calls as one line, the agent's messages as markdown) and the final result. Open it with `/subagent`.
- When the agent ends, the result comes back to Claude as a message from the subagent plugin, and you get a toast and a notification.
- Each run has a directory with `prompt.md`, `out.md`, `events.jsonl` and `stderr`.

Needs Claude Code v2.1.287 or later and at least one of the agents. With [mise](https://mise.jdx.dev): `mise use -g agy@latest pi@latest`; Codex: `brew install --cask codex`. Sign in to each agent once in a terminal.

> A mod is code that runs inside Claude Code with your permissions. To see what this one hooks and calls before you install it, run `claude plugin validate ./mods/subagent` and read the `hooks:` and `calls:` lines.

## Install

In a Claude Code session:

```bash
/plugin install subagent --marketplace dimadem/claude-code-tools
```

From a shell:

```bash
claude plugin install subagent --marketplace dimadem/claude-code-tools
```

If you already added the marketplace: `/plugin install subagent@dimadem-claude-code-tools`. Get a new version with `claude plugin update subagent@dimadem-claude-code-tools`, then `/reload-plugins` in an open session.

## Try it without installing

From a clone of this repository:

```bash
claude --plugin-dir ./mods/subagent
```

Then ask Claude, for example: "ask codex to review the uncommitted changes" or "ask pi what this function does".

Option (`/config` → Pane background): `terminal` (no fill, the default), `black`, `graphite`, `slate`, `navy`.

## Develop

Bun runs the checks; the mod itself runs inside Claude Code (no Node, no Bun globals).

The code follows Feature-Sliced Design: each layer imports only the layers below it, and another slice only through its `index.ts`.

| Layer | What it holds |
|-------|---------------|
| `hooks/register.tsx` (app) | Every hook, every `$` call and the state atoms. Claude Code reads an atom only in the file that makes it, so this is the one imperative file. |
| `hooks/widgets/tasks-pane` | The pane as a pure view: elements, data and callbacks in, a tree out |
| `hooks/features/tools` | The three tools as pure parts: specs, `planStart` with typed `StartError`s, the result and stop texts, the completion message |
| `hooks/entities/*` | `agent`: one pure adapter per agent (its command line, and a reducer from its JSON events to steps); `task`: task list changes and `TaskError`; `run`: a running child, `RunEnd`, the job queue and the stop with its retries |
| `hooks/shared` | Config and `Result`, `ok`, `err`, `unreachable` |

Errors are values: a function that can fail returns `Result<T, E>`, where `E` is a union of kinds, and a `switch` with `unreachable` names every kind. The code has no `?:` fields, no ternaries and no `undefined` values: a missing value is `null`, a choice is a union (`Mode`, `Input`, `RunEnd`), and untyped JSON (an agent's events, a tool's input) is read with `shared/lib/json`, which gives one type per field.

```bash
cd mods/subagent
bun install
bun run check   # biome, tsc, knip (unused files and exports), dependency-cruiser (the layer rules), claude plugin test, claude plugin validate
bun run fix     # biome format and safe fixes
```

`.dependency-cruiser.cjs` holds the layer rules; `pure-below-app` fails when a layer below `register.tsx` imports more than types from `claude-code`. `.claude-plugin/types/` is written by Claude Code each time it loads the mod, and is not committed; `tsc` and `dependency-cruiser` need it, so load the mod once (`claude --plugin-dir ./mods/subagent`) before the first check.
