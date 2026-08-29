import type { PartialAssistant } from '@deepseek-ai/dsh-client-runtime/client'
import type {} from './compatibility.ts'

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
  readonly streamTime: number
  readonly seenAt: number
}

export type ReasoningWaitState =
  | { readonly phase: 'idle' }
  | {
    readonly phase: 'thermometer'
    readonly sessionKey: string
    readonly t: number
    readonly height: number
    readonly color: string
  }
  | {
    readonly phase: 'drain'
    readonly sessionKey: string
    readonly t: number
    readonly height: number
    readonly color: string
    readonly fromHeight: number
    readonly startedAt: number
  }

export interface ReasoningWaitInput {
  readonly partial: PartialAssistant | null | undefined
  readonly now: number
  readonly reducedMotion: boolean
  readonly sessionKey: string
}

export interface SessionClock {
  readonly now: number
  readonly anchor: StreamClockAnchor | null
}

export function isReasoningWait(
  partial: PartialAssistant | null | undefined,
): partial is PartialAssistant & { readonly waitOrigin: number } {
  if (partial == null || partial.waitOrigin === undefined) return false
  const tail = partial.blocks.at(-1)
  if (tail?.kind === 'text') return false
  return partial.blocks.length === 0 || tail?.kind === 'reasoning'
}

export function reasoningWaitAppearance(
  partial: PartialAssistant | null | undefined,
  now: number,
): ReasoningWaitAppearance {
  if (!isReasoningWait(partial)) return { phase: 'idle' }
  const t = Math.min(1, Math.max(0, (now - partial.waitOrigin) / FULL_SCALE_MS))
  return {
    phase: 'thermometer',
    t,
    height: MIN_FILL + (1 - MIN_FILL) * easeOutFill(t),
    color: ironScale(t),
  }
}

export function extrapolateSessionClock(
  partial: PartialAssistant | null | undefined,
  wallNow: number,
  anchor: StreamClockAnchor | null,
  sessionKey: string,
): SessionClock {
  if (!isReasoningWait(partial)) return { now: wallNow, anchor: null }
  const streamTime = partial.streamTime ?? partial.waitOrigin
  const stamp = `${sessionKey}:${partial.waitOrigin}:${streamTime}`
  if (anchor?.stamp !== stamp) {
    return { now: streamTime, anchor: { stamp, streamTime, seenAt: wallNow } }
  }
  return { now: anchor.streamTime + (wallNow - anchor.seenAt), anchor }
}

export function advanceReasoningWait(
  previous: ReasoningWaitState,
  input: ReasoningWaitInput,
): ReasoningWaitState {
  const snapshot = reasoningWaitAppearance(input.partial, input.now)
  if (snapshot.phase === 'thermometer') {
    if (
      previous.phase === 'thermometer'
      && previous.sessionKey === input.sessionKey
      && previous.t === snapshot.t
      && previous.height === snapshot.height
      && previous.color === snapshot.color
    ) return previous
    return { ...snapshot, sessionKey: input.sessionKey }
  }
  if (input.reducedMotion) return previous.phase === 'idle' ? previous : { phase: 'idle' }
  const sameSession = previous.phase !== 'idle' && previous.sessionKey === input.sessionKey
  if (previous.phase === 'thermometer' && sameSession) {
    return {
      phase: 'drain',
      sessionKey: input.sessionKey,
      t: previous.t,
      height: previous.height,
      color: previous.color,
      fromHeight: previous.height,
      startedAt: input.now,
    }
  }
  if (previous.phase === 'drain' && sameSession) {
    const elapsed = input.now - previous.startedAt
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
