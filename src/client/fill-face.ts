import type { ReasoningWaitProjection } from './projection-types.ts'
import type { ReasoningWaitInput, ReasoningWaitState, SessionClock, StreamClockAnchor } from './thermometer.ts'

/** Session-owned projection source whose first subscriber activates the target. */
export interface ReasoningWaitProjectionSource {
  getSnapshot(): ReasoningWaitProjection | null | undefined
  subscribe(listener: () => void): () => void
}

/** Stateless frame math used by the visible indicator. */
export interface ReasoningWaitFrame {
  clock(
    projection: ReasoningWaitProjection | null | undefined,
    frameNow: number,
    anchor: StreamClockAnchor | null,
    identity: string,
  ): SessionClock
  advance(previous: ReasoningWaitState, input: ReasoningWaitInput): ReasoningWaitState
}

/** Session projection and frame math injected into the public Slot bridge. */
export interface ReasoningWaitFill extends ReasoningWaitFrame {
  readonly projectionSource: ReasoningWaitProjectionSource
}
