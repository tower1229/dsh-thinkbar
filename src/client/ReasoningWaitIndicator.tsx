import { useEffect, useLayoutEffect, useRef, useState, type CSSProperties } from 'react'
import type { ReasoningWaitProjection } from './projection-types.ts'
import type { ReasoningWaitFill } from './fill-face.ts'
import type { ReasoningWaitState, StreamClockAnchor } from './thermometer.ts'
import css from './ReasoningWaitIndicator.module.css'

export interface ReasoningWaitIndicatorProps extends ReasoningWaitFill {
  readonly identity: string
  readonly projection: ReasoningWaitProjection | null | undefined
}

interface FillParticle {
  readonly x: number
  readonly y: number
  readonly size: number
  readonly opacity: number
  readonly dur: number
  readonly delay: number
  readonly dx: number
  readonly dy: number
}

const FILL_PARTICLES: readonly FillParticle[] = [
  { x: 10, y: 15, size: 2, opacity: 1, dur: 2.6, delay: 0, dx: 3, dy: -2 },
  { x: 26, y: 8, size: 3, opacity: 0.95, dur: 3.4, delay: -0.8, dx: -2, dy: 3 },
  { x: 40, y: 19, size: 2, opacity: 1, dur: 2.2, delay: -1.4, dx: 3, dy: -3 },
  { x: 56, y: 12, size: 2, opacity: 0.9, dur: 4.1, delay: -0.4, dx: -3, dy: 2 },
  { x: 72, y: 21, size: 3, opacity: 1, dur: 3, delay: -2.1, dx: 2, dy: -2 },
  { x: 90, y: 7, size: 2, opacity: 0.95, dur: 2.8, delay: -1.1, dx: -2, dy: 3 },
  { x: 106, y: 16, size: 2, opacity: 1, dur: 3.6, delay: -0.6, dx: 3, dy: -2 },
  { x: 124, y: 10, size: 3, opacity: 0.9, dur: 4.4, delay: -2.8, dx: -3, dy: 2 },
  { x: 142, y: 19, size: 2, opacity: 1, dur: 2.4, delay: -1.7, dx: 2, dy: -3 },
  { x: 160, y: 13, size: 2, opacity: 0.95, dur: 3.2, delay: -0.9, dx: -2, dy: 3 },
  { x: 180, y: 8, size: 3, opacity: 0.95, dur: 3.8, delay: -2.4, dx: 3, dy: -2 },
  { x: 202, y: 18, size: 2, opacity: 1, dur: 2.7, delay: -1.2, dx: -3, dy: 2 },
  { x: 226, y: 12, size: 2, opacity: 0.9, dur: 4.3, delay: -0.3, dx: 2, dy: -3 },
  { x: 250, y: 17, size: 3, opacity: 1, dur: 3.1, delay: -1.9, dx: -2, dy: 2 },
  { x: 278, y: 9, size: 2, opacity: 0.95, dur: 2.9, delay: -0.7, dx: 3, dy: -2 },
  { x: 306, y: 14, size: 2, opacity: 0.9, dur: 3.7, delay: -2.6, dx: -2, dy: 3 },
]

function particleStyle(particle: FillParticle): CSSProperties {
  return {
    left: `${particle.x}px`,
    top: `${particle.y}px`,
    width: `${particle.size}px`,
    height: `${particle.size}px`,
    '--dsh-particle-opacity': String(particle.opacity),
    '--dsh-particle-dx': `${particle.dx}px`,
    '--dsh-particle-dy': `${particle.dy}px`,
    '--dsh-particle-dur': `${particle.dur}s`,
    '--dsh-particle-delay': `${particle.delay}s`,
  } as CSSProperties
}

export function ReasoningWaitIndicator({ identity, projection, clock, advance }: ReasoningWaitIndicatorProps) {
  const [waitState, setWaitState] = useState<ReasoningWaitState>({ phase: 'idle' })
  const clockAnchorRef = useRef<StreamClockAnchor | null>(null)
  const reducedMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches ?? false
  const frameNow = useFrameNow(projection?.active === true || waitState.phase !== 'idle')
  const clockRead = clock(projection, frameNow, clockAnchorRef.current, identity)
  clockAnchorRef.current = clockRead.anchor
  const input = { projection, elapsed: clockRead.elapsed, frameNow, reducedMotion, identity }
  const view = advance(waitState, input)

  useLayoutEffect(() => {
    setWaitState(previous => advance(previous, input))
  }, [projection, clockRead.elapsed, frameNow, reducedMotion, identity, advance])

  if (view.phase === 'idle') return null
  return (
    <span className={css.root} data-reasoning-wait={view.phase} aria-hidden="true">
      <span
        className={css.fill}
        data-reasoning-wait-fill=""
        style={{ width: `${view.height * 100}%`, backgroundColor: view.color }}
      >
        {FILL_PARTICLES.map((particle, index) => (
          <span
            key={index}
            className={css.particle}
            data-reasoning-wait-particle=""
            style={particleStyle(particle)}
          />
        ))}
      </span>
    </span>
  )
}

function useFrameNow(active: boolean): number {
  const [, setTick] = useState(0)
  useEffect(() => {
    if (!active) return
    let frame = 0
    const tick = (): void => {
      setTick(value => value + 1)
      frame = requestAnimationFrame(tick)
    }
    frame = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(frame)
  }, [active])
  return performance.now()
}
