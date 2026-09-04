import type { ActiveToolCall, ReasoningWaitProjection, ReasoningWaitTailKind } from './projection-types.ts'

export type { ActiveToolCall, ReasoningWaitProjection, ReasoningWaitTailKind } from './projection-types.ts'

interface ProjectionEventBase<Type extends string, Data> {
  readonly type: Type
  readonly seq: number
  readonly time: number
  readonly data: Data
}

interface StepData {
  readonly turn: number
  readonly step: number
}

interface ToolCallData extends StepData {
  readonly callId: string
  readonly name: string
}

interface ToolResultData extends StepData {
  readonly callId?: string
  readonly message?: {
    readonly source?: {
      readonly callId?: string
    }
  }
}

type AssistantChunk =
  | { readonly type: 'block-start'; readonly blockType: 'reasoning' | 'text' | 'tool-call' | string }
  | { readonly type: 'reasoning-delta' }
  | { readonly type: 'text-delta' }
  | { readonly type: 'tool-call-delta' }
  | { readonly type: 'block-end'; readonly block: { readonly type: 'reasoning' | 'text' | 'tool-call' | string } }
  | { readonly type: 'usage' }

type ScalarProjectionEvent =
  | ProjectionEventBase<'step/start', StepData>
  | ProjectionEventBase<'step/end', StepData>
  | ProjectionEventBase<'assistant/chunk', StepData & { readonly chunk: AssistantChunk }>
  | ProjectionEventBase<'assistant/message', StepData>
  | ProjectionEventBase<'tool/call', ToolCallData>
  | ProjectionEventBase<'tool/result', ToolResultData>
  | ProjectionEventBase<'llm/retry', StepData>
  | ProjectionEventBase<'llm/retry-started', StepData>

export interface ProjectionMatch {
  readonly event: ProjectionEvent
  readonly role: 'start' | 'update'
  readonly location: unknown
}

export interface ProjectionNodeContext<State = unknown> {
  readonly key: string
  readonly kind: string
  readonly id: string
  readonly matches: readonly ProjectionMatch[]
  readonly start: ProjectionMatch | undefined
  readonly state: State | undefined
  readonly current: ReadonlyMap<string, ProjectionViewNode | null>
}

export interface ProjectionViewNode {
  readonly key: string
  readonly kind: string
  readonly id: string
  readonly target: string
  readonly data: unknown
}

interface ProjectionNodeDefinition<State> {
  readonly kind: string
  readonly target: string
  match(event: ProjectionEvent): { readonly id: string; readonly role: 'start' | 'update' } | null
  start(context: ProjectionNodeContext<State>, match: ProjectionMatch, reader: unknown): State
  update(context: ProjectionNodeContext<State> & { readonly state: State }, match: ProjectionMatch): State
  publication(match: ProjectionMatch): 'none' | 'animation-frame' | 'immediate'
  buildViewNode(context: ProjectionNodeContext<State>): ProjectionViewNode | null
}

interface ProjectionViewDefinition<Node extends ProjectionViewNode, Snapshot> {
  readonly target: string
  create(): {
    readonly empty: Snapshot
    replace(input: { readonly nodes: readonly Node[]; readonly timeline: unknown }): Snapshot
    apply(input: { readonly upserts: readonly Node[]; readonly timeline: unknown }): Snapshot
  }
}

interface ReasoningWaitState extends ReasoningWaitProjection {
  readonly retryPending: boolean
  readonly toolPhaseStarted: boolean
}

interface ReasoningWaitNode extends ProjectionViewNode {
  readonly target: 'dsh-thinkbar'
  readonly anchorSeq: number
  readonly data: ReasoningWaitProjection
}

interface CompactChunkEvent {
  readonly type:
    | 'chunkrow/text-chunks'
    | 'chunkrow/reasoning-chunks'
    | 'chunkrow/tool-call-chunks'
  readonly seq: number
  readonly time: number
  readonly data: {
    readonly turn: number
    readonly step: number
    readonly dt: readonly number[]
    readonly texts?: readonly string[]
    readonly args?: readonly string[]
  }
}

type ProjectionEvent = ScalarProjectionEvent | CompactChunkEvent

function isCompactChunkEvent(event: ProjectionEvent): event is CompactChunkEvent {
  const type = String(event.type)
  return type === 'chunkrow/text-chunks'
    || type === 'chunkrow/reasoning-chunks'
    || type === 'chunkrow/tool-call-chunks'
}

function projectionOf(state: ReasoningWaitState): ReasoningWaitProjection {
  const {
    retryPending: _retryPending,
    toolPhaseStarted: _toolPhaseStarted,
    ...projection
  } = state
  return projection
}

function eventIdentity(event: ProjectionEvent): string | null {
  if (isCompactChunkEvent(event)) return `${event.data.turn}:${event.data.step}`
  if (event.type === 'step/start'
    || event.type === 'step/end'
    || event.type === 'assistant/chunk'
    || event.type === 'assistant/message'
    || event.type === 'tool/call'
    || event.type === 'tool/result'
    || event.type === 'llm/retry'
    || event.type === 'llm/retry-started') {
    return `${event.data.turn}:${event.data.step}`
  }
  return null
}

function startTool(state: ReasoningWaitState, event: ProjectionEventBase<'tool/call', ToolCallData>): ReasoningWaitState {
  const tool: ActiveToolCall = {
    callId: event.data.callId,
    name: event.data.name,
    startedAt: event.time,
  }
  return {
    ...state,
    streamTime: event.time,
    active: false,
    tailKind: 'tool',
    retryPending: false,
    toolPhaseStarted: true,
    tools: [...state.tools.filter(active => active.callId !== tool.callId), tool],
  }
}

function resultCallId(data: ToolResultData): string | null {
  return data.callId ?? data.message?.source?.callId ?? null
}

function finishTool(state: ReasoningWaitState, event: ProjectionEventBase<'tool/result', ToolResultData>): ReasoningWaitState {
  const callId = resultCallId(event.data)
  if (callId === null) return state
  return {
    ...state,
    streamTime: event.time,
    tools: state.tools.filter(tool => tool.callId !== callId),
  }
}

function transition(
  state: ReasoningWaitState,
  time: number,
  tailKind: ReasoningWaitTailKind,
  active: boolean,
  originTime = time,
): ReasoningWaitState {
  if (state.toolPhaseStarted) return { ...state, streamTime: time }
  return {
    ...state,
    waitOrigin: state.retryPending && tailKind === 'reasoning' ? originTime : state.waitOrigin,
    streamTime: time,
    active,
    tailKind,
    retryPending: state.retryPending && tailKind === 'empty',
  }
}

function enterToolPhase(state: ReasoningWaitState, time: number): ReasoningWaitState {
  return {
    ...state,
    streamTime: time,
    active: false,
    tailKind: 'tool',
    retryPending: false,
    toolPhaseStarted: true,
  }
}

function chunkTransition(state: ReasoningWaitState, match: ProjectionMatch): ReasoningWaitState {
  if (match.event.type !== 'assistant/chunk') return state
  const { chunk } = match.event.data
  switch (chunk.type) {
    case 'block-start':
      if (chunk.blockType === 'reasoning') return transition(state, match.event.time, 'reasoning', true)
      if (chunk.blockType === 'text') return transition(state, match.event.time, 'text', false)
      if (chunk.blockType === 'tool-call') return enterToolPhase(state, match.event.time)
      return transition(state, match.event.time, 'other', false)
    case 'reasoning-delta':
      return transition(state, match.event.time, 'reasoning', true)
    case 'text-delta':
      return transition(state, match.event.time, 'text', false)
    case 'tool-call-delta':
      return enterToolPhase(state, match.event.time)
    case 'block-end':
      if (chunk.block.type === 'reasoning') return transition(state, match.event.time, 'reasoning', true)
      if (chunk.block.type === 'text') return transition(state, match.event.time, 'text', false)
      if (chunk.block.type === 'tool-call') return enterToolPhase(state, match.event.time)
      return transition(state, match.event.time, 'other', false)
    default:
      return state
  }
}

function compactEndTime(event: CompactChunkEvent): number {
  return event.data.dt.reduce((time, gap) => time + gap, event.time)
}

function compactFirstEvidenceTime(event: CompactChunkEvent): number | null {
  let time = event.time
  for (let index = 0; index < (event.data.texts?.length ?? 0); index++) {
    if (event.data.texts?.[index] !== '') return time
    time += event.data.dt[index] ?? 0
  }
  return null
}

function compactTransition(state: ReasoningWaitState, event: CompactChunkEvent): ReasoningWaitState {
  const streamTime = compactEndTime(event)
  if (event.type === 'chunkrow/reasoning-chunks') {
    const firstEvidenceTime = compactFirstEvidenceTime(event)
    return firstEvidenceTime === null
      ? state
      : transition(state, streamTime, 'reasoning', true, firstEvidenceTime)
  }
  if (event.type === 'chunkrow/text-chunks') return transition(state, streamTime, 'text', false)
  return enterToolPhase(state, streamTime)
}

function updateState(state: ReasoningWaitState, match: ProjectionMatch): ReasoningWaitState {
  const event = match.event as ProjectionEvent
  if (isCompactChunkEvent(event)) return compactTransition(state, event)
  if (event.type === 'assistant/chunk') return chunkTransition(state, match)
  if (event.type === 'tool/call') return startTool(state, event)
  if (event.type === 'tool/result') return finishTool(state, event)
  if (event.type === 'llm/retry') {
    if (state.toolPhaseStarted) return { ...state, streamTime: event.time }
    return { ...state, streamTime: event.time, active: false, tailKind: 'empty', retryPending: true }
  }
  if (event.type === 'llm/retry-started') {
    if (state.toolPhaseStarted) return { ...state, streamTime: event.time }
    return {
      ...state,
      waitOrigin: event.time,
      streamTime: event.time,
      active: true,
      tailKind: 'empty',
      retryPending: false,
    }
  }
  if (event.type === 'assistant/message') {
    return { ...state, streamTime: event.time, active: false, retryPending: false }
  }
  if (event.type === 'step/end') {
    return { ...state, streamTime: event.time, active: false, retryPending: false, tools: [] }
  }
  return state
}

/** Per-Step event state machine for the reasoning indicator. */
export const reasoningWaitDefinition: ProjectionNodeDefinition<ReasoningWaitState> = {
  kind: 'dsh-thinkbar/reasoning-wait',
  target: 'dsh-thinkbar',
  match: (event) => {
    const id = eventIdentity(event as ProjectionEvent)
    if (id === null) return null
    return { id, role: event.type === 'step/start' ? 'start' : 'update' }
  },
  start: (_context, match) => {
    if (match.event.type !== 'step/start') throw new Error('reasoning-wait start requires step/start')
    return {
      turn: match.event.data.turn,
      step: match.event.data.step,
      waitOrigin: match.event.time,
      streamTime: match.event.time,
      active: true,
      tailKind: 'empty',
      tools: [],
      retryPending: false,
      toolPhaseStarted: false,
    }
  },
  update: (context, match) => updateState(context.state, match),
  publication: match => match.event.type === 'assistant/chunk'
    || isCompactChunkEvent(match.event as ProjectionEvent)
    ? 'animation-frame'
    : 'immediate',
  buildViewNode: (context) => {
    if (context.state === undefined) return null
    return {
      key: context.key,
      kind: context.kind,
      id: context.id,
      target: 'dsh-thinkbar',
      anchorSeq: context.matches.at(-1)?.event.seq ?? context.start?.event.seq ?? 0,
      data: projectionOf(context.state),
    }
  },
}

function latestProjection(nodes: Iterable<ReasoningWaitNode>): ReasoningWaitProjection | null {
  let latest: ReasoningWaitNode | undefined
  for (const node of nodes) {
    if (latest === undefined || compareProjectionNodes(node, latest) > 0) latest = node
  }
  return latest?.data ?? null
}

function compareProjectionNodes(left: ReasoningWaitNode, right: ReasoningWaitNode): number {
  if (left.data.turn !== right.data.turn) return left.data.turn - right.data.turn
  if (left.data.step !== right.data.step) return left.data.step - right.data.step
  return left.anchorSeq - right.anchorSeq
}

/** Session-owned reducer selecting the latest Step projection. */
export const reasoningWaitView: ProjectionViewDefinition<
  ReasoningWaitNode,
  ReasoningWaitProjection | null
> = {
  target: 'dsh-thinkbar',
  create: () => {
    const nodes = new Map<string, ReasoningWaitNode>()
    return {
      empty: null,
      replace: (input) => {
        nodes.clear()
        for (const node of input.nodes) nodes.set(node.key, node)
        return latestProjection(nodes.values())
      },
      apply: (input) => {
        for (const node of input.upserts) nodes.set(node.key, node)
        return latestProjection(nodes.values())
      },
    }
  },
}
