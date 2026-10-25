// Events codex, agy and pi printed in real runs, cut down: a short run of each,
// and agy with a denied write (no answer).

const lines = (events: object[]) => `${events.map(event => JSON.stringify(event)).join('\n')}\n`

export const CODEX = lines([
  { type: 'thread.started', thread_id: 'thr-1' },
  { type: 'turn.started' },
  { type: 'item.completed', item: { id: 'item_0', type: 'agent_message', text: 'I will read the parser.' } },
  {
    type: 'item.started',
    item: {
      id: 'item_1',
      type: 'command_execution',
      command: "/bin/bash -lc 'rg -n parse src'",
      status: 'in_progress',
    },
  },
  {
    type: 'item.completed',
    item: {
      id: 'item_1',
      type: 'command_execution',
      command: "/bin/bash -lc 'rg -n parse src'",
      aggregated_output: 'src/a.ts:1: parse\n',
      exit_code: 0,
      status: 'completed',
    },
  },
  { type: 'item.completed', item: { id: 'item_2', type: 'agent_message', text: '**No problems found.**' } },
  { type: 'turn.completed', usage: { input_tokens: 10, output_tokens: 2 } },
])

const AGY_STEP = { conversation_id: 'conv-1' }
const AGY_READ = { name: 'read_file', parameters: { Path: '/repo/calc.py' } }
export const AGY_ANSWER = '`add` in calc.py subtracts `b` from `a`.\nChange it to `return a + b`.\n'
export const AGY = lines([
  { event: 'init', conversation_id: 'conv-1', init: { cwd: '/repo', tools: ['read_file'] } },
  {
    event: 'step_update',
    step_update: { ...AGY_STEP, step_index: 0, state: 'DONE', step_type: 'user_input' },
  },
  {
    event: 'step_update',
    step_update: {
      ...AGY_STEP,
      step_index: 2,
      state: 'ACTIVE',
      step_type: 'tool',
      tool_name: 'read_file',
      tool_info: AGY_READ,
    },
  },
  {
    event: 'step_update',
    step_update: {
      ...AGY_STEP,
      step_index: 2,
      state: 'DONE',
      step_type: 'tool',
      tool_name: 'read_file',
      tool_info: AGY_READ,
    },
  },
  {
    event: 'step_update',
    step_update: {
      ...AGY_STEP,
      step_index: 3,
      state: 'ACTIVE',
      step_type: 'agent_response',
      text_delta: AGY_ANSWER.slice(0, 20),
    },
  },
  {
    event: 'step_update',
    step_update: {
      ...AGY_STEP,
      step_index: 3,
      state: 'DONE',
      step_type: 'agent_response',
      text_delta: AGY_ANSWER.slice(20),
    },
  },
  { event: 'result', result: { ...AGY_STEP, status: 'SUCCESS', response: AGY_ANSWER, num_turns: 1 } },
])

export const AGY_DENIED = lines([
  { event: 'init', conversation_id: 'conv-2' },
  {
    event: 'result',
    result: {
      conversation_id: 'conv-2',
      status: 'SUCCESS',
      response: '',
      denied_actions: [{ action: 'write_file', display_name: 'EditFile' }],
    },
  },
])

export const PI = lines([
  { type: 'session', version: 3, id: 'sess-1', cwd: '/repo' },
  { type: 'agent_start' },
  { type: 'turn_start' },
  { type: 'message_end', message: { role: 'user', content: [{ type: 'text', text: 'Review x' }] } },
  { type: 'message_update', message: { role: 'assistant', content: [{ type: 'text', text: 'I' }] } },
  {
    type: 'message_end',
    message: {
      role: 'assistant',
      content: [
        { type: 'thinking', thinking: 'read it' },
        { type: 'text', text: 'Let me read calc.py.' },
        { type: 'toolCall', id: 'functions.read:0', name: 'read', arguments: { path: 'calc.py' } },
      ],
      stopReason: 'toolUse',
    },
  },
  {
    type: 'tool_execution_start',
    toolCallId: 'functions.read:0',
    toolName: 'read',
    args: { path: 'calc.py' },
  },
  {
    type: 'tool_execution_end',
    toolCallId: 'functions.read:0',
    toolName: 'read',
    result: { content: [{ type: 'text', text: 'def add(a, b):\n    return a - b\n' }] },
    isError: false,
  },
  {
    type: 'message_end',
    message: {
      role: 'assistant',
      content: [{ type: 'text', text: '`add` returns `a - b`.' }],
      stopReason: 'stop',
    },
  },
  { type: 'turn_end' },
  { type: 'agent_end' },
])
