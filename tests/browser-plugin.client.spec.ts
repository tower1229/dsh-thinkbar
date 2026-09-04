import { readFileSync } from 'node:fs'
import type { Context } from '@deepseek-ai/cordis'
import { describe, expect, it, vi } from 'vitest'
import { apply, inject } from '../src/client/index.ts'
import { apply as applyNode } from '../src/index.ts'

describe('dsh-thinkbar browser half', () => {
  it('declares the slot service it binds', () => {
    expect(inject).toEqual(['slots', 'uiConversation'])
  })

  it('registers its projection and contributes the public Slot bridge', () => {
    const register = vi.fn((_options: unknown, _component: unknown) => vi.fn())
    const registerEvent = vi.fn(() => vi.fn())
    const registerView = vi.fn(() => vi.fn())
    const projection = {
      getSnapshot: vi.fn(() => undefined),
      subscribe: vi.fn(() => vi.fn()),
    }
    const target = vi.fn((_target: string) => projection)
    const binding = vi.fn((_sessionId: string) => ({ target }))
    const injectSlot = vi.fn((_name: string, install: () => unknown) => install())
    const plugin = vi.fn()
    const ctx = {
      plugin,
      get: vi.fn(() => undefined),
      slots: { inject: injectSlot, register },
      uiConversation: {
        events: { register: registerEvent },
        views: { register: registerView },
        binding,
      },
    } as unknown as Context

    apply(ctx)

    expect(plugin).toHaveBeenCalledOnce()
    expect(registerEvent).toHaveBeenCalledWith(expect.objectContaining({
      kind: 'dsh-thinkbar/reasoning-wait',
      target: 'dsh-thinkbar',
    }))
    expect(registerView).toHaveBeenCalledWith(expect.objectContaining({ target: 'dsh-thinkbar' }))
    expect(injectSlot).toHaveBeenCalledWith('conversation.input.right', expect.any(Function))
    expect(register).toHaveBeenCalledWith(
      expect.objectContaining({ name: 'conversation.input.right', id: 'dsh-thinkbar', order: 20 }),
      expect.any(Function),
    )

    const slotOptions = register.mock.calls[0]?.[0] as { inject: (sessionId: string) => unknown }
    const injected = slotOptions.inject('session-42')
    expect(binding).toHaveBeenCalledWith('session-42')
    expect(target).toHaveBeenCalledWith('dsh-thinkbar')
    expect(injected).toHaveProperty('projectionSource', projection)
    expect(injected).toHaveProperty('clock')
    expect(injected).toHaveProperty('advance')
  })
})

describe('dsh-thinkbar node half', () => {
  it('contributes no host behavior', () => {
    expect(applyNode).not.toThrow()
  })
})

describe('bundle composition', () => {
  it('owns one dsh-thinkbar Loader row', () => {
    const patch = readFileSync(new URL('../cordis.patch.yml', import.meta.url), 'utf8').replaceAll('\r\n', '\n')
    expect(patch).toBe(
      '- insert:\n    - id: dsh-thinkbar\n      name: dsh-thinkbar\n',
    )
  })
})
