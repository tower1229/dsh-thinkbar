import { Service } from '@deepseek-ai/cordis'
import type { Context } from '@deepseek-ai/cordis'
import type { PartialAssistant } from '@deepseek-ai/dsh-client-runtime/client'
import {
  advanceReasoningWait,
  extrapolateSessionClock,
  isReasoningWait,
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

  isWaiting(partial: PartialAssistant | null | undefined): boolean {
    return isReasoningWait(partial)
  }

  clock(
    partial: PartialAssistant | null | undefined,
    wallNow: number,
    anchor: StreamClockAnchor | null,
    sessionKey: string,
  ): SessionClock {
    return extrapolateSessionClock(partial, wallNow, anchor, sessionKey)
  }

  advance(previous: ReasoningWaitState, input: ReasoningWaitInput): ReasoningWaitState {
    return advanceReasoningWait(previous, input)
  }
}
