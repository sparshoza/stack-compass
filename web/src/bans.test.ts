import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join, relative, resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

// Banned patterns are assembled from parts and code points so this file
// never contains the text it searches for.
const webSrc = resolve(import.meta.dirname)
const repoRoot = resolve(webSrc, '..', '..')
const dataDir = join(repoRoot, 'data')
const roots = [webSrc, dataDir]
const skipDirs = new Set(['node_modules', 'dist', '.git'])
const binary = /\.(png|jpe?g|gif|webp|avif|ico|woff2?|ttf|otf)$/i

function walk(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    if (skipDirs.has(name)) continue
    const path = join(dir, name)
    if (statSync(path).isDirectory()) walk(path, out)
    else if (!binary.test(name)) out.push(path)
  }
  return out
}

// The HTML shell has an inline script and could hold inline styles.
const indexHtml = resolve(webSrc, '..', 'index.html')
const files = [...roots.flatMap((root) => walk(root)), indexHtml]

function offenders(pattern: RegExp): string[] {
  const hits: string[] = []
  for (const file of files) {
    readFileSync(file, 'utf8')
      .split('\n')
      .forEach((line, i) => {
        if (pattern.test(line)) hits.push(`${relative(repoRoot, file)}:${i + 1}`)
      })
  }
  return hits
}

// Motion rules. Every animation and transition is written in a stylesheet
// with the duration and easing tokens from styles/tokens.css; components
// only add the classes from styles/motion.css.
const tokensFile = join(webSrc, 'styles', 'tokens.css')
const isTest = (file: string) => /\.test\.tsx?$/.test(file)
const cssFiles = () => files.filter((f) => (f.startsWith(webSrc) && f.endsWith('.css')) || f === indexHtml)
const codeFiles = () => files.filter((f) => (f.startsWith(webSrc) && /\.tsx?$/.test(f) && !isTest(f)) || f === indexHtml)
const MOVING = new Set(['transform', 'opacity'])
// Colour may cross-fade only on toggles (controller ruling PR7, DESIGN.md Motion).
const FADING = new Set([...MOVING, 'color', 'background-color', 'border-color'])
const COLOUR_CLASSES = /\.motion-(colors|thumb)\b/
const RAW_TIME = /(?<![\w.-])\d*\.?\d+m?s\b/

/** The selector of the rule that holds the declaration at `index`. */
function selectorAt(css: string, index: number): string {
  const open = css.lastIndexOf('{', index)
  const start = Math.max(css.lastIndexOf('}', open), css.lastIndexOf(';', open), css.lastIndexOf('*/', open) + 1)
  return css.slice(start + 1, open).trim()
}

function where(file: string, text: string, index: number): string {
  return `${relative(repoRoot, file)}:${text.slice(0, index).split('\n').length}`
}

/** Properties set inside any @keyframes block that are not transform or opacity. */
function keyframeOffenders(): string[] {
  const hits: string[] = []
  for (const file of cssFiles()) {
    const css = readFileSync(file, 'utf8')
    for (const m of css.matchAll(/@keyframes\s+[\w-]+\s*\{/g)) {
      let depth = 0
      let end = m.index
      for (let i = m.index + m[0].length - 1; i < css.length; i++) {
        if (css[i] === '{') depth++
        if (css[i] === '}' && --depth === 0) {
          end = i
          break
        }
      }
      const body = css.slice(m.index + m[0].length, end)
      for (const prop of body.matchAll(/([\w-]+)\s*:/g)) {
        if (!MOVING.has(prop[1])) hits.push(`${where(file, css, m.index)} ${prop[1]}`)
      }
    }
  }
  return hits
}

/** Transitions that name a property outside the allowed list, or none at all (which means every property). */
function transitionOffenders(): string[] {
  const hits: string[] = []
  for (const file of cssFiles()) {
    const css = readFileSync(file, 'utf8')
    for (const m of css.matchAll(/(?<![\w-])transition(-property)?\s*:\s*([^;}]+)/g)) {
      const value = m[2].replace(/!important/, '').trim()
      if (value === 'none') continue
      const allowed = COLOUR_CLASSES.test(selectorAt(css, m.index)) ? FADING : MOVING
      for (const part of value.split(/,(?![^(]*\))/)) {
        const prop = part.trim().split(/\s+/)[0]
        if (!allowed.has(prop)) hits.push(`${where(file, css, m.index)} ${prop}`)
      }
    }
  }
  return hits
}

/** Raw times outside tokens.css, motion declarations without the tokens, and timing utilities in components. */
function timingOffenders(): string[] {
  const hits: string[] = []
  for (const file of cssFiles()) {
    if (file === tokensFile) continue
    const css = readFileSync(file, 'utf8')
    // index.html is scanned for times only inside a style element or attribute.
    const text = file === indexHtml ? [...css.matchAll(/<style[^>]*>([\s\S]*?)<\/style>|style="([^"]*)"/g)].map((m) => m[1] ?? m[2]).join('\n') : css
    for (const m of text.matchAll(new RegExp(RAW_TIME, 'g'))) hits.push(`${where(file, text, m.index)} ${m[0]}`)
    for (const m of css.matchAll(/(?<![\w-])(animation|transition)\s*:\s*([^;}]+)/g)) {
      const value = m[2].replace(/!important/, '').trim()
      if (value === 'none') continue
      for (const part of value.split(/,(?![^(]*\))/)) {
        if (!/var\(--duration-[\w-]+\)/.test(part) || !/var\(--ease-[\w-]+\)/.test(part)) {
          hits.push(`${where(file, css, m.index)} ${part.trim()}`)
        }
      }
    }
    for (const m of css.matchAll(/(animation|transition)-(duration|delay|timing-function)\s*:\s*([^;}]+)/g)) {
      if (!/^var\(--(duration|ease)-[\w-]+\)/.test(m[3].trim())) hits.push(`${where(file, css, m.index)} ${m[0]}`)
    }
  }
  const utility = /(?<![\w-])((duration|delay)-\d|ease-(in|out|linear|\[)|transition(-[\w[]+)?(?![\w-])|animate-[\w[])/
  for (const file of codeFiles()) {
    const code = readFileSync(file, 'utf8')
    // Class names live in string literals; comments may say the words.
    for (const m of code.matchAll(/(["'`])((?:(?!\1)[^\\\n]|\\.)*)\1/g)) {
      // A timing utility, a raw time ('opacity 200ms') or a value for every property.
      if (utility.test(m[2]) || RAW_TIME.test(m[2]) || /^\s*all\b/.test(m[2])) {
        hits.push(`${where(file, code, m.index)} ${m[2]}`)
      }
    }
    // Inline style motion (transition, transitionProperty, animationName, ...): motion lives in motion.css.
    for (const m of code.matchAll(/(?<![\w-])(transition|animation)(-?[A-Za-z]+)?["']?\s*:/g)) {
      hits.push(`${where(file, code, m.index)} ${m[0]}`)
    }
    // A camera or tween duration written as a number (0.3 too) instead of read from a token.
    for (const m of code.matchAll(/[dD]uration\s*:\s*(0?\.\d*[1-9]|[1-9])/g)) hits.push(`${where(file, code, m.index)} ${m[0]}`)
  }
  return hits
}

const dashes = new RegExp(`[${String.fromCodePoint(0x2013)}${String.fromCodePoint(0x2014)}]`)
const upper = 'upper' + 'case'
const serif = 'se' + 'rif'

describe('UI bans', () => {
  it('scans web/src, data and the HTML shell', () => {
    expect(files).toContain(indexHtml)
    expect(files.some((f) => f.startsWith(webSrc))).toBe(true)
    expect(files.some((f) => f.startsWith(dataDir))).toBe(true)
  })

  it('no em dash or en dash characters', () => {
    expect(offenders(dashes)).toEqual([])
  })

  it(`no ${upper} text transform`, () => {
    const pattern = new RegExp(`(\\b${upper}\\b)|(text-transform\\s*:\\s*${upper})`, 'i')
    expect(offenders(pattern)).toEqual([])
  })

  it('no serif font family', () => {
    const pattern = new RegExp(
      `(\\bfont-${serif}\\b)|((font-family|--font[\\w-]*)\\s*:[^;]*(?<![\\w-])${serif}\\b)`,
      'i',
    )
    expect(offenders(pattern)).toEqual([])
  })

  it('no ping, bounce or pulse utilities and no ripple, shockwave or glow keyframes', () => {
    const names = ['pi' + 'ng', 'rip' + 'ple', 'shock' + 'wave', 'pul' + 'se', 'bou' + 'nce', 'gl' + 'ow']
    const pattern = new RegExp(
      `(\\banimate-(${names[0]}|${names[3]}|${names[4]})\\b)|(@keyframes\\s+[\\w-]*(${names.join('|')}))`,
      'i',
    )
    expect(offenders(pattern)).toEqual([])
  })

  it('no transition on every property', () => {
    const all = 'a' + 'll'
    const pattern = new RegExp(`(\\btransition-${all}\\b)|(transition(-property)?\\s*:\\s*${all}\\b)`, 'i')
    expect(offenders(pattern)).toEqual([])
  })

  it('keyframes move only transform and opacity (no shadow, filter or blur animation)', () => {
    expect(keyframeOffenders()).toEqual([])
  })

  it('transitions name only transform or opacity; colour only on .motion-colors and .motion-thumb', () => {
    expect(transitionOffenders()).toEqual([])
  })

  it('motion timing comes only from the duration and easing tokens', () => {
    expect(timingOffenders()).toEqual([])
  })

  it('no zero-padded section counters', () => {
    const pattern = new RegExp('\\b0[1-9]\\s*' + '/' + '\\s*0[1-9]\\b')
    expect(offenders(pattern)).toEqual([])
  })
})
