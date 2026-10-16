# claude-code-tools

## Documentation rules

Write skills (`*/skills/*/SKILL.md`) and other agent-facing docs in ASD-STE100 Simplified Technical English.

- Standard: ASD-STE100, Issue 9 (January 2025). Request a free official copy at https://www.asd-ste100.org/STE_downloads.html
- Rules FAQ: https://www.asd-ste100.org/STE_faq.html
- STEMG White Paper on STE and AI (same downloads page): text that looks like STE is not verified compliance. Check AI-written STE against the standard.

Rules (rule numbers from Issue 9):

- Words (1.1–1.3, 9.1): use dictionary words in UPPERCASE only, with their one approved meaning and part of speech. If a word-for-word change gives a bad sentence, write the sentence in a different way.
- Technical nouns and verbs (1.5, 1.12): use the project glossary below. A technical verb names a real computer operation. Do not use it as a noun or an adjective ("each run" and "the saved file" are wrong).
- Sentences (4.1, 4.2): no contractions. Do not leave out articles, verbs or subjects.
- Procedures (5.1–5.4): 20 words maximum per sentence. One instruction per sentence. Use the imperative, not "must" + verb. Put the condition first: "If X, do Y."
- Descriptive text (6.3, 6.6, 3.6): 25 words maximum per sentence, 6 sentences maximum per paragraph. Use the active voice. Use the passive voice only when the agent is unknown.
- Lists (4.3): a colon after the lead-in, a capital letter at the start of each item, one level only. Do not mix procedural and descriptive items.
- Safety (7.1–7.3): CAUTION is a risk to files, data or equipment. WARNING is a risk to persons, so skills almost always use CAUTION. Start with the command ("Do not ..."), then give the result ("Then Codex can delete files.").
- Punctuation and word count (8.1, 8.6): no semicolons in text. Code in backticks, quoted text and headings count as one word each.
- Do not use `-ing` forms (3.5), except in technical nouns.
- Code blocks are not text: do not change them for STE.

Common replacements: `approve` → "give approval", `permit`/`allow` → `let`, `ask` → `tell`, `require` → "must have", `check` (verb) → "make sure", `complete` (adj) → `full`, `outside` → "not in", `parallel` → "at the same time", `options`/`details` → "more information", `lose` → "does not show", `any` → `all` or a different sentence, `older` → "not correct for this version".

Project glossary:

- Technical nouns: agent, model, prompt, session, conversation, turn, CLI, TUI, command, flag, argument, option (CLI), shell, script, file, directory, path, workspace, project, pane, tab, dialog, screen, output, log, rule, permission, approval, sandbox, hook, timeout, notification, code review, analysis, subagent, plugin, skill, settings file.
- Technical verbs: run (a command or a CLI), install, update, open, close, delete, save, press, type, enter, load.

## Skill scope

- Refer to bundled files with `${CLAUDE_PLUGIN_ROOT}` (plugin directory) or `${CLAUDE_SKILL_DIR}` (skill directory). Claude Code puts the real path into the skill text. Do not use relative paths.
- Put a procedure that two skills use into each skill. A separate file does not get the path variables.
- Pre-approve a bundled script with `allowed-tools: Bash(${CLAUDE_PLUGIN_ROOT}/scripts/<script> *)`.
- Run `claude plugin validate ./<plugin> --strict` before a commit. Increase `version` in `plugin.json` for each release.
- Keep each skill to the main scenarios of this setup. For other information, point to the CLI `--help` or the official docs.
- Test each command in a skill before you write it. Do not write CLI version numbers in a skill.
