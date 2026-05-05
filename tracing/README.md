# tracing

Copies Claude Code session transcripts into your project for analysis.

## Install

```bash
/plugin marketplace add dimadem/claude-code-tools
/plugin install tracing@dimadem-claude-code-tools
```

## Usage

Run from inside any project:

```
/tracing
```

Creates a `tracing/` folder in the current directory:

```
tracing/
├── <session_id>.jsonl   # full session transcripts
├── <session_id>.jsonl
└── viewer.html          # open in Chrome to browse sessions
```

Running `/tracing` again appends only new lines — existing files are not overwritten.

## Viewer

Open `tracing/viewer.html` in Chrome, click "Open tracing folder", select the `tracing/` directory. Shows user prompts, tool calls, and model responses with JSON syntax highlighting.
