// An agent: how to start it (argv and stdin) and a pure reducer from one JSON
// event of its output to AgentState. `out` and `answerId` are the answer and its
// step: codex writes out.md itself, agy and pi give the answer in an event.
// `guardsWrites`: the agent has no read-only sandbox, so the mod compares
// git status before and after the run.

import type { AgentName, TaskStep } from '../../../../types'

export type AgentState = {
  readonly cwd: string
  readonly steps: readonly TaskStep[]
  readonly sessionId: string | null
  readonly out: string | null
  readonly answerId: string | null
  readonly seq: number
}

export type Mode = { readonly kind: 'exec' } | { readonly kind: 'review'; readonly args: readonly string[] }

export type Input = { readonly kind: 'stdin'; readonly text: string } | { readonly kind: 'closed' }

type Command = { readonly argv: readonly string[]; readonly input: Input }

export type Agent = {
  readonly name: AgentName
  readonly title: string
  readonly hint: string
  readonly canReview: boolean
  readonly guardsWrites: boolean
  readonly maxPromptChars: number
  readonly command: (request: { prompt: string; mode: Mode; cwd: string; dir: string }) => Command
  readonly reduce: (state: AgentState, event: unknown) => AgentState
}
