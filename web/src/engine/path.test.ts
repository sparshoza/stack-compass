import { describe, expect, it } from 'vitest'
import { kb as realKb, type Edge, type Tool } from '../lib/kb'
import { makeKb, makeTool } from './fixture'
import { routes } from './path'

const tool = (id: string, edges: Edge[] = [], name?: string): Tool =>
  makeTool(id, 'backend', { edges, ...(name ? { name } : {}) })

const ids = (rs: ReturnType<typeof routes>) => rs.map((r) => r.nodes.join(' > '))

describe('routes', () => {
  it('a direct relation is one step, worded the way the relation points', () => {
    const kb = makeKb(
      [tool('django', [], 'Django'), tool('django-orm', [{ type: 'built-on', target: 'django' }], 'Django ORM')],
      [],
    )
    const [route] = routes('django', 'django-orm', kb)
    expect(route.nodes).toEqual(['django', 'django-orm'])
    expect(route.steps).toEqual([
      { from: 'django', to: 'django-orm', type: 'built-on', text: 'Django ORM is built on Django' },
    ])
    expect(routes('django-orm', 'django', kb)[0].steps[0].text).toBe('Django ORM is built on Django')
  })

  it('words every relation type in plain English', () => {
    const kb = makeKb(
      [
        tool('a', [
          { type: 'pairs-with', target: 'b' },
          { type: 'alternative-to', target: 'c' },
          { type: 'extends', target: 'd' },
          { type: 'replaces', target: 'e' },
        ]),
        tool('b'),
        tool('c'),
        tool('d'),
        tool('e'),
      ],
      [],
    )
    expect(routes('a', 'b', kb)[0].steps[0].text).toBe('A pairs with B')
    expect(routes('a', 'c', kb)[0].steps[0].text).toBe('A is an alternative to C')
    expect(routes('d', 'a', kb)[0].steps[0].text).toBe('A extends D')
    expect(routes('a', 'e', kb)[0].steps[0].text).toBe('A replaces E')
  })

  it('symmetric relations read in travel order, directed ones the way they point', () => {
    const kb = makeKb(
      [tool('a', [{ type: 'pairs-with', target: 'b' }, { type: 'alternative-to', target: 'c' }]), tool('b'), tool('c')],
      [],
    )
    expect(routes('b', 'a', kb)[0].steps[0].text).toBe('B pairs with A')
    expect(routes('c', 'a', kb)[0].steps[0].text).toBe('C is an alternative to A')
  })

  it('finds the shortest routes over any relation, either way round', () => {
    // a - b - c - d, and a longer a - x - y - z - d
    const kb = makeKb(
      [
        tool('a', [{ type: 'pairs-with', target: 'b' }]),
        tool('b'),
        tool('c', [{ type: 'alternative-to', target: 'b' }, { type: 'built-on', target: 'd' }]),
        tool('d'),
        tool('x', [{ type: 'pairs-with', target: 'a' }, { type: 'pairs-with', target: 'y' }]),
        tool('y', [{ type: 'pairs-with', target: 'z' }]),
        tool('z', [{ type: 'pairs-with', target: 'd' }]),
      ],
      [],
    )
    const found = routes('a', 'd', kb)
    expect(ids(found)).toEqual(['a > b > c > d'])
    expect(found[0].steps.map((s) => s.type)).toEqual(['pairs-with', 'alternative-to', 'built-on'])
  })

  it('lists equal-length routes in id order, at most `max`', () => {
    const middles = ['m4', 'm2', 'm1', 'm3']
    const kb = makeKb(
      [tool('a', middles.map((m) => ({ type: 'pairs-with', target: m }))), tool('b'), ...middles.map((m) => tool(m, [{ type: 'pairs-with', target: 'b' }]))],
      [],
    )
    expect(ids(routes('a', 'b', kb))).toEqual(['a > m1 > b', 'a > m2 > b', 'a > m3 > b'])
    expect(routes('a', 'b', kb, 5)).toHaveLength(4)
    expect(ids(routes('a', 'b', kb, 1))).toEqual(['a > m1 > b'])
  })

  it('takes the strongest relation when two tools share several', () => {
    const kb = makeKb([tool('a', [{ type: 'pairs-with', target: 'b' }, { type: 'built-on', target: 'b' }]), tool('b')], [])
    expect(routes('a', 'b', kb)[0].steps[0].type).toBe('built-on')
  })

  it('no route between unconnected tools, the same tool, or unknown ids', () => {
    const kb = makeKb([tool('a', [{ type: 'pairs-with', target: 'b' }]), tool('b'), tool('c')], [])
    expect(routes('a', 'c', kb)).toEqual([])
    expect(routes('a', 'a', kb)).toEqual([])
    expect(routes('a', 'nope', kb)).toEqual([])
  })

  it('works on the real catalog: Django to PostgreSQL', () => {
    const found = routes('django', 'postgresql', realKb)
    expect(found.length).toBeGreaterThan(0)
    expect(found.length).toBeLessThanOrEqual(3)
    for (const r of found) {
      expect(r.nodes[0]).toBe('django')
      expect(r.nodes.at(-1)).toBe('postgresql')
      expect(r.steps).toHaveLength(r.nodes.length - 1)
      expect(r.nodes.length).toBe(found[0].nodes.length)
    }
  })
})
