// The Agents pane as a pure view: the elements every surface carries, the data
// and the press callbacks in, a tree out. It shows one task in full (the
// selected one, else the latest), then the others as rows to press.

import type { BoxProps, ButtonProps, ElementConstructor, MarkdownProps, TextProps } from 'claude-code'

import type { StepStatus, Task, TaskStatus, TaskStep } from '../../../types'
import { AGENTS, agentByName } from '../../entities/agent'
import { taskElapsed } from '../../entities/task'
import { PANE, PANE_CHARS } from '../../shared/config'
import { oneOf } from '../../shared/lib'

type PaneElements = {
  Box: ElementConstructor<BoxProps>
  Text: ElementConstructor<TextProps>
  Button: ElementConstructor<ButtonProps>
  Markdown: ElementConstructor<MarkdownProps>
}

type PaneProps = {
  tasks: readonly Task[]
  selected: string | null
  at: number
  background: string | null
  columns: number
  rows: number
}

type PaneActions = { select: (id: string) => void; stop: (id: string) => void }

const MARK: Record<TaskStatus, [string, string]> = {
  running: ['●', 'yellow'],
  done: ['✓', 'green'],
  failed: ['✗', 'red'],
  stopped: ['■', 'gray'],
  lost: ['?', 'gray'],
}

const STEP_MARK: Record<StepStatus, [string, string]> = {
  running: ['…', 'yellow'],
  ok: ['✓', 'green'],
  failed: ['✗', 'red'],
}

function fillOf(props: PaneProps): BoxProps {
  const fill: BoxProps = { width: props.columns, minHeight: props.rows }
  if (props.background === null) return fill
  return { ...fill, backgroundColor: props.background }
}

function shownOf(tasks: readonly Task[], selected: string | null): Task | null {
  return tasks.find(one => one.id === selected) ?? tasks.at(-1) ?? null
}

function exitText(step: Extract<TaskStep, { kind: 'tool' }>): string {
  if (step.status !== 'failed' || step.exitCode === null) return ''
  return ` (exit ${step.exitCode})`
}

function visibleSteps(steps: readonly TaskStep[], budget: number): TaskStep[] {
  let chars = 0
  let from = steps.length
  while (from > 0) {
    const step = steps[from - 1]
    if (step === undefined || chars + step.text.length > budget) break
    chars += step.text.length
    from -= 1
  }
  return steps.slice(from)
}

const EMPTY = `No subagent tasks yet. Ask Claude to give one to ${oneOf(AGENTS.map(one => one.name))}.`

export function renderPane(ui: PaneElements, props: PaneProps, actions: PaneActions) {
  const { Box, Text, Button, Markdown } = ui
  const { tasks, at } = props
  const shown = shownOf(tasks, props.selected)
  const fill = fillOf(props)
  if (shown === null) {
    return (
      <Box {...fill}>
        <Text dimColor>{EMPTY}</Text>
      </Box>
    )
  }

  const header = (task: Task) => (
    <Box key={`row-${task.id}`} flexDirection="row" gap={1}>
      <Button key={`task-${task.id}`} plain onPress={() => actions.select(task.id)}>
        <Text color={MARK[task.status][1]}>{MARK[task.status][0]}</Text> <Text weight="bold">{task.id}</Text>{' '}
        <Text color="cyan">{task.agent}</Text> {task.label}{' '}
        <Text dimColor>{`${task.status} ${taskElapsed(task, at)}`}</Text>
      </Button>
      {task.status === 'running' && (
        <Button key={`stop-${task.id}`} dimColor onPress={() => actions.stop(task.id)}>
          stop
        </Button>
      )}
    </Box>
  )

  const renderStep = (one: TaskStep) => {
    switch (one.kind) {
      case 'message':
        return (
          <Box key={one.id} paddingLeft={2}>
            <Markdown text={one.text} />
          </Box>
        )
      case 'note':
        return (
          <Box key={one.id} paddingLeft={2}>
            <Text dimColor>{one.text}</Text>
          </Box>
        )
      case 'tool': {
        const [icon, color] = STEP_MARK[one.status]
        return (
          <Box key={one.id} flexDirection="row" gap={1} paddingLeft={2}>
            <Text color={color}>{icon}</Text>
            <Text dimColor>
              {one.text}
              {exitText(one)}
            </Text>
          </Box>
        )
      }
    }
  }

  const others = tasks.filter(one => one !== shown).reverse()
  return (
    <Box flexDirection="column" {...fill}>
      {header(shown)}
      {visibleSteps(shown.steps, PANE_CHARS - (shown.result ?? '').length).map(renderStep)}
      {shown.status === 'running' && shown.steps.length === 0 && (
        <Box paddingLeft={2}>
          <Text dimColor>{`${agentByName(shown.agent).title} is starting…`}</Text>
        </Box>
      )}
      {shown.result && (
        <Box flexDirection="column" marginTop={1}>
          <Text weight="bold">Result</Text>
          <Markdown text={shown.result} />
        </Box>
      )}
      {shown.status === 'failed' && !shown.result && shown.stderr.trim() && (
        <Box flexDirection="column" marginTop={1}>
          <Text color="red">stderr</Text>
          <Text dimColor>{shown.stderr.trim().split('\n').slice(-12).join('\n')}</Text>
        </Box>
      )}
      <Box key={PANE.endKey} />
      {others.length > 0 && (
        <Box flexDirection="column" marginTop={1}>
          <Text dimColor>Other tasks (press one to show it)</Text>
          {others.map(header)}
        </Box>
      )}
    </Box>
  )
}
