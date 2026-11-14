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

const files = roots.flatMap((root) => walk(root))

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

const dashes = new RegExp(`[${String.fromCodePoint(0x2013)}${String.fromCodePoint(0x2014)}]`)
const upper = 'upper' + 'case'
const serif = 'se' + 'rif'

describe('UI bans', () => {
  it('scans both web/src and data', () => {
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

  it('no ripple or ping utilities', () => {
    const names = ['pi' + 'ng', 'rip' + 'ple', 'shock' + 'wave']
    const pattern = new RegExp(
      `(\\banimate-${names[0]}\\b)|(@keyframes\\s+[\\w-]*(${names.join('|')}))`,
      'i',
    )
    expect(offenders(pattern)).toEqual([])
  })

  it('no zero-padded section counters', () => {
    const pattern = new RegExp('\\b0[1-9]\\s*' + '/' + '\\s*0[1-9]\\b')
    expect(offenders(pattern)).toEqual([])
  })
})
