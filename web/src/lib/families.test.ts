import { describe, expect, it } from 'vitest'
import { FAMILIES, LAYER_FAMILY } from './families'
import { kb } from './kb'

describe('layer families', () => {
  it('has five families with unique ids', () => {
    expect(FAMILIES).toHaveLength(5)
    expect(new Set(FAMILIES.map((f) => f.id)).size).toBe(5)
  })

  it('assigns every layer exactly once', () => {
    const assigned = FAMILIES.flatMap((f) => f.layers)
    expect([...assigned].sort()).toEqual([...kb.layers].sort())
    expect(new Set(assigned).size).toBe(assigned.length)
  })

  it('maps each layer to the family that lists it', () => {
    for (const family of FAMILIES) {
      for (const layer of family.layers) expect(LAYER_FAMILY[layer]).toBe(family.id)
    }
    expect(Object.keys(LAYER_FAMILY).sort()).toEqual([...kb.layers].sort())
  })
})
