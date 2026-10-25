// The adapters by name (a Record, so a new AgentName fails the type check until
// it has an adapter), and the ones `command -v` found on PATH.

import type { AgentName } from '../../../../types'
import { agy } from '../adapters/agy'
import { codex } from '../adapters/codex'
import { pi } from '../adapters/pi'
import type { Agent } from './types'

const BY_NAME: Record<AgentName, Agent> = { codex, agy, pi }

export const AGENTS: readonly Agent[] = Object.values(BY_NAME)

export const agentByName = (name: AgentName): Agent => BY_NAME[name]

export const detectAgents = (stdout: string): readonly Agent[] => {
  const names = stdout.split('\n')
  return AGENTS.filter(one => names.includes(one.name))
}
