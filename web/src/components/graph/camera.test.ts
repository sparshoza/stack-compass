import { describe, expect, it, vi } from 'vitest'

// sigma reads WebGL constants when it loads; jsdom has no WebGL.
vi.hoisted(() => {
  const g = globalThis as Record<string, unknown>
  g.WebGLRenderingContext ??= class {}
  g.WebGL2RenderingContext ??= class {}
})

import { Camera } from 'sigma'
import { instantCamera } from './camera'

const finite = (state: { x: number; y: number; ratio: number }) =>
  [state.x, state.y, state.ratio].every(Number.isFinite)

describe('instantCamera', () => {
  // sigma 3.0.3 runs a zero-length animation as 0 / 0 progress: the camera
  // holds NaN until the next frame, and a second animation started before
  // then (a release after a small drag, then the click that ends a double
  // click) reads that NaN and keeps it, so the map stays blank.
  it('a zero-length animation never leaves the camera on NaN, even two in one frame', () => {
    const camera = instantCamera(new Camera())
    camera.animate({ x: 0.6, y: 0.4 }, { duration: 0 })
    expect(finite(camera.getState())).toBe(true)
    const { x, y } = camera.getState()
    camera.animate({ x: x + 0.1, y: y - 0.1, ratio: 0.5 }, { duration: 0 })
    const after = camera.getState()
    expect(after.x).toBeCloseTo(0.7)
    expect(after.y).toBeCloseTo(0.3)
    expect(after.ratio).toBe(0.5)
  })

  it('calls back at once and keeps longer animations as sigma runs them', async () => {
    const camera = instantCamera(new Camera())
    let called = false
    camera.animate({ x: 0.2 }, { duration: 0 }, () => {
      called = true
    })
    expect(called).toBe(true)
    await camera.animate({ x: 0.3 }, { duration: 0 })
    expect(camera.getState().x).toBeCloseTo(0.3)
    await camera.animate({ x: 0.4 }, { duration: 20 })
    expect(camera.getState().x).toBeCloseTo(0.4)
  })
})
