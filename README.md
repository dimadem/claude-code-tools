# claude-code-tools

## Plugins

### subagents

For using these skills install: `brew install --cask codex` (codex-cli), Antigravity CLI (agy-cli)

| Skill | Description |
|-------|-------------|
| `codex-cli` | Run Codex CLI non-interactively to delegate coding, review, or analysis tasks |
| `agy-cli` | Run Antigravity CLI non-interactively to delegate coding, review, or analysis tasks |

### media

For using these skills install: `brew install ffmpeg` (ffmpeg-cli), `brew install yt-dlp` (yt-dlp-cli)

| Skill | Description |
|-------|-------------|
| `ffmpeg-cli` | Transcode, trim, mux, filter, or extract audio/video with ffmpeg |
| `yt-dlp-cli` | Download or extract media from URLs and playlists with yt-dlp |

### network

For using these skills install: `brew install nmap` (nmap-cli), `brew install --cask wireshark-app` (wireshark-cli)

| Skill | Description |
|-------|-------------|
| `nmap-cli` | Discover hosts, scan ports, detect services/OS, run NSE scripts |
| `wireshark-cli` | Launch the Wireshark GUI from the shell with preset capture, filters, or pcap loaded |

### tracing

Run `/tracing` inside any project — creates a `tracing/` folder with session JSONL files and a `viewer.html` to browse them in Chrome.

## Install

### Option A — skills only for every cli agent

```bash
npx skills add dimadem/claude-code-tools
```

### Option B — Claude Code marketplace 

**1. Add the marketplace**:

```bash
/plugin marketplace add dimadem/claude-code-tools
```

**2. Install plugins**:

```bash
/plugin install subagents@dimadem-claude-code-tools
```

```bash
/plugin install media@dimadem-claude-code-tools
```

```bash
/plugin install network@dimadem-claude-code-tools
```

```bash
/plugin install tracing@dimadem-claude-code-tools
```

## statusline

See [`statusline/README.md`](statusline/README.md) for details.
