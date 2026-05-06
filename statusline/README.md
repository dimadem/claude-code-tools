# statusline

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
