// @vitest-environment jsdom
import type { SessionId } from '@deepseek-ai/dsh-api-remotes/client'
import { Context } from '@deepseek-ai/cordis'
import type { ConversationSnapshot, PartialAssistant } from '@deepseek-ai/dsh-client-runtime/client'
import { act, cleanup, render } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { ReasoningWaitFill } from '../src/client/fill-face.ts'
import { ModelSelectFill, type ModelSelectFillProps } from '../src/client/ModelSelectFill.tsx'
import { ReasoningWaitService } from '../src/client/service.ts'
import type {} from '../src/client/compatibility.ts'

const SESSION_ID = 's1' as SessionId

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
})

beforeEach(() => {
  vi.stubGlobal('requestAnimationFrame', () => 1)
  vi.stubGlobal('cancelAnimationFrame', () => {})
})

function waiting(overrides: Partial<PartialAssistant> = {}): PartialAssistant {
  return {
    turn: 1,
    step: 1,
    blocks: [{ kind: 'reasoning', text: 'plan' }],
    waitOrigin: 1_000,
    ...overrides,
  }
}

function sessionKit(initial: PartialAssistant | null | undefined) {
  const snapshot = { sessionId: SESSION_ID, partial: initial } as ConversationSnapshot
  return {
    useSession: <S,>(selector: (value: ConversationSnapshot) => S): S => selector(snapshot),
    sessionId: SESSION_ID,
    useProjection: (() => undefined) as ModelSelectFillProps['useProjection'],
    useSessions: (() => undefined) as ModelSelectFillProps['useSessions'],
    useWorkspaces: (() => undefined) as ModelSelectFillProps['useWorkspaces'],
  }
}

async function reasoningWaitFace(): Promise<ReasoningWaitFill> {
  const ctx = new Context()
  await ctx.plugin(ReasoningWaitService).await()
  const service = ctx.get('reasoningWait') as ReasoningWaitService
  return {
    isWaiting: partial => service.isWaiting(partial),
    clock: (partial, wallNow, anchor, sessionKey) => service.clock(partial, wallNow, anchor, sessionKey),
    advance: (previous, input) => service.advance(previous, input),
  }
}

function props(
  partial: PartialAssistant | null | undefined,
  reasoningWait: ReasoningWaitFill,
): ModelSelectFillProps {
  return { ...sessionKit(partial), ...reasoningWait }
}

function fill(container: HTMLElement): HTMLElement | null {
  return container.querySelector('[data-reasoning-wait-fill]')
}

describe('ModelSelectFill', () => {
  it('renders nothing while idle', async () => {
    vi.spyOn(Date, 'now').mockReturnValue(1_000)
    const { container } = render(<ModelSelectFill {...props(null, await reasoningWaitFace())} />)
    expect(container.querySelector('[data-reasoning-wait]')).toBeNull()
  })

  it('starts at minimum blue with decorative particles', async () => {
    const origin = 5_000
    vi.spyOn(Date, 'now').mockReturnValue(origin)
    const { container } = render(<ModelSelectFill {...props(
      waiting({ waitOrigin: origin }),
      await reasoningWaitFace(),
    )} />)
    expect(container.querySelector('[data-reasoning-wait="thermometer"]')?.getAttribute('aria-hidden')).toBe('true')
    expect(fill(container)?.style.width).toBe('8%')
    expect(fill(container)?.style.backgroundColor).toBe('var(--dsw-alias-button-info-fill)')
    expect(fill(container)?.querySelectorAll('[data-reasoning-wait-particle]').length).toBeGreaterThan(0)
  })

  it('grows to full scale on animation frames', async () => {
    const origin = 2_000
    let now = origin
    vi.spyOn(Date, 'now').mockImplementation(() => now)
    const frames: FrameRequestCallback[] = []
    vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => {
      frames.push(callback)
      return frames.length
    })
    const { container } = render(<ModelSelectFill {...props(
      waiting({ waitOrigin: origin }),
      await reasoningWaitFace(),
    )} />)
    now = origin + 20_000
    act(() => frames[0]?.(0))
    expect(fill(container)?.style.width).toBe('100%')
    expect(fill(container)?.style.backgroundColor).toBe('rgb(255, 204, 0)')
  })

  it('drains for 240ms after reasoning ends', async () => {
    const origin = 1_000
    let now = origin + 80_000
    vi.spyOn(Date, 'now').mockImplementation(() => now)
    let frame: FrameRequestCallback | undefined
    vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => {
      frame = callback
      return 1
    })
    const partial = waiting({ streamTime: now })
    const ended = { ...partial, blocks: [...partial.blocks, { kind: 'text' as const, text: 'done' }] }
    const face = await reasoningWaitFace()
    const { container, rerender } = render(<ModelSelectFill {...props(partial, face)} />)
    rerender(<ModelSelectFill {...props(ended, face)} />)
    expect(container.querySelector('[data-reasoning-wait="drain"]')).not.toBeNull()
    now += 120
    act(() => frame?.(0))
    expect(fill(container)?.style.width).toBe('50%')
    now += 120
    act(() => frame?.(0))
    expect(container.querySelector('[data-reasoning-wait]')).toBeNull()
  })

  it('skips drain when reduced motion is enabled', async () => {
    vi.stubGlobal('matchMedia', vi.fn(() => ({ matches: true }) as MediaQueryList))
    const partial = waiting({ streamTime: 11_000 })
    const ended = { ...partial, blocks: [...partial.blocks, { kind: 'text' as const, text: 'done' }] }
    vi.spyOn(Date, 'now').mockReturnValue(11_000)
    const face = await reasoningWaitFace()
    const { container, rerender } = render(<ModelSelectFill {...props(partial, face)} />)
    rerender(<ModelSelectFill {...props(ended, face)} />)
    expect(container.querySelector('[data-reasoning-wait]')).toBeNull()
  })

  it('renders nothing when the service face is unavailable', () => {
    const noService: ReasoningWaitFill = {
      isWaiting: () => false,
      clock: (_partial, wallNow) => ({ now: wallNow, anchor: null }),
      advance: () => ({ phase: 'idle' }),
    }
    const { container } = render(<ModelSelectFill {...props(waiting(), noService)} />)
    expect(container.querySelector('[data-reasoning-wait]')).toBeNull()
  })
})
