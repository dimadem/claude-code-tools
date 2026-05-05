# statusline

Custom Claude Code status bar — displays model name, context window usage, and rate limits (5h / 7d).

## What it shows

```
claude-sonnet-4-6 | [████████░░░░░░░░░░░░] 42k | ⌜5h⌟ 12% ⋯ 3h 20m | ⌜7d⌟ 5% ⋯ 2d 4h
```

- **Model name** — current model
- **Context bar** — visual fill + token count, color shifts green → yellow → red
- **5h / 7d rate limits** — usage % and time until reset

## Install

Copy the script to `~/.claude/`:

```bash
cp statusline/statusline.ts ~/.claude/statusline.ts
```

Add to `~/.claude/settings.json`:

```json
{
  "statusLine": {
    "type": "command",
    "command": "bun ~/.claude/statusline.ts",
    "refreshInterval": 5
  }
}
```

Requires [Bun](https://bun.sh) — `brew install bun`.

## How it works

Claude Code sends a JSON object to the script via stdin after each assistant message. The script reads it, formats the output with ANSI colors, and writes to stdout. Full list of available fields: [statusline docs](https://code.claude.com/docs/en/statusline.md).
