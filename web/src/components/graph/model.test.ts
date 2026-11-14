import { afterEach, describe, expect, it } from 'vitest'
import type { EdgeType, Layer, Tool } from '@/lib/kb'
import { makeTool } from '@/engine/fixture'
import {
  buildGraph,
  edgeStyle,
  FALLBACK_PALETTE,
  LabelPlacer,
  makeView,
  neighboursOf,
  nodeStyle,
  portraitFit,
  areaFit,
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
    expect(other.label).toBeNull()
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
    const v = makeView({ focus: 'postgresql', neighbours: neighboursOf(g, 'postgresql', new Set()) })
    const focused = node('postgresql', v)
    expect(focused).toMatchObject({ color: palette.accent, forceLabel: true })
    expect(node('mysql', v).color).toBe(palette.families.data)
  })
})

describe('focus neighbourhood', () => {
  const g = buildGraph(tools(), positions)
  const spot = (id: string, hiddenEdgeTypes?: EdgeType[]) =>
    makeView({
      focus: id,
      neighbours: neighboursOf(g, id, new Set(hiddenEdgeTypes ?? [])),
      hiddenEdgeTypes: hiddenEdgeTypes ? new Set(hiddenEdgeTypes) : undefined,
    })
  const node = (id: string, v: ReturnType<typeof makeView>) => nodeStyle(id, g.getNodeAttributes(id), v, palette)
  const edge = (source: string, target: string, v: ReturnType<typeof makeView>) =>
    edgeStyle(g.getEdgeAttributes(g.edges(source, target)[0]), v, palette)

  it('lists neighbours over shown edge types only', () => {
    expect([...neighboursOf(g, 'fastapi', new Set())].sort()).toEqual(['postgresql', 'react'])
    expect([...neighboursOf(g, 'fastapi', new Set(['pairs-with']))]).toEqual([])
    expect(neighboursOf(g, 'not-a-tool', new Set()).size).toBe(0)
  })

  it('keeps neighbours in their colour with labels on and dims the rest', () => {
    const v = spot('fastapi')
    expect(node('fastapi', v)).toMatchObject({ color: palette.accent, forceLabel: true })
    expect(node('react', v)).toMatchObject({ color: palette.families.client, forceLabel: true, labelColor: palette.text })
    const other = node('mysql', v)
    expect(other.color).toBe(withAlpha(palette.families.data, 0.25))
    expect(other.forceLabel).toBe(false)
    // dimmed tools keep their dot but lose their label
    expect(other.label).toBeNull()
  })

  it('draws the focused tool edges stronger and dims the others', () => {
    const v = spot('fastapi')
    const own = edge('fastapi', 'postgresql', v)
    const away = edge('postgresql', 'mysql', v)
    expect(own).toMatchObject({ color: palette.edgeStrong, zIndex: 2 })
    expect(own.size).toBeGreaterThanOrEqual(1.5)
    expect(away.color).toBe(withAlpha(palette.edge, 0.4))
    expect(away.zIndex).toBe(0)
  })

  it('leaves the map as it is when nothing is focused', () => {
    const v = makeView({})
    expect(node('mysql', v).color).toBe(palette.families.data)
    expect(edge('postgresql', 'mysql', v).color).toBe(palette.edge)
  })

  it('a hovered tool lights its neighbourhood without taking the accent', () => {
    const v = makeView({ spotlight: 'fastapi', neighbours: neighboursOf(g, 'fastapi', new Set()) })
    expect(node('fastapi', v).color).toBe(palette.families.server)
    expect(node('fastapi', v).forceLabel).toBe(true)
    expect(node('mysql', v).color).toBe(withAlpha(palette.families.data, 0.25))
  })

  it('draws pairings and alternatives thinner than structural edges at rest', () => {
    const v = makeView({})
    expect(edge('react', 'fastapi', v).size).toBeLessThan(1)
    expect(edge('postgresql', 'mysql', v).size).toBeLessThan(edge('react', 'fastapi', v).size ?? 0)
  })
})

describe('LabelPlacer', () => {
  const box = (x0: number, y0: number, x1: number, y1: number) => ({ x0, y0, x1, y1 })

  it('places a label in free space and refuses one that overlaps a placed label', () => {
    const placer = new LabelPlacer({ width: 400, height: 300 })
    expect(placer.place(box(10, 10, 80, 24))).toBe(true)
    expect(placer.place(box(60, 18, 120, 32))).toBe(false)
    expect(placer.place(box(90, 10, 150, 24))).toBe(true)
  })

  it('can limit the dots a label avoids to the lit ones', () => {
    const placer = new LabelPlacer({ width: 400, height: 300 })
    placer.reset([
      { id: 'dim', box: box(50, 10, 60, 20) },
      { id: 'lit', box: box(150, 10, 160, 20) },
    ])
    const lit = new Set(['lit'])
    expect(placer.place(box(40, 8, 100, 22), 'own', lit)).toBe(true)
    expect(placer.place(box(140, 8, 200, 22), 'own', lit)).toBe(false)
  })

  it('refuses a label over another dot but not over its own', () => {
    const placer = new LabelPlacer({ width: 400, height: 300 })
    placer.reset([
      { id: 'a', box: box(0, 0, 8, 8) },
      { id: 'b', box: box(30, 0, 38, 8) },
    ])
    expect(placer.place(box(4, 0, 28, 8), 'a')).toBe(true)
    expect(placer.place(box(4, 20, 50, 28), 'a')).toBe(true)
    expect(placer.place(box(10, 2, 40, 8), 'a')).toBe(false)
  })

  it('refuses a label that would be cut off at the edge of the map', () => {
    const placer = new LabelPlacer({ width: 400, height: 300 })
    expect(placer.place(box(360, 10, 420, 24))).toBe(false)
    expect(placer.place(box(-5, 10, 40, 24))).toBe(false)
  })

  it('reserved labels always win and clear on reset', () => {
    const placer = new LabelPlacer({ width: 400, height: 300 })
    placer.reserve(box(10, 10, 80, 24))
    expect(placer.place(box(20, 12, 60, 20))).toBe(false)
    placer.reset([])
    expect(placer.place(box(20, 12, 60, 20))).toBe(true)
  })
})

describe('portraitFit', () => {
  const phone = { width: 390, height: 844 }
  const free = { top: 124, bottom: 64 }
  // The map as sigma first draws it on a 390x844 screen: 310 wide, 270 tall, centred.
  const drawn = { x0: 40, y0: 287, x1: 350, y1: 557 }

  it('does nothing on landscape or square screens', () => {
    expect(portraitFit(drawn, { width: 1440, height: 900 }, free)).toBeNull()
    expect(portraitFit(drawn, { width: 900, height: 900 }, free)).toBeNull()
  })

  it('zooms so the whole map spans the width less a small margin', () => {
    const fit = portraitFit(drawn, phone, free)!
    const width = (drawn.x1 - drawn.x0) / fit.ratio
    const height = (drawn.y1 - drawn.y0) / fit.ratio
    expect(width).toBeCloseTo(390 - 2 * 12, 5)
    expect(height).toBeLessThanOrEqual(844 - 124 - 64 - 2 * 12)
  })

  it('centres the map in the free area between the bar and the corner links', () => {
    const fit = portraitFit(drawn, phone, free)!
    expect(fit.from).toEqual({ x: 195, y: 422 })
    expect(fit.to).toEqual({ x: 195, y: 124 + (844 - 124 - 64) / 2 })
  })

  it('a tall map is limited by the free height instead', () => {
    const tall = { x0: 145, y0: 222, x1: 245, y1: 622 }
    const fit = portraitFit(tall, phone, free)!
    expect((tall.y1 - tall.y0) / fit.ratio).toBeCloseTo(844 - 124 - 64 - 2 * 12, 5)
    expect((tall.x1 - tall.x0) / fit.ratio).toBeLessThanOrEqual(390 - 24)
  })
})

describe('areaFit', () => {
  const screen = { width: 1440, height: 900 }
  const free = { top: 68, right: 0, bottom: 60, left: 464 }

  it('fits the picks into the area the sheet and bars leave free, with room for labels', () => {
    const picks = { x0: 200, y0: 100, x1: 1200, y1: 800 }
    const fit = areaFit(picks, screen, free)
    const freeWidth = 1440 - 464 - 2 * 48
    const freeHeight = 900 - 68 - 60 - 2 * 48
    expect((picks.x1 - picks.x0) / fit.ratio).toBeLessThanOrEqual(freeWidth + 1e-6)
    expect((picks.y1 - picks.y0) / fit.ratio).toBeLessThanOrEqual(freeHeight + 1e-6)
    expect(fit.from).toEqual({ x: 700, y: 450 })
    expect(fit.to).toEqual({ x: 464 + (1440 - 464) / 2, y: 68 + (900 - 68 - 60) / 2 })
  })

  it('never zooms in closer than the limit for a tight cluster', () => {
    const fit = areaFit({ x0: 700, y0: 400, x1: 710, y1: 410 }, screen, free)
    expect(fit.ratio).toBe(0.5)
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
