import { renderHook } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { hasWebGL, useWebGL } from './useWebGL'

function stubCanvas(getContext: () => unknown) {
  const real = document.createElement.bind(document)
  return vi.spyOn(document, 'createElement').mockImplementation((tag: string, options?: ElementCreationOptions) => {
    const el = real(tag, options)
    if (tag === 'canvas') Object.defineProperty(el, 'getContext', { value: getContext })
    return el
  })
}

describe('useWebGL', () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('is true when a WebGL context can be created', () => {
    stubCanvas(() => ({}))
    expect(hasWebGL()).toBe(true)
    expect(renderHook(() => useWebGL()).result.current).toBe(true)
  })

  it('is false when the browser returns no context', () => {
    stubCanvas(() => null)
    expect(hasWebGL()).toBe(false)
    expect(renderHook(() => useWebGL()).result.current).toBe(false)
  })

  it('is false when asking for a context throws', () => {
    stubCanvas(() => {
      throw new Error('blocked')
    })
    expect(hasWebGL()).toBe(false)
  })
})
