import type { ReasoningWaitProjection, ReasoningWaitTailKind } from './projection-types.ts'

export type { ReasoningWaitProjection, ReasoningWaitTailKind } from './projection-types.ts'

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
  const { retryPending: _retryPending, ...projection } = state
  return projection
}

function eventIdentity(event: ProjectionEvent): string | null {
  if (isCompactChunkEvent(event)) return `${event.data.turn}:${event.data.step}`
  if (event.type === 'step/start'
    || event.type === 'step/end'
    || event.type === 'assistant/chunk'
    || event.type === 'assistant/message'
    || event.type === 'llm/retry'
    || event.type === 'llm/retry-started') {
    return `${event.data.turn}:${event.data.step}`
  }
  return null
}

function transition(
  state: ReasoningWaitState,
  time: number,
  tailKind: ReasoningWaitTailKind,
  active: boolean,
  originTime = time,
): ReasoningWaitState {
  return {
    ...state,
    waitOrigin: state.retryPending && tailKind === 'reasoning' ? originTime : state.waitOrigin,
    streamTime: time,
    active,
    tailKind,
    retryPending: state.retryPending && tailKind === 'empty',
  }
}

function chunkTransition(state: ReasoningWaitState, match: ProjectionMatch): ReasoningWaitState {
  if (match.event.type !== 'assistant/chunk') return state
  const { chunk } = match.event.data
  switch (chunk.type) {
    case 'block-start':
      if (chunk.blockType === 'reasoning') return transition(state, match.event.time, 'reasoning', true)
      if (chunk.blockType === 'text') return transition(state, match.event.time, 'text', false)
      if (chunk.blockType === 'tool-call') return transition(state, match.event.time, 'tool', false)
      return transition(state, match.event.time, 'other', false)
    case 'reasoning-delta':
      return transition(state, match.event.time, 'reasoning', true)
    case 'text-delta':
      return transition(state, match.event.time, 'text', false)
    case 'tool-call-delta':
      return transition(state, match.event.time, 'tool', false)
    case 'block-end':
      if (chunk.block.type === 'reasoning') return transition(state, match.event.time, 'reasoning', true)
      if (chunk.block.type === 'text') return transition(state, match.event.time, 'text', false)
      if (chunk.block.type === 'tool-call') return transition(state, match.event.time, 'tool', false)
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
  return transition(state, streamTime, 'tool', false)
}

function updateState(state: ReasoningWaitState, match: ProjectionMatch): ReasoningWaitState {
  const event = match.event as ProjectionEvent
  if (isCompactChunkEvent(event)) return compactTransition(state, event)
  if (event.type === 'assistant/chunk') return chunkTransition(state, match)
  if (event.type === 'llm/retry' || event.type === 'llm/retry-started') {
    return { ...state, streamTime: event.time, active: false, tailKind: 'empty', retryPending: true }
  }
  if (event.type === 'assistant/message' || event.type === 'step/end') {
    return { ...state, streamTime: event.time, active: false, retryPending: false }
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
      active: false,
      tailKind: 'empty',
      retryPending: false,
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
    if (latest === undefined || node.anchorSeq > latest.anchorSeq) latest = node
  }
  return latest?.data ?? null
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
