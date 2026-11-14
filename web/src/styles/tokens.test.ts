import { readFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { FALLBACK_PALETTE } from '../components/graph/model'

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


function linear(hex: string): number[] {
  return [1, 3, 5].map((i) => {
    const c = parseInt(hex.slice(i, i + 2), 16) / 255
    return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4
  })
}

function oklab([r, g, b]: number[]): number[] {
  const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b)
  const m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b)
  const s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b)
  return [
    0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s,
    1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s,
    0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s,
  ]
}

// Machado, Oliveira and Fernandes (2009) at full severity, on linear RGB.
const CVD = {
  protan: [
    [0.152286, 1.052583, -0.204868],
    [0.114503, 0.786281, 0.099216],
    [-0.003882, -0.048116, 1.051998],
  ],
  deutan: [
    [0.367322, 0.860646, -0.227968],
    [0.280085, 0.672501, 0.047413],
    [-0.01182, 0.04294, 0.968881],
  ],
}

function simulate(rgb: number[], m: number[][]): number[] {
  return m.map((row) => Math.min(1, Math.max(0, row[0] * rgb[0] + row[1] * rgb[1] + row[2] * rgb[2])))
}

/** Colour difference: distance in OKLab x100, for normal vision or a simulated deficiency. */
function deltaE(a: string, b: string, kind?: keyof typeof CVD): number {
  const see = (hex: string) => oklab(kind ? simulate(linear(hex), CVD[kind]) : linear(hex))
  const [p, q] = [see(a), see(b)]
  return 100 * Math.hypot(p[0] - q[0], p[1] - q[1], p[2] - q[2])
}

/** OKLCH lightness, chroma and hue in degrees. */
function lch(hex: string): { l: number; c: number; h: number } {
  const [l, a, b] = oklab(linear(hex))
  return { l, c: Math.hypot(a, b), h: ((Math.atan2(b, a) * 180) / Math.PI + 360) % 360 }
}

const FAMILY_IDS = ['client', 'server', 'data', 'services', 'ops']
const THEMES = [
  ['dark', ':root'],
  ['light', ":root[data-theme='light']"],
] as const

function pairs<T>(items: T[]): [T, T][] {
  return items.flatMap((a, i) => items.slice(i + 1).map((b) => [a, b] as [T, T]))
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

  // WCAG 1.4.11: an unselected chip or segmented control is only its outline.
  for (const [name, selector] of [
    ['dark', ':root'],
    ['light', ":root[data-theme='light']"],
  ] as const) {
    it(`control outlines hold 3:1 on every ground in the ${name} theme`, () => {
      const t = theme(selector)
      expect(t['line-control']).toBeDefined()
      for (const ground of ['bg', 'surface', 'raised']) {
        expect(ratio(t['line-control'], t[ground]), ground).toBeGreaterThanOrEqual(3)
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


  // The map's colours. A dot is 5 to 7 px, so the hues must differ by more
  // than a shade, for normal vision and for the two common red-green
  // deficiencies (the dataviz method: OKLab distance x100 under the Machado
  // simulation; 15 is its normal-vision floor, 6 its colour-blind floor).
  for (const [name, selector] of THEMES) {
    describe(`map palette, ${name} theme`, () => {
      const t = theme(selector)
      const families = FAMILY_IDS.map((id) => t[`family-${id}`])

      it('family dots hold 3:1 on every ground', () => {
        for (const [i, colour] of families.entries()) {
          for (const ground of ['bg', 'surface', 'raised']) {
            expect(ratio(colour, t[ground]), `${FAMILY_IDS[i]} on ${ground}`).toBeGreaterThanOrEqual(3)
          }
        }
      })

      it('the accent and its ink hold 4.5:1', () => {
        for (const ground of ['bg', 'surface', 'raised']) {
          expect(ratio(t.accent, t[ground]), ground).toBeGreaterThanOrEqual(4.5)
        }
        expect(ratio(t['accent-ink'], t.accent)).toBeGreaterThanOrEqual(4.5)
      })

      it('every two families are told apart with full colour vision', () => {
        for (const [a, b] of pairs(families)) expect(deltaE(a, b), `${a} vs ${b}`).toBeGreaterThanOrEqual(15)
      })

      it('every two families are told apart with protanopia and deuteranopia', () => {
        for (const [a, b] of pairs(families)) {
          for (const kind of ['protan', 'deutan'] as const) {
            expect(deltaE(a, b, kind), `${a} vs ${b} (${kind})`).toBeGreaterThanOrEqual(6)
          }
        }
      })

      it('the accent stands apart from every family', () => {
        for (const colour of families) {
          expect(deltaE(t.accent, colour), colour).toBeGreaterThanOrEqual(15)
          for (const kind of ['protan', 'deutan'] as const) {
            expect(deltaE(t.accent, colour, kind), `${colour} (${kind})`).toBeGreaterThanOrEqual(6)
          }
        }
      })

      it('no colour is a muddy olive, mustard or brown', () => {
        // Yellow to yellow-green hues turn olive and mustard when they are dark.
        for (const colour of [...families, t.accent]) {
          const { l, h } = lch(colour)
          if (h >= 45 && h <= 135) expect(l, colour).toBeGreaterThanOrEqual(0.6)
        }
      })

      it('family hues stay calm', () => {
        for (const colour of families) expect(lch(colour).c, colour).toBeLessThanOrEqual(name === 'dark' ? 0.12 : 0.16)
      })
    })
  }

  it('the map fallback palette mirrors the dark tokens', () => {
    const t = theme(':root')
    const families = Object.fromEntries(FAMILY_IDS.map((id) => [id, t[`family-${id}`]]))
    expect(FALLBACK_PALETTE.families).toEqual(families)
    expect(FALLBACK_PALETTE.accent).toBe(t.accent)
    expect(FALLBACK_PALETTE.background).toBe(t.bg)
  })

  it('chips, switches and segmented controls use the control outline, not the divider grey', () => {
    const files = [
      '../components/choose/OptionChip.tsx',
      '../components/choose/Questions.tsx',
      '../components/choose/OnePiece.tsx',
      '../components/choose/ChooseSheet.tsx',
      '../components/choose/LayerRow.tsx',
      '../components/map/FiltersPopover.tsx',
      '../components/map/ToolPanel.tsx',
      '../components/ui/button.tsx',
    ]
    for (const file of files) {
      const source = readFileSync(join(here, file), 'utf8')
      expect(source, file).toMatch(/border-line-control/)
      expect(source, file).not.toMatch(/border-line-strong/)
    }
  })

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
