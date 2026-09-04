// @vitest-environment jsdom
import { cleanup, fireEvent, render, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ModelTriggerBridge, type ModelTriggerBridgeProps } from '../src/client/ModelTriggerBridge.tsx'
import {
  mountModelTrigger,
  resetCompatibilityWarningForTests,
  resolveModelTrigger,
} from '../src/client/model-trigger-adapter.ts'
import type { ReasoningWaitProjection } from '../src/client/reasoning-wait-projection.ts'
import { advanceReasoningWait, extrapolateProjectionClock } from '../src/client/thermometer.ts'

const SESSION_ID = 's1'

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
})

beforeEach(() => {
  resetCompatibilityWarningForTests()
  vi.stubGlobal('requestAnimationFrame', () => 1)
  vi.stubGlobal('cancelAnimationFrame', () => {})
})

function composerFixture(): {
  composer: HTMLDivElement
  anchor: HTMLSpanElement
  model: HTMLButtonElement
} {
  const composer = document.createElement('div')
  composer.setAttribute('data-composer-card', '')
  const command = document.createElement('button')
  command.setAttribute('aria-haspopup', 'menu')
  const anchor = document.createElement('span')
  const model = document.createElement('button')
  model.setAttribute('aria-haspopup', 'menu')
  model.innerHTML = '<strong><span>任意模型名</span></strong>'
  composer.append(command, anchor, model)
  document.body.append(composer)
  return { composer, anchor, model }
}

describe('model trigger DOM adapter', () => {
  it('uses semantic position without depending on classes, text, or child shape', () => {
    const { anchor, model } = composerFixture()
    expect(resolveModelTrigger(anchor)).toBe(model)
    const mount = mountModelTrigger(anchor)
    expect(mount?.layer.parentElement).toBe(model)
    expect(model.hasAttribute('data-dsh-thinkbar-host')).toBe(true)
    expect(model.querySelectorAll('[data-dsh-thinkbar-layer]')).toHaveLength(1)
    mount?.dispose()
    expect(model.hasAttribute('data-dsh-thinkbar-host')).toBe(false)
    expect(model.querySelector('[data-dsh-thinkbar-layer]')).toBeNull()
  })

  it('fails closed and warns only once when the target is missing or ambiguous', () => {
    const warning = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const { composer, anchor } = composerFixture()
    composer.lastElementChild?.remove()
    expect(mountModelTrigger(anchor)).toBeNull()
    const first = document.createElement('button')
    const second = document.createElement('button')
    first.setAttribute('aria-haspopup', 'menu')
    second.setAttribute('aria-haspopup', 'menu')
    composer.append(first, second)
    expect(mountModelTrigger(anchor)).toBeNull()
    expect(warning).toHaveBeenCalledOnce()
    expect(composer.querySelector('[data-dsh-thinkbar-layer]')).toBeNull()
  })

  it('does not change click, focus, or disabled behavior', () => {
    const { anchor, model } = composerFixture()
    const clicked = vi.fn()
    model.addEventListener('click', clicked)
    const mount = mountModelTrigger(anchor)
    model.focus()
    model.click()
    expect(document.activeElement).toBe(model)
    expect(clicked).toHaveBeenCalledOnce()
    model.disabled = true
    model.click()
    expect(clicked).toHaveBeenCalledOnce()
    mount?.dispose()
  })
})

function projectionSource(initial: ReasoningWaitProjection | null | undefined) {
  let current = initial
  const listeners = new Set<() => void>()
  return {
    getSnapshot: () => current,
    subscribe: (listener: () => void) => {
      listeners.add(listener)
      return () => listeners.delete(listener)
    },
    publish: (projection: ReasoningWaitProjection | null | undefined) => {
      current = projection
      for (const listener of listeners) listener()
    },
  }
}

function bridgeProps(projection: ReasoningWaitProjection): ModelTriggerBridgeProps {
  return {
    sessionId: SESSION_ID,
    projectionSource: projectionSource(projection),
    clock: extrapolateProjectionClock,
    advance: advanceReasoningWait,
  }
}

describe('ModelTriggerBridge', () => {
  it('portals the indicator and reattaches after the model button is replaced', async () => {
    vi.spyOn(performance, 'now').mockReturnValue(1_000)
    const projection: ReasoningWaitProjection = {
      turn: 1, step: 1, waitOrigin: 1_000, streamTime: 1_000, active: true, tailKind: 'reasoning',
    }
    const renderComposer = (generation: number) => (
      <div data-composer-card="">
        <button type="button" aria-haspopup="menu">command</button>
        <ModelTriggerBridge {...bridgeProps(projection)} />
        <button key={generation} type="button" aria-haspopup="menu">model {generation}</button>
      </div>
    )
    const view = render(renderComposer(1))
    await waitFor(() => expect(view.container.querySelectorAll('[data-dsh-thinkbar-layer]')).toHaveLength(1))
    expect(view.container.querySelector('[data-reasoning-wait="thermometer"]')).not.toBeNull()

    view.rerender(renderComposer(2))
    await waitFor(() => {
      const layer = view.container.querySelector('[data-dsh-thinkbar-layer]')
      expect(layer?.parentElement?.textContent).toContain('model 2')
      expect(view.container.querySelectorAll('[data-dsh-thinkbar-layer]')).toHaveLength(1)
    })

    const model = view.container.querySelectorAll<HTMLButtonElement>('button')[1]
    const clicked = vi.fn()
    model?.addEventListener('click', clicked)
    if (model !== undefined) fireEvent.click(model)
    expect(clicked).toHaveBeenCalledOnce()
    view.unmount()
    expect(document.querySelector('[data-dsh-thinkbar-layer]')).toBeNull()
  })

  it('subscribes to the lazy target source and renders its published projection', async () => {
    vi.spyOn(performance, 'now').mockReturnValue(1_000)
    const source = projectionSource(undefined)
    const subscribe = vi.spyOn(source, 'subscribe')
    const props: ModelTriggerBridgeProps = {
      sessionId: SESSION_ID,
      projectionSource: source,
      clock: extrapolateProjectionClock,
      advance: advanceReasoningWait,
    }
    const view = render(
      <div data-composer-card="">
        <button type="button" aria-haspopup="menu">command</button>
        <ModelTriggerBridge {...props} />
        <button type="button" aria-haspopup="menu">model</button>
      </div>,
    )
    expect(subscribe).toHaveBeenCalledOnce()

    source.publish({
      turn: 1, step: 1, waitOrigin: 1_000, streamTime: 1_000, active: true, tailKind: 'reasoning',
    })
    await waitFor(() => {
      expect(view.container.querySelector('[data-reasoning-wait="thermometer"]')).not.toBeNull()
    })

    view.unmount()
    expect(source.subscribe).toHaveBeenCalledOnce()
  })
})
