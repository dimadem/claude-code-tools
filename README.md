# claude-code-tools

Personal Claude Code plugin marketplace.

## Plugins

### subagents
Skills for delegating tasks to external AI subagents via CLI.

| Skill | Description |
|-------|-------------|
| `codex-cli` | Run Codex CLI non-interactively to delegate coding, review, or analysis tasks |
| `gemini-cli` | Run Gemini CLI non-interactively to delegate coding, review, or analysis tasks |

### media
Skills for media processing via CLI.

| Skill | Description |
|-------|-------------|
| `ffmpeg-cli` | Transcode, trim, mux, filter, or extract audio/video with ffmpeg |
| `yt-dlp-cli` | Download or extract media from URLs and playlists with yt-dlp |

### network
Skills for network scanning and analysis via CLI.

| Skill | Description |
|-------|-------------|
| `nmap-cli` | Discover hosts, scan ports, detect services/OS, run NSE scripts |

### tracing
Logs every Claude Code session to JSONL files for debugging and pipeline analysis. Hooks apply automatically on install.

| Hook | What's logged |
|------|---------------|
| `SessionStart` / `SessionEnd` | session open/close |
| `UserPromptSubmit` | user message |
| `PreToolUse` / `PostToolUse` | tool calls + results |
| `Stop` | end of Claude's turn |

Output: `~/.claude/tracing/<session_id>.jsonl`

## Install plugins

```bash
/plugin marketplace add dimadem/claude-code-tools
/plugin install subagents@dimadem-claude-code-tools
/plugin install media@dimadem-claude-code-tools
/plugin install network@dimadem-claude-code-tools
/plugin install tracing@dimadem-claude-code-tools
```

## statusline

Custom status bar — model name, context window, rate limits (5h / 7d).

```bash
cp statusline/statusline.ts ~/.claude/statusline.ts
```

`~/.claude/settings.json`:

```json
{
  "statusLine": {
    "type": "command",
    "command": "bun ~/.claude/statusline.ts",
    "refreshInterval": 5
  }
}
```

See [`statusline/README.md`](statusline/README.md) for details.
