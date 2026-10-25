// Tests of the pure layers: the adapters on real events, planStart, statusOf,
// the task list and the result text.

import { expect, test } from 'claude-code/testing'

import { AGENTS, type AgentState, agentByName, foldLine, initialState } from '../hooks/entities/agent'
import { createRun, statusOf, takeLines } from '../hooks/entities/run'
import { addTask, findTask } from '../hooks/entities/task'
import { describeStartError, formatResult, planStart, readStartInput } from '../hooks/features/tools'
import { LINE_CHARS, MESSAGE_CHARS, RESULT_TOOL_CHARS } from '../hooks/shared/config'
import type { Task } from '../types'
import { AGY, AGY_ANSWER, AGY_DENIED, CODEX, PI } from './fixtures'

function fold(name: 'codex' | 'agy' | 'pi', output: string): AgentState {
  const { reduce } = agentByName(name)
  return output
    .split('\n')
    .filter(line => line.trim())
    .reduce((state, line) => foldLine(state, line, reduce), initialState('/repo'))
}

test('the codex adapter folds commands and messages, and keeps the thread id', () => {
  const state = fold('codex', CODEX)
  expect(state.sessionId).toBe('thr-1')
  expect(state.steps).toEqual([
    { kind: 'message', id: 'item_0', text: 'I will read the parser.' },
    { kind: 'tool', id: 'item_1', text: '$ rg -n parse src', status: 'ok', exitCode: 0 },
    { kind: 'message', id: 'item_2', text: '**No problems found.**' },
  ])
  expect(state.out).toBeNull()
})

test('the agy adapter joins text deltas into one message and takes the response as its answer', () => {
  const state = fold('agy', AGY)
  expect(state.sessionId).toBe('conv-1')
  expect(state.steps).toEqual([
    { kind: 'tool', id: 's2', text: 'read_file calc.py', status: 'ok', exitCode: null },
    { kind: 'message', id: 's3', text: AGY_ANSWER },
  ])
  expect(state.out).toBe(AGY_ANSWER)
})

test('the agy adapter makes a note of each denied action', () => {
  const state = fold('agy', AGY_DENIED)
  expect(state.out).toBe('')
  expect(state.steps.at(-1)).toEqual({
    kind: 'note',
    id: 'n1',
    text: 'agy denied write_file: its settings have no allow rule for it',
  })
})

test('the pi adapter takes only a message that ends the turn as its answer', () => {
  const state = fold('pi', PI)
  expect(state.steps.map(step => step.kind)).toEqual(['message', 'tool', 'message'])
  expect(state.out).toBe('`add` returns `a - b`.')
})

test('a line that is not JSON becomes a note, and the state before it is kept', () => {
  const start = initialState('/repo')
  const state = foldLine(start, 'warning: slow disk', agentByName('codex').reduce)
  expect(state.steps).toEqual([{ kind: 'note', id: 'n1', text: 'warning: slow disk' }])
  expect(start.steps).toEqual([])
})

test('planStart answers each bad call with its own error kind', () => {
  const installed = AGENTS.filter(one => one.name !== 'agy')
  const kind = (input: object) => {
    const plan = planStart(readStartInput(input), installed)
    if (plan.ok) return 'ok'
    return plan.error.kind
  }
  expect(kind({ agent: 'agy', prompt: 'x' })).toBe('unknown-agent')
  expect(kind({ agent: 'pi', review: 'uncommitted' })).toBe('review-unsupported')
  expect(kind({ agent: 'codex', review: 'main' })).toBe('bad-scope')
  expect(kind({ agent: 'codex', prompt: '  ' })).toBe('empty')
  expect(kind({ agent: 'codex', review: 'commit:abc' })).toBe('ok')
  const long = planStart(readStartInput({ agent: 'agy', prompt: 'x'.repeat(100_001) }), AGENTS)
  expect(!long.ok && describeStartError(long.error)).toBe(
    'The prompt for agy must be shorter than 100000 characters.',
  )
})

test('a run ends done only when it exits 0 with an answer', () => {
  expect(statusOf({ kind: 'exited', code: 0 }, 'answer')).toBe('done')
  expect(statusOf({ kind: 'exited', code: 0 }, '')).toBe('failed')
  expect(statusOf({ kind: 'exited', code: 1 }, 'answer')).toBe('failed')
  expect(statusOf({ kind: 'crashed', reason: 'ENOENT' }, '')).toBe('failed')
  expect(statusOf({ kind: 'stopped' }, 'answer')).toBe('stopped')
})

function taskOf(fields: Partial<Task> & Pick<Task, 'agent'>): Task {
  return { ...addTask([], { agent: fields.agent, label: 'x', dir: '/tmp/d', at: 0 }).task, ...fields }
}

test('task ids count across agents, and a missing task is an error', () => {
  const spec = { label: 'x', dir: '/tmp/d', at: 0 }
  const one = addTask([], { ...spec, agent: 'codex' })
  const two = addTask(one.list, { ...spec, agent: 'pi' })
  expect(two.list.map(task => task.id)).toEqual(['c1', 'p2'])
  const missing = findTask(two.list, 'a9')
  expect(!missing.ok && missing.error).toBe('No subagent task "a9" in this session.')
})

test('the result tool shows the last steps and stderr when there is no out.md', () => {
  const task = taskOf({
    id: 'a1',
    agent: 'agy',
    label: 'fix it',
    endedAt: 5000,
    status: 'failed',
    code: 0,
    steps: [{ kind: 'note', id: 'n1', text: 'agy denied write_file' }],
    stderr: 'jetski: no output produced',
  })
  expect(formatResult(task, '', 5000)).toBe(
    [
      'agy task a1 (fix it): failed, 5s, exit code 0',
      'run directory: /tmp/d',
      '',
      'last steps:',
      'agy denied write_file',
      '',
      'stderr:',
      'jetski: no output produced',
    ].join('\n'),
  )
})

test('a step keeps at most MESSAGE_CHARS of a message', () => {
  const long = JSON.stringify({
    type: 'item.completed',
    item: { id: 'i', type: 'agent_message', text: 'x'.repeat(MESSAGE_CHARS + 5) },
  })
  const state = fold('codex', long)
  expect(state.steps[0]?.text.length).toBe(MESSAGE_CHARS)
})

test('agy steps with no step_index get ids of their own', () => {
  const tool = (name: string) =>
    JSON.stringify({
      event: 'step_update',
      step_update: { step_type: 'tool', state: 'DONE', tool_name: name },
    })
  const state = fold('agy', `${tool('read_file')}\n${tool('list_dir')}`)
  expect(state.steps.map(step => [step.id, step.text])).toEqual([
    ['s-1', 'read_file'],
    ['s-2', 'list_dir'],
  ])
})

test('an output line longer than LINE_CHARS is dropped and counted', () => {
  const idle = async () => {}
  const run = createRun(initialState('/repo'), '/tmp/d', {
    close: () => {},
    readFile: async () => '',
    kill: idle,
    sleep: idle,
  })
  expect(takeLines(run, 'x'.repeat(LINE_CHARS + 1))).toEqual({ lines: [], dropped: 1 })
  expect(run.partial).toBe('')
  expect(takeLines(run, '{"a":1}\n{"b"')).toEqual({ lines: ['{"a":1}'], dropped: 0 })
  expect(run.partial).toBe('{"b"')
})

test('the answer step is marked, so the pane does not draw it twice', () => {
  const long = 'z'.repeat(MESSAGE_CHARS + 100)
  const answer = JSON.stringify({
    type: 'item.completed',
    item: { id: 'last', type: 'agent_message', text: long },
  })
  expect(fold('codex', `${CODEX}${answer}`).answerId).toBe('last')
  expect(fold('agy', AGY).answerId).toBe('s3')
  const pi = fold('pi', PI)
  expect(pi.steps.find(step => step.id === pi.answerId)?.text).toBe(pi.out)
})

test('the result tool cuts a long out.md and names the file', () => {
  const task = taskOf({ agent: 'codex', endedAt: 0, status: 'done', code: 0 })
  const text = formatResult(task, 'y'.repeat(RESULT_TOOL_CHARS + 10), 0)
  expect(text).toContain(`[cut at ${RESULT_TOOL_CHARS} characters; the full text is in /tmp/d/out.md]`)
  expect(text).not.toContain('y'.repeat(RESULT_TOOL_CHARS + 1))
})
