// A running child process and the job queue. The run tool queues a job and the
// session's dispatcher starts it, so the child outlives the tool call.
// - The child is `sh -c 'echo $$ > "$0/pid"; exec "$@"'`: stop kills it by that
//   pid, as closing the stream alone waits until the child next prints.
// - events.jsonl is cut by whole lines once it is twice EVENTS_CHARS; an output
//   line longer than LINE_CHARS is dropped and counted.
// - Unloading the module kills the children; session.start marks their tasks lost.

import type { ProcessSpawnRequest } from 'claude-code'

import type { Task, TaskStatus } from '../../../types'
import {
  END_WAIT_MS,
  EVENTS_CHARS,
  LINE_CHARS,
  PID_WAIT_MS,
  STDERR_CHARS,
  STOP_POLL_MS,
} from '../../shared/config'
import { unreachable } from '../../shared/lib'
import type { AgentState, Input } from '../agent'

type RunIo = {
  close: () => void
  readFile: (path: string) => Promise<string>
  kill: (pid: string) => Promise<void>
  sleep: (ms: number) => Promise<void>
}

export type Run = {
  state: AgentState
  readonly dir: string
  readonly io: RunIo
  readonly ended: Promise<void>
  readonly end: () => void
  isStopped: boolean
  events: string
  stderr: string
  partial: string
  drawn: AgentState | null
  drawnStderr: string
}

export type RunEnd =
  | { kind: 'exited'; code: number | null }
  | { kind: 'stopped' }
  | { kind: 'crashed'; reason: string }

export type Job = {
  task: Task
  argv: readonly string[]
  cwd: string
  input: Input
  before: string | null
}

export const runs = new Map<string, Run>()

const queue: Job[] = []
let wake = (): void => {}

export function enqueue(job: Job): void {
  queue.push(job)
  wake()
}

export async function takeJob(): Promise<Job> {
  for (;;) {
    const job = queue.shift()
    if (job !== undefined) return job
    await new Promise<void>(resolve => {
      wake = resolve
    })
  }
}

export function createRun(state: AgentState, dir: string, io: RunIo): Run {
  let end = (): void => {}
  const ended = new Promise<void>(resolve => {
    end = resolve
  })
  return {
    state,
    dir,
    io,
    ended,
    end,
    isStopped: false,
    events: '',
    stderr: '',
    partial: '',
    drawn: null,
    drawnStderr: '',
  }
}

export function spawnRequest(
  dir: string,
  argv: readonly string[],
  cwd: string,
  input: Input,
): ProcessSpawnRequest {
  switch (input.kind) {
    case 'stdin':
      return { argv: ['sh', '-c', 'echo $$ > "$0/pid"; exec "$@"', dir, ...argv], cwd, input: input.text }
    case 'closed':
      return { argv: ['sh', '-c', 'echo $$ > "$0/pid"; exec "$@" </dev/null', dir, ...argv], cwd }
    default:
      return unreachable(input)
  }
}

export function addStderr(run: Run, text: string): void {
  run.stderr = (run.stderr + text).slice(-STDERR_CHARS)
}

export function takeLines(run: Run, text: string): { lines: string[]; dropped: number } {
  run.events += text
  if (run.events.length > 2 * EVENTS_CHARS) {
    const cut = run.events.indexOf('\n', run.events.length - EVENTS_CHARS)
    if (cut === -1) run.events = run.events.slice(-EVENTS_CHARS)
    else run.events = run.events.slice(cut + 1)
  }
  let dropped = 0
  if (!text.includes('\n')) {
    run.partial += text
    if (run.partial.length > LINE_CHARS) {
      run.partial = ''
      dropped = 1
    }
    return { lines: [], dropped }
  }
  const lines = (run.partial + text).split('\n')
  run.partial = lines.pop() ?? ''
  return { lines: lines.filter(line => line.trim()), dropped }
}

export function restLine(run: Run): string[] {
  const rest = run.partial
  run.partial = ''
  if (!rest.trim()) return []
  return [rest]
}

function parsePid(text: string): string | null {
  const pid = text.trim()
  if (!/^\d+$/.test(pid)) return null
  return pid
}

export type StopOutcome =
  | { kind: 'not-running' }
  | { kind: 'stopped' }
  | { kind: 'no-pid' }
  | { kind: 'still-running' }

export async function stopRun(id: string): Promise<StopOutcome> {
  const run = runs.get(id)
  if (run === undefined) return { kind: 'not-running' }
  run.isStopped = true
  run.io.close()
  const readPid = async () => parsePid(await run.io.readFile(`${run.dir}/pid`).catch(() => ''))
  let pid = await readPid()
  for (let waited = 0; pid === null && waited < PID_WAIT_MS; waited += STOP_POLL_MS) {
    await run.io.sleep(STOP_POLL_MS)
    pid = await readPid()
  }
  if (pid === null) return { kind: 'no-pid' }
  await run.io.kill(pid).catch(() => {})
  const ended = run.ended.then(() => 'ended' as const)
  const waited = run.io.sleep(END_WAIT_MS).then(() => 'waited' as const)
  if ((await Promise.race([ended, waited])) === 'waited') return { kind: 'still-running' }
  return { kind: 'stopped' }
}

export function statusOf(end: RunEnd, out: string): TaskStatus {
  switch (end.kind) {
    case 'stopped':
      return 'stopped'
    case 'crashed':
      return 'failed'
    case 'exited':
      if (end.code === 0 && out) return 'done'
      return 'failed'
    default:
      return unreachable(end)
  }
}
