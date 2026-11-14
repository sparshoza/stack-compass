import { afterEach, describe, expect, it } from 'vitest'
import type { EdgeType, Layer, Tool } from '@/lib/kb'
import { makeTool } from '@/engine/fixture'
import {
  buildGraph,
  edgeStyle,
  FALLBACK_PALETTE,
  makeView,
  nodeStyle,
  readPalette,
  withAlpha,
  type Palette,
} from './model'

const palette: Palette = {
  ...FALLBACK_PALETTE,
  accent: '#c8f05a',
  families: { client: '#6aa9f5', server: '#e6b450', data: '#45c7a8', services: '#f08a70', ops: '#e286c0' },
}

function tools(): Tool[] {
  return [
    makeTool('react', 'frontend', { name: 'React', edges: [{ type: 'pairs-with', target: 'fastapi' }] }),
    makeTool('fastapi', 'backend', {
      name: 'FastAPI',
      edges: [
        { type: 'pairs-with', target: 'react' },
        { type: 'pairs-with', target: 'postgresql' },
        { type: 'alternative-to', target: 'removed-tool' },
      ],
    }),
    makeTool('postgresql', 'database', {
      name: 'PostgreSQL',
      edges: [{ type: 'alternative-to', target: 'mysql' }],
    }),
    makeTool('mysql', 'database', { name: 'MySQL' }),
  ]
}

const positions = {
  react: { x: 1, y: 2 },
  fastapi: { x: 3, y: 4 },
  postgresql: { x: 5, y: 6 },
  mysql: { x: 7, y: 8 },
}

function view(opts: { highlight?: string[]; focus?: string; hiddenLayers?: Layer[]; hiddenEdgeTypes?: EdgeType[] } = {}) {
  return makeView({
    highlight: opts.highlight,
    focus: opts.focus,
    hiddenLayers: opts.hiddenLayers ? new Set(opts.hiddenLayers) : undefined,
    hiddenEdgeTypes: opts.hiddenEdgeTypes ? new Set(opts.hiddenEdgeTypes) : undefined,
  })
}

describe('buildGraph', () => {
  it('adds every tool with its position, label, layer and family', () => {
    const g = buildGraph(tools(), positions)
    expect(g.order).toBe(4)
    expect(g.getNodeAttributes('react')).toMatchObject({ x: 1, y: 2, label: 'React', layer: 'frontend', family: 'client' })
    expect(g.getNodeAttributes('postgresql')).toMatchObject({ layer: 'database', family: 'data' })
  })

  it('keeps one edge per pair and type, and skips edges to missing tools', () => {
    const g = buildGraph(tools(), positions)
    expect(g.size).toBe(3)
    const types = g.mapEdges((_, attrs) => attrs.kind).sort()
    expect(types).toEqual(['alternative-to', 'pairs-with', 'pairs-with'])
    // sigma treats an edge `type` as a render program name, so it must not be set
    g.forEachEdge((_, attrs) => expect(attrs).not.toHaveProperty('type'))
    g.forEachNode((_, attrs) => expect(attrs).not.toHaveProperty('type'))
  })

  it('sizes better-connected tools a little larger', () => {
    const g = buildGraph(tools(), positions)
    expect(g.getNodeAttribute('fastapi', 'size')).toBeGreaterThan(g.getNodeAttribute('mysql', 'size'))
  })

  it('places a tool without a position at the origin instead of failing', () => {
    const g = buildGraph(tools(), { react: { x: 1, y: 1 } })
    expect(g.getNodeAttributes('mysql')).toMatchObject({ x: 0, y: 0 })
  })
})

describe('nodeStyle and edgeStyle', () => {
  const g = buildGraph(tools(), positions)
  const node = (id: string, v = view()) => nodeStyle(id, g.getNodeAttributes(id), v, palette)
  const edge = (source: string, target: string, v = view()) => {
    const key = g.edges(source, target)[0]
    return edgeStyle(g.getEdgeAttributes(key), v, palette)
  }

  it('colours dots by layer family when nothing is highlighted', () => {
    expect(node('react')).toMatchObject({ color: palette.families.client, hidden: false })
    expect(node('postgresql')).toMatchObject({ color: palette.families.data })
    expect(edge('react', 'fastapi').color).toBe(palette.edge)
  })

  it('dims non-highlighted', () => {
    const v = view({ highlight: ['react', 'fastapi'] })
    const picked = node('react', v)
    const other = node('mysql', v)
    expect(picked.color).toBe(palette.accent)
    expect(picked.forceLabel).toBe(true)
    expect(picked.zIndex).toBeGreaterThan(other.zIndex ?? 0)
    expect(picked.size).toBeGreaterThan(g.getNodeAttribute('react', 'size'))
    expect(other.color).toBe(withAlpha(palette.families.data, 0.25))
    expect(other.forceLabel).toBeFalsy()
  })

  it('draws edges between two highlighted tools thicker in the accent and dims the rest', () => {
    const v = view({ highlight: ['react', 'fastapi'] })
    const between = edge('react', 'fastapi', v)
    const outside = edge('fastapi', 'postgresql', v)
    expect(between.color).toBe(palette.accent)
    expect(between.size).toBeGreaterThan(outside.size ?? 0)
    expect(outside.color).toBe(withAlpha(palette.edge, 0.4))
  })

  it('hides filtered layers and edge types', () => {
    const v = view({ hiddenLayers: ['database'], hiddenEdgeTypes: ['pairs-with'] })
    expect(node('postgresql', v).hidden).toBe(true)
    expect(node('react', v).hidden).toBe(false)
    expect(edge('react', 'fastapi', v).hidden).toBe(true)
    // an edge touching a hidden layer is hidden even when its type is shown
    const typeOnly = view({ hiddenLayers: ['database'] })
    expect(edge('postgresql', 'mysql', typeOnly).hidden).toBe(true)
    expect(edge('react', 'fastapi', typeOnly).hidden).toBe(false)
  })

  it('marks the focused tool in the accent with its label', () => {
    const focused = node('postgresql', view({ focus: 'postgresql' }))
    expect(focused).toMatchObject({ color: palette.accent, forceLabel: true })
    expect(node('mysql', view({ focus: 'postgresql' })).color).toBe(palette.families.data)
  })
})

describe('withAlpha', () => {
  it('turns hex colours into rgba', () => {
    expect(withAlpha('#ff0000', 0.5)).toBe('rgba(255, 0, 0, 0.5)')
    expect(withAlpha('#0f0', 0.25)).toBe('rgba(0, 255, 0, 0.25)')
    expect(withAlpha('rgb(1, 2, 3)', 0.4)).toBe('rgba(1, 2, 3, 0.4)')
  })

  it('leaves colours it cannot parse alone', () => {
    expect(withAlpha('tomato', 0.5)).toBe('tomato')
  })
})

describe('readPalette', () => {
  afterEach(() => {
    document.documentElement.removeAttribute('style')
  })

  it('reads the tokens from CSS variables', () => {
    const root = document.documentElement
    root.style.setProperty('--accent', '#437000')
    root.style.setProperty('--family-data', '#0a7a63')
    root.style.setProperty('--edge', '#d9dde2')
    const p = readPalette(root)
    expect(p.accent).toBe('#437000')
    expect(p.families.data).toBe('#0a7a63')
    expect(p.edge).toBe('#d9dde2')
  })

  it('falls back to the dark tokens when a variable is missing', () => {
    expect(readPalette(document.documentElement)).toEqual(FALLBACK_PALETTE)
  })
})
