// Names and limits. The pane draws up to 100,000 characters: PANE_CHARS of the
// shown task, the result first, then the newest steps. A step keeps
// MESSAGE_CHARS, NOTE_CHARS or TOOL_TEXT_CHARS of its text. Of out.md, the state
// keeps RESULT_CHARS, the result tool answers with RESULT_TOOL_CHARS and the end
// message holds up to INLINE_RESULT_CHARS. The stop tool waits PID_WAIT_MS for
// the pid file, then END_WAIT_MS for the run to end.

export const PANE = { id: 'subagent', title: 'Agents', endKey: 'output-end' } as const

const SHADES = new Map([
  ['black', '#000000'],
  ['graphite', '#131417'],
  ['slate', '#161b22'],
  ['navy', '#0b1220'],
])

export function shadeOf(option: unknown): string | null {
  if (typeof option !== 'string') return null
  return SHADES.get(option) ?? null
}

export const EVENTS_CHARS = 1_000_000
export const STDERR_CHARS = 4000
export const MAX_STEPS = 300
export const TOOL_TEXT_CHARS = 200
export const MESSAGE_CHARS = 8000
export const NOTE_CHARS = 2000
export const LINE_CHARS = 1_000_000
export const RESULT_TOOL_CHARS = 40_000
export const STOP_POLL_MS = 100
export const PID_WAIT_MS = 2000
export const END_WAIT_MS = 3000
export const RESULT_CHARS = 60_000
export const PANE_CHARS = 90_000
export const INLINE_RESULT_CHARS = 20_000
