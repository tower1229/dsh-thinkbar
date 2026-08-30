import { createPortal } from 'react-dom'
import { useRef } from 'react'
import type { ReasoningWaitFill } from './fill-face.ts'
import type { ReasoningWaitProjection } from './projection-types.ts'
import { ReasoningWaitIndicator } from './ReasoningWaitIndicator.tsx'
import { useModelTrigger } from './use-model-trigger.ts'
import css from './ReasoningWaitIndicator.module.css'

interface ConversationSnapshotLike {
  readonly views: { get(target: string): unknown }
}

export interface ModelTriggerBridgeProps extends ReasoningWaitFill {
  readonly sessionId: string
  readonly useConversation: <Selection>(selector: (snapshot: ConversationSnapshotLike) => Selection) => Selection
}

/** Public-Slot lifecycle bridge that portals the indicator into the model trigger. */
export function ModelTriggerBridge({ useConversation, sessionId, clock, advance }: ModelTriggerBridgeProps) {
  const anchorRef = useRef<HTMLSpanElement>(null)
  const layer = useModelTrigger(anchorRef)
  const projection = useConversation(snapshot =>
    snapshot.views.get('dsh-thinkbar') as ReasoningWaitProjection | null | undefined)
  const identity = projection === null || projection === undefined
    ? String(sessionId)
    : `${String(sessionId)}:${projection.turn}:${projection.step}`

  return (
    <span ref={anchorRef} className={css.anchor} data-dsh-thinkbar-anchor="" aria-hidden="true">
      {layer === null ? null : createPortal(
        <ReasoningWaitIndicator
          identity={identity}
          projection={projection}
          clock={clock}
          advance={advance}
        />,
        layer,
      )}
    </span>
  )
}
