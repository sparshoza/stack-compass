import { describe, expect, it } from 'vitest'
import { escapeClearsField } from './escape'

function input(type: string, value: string) {
  const el = document.createElement('input')
  el.type = type
  el.value = value
  return el
}

describe('escapeClearsField', () => {
  it('keeps Escape in a text or search field that holds text', () => {
    expect(escapeClearsField(input('text', 'react'))).toBe(true)
    expect(escapeClearsField(input('search', 'react'))).toBe(true)
  })

  it('lets Escape through from an empty field', () => {
    expect(escapeClearsField(input('search', ''))).toBe(false)
  })

  it('lets Escape through from radios and checkboxes, which always have a value', () => {
    expect(escapeClearsField(input('radio', 'saas'))).toBe(false)
    expect(escapeClearsField(input('checkbox', 'payments'))).toBe(false)
  })

  it('lets Escape through from anything that is not an input', () => {
    expect(escapeClearsField(document.createElement('button'))).toBe(false)
    expect(escapeClearsField(null)).toBe(false)
  })
})
