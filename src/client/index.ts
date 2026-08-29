/** Browser half: reasoning-wait service and model-seat decoration. */
import type { ClientContext } from '@deepseek-ai/dsh-client-runtime/client'
import type {} from '@deepseek-ai/dsh-client-ui-model-selection/client'
import type {} from './compatibility.ts'
import { ReasoningWaitService } from './service.ts'
import { ModelSelectFill } from './ModelSelectFill.tsx'
import type { ReasoningWaitFill } from './fill-face.ts'

export { ReasoningWaitService } from './service.ts'
export type { ReasoningWaitFill } from './fill-face.ts'
export type { ModelSelectFillProps } from './ModelSelectFill.tsx'
export type {
  ReasoningWaitInput,
  ReasoningWaitState,
  SessionClock,
  StreamClockAnchor,
} from './thermometer.ts'

/** Required services: the slot registry hosting the decoration hole. */
export const inject = ['slots']

/** Mount the frame service and register the model-seat thinking fill. */
export function apply(ctx: ClientContext): void {
  ctx.plugin(ReasoningWaitService)
  ctx.slots.inject('conversation.input.model.decoration', () => ctx.slots.register({
    name: 'conversation.input.model.decoration',
    inject: (): ReasoningWaitFill => {
      const reasoningWait = (): ReasoningWaitService | undefined =>
        ctx.get('reasoningWait') as ReasoningWaitService | undefined
      return {
        isWaiting: partial => reasoningWait()?.isWaiting(partial) ?? false,
        clock: (partial, wallNow, anchor, sessionKey) =>
          reasoningWait()?.clock(partial, wallNow, anchor, sessionKey) ?? { now: wallNow, anchor: null },
        advance: (previous, input) => reasoningWait()?.advance(previous, input) ?? { phase: 'idle' },
      }
    },
  }, ModelSelectFill))
}
