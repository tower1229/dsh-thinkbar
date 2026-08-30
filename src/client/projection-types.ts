export type ReasoningWaitTailKind = 'empty' | 'reasoning' | 'text' | 'tool' | 'other'

/** Replayable reasoning-wait state derived only from public Session events. */
export interface ReasoningWaitProjection {
  readonly turn: number
  readonly step: number
  readonly waitOrigin: number
  readonly streamTime: number
  readonly active: boolean
  readonly tailKind: ReasoningWaitTailKind
}
