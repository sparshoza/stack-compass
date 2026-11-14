import { act, renderHook } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { THEME_KEY, readTheme, useTheme } from './theme'

describe('theme', () => {
  afterEach(() => vi.restoreAllMocks())

  it('defaults to dark', () => {
    const { result } = renderHook(() => useTheme())
    expect(result.current[0]).toBe('dark')
    expect(document.documentElement.dataset.theme).toBe('dark')
  })

  it('toggles, saves the choice and sets data-theme on html', () => {
    const { result } = renderHook(() => useTheme())
    act(() => result.current[1]())
    expect(result.current[0]).toBe('light')
    expect(document.documentElement.dataset.theme).toBe('light')
    expect(window.localStorage.getItem(THEME_KEY)).toBe('light')
    act(() => result.current[1]())
    expect(result.current[0]).toBe('dark')
    expect(window.localStorage.getItem(THEME_KEY)).toBe('dark')
  })

  it('saves nothing until the visitor picks a theme', () => {
    renderHook(() => useTheme())
    expect(window.localStorage.getItem(THEME_KEY)).toBeNull()
  })

  it('starts from the theme already on html', () => {
    document.documentElement.dataset.theme = 'light'
    expect(readTheme()).toBe('light')
  })

  it('ignores unknown saved values', () => {
    window.localStorage.setItem(THEME_KEY, 'sepia')
    expect(readTheme()).toBe('dark')
  })

  it('still toggles when storage throws', () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('blocked')
    })
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('blocked')
    })
    const { result } = renderHook(() => useTheme())
    expect(result.current[0]).toBe('dark')
    act(() => result.current[1]())
    expect(result.current[0]).toBe('light')
    expect(document.documentElement.dataset.theme).toBe('light')
  })
})
