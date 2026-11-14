import { readFileSync } from 'node:fs'
import { beforeAll, describe, expect, it } from 'vitest'
import { computeLayout, layoutPath, readInputs, serialize } from './layout.mjs'

describe('graph layout', () => {
  let inputs
  let first

  beforeAll(() => {
    inputs = readInputs()
    first = computeLayout(inputs.catalog, inputs.families)
  })

  it('deterministic', () => {
    const second = computeLayout(inputs.catalog, inputs.families)
    expect(second).toEqual(first)
    expect(serialize(second)).toBe(serialize(first))
  })

  it('every tool has a position', () => {
    const ids = inputs.catalog.tools.map((tool) => tool.id).sort()
    expect(Object.keys(first)).toEqual(ids)
    for (const id of ids) {
      expect(Number.isFinite(first[id].x)).toBe(true)
      expect(Number.isFinite(first[id].y)).toBe(true)
    }
  })

  it('rounds to 2 decimals and sorts keys', () => {
    for (const { x, y } of Object.values(first)) {
      expect(Math.round(x * 100) / 100).toBe(x)
      expect(Math.round(y * 100) / 100).toBe(y)
    }
    const text = serialize(first)
    expect(text.endsWith('}\n')).toBe(true)
    expect(text).not.toContain('\r')
  })

  it('no two tools share a position', () => {
    const seen = new Set(Object.values(first).map(({ x, y }) => `${x},${y}`))
    expect(seen.size).toBe(Object.keys(first).length)
  })

  it('spreads dots: no two tools closer than 2.5% of the map width', () => {
    const points = Object.values(first)
    const xs = points.map((p) => p.x)
    const ys = points.map((p) => p.y)
    const extent = Math.max(Math.max(...xs) - Math.min(...xs), Math.max(...ys) - Math.min(...ys))
    let closest = Infinity
    for (let i = 0; i < points.length; i++)
      for (let j = i + 1; j < points.length; j++)
        closest = Math.min(closest, Math.hypot(points[i].x - points[j].x, points[i].y - points[j].y))
    expect(closest / extent).toBeGreaterThanOrEqual(0.025)
  })

  const centre = (points) => ({
    x: points.reduce((s, p) => s + p.x, 0) / points.length,
    y: points.reduce((s, p) => s + p.y, 0) / points.length,
  })
  /** Distance from the map centre at which `share` of the tools lie. */
  const radiusOf = (points, share) => {
    const c = centre(points)
    const r = points.map((p) => Math.hypot(p.x - c.x, p.y - c.y)).sort((a, b) => a - b)
    return r[Math.min(r.length - 1, Math.floor(share * r.length))]
  }

  it('mixes the families: no family sits in its own sector of the map', () => {
    const all = Object.values(first)
    const radius = radiusOf(all, 1)
    const byFamily = new Map()
    const familyOf = new Map()
    for (const family of inputs.families) for (const layer of family.layers) familyOf.set(layer, family.id)
    for (const tool of inputs.catalog.tools) {
      const id = familyOf.get(tool.layer)
      if (!byFamily.has(id)) byFamily.set(id, [])
      byFamily.get(id).push(first[tool.id])
    }
    const centres = [...byFamily.values()].map(centre)
    let sum = 0
    let pairs = 0
    for (let i = 0; i < centres.length; i++)
      for (let j = i + 1; j < centres.length; j++) {
        sum += Math.hypot(centres[i].x - centres[j].x, centres[i].y - centres[j].y)
        pairs++
      }
    expect(sum / pairs / radius).toBeLessThan(0.3)
  })

  it('fills one round disc: as wide as tall, with tools at every distance from the centre', () => {
    const all = Object.values(first)
    const xs = all.map((p) => p.x)
    const ys = all.map((p) => p.y)
    const width = Math.max(...xs) - Math.min(...xs)
    const height = Math.max(...ys) - Math.min(...ys)
    expect(width / height).toBeGreaterThan(0.85)
    expect(width / height).toBeLessThan(1.18)
    // Four rings of equal area each hold between 12% and 40% of the tools:
    // no empty core and no thin ring of leaves.
    const c = centre(all)
    const outer = radiusOf(all, 1)
    const rings = [0, 0, 0, 0]
    for (const p of all) {
      const r = Math.hypot(p.x - c.x, p.y - c.y) / outer
      rings[Math.min(3, Math.floor(r * r * 4))]++
    }
    for (const count of rings) {
      expect(count / all.length).toBeGreaterThan(0.12)
      expect(count / all.length).toBeLessThan(0.4)
    }
  })

  it('the committed catalog/layout.json is fresh', () => {
    const committed = readFileSync(layoutPath, 'utf8').replace(/\r\n/g, '\n')
    expect(committed).toBe(serialize(first))
  })
})
