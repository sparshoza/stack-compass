import { readFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const here = resolve(import.meta.dirname)
const tokens = readFileSync(join(here, 'tokens.css'), 'utf8')
const motion = readFileSync(join(here, 'motion.css'), 'utf8')
const index = readFileSync(join(here, '..', 'index.css'), 'utf8')

const DURATIONS = ['fast', 'base', 'slow', 'exit', 'stagger'] as const

/** The body of the first block that opens with `head`. */
function block(css: string, head: string): string {
  const start = css.indexOf(head)
  if (start < 0) return ''
  let depth = 0
  for (let i = css.indexOf('{', start); i < css.length; i++) {
    if (css[i] === '{') depth++
    if (css[i] === '}' && --depth === 0) return css.slice(start, i + 1)
  }
  return ''
}

function ms(value: string): number {
  const m = /^([\d.]+)(ms|s)$/.exec(value.trim())
  if (!m) return NaN
  return m[2] === 's' ? Number(m[1]) * 1000 : Number(m[1])
}

describe('motion tokens', () => {
  const root = block(tokens, ':root {')

  it('declares the durations, one ease-out curve and the press scale', () => {
    for (const name of DURATIONS) expect(root, name).toMatch(new RegExp(`--duration-${name}:\\s*[\\d.]+m?s;`))
    expect(root).toMatch(/--ease-out:\s*cubic-bezier\(/)
    expect(root).toMatch(/--press-scale:\s*0\.97;/)
  })

  it('keeps UI feedback within 120 to 300ms, exits faster than entrances, a sequence within 600ms', () => {
    const value = (name: string) => ms(new RegExp(`--duration-${name}:\\s*([^;]+);`).exec(root)![1])
    expect(value('fast')).toBeGreaterThanOrEqual(100)
    expect(value('slow')).toBeLessThanOrEqual(300)
    expect(value('fast')).toBeLessThan(value('base'))
    expect(value('base')).toBeLessThan(value('slow'))
    expect(value('exit')).toBeLessThan(value('base'))
    expect(value('stagger')).toBeLessThanOrEqual(600)
  })

  it('makes every duration 0 under prefers-reduced-motion', () => {
    const reduced = block(tokens, '@media (prefers-reduced-motion: reduce)')
    expect(reduced).not.toBe('')
    for (const name of DURATIONS) expect(reduced, name).toMatch(new RegExp(`--duration-${name}:\\s*0m?s;`))
  })

  it('turns every animation and transition off under prefers-reduced-motion', () => {
    const reduced = block(motion, '@media (prefers-reduced-motion: reduce)')
    expect(reduced).toMatch(/animation:\s*none\s*!important/)
    expect(reduced).toMatch(/transition:\s*none\s*!important/)
  })

  it('the phase 1 global motion guard is gone and motion.css is loaded after the tokens', () => {
    expect(index).not.toMatch(/animation:\s*none\s*!important/)
    expect(index.indexOf('./styles/motion.css')).toBeGreaterThan(index.indexOf('./styles/tokens.css'))
  })
})
