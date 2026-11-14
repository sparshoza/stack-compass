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

  it('keeps each layer together: tools sit nearer their own layer than the map average', () => {
    const byLayer = new Map()
    for (const tool of inputs.catalog.tools) {
      if (!byLayer.has(tool.layer)) byLayer.set(tool.layer, [])
      byLayer.get(tool.layer).push(first[tool.id])
    }
    const centre = (points) => ({
      x: points.reduce((s, p) => s + p.x, 0) / points.length,
      y: points.reduce((s, p) => s + p.y, 0) / points.length,
    })
    const all = Object.values(first)
    const mapCentre = centre(all)
    const spread = (points, c) =>
      points.reduce((s, p) => s + Math.hypot(p.x - c.x, p.y - c.y), 0) / points.length
    const mapSpread = spread(all, mapCentre)
    for (const points of byLayer.values()) {
      expect(spread(points, centre(points))).toBeLessThan(mapSpread)
    }
  })

  it('the committed catalog/layout.json is fresh', () => {
    const committed = readFileSync(layoutPath, 'utf8').replace(/\r\n/g, '\n')
    expect(committed).toBe(serialize(first))
  })
})
