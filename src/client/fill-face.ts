import type { ReasoningWaitProjection } from './reasoning-wait-projection.ts'
import type { ReasoningWaitInput, ReasoningWaitState, SessionClock, StreamClockAnchor } from './thermometer.ts'

/** Frame-math interface injected into the public Slot bridge. */
export interface ReasoningWaitFill {
  clock(
    projection: ReasoningWaitProjection | null | undefined,
    frameNow: number,
    anchor: StreamClockAnchor | null,
    identity: string,
  ): SessionClock
  advance(previous: ReasoningWaitState, input: ReasoningWaitInput): ReasoningWaitState
}
