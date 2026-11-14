import { useSyncExternalStore } from 'react'

/*
 * Motion helpers for the parts CSS cannot animate (the map camera and the
 * pick sequence, both drawn by sigma). Durations are read from the tokens in
 * styles/tokens.css, so a reduced-motion preference or missing tokens give 0.
 */

const REDUCED = '(prefers-reduced-motion: reduce)'

/** Longest a staggered sequence may run, start to finish (DESIGN.md, Motion). */
export const STAGGER_LIMIT_MS = 600
/** Most time between two items of a short sequence, so it reads as one wave. */
const MAX_STEP_MS = 50

function reducedQuery(): MediaQueryList | null {
  return typeof window !== 'undefined' && typeof window.matchMedia === 'function' ? window.matchMedia(REDUCED) : null
}

/** True when the reader asked for reduced motion. False where matchMedia is missing. */
export function prefersReducedMotion(): boolean {
  return reducedQuery()?.matches ?? false
}

function subscribe(onChange: () => void): () => void {
  const list = reducedQuery()
  if (!list) return () => {}
  list.addEventListener('change', onChange)
  return () => list.removeEventListener('change', onChange)
}

/** The reduced-motion preference, kept current when the reader changes it. */
export function useReducedMotion(): boolean {
  return useSyncExternalStore(subscribe, prefersReducedMotion, () => false)
}

/** A duration token in milliseconds; 0 with reduced motion or when the token is not set. */
export function readDuration(name: string, root: HTMLElement = document.documentElement): number {
  if (prefersReducedMotion()) return 0
  const value = getComputedStyle(root).getPropertyValue(name).trim()
  const m = /^([\d.]+)(ms|s)$/.exec(value)
  if (!m) return 0
  return m[2] === 's' ? Number(m[1]) * 1000 : Number(m[1])
}

/** The control points of --ease-out in tokens.css (a test keeps them equal). */
export const EASE_OUT_POINTS = [0.22, 1, 0.36, 1] as const

/** A CSS cubic-bezier timing function as a plain function of progress (0 to 1). */
export function cubicBezier(x1: number, y1: number, x2: number, y2: number): (t: number) => number {
  const bez = (a: number, b: number, s: number) => 3 * a * s * (1 - s) ** 2 + 3 * b * s * s * (1 - s) + s ** 3
  const slope = (a: number, b: number, s: number) => 3 * a * (1 - s) ** 2 + 6 * (b - a) * s * (1 - s) + 3 * (1 - b) * s * s
  return (t) => {
    if (t <= 0) return 0
    if (t >= 1) return 1
    // Solve x(s) = t with Newton steps, then bisection if the slope is flat.
    let s = t
    for (let i = 0; i < 8; i++) {
      const dx = bez(x1, x2, s) - t
      if (Math.abs(dx) < 1e-6) return bez(y1, y2, s)
      const d = slope(x1, x2, s)
      if (Math.abs(d) < 1e-6) break
      s -= dx / d
    }
    let lo = 0
    let hi = 1
    s = t
    for (let i = 0; i < 30; i++) {
      const x = bez(x1, x2, s)
      if (Math.abs(x - t) < 1e-6) break
      if (x < t) lo = s
      else hi = s
      s = (lo + hi) / 2
    }
    return bez(y1, y2, s)
  }
}

export const easeOut = cubicBezier(...EASE_OUT_POINTS)

export interface Slot {
  /** When this item starts, from the start of the sequence. */
  delay: number
  /** How long its own change takes. */
  duration: number
}

/**
 * Start times for a sequence of `count` items in the given order. The whole
 * sequence ends within `total` (and never past STAGGER_LIMIT_MS); each item
 * takes `each`. Gaps are near-uniform, a little wider at the start than at
 * the end (a quarter of the delay curve is an ease-out), so it reads as one
 * wave without the last items bunching up; a short list never waits more
 * than MAX_STEP_MS between items. A total of 0 puts everything at
 * once with no duration.
 */
export function staggerSchedule(count: number, opts: { total: number; each: number }): Slot[] {
  const total = Math.min(Math.max(opts.total, 0), STAGGER_LIMIT_MS)
  if (count <= 0) return []
  if (total === 0) return Array.from({ length: count }, () => ({ delay: 0, duration: 0 }))
  const duration = Math.min(Math.max(opts.each, 0), total)
  // Share of the span reached at progress p: three quarters linear, one quarter ease-out.
  const curve = (p: number) => 0.75 * p + 0.25 * (1 - (1 - p) ** 2)
  // The first gap is the widest; it may be at most MAX_STEP_MS.
  const firstGap = count > 1 ? curve(1 / (count - 1)) : 1
  const span = count > 1 ? Math.min(total - duration, MAX_STEP_MS / firstGap) : 0
  return Array.from({ length: count }, (_, i) => ({
    delay: span * curve(count > 1 ? i / (count - 1) : 0),
    duration,
  }))
}

/**
 * Calls `frame(progress)` on each animation frame for `duration` ms from
 * the first frame, linear progress from 0 to exactly 1, then `done`. A duration of 0 calls frame(1)
 * and done at once. Returns a cancel function that stops it where it is.
 */
export function tween(duration: number, frame: (progress: number) => void, done?: () => void): () => void {
  if (duration <= 0) {
    frame(1)
    done?.()
    return () => {}
  }
  // The clock starts on the first frame, not now: a slow commit (a panel
  // mounting in the same click) then delays the motion instead of eating
  // its first frames.
  let start = -1
  let id = requestAnimationFrame(function step(now) {
    if (start < 0) start = now
    const t = Math.min(1, (now - start) / duration)
    frame(t)
    if (t < 1) id = requestAnimationFrame(step)
    else done?.()
  })
  return () => cancelAnimationFrame(id)
}
