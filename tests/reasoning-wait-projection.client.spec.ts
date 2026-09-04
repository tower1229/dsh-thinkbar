import type {
  ProjectionMatch,
  ProjectionNodeContext,
  ProjectionViewNode,
} from '../src/client/reasoning-wait-projection.ts'
import { describe, expect, it } from 'vitest'
import {
  reasoningWaitDefinition,
  reasoningWaitView,
  type ReasoningWaitProjection,
} from '../src/client/reasoning-wait-projection.ts'

function match(event: object, role: 'start' | 'update' = 'update'): ProjectionMatch {
  return { event, role, location: { kind: 'unresolved' } } as unknown as ProjectionMatch
}

function stepStart(time = 1_000): ProjectionMatch {
  return match({ type: 'step/start', seq: 1, time, data: { turn: 1, step: 1 } }, 'start')
}

function context<State>(state: State | undefined, matches: readonly ProjectionMatch[]): ProjectionNodeContext<State> {
  return {
    key: 'dsh-thinkbar/reasoning-wait:1:1',
    kind: 'dsh-thinkbar/reasoning-wait',
    id: '1:1',
    matches,
    start: matches[0],
    state,
    current: new Map(),
  }
}

function startState() {
  const start = stepStart()
  return reasoningWaitDefinition.start(context(undefined, [start]) as never, start, { previous: () => undefined })
}

function update(state: ReturnType<typeof startState>, event: object) {
  const next = match(event)
  const current = context(state, [stepStart(), next]) as ProjectionNodeContext<typeof state> & {
    readonly state: typeof state
  }
  return reasoningWaitDefinition.update(current, next)
}

function projection(state: ReturnType<typeof startState>, lastEvent: object): ReasoningWaitProjection {
  const node = reasoningWaitDefinition.buildViewNode?.(context(state, [stepStart(), match(lastEvent)]))
  if (node === null || node === undefined) throw new Error('expected projection node')
  return node.data as ReasoningWaitProjection
}

function event(type: string, seq: number, time: number, data: object): object {
  return { type, seq, time, data }
}

describe('reasoningWaitDefinition', () => {
  it('starts the user-visible thinking window at Step start and keeps it for reasoning evidence', () => {
    const state = startState()
    expect(projection(state, stepStart().event)).toEqual({
      turn: 1, step: 1, waitOrigin: 1_000, streamTime: 1_000, active: true, tailKind: 'empty',
      tools: [],
    })
    const reasoningEvent = event('assistant/chunk', 2, 3_000, {
      turn: 1, step: 1, chunk: { type: 'reasoning-delta', index: 0, text: 'plan' },
    })
    const reasoning = update(state, reasoningEvent)
    expect(projection(reasoning, reasoningEvent)).toMatchObject({
      active: true, waitOrigin: 1_000, streamTime: 3_000, tailKind: 'reasoning',
    })
  })

  it('closes on text, tool, final message, and step end', () => {
    const activeEvent = event('assistant/chunk', 2, 2_000, {
      turn: 1, step: 1, chunk: { type: 'block-start', index: 0, blockType: 'reasoning' },
    })
    const active = update(startState(), activeEvent)
    for (const closing of [
      event('assistant/chunk', 3, 3_000, { turn: 1, step: 1, chunk: { type: 'text-delta', index: 1, text: 'done' } }),
      event('assistant/chunk', 3, 3_000, { turn: 1, step: 1, chunk: { type: 'tool-call-delta', index: 1, id: 'c1', argumentsDelta: '{}' } }),
      event('assistant/message', 3, 3_000, { turn: 1, step: 1, message: { id: 'm1', role: 'assistant', content: [] } }),
      event('step/end', 3, 3_000, { turn: 1, step: 1 }),
    ]) {
      expect(projection(update(active, closing), closing)).toMatchObject({ active: false })
    }
  })

  it('ends the thinking window when direct text or a Tool call starts streaming', () => {
    const text = event('assistant/chunk', 2, 2_000, {
      turn: 1, step: 1, chunk: { type: 'block-start', index: 0, blockType: 'text' },
    })
    const tool = event('assistant/chunk', 2, 2_000, {
      turn: 1, step: 1, chunk: { type: 'block-start', index: 0, blockType: 'tool-call' },
    })
    expect(projection(update(startState(), text), text)).toMatchObject({ active: false, tailKind: 'text' })
    expect(projection(update(startState(), tool), tool)).toMatchObject({ active: false, tailKind: 'tool' })
  })

  it('pauses for retry delay and restarts the thinking window when the retry starts', () => {
    const activeEvent = event('assistant/chunk', 2, 2_000, {
      turn: 1, step: 1, chunk: { type: 'reasoning-delta', index: 0, text: 'first' },
    })
    const active = update(startState(), activeEvent)
    const retry = event('llm/retry', 3, 4_000, {
      retryId: 'r1', turn: 1, step: 1, provider: 'deepseek', mode: 'normal', policyKey: 'default',
      retry: 1, maxRetries: 2, delayMs: 100, failure: { message: 'retry', code: 'UPSTREAM' },
    })
    const pending = update(active, retry)
    expect(projection(pending, retry)).toMatchObject({ active: false, tailKind: 'empty' })
    const retryStarted = event('llm/retry-started', 4, 5_000, {
      retryId: 'r1', turn: 1, step: 1, retry: 1,
    })
    const restarted = update(pending, retryStarted)
    expect(projection(restarted, retryStarted)).toMatchObject({
      active: true, waitOrigin: 5_000, streamTime: 5_000, tailKind: 'empty',
    })
    const second = event('assistant/chunk', 5, 6_000, {
      turn: 1, step: 1, chunk: { type: 'reasoning-delta', index: 0, text: 'second' },
    })
    expect(projection(update(restarted, second), second)).toMatchObject({
      active: true, waitOrigin: 5_000, streamTime: 6_000,
    })
  })

  it('accepts compact reasoning, text, and Tool chunk rows', () => {
    const reasoning = event('chunkrow/reasoning-chunks', 2, 2_000, {
      turn: 1, step: 1, index: 0, texts: ['', 'plan'], dt: [25],
    })
    const active = update(startState(), reasoning)
    expect(projection(active, reasoning)).toMatchObject({ active: true, streamTime: 2_025 })
    const text = event('chunkrow/text-chunks', 4, 3_000, {
      turn: 1, step: 1, index: 1, texts: ['done'], dt: [],
    })
    expect(projection(update(active, text), text)).toMatchObject({ active: false, tailKind: 'text' })
    const tool = event('chunkrow/tool-call-chunks', 5, 4_000, {
      turn: 1, step: 1, index: 2, args: ['{}'], dt: [],
    })
    expect(projection(update(active, tool), tool)).toMatchObject({ active: false, tailKind: 'tool' })
  })

  it('makes Tool execution terminal for reasoning within the same Step', () => {
    const reasoningEvent = event('assistant/chunk', 2, 2_000, {
      turn: 1, step: 1, chunk: { type: 'reasoning-delta', index: 0, text: 'plan' },
    })
    const reasoning = update(startState(), reasoningEvent)
    const firstCall = event('tool/call', 3, 3_000, {
      turn: 1, step: 1, callId: 'c1', name: 'grep', arguments: '{}',
    })
    const withFirst = update(reasoning, firstCall)
    expect(projection(withFirst, firstCall)).toMatchObject({
      active: false,
      tailKind: 'tool',
      tools: [{ callId: 'c1', name: 'grep', startedAt: 3_000 }],
    })

    const lateReasoning = event('assistant/chunk', 4, 3_050, {
      turn: 1, step: 1, chunk: { type: 'reasoning-delta', index: 0, text: 'late' },
    })
    const afterLateReasoning = update(withFirst, lateReasoning)
    expect(projection(afterLateReasoning, lateReasoning)).toMatchObject({
      active: false,
      tailKind: 'tool',
    })

    const lateRetry = event('llm/retry-started', 5, 3_075, {
      retryId: 'late-retry', turn: 1, step: 1, retry: 1,
    })
    const afterLateRetry = update(afterLateReasoning, lateRetry)
    expect(projection(afterLateRetry, lateRetry)).toMatchObject({
      active: false,
      tailKind: 'tool',
    })

    const secondCall = event('tool/call', 6, 3_100, {
      turn: 1, step: 1, callId: 'c2', name: 'glob', arguments: '{}',
    })
    const withBoth = update(afterLateRetry, secondCall)
    expect(projection(withBoth, secondCall).tools.map(tool => tool.name)).toEqual(['grep', 'glob'])

    const firstResult = event('tool/result', 7, 4_000, {
      turn: 1, step: 1, message: { source: { callId: 'c1' } },
    })
    const withSecond = update(withBoth, firstResult)
    expect(projection(withSecond, firstResult)).toMatchObject({
      active: false,
      tailKind: 'tool',
      tools: [{ callId: 'c2', name: 'glob', startedAt: 3_100 }],
    })

    const secondResult = event('tool/result', 8, 4_100, {
      turn: 1, step: 1, callId: 'c2',
    })
    expect(projection(update(withSecond, secondResult), secondResult)).toMatchObject({
      active: false,
      tailKind: 'tool',
      tools: [],
    })
  })

  it('clears unfinished Tool activity when its Step ends', () => {
    const call = event('tool/call', 2, 2_000, {
      turn: 1, step: 1, callId: 'c1', name: 'bash', arguments: '{}',
    })
    const running = update(startState(), call)
    const end = event('step/end', 3, 3_000, { turn: 1, step: 1 })
    expect(projection(update(running, end), end).tools).toEqual([])
  })
})

describe('reasoningWaitView', () => {
  it('selects the node with the latest event sequence for replace and apply', () => {
    const builder = reasoningWaitView.create()
    const node = (key: string, anchorSeq: number, data: ReasoningWaitProjection): ProjectionViewNode => ({
      key, kind: 'dsh-thinkbar/reasoning-wait', id: key, target: 'dsh-thinkbar', anchorSeq, data,
    } as ProjectionViewNode)
    const first = waitingProjection(1, 1)
    const second = { ...waitingProjection(1, 1), streamTime: 3_000 }
    expect(builder.replace({
      nodes: [node('second', 4, second), node('first', 2, first)] as never,
      timeline: emptyTimeline(),
    })).toEqual(second)
    expect(builder.apply({
      upserts: [node('first', 5, { ...first, active: false })] as never,
      timeline: emptyTimeline(),
    })).toMatchObject({ turn: 1, step: 1, active: false })
  })

  it('never resurfaces an older Step when it receives a later event sequence', () => {
    const builder = reasoningWaitView.create()
    const node = (key: string, anchorSeq: number, data: ReasoningWaitProjection): ProjectionViewNode => ({
      key, kind: 'dsh-thinkbar/reasoning-wait', id: key, target: 'dsh-thinkbar', anchorSeq, data,
    } as ProjectionViewNode)
    const first = waitingProjection(1, 1)
    const second = waitingProjection(1, 2)
    expect(builder.replace({
      nodes: [node('first', 10, first), node('second', 11, second)] as never,
      timeline: emptyTimeline(),
    })).toEqual(second)
    expect(builder.apply({
      upserts: [node('first', 12, { ...first, active: false })] as never,
      timeline: emptyTimeline(),
    })).toEqual(second)
  })
})

function waitingProjection(turn: number, step: number): ReasoningWaitProjection {
  return { turn, step, waitOrigin: 1_000, streamTime: 2_000, active: true, tailKind: 'reasoning', tools: [] }
}

function emptyTimeline() {
  return { turnOrder: [], turns: new Map() }
}
