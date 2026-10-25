// The mod's type contract. Each Task field is always there; null says "none yet".
// McpToolInputs keeps the optional fields the model may leave out; the mod reads
// each one with shared/lib/json.

export type AgentName = 'codex' | 'agy' | 'pi'

export type TaskStatus = 'running' | 'done' | 'failed' | 'stopped' | 'lost'

export type StepStatus = 'running' | 'ok' | 'failed'

export type TaskStep =
  | { kind: 'message'; id: string; text: string }
  | {
      kind: 'tool'
      id: string
      text: string
      status: StepStatus
      exitCode: number | null
    }
  | { kind: 'note'; id: string; text: string }

export type Task = {
  id: string
  agent: AgentName
  label: string
  dir: string
  startedAt: number
  endedAt: number | null
  status: TaskStatus
  code: number | null
  sessionId: string | null
  steps: TaskStep[]
  result: string | null
  stderr: string
}

declare module 'claude-code' {
  interface McpToolInputs {
    mcp__subagent__run: { agent?: AgentName; prompt?: string; label: string; review?: string }
    mcp__subagent__result: { id: string }
    mcp__subagent__stop: { id: string }
  }
  interface PluginState {
    subagent: {
      tasks: Shaped<Task[]>
      now: number
      selected: string | null
    }
  }
}
