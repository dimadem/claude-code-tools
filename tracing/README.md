# tracing

Logs every Claude Code session to JSONL files for debugging and pipeline analysis.

## What it captures

Each session gets its own file at `~/.claude/tracing/<session_id>.jsonl`. Every line is a JSON event:

| Hook | What's logged |
|------|---------------|
| `SessionStart` | session metadata, project dir |
| `UserPromptSubmit` | user message |
| `PreToolUse` | tool name + input |
| `PostToolUse` | tool name + output |
| `Stop` | end of Claude's turn |
| `SessionEnd` | session close |

## Install

```bash
/plugin marketplace add dimadem/claude-code-tools
/plugin install tracing@dimadem-claude-code-tools
```

Hooks apply automatically — no manual configuration needed. Requires [Bun](https://bun.sh).

## Output

```
~/.claude/tracing/
└── <session_id>.jsonl
```

Each line:
```json
{"timestamp": "2026-05-05T10:30:00Z", "hook_event_name": "PreToolUse", "session_id": "...", "tool_name": "Bash", "tool_input": {"command": "ls"}}
```

## Custom directory

Set `CLAUDE_TRACING_DIR` env var to change the output location:

```json
{
  "env": {
    "CLAUDE_TRACING_DIR": "/your/custom/path"
  }
}
```
