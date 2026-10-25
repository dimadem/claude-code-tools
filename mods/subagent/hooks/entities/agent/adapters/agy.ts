// `agy -p --output-format stream-json`. agy takes the prompt as an argument
// (Linux limits it to 128 KiB) and reads no stdin. In print mode it denies each
// write and each command that has no allow rule; the result then has no
// response. The text deltas of one step join into one message, and the `result`
// event gives the answer.

import type { StepStatus } from '../../../../types'
import { get, int, list, nonEmpty, text } from '../../../shared/lib'
import { addNote, messageText, nextId, setStep, toolStep, toolText } from '../lib/state'
import type { Agent, AgentState } from '../model/types'

function toolStatus(state: string): StepStatus {
  if (state === 'DONE') return 'ok'
  if (state === 'ERROR') return 'failed'
  return 'running'
}

function withStepId(state: AgentState, step: unknown): { state: AgentState; id: string } {
  const index = int(step, 'step_index')
  if (index !== null) return { state, id: `s${index}` }
  return nextId(state, 's-')
}

function reduceStep(before: AgentState, step: unknown): AgentState {
  const { state, id } = withStepId(before, step)
  switch (text(step, 'step_type')) {
    case 'agent_response': {
      const delta = text(step, 'text_delta')
      if (!delta) return before
      return setStep(state, { kind: 'message', id, text: messageText(state, id) + delta })
    }
    case 'tool': {
      const args = get(get(step, 'tool_info'), 'parameters')
      const shown = toolText(text(step, 'tool_name'), args, state.cwd)
      return setStep(state, toolStep(id, shown, toolStatus(text(step, 'state')), null))
    }
    default:
      return before
  }
}

function lastMessageId(state: AgentState): string | null {
  const last = state.steps.findLast(one => one.kind === 'message')
  if (last === undefined) return null
  return last.id
}

function reduceResult(state: AgentState, result: unknown): AgentState {
  let next: AgentState = { ...state, out: text(result, 'response'), answerId: lastMessageId(state) }
  const status = text(result, 'status')
  if (status && status !== 'SUCCESS') next = addNote(next, `agy ended: ${status}`)
  const denied = list(result, 'denied_actions').map(one => text(one, 'action') || '?')
  if (denied.length > 0) {
    next = addNote(next, `agy denied ${denied.join(', ')}: its settings have no allow rule for it`)
  }
  return next
}

export const agy: Agent = {
  name: 'agy',
  title: 'Antigravity',
  hint: "Google Antigravity (Gemini). It reads and searches files; it runs no shell command unless the user's agy settings allow it.",
  canReview: false,
  guardsWrites: true,
  maxPromptChars: 100_000,
  command: ({ prompt, cwd }) => ({
    argv: [
      'agy',
      '-p',
      prompt,
      '--add-dir',
      cwd,
      '--effort',
      'low',
      '--disable-slash-commands',
      '--output-format',
      'stream-json',
      '--print-timeout',
      '30m',
    ],
    input: { kind: 'closed' },
  }),
  reduce: (state, event) => {
    switch (text(event, 'event')) {
      case 'init':
        return { ...state, sessionId: nonEmpty(text(event, 'conversation_id')) }
      case 'step_update':
        return reduceStep(state, get(event, 'step_update'))
      case 'result':
        return reduceResult(state, get(event, 'result'))
      default:
        return state
    }
  },
}
