---
name: ste-writing
description: Rewrite documentation, procedures, skills and agent instructions in ASD-STE100 Simplified Technical English, from any source language. Use when the user asks for STE, ASD-STE100, Simplified Technical English or clear technical writing, or when you write a SKILL.md or other agent-facing documentation.
allowed-tools: Bash(python3 ${CLAUDE_SKILL_DIR}/scripts/ste-lint.py *)
---

This skill applies the main rules of ASD-STE100, Issue 9. It does not contain the STE dictionary. The full standard and the dictionary are free. The user can fill in the form at https://www.asd-ste100.org/STE_downloads.html.

# Rules

- Write the result in STE English. If the source text is in a different language, translate it.
- Do not change code blocks, inline code, commands, flags, file names, paths, JSON fields and UI labels.
- Do not change the meaning. If a sentence in the source is not clear, tell the user. Do not guess.
- If the project has a glossary of technical nouns and verbs, use it. For example, find it in `CLAUDE.md`.
- Text that looks like STE is not always correct STE. Tell the user which words you are not sure about.

# Procedure

1. Read `${CLAUDE_SKILL_DIR}/references/rules.md`.
2. Read the source text. Divide it into procedures, descriptive text and safety instructions.
3. Make a list of the technical nouns and technical verbs. Use one term for each item in all of the text.
4. Write each procedure as numbered steps. Write one instruction in each step, with the imperative and a maximum of 20 words.
5. Write descriptive text with a maximum of 25 words in a sentence and 6 sentences in a paragraph. Use the active voice.
6. Write each safety instruction before its step. Start with CAUTION or WARNING, then the command, then the risk. Do not give a number to a safety instruction.
7. Replace the words that are not in the STE dictionary. Use `${CLAUDE_SKILL_DIR}/references/replacements.md`.
8. Run the linter: `python3 ${CLAUDE_SKILL_DIR}/scripts/ste-lint.py <file>`.
9. Correct each problem that the linter shows. If the linter is not correct, keep the text and tell the user why.
10. Tell the user about the technical nouns and verbs that you added.
11. Tell the user about the words and sentences that you are not sure about.

If a word-for-word replacement gives a bad sentence, write the sentence in a different way.

# Linter

The linter finds problems that a script can see:

- Sentences that are too long (20 words in steps and safety instructions, 25 words in other text).
- Paragraphs with more than 6 sentences.
- Semicolons, contractions and `-ing` forms.
- Passive voice (the linter can find a passive sentence that is not passive).
- List items that start with a lowercase letter.
- Words from `replacements.md`.
- A WARNING for a risk that is not a risk to persons.

The linter cannot find a word with a meaning or part of speech that is not correct in STE. Read the text yourself for this problem.

Flags:

- `--glossary <file>`: the linter accepts the terms in this file. Write the terms with commas or one term on each line.
- `--allow <word>,<word>`: the linter accepts these words.
- Use `-` as the file name to read the text from stdin.

The exit status is 0 if the linter finds no problems, and 1 if it finds problems. The exit status is 2 if the command is not correct.
