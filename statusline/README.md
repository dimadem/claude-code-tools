# statusline

```
Opus 5.5 [high] | ████████░░░░░░░░░░░░ 85k | cache 47m | 5h 12% ⋯ 3h 20m | 7d 95% ▲ 2d 4h
```

- **Model name** — current model and effort level
- **Context bar** — visual fill + token count, color shifts green → yellow → red
- **Prompt cache** — time until the cached context goes cold, color shifts green → red as it runs out; `cold` = the next message writes the full context to the cache again
- **5h / 7d rate limits** — usage % and time until reset; `▲` in place of `⋯` = over pace: more of the limit is used than of the window has passed, so at this rate it runs out before the reset (shown from 10% usage)
- **Width** — on a narrow terminal (`COLUMNS`) the line drops parts in this order: shorter bar, reset times, bar, 7d window, cache, effort level

## Install

Run the script:

```bash
curl --create-dirs -fsSL https://raw.githubusercontent.com/dimadem/claude-code-tools/refs/heads/main/statusline/statusline.ts -o ~/.claude/statusline.ts && chmod +x ~/.claude/statusline.ts
```

Update `~/.claude/settings.json`:

```json
{
  "statusLine": {
    "type": "command",
    "command": "~/.claude/statusline.ts",
    "refreshInterval": 5
  }
}
```

Requires [Bun](https://bun.sh) — `brew install bun`.
