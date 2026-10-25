// Pure helpers for AgentState: add or replace a step (its text cut to what its
// kind keeps, at most MAX_STEPS kept), ids for steps the agent gives none, tool
// lines such as `read src/a.ts`, and the fold of one output line (a line that is
// not JSON becomes a note).

import type { StepStatus, TaskStep } from '../../../../types'
import { MAX_STEPS, MESSAGE_CHARS, NOTE_CHARS, TOOL_TEXT_CHARS } from '../../../shared/config'
import { relativePath, strings } from '../../../shared/lib'
import type { AgentState } from '../model/types'

export function initialState(cwd: string): AgentState {
  return { cwd, steps: [], sessionId: null, out: null, answerId: null, seq: 0 }
}

const STEP_CHARS: Record<TaskStep['kind'], number> = {
  message: MESSAGE_CHARS,
  note: NOTE_CHARS,
  tool: TOOL_TEXT_CHARS,
}

export function setStep(state: AgentState, full: TaskStep): AgentState {
  let step = full
  if (full.text.length > STEP_CHARS[full.kind])
    step = { ...full, text: full.text.slice(0, STEP_CHARS[full.kind]) }
  const at = state.steps.findLastIndex(one => one.id === step.id)
  if (at === -1) return { ...state, steps: [...state.steps, step].slice(-MAX_STEPS) }
  const steps = [...state.steps]
  steps[at] = step
  return { ...state, steps }
}

export function nextId(state: AgentState, letter: string): { state: AgentState; id: string } {
  const seq = state.seq + 1
  return { state: { ...state, seq }, id: `${letter}${seq}` }
}

export function addNote(before: AgentState, text: string): AgentState {
  const { state, id } = nextId(before, 'n')
  return setStep(state, { kind: 'note', id, text })
}

export function findStep(state: AgentState, id: string): TaskStep | null {
  return state.steps.findLast(one => one.id === id) ?? null
}

export function messageText(state: AgentState, id: string): string {
  const step = findStep(state, id)
  if (step !== null && step.kind === 'message') return step.text
  return ''
}

export function toolText(name: string, args: unknown, cwd: string): string {
  const values = strings(args).map(value => relativePath(value, cwd))
  return [name || 'tool', ...values].join(' ')
}

export function toolStep(id: string, text: string, status: StepStatus, exitCode: number | null): TaskStep {
  return { kind: 'tool', id, text, status, exitCode }
}

export function foldLine(
  state: AgentState,
  line: string,
  reduce: (state: AgentState, event: unknown) => AgentState,
): AgentState {
  let event: unknown
  try {
    event = JSON.parse(line)
  } catch {
    return addNote(state, line)
  }
  return reduce(state, event)
}
