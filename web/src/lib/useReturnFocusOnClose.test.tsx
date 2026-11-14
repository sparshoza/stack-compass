import { renderHook } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { useReturnFocusOnClose } from './useReturnFocusOnClose'

afterEach(() => {
  document.body.innerHTML = ''
})

function setup() {
  const panel = document.createElement('div')
  const inside = document.createElement('button')
  const elsewhere = document.createElement('button')
  panel.append(inside)
  document.body.append(panel, elsewhere)
  const content = { current: panel as HTMLElement | null }
  const restore = vi.fn()
  const hook = renderHook(({ open }) => useReturnFocusOnClose(open, restore, content), { initialProps: { open: true } })
  return { inside, elsewhere, restore, content, ...hook }
}

describe('useReturnFocusOnClose', () => {
  it('hands focus back the moment the surface closes, while it still holds focus', () => {
    const { inside, restore, rerender } = setup()
    inside.focus()
    rerender({ open: false })
    expect(restore).toHaveBeenCalledTimes(1)
  })

  it('hands focus back when focus was lost (the surface already gone)', () => {
    const { restore, rerender, content } = setup()
    content.current = null
    rerender({ open: false })
    expect(restore).toHaveBeenCalledTimes(1)
  })

  it('leaves focus alone when it has already moved to something else', () => {
    const { elsewhere, restore, rerender } = setup()
    elsewhere.focus()
    rerender({ open: false })
    expect(restore).not.toHaveBeenCalled()
  })

  it('does nothing on open, and stops Radix moving focus again after the exit', () => {
    const { restore, result } = setup()
    expect(restore).not.toHaveBeenCalled()
    const event = new Event('focusout', { cancelable: true })
    result.current(event)
    expect(event.defaultPrevented).toBe(true)
  })
})
