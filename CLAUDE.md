# claude-code-tools

## Documentation rules

Write skills (`*/skills/*/SKILL.md`) and other agent-facing docs in ASD-STE100 Simplified Technical English. Use the `ste-writing` skill (plugin `writing`): it has the rules in short form, a list of common replacements and a linter.

- Standard: ASD-STE100, Issue 9 (January 2025). Request a free official copy at https://www.asd-ste100.org/STE_downloads.html
- Project glossary of technical nouns and verbs: `ste-glossary.txt`.
- Lint a skill before a commit: `python3 writing/skills/ste-writing/scripts/ste-lint.py --glossary ste-glossary.txt <file>`.

## Skill scope

- Refer to bundled files with `${CLAUDE_PLUGIN_ROOT}` (plugin directory) or `${CLAUDE_SKILL_DIR}` (skill directory). Claude Code puts the real path into the skill text. Do not use relative paths.
- Put a procedure that two skills use into each skill. A separate file does not get the path variables.
- Pre-approve a bundled script with `allowed-tools: Bash(${CLAUDE_PLUGIN_ROOT}/scripts/<script> *)`.
- Run `claude plugin validate ./<plugin> --strict` before a commit. Increase `version` in `plugin.json` for each release.
- Keep each skill to the main scenarios of this setup. For other information, point to the CLI `--help` or the official docs.
- Test each command in a skill before you write it. Do not write CLI version numbers in a skill.
