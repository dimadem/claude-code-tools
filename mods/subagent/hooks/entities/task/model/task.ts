// Pure changes to the task list: add (ids are the agent's first letter and a
// number: c1, a2, p3), mark lost after a reload, copy the changed runs in, end,
// find.

import type { AgentName, Task, TaskStatus, TaskStep } from '../../../../types'
import { type Result, err, ok } from '../../../shared/lib'

type NewTask = { agent: AgentName; label: string; dir: string; at: number }

export function addTask(list: readonly Task[], spec: NewTask): { list: Task[]; task: Task } {
  const n = Math.max(0, ...list.map(one => Number(one.id.slice(1)) || 0)) + 1
  const task: Task = {
    id: `${spec.agent[0]}${n}`,
    agent: spec.agent,
    label: spec.label,
    dir: spec.dir,
    startedAt: spec.at,
    endedAt: null,
    status: 'running',
    code: null,
    sessionId: null,
    steps: [],
    result: null,
    stderr: '',
  }
  return { list: [...list, task], task }
}

export function markLost(list: readonly Task[], isLive: (id: string) => boolean, at: number): Task[] {
  return list.map(task => {
    if (task.status !== 'running' || isLive(task.id)) return task
    return { ...task, status: 'lost', endedAt: at }
  })
}

type Live = { steps: readonly TaskStep[]; sessionId: string | null; stderr: string }

export function withLive(list: readonly Task[], live: (id: string) => Live | null): Task[] {
  return list.map(task => {
    const run = live(task.id)
    if (run === null) return task
    return { ...task, steps: [...run.steps], sessionId: run.sessionId, stderr: run.stderr }
  })
}

type Ending = Live & { status: TaskStatus; code: number | null; result: string | null; at: number }

export function endTask(list: readonly Task[], id: string, end: Ending): Task[] {
  return list.map(task => {
    if (task.id !== id) return task
    return {
      ...task,
      status: end.status,
      code: end.code,
      sessionId: end.sessionId,
      steps: [...end.steps],
      result: end.result,
      stderr: end.stderr,
      endedAt: end.at,
    }
  })
}

export function findTask(list: readonly Task[], id: string): Result<Task, string> {
  const task = list.find(one => one.id === id)
  if (task === undefined) return err(`No subagent task "${id}" in this session.`)
  return ok(task)
}

export function taskElapsed(task: Task, at: number): string {
  const s = Math.max(0, Math.floor(((task.endedAt ?? at) - task.startedAt) / 1000))
  if (s < 60) return `${s}s`
  return `${Math.floor(s / 60)}m${String(s % 60).padStart(2, '0')}s`
}
