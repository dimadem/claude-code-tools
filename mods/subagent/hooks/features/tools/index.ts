// The three tools the model calls (run, result, stop) as pure parts: their specs,
// the check of the run input with typed StartErrors, and the texts they answer
// with, the message when a task ends included. register.tsx runs them.

import type { ToolSpec } from 'claude-code'

import type { AgentName, Task, TaskStatus } from '../../../types'
import type { Agent, Mode } from '../../entities/agent'
import type { StopOutcome } from '../../entities/run'
import { taskElapsed } from '../../entities/task'
import { INLINE_RESULT_CHARS, RESULT_TOOL_CHARS } from '../../shared/config'
import { type Result, err, ok, oneOf, text, unreachable } from '../../shared/lib'

type StartInput = { agent: string; prompt: string; label: string; review: string }

type StartPlan = { agent: Agent; prompt: string; label: string; mode: Mode }

type StartError =
  | { kind: 'unknown-agent'; installed: readonly AgentName[] }
  | { kind: 'review-unsupported'; agent: AgentName; reviewers: readonly AgentName[] }
  | { kind: 'bad-scope'; review: string }
  | { kind: 'empty' }
  | { kind: 'prompt-too-long'; agent: AgentName; limit: number }
  | { kind: 'no-run-dir'; reason: string }
  | { kind: 'not-recorded' }

export function readStartInput(input: unknown): StartInput {
  return {
    agent: text(input, 'agent'),
    prompt: text(input, 'prompt').trim(),
    label: text(input, 'label').trim(),
    review: text(input, 'review').trim(),
  }
}

const REVIEW_HELP = 'Run a code review in place of a task: "uncommitted", "base:<branch>" or "commit:<sha>".'

function reviewersOf(installed: readonly Agent[]): AgentName[] {
  return installed.filter(one => one.canReview).map(one => one.name)
}

function modeOf(review: string, agent: Agent, installed: readonly Agent[]): Result<Mode, StartError> {
  if (!review) return ok({ kind: 'exec' })
  if (!agent.canReview) {
    return err({ kind: 'review-unsupported', agent: agent.name, reviewers: reviewersOf(installed) })
  }
  if (review === 'uncommitted') return ok({ kind: 'review', args: ['--uncommitted'] })
  const colon = review.indexOf(':')
  const scope = review.slice(0, colon)
  const value = review.slice(colon + 1)
  if (colon > 0 && value && scope === 'base') return ok({ kind: 'review', args: ['--base', value] })
  if (colon > 0 && value && scope === 'commit') return ok({ kind: 'review', args: ['--commit', value] })
  return err({ kind: 'bad-scope', review })
}

export function planStart(input: StartInput, installed: readonly Agent[]): Result<StartPlan, StartError> {
  const agent = installed.find(one => one.name === input.agent)
  if (agent === undefined) return err({ kind: 'unknown-agent', installed: installed.map(one => one.name) })
  const mode = modeOf(input.review, agent, installed)
  if (!mode.ok) return mode
  if (mode.value.kind === 'exec' && !input.prompt) return err({ kind: 'empty' })
  if (input.prompt.length > agent.maxPromptChars) {
    return err({ kind: 'prompt-too-long', agent: agent.name, limit: agent.maxPromptChars })
  }
  const label = (input.label || input.prompt.slice(0, 40) || agent.name).slice(0, 60)
  return ok({ agent, prompt: input.prompt, label, mode: mode.value })
}

export function describeStartError(error: StartError): string {
  switch (error.kind) {
    case 'unknown-agent':
      return `agent must be one of: ${error.installed.join(', ')}.`
    case 'review-unsupported':
      if (error.reviewers.length === 0)
        return `${error.agent} cannot do a review; put the review task in the prompt.`
      return `${error.agent} cannot do a review; use ${oneOf(error.reviewers)}, or put the review task in the prompt.`
    case 'bad-scope':
      return `review must be "uncommitted", "base:<branch>" or "commit:<sha>", not "${error.review}".`
    case 'empty':
      return 'Give a prompt, or a review scope.'
    case 'prompt-too-long':
      return `The prompt for ${error.agent} must be shorter than ${error.limit} characters.`
    case 'no-run-dir':
      return `Cannot make a run directory: ${error.reason}`
    case 'not-recorded':
      return 'Cannot record the task.'
    default:
      return unreachable(error)
  }
}

export function runTool(installed: readonly Agent[]): ToolSpec {
  return {
    name: 'run',
    description: [
      'Delegate a read-only review or analysis task to another coding agent (a separate model).',
      'It runs in the background, shows live progress in the Agents pane, and writes no files.',
      'The call returns at once with a task id; when the agent ends, its result arrives as a message from the subagent plugin.',
      'Use it when the user asks for one of these agents or for a second opinion; pick the agent the user names, else the first one.',
      'Put all the context the agent needs in the prompt. The agents:',
      ...installed.map(one => `- ${one.name}: ${one.hint}`),
    ].join('\n'),
    inputSchema: {
      type: 'object',
      properties: {
        agent: {
          type: 'string',
          enum: installed.map(one => one.name),
          description: 'The agent that does the task.',
        },
        prompt: {
          type: 'string',
          description:
            'The task for the agent, with all the context it needs. Optional with review: extra review instructions.',
        },
        label: { type: 'string', description: 'A short name for the pane, 2-6 words.' },
        review: {
          type: 'string',
          description: `Only for ${reviewersOf(installed).join(', ') || 'no installed agent'}. ${REVIEW_HELP}`,
        },
      },
      required: ['agent', 'label'],
    },
    isDeferred: false,
  }
}

const ID_INPUT = {
  type: 'object',
  properties: { id: { type: 'string', description: 'The task id, for example "c1".' } },
  required: ['id'],
}

export const resultTool: ToolSpec = {
  name: 'result',
  description: 'Read the status and the result of a subagent task by its id.',
  inputSchema: ID_INPUT,
  isDeferred: true,
}

function exitText(code: number | null): string {
  if (code === null) return ''
  return `, exit code ${code}`
}

function cappedOut(out: string, dir: string): string {
  if (out.length <= RESULT_TOOL_CHARS) return out
  return `${out.slice(0, RESULT_TOOL_CHARS)}\n\n[cut at ${RESULT_TOOL_CHARS} characters; the full text is in ${dir}/out.md]`
}

export function formatResult(task: Task, out: string, at: number): string {
  const lines = [
    `${task.agent} task ${task.id} (${task.label}): ${task.status}, ${taskElapsed(task, at)}${exitText(task.code)}`,
    `run directory: ${task.dir}`,
  ]
  if (task.sessionId !== null) lines.push(`${task.agent} session: ${task.sessionId}`)
  if (out) return [...lines, '', cappedOut(out, task.dir)].join('\n')
  const recent = task.steps.slice(-15).map(step => {
    if (step.kind === 'tool') return `${step.text} (${step.status})`
    return step.text
  })
  if (recent.length === 0) recent.push('(none)')
  lines.push('', 'last steps:', ...recent)
  if (task.stderr.trim()) lines.push('', 'stderr:', task.stderr.slice(-2000))
  return lines.join('\n')
}

export const stopTool: ToolSpec = {
  name: 'stop',
  description:
    'Stop a running subagent task by its id. Use it only when the user asks to stop the task. ' +
    'A stopped task sends no result message.',
  inputSchema: ID_INPUT,
  isDeferred: true,
}

export function describeStop(outcome: StopOutcome, task: Task): string {
  switch (outcome.kind) {
    case 'stopped':
      return `Stopped task ${task.id} (${task.label}).`
    case 'not-running':
      return `Task ${task.id} is not running: it is ${task.status}.`
    case 'no-pid':
      return `Task ${task.id} is marked stopped, but its process had not started yet; it ends when it next prints. Call stop again to kill it.`
    case 'still-running':
      return `Sent SIGTERM to task ${task.id}; it has not ended yet. Call stop again, or read it with result.`
    default:
      return unreachable(outcome)
  }
}

type Completion = {
  title: string
  task: Task
  status: TaskStatus
  code: number | null
  out: string
  notes: readonly string[]
  changed: readonly string[]
}

export function completionText(end: Completion): string {
  const { title, task, status, code, out, notes, changed } = end
  const parts = [`${title} task ${task.id} (${task.label}) ended: ${status}${exitText(code)}.`]
  if (changed.length > 0) {
    const note =
      'by the agent or by another writer; a file that was already changed before is not checked again'
    parts.push(`Warning: git status changed while it ran (${note}):\n${changed.join('\n')}`)
  }
  if (out && out.length <= INLINE_RESULT_CHARS) parts.push(`Its result:\n\n${out}`)
  else {
    if (!out && notes.length > 0) parts.push(`Its notes:\n${notes.slice(-5).join('\n')}`)
    parts.push(`Read the result with mcp__subagent__result, id "${task.id}". Run directory: ${task.dir}`)
  }
  return parts.join('\n\n')
}
