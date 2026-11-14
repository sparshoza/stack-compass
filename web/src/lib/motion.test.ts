import { readFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { act, renderHook } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  EASE_OUT_POINTS,
  cubicBezier,
  easeOut,
  prefersReducedMotion,
  readDuration,
  staggerSchedule,
  STAGGER_LIMIT_MS,
  tween,
  useReducedMotion,
} from './motion'

const tokens = readFileSync(join(resolve(import.meta.dirname), '..', 'styles', 'tokens.css'), 'utf8')

type Listener = () => void

/** A matchMedia stand-in whose reduced-motion answer can be flipped. */
function mockReducedMotion(initial: boolean) {
  let matches = initial
  const listeners = new Set<Listener>()
  window.matchMedia = vi.fn((query: string) => ({
    get matches() {
      return query.includes('prefers-reduced-motion') ? matches : false
    },
    media: query,
    onchange: null,
    addEventListener: (_: string, fn: Listener) => listeners.add(fn),
    removeEventListener: (_: string, fn: Listener) => listeners.delete(fn),
    addListener: () => {},
    removeListener: () => {},
    dispatchEvent: () => false,
  })) as unknown as typeof window.matchMedia
  return {
    set(next: boolean) {
      matches = next
      for (const fn of listeners) fn()
    },
  }
}

afterEach(() => {
  // @ts-expect-error restore jsdom's missing matchMedia
  delete window.matchMedia
  document.documentElement.removeAttribute('style')
  vi.useRealTimers()
  vi.restoreAllMocks()
})

describe('useReducedMotion', () => {
  it('is false where matchMedia does not exist (tests, old browsers)', () => {
    expect(prefersReducedMotion()).toBe(false)
    const { result } = renderHook(() => useReducedMotion())
    expect(result.current).toBe(false)
  })

  it('follows prefers-reduced-motion and its changes', () => {
    const media = mockReducedMotion(true)
    const { result } = renderHook(() => useReducedMotion())
    expect(result.current).toBe(true)
    act(() => media.set(false))
    expect(result.current).toBe(false)
    expect(prefersReducedMotion()).toBe(false)
  })
})

describe('readDuration', () => {
  it('reads a duration token in milliseconds', () => {
    const root = document.documentElement
    root.style.setProperty('--duration-slow', '280ms')
    root.style.setProperty('--duration-x', '0.2s')
    expect(readDuration('--duration-slow')).toBe(280)
    expect(readDuration('--duration-x')).toBe(200)
  })

  it('is 0 when the token is missing, so nothing moves without the tokens', () => {
    expect(readDuration('--duration-missing')).toBe(0)
  })

  it('is 0 with reduced motion, whatever the token says', () => {
    mockReducedMotion(true)
    document.documentElement.style.setProperty('--duration-slow', '280ms')
    expect(readDuration('--duration-slow')).toBe(0)
  })
})

describe('easing', () => {
  it('is the same curve as --ease-out in tokens.css', () => {
    const match = /--ease-out:\s*cubic-bezier\(([^)]+)\)/.exec(tokens)
    expect(match).not.toBeNull()
    expect(match![1].split(',').map(Number)).toEqual([...EASE_OUT_POINTS])
  })

  it('starts at 0, ends at 1, rises fast and never goes back', () => {
    expect(easeOut(0)).toBeCloseTo(0, 5)
    expect(easeOut(1)).toBeCloseTo(1, 5)
    expect(easeOut(0.25)).toBeGreaterThan(0.5)
    let last = 0
    for (let t = 0; t <= 1; t += 0.05) {
      const v = easeOut(t)
      expect(v).toBeGreaterThanOrEqual(last - 1e-9)
      last = v
    }
    expect(cubicBezier(0, 0, 1, 1)(0.3)).toBeCloseTo(0.3, 4)
  })
})

describe('staggerSchedule', () => {
  it('lights items in the given order and finishes within the 600ms limit', () => {
    const slots = staggerSchedule(14, { total: 480, each: 200 })
    expect(slots).toHaveLength(14)
    for (let i = 1; i < slots.length; i++) expect(slots[i].delay).toBeGreaterThan(slots[i - 1].delay)
    const end = Math.max(...slots.map((s) => s.delay + s.duration))
    expect(end).toBeLessThanOrEqual(480)
    expect(STAGGER_LIMIT_MS).toBe(600)
  })

  it('never runs past the 600ms limit even when the token asks for more', () => {
    const slots = staggerSchedule(30, { total: 2000, each: 900 })
    expect(Math.max(...slots.map((s) => s.delay + s.duration))).toBeLessThanOrEqual(STAGGER_LIMIT_MS)
  })

  it('is not uniform: the first gaps are wider than the last', () => {
    const slots = staggerSchedule(10, { total: 480, each: 200 })
    expect(slots[1].delay - slots[0].delay).toBeGreaterThan(slots[9].delay - slots[8].delay)
  })

  it('keeps a short list from trickling: at most 50ms between items', () => {
    const slots = staggerSchedule(3, { total: 480, each: 200 })
    expect(slots[1].delay - slots[0].delay).toBeLessThanOrEqual(50)
  })

  it('is all at once with no duration when the total is 0 (reduced motion)', () => {
    const slots = staggerSchedule(8, { total: 0, each: 0 })
    expect(slots.every((s) => s.delay === 0 && s.duration === 0)).toBe(true)
  })
})

describe('tween', () => {
  it('finishes at once, without a frame, when the duration is 0', () => {
    const raf = vi.spyOn(window, 'requestAnimationFrame')
    const frames: number[] = []
    const done = vi.fn()
    tween(0, (p) => frames.push(p), done)
    expect(frames).toEqual([1])
    expect(done).toHaveBeenCalledTimes(1)
    expect(raf).not.toHaveBeenCalled()
  })

  it('runs on animation frames and lands exactly on 1', () => {
    vi.useFakeTimers({ toFake: ['requestAnimationFrame', 'cancelAnimationFrame', 'performance'] })
    const frames: number[] = []
    const done = vi.fn()
    tween(200, (p) => frames.push(p), done)
    vi.advanceTimersByTime(100)
    expect(frames.length).toBeGreaterThan(0)
    expect(frames.at(-1)!).toBeLessThan(1)
    expect(done).not.toHaveBeenCalled()
    vi.advanceTimersByTime(150)
    expect(frames.at(-1)).toBe(1)
    expect(done).toHaveBeenCalledTimes(1)
  })

  it('stops where it is when cancelled', () => {
    vi.useFakeTimers({ toFake: ['requestAnimationFrame', 'cancelAnimationFrame', 'performance'] })
    const frames: number[] = []
    const done = vi.fn()
    const cancel = tween(200, (p) => frames.push(p), done)
    vi.advanceTimersByTime(50)
    const seen = frames.length
    cancel()
    vi.advanceTimersByTime(300)
    expect(frames).toHaveLength(seen)
    expect(done).not.toHaveBeenCalled()
  })
})
