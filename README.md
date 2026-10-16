# claude-code-tools

## Plugins

### subagents

For using these skills install: `brew install --cask codex` (codex-cli), Antigravity CLI (agy-cli)

| Skill | Description |
|-------|-------------|
| `codex-cli` | Run Codex CLI non-interactively to delegate coding, review, or analysis tasks |
| `agy-cli` | Run Antigravity CLI non-interactively to delegate coding, review, or analysis tasks |

Inside [Herdr](https://herdr.dev) (`HERDR_ENV=1`), both skills run the delegated agent in a pane next to yours: a one-shot run that writes its result to a file (`scripts/herdr-run.sh`), or an interactive agent you can watch and approve. `agy-cli/command-rules.json` holds allow rules for usual inspection commands; the skill installs them into `~/.gemini/antigravity-cli/settings.json` only after you agree.

### writing

| Skill | Description |
|-------|-------------|
| `ste-writing` | Rewrite documentation, procedures, and agent instructions in ASD-STE100 Simplified Technical English (from any language), with a linter |

The skill has the main rules in short form, not the STE dictionary. Request the official standard at https://www.asd-ste100.org/STE_downloads.html.

### media

For using these skills install: `brew install ffmpeg` (ffmpeg-cli), `brew install yt-dlp` (yt-dlp-cli)

| Skill | Description |
|-------|-------------|
| `ffmpeg-cli` | Transcode, compress, trim, concat, mux, filter, or extract audio/video with ffmpeg |
| `yt-dlp-cli` | Download video/audio, subtitles, and playlists from URLs with yt-dlp |

### network

For using these skills install: `brew install nmap` (nmap-cli), `brew install --cask devtunnel` (devtunnel-cli)

| Skill | Description |
|-------|-------------|
| `nmap-cli` | Discover hosts, scan ports, detect services/OS, run NSE scripts; scripts for long scans and short XML summaries |
| `devtunnel-cli` | Expose a local port on a public/private URL with Microsoft Dev Tunnels |

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
/plugin install writing@dimadem-claude-code-tools
```

```bash
/plugin install network@dimadem-claude-code-tools
```

## statusline

See [`statusline/README.md`](statusline/README.md) for details.
