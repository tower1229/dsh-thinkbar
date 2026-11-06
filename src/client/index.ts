/** Browser half: public event projection plus a DOM-adapted model-seat fill. */
import type { Context } from '@deepseek-ai/cordis'
import { ReasoningWaitService } from './service.ts'
import { ModelTriggerBridge } from './ModelTriggerBridge.tsx'
import type { ReasoningWaitFill, ReasoningWaitProjectionSource } from './fill-face.ts'
import { reasoningWaitDefinition, reasoningWaitView } from './reasoning-wait-projection.ts'

export { ReasoningWaitService } from './service.ts'
export type { ReasoningWaitFill } from './fill-face.ts'
export type {
  ActiveToolCall,
  ReasoningWaitProjection,
  ReasoningWaitTailKind,
} from './projection-types.ts'
export type {
  ReasoningWaitInput,
  ReasoningWaitState,
  SessionClock,
  StreamClockAnchor,
} from './thermometer.ts'

interface ThinkbarClientContext extends Context {
  readonly uiConversation: {
    readonly events: { register(definition: unknown): () => void }
    readonly views: { register(definition: unknown): () => void }
    readonly binding: (sessionId: string) => {
      readonly target: (target: string) => ReasoningWaitProjectionSource
    }
  }
  readonly slots: {
    inject(name: string, install: () => unknown): unknown
    register(options: Readonly<Record<string, unknown>>, component: unknown): unknown
  }
}

/** Required public Conversation assembly and renderer registry. */
export const inject = ['slots', 'uiConversation']

const INACTIVE_PROJECTION: ReasoningWaitProjectionSource = {
  getSnapshot: () => null,
  subscribe: () => () => {},
}

/**
 * Resolve the session-owned projection source.
 *
 * DSH 0.2 throws from `binding()` for an unknown or stale Session binding, so
 * resolution fails closed into an inactive source instead of crashing the Slot
 * entry (which the renderer would otherwise retire for the Session lifetime).
 */
function projectionSource(client: ThinkbarClientContext, sessionId: string): ReasoningWaitProjectionSource {
  try {
    return client.uiConversation.binding(sessionId).target('dsh-thinkbar')
  } catch {
    return INACTIVE_PROJECTION
  }
}

/** Mount the projection, frame service, and public-Slot DOM bridge. */
export function apply(ctx: Context): void {
  const client = ctx as ThinkbarClientContext
  client.uiConversation.events.register(reasoningWaitDefinition)
  client.uiConversation.views.register(reasoningWaitView)
  client.plugin(ReasoningWaitService)
  client.slots.inject('conversation.input.right', () => client.slots.register({
    name: 'conversation.input.right',
    id: 'dsh-thinkbar',
    order: 20,
    inject: (sessionId: string): ReasoningWaitFill => {
      const reasoningWait = (): ReasoningWaitService | undefined =>
        client.get('reasoningWait') as ReasoningWaitService | undefined
      return {
        projectionSource: projectionSource(client, sessionId),
        clock: (projection, frameNow, anchor, identity) =>
          reasoningWait()?.clock(projection, frameNow, anchor, identity) ?? { elapsed: 0, anchor: null },
        advance: (previous, input) => reasoningWait()?.advance(previous, input) ?? { phase: 'idle' },
      }
    },
  }, ModelTriggerBridge))
}
