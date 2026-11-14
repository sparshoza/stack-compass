import { describe, expect, it } from 'vitest'
import { relationsOf } from './relations'

const names = (id: string, key: string) =>
  relationsOf(id)
    .find((g) => g.key === key)
    ?.tools.map((t) => t.id) ?? []

describe('relationsOf', () => {
  it('groups by edge type in a fixed order with readable labels', () => {
    const groups = relationsOf('nextjs')
    expect(groups.map((g) => g.label)).toContain('Built on')
    expect(names('nextjs', 'built-on')).toContain('react')
  })

  it('includes relations listed only on the other tool, from that side', () => {
    expect(names('react', 'base-for')).toContain('nextjs')
    expect(relationsOf('react').find((g) => g.key === 'base-for')?.label).toBe('Base for')
  })

  it('treats alternatives and pairings as symmetric and lists each tool once', () => {
    const alts = names('express', 'alternative-to')
    expect(alts).toContain('fastify')
    expect(new Set(alts).size).toBe(alts.length)
    expect(names('fastify', 'alternative-to')).toContain('express')
    expect(names('postgresql', 'pairs-with')).toContain('express')
  })

  it('sorts tools by name and skips empty groups', () => {
    for (const group of relationsOf('express')) {
      expect(group.tools.length).toBeGreaterThan(0)
      const sorted = [...group.tools].sort((a, b) => a.name.localeCompare(b.name, 'en', { sensitivity: 'base' }))
      expect(group.tools.map((t) => t.id)).toEqual(sorted.map((t) => t.id))
    }
  })

  it('returns nothing for an unknown id', () => {
    expect(relationsOf('not-a-tool')).toEqual([])
  })
})
