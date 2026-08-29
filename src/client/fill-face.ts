import type { PartialAssistant } from '@deepseek-ai/dsh-client-runtime/client'
import type { ReasoningWaitInput, ReasoningWaitState, SessionClock, StreamClockAnchor } from './thermometer.ts'

/** Frame-math interface injected into the model-seat decoration. */
export interface ReasoningWaitFill {
  isWaiting(partial: PartialAssistant | null | undefined): boolean
  clock(
    partial: PartialAssistant | null | undefined,
    wallNow: number,
    anchor: StreamClockAnchor | null,
    sessionKey: string,
  ): SessionClock
  advance(previous: ReasoningWaitState, input: ReasoningWaitInput): ReasoningWaitState
}
