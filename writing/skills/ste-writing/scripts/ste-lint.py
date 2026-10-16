#!/usr/bin/env python3
"""Check Markdown or text files against the main ASD-STE100 writing rules.

usage: ste-lint.py [--glossary FILE] [--allow WORD,WORD] FILE... (or - for stdin)

The linter finds rule violations that a script can see: sentence length, -ing
forms, passive voice, semicolons, contractions, paragraph length, list items in
lowercase, and words from references/replacements.md. It cannot check the
approved meaning or part of speech of a word. Read its findings as hints.

Code (fenced blocks and `inline code`), "quoted text" and headings count as one
word each (rule 8.6). Exit status: 0 = no findings, 1 = findings, 2 = usage error.
"""
import argparse
import re
import sys
from pathlib import Path

REPLACEMENTS = Path(__file__).resolve().parent.parent / "references" / "replacements.md"

# Words that end in -ing but are approved or technical (rule 3.5).
ING_OK = {
    "during", "something", "nothing", "anything", "everything", "thing", "things",
    "string", "strings", "ring", "spring", "opening", "remaining", "bring",
    "king", "ping", "warning", "warnings", "setting", "settings", "meaning",
    "meanings", "heading", "headings",
}
CONTRACTION = re.compile(r"\b\w+n't\b|\b(?:it|that|there|you|we|they|i)'(?:s|re|ll|ve|d|m)\b", re.I)
PASSIVE = re.compile(r"\b(?:is|are|was|were|be|been|being)\s+(?:\w+ly\s+)?\w+(?:ed|en)\b", re.I)
WORD = re.compile(r"[A-Za-z0-9X][A-Za-z0-9'\-]*")


def load_replacements():
    """Return {word: suggestion} from the table in references/replacements.md."""
    table = {}
    if not REPLACEMENTS.exists():
        return table
    for line in REPLACEMENTS.read_text(encoding="utf-8").splitlines():
        cells = [c.strip() for c in line.strip().strip("|").split("|")]
        if len(cells) < 2 or not line.lstrip().startswith("|") or set(cells[0]) <= set("-: "):
            continue
        for word in re.split(r"[,/]", cells[0]):
            word = word.strip().strip("`").lower()
            if word and word not in ("not approved", "approved"):
                table[word] = cells[1]
    return table


def load_glossary(path, allow):
    terms = set()
    if path:
        for raw in Path(path).read_text(encoding="utf-8").splitlines():
            raw = raw.split("#", 1)[0]
            raw = re.sub(r"^\s*-?\s*[A-Za-z ]+:\s*", "", raw) if ":" in raw else raw
            for term in re.split(r"[,;]", raw):
                term = re.sub(r"\(.*?\)", "", term).strip().lower()
                if term:
                    terms.update(term.split())
    for term in (allow or "").split(","):
        if term.strip():
            terms.add(term.strip().lower())
    return terms


def in_glossary(word, glossary):
    """Accept a glossary term and its plural form."""
    return word in glossary or word.rstrip("s") in glossary or word[:-2] in glossary


def mask(text):
    """Replace inline code and quoted text with X (one word each)."""
    text = re.sub(r"`[^`]*`", "X", text)
    text = re.sub(r"\"[^\"]*\"|“[^”]*”", "X", text)
    text = re.sub(r"\[([^\]]*)\]\([^)]*\)", r"\1", text)  # Markdown link -> its text
    text = re.sub(r"https?://\S+", "X", text)
    return text


def sentences(text):
    parts = re.split(r"(?<=[.!?:])\s+(?=[A-Z0-9X\"(])", text.strip())
    return [p for p in parts if WORD.search(p)]


def blocks(lines):
    """Yield (kind, start_line, text) for each text block. Code and headings are skipped."""
    in_code, in_front = False, False
    para, para_start = [], 0
    for n, line in enumerate(lines, 1):
        if n == 1 and line.strip() == "---":
            in_front = True
            continue
        if in_front:
            in_front = line.strip() != "---"
            continue
        if line.lstrip().startswith("```"):
            in_code = not in_code
            continue
        if in_code:
            continue
        stripped = line.strip()
        item = re.match(r"^\s*(\d+[.)]|[-*+])\s+(.*)", line)
        if not stripped or stripped.startswith("#") or item or stripped.startswith(("|", ">")):
            if para:
                yield "para", para_start, " ".join(para)
                para = []
            if item:
                kind = "step" if item.group(1)[0].isdigit() else "item"
                yield kind, n, item.group(2)
            elif stripped.startswith("|") and not set(stripped) <= set("|-: "):
                for cell in stripped.strip("|").split("|"):
                    yield "cell", n, cell.strip()
            elif stripped.startswith(">"):
                yield "safety", n, stripped.lstrip("> ").strip()
            continue
        if not para:
            para_start = n
        para.append(stripped)
    if para:
        yield "para", para_start, " ".join(para)


def check(path, text, glossary, replacements):
    found = []
    lines = text.splitlines()
    for kind, n, raw in blocks(lines):
        body = mask(raw)
        body = re.sub(r"^\*\*(CAUTION|WARNING|NOTE):\*\*\s*", "", body)
        sents = sentences(body)
        limit = 20 if kind in ("step", "safety") else 25
        if kind == "para" and len(sents) > 6:
            found.append((n, "6.6", f"paragraph has {len(sents)} sentences (max 6)"))
        if kind in ("step", "item") and re.match(r"^[a-z]", body) and not re.match(r"^X", body):
            found.append((n, "4.3", "list item starts with a lowercase letter"))
        for s in sents:
            count = len(WORD.findall(s))
            if count > limit:
                found.append((n, "5.1/6.3", f"{count} words (max {limit}): {s[:70]}"))
        if ";" in body:
            found.append((n, "8.1", "semicolon in text"))
        for m in CONTRACTION.findall(body):
            found.append((n, "4.2", f"contraction '{m}'"))
        if PASSIVE.search(body):
            found.append((n, "3.6", f"passive voice? '{PASSIVE.search(body).group(0)}'"))
        for w in re.findall(r"\b[A-Za-z]+ing\b", body):
            if w.lower() not in ING_OK and not in_glossary(w.lower(), glossary):
                found.append((n, "3.5", f"-ing form '{w}'"))
        for w in WORD.findall(body):
            if w.isupper() and len(w) > 1:
                continue  # UPPERCASE marks a dictionary word in STE notation
            key = w.lower().strip("'")
            if key in replacements and not in_glossary(key, glossary):
                found.append((n, "1.1", f"'{w}' is not approved: {replacements[key]}"))
        if re.match(r"^(\*\*)?WARNING\b", raw.strip()):
            found.append((n, "7.1", "WARNING is for a risk to persons. For files or data, use CAUTION"))
    return [f"{path}:{n}: [{rule}] {msg}" for n, rule, msg in found]


def main():
    ap = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    ap.add_argument("files", nargs="+", help="Markdown or text files, or - for stdin")
    ap.add_argument("--glossary", help="file with technical nouns and verbs, comma or line separated")
    ap.add_argument("--allow", help="comma-separated words to accept")
    args = ap.parse_args()
    glossary = load_glossary(args.glossary, args.allow)
    replacements = load_replacements()
    results = []
    for f in args.files:
        text = sys.stdin.read() if f == "-" else Path(f).read_text(encoding="utf-8")
        results += check(f, text, glossary, replacements)
    print("\n".join(results) if results else "no findings")
    return 1 if results else 0


if __name__ == "__main__":
    sys.exit(main())
