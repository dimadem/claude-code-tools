// Reads of untyped JSON (an agent's events, a tool's input). Each read gives a
// value of one type: a missing or wrong field reads as '', null, false or [].

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

export function get(value: unknown, key: string): unknown {
  if (!isRecord(value) || !Object.hasOwn(value, key)) return null
  return value[key]
}

export function text(value: unknown, key: string): string {
  const found = get(value, key)
  if (typeof found === 'string') return found
  return ''
}

export function int(value: unknown, key: string): number | null {
  const found = get(value, key)
  if (typeof found === 'number' && Number.isInteger(found)) return found
  return null
}

export function flag(value: unknown, key: string): boolean {
  return get(value, key) === true
}

export function list(value: unknown, key: string): unknown[] {
  const found = get(value, key)
  if (Array.isArray(found)) return found
  return []
}

export function strings(value: unknown): string[] {
  if (!isRecord(value)) return []
  return Object.values(value).filter((one): one is string => typeof one === 'string')
}

export function nonEmpty(value: string): string | null {
  if (value === '') return null
  return value
}
