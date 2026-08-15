# statusline

```
claude-sonnet-4-6 | [████████░░░░░░░░░░░░] 42k | 5h 12% ⋯ 3h 20m | 7d 5% ⋯ 2d 4h
```

- **Model name** — current model
- **Context bar** — visual fill + token count, color shifts green → yellow → red
- **5h / 7d rate limits** — usage % and time until reset

## Install

Run the script:

```bash
curl --create-dirs -fsSL https://raw.githubusercontent.com/dimadem/claude-code-tools/refs/heads/main/statusline/statusline.ts -o ~/.claude/statusline.ts
```

Update `~/.claude/settings.json`:

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
