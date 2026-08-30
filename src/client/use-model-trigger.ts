import { useLayoutEffect, useState, type RefObject } from 'react'
import {
  mountModelTrigger,
  resolveModelTrigger,
  type ModelTriggerMount,
} from './model-trigger-adapter.ts'

/** Keep a Portal layer attached across ModelSelect and composer reconstruction. */
export function useModelTrigger(anchorRef: RefObject<HTMLElement | null>): HTMLElement | null {
  const [layer, setLayer] = useState<HTMLElement | null>(null)

  useLayoutEffect(() => {
    const anchor = anchorRef.current
    if (anchor === null) return
    const composer = anchor.closest<HTMLElement>('[data-composer-card]')
    if (composer === null) return
    let mount: ModelTriggerMount | null = null

    const refresh = (): void => {
      const target = resolveModelTrigger(anchor)
      if (mount?.layer.isConnected === true && mount.layer.parentElement === target) return
      mount?.dispose()
      mount = mountModelTrigger(anchor)
      setLayer(mount?.layer ?? null)
    }

    refresh()
    const observer = new MutationObserver(refresh)
    observer.observe(composer, { childList: true, subtree: true })
    return () => {
      observer.disconnect()
      mount?.dispose()
    }
  }, [anchorRef])

  return layer
}
