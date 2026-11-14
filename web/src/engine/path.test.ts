import { describe, expect, it } from 'vitest'
import { kb as realKb, type Edge, type Layer, type Tool } from '../lib/kb'
import { makeKb, makeTool } from './fixture'
import { connect, type Connection } from './path'

const tool = (id: string, edges: Edge[] = [], extra: Partial<Tool> = {}): Tool =>
  makeTool(id, (extra.layer as Layer) ?? 'backend', { edges, ...extra })
const pair = (target: string): Edge => ({ type: 'pairs-with', target })
const alt = (target: string): Edge => ({ type: 'alternative-to', target })

const paths = (c: Connection) => c.routes.map((r) => r.nodes.join(' > '))
const middles = (c: Connection) => c.routes.map((r) => r.nodes.slice(1, -1).join(' > '))
const none: Connection = { alternatives: false, routes: [], throughAlternatives: false, shared: [] }

describe('connect', () => {
  it('a direct relation is one step, worded the way the relation points', () => {
    const kb = makeKb(
      [
        tool('django', [], { name: 'Django' }),
        tool('django-orm', [{ type: 'built-on', target: 'django' }], { name: 'Django ORM' }),
      ],
      [],
    )
    const c = connect('django', 'django-orm', kb)
    expect(c.alternatives).toBe(false)
    expect(c.routes[0].steps).toEqual([
      { from: 'django', to: 'django-orm', type: 'built-on', text: 'Django ORM is built on Django' },
    ])
    expect(connect('django-orm', 'django', kb).routes[0].steps[0].text).toBe('Django ORM is built on Django')
  })

  it('words pairings in travel order and the directed relations the way they point', () => {
    const kb = makeKb(
      [
        tool('a', [pair('b'), { type: 'extends', target: 'd' }, { type: 'replaces', target: 'e' }]),
        tool('b'),
        tool('d'),
        tool('e'),
      ],
      [],
    )
    expect(connect('b', 'a', kb).routes[0].steps[0].text).toBe('B pairs with A')
    expect(connect('d', 'a', kb).routes[0].steps[0].text).toBe('A extends D')
    expect(connect('a', 'e', kb).routes[0].steps[0].text).toBe('A replaces E')
  })

  it('a direct alternative is reported on its own, with the routes through shared partners', () => {
    const kb = makeKb([tool('a', [alt('b'), pair('m')]), tool('b', [pair('m')]), tool('m', [], { layer: 'orm' })], [])
    const c = connect('a', 'b', kb)
    expect(c.alternatives).toBe(true)
    expect(c.throughAlternatives).toBe(false)
    expect(paths(c)).toEqual(['a > m > b'])
    expect(c.routes.flatMap((r) => r.steps).every((s) => s.type !== 'alternative-to')).toBe(true)
    expect(c.shared).toEqual(['m'])
  })

  it('a direct alternative with no other route has no routes', () => {
    const kb = makeKb([tool('a', [alt('b')]), tool('b')], [])
    expect(connect('a', 'b', kb)).toEqual({ ...none, alternatives: true })
  })

  it('goes through alternatives only when nothing else connects', () => {
    const kb = makeKb(
      [tool('a', [alt('x')], { name: 'A' }), tool('x', [pair('b')], { name: 'X' }), tool('b', [], { name: 'B' })],
      [],
    )
    const c = connect('a', 'b', kb)
    expect(c.alternatives).toBe(false)
    expect(c.throughAlternatives).toBe(true)
    expect(c.routes[0].steps.map((s) => s.text)).toEqual(['A is an alternative to X', 'X pairs with B'])
  })

  it('prefers a longer close route to a shorter one through an alternative', () => {
    // a - x (alternative) - b, and a - p - q - b
    const kb = makeKb(
      [tool('a', [alt('x'), pair('p')]), tool('x', [pair('b')]), tool('p', [pair('q')]), tool('q', [pair('b')]), tool('b')],
      [],
    )
    const c = connect('a', 'b', kb)
    expect(c.throughAlternatives).toBe(false)
    expect(paths(c)).toEqual(['a > p > q > b'])
  })

  it('keeps routes to three steps: beyond that there is no close route', () => {
    const chain = ['a', 'b', 'c', 'd', 'e']
    const kb = makeKb(
      chain.map((id, i) => tool(id, i < chain.length - 1 ? [pair(chain[i + 1])] : [])),
      [],
    )
    expect(connect('a', 'd', kb).routes).toHaveLength(1)
    expect(connect('a', 'e', kb)).toEqual(none)
  })

  it('ranks routes by the tools in between: data layers first, hosting last, then better connected, then id', () => {
    const others = ['o1', 'o2', 'o3', 'o4'].map((id) => tool(id))
    const middle = ['host', 'orm1', 'orm2', 'orm3', 'back']
    const kb = makeKb(
      [
        tool('a', middle.map(pair)),
        tool('b', middle.map(pair)),
        tool('host', [], { layer: 'hosting' }),
        tool('orm1', [], { layer: 'orm' }),
        // orm2 has more partners than orm1 and orm3
        tool('orm2', others.map((o) => pair(o.id)), { layer: 'orm' }),
        tool('orm3', [], { layer: 'orm' }),
        tool('back'),
        ...others,
      ],
      [],
    )
    expect(middles(connect('a', 'b', kb))).toEqual(['orm2', 'orm1', 'orm3'])
    expect(middles(connect('a', 'b', kb, 5))).toEqual(['orm2', 'orm1', 'orm3', 'back', 'host'])
    expect(connect('a', 'b', kb).shared).toEqual(['orm2', 'orm1', 'orm3', 'back', 'host'])
  })

  it('takes the strongest relation when two tools share several', () => {
    const kb = makeKb([tool('a', [pair('b'), { type: 'built-on', target: 'b' }]), tool('b')], [])
    expect(connect('a', 'b', kb).routes[0].steps[0].type).toBe('built-on')
  })

  it('nothing for unconnected tools, the same tool, or unknown ids', () => {
    const kb = makeKb([tool('a', [pair('b')]), tool('b'), tool('c')], [])
    expect(connect('a', 'c', kb)).toEqual(none)
    expect(connect('a', 'a', kb)).toEqual(none)
    expect(connect('a', 'nope', kb)).toEqual(none)
  })

  describe('on the real catalog', () => {
    it('PostgreSQL to MongoDB goes through the common ORMs, not Eloquent or Fluent first', () => {
      expect(middles(connect('postgresql', 'mongodb', realKb))).toEqual(['prisma', 'typeorm', 'mikro-orm'])
    })

    it('Django to Rails goes through databases, not Heroku or Memcached', () => {
      const c = connect('django', 'rails', realKb)
      expect(middles(c)).toEqual(['postgresql', 'mysql', 'sqlite'])
      expect(c.shared.slice(0, 4)).toEqual(['postgresql', 'mysql', 'sqlite', 'redis'])
      expect(c.shared.indexOf('heroku')).toBeGreaterThan(c.shared.indexOf('redis'))
      expect(c.shared.indexOf('memcached')).toBeGreaterThan(c.shared.indexOf('redis'))
    })

    it('FastAPI to PostgreSQL only through SQLAlchemy (Django is an alternative, not a partner)', () => {
      const c = connect('fastapi', 'postgresql', realKb)
      expect(paths(c)).toEqual(['fastapi > sqlalchemy > postgresql'])
      expect(c.alternatives).toBe(false)
    })

    it('FastAPI and Flask are alternatives, with shared partners below', () => {
      const c = connect('fastapi', 'flask', realKb)
      expect(c.alternatives).toBe(true)
      expect(c.routes.length).toBeGreaterThan(0)
      expect(c.routes[0].nodes).toHaveLength(3)
      expect(c.shared).toContain('sqlalchemy')
      expect(c.shared).not.toContain('django')
    })
  })
})
