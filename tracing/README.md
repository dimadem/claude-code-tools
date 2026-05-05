# tracing

Logs every Claude Code session to JSONL files for debugging and pipeline analysis.

## What it captures

Each session gets its own file at `~/.claude/tracing/<session_id>.jsonl`. Every line is a JSON event with full payload — nothing is filtered out.

Hooks captured (every event Claude Code emits during a session):

| Group | Hooks |
|-------|-------|
| Session lifecycle | `SessionStart`, `SessionEnd`, `InstructionsLoaded` |
| User input | `UserPromptSubmit`, `UserPromptExpansion` |
| Tool execution | `PreToolUse`, `PostToolUse`, `PostToolUseFailure`, `PostToolBatch` |
| Permissions | `PermissionRequest`, `PermissionDenied` |
| Subagents & tasks | `SubagentStart`, `SubagentStop`, `TaskCreated`, `TaskCompleted` |
| Conversation | `Stop` (`message` = full assistant response text), `StopFailure` |
| System | `Notification`, `PreCompact`, `PostCompact` |

See [Claude Code hooks reference](https://code.claude.com/docs/en/hooks) for the payload schema of each event.

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
