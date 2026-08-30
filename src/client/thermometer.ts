import type { ReasoningWaitProjection } from './projection-types.ts'

const FULL_SCALE_MS = 20_000
const MIN_FILL = 0.08
const DRAIN_MS = 240

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
  | { readonly phase: 'idle' }
  | {
    readonly phase: 'thermometer'
    readonly identity: string
    readonly t: number
    readonly height: number
    readonly color: string
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
  const stamp = `${identity}:${projection.waitOrigin}:${projection.streamTime}`
  if (anchor?.stamp !== stamp) {
    const elapsed = Math.max(anchor?.identity === identity ? anchor.renderedElapsed : 0, eventElapsed)
    return {
      elapsed,
      anchor: { stamp, identity, eventElapsed, observedAt: frameNow, renderedElapsed: elapsed },
    }
  }
  const elapsed = Math.max(anchor.renderedElapsed, anchor.eventElapsed + frameNow - anchor.observedAt)
  return { elapsed, anchor: { ...anchor, renderedElapsed: elapsed } }
}

export function advanceReasoningWait(
  previous: ReasoningWaitState,
  input: ReasoningWaitInput,
): ReasoningWaitState {
  const snapshot = reasoningWaitAppearance(input.projection, input.elapsed)
  if (snapshot.phase === 'thermometer') {
    if (
      previous.phase === 'thermometer'
      && previous.identity === input.identity
      && previous.t === snapshot.t
      && previous.height === snapshot.height
      && previous.color === snapshot.color
    ) return previous
    return { ...snapshot, identity: input.identity }
  }
  if (input.reducedMotion) return previous.phase === 'idle' ? previous : { phase: 'idle' }
  const sameIdentity = previous.phase !== 'idle' && previous.identity === input.identity
  if (previous.phase === 'thermometer' && sameIdentity) {
    return {
      phase: 'drain',
      identity: input.identity,
      t: previous.t,
      height: previous.height,
      color: previous.color,
      fromHeight: previous.height,
      startedAt: input.frameNow,
    }
  }
  if (previous.phase === 'drain' && sameIdentity) {
    const elapsed = input.frameNow - previous.startedAt
    if (elapsed >= DRAIN_MS) return { phase: 'idle' }
    const height = previous.fromHeight * (1 - elapsed / DRAIN_MS)
    if (height === previous.height) return previous
    return { ...previous, height }
  }
  return previous.phase === 'idle' ? previous : { phase: 'idle' }
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
