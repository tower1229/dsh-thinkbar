import { createPortal } from 'react-dom'
import { useRef, useSyncExternalStore } from 'react'
import type { ReasoningWaitFill } from './fill-face.ts'
import { ReasoningWaitIndicator } from './ReasoningWaitIndicator.tsx'
import { useModelTrigger } from './use-model-trigger.ts'
import css from './ReasoningWaitIndicator.module.css'

export interface ModelTriggerBridgeProps extends ReasoningWaitFill {
  readonly sessionId: string
}

/** Public-Slot lifecycle bridge that portals the indicator into the model trigger. */
export function ModelTriggerBridge({ projectionSource, sessionId, clock, advance }: ModelTriggerBridgeProps) {
  const anchorRef = useRef<HTMLSpanElement>(null)
  const layer = useModelTrigger(anchorRef)
  const projection = useSyncExternalStore(
    projectionSource.subscribe,
    projectionSource.getSnapshot,
    projectionSource.getSnapshot,
  )
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
