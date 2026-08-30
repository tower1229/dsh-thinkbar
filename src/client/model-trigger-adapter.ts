const COMPOSER_SELECTOR = '[data-composer-card]'
const MODEL_TRIGGER_SELECTOR = 'button[aria-haspopup="menu"]'
const HOST_ATTRIBUTE = 'data-dsh-thinkbar-host'
const LAYER_ATTRIBUTE = 'data-dsh-thinkbar-layer'

let compatibilityWarningShown = false

export interface ModelTriggerMount {
  readonly layer: HTMLSpanElement
  dispose(): void
}

/** Resolve the only semantic menu trigger following the public Slot anchor. */
export function resolveModelTrigger(anchor: HTMLElement): HTMLButtonElement | null {
  const composer = anchor.closest<HTMLElement>(COMPOSER_SELECTOR)
  if (composer === null) return null
  const candidates = [...composer.querySelectorAll<HTMLButtonElement>(MODEL_TRIGGER_SELECTOR)]
    .filter(candidate => Boolean(
      anchor.compareDocumentPosition(candidate) & Node.DOCUMENT_POSITION_FOLLOWING,
    ))
  return candidates.length === 1 ? candidates[0] ?? null : null
}

function warnCompatibility(): void {
  if (compatibilityWarningShown) return
  compatibilityWarningShown = true
  console.warn(
    '[dsh-thinkbar] Could not uniquely identify the DeepSeek Harness model selector; the indicator is disabled.',
  )
}

function existingLayer(target: HTMLButtonElement): HTMLSpanElement | null {
  return [...target.children].find((child): child is HTMLSpanElement =>
    child instanceof HTMLSpanElement && child.hasAttribute(LAYER_ATTRIBUTE)) ?? null
}

/** Attach one plugin-owned Portal layer without moving or rewriting host children. */
export function mountModelTrigger(anchor: HTMLElement): ModelTriggerMount | null {
  const target = resolveModelTrigger(anchor)
  if (target === null) {
    warnCompatibility()
    return null
  }
  const layer = existingLayer(target) ?? document.createElement('span')
  layer.setAttribute(LAYER_ATTRIBUTE, '')
  if (!layer.isConnected) target.prepend(layer)
  target.setAttribute(HOST_ATTRIBUTE, '')
  let disposed = false
  return {
    layer,
    dispose: () => {
      if (disposed) return
      disposed = true
      layer.remove()
      if (existingLayer(target) === null) target.removeAttribute(HOST_ATTRIBUTE)
    },
  }
}

export function resetCompatibilityWarningForTests(): void {
  compatibilityWarningShown = false
}
