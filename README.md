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
Copies Claude Code session transcripts into your project for local analysis.

Run `/tracing` inside any project — creates a `tracing/` folder with session JSONL files and a `viewer.html` to browse them in Chrome.

## Install

**1. Add the marketplace** (once):

```bash
/plugin marketplace add dimadem/claude-code-tools
```

**2. Install plugins** (pick what you need):

AI subagents:
```bash
/plugin install subagents@dimadem-claude-code-tools
```

Media processing:
```bash
/plugin install media@dimadem-claude-code-tools
```

Network scanning:
```bash
/plugin install network@dimadem-claude-code-tools
```

Session tracing:
```bash
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
