/** Browser half: public event projection plus a DOM-adapted model-seat fill. */
import type { ClientContext } from '@deepseek-ai/dsh-client-runtime/client'
import type {} from '@deepseek-ai/dsh-client-ui-conversation/client'
import type {} from '@deepseek-ai/dsh-client-ui-model-selection/client'
import { ReasoningWaitService } from './service.ts'
import { ModelTriggerBridge } from './ModelTriggerBridge.tsx'
import type { ReasoningWaitFill } from './fill-face.ts'
import { reasoningWaitDefinition, reasoningWaitView } from './reasoning-wait-projection.ts'

export { ReasoningWaitService } from './service.ts'
export type { ReasoningWaitFill } from './fill-face.ts'
export type {
  ReasoningWaitProjection,
  ReasoningWaitTailKind,
} from './reasoning-wait-projection.ts'
export type {
  ReasoningWaitInput,
  ReasoningWaitState,
  SessionClock,
  StreamClockAnchor,
} from './thermometer.ts'

/** Required public rc.2 registries. */
export const inject = ['slots', 'conversationEvents', 'conversationViews']

/** Mount the projection, frame service, and public-Slot DOM bridge. */
export function apply(ctx: ClientContext): void {
  ctx.conversationEvents.register(reasoningWaitDefinition)
  ctx.conversationViews.register(reasoningWaitView)
  ctx.plugin(ReasoningWaitService)
  ctx.slots.inject('conversation.input.right', () => ctx.slots.register({
    name: 'conversation.input.right',
    id: 'dsh-thinkbar',
    order: 20,
    inject: (): ReasoningWaitFill => {
      const reasoningWait = (): ReasoningWaitService | undefined =>
        ctx.get('reasoningWait') as ReasoningWaitService | undefined
      return {
        clock: (projection, frameNow, anchor, identity) =>
          reasoningWait()?.clock(projection, frameNow, anchor, identity) ?? { elapsed: 0, anchor: null },
        advance: (previous, input) => reasoningWait()?.advance(previous, input) ?? { phase: 'idle' },
      }
    },
  }, ModelTriggerBridge))
}
