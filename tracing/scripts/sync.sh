#!/usr/bin/env bash
set -euo pipefail

cwd="$(pwd)"
encoded="${cwd//\//-}"
encoded="${encoded//_/-}"
src="${HOME}/.claude/projects/${encoded}"
dst="${cwd}/tracing"

if [[ ! -d "$src" ]]; then
  echo "No sessions found for: $cwd"
  exit 0
fi

mkdir -p "$dst"

count=0
for src_file in "$src"/*.jsonl; do
  [[ -f "$src_file" ]] || continue
  name="$(basename "$src_file")"
  dst_file="${dst}/${name}"

  if [[ ! -f "$dst_file" ]]; then
    cp "$src_file" "$dst_file"
  else
    existing=$(wc -l < "$dst_file")
    tail -n +"$((existing + 1))" "$src_file" >> "$dst_file"
  fi

  count=$((count + 1))
done

viewer_src="$(cd "$(dirname "$0")/.." && pwd)/viewer.html"
viewer_dst="${dst}/viewer.html"
[[ "$viewer_src" != "$viewer_dst" ]] && cp "$viewer_src" "$viewer_dst"

echo "Synced $count session(s) → $dst"
echo "Open: $dst/viewer.html"
