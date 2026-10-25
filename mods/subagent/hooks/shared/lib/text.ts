// Text helpers: a path from the work tree, the lines git status gained, and a
// list as `a, b or c`.

export function relativePath(path: string, cwd: string): string {
  if (path.startsWith(`${cwd}/`)) return path.slice(cwd.length + 1)
  return path
}

export function changedLines(before: string, after: string): string[] {
  const old = new Set(before.split('\n'))
  return after.split('\n').filter(line => line.trim() && !old.has(line))
}

export function oneOf(items: readonly string[]): string {
  const last = items.at(-1) ?? ''
  if (items.length < 2) return last
  return `${items.slice(0, -1).join(', ')} or ${last}`
}
