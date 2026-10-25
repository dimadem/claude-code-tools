// `codex exec --json` in a read-only sandbox, or `codex exec review`. It writes
// its last message to out.md (-o). A command shows as `$ rg -n x`, without the
// `/bin/bash -lc` wrapper.

import type { StepStatus } from '../../../../types'
import { get, int, nonEmpty, text } from '../../../shared/lib'
import { addNote, nextId, setStep, toolStep } from '../lib/state'
import type { Agent, AgentState } from '../model/types'

function shownCommand(command: string): string {
  const wrapped = /^\S*\/(?:ba|z)?sh -lc (['"])([\s\S]*)\1$/.exec(command.trim())
  if (wrapped === null) return command.trim()
  return (wrapped[2] ?? '').trim()
}

function commandStatus(status: string, exitCode: number | null): StepStatus {
  if (status === 'in_progress') return 'running'
  if (exitCode === 0) return 'ok'
  return 'failed'
}

function reduceMessage(before: AgentState, item: unknown): AgentState {
  const body = text(item, 'text')
  if (!body) return before
  let state = before
  let id = text(item, 'id')
  if (!id) ({ state, id } = nextId(before, 'm'))
  return { ...setStep(state, { kind: 'message', id, text: body }), answerId: id }
}

function reduceItem(state: AgentState, type: string, item: unknown): AgentState {
  const id = text(item, 'id')
  switch (text(item, 'type')) {
    case 'agent_message':
      if (type !== 'item.completed') return state
      return reduceMessage(state, item)
    case 'command_execution': {
      if (!id) return state
      const exitCode = int(item, 'exit_code')
      const shown = `$ ${shownCommand(text(item, 'command'))}`
      return setStep(state, toolStep(id, shown, commandStatus(text(item, 'status'), exitCode), exitCode))
    }
    case 'error': {
      const message = text(item, 'message')
      if (!message) return state
      return addNote(state, `error: ${message}`)
    }
    default:
      return state
  }
}

export const codex: Agent = {
  name: 'codex',
  title: 'Codex',
  hint: 'OpenAI Codex. It runs read-only shell commands (rg, git log, tests that write nothing), and it can do a code review (review).',
  canReview: true,
  guardsWrites: false,
  maxPromptChars: Number.POSITIVE_INFINITY,
  command: ({ prompt, mode, cwd, dir }) => {
    const argv = [
      'codex',
      'exec',
      '--json',
      '-C',
      cwd,
      '-s',
      'read-only',
      '--color',
      'never',
      '-o',
      `${dir}/out.md`,
    ]
    if (mode.kind === 'review') {
      argv.push('review', ...mode.args)
      if (prompt) argv.push('-')
    } else argv.push('--skip-git-repo-check', '-')
    if (prompt) return { argv, input: { kind: 'stdin', text: prompt } }
    return { argv, input: { kind: 'closed' } }
  },
  reduce: (state, event) => {
    const type = text(event, 'type')
    switch (type) {
      case 'thread.started':
        return { ...state, sessionId: nonEmpty(text(event, 'thread_id')) }
      case 'turn.failed':
        return addNote(state, `turn failed: ${text(get(event, 'error'), 'message') || 'no reason'}`)
      case 'error':
        return addNote(state, `error: ${text(event, 'message') || 'no message'}`)
      default:
        return reduceItem(state, type, get(event, 'item'))
    }
  },
}
