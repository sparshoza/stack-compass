import { afterEach, describe, expect, it } from 'vitest'
import type { EdgeType, Layer, Tool } from '@/lib/kb'
import { makeTool } from '@/engine/fixture'
import {
  lightingEdgeStyle,
  lightingStyle,
  routeEdgeKey,
  selectingStyle,
  buildGraph,
  edgeStyle,
  FALLBACK_PALETTE,
  LabelPlacer,
  placeLabels,
  makeView,
  neighboursOf,
  nodeStyle,
  portraitFit,
  areaFit,
  readPalette,
  mix,
  labelBoxes,
  labelOrigin,
  drawName,
  mapStretch,
  STAGE_PADDING,
  type Box,
  type LabelCandidate,
  type Palette,
} from './model'
import layout from '@catalog/layout.json'
import { kb } from '@/lib/kb'

const palette: Palette = {
  ...FALLBACK_PALETTE,
  accent: '#c8f05a',
  families: { client: '#6aa9f5', server: '#e6b450', data: '#45c7a8', services: '#f08a70', ops: '#e286c0' },
}

const DIM_NODE_MIX = 0.75
const DIM_EDGE_MIX = 0.6

/** Channel distance between two #rrggbb colours (largest of r, g, b). */
function distance(a: string, b: string): number {
  const rgb = (c: string) => [1, 3, 5].map((i) => parseInt(c.slice(i, i + 2), 16))
  const [x, y] = [rgb(a), rgb(b)]
  return Math.max(...x.map((v, i) => Math.abs(v - y[i])))
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

  it('keeps every dot small and near-uniform at rest (about 5px across)', () => {
    const g = buildGraph(kb.tools, layout)
    const sizes = g.mapNodes((_, attrs) => attrs.size)
    expect(Math.min(...sizes)).toBeGreaterThanOrEqual(2)
    expect(Math.max(...sizes)).toBeLessThanOrEqual(3.5)
    expect(Math.max(...sizes) / Math.min(...sizes)).toBeLessThanOrEqual(1.4)
  })

  it('stretches the map to the screen shape', () => {
    const g = buildGraph(tools(), positions, { x: 1.5, y: 2 })
    expect(g.getNodeAttributes('react')).toMatchObject({ x: 1.5, y: 4 })
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
    expect(other.color).toBe(mix(palette.families.data, palette.background, DIM_NODE_MIX))
    expect(other.forceLabel).toBeFalsy()
    expect(other.label).toBeNull()
  })

  it('draws edges between two highlighted tools thicker in the accent and dims the rest', () => {
    const v = view({ highlight: ['react', 'fastapi'] })
    const between = edge('react', 'fastapi', v)
    const outside = edge('fastapi', 'postgresql', v)
    expect(between.color).toBe(palette.accent)
    expect(between.size).toBeGreaterThan(outside.size ?? 0)
    expect(outside.color).toBe(mix(palette.edge, palette.background, DIM_EDGE_MIX))
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
    expect(other.color).toBe(mix(palette.families.data, palette.background, DIM_NODE_MIX))
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
    expect(away.color).toBe(mix(palette.edge, palette.background, DIM_EDGE_MIX))
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
    expect(node('mysql', v).color).toBe(mix(palette.families.data, palette.background, DIM_NODE_MIX))
  })

  it('draws every edge at least 0.6px wide so it renders as a whole line', () => {
    const v = makeView({})
    for (const key of g.edges()) expect(edgeStyle(g.getEdgeAttributes(key), v, palette).size).toBeGreaterThanOrEqual(0.6)
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

  it('keeps labels out from under the top bar', () => {
    const placer = new LabelPlacer({ width: 400, height: 300, top: 68 })
    expect(placer.place(box(10, 60, 80, 72))).toBe(false)
    expect(placer.place(box(10, 70, 80, 82))).toBe(true)
  })

  it('reserved labels always win and clear on reset', () => {
    const placer = new LabelPlacer({ width: 400, height: 300 })
    placer.reserve(box(10, 10, 80, 24))
    expect(placer.place(box(20, 12, 60, 20))).toBe(false)
    placer.reset([])
    expect(placer.place(box(20, 12, 60, 20))).toBe(true)
  })
})

describe('labelOrigin and labelBoxes', () => {
  it('centres the name under the dot', () => {
    const at = labelOrigin(100, 50, 3, 40, 10, 'below')
    expect(at.x).toBe(80)
    expect(at.y).toBeGreaterThan(50 + 3 + 10 * 0.6)
    const { below } = labelBoxes(100, 50, 3, 40, 10)
    expect((below.x0 + below.x1) / 2).toBe(100)
    expect(below.y0).toBeGreaterThanOrEqual(50 + 3)
    expect(below.y1 - below.y0).toBeLessThanOrEqual(14)
  })

  it('puts the name right of the dot, vertically centred, as a last resort', () => {
    const at = labelOrigin(100, 50, 3, 40, 10, 'right')
    expect(at.x).toBeGreaterThan(100 + 3)
    expect(at.y).toBeGreaterThan(50)
    expect(at.y).toBeLessThan(50 + 10 * 0.6)
    const { right } = labelBoxes(100, 50, 3, 40, 10)
    expect(right.x0).toBeGreaterThanOrEqual(100 + 3)
    expect(right.y0).toBeLessThan(50)
    expect(right.y1).toBeGreaterThan(50)
  })

  it('puts the name centred over the dot when it goes above', () => {
    const at = labelOrigin(100, 50, 3, 40, 10, 'above')
    expect(at.x).toBe(80)
    expect(at.y).toBeLessThan(50 - 3)
    const { above } = labelBoxes(100, 50, 3, 40, 10)
    expect((above.x0 + above.x1) / 2).toBe(100)
    expect(above.y1).toBeLessThanOrEqual(50 - 3)
  })
})

describe('placeLabels', () => {
  const box = (x0: number, y0: number, x1: number, y1: number) => ({ x0, y0, x1, y1 })
  const at = (x: number, y = 100) => labelBoxes(x, y, 3, 60, 10)
  const dot = (id: string, x: number, y = 100) => ({ id, box: box(x - 3, y - 3, x + 3, y + 3) })

  it('names a tool under its dot when there is room', () => {
    const placer = new LabelPlacer({ width: 400, height: 300 })
    placer.reset([dot('a', 200)])
    const sides = placeLabels(placer, [{ id: 'a', rank: 2, size: 3, ...at(200) }])
    expect(sides.get('a')).toBe('below')
  })

  it('moves a name above its dot when the space below is taken, and drops it only when both are', () => {
    const placer = new LabelPlacer({ width: 400, height: 300 })
    // b sits just under a, so the name of a cannot go below. The name of b
    // fills the space over d, and the dot of e fills the space under it.
    placer.reset([dot('a', 200, 100), dot('b', 200, 116), dot('d', 200, 134), dot('e', 200, 150)])
    const sides = placeLabels(placer, [
      { id: 'b', rank: 2, size: 4, ...at(200, 116) },
      { id: 'a', rank: 2, size: 3, ...at(200, 100) },
      { id: 'd', rank: 2, size: 3, ...at(200, 134) },
    ])
    expect(sides.get('b')).toBe('below')
    expect(sides.get('a')).toBe('above')
    expect(sides.has('d')).toBe(false)
  })

  it('names every neighbour of a focused tool even between dimmed dots', () => {
    const placer = new LabelPlacer({ width: 400, height: 300 })
    // The neighbour at x=200 has dimmed dots just under and over it.
    placer.reset([dot('focus', 40), dot('near', 200), dot('dim-below', 200, 108), dot('dim-above', 200, 88)])
    const sides = placeLabels(placer, [
      { id: 'focus', rank: 0, size: 6, ...at(40) },
      { id: 'near', rank: 1, size: 4, ...at(200) },
      { id: 'dim-below', rank: 2, size: 4, ...at(200, 108) },
    ])
    expect(sides.get('focus')).toBe('below')
    expect(sides.get('near')).toBe('below')
    expect(sides.has('dim-below')).toBe(false)
  })

  it('a pick whose name fits neither under nor over its dot goes right of it', () => {
    const placer = new LabelPlacer({ width: 400, height: 300 })
    // Two other picks sit just under and just over this one.
    placer.reset([dot('p', 200), dot('under', 200, 114), dot('over', 200, 86)])
    const sides = placeLabels(placer, [
      { id: 'under', rank: 0, size: 5, ...at(200, 114) },
      { id: 'over', rank: 0, size: 5, ...at(200, 86) },
      { id: 'p', rank: 0, size: 5, ...at(200) },
    ])
    expect(sides.get('p')).toBe('right')
  })

  it('in browse mode labels still avoid every dot', () => {
    const placer = new LabelPlacer({ width: 400, height: 300 })
    placer.reset([dot('a', 200), dot('b', 200, 112), dot('c', 200, 88)])
    const sides = placeLabels(placer, [{ id: 'a', rank: 2, size: 4, ...at(200) }])
    expect(sides.has('a')).toBe(false)
  })
})

/**
 * Where sigma draws every tool at rest, in pixels, at its starting camera:
 * the layout normalised by its larger side, fitted to the shorter screen side
 * less the stage padding (sigma's correction ratio included), then on a
 * portrait screen moved by portraitFit as StackGraph does.
 */
function atRest(viewport: { width: number; height: number }, free = { top: 124, bottom: 64 }) {
  const graph = buildGraph(kb.tools, layout, mapStretch(viewport))
  const nodes = graph.mapNodes((id, attrs) => ({ id, ...attrs }))
  const xs = nodes.map((n) => n.x)
  const ys = nodes.map((n) => n.y)
  const [minX, maxX, minY, maxY] = [Math.min(...xs), Math.max(...xs), Math.min(...ys), Math.max(...ys)]
  const extent = Math.max(maxX - minX, maxY - minY)
  const graphRatio = (maxY - minY) / (maxX - minX)
  const screenRatio = viewport.height / viewport.width
  const correction =
    (screenRatio < 1 && graphRatio > 1) || (screenRatio > 1 && graphRatio < 1)
      ? 1
      : Math.min(Math.max(graphRatio, 1 / graphRatio), Math.max(1 / screenRatio, screenRatio))
  let scale = ((Math.min(viewport.width, viewport.height) - 2 * STAGE_PADDING) * correction) / extent
  let centre = { x: viewport.width / 2, y: viewport.height / 2 }
  const drawn: Box = {
    x0: centre.x - ((maxX - minX) / 2) * scale,
    x1: centre.x + ((maxX - minX) / 2) * scale,
    y0: centre.y - ((maxY - minY) / 2) * scale,
    y1: centre.y + ((maxY - minY) / 2) * scale,
  }
  const fit = portraitFit(drawn, viewport, free)
  if (fit) {
    scale /= fit.ratio
    centre = fit.to
  }
  return nodes.map((n) => ({
    id: n.id,
    label: n.label,
    size: n.size,
    x: centre.x + (n.x - (minX + maxX) / 2) * scale,
    // Graph y points up, screen y points down.
    y: centre.y - (n.y - (minY + maxY) / 2) * scale,
  }))
}

/** How many names the label pass draws at rest below a top bar `top` pixels tall; names are 10px JetBrains Mono, 0.6em per character. */
function labelsAtRest(viewport: { width: number; height: number }, top: number): number {
  const nodes = atRest(viewport)
  const placer = new LabelPlacer({ ...viewport, top })
  placer.reset(
    nodes.map((n) => ({ id: n.id, box: { x0: n.x - n.size, y0: n.y - n.size, x1: n.x + n.size, y1: n.y + n.size } })),
  )
  const candidates: LabelCandidate[] = nodes.map((n) => ({
    id: n.id,
    rank: 2,
    size: n.size,
    ...labelBoxes(n.x, n.y, n.size, n.label.length * 6, 10),
  }))
  return placeLabels(placer, candidates).size
}

describe('drawName', () => {
  function recorder() {
    const calls: string[] = []
    const context = {
      lineWidth: 0,
      lineJoin: '',
      strokeStyle: '',
      fillStyle: '#111',
      strokeText: (text: string) => calls.push(`stroke ${text} ${context.strokeStyle} ${context.lineWidth}`),
      fillText: (text: string) => calls.push(`fill ${text} ${context.fillStyle}`),
    }
    return { calls, context: context as unknown as CanvasRenderingContext2D }
  }

  it('draws a solid halo in the map colour behind a lit name, then the name', () => {
    const { calls, context } = recorder()
    drawName(context, 'Clerk', { x: 10, y: 20 }, '#0d0f12')
    expect(calls).toEqual(['stroke Clerk #0d0f12 4', 'fill Clerk #111'])
  })

  it('draws a resting name with no halo', () => {
    const { calls, context } = recorder()
    drawName(context, 'Clerk', { x: 10, y: 20 }, null)
    expect(calls).toEqual(['fill Clerk #111'])
  })
})

describe('labels at rest', () => {
  it('names nearly every tool on a 1440x900 screen', () => {
    expect(labelsAtRest({ width: 1440, height: 900 }, 68) / kb.tools.length).toBeGreaterThanOrEqual(0.9)
  })

  it('names a good share of tools on a 390x844 phone', () => {
    expect(labelsAtRest({ width: 390, height: 844 }, 124)).toBeGreaterThanOrEqual(60)
  })
})

describe('mapStretch', () => {
  it('widens the map a little on a landscape screen', () => {
    const s = mapStretch({ width: 1440, height: 900 })
    expect(s.y).toBe(1)
    expect(s.x).toBeGreaterThan(1)
    expect(s.x).toBeLessThanOrEqual(1.2)
  })

  it('makes the map taller on a portrait phone', () => {
    const s = mapStretch({ width: 390, height: 844 })
    expect(s.x).toBe(1)
    expect(s.y).toBeGreaterThan(1.3)
    expect(s.y).toBeLessThanOrEqual(1.7)
  })

  it('leaves a square screen alone', () => {
    expect(mapStretch({ width: 800, height: 800 })).toEqual({ x: 1, y: 1 })
    expect(mapStretch({ width: 0, height: 0 })).toEqual({ x: 1, y: 1 })
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

  it('when the panels leave too little room on an axis, fits across the whole screen on it instead', () => {
    const picks = { x0: 200, y0: 100, x1: 1200, y1: 800 }
    const squeezed = areaFit(picks, screen, { top: 68, right: 900, bottom: 60, left: 600 })
    expect(Number.isFinite(squeezed.ratio)).toBe(true)
    expect(squeezed.ratio).toBeLessThan(3)
    expect(squeezed.to.x).toBe(720)
    expect(squeezed.to.y).toBe(68 + (900 - 68 - 60) / 2)
    const tall = areaFit(picks, screen, { top: 500, right: 0, bottom: 500, left: 0 })
    expect(tall.to.y).toBe(450)
  })
})

describe('mix', () => {
  it('blends two hex colours into an opaque hex colour', () => {
    expect(mix('#ffffff', '#000000', 0.5)).toBe('#808080')
    expect(mix('#ff0000', '#0000ff', 0)).toBe('#ff0000')
    expect(mix('#0f0', '#000', 1)).toBe('#000000')
  })

  it('returns the first colour when it cannot parse one', () => {
    expect(mix('tomato', '#000000', 0.5)).toBe('tomato')
  })
})

describe('dimming', () => {
  // sigma blends premultiplied, so an rgba colour with low alpha draws bright
  // on a dark map. Dimmed colours are opaque mixes toward the background.
  const light: Palette = {
    families: { client: '#1d64c4', server: '#8a6100', data: '#0a7a63', services: '#bd4527', ops: '#a8357a' },
    accent: '#437000',
    text: '#111418',
    textMuted: '#4f5661',
    textFaint: '#646b76',
    edge: '#cfd4da',
    edgeStrong: '#8a919b',
    background: '#f6f7f9',
  }
  for (const [theme, p] of [
    ['dark', palette],
    ['light', light],
  ] as const) {
    it(`dimmed dots, labels and edges are opaque and close to the ${theme} background`, () => {
      const background = p.background
      const g = buildGraph(tools(), positions)
      const v = makeView({ highlight: ['react'] })
      const dimmed = nodeStyle('mysql', g.getNodeAttributes('mysql'), v, p)
      const key = g.edges().find((e) => !g.extremities(e).includes('react'))!
      const edgeColour = edgeStyle(g.getEdgeAttributes(key), v, p).color!
      for (const colour of [dimmed.color!, dimmed.labelColor, edgeColour]) {
        expect(colour).toMatch(/^#[0-9a-f]{6}$/)
        expect(distance(colour, background)).toBeLessThan(80)
      }
      expect(distance(dimmed.color!, background)).toBeLessThan(distance(p.families.data, background) / 2)
    })
  }
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

describe('lightingStyle', () => {
  const attrs = { x: 0, y: 0, label: 'Postgres', size: 3, layer: 'database' as Layer, family: 'data' as const }
  const view = makeView({ highlight: ['other'] })

  it('starts as the dimmed dot with no name', () => {
    const dimmed = nodeStyle('pg', attrs, view, FALLBACK_PALETTE)
    const start = lightingStyle(attrs, FALLBACK_PALETTE, 0)
    expect(start).toMatchObject({ color: dimmed.color, size: dimmed.size, label: null, forceLabel: false })
  })

  it('ends as the lit pick and grows on the way', () => {
    const lit = nodeStyle('pg', attrs, makeView({ highlight: ['pg'] }), FALLBACK_PALETTE)
    const end = lightingStyle(attrs, FALLBACK_PALETTE, 1)
    expect(end.color!.toLowerCase()).toBe(lit.color!.toLowerCase())
    expect(end.size).toBe(lit.size)
    const half = lightingStyle(attrs, FALLBACK_PALETTE, 0.5)
    expect(half.size).toBeGreaterThan(attrs.size)
    expect(half.size).toBeLessThan(end.size!)
    expect(half.forceLabel).toBe(true)
  })

  it('an edge between two picks goes from dimmed to the accent', () => {
    const edge = { kind: 'pairs-with' as EdgeType, source: 'a', target: 'b', sourceLayer: 'database' as Layer, targetLayer: 'orm' as Layer }
    expect(lightingEdgeStyle(edge, FALLBACK_PALETTE, 0).color).toBe(mix(FALLBACK_PALETTE.edge, FALLBACK_PALETTE.background, 0.6))
    expect(lightingEdgeStyle(edge, FALLBACK_PALETTE, 1).color!.toLowerCase()).toBe(FALLBACK_PALETTE.accent)
  })
})

describe('route', () => {
  const g = buildGraph(tools(), positions)
  // react - fastapi - postgresql
  const routeView = (extra: Parameters<typeof makeView>[0] = {}) =>
    makeView({
      focus: 'react',
      neighbours: neighboursOf(g, 'react', new Set()),
      route: {
        nodes: ['react', 'fastapi', 'postgresql'],
        edges: [routeEdgeKey('react', 'fastapi', 'pairs-with'), routeEdgeKey('postgresql', 'fastapi', 'pairs-with')],
      },
      ...extra,
    })
  const node = (id: string, v: ReturnType<typeof makeView>) => nodeStyle(id, g.getNodeAttributes(id), v, palette)
  const edge = (source: string, target: string, v: ReturnType<typeof makeView>) =>
    edgeStyle(g.getEdgeAttributes(g.edges(source, target)[0]), v, palette)

  it('lights every tool on the route in the accent with its name and dims the rest', () => {
    const v = routeView()
    for (const id of ['react', 'fastapi', 'postgresql']) {
      expect(node(id, v), id).toMatchObject({ color: palette.accent, forceLabel: true, zIndex: 2 })
    }
    expect(node('mysql', v).color).toBe(mix(palette.families.data, palette.background, DIM_NODE_MIX))
    expect(node('mysql', v).label).toBeNull()
  })

  it('draws the route edges in the accent and dims the others', () => {
    const v = routeView()
    expect(edge('react', 'fastapi', v)).toMatchObject({ color: palette.accent, zIndex: 2 })
    expect(edge('fastapi', 'postgresql', v).color).toBe(palette.accent)
    expect(edge('postgresql', 'mysql', v).color).toBe(mix(palette.edge, palette.background, DIM_EDGE_MIX))
  })

  it('draws the whole route even through filtered layers and relation types', () => {
    const v = routeView({ hiddenLayers: new Set(['backend']), hiddenEdgeTypes: new Set(['pairs-with']) })
    expect(node('fastapi', v).hidden).toBe(false)
    expect(edge('react', 'fastapi', v).hidden).toBe(false)
    expect(edge('postgresql', 'mysql', routeView({ hiddenEdgeTypes: new Set(['alternative-to']) })).hidden).toBe(true)
  })

  it('wins over a highlighted stack', () => {
    const v = routeView({ highlight: ['mysql'] })
    expect(node('mysql', v).color).toBe(mix(palette.families.data, palette.background, DIM_NODE_MIX))
    expect(node('fastapi', v).color).toBe(palette.accent)
  })

  it('keys an edge the same way round whichever end comes first', () => {
    expect(routeEdgeKey('b', 'a', 'extends')).toBe(routeEdgeKey('a', 'b', 'extends'))
    expect(routeEdgeKey('a', 'b', 'extends')).not.toBe(routeEdgeKey('a', 'b', 'built-on'))
  })
})

describe('selectingStyle', () => {
  const g = buildGraph(tools(), positions)
  const v = makeView({ focus: 'fastapi', neighbours: neighboursOf(g, 'fastapi', new Set()) })
  const at = (id: string, p: number) => {
    const attrs = g.getNodeAttributes(id)
    const style = nodeStyle(id, attrs, v, palette)
    return { ...style, ...selectingStyle(id, attrs, style, v, palette, p) }
  }

  it('the focused dot grows from its resting size to its lit size', () => {
    const rest = g.getNodeAttribute('fastapi', 'size')
    const lit = nodeStyle('fastapi', g.getNodeAttributes('fastapi'), v, palette).size!
    expect(at('fastapi', 0).size).toBe(rest)
    expect(at('fastapi', 0.5).size).toBeGreaterThan(rest)
    expect(at('fastapi', 0.5).size).toBeLessThan(lit)
    expect(at('fastapi', 1).size).toBe(lit)
    expect(at('fastapi', 0).color).toBe(palette.accent)
  })

  it("neighbours' names fade in from the map colour", () => {
    expect(at('react', 0).labelColor).toBe(mix(palette.background, palette.text, 0))
    expect(at('react', 1).labelColor).toBe(mix(palette.background, palette.text, 1))
    expect(at('react', 0.5).labelColor).toBe(mix(palette.background, palette.text, 0.5))
  })

  it('leaves every other tool as it is', () => {
    expect(selectingStyle('mysql', g.getNodeAttributes('mysql'), nodeStyle('mysql', g.getNodeAttributes('mysql'), v, palette), v, palette, 0.3)).toEqual({})
  })
})
