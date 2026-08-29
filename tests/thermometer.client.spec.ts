import type { PartialAssistant } from '@deepseek-ai/dsh-client-runtime/client'
import type {} from '../src/client/compatibility.ts'
import { describe, expect, it } from 'vitest'
import {
  advanceReasoningWait,
  extrapolateSessionClock,
  reasoningWaitAppearance,
  type ReasoningWaitState,
} from '../src/client/thermometer.ts'

const ORIGIN = 1_000
const FULL_SCALE_MS = 20_000
const DRAIN_MS = 240
const SESSION = 's1'

function waiting(overrides: Partial<PartialAssistant> = {}): PartialAssistant {
  return {
    turn: 1,
    step: 1,
    blocks: [{ kind: 'reasoning', text: 'plan' }],
    waitOrigin: ORIGIN,
    ...overrides,
  }
}

function expectedHeight(linearT: number): number {
  const value = reasoningWaitAppearance(waiting(), ORIGIN + linearT * FULL_SCALE_MS)
  if (value.phase !== 'thermometer') throw new Error('expected thermometer')
  return value.height
}

describe('reasoningWaitAppearance', () => {
  it('stays idle outside the reasoning-wait window', () => {
    expect(reasoningWaitAppearance(undefined, ORIGIN)).toEqual({ phase: 'idle' })
    expect(reasoningWaitAppearance(null, ORIGIN)).toEqual({ phase: 'idle' })
    expect(reasoningWaitAppearance({ turn: 1, step: 1, blocks: [] }, ORIGIN)).toEqual({ phase: 'idle' })
    expect(reasoningWaitAppearance({
      turn: 1,
      step: 1,
      blocks: [{ kind: 'text', text: 'hello' }],
      waitOrigin: ORIGIN,
    }, ORIGIN)).toEqual({ phase: 'idle' })
    expect(reasoningWaitAppearance({
      turn: 1,
      step: 1,
      blocks: [{ kind: 'reasoning', text: 'plan' }, { kind: 'tool-call', callId: 'c', name: 'read', argsRaw: '{}' }],
      waitOrigin: ORIGIN,
    }, ORIGIN)).toEqual({ phase: 'idle' })
  })

  it('fills during TTFT before the first block arrives', () => {
    expect(reasoningWaitAppearance({
      turn: 1,
      step: 1,
      blocks: [],
      waitOrigin: ORIGIN,
    }, ORIGIN)).toEqual({
      phase: 'thermometer',
      t: 0,
      height: 0.08,
      color: 'var(--dsw-alias-button-info-fill)',
    })
  })

  it('starts at minimum blue and follows the iron-scale stops', () => {
    expect(reasoningWaitAppearance(waiting(), ORIGIN)).toEqual({
      phase: 'thermometer',
      t: 0,
      height: 0.08,
      color: 'var(--dsw-alias-button-info-fill)',
    })
    const oneThird = reasoningWaitAppearance(waiting(), ORIGIN + FULL_SCALE_MS / 3)
    const twoThirds = reasoningWaitAppearance(waiting(), ORIGIN + 2 * FULL_SCALE_MS / 3)
    expect(oneThird).toMatchObject({ phase: 'thermometer', color: '#dc2626' })
    expect(twoThirds).toMatchObject({ phase: 'thermometer', color: '#e07020' })
    if (oneThird.phase !== 'thermometer' || twoThirds.phase !== 'thermometer') throw new Error('expected thermometer')
    expect(oneThird.height).toBeCloseTo(expectedHeight(1 / 3))
    expect(twoThirds.height).toBeCloseTo(expectedHeight(2 / 3))
  })

  it('eases fill height while color follows linear time', () => {
    const half = reasoningWaitAppearance(waiting(), ORIGIN + FULL_SCALE_MS / 2)
    if (half.phase !== 'thermometer') throw new Error('expected thermometer')
    expect(half.t).toBe(0.5)
    expect(half.height).toBeCloseTo(0.7098717499022505)
    expect(half.height).toBeGreaterThan(0.08 + 0.92 * 0.5)
    expect(half.color).toMatch(/^color-mix\(in oklch, #dc2626, #e07020 /)
  })

  it('clamps before zero and at the 20-second full scale', () => {
    expect(reasoningWaitAppearance(waiting(), ORIGIN - 1_000)).toMatchObject({ t: 0, height: 0.08 })
    expect(reasoningWaitAppearance(waiting(), ORIGIN + FULL_SCALE_MS)).toEqual({
      phase: 'thermometer',
      t: 1,
      height: 1,
      color: '#ffcc00',
    })
    expect(reasoningWaitAppearance(waiting(), ORIGIN + 2 * FULL_SCALE_MS)).toMatchObject({ t: 1, height: 1 })
  })
})

describe('advanceReasoningWait', () => {
  const input = {
    partial: waiting(),
    now: ORIGIN + FULL_SCALE_MS / 2,
    reducedMotion: false,
    sessionKey: SESSION,
  }

  it('drains for 240ms with frozen color and then idles', () => {
    const hot = advanceReasoningWait({ phase: 'idle' }, input)
    if (hot.phase !== 'thermometer') throw new Error('expected thermometer')
    const ended = { ...waiting(), blocks: [...waiting().blocks, { kind: 'text' as const, text: 'done' }] }
    const start = advanceReasoningWait(hot, { ...input, partial: ended })
    expect(start).toMatchObject({
      phase: 'drain',
      sessionKey: SESSION,
      height: hot.height,
      color: hot.color,
      startedAt: input.now,
    })
    const mid = advanceReasoningWait(start, { ...input, partial: ended, now: input.now + DRAIN_MS / 2 })
    expect(mid).toMatchObject({ phase: 'drain', height: hot.height * 0.5, color: hot.color })
    expect(advanceReasoningWait(mid, { ...input, partial: ended, now: input.now + DRAIN_MS }))
      .toEqual({ phase: 'idle' })
  })

  it('lets a new wait preempt an active drain', () => {
    const next = advanceReasoningWait({
      phase: 'drain',
      sessionKey: SESSION,
      t: 1,
      height: 0.5,
      color: '#ffcc00',
      fromHeight: 1,
      startedAt: ORIGIN,
    }, {
      partial: waiting({ waitOrigin: ORIGIN + 10_000 }),
      now: ORIGIN + 10_000,
      reducedMotion: false,
      sessionKey: SESSION,
    })
    expect(next).toEqual({
      phase: 'thermometer',
      sessionKey: SESSION,
      t: 0,
      height: 0.08,
      color: 'var(--dsw-alias-button-info-fill)',
    })
  })

  it('skips drain under reduced motion', () => {
    const hot = advanceReasoningWait({ phase: 'idle' }, input)
    const ended = { ...waiting(), blocks: [...waiting().blocks, { kind: 'text' as const, text: 'done' }] }
    expect(advanceReasoningWait(hot, { ...input, partial: ended, reducedMotion: true }))
      .toEqual({ phase: 'idle' })
  })

  it('returns the previous object when the frame is unchanged', () => {
    const idle: ReasoningWaitState = { phase: 'idle' }
    expect(advanceReasoningWait(idle, { partial: null, now: 0, reducedMotion: false, sessionKey: '' })).toBe(idle)
    const hot = advanceReasoningWait({ phase: 'idle' }, input)
    expect(advanceReasoningWait(hot, input)).toBe(hot)
  })

  it('idles immediately when the visible session changes', () => {
    const hot = advanceReasoningWait({ phase: 'idle' }, input)
    expect(advanceReasoningWait(hot, {
      partial: null,
      now: input.now,
      reducedMotion: false,
      sessionKey: 's2',
    })).toEqual({ phase: 'idle' })
  })
})

describe('extrapolateSessionClock', () => {
  it('uses wall time while idle', () => {
    expect(extrapolateSessionClock(null, 5_000, null, SESSION)).toEqual({ now: 5_000, anchor: null })
  })

  it('anchors TTFT at waitOrigin and chunks at streamTime', () => {
    expect(extrapolateSessionClock(waiting(), 60_000, null, SESSION)).toEqual({
      now: ORIGIN,
      anchor: { stamp: `${SESSION}:${ORIGIN}:${ORIGIN}`, streamTime: ORIGIN, seenAt: 60_000 },
    })
    expect(extrapolateSessionClock(waiting({ streamTime: ORIGIN + 3_000 }), 60_000, null, SESSION)).toEqual({
      now: ORIGIN + 3_000,
      anchor: {
        stamp: `${SESSION}:${ORIGIN}:${ORIGIN + 3_000}`,
        streamTime: ORIGIN + 3_000,
        seenAt: 60_000,
      },
    })
  })

  it('extrapolates from an unchanged anchor', () => {
    const first = extrapolateSessionClock(waiting(), 60_000, null, SESSION)
    expect(first.anchor).not.toBeNull()
    expect(extrapolateSessionClock(waiting(), 65_000, first.anchor, SESSION)).toEqual({
      now: ORIGIN + 5_000,
      anchor: first.anchor,
    })
  })

  it('re-anchors for a new wait or session', () => {
    const first = extrapolateSessionClock(waiting(), 60_000, null, SESSION)
    expect(extrapolateSessionClock(waiting({ waitOrigin: ORIGIN + 10_000 }), 70_000, first.anchor, SESSION)).toEqual({
      now: ORIGIN + 10_000,
      anchor: {
        stamp: `${SESSION}:${ORIGIN + 10_000}:${ORIGIN + 10_000}`,
        streamTime: ORIGIN + 10_000,
        seenAt: 70_000,
      },
    })
    expect(extrapolateSessionClock(waiting(), 70_000, first.anchor, 's2')).toEqual({
      now: ORIGIN,
      anchor: { stamp: `s2:${ORIGIN}:${ORIGIN}`, streamTime: ORIGIN, seenAt: 70_000 },
    })
  })
})
