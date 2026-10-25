// The app layer and the one imperative file: every hook, every `$` call and the
// state atoms live here, as the validator reads an atom only in the file that
// makes it. The layers below are pure: widgets → features → entities → shared.
// - Change an atom's `shape` tag when its type changes: it declines older values.
// - session.start finds the agents, registers the tools, and runs a 1 s clock that
//   copies the changed runs into `tasks`, and a dispatcher that runs each queued
//   job. A second session.start (after /clear) cancels the first clock; the first
//   dispatcher then waits on the queue for good.
// - `stream.result` is handled right after the spawn: it rejects when the child
//   cannot start or is stopped. The generator's own `return` asks for a result,
//   so the stream is closed through an `AsyncGenerator<unknown, unknown>` view.
// - prompt.submit resolves with `drop` when the message did not enter; the
//   result then stays in the pane and with the result tool.
// - The ui.render matcher id is a literal, so the validator can list it.

import { atom, read, update } from 'claude-code'
import type { Register, Timer } from 'claude-code'

import type { Task } from '../types'
import {
  AGENTS,
  type Agent,
  addNote,
  agentByName,
  detectAgents,
  foldLine,
  initialState,
} from './entities/agent'
import {
  type Job,
  type Run,
  type RunEnd,
  addStderr,
  createRun,
  enqueue,
  restLine,
  runs,
  spawnRequest,
  statusOf,
  stopRun,
  takeJob,
  takeLines,
} from './entities/run'
import { addTask, endTask, findTask, markLost, withLive } from './entities/task'
import {
  completionText,
  describeStartError,
  describeStop,
  formatResult,
  planStart,
  readStartInput,
  resultTool,
  runTool,
  stopTool,
} from './features/tools'
import { LINE_CHARS, PANE, RESULT_CHARS, shadeOf } from './shared/config'
import { changedLines, ignore, settle, text } from './shared/lib'
import { renderPane } from './widgets/tasks-pane'

const tasks = atom({ plugin: 'subagent', key: 'tasks' } as const, [] as Task[], { shape: 'tasks-3' })
const now = atom({ plugin: 'subagent', key: 'now' } as const, 0)
const selected = atom({ plugin: 'subagent', key: 'selected' } as const, null as string | null)

let installed: readonly Agent[] = []

let ticker: Timer | null = null

function takeChanges(run: Run) {
  if (run.state === run.drawn && run.stderr === run.drawnStderr) return null
  run.drawn = run.state
  run.drawnStderr = run.stderr
  return { steps: run.state.steps, sessionId: run.state.sessionId, stderr: run.stderr }
}

export const register: Register = (on, options) => {
  const background = shadeOf(options.background)

  on('session.start', async ($, e, next) => {
    const found = await settle(
      $.process.run(
        ['sh', '-c', 'for a; do command -v "$a" >/dev/null 2>&1 && echo "$a"; done', 'sh'].concat(
          AGENTS.map(one => one.name),
        ),
      ),
    )
    let onPath = ''
    if (found.ok) onPath = found.value.stdout
    installed = detectAgents(onPath)
    const registered: Promise<unknown>[] = [
      $.command.register({ name: 'subagent', description: 'Show the subagent tasks pane' }),
    ]
    if (installed.length > 0) {
      registered.push(
        $.tool.register(runTool(installed)),
        $.tool.register(resultTool),
        $.tool.register(stopTool),
      )
    }
    await Promise.all(registered)
    const startedAt = await $.clock.now()
    await update($, tasks, list => markLost(list, id => runs.has(id), startedAt))
    const started = await next(e)

    const scrollToEnd = () => {
      $.ui.scroll({ in: PANE.id, to: { key: PANE.endKey } }).catch(ignore)
    }

    if (ticker !== null) ticker.cancel()
    ticker = $.clock.every(1000, () => {
      if (runs.size === 0) return
      void (async () => {
        const at = await $.clock.now()
        await update($, now, () => at)
        const changed = new Map<string, NonNullable<ReturnType<typeof takeChanges>>>()
        for (const [id, run] of runs) {
          const changes = takeChanges(run)
          if (changes !== null) changed.set(id, changes)
        }
        if (changed.size === 0) return
        await update($, tasks, list => withLive(list, id => changed.get(id) ?? null))
        const shown = await read($, selected)
        if (shown === null || changed.has(shown)) scrollToEnd()
      })()
    })

    const runJob = async (job: Job) => {
      const { task, argv, cwd, input, before } = job
      const agent = agentByName(task.agent)
      const stream = $.process.spawn(spawnRequest(task.dir, argv, cwd, input))
      const closable: AsyncGenerator<unknown, unknown> = stream
      const run = createRun(initialState(cwd), task.dir, {
        close: () => void closable.return(null),
        readFile: path => $.fs.read(path),
        kill: pid => $.process.run(['kill', '-TERM', pid]).then(ignore),
        sleep: ms => $.clock.sleep(ms),
      })
      runs.set(task.id, run)

      const pump = async (): Promise<RunEnd> => {
        const exit = settle(stream.result)
        const feed = (lines: string[]) => {
          for (const line of lines) run.state = foldLine(run.state, line, agent.reduce)
        }
        try {
          for await (const { stream: pipe, text: chunk } of stream) {
            if (pipe === 'stderr') {
              addStderr(run, chunk)
              continue
            }
            const taken = takeLines(run, chunk)
            feed(taken.lines)
            if (taken.dropped > 0) {
              run.state = addNote(run.state, `dropped an output line longer than ${LINE_CHARS} characters`)
            }
          }
          feed(restLine(run))
          const ended = await exit
          if (run.isStopped) return { kind: 'stopped' }
          let code: number | null = null
          if (ended.ok) code = ended.value.code
          return { kind: 'exited', code }
        } catch (error) {
          if (run.isStopped) return { kind: 'stopped' }
          return { kind: 'crashed', reason: String(error) }
        }
      }

      const end = await pump()
      runs.delete(task.id)
      run.end()
      if (end.kind === 'crashed') addStderr(run, `\n[subagent mod] ${end.reason}\n`)

      let changed: string[] = []
      if (before !== null) {
        const after = await settle($.process.run(['git', 'status', '--porcelain'], { cwd }))
        if (after.ok && after.value.exitCode === 0) changed = changedLines(before, after.value.stdout)
        if (changed.length > 0) {
          run.state = addNote(run.state, `git status changed while the task ran:\n${changed.join('\n')}`)
        }
      }

      const writes = [
        $.fs.write(`${task.dir}/events.jsonl`, run.events),
        $.fs.write(`${task.dir}/stderr`, run.stderr),
      ]
      let out = ''
      if (run.state.out !== null) {
        out = run.state.out.trim()
        writes.push($.fs.write(`${task.dir}/out.md`, run.state.out))
      } else out = (await $.fs.read(`${task.dir}/out.md`).catch(() => '')).trim()
      await Promise.all(writes.map(one => one.catch(ignore)))

      let steps = run.state.steps
      let result: string | null = null
      if (out) {
        steps = steps.filter(one => one.id !== run.state.answerId)
        result = out.slice(0, RESULT_CHARS)
      }
      const status = statusOf(end, out)
      let code: number | null = null
      if (end.kind === 'exited') code = end.code
      const endedAt = await $.clock.now()
      await update($, tasks, list =>
        endTask(list, task.id, {
          status,
          code,
          sessionId: run.state.sessionId,
          steps,
          result,
          stderr: run.stderr,
          at: endedAt,
        }),
      ).catch(ignore)
      scrollToEnd()

      $.ui.toast(`${agent.name} ${task.id} ${status}: ${task.label}`)
      $.ui.notify(`${task.label}: ${status}`, { title: `${agent.title} ${task.id}` }).catch(ignore)
      if (status === 'stopped') return

      const notes = steps.flatMap(one => {
        if (one.kind === 'note') return [one.text]
        return []
      })
      const sent = await settle(
        $.prompt.submit({
          text: completionText({ title: agent.title, task, status, code, out, notes, changed }),
        }),
      )
      if (!sent.ok || typeof sent.value.drop === 'string') {
        $.ui.toast(`subagent: ${task.id} ended, but its result did not reach Claude; ask for it`)
      }
    }

    void (async () => {
      for (;;) void runJob(await takeJob())
    })()

    return started
  })

  on('command.run', { command: 'subagent' }, async $ => {
    await $.ui.open({ id: PANE.id, title: PANE.title })
    return { text: 'Agents pane opened.' }
  })

  on('tool.call', { tool: 'mcp__subagent__run' }, async ($, e) => {
    const plan = planStart(readStartInput(e), installed)
    if (!plan.ok) return { deny: describeStartError(plan.error) }
    const { agent, prompt, label, mode } = plan.value

    const [cwd, tmpdir] = await Promise.all([$.session.cwd(), $.env.get('TMPDIR')])
    const tmp = (tmpdir ?? '/tmp').replace(/\/$/, '')
    const made = await $.process.run(['mktemp', '-d', `${tmp}/${agent.name}.XXXXXX`])
    if (made.exitCode !== 0)
      return { deny: describeStartError({ kind: 'no-run-dir', reason: made.stderr.trim() }) }
    const dir = made.stdout.trim()
    if (prompt) await $.fs.write(`${dir}/prompt.md`, prompt)
    const { argv, input } = agent.command({ prompt, mode, cwd, dir })

    let before: string | null = null
    if (agent.guardsWrites) {
      const status = await settle($.process.run(['git', 'status', '--porcelain'], { cwd }))
      if (status.ok && status.value.exitCode === 0) before = status.value.stdout
    }

    const createdAt = await $.clock.now()
    let task: Task | null = null
    await update($, tasks, list => {
      const added = addTask(list, { agent: agent.name, label, dir, at: createdAt })
      task = added.task
      return added.list
    })
    if (task === null) return { deny: describeStartError({ kind: 'not-recorded' }) }
    const started: Task = task
    await update($, selected, () => null)

    enqueue({ task: started, argv, cwd, input, before })
    $.ui.open({ id: PANE.id, title: PANE.title }).catch(ignore)

    return {
      result:
        `Started ${agent.title} task ${started.id} (${label}) in the background. ` +
        `Its result arrives as a message from the subagent plugin when it ends. Run directory: ${dir}`,
    }
  }).catch(() => ({ deny: 'The subagent mod failed to start the task; run claude --debug for the reason.' }))

  on('tool.call', { tool: 'mcp__subagent__stop' }, async ($, e) => {
    const found = findTask(await read($, tasks), text(e, 'id').trim())
    if (!found.ok) return { deny: found.error }
    const outcome = await stopRun(found.value.id)
    if (outcome.kind === 'not-running') return { deny: describeStop(outcome, found.value) }
    return { result: describeStop(outcome, found.value) }
  }).catch(() => ({ deny: 'The subagent mod failed to stop the task; run claude --debug for the reason.' }))

  on('tool.call', { tool: 'mcp__subagent__result' }, async ($, e) => {
    const found = findTask(await read($, tasks), text(e, 'id').trim())
    if (!found.ok) return { deny: found.error }
    const task = found.value
    let out = ''
    if (task.status !== 'running') {
      out = (await $.fs.read(`${task.dir}/out.md`).catch(() => task.result ?? '')).trim()
    }
    return { result: formatResult(task, out, await $.clock.now()) }
  }).catch(() => ({ deny: 'The subagent mod failed to read the task; run claude --debug for the reason.' }))

  on('ui.render', { component: 'Pane', requestId: 'subagent' satisfies typeof PANE.id }, async ($, e) => {
    const [list, chosen, ticked] = await Promise.all([read($, tasks), read($, selected), read($, now)])
    return renderPane(
      $.ui.resolve(e),
      {
        tasks: list,
        selected: chosen,
        at: ticked || (await $.clock.now()),
        background,
        columns: e.props.bodyColumns,
        rows: e.props.scroll.bodyRows,
      },
      {
        select: id => {
          update($, selected, () => id).catch(ignore)
        },
        stop: id => {
          stopRun(id).catch(ignore)
        },
      },
    )
  })
}
