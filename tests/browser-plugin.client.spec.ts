import { readFileSync } from 'node:fs'
import type { ClientContext } from '@deepseek-ai/dsh-client-runtime/client'
import { describe, expect, it, vi } from 'vitest'
import { apply, inject } from '../src/client/index.ts'
import { apply as applyNode } from '../src/index.ts'

describe('dsh-thinkbar browser half', () => {
  it('declares the slot service it binds', () => {
    expect(inject).toEqual(['slots'])
  })

  it('mounts its service and contributes to the model decoration slot', () => {
    const register = vi.fn(() => vi.fn())
    const injectSlot = vi.fn((_name: string, install: () => unknown) => install())
    const plugin = vi.fn()
    const ctx = {
      plugin,
      get: vi.fn(() => undefined),
      slots: { inject: injectSlot, register },
    } as unknown as ClientContext

    apply(ctx)

    expect(plugin).toHaveBeenCalledOnce()
    expect(injectSlot).toHaveBeenCalledWith('conversation.input.model.decoration', expect.any(Function))
    expect(register).toHaveBeenCalledWith(
      expect.objectContaining({ name: 'conversation.input.model.decoration' }),
      expect.any(Function),
    )
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
