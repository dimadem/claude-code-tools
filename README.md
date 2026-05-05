# agentic-stuff

Personal Claude Code plugin marketplace.

## Structure

```
agentic-stuff/
├── .claude-plugin/
│   └── marketplace.json    # Plugin catalog
├── <plugin-name>/
│   ├── .claude-plugin/
│   │   └── plugin.json     # Plugin manifest
│   └── skills/
│       └── <skill-name>/
│           └── SKILL.md
└── README.md
```

## Install marketplace

```bash
/plugin marketplace add dimadem/agentic-stuff
```

## Install a plugin

```bash
/plugin install <plugin-name>@dimadem-agentic-stuff
```
