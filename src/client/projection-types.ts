export type ReasoningWaitTailKind = 'empty' | 'reasoning' | 'text' | 'tool' | 'other'

export interface ActiveToolCall {
  readonly callId: string
  readonly name: string
  readonly startedAt: number
}

/** Replayable reasoning-wait state derived only from public Session events. */
export interface ReasoningWaitProjection {
  readonly turn: number
  readonly step: number
  readonly waitOrigin: number
  readonly streamTime: number
  readonly active: boolean
  readonly tailKind: ReasoningWaitTailKind
  /** Tool executions owned by this Step; a non-empty Tool phase keeps reasoning inactive. */
  readonly tools: readonly ActiveToolCall[]
}
