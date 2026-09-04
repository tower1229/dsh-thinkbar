import { describe, expect, it } from 'vitest'
import type { ReasoningWaitProjection } from '../src/client/reasoning-wait-projection.ts'
import {
  advanceReasoningWait,
  extrapolateProjectionClock,
  reasoningWaitAppearance,
  type ReasoningWaitState,
} from '../src/client/thermometer.ts'

const ORIGIN = 1_000
const FULL_SCALE_MS = 20_000
const DRAIN_MS = 240
const IDENTITY = 's1:1:1'
const NEXT_IDENTITY = 's1:1:2'

function waiting(overrides: Partial<ReasoningWaitProjection> = {}): ReasoningWaitProjection {
  return {
    turn: 1, step: 1, waitOrigin: ORIGIN, streamTime: ORIGIN,
    active: true, tailKind: 'reasoning', tools: [], ...overrides,
  }
}

function input(projection: ReasoningWaitProjection | null, elapsed: number, frameNow = elapsed) {
  return { projection, elapsed, frameNow, reducedMotion: false, identity: IDENTITY }
}

describe('reasoningWaitAppearance', () => {
  it('renders only active projections', () => {
    expect(reasoningWaitAppearance(null, 0)).toEqual({ phase: 'idle' })
    expect(reasoningWaitAppearance(waiting({ active: false, tailKind: 'text' }), 0)).toEqual({ phase: 'idle' })
    expect(reasoningWaitAppearance(waiting(), 0)).toMatchObject({
      phase: 'thermometer', t: 0, height: 0.08, color: 'var(--dsw-alias-button-info-fill)',
    })
  })

  it('follows the iron scale and caps at 20 seconds', () => {
    expect(reasoningWaitAppearance(waiting(), FULL_SCALE_MS / 3)).toMatchObject({ color: '#dc2626' })
    expect(reasoningWaitAppearance(waiting(), 2 * FULL_SCALE_MS / 3)).toMatchObject({ color: '#e07020' })
    expect(reasoningWaitAppearance(waiting(), FULL_SCALE_MS)).toEqual({
      phase: 'thermometer', t: 1, height: 1, color: '#ffcc00',
    })
    expect(reasoningWaitAppearance(waiting(), FULL_SCALE_MS * 2)).toMatchObject({ t: 1, height: 1 })
  })
})

describe('advanceReasoningWait', () => {
  it('drains for 240ms with frozen color', () => {
    const hot = advanceReasoningWait({ phase: 'idle' }, input(waiting(), FULL_SCALE_MS / 2, 50))
    if (hot.phase !== 'thermometer') throw new Error('expected thermometer')
    const start = advanceReasoningWait(hot, input(waiting({ active: false, tailKind: 'text' }), 0, 100))
    expect(start).toMatchObject({ phase: 'drain', height: hot.height, startedAt: 100 })
    const mid = advanceReasoningWait(start, input(waiting({ active: false }), 0, 100 + DRAIN_MS / 2))
    expect(mid).toMatchObject({ phase: 'drain', height: hot.height / 2, color: hot.color })
    expect(advanceReasoningWait(mid, input(waiting({ active: false }), 0, 100 + DRAIN_MS)))
      .toEqual({ phase: 'idle' })
  })

  it('fully drains the previous Step before restarting the next Step from zero', () => {
    const hot = advanceReasoningWait({ phase: 'idle' }, input(waiting(), FULL_SCALE_MS / 2, 50))
    if (hot.phase !== 'thermometer') throw new Error('expected thermometer')
    const next = waiting({ step: 2, waitOrigin: 2_000, streamTime: 2_000 })
    const drain = advanceReasoningWait(hot, {
      ...input(next, 0, 100), identity: NEXT_IDENTITY,
    })
    expect(drain).toMatchObject({ phase: 'drain', identity: IDENTITY, height: hot.height })
    const almostEmpty = advanceReasoningWait(drain, {
      ...input(next, DRAIN_MS - 1, 100 + DRAIN_MS - 1), identity: NEXT_IDENTITY,
    })
    expect(almostEmpty).toMatchObject({ phase: 'drain' })
    if (almostEmpty.phase !== 'drain') throw new Error('expected drain')
    expect(almostEmpty.height).toBeLessThan(hot.height)

    const hidden = advanceReasoningWait(almostEmpty, {
      ...input(next, DRAIN_MS, 100 + DRAIN_MS), identity: NEXT_IDENTITY,
    })
    expect(hidden).toMatchObject({ phase: 'idle' })
    const restarted = advanceReasoningWait(hidden, {
      ...input(next, DRAIN_MS + 16, 100 + DRAIN_MS + 16), identity: NEXT_IDENTITY,
    })
    expect(restarted).toMatchObject({ phase: 'thermometer', identity: NEXT_IDENTITY, height: 0 })
    const growing = advanceReasoningWait(restarted, {
      ...input(next, DRAIN_MS + 76, 100 + DRAIN_MS + 76), identity: NEXT_IDENTITY,
    })
    expect(growing.phase).toBe('thermometer')
    if (growing.phase !== 'thermometer') throw new Error('expected thermometer')
    expect(growing.height).toBeGreaterThan(0)
  })

  it('restarts only the latest active Step after a drain', () => {
    const hot = advanceReasoningWait({ phase: 'idle' }, input(waiting(), 5_000, 50))
    if (hot.phase !== 'thermometer') throw new Error('expected thermometer')
    const second = waiting({ step: 2 })
    const third = waiting({ step: 3 })
    const drain = advanceReasoningWait(hot, {
      ...input(second, 0, 100), identity: NEXT_IDENTITY,
    })
    const hidden = advanceReasoningWait(drain, {
      ...input(third, DRAIN_MS, 100 + DRAIN_MS), identity: 's1:1:3',
    })
    const restarted = advanceReasoningWait(hidden, {
      ...input(third, DRAIN_MS + 16, 100 + DRAIN_MS + 16), identity: 's1:1:3',
    })
    expect(restarted).toMatchObject({ phase: 'thermometer', identity: 's1:1:3', height: 0 })
  })

  it('does not replay a Step that finishes while the previous Step drains', () => {
    const hot = advanceReasoningWait({ phase: 'idle' }, input(waiting(), 5_000, 50))
    if (hot.phase !== 'thermometer') throw new Error('expected thermometer')
    const next = waiting({ step: 2 })
    const drain = advanceReasoningWait(hot, {
      ...input(next, 0, 100), identity: NEXT_IDENTITY,
    })
    const finished = waiting({ step: 2, active: false, tailKind: 'text' })
    const hidden = advanceReasoningWait(drain, {
      ...input(finished, 0, 100 + DRAIN_MS), identity: NEXT_IDENTITY,
    })
    expect(hidden).toEqual({ phase: 'idle' })
    expect(advanceReasoningWait(hidden, {
      ...input(finished, 0, 100 + DRAIN_MS + 16), identity: NEXT_IDENTITY,
    })).toEqual({ phase: 'idle' })
  })

  it('clears inactive states immediately for reduced motion and drains identity changes', () => {
    const hot = advanceReasoningWait({ phase: 'idle' }, input(waiting(), 5_000))
    expect(advanceReasoningWait(hot, {
      ...input(waiting({ active: false }), 0), reducedMotion: true,
    })).toEqual({ phase: 'idle' })
    expect(advanceReasoningWait(hot, {
      ...input(waiting({ active: false }), 0), identity: 's2:1:1',
    })).toMatchObject({ phase: 'drain', identity: IDENTITY })
  })

  it('switches active Steps immediately for reduced motion', () => {
    const hot = advanceReasoningWait({ phase: 'idle' }, input(waiting(), 5_000))
    const next = waiting({ step: 2 })
    expect(advanceReasoningWait(hot, {
      ...input(next, 0), identity: NEXT_IDENTITY, reducedMotion: true,
    })).toMatchObject({ phase: 'thermometer', identity: NEXT_IDENTITY })
  })

  it('preserves object identity for unchanged frames', () => {
    const idle: ReasoningWaitState = { phase: 'idle' }
    expect(advanceReasoningWait(idle, input(null, 0))).toBe(idle)
    const hot = advanceReasoningWait(idle, input(waiting(), 5_000))
    expect(advanceReasoningWait(hot, input(waiting(), 5_000))).toBe(hot)
  })
})

describe('extrapolateProjectionClock', () => {
  it('starts a newly observed Step from zero and advances by visible frame time', () => {
    const projection = waiting({ streamTime: ORIGIN + 3_000 })
    const first = extrapolateProjectionClock(projection, 50_000, null, IDENTITY)
    expect(first.elapsed).toBe(0)
    expect(extrapolateProjectionClock(projection, 55_000, first.anchor, IDENTITY).elapsed).toBe(5_000)
  })

  it('does not reset or jump when stream timestamps update within the same Step', () => {
    const first = extrapolateProjectionClock(waiting(), 10_000, null, IDENTITY)
    const live = extrapolateProjectionClock(waiting(), 15_000, first.anchor, IDENTITY)
    const delayed = extrapolateProjectionClock(
      waiting({ streamTime: ORIGIN + 2_000 }), 15_100, live.anchor, IDENTITY,
    )
    expect(delayed.elapsed).toBe(5_100)
  })

  it('resets for an inactive projection, different identity, or restarted origin', () => {
    const first = extrapolateProjectionClock(waiting(), 10_000, null, IDENTITY)
    const live = extrapolateProjectionClock(waiting(), 15_000, first.anchor, IDENTITY)
    expect(extrapolateProjectionClock(waiting({ active: false }), 12_000, first.anchor, IDENTITY))
      .toEqual({ elapsed: 0, anchor: null })
    expect(extrapolateProjectionClock(waiting(), 16_000, live.anchor, 's2:1:1').elapsed).toBe(0)
    expect(extrapolateProjectionClock(
      waiting({ waitOrigin: ORIGIN + 4_000, streamTime: ORIGIN + 4_000 }),
      16_000,
      live.anchor,
      IDENTITY,
    ).elapsed).toBe(0)
  })
})
