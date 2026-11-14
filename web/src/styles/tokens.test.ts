import { readFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const here = resolve(import.meta.dirname)
const css = readFileSync(join(here, 'tokens.css'), 'utf8')

/** The custom properties declared in one theme block. */
function theme(selector: string): Record<string, string> {
  const start = css.indexOf(`${selector} {`)
  const body = css.slice(start, css.indexOf('}', start))
  return Object.fromEntries([...body.matchAll(/--([\w-]+):\s*(#[0-9a-f]{6})/gi)].map((m) => [m[1], m[2]]))
}

function luminance(hex: string): number {
  const [r, g, b] = [1, 3, 5].map((i) => {
    const c = parseInt(hex.slice(i, i + 2), 16) / 255
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4
  })
  return 0.2126 * r + 0.7152 * g + 0.0722 * b
}

function ratio(a: string, b: string): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x)
  return (hi + 0.05) / (lo + 0.05)
}

describe('design tokens', () => {
  // WCAG 1.4.11: a text field's border is what shows where to type.
  for (const [name, selector] of [
    ['dark', ':root'],
    ['light', ":root[data-theme='light']"],
  ] as const) {
    it(`text field borders hold 3:1 on every ground in the ${name} theme`, () => {
      const t = theme(selector)
      expect(t['line-field']).toBeDefined()
      for (const ground of ['bg', 'surface', 'raised']) {
        expect(ratio(t['line-field'], t[ground]), ground).toBeGreaterThanOrEqual(3)
      }
    })
  }

  // Map edges at rest: visible as thin grey lines, still well under the
  // focused-edge colour and the text.
  for (const [name, selector, min] of [
    ['dark', ':root', 1.6],
    ['light', ":root[data-theme='light']", 1.35],
  ] as const) {
    it(`map edges read at rest but stay quiet in the ${name} theme`, () => {
      const t = theme(selector)
      const edge = ratio(t.edge, t.bg)
      expect(edge).toBeGreaterThanOrEqual(min)
      expect(edge).toBeLessThan(2.2)
      expect(ratio(t['edge-strong'], t.bg)).toBeGreaterThan(edge * 1.5)
      expect(ratio(t['text-faint'], t.bg)).toBeGreaterThan(edge * 2)
    })
  }

  it('every text field uses the field border', () => {
    const files = [
      '../components/map/SearchBox.tsx',
      '../components/map/ToolTable.tsx',
      '../components/choose/Describe.tsx',
      '../components/choose/ChooseSheet.tsx',
      '../components/choose/Questions.tsx',
    ]
    for (const file of files) {
      const source = readFileSync(join(here, file), 'utf8')
      expect(source, file).toMatch(/border-line-field/)
    }
  })
})
