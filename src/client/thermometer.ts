import type { ReasoningWaitProjection } from './projection-types.ts'

const FULL_SCALE_MS = 20_000
const MIN_FILL = 0.08
const DRAIN_MS = 240
const RESTART_RAMP_MS = 120

const IRON_STOPS = [
  { t: 0, hex: 'var(--dsw-alias-button-info-fill)' },
  { t: 1 / 3, hex: '#dc2626' },
  { t: 2 / 3, hex: '#e07020' },
  { t: 1, hex: '#ffcc00' },
] as const

export type ReasoningWaitAppearance =
  | { readonly phase: 'idle' }
  | {
    readonly phase: 'thermometer'
    readonly t: number
    readonly height: number
    readonly color: string
  }

export interface StreamClockAnchor {
  readonly stamp: string
  readonly identity: string
  readonly eventElapsed: number
  readonly observedAt: number
  readonly renderedElapsed: number
}

export type ReasoningWaitState =
  | {
    readonly phase: 'idle'
    readonly restart?: {
      readonly identity: string
      readonly elapsed: number
    }
  }
  | {
    readonly phase: 'thermometer'
    readonly identity: string
    readonly t: number
    readonly height: number
    readonly color: string
    readonly visualOrigin?: number
    readonly ramp?: boolean
  }
  | {
    readonly phase: 'drain'
    readonly identity: string
    readonly t: number
    readonly height: number
    readonly color: string
    readonly fromHeight: number
    readonly startedAt: number
  }

export interface ReasoningWaitInput {
  readonly projection: ReasoningWaitProjection | null | undefined
  readonly elapsed: number
  readonly frameNow: number
  readonly reducedMotion: boolean
  readonly identity: string
}

export interface SessionClock {
  readonly elapsed: number
  readonly anchor: StreamClockAnchor | null
}

export function reasoningWaitAppearance(
  projection: ReasoningWaitProjection | null | undefined,
  elapsed: number,
): ReasoningWaitAppearance {
  if (projection?.active !== true) return { phase: 'idle' }
  const t = Math.min(1, Math.max(0, elapsed / FULL_SCALE_MS))
  return {
    phase: 'thermometer',
    t,
    height: MIN_FILL + (1 - MIN_FILL) * easeOutFill(t),
    color: ironScale(t),
  }
}

export function extrapolateProjectionClock(
  projection: ReasoningWaitProjection | null | undefined,
  frameNow: number,
  anchor: StreamClockAnchor | null,
  identity: string,
): SessionClock {
  if (projection?.active !== true) return { elapsed: 0, anchor: null }
  const eventElapsed = Math.max(0, projection.streamTime - projection.waitOrigin)
  const stamp = `${identity}:${projection.waitOrigin}`
  if (anchor?.stamp !== stamp) {
    return {
      elapsed: 0,
      anchor: { stamp, identity, eventElapsed, observedAt: frameNow, renderedElapsed: 0 },
    }
  }
  const elapsed = anchor.renderedElapsed + Math.max(0, frameNow - anchor.observedAt)
  return {
    elapsed,
    anchor: { stamp, identity, eventElapsed, observedAt: frameNow, renderedElapsed: elapsed },
  }
}

export function advanceReasoningWait(
  previous: ReasoningWaitState,
  input: ReasoningWaitInput,
): ReasoningWaitState {
  if (input.reducedMotion) {
    const snapshot = reasoningWaitAppearance(input.projection, input.elapsed)
    return snapshot.phase === 'idle' ? { phase: 'idle' } : { ...snapshot, identity: input.identity }
  }

  if (previous.phase === 'drain') {
    const elapsed = input.frameNow - previous.startedAt
    if (elapsed >= DRAIN_MS) {
      return input.projection?.active === true
        ? { phase: 'idle', restart: { identity: input.identity, elapsed: input.elapsed } }
        : { phase: 'idle' }
    }
    const height = previous.fromHeight * (1 - elapsed / DRAIN_MS)
    if (height === previous.height) return previous
    return { ...previous, height }
  }

  if (previous.phase === 'thermometer'
    && (previous.identity !== input.identity || input.projection?.active !== true)) {
    return {
      phase: 'drain',
      identity: previous.identity,
      t: previous.t,
      height: previous.height,
      color: previous.color,
      fromHeight: previous.height,
      startedAt: input.frameNow,
    }
  }

  if (input.projection?.active !== true) {
    return previous.phase === 'idle' && previous.restart === undefined ? previous : { phase: 'idle' }
  }

  if (previous.phase === 'idle' && previous.restart !== undefined) {
    return thermometerState(input, input.elapsed, true)
  }

  const visualOrigin = previous.phase === 'thermometer' ? previous.visualOrigin ?? 0 : 0
  const ramp = previous.phase === 'thermometer' ? previous.ramp ?? false : false
  const next = thermometerState(input, visualOrigin, ramp)
  if (
    previous.phase === 'thermometer'
    && previous.identity === next.identity
    && previous.t === next.t
    && previous.height === next.height
    && previous.color === next.color
    && previous.visualOrigin === next.visualOrigin
    && previous.ramp === next.ramp
  ) return previous
  return next
}

function thermometerState(
  input: ReasoningWaitInput,
  visualOrigin: number,
  ramp: boolean,
): Extract<ReasoningWaitState, { readonly phase: 'thermometer' }> {
  const visualElapsed = Math.max(0, input.elapsed - visualOrigin)
  const snapshot = reasoningWaitAppearance(input.projection, visualElapsed)
  if (snapshot.phase === 'idle') throw new Error('thermometer state requires an active projection')
  const rampProgress = ramp ? Math.min(1, visualElapsed / RESTART_RAMP_MS) : 1
  return {
    ...snapshot,
    identity: input.identity,
    height: snapshot.height * rampProgress,
    visualOrigin,
    ramp: ramp && rampProgress < 1,
  }
}

function nearestStop(t: number): string | undefined {
  for (const stop of IRON_STOPS) {
    if (Math.abs(t - stop.t) <= 1 / FULL_SCALE_MS) return stop.hex
  }
  return undefined
}

function ironScale(t: number): string {
  const snapped = nearestStop(t)
  if (snapped !== undefined) return snapped
  if (t < IRON_STOPS[1].t) {
    return mixOklch(IRON_STOPS[0].hex, IRON_STOPS[1].hex, t / (1 / 3))
  }
  if (t < IRON_STOPS[2].t) {
    return mixOklch(IRON_STOPS[1].hex, IRON_STOPS[2].hex, (t - 1 / 3) / (1 / 3))
  }
  return mixOklch(IRON_STOPS[2].hex, IRON_STOPS[3].hex, (t - 2 / 3) / (1 / 3))
}

function mixOklch(fromHex: string, toHex: string, amount: number): string {
  return `color-mix(in oklch, ${fromHex}, ${toHex} ${amount * 100}%)`
}

function easeOutFill(linearT: number): number {
  if (linearT <= 0) return 0
  if (linearT >= 1) return 1
  const xAt = (u: number): number => 3 * (1 - u) * u * u * 0.58 + u ** 3
  const yAt = (u: number): number => 3 * (1 - u) * u * u + u ** 3
  let low = 0
  let high = 1
  for (let i = 0; i < 24; i++) {
    const mid = (low + high) / 2
    if (xAt(mid) < linearT) low = mid
    else high = mid
  }
  return yAt((low + high) / 2)
}
