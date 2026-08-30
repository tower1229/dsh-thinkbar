import { Service } from '@deepseek-ai/cordis'
import type { Context } from '@deepseek-ai/cordis'
import type { ReasoningWaitProjection } from './reasoning-wait-projection.ts'
import {
  advanceReasoningWait,
  extrapolateProjectionClock,
  type ReasoningWaitInput,
  type ReasoningWaitState,
  type SessionClock,
  type StreamClockAnchor,
} from './thermometer.ts'

declare module '@deepseek-ai/cordis' {
  interface Context {
    /** Stateless frame math used by the reasoning-wait decoration. */
    reasoningWait: ReasoningWaitService
  }
}

/** Stateless reasoning-wait frame service. */
export class ReasoningWaitService extends Service {
  static inject = []

  constructor(ctx: Context) {
    super(ctx, 'reasoningWait')
  }

  clock(
    projection: ReasoningWaitProjection | null | undefined,
    frameNow: number,
    anchor: StreamClockAnchor | null,
    identity: string,
  ): SessionClock {
    return extrapolateProjectionClock(projection, frameNow, anchor, identity)
  }

  advance(previous: ReasoningWaitState, input: ReasoningWaitInput): ReasoningWaitState {
    return advanceReasoningWait(previous, input)
  }
}
