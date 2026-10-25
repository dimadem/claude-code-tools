// `pi -p --mode json` with only the read tools, and no extension, MCP server or
// skill to add others. The answer is the message that ends the turn
// (stopReason "stop"), not one before a tool call; message_update (each token)
// is not read.

import { flag, get, list, text } from '../../../shared/lib'
import { addNote, findStep, nextId, setStep, toolStep, toolText } from '../lib/state'
import type { Agent, AgentState } from '../model/types'

function messageBody(message: unknown): string {
  return list(message, 'content')
    .filter(part => text(part, 'type') === 'text')
    .map(part => text(part, 'text'))
    .filter(Boolean)
    .join('\n')
    .trim()
}

function reduceToolEnd(state: AgentState, event: unknown, id: string): AgentState {
  const before = findStep(state, id)
  let shown = text(event, 'toolName') || 'tool'
  if (before !== null && before.kind === 'tool') shown = before.text
  if (flag(event, 'isError')) return setStep(state, toolStep(id, shown, 'failed', null))
  return setStep(state, toolStep(id, shown, 'ok', null))
}

function reduceMessage(state: AgentState, message: unknown): AgentState {
  if (text(message, 'role') !== 'assistant') return state
  let next = state
  const body = messageBody(message)
  if (body) {
    const made = nextId(next, 'm')
    next = setStep(made.state, { kind: 'message', id: made.id, text: body })
    if (text(message, 'stopReason') === 'stop') next = { ...next, out: body, answerId: made.id }
  }
  const error = text(message, 'errorMessage')
  if (error) next = addNote(next, `error: ${error}`)
  return next
}

export const pi: Agent = {
  name: 'pi',
  title: 'pi',
  hint: 'The pi agent with the model the user set for it. It reads, greps and finds files; it has no shell.',
  canReview: false,
  guardsWrites: false,
  maxPromptChars: Number.POSITIVE_INFINITY,
  command: ({ prompt }) => ({
    argv: [
      'pi',
      '-p',
      '--mode',
      'json',
      '--tools',
      'read,grep,find,ls',
      '--no-session',
      '--no-extensions',
      '--no-mcp',
      '--no-skills',
      '--no-prompt-templates',
      '--no-themes',
    ],
    input: { kind: 'stdin', text: prompt },
  }),
  reduce: (state, event) => {
    const id = text(event, 'toolCallId')
    switch (text(event, 'type')) {
      case 'tool_execution_start':
        if (!id) return state
        return setStep(
          state,
          toolStep(id, toolText(text(event, 'toolName'), get(event, 'args'), state.cwd), 'running', null),
        )
      case 'tool_execution_end':
        if (!id) return state
        return reduceToolEnd(state, event, id)
      case 'message_end':
        return reduceMessage(state, get(event, 'message'))
      default:
        return state
    }
  },
}
