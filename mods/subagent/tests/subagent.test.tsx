// Tests through the engine. `engine()` answers each `$` noun from memory; its
// Host says what `command -v` and each `git status` print, which writes fail and
// whether prompts are dropped. `prints()` is a spawn that prints a fixture split
// mid-line. `until()` moves the mock clock; the stop tool sleeps on that clock,
// so its test moves the clock while the call waits.

import type { On } from 'claude-code'
import { expect, mock, test } from 'claude-code/testing'

import { AGY, AGY_ANSWER, AGY_DENIED, CODEX, PI } from './fixtures'

const PANE = {
  plugin: 'subagent',
  component: 'Pane',
  requestId: 'subagent',
  props: {
    title: 'Agents',
    isFocused: false,
    bodyColumns: 60,
    placement: 'dock',
    scroll: { offset: 0, bodyRows: 20 },
    view: {},
  },
} as const

const DIR = '/tmp/run.T1'
const RAN = { exitCode: 0, stdout: '', stderr: '', isStdoutTruncated: false, isStderrTruncated: false }
const START = { cwd: '/repo', surface: 'terminal', isInteractive: true } as const

type Engine = {
  files: Record<string, string>
  spawned: { argv: readonly string[]; input: string | null }[]
  kills: (readonly string[])[]
  submitted: string[]
  toasts: string[]
}

type Host = { agents: string; statuses: string[]; unwritable: string[]; refusesPrompts: boolean }
const ALL_AGENTS: Host = { agents: 'codex\nagy\npi\n', statuses: [], unwritable: [], refusesPrompts: false }

function processOutput(argv: readonly string[], host: Host): string {
  switch (argv[0]) {
    case 'sh':
      return host.agents
    case 'mktemp':
      return `${DIR}\n`
    case 'git':
      return host.statuses.shift() ?? ''
    default:
      return ''
  }
}

function engine(on: On, host: Host = ALL_AGENTS): Engine {
  const it: Engine = { files: {}, spawned: [], kills: [], submitted: [], toasts: [] }
  mock.env(on, { TMPDIR: '/tmp/' })
  on('tool.register', (_, e) => ({ value: { tool: `mcp__subagent__${e.name}` } }))
  on('command.register', () => ({ value: { command: 'subagent' } }))
  on('ui.open', () => ({ value: { isPlaced: true } }))
  on('ui.scroll', () => ({}))
  on('session.start', (_, e) => ({ cwd: e.cwd }))
  on('session.cwd', () => ({ value: '/repo' }))
  on('process.run', (_, e) => {
    if (e.argv[0] === 'kill') it.kills.push(e.argv)
    return { value: { ...RAN, stdout: processOutput(e.argv, host) } }
  })
  on('fs.write', (_, e) => {
    if (host.unwritable.includes(e.path)) return { deny: `cannot write ${e.path}` }
    it.files[e.path] = e.text
    return { value: undefined }
  })
  on('fs.read', (_, e) => {
    const text = it.files[e.path]
    if (text === undefined) return { deny: `no file ${e.path}` }
    return { value: text }
  })
  on('ui.toast', (_, e) => {
    it.toasts.push(e.text)
    return { value: undefined }
  })
  on('ui.notify', () => ({ value: { isSent: true, channel: 'terminal_bell' } }))
  on('prompt.submit', (_, e) => {
    if (host.refusesPrompts) return { drop: 'no prompts now' }
    it.submitted.push(e.text)
    return { text: e.text }
  })
  return it
}

async function until(clock: { advance: (ms: number) => Promise<unknown> }, isDone: () => boolean) {
  for (let i = 0; i < 20 && !isDone(); i++) await clock.advance(1000)
}

function prints(on: On, it: Engine, stdout: string, out: string | null, stderr: string) {
  on('process.spawn', async function* (_, e) {
    it.spawned.push({ argv: e.argv, input: e.input ?? null })
    if (stderr) yield { stream: 'stderr' as const, text: stderr }
    yield { stream: 'stdout' as const, text: stdout.slice(0, 70) }
    yield { stream: 'stdout' as const, text: stdout.slice(70) }
    if (out !== null) it.files[`${DIR}/out.md`] = out
    return { value: { code: 0, signal: null } }
  })
}

test('a codex task runs read-only, shows its steps and sends its result to the model', async ($, on) => {
  const it = engine(on)
  const clock = mock.clock(on)
  prints(on, it, CODEX, '**No problems found.**', 'Reading additional input from stdin...\n')

  await $.session.start(START)
  const started = await $.tool.call({
    tool: 'mcp__subagent__run',
    agent: 'codex',
    label: 'check parser',
    prompt: 'Review x',
  })
  expect(JSON.stringify(started)).toContain('Started Codex task c1')

  await until(clock, () => it.submitted.length > 0)

  expect(it.spawned[0]?.argv.slice(0, 4)).toEqual(['sh', '-c', 'echo $$ > "$0/pid"; exec "$@"', DIR])
  expect(it.spawned[0]?.argv.slice(4)).toEqual([
    'codex',
    'exec',
    '--json',
    '-C',
    '/repo',
    '-s',
    'read-only',
    '--color',
    'never',
    '-o',
    `${DIR}/out.md`,
    '--skip-git-repo-check',
    '-',
  ])
  expect(it.spawned[0]?.input).toBe('Review x')
  expect(it.files[`${DIR}/prompt.md`]).toBe('Review x')
  expect(it.files[`${DIR}/events.jsonl`]).toContain('thr-1')
  expect(it.files[`${DIR}/stderr`]).toContain('Reading additional input')
  expect(it.submitted[0]).toContain('Codex task c1 (check parser) ended: done, exit code 0.')
  expect(it.submitted[0]).toContain('**No problems found.**')

  const ui = await $.ui.mount({ ...PANE, surface: 'terminal' })
  expect((await ui.find({ key: 'task-c1' }))?.text).toMatch(/c1 codex check parser done \d+s/)
  expect((await ui.find({ type: 'Text', text: /rg -n parse src/ }))?.text).toBe('$ rg -n parse src')
  expect((await ui.find({ type: 'Markdown', text: /I will read/ }))?.text).toBe('I will read the parser.')
  expect((await ui.find({ type: 'Text', text: /^Result$/ }))?.text).toBe('Result')
  await ui.unmount()

  const result = await $.tool.call({ tool: 'mcp__subagent__result', id: 'c1' })
  expect(JSON.stringify(result)).toContain('codex session: thr-1')
})

test('an agy task gets its prompt as an argument and no stdin, and its answer becomes out.md', async ($, on) => {
  const it = engine(on, { ...ALL_AGENTS, statuses: ['', ' M calc.py\n'] })
  const clock = mock.clock(on)
  prints(on, it, AGY, null, '')

  await $.session.start(START)
  const started = await $.tool.call({
    tool: 'mcp__subagent__run',
    agent: 'agy',
    label: 'find the bug',
    prompt: '-read calc.py',
  })
  expect(JSON.stringify(started)).toContain('Started Antigravity task a1')
  await until(clock, () => it.submitted.length > 0)

  expect(it.spawned[0]?.argv.slice(2, 4)).toEqual(['echo $$ > "$0/pid"; exec "$@" </dev/null', DIR])
  expect(it.spawned[0]?.argv.slice(4, 10)).toEqual([
    'agy',
    '-p',
    '-read calc.py',
    '--add-dir',
    '/repo',
    '--effort',
  ])
  expect(it.spawned[0]?.input).toBeNull()
  expect(it.files[`${DIR}/out.md`]).toBe(AGY_ANSWER)
  expect(it.submitted[0]).toContain('Antigravity task a1 (find the bug) ended: done, exit code 0.')
  expect(it.submitted[0]).toContain('Change it to `return a + b`.')
  expect(it.submitted[0]).toContain(
    'Warning: git status changed while it ran (by the agent or by another writer; a file that was already changed before is not checked again):\n M calc.py',
  )

  const ui = await $.ui.mount({ ...PANE, surface: 'terminal' })
  expect((await ui.find({ type: 'Text', text: /read_file/ }))?.text).toBe('read_file calc.py')
  await ui.unmount()

  const result = await $.tool.call({ tool: 'mcp__subagent__result', id: 'a1' })
  expect(JSON.stringify(result)).toContain('agy session: conv-1')
})

test('an agy task with a denied write ends failed and says why', async ($, on) => {
  const it = engine(on)
  const clock = mock.clock(on)
  prints(on, it, AGY_DENIED, null, '')

  await $.session.start(START)
  await $.tool.call({ tool: 'mcp__subagent__run', agent: 'agy', label: 'fix it', prompt: 'Fix calc.py' })
  await until(clock, () => it.submitted.length > 0)

  expect(it.submitted[0]).toContain('Antigravity task a1 (fix it) ended: failed, exit code 0.')
  expect(it.submitted[0]).toContain('agy denied write_file')
})

test('a pi task gets only the read tools, and its last message is the result', async ($, on) => {
  const it = engine(on)
  const clock = mock.clock(on)
  prints(on, it, PI, null, '')

  await $.session.start(START)
  await $.tool.call({ tool: 'mcp__subagent__run', agent: 'pi', label: 'find the bug', prompt: 'Review x' })
  await until(clock, () => it.submitted.length > 0)

  const argv = it.spawned[0]?.argv.slice(4) ?? []
  expect(argv.slice(0, 6)).toEqual(['pi', '-p', '--mode', 'json', '--tools', 'read,grep,find,ls'])
  expect(argv).toContain('--no-mcp')
  expect(argv).toContain('--no-extensions')
  expect(it.spawned[0]?.input).toBe('Review x')
  expect(it.files[`${DIR}/out.md`]).toBe('`add` returns `a - b`.')
  expect(it.submitted[0]).toContain('pi task p1 (find the bug) ended: done, exit code 0.')

  const ui = await $.ui.mount({ ...PANE, surface: 'terminal' })
  expect((await ui.find({ type: 'Text', text: /^read / }))?.text).toBe('read calc.py')
  expect((await ui.find({ type: 'Markdown', text: /Let me read/ }))?.text).toBe('Let me read calc.py.')
  await ui.unmount()
})

test('a review passes its scope to codex review', async ($, on) => {
  const it = engine(on)
  const clock = mock.clock(on)
  on('process.spawn', async function* (_, e) {
    it.spawned.push({ argv: e.argv, input: e.input ?? null })
    yield { stream: 'stderr' as const, text: 'no changes against main\n' }
    return { value: { code: 1, signal: null } }
  })

  await $.session.start(START)
  await $.tool.call({ tool: 'mcp__subagent__run', agent: 'codex', label: 'review', review: 'base:main' })
  await clock.advance(1000)

  expect(it.spawned[0]?.argv.slice(-3)).toEqual(['review', '--base', 'main'])
})

test('an agent that cannot start ends the task as failed and tells the model', async ($, on) => {
  const it = engine(on)
  const clock = mock.clock(on)
  on('process.spawn', async function* () {
    yield* []
    return { deny: 'codex: command not found' }
  })

  await $.session.start(START)
  await $.tool.call({ tool: 'mcp__subagent__run', agent: 'codex', label: 'no codex', prompt: 'x' })
  await until(clock, () => it.submitted.length > 0)

  expect(it.submitted[0]).toContain('Codex task c1 (no codex) ended: failed.')
  const result = await $.tool.call({ tool: 'mcp__subagent__result', id: 'c1' })
  expect(JSON.stringify(result)).toContain('codex: command not found')
})

test('the stop tool waits for a late pid file, kills a silent agent and sends no result', async ($, on) => {
  const it = engine(on)
  const clock = mock.clock(on)
  on('process.spawn', async function* () {
    yield {
      stream: 'stdout' as const,
      text: `${JSON.stringify({ type: 'thread.started', thread_id: 't' })}\n`,
    }
    await clock.sleep(300)
    it.files[`${DIR}/pid`] = '4242\n'
    while (it.kills.length === 0) await clock.sleep(100)
    return { value: { code: null, signal: 'SIGTERM' } }
  })

  await $.session.start(START)
  await $.tool.call({ tool: 'mcp__subagent__run', agent: 'codex', label: 'long task', prompt: 'x' })
  await clock.advance(10)

  let stopped: unknown = null
  const stopping = $.tool.call({ tool: 'mcp__subagent__stop', id: 'c1' }).then(answer => {
    stopped = answer
  })
  for (let i = 0; i < 80 && stopped === null; i++) await clock.advance(100)
  await stopping
  expect(JSON.stringify(stopped)).toContain('Stopped task c1 (long task).')
  expect(it.kills).toEqual([['kill', '-TERM', '4242']])

  const result = await $.tool.call({ tool: 'mcp__subagent__result', id: 'c1' })
  expect(JSON.stringify(result)).toContain('task c1 (long task): stopped')
  expect(it.submitted).toEqual([])

  const again = await $.tool.call({ tool: 'mcp__subagent__stop', id: 'c1' })
  expect(JSON.stringify(again)).toContain('is not running: it is stopped')
})

test('an answer from an event counts when out.md cannot be written', async ($, on) => {
  const it = engine(on, { ...ALL_AGENTS, unwritable: [`${DIR}/out.md`] })
  const clock = mock.clock(on)
  prints(on, it, PI, null, '')

  await $.session.start(START)
  await $.tool.call({ tool: 'mcp__subagent__run', agent: 'pi', label: 'find the bug', prompt: 'Review x' })
  await until(clock, () => it.submitted.length > 0)

  expect(it.submitted[0]).toContain('pi task p1 (find the bug) ended: done, exit code 0.')
  const result = await $.tool.call({ tool: 'mcp__subagent__result', id: 'p1' })
  expect(JSON.stringify(result)).toContain('`add` returns `a - b`.')
})

test('a refused result message leaves a toast that says so', async ($, on) => {
  const it = engine(on, { ...ALL_AGENTS, refusesPrompts: true })
  const clock = mock.clock(on)
  prints(on, it, PI, null, '')

  await $.session.start(START)
  await $.tool.call({ tool: 'mcp__subagent__run', agent: 'pi', label: 'find the bug', prompt: 'Review x' })
  await until(clock, () => it.toasts.some(one => one.includes('did not reach')))

  expect(it.toasts).toContain('subagent: p1 ended, but its result did not reach Claude; ask for it')
})

test('bad calls are refused: a bad scope, a review for pi, an agent not installed', async ($, on) => {
  engine(on, { ...ALL_AGENTS, agents: 'codex\npi\n' })
  mock.clock(on)
  await $.session.start(START)
  const scope = await $.tool.call({ tool: 'mcp__subagent__run', agent: 'codex', label: 'x', review: 'main' })
  expect(JSON.stringify(scope)).toContain('review must be')
  const review = await $.tool.call({
    tool: 'mcp__subagent__run',
    agent: 'pi',
    label: 'x',
    review: 'uncommitted',
  })
  expect(JSON.stringify(review)).toContain('pi cannot do a review')
  const missing = await $.tool.call({ tool: 'mcp__subagent__run', agent: 'agy', label: 'x', prompt: 'x' })
  expect(JSON.stringify(missing)).toContain('agent must be one of: codex, pi.')
})

test('the pane says when there is no task', async ($, on) => {
  mock.clock(on)
  const ui = await $.ui.mount({ ...PANE, surface: 'desktop' })
  expect((await ui.find({ type: 'Text' }))?.text).toBe(
    'No subagent tasks yet. Ask Claude to give one to codex, agy or pi.',
  )
  await ui.unmount()
})
