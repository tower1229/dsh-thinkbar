import type { PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
import { createPortal } from 'react-dom'
import { useRef } from 'react'
import type { ReasoningWaitFill } from './fill-face.ts'
import { ReasoningWaitIndicator } from './ReasoningWaitIndicator.tsx'
import { useModelTrigger } from './use-model-trigger.ts'
import css from './ReasoningWaitIndicator.module.css'

export type ModelTriggerBridgeProps = PropsRuntime<'conversation.input.right'> & ReasoningWaitFill

/** Public-Slot lifecycle bridge that portals the indicator into the model trigger. */
export function ModelTriggerBridge({ useSession, sessionId, clock, advance }: ModelTriggerBridgeProps) {
  const anchorRef = useRef<HTMLSpanElement>(null)
  const layer = useModelTrigger(anchorRef)
  const projection = useSession(snapshot => snapshot.views.get('dsh-thinkbar'))
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
