import { describe, expect, it } from 'vitest'
import { compareByName, kb, toolById, toolsByLayer } from './kb'

describe('knowledge base', () => {
  it('every edge target resolves', () => {
    const missing: string[] = []
    for (const tool of kb.tools) {
      for (const edge of tool.edges) {
        if (!toolById(edge.target)) missing.push(`${tool.id} -> ${edge.target}`)
      }
    }
    expect(missing).toEqual([])
  })

  it('toolById returns undefined for unknown id', () => {
    expect(toolById('no-such-tool-anywhere')).toBeUndefined()
    expect(toolById('')).toBeUndefined()
  })

  it('toolById finds every tool in the catalog', () => {
    for (const tool of kb.tools) expect(toolById(tool.id)).toBe(tool)
  })

  it('toolsByLayer returns sorted by name', () => {
    for (const layer of kb.layers) {
      const tools = toolsByLayer(layer)
      expect(tools.map((t) => t.id).sort()).toEqual(
        kb.tools.filter((t) => t.layer === layer).map((t) => t.id).sort(),
      )
      for (let i = 1; i < tools.length; i++) {
        expect(compareByName(tools[i - 1], tools[i])).toBeLessThanOrEqual(0)
      }
    }
  })

  it('toolsByLayer does not let callers reorder the catalog', () => {
    const layer = kb.layers.find((l) => toolsByLayer(l).length > 1) ?? kb.layers[0]
    const sorted = toolsByLayer(layer)
    const mutated = toolsByLayer(layer)
    mutated.reverse()
    expect(toolsByLayer(layer)).toEqual(sorted)
  })
})
