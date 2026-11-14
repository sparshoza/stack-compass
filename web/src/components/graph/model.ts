import Graph from 'graphology'
import type { EdgeDisplayData, NodeDisplayData } from 'sigma/types'
import { LAYER_FAMILY, type FamilyId } from '@/lib/families'
import type { EdgeType, Layer, Tool } from '@/lib/kb'
import { EDGE_SIZE } from './edgeSizes'

export type Positions = Record<string, { x: number; y: number }>

export interface NodeAttrs {
  x: number
  y: number
  label: string
  size: number
  layer: Layer
  family: FamilyId
}

/**
 * The relation is stored as `kind`, not `type`: sigma reads an edge's `type`
 * as the name of its render program.
 */
export interface EdgeAttrs {
  kind: EdgeType
  source: string
  target: string
  sourceLayer: Layer
  targetLayer: Layer
}

export interface GraphView {
  highlight: ReadonlySet<string>
  focus: string | null
  /** The tool whose neighbourhood is lit: the hovered one, else the focused one. */
  spotlight: string | null
  /** Tools joined to the spotlight by a shown edge. */
  neighbours: ReadonlySet<string>
  hiddenLayers: ReadonlySet<Layer>
  hiddenEdgeTypes: ReadonlySet<EdgeType>
}

export interface Palette {
  families: Record<FamilyId, string>
  accent: string
  text: string
  textMuted: string
  textFaint: string
  edge: string
  edgeStrong: string
}

/** The dark tokens from styles/tokens.css, used when a variable cannot be read. */
export const FALLBACK_PALETTE: Palette = {
  families: { client: '#6aa9f5', server: '#e6b450', data: '#45c7a8', services: '#f08a70', ops: '#e286c0' },
  accent: '#c8f05a',
  text: '#e8eaed',
  textMuted: '#a4abb4',
  textFaint: '#8b929b',
  edge: '#2b3037',
  edgeStrong: '#59616c',
}

const DIM_NODE = 0.25
const DIM_LABEL = 0.35
const DIM_EDGE = 0.4
const SPOT_EDGE_SIZE = 1.5
const BASE_SIZE = 3
const empty = new Set<never>()

export function makeView(opts: {
  highlight?: readonly string[]
  focus?: string | null
  spotlight?: string | null
  neighbours?: ReadonlySet<string>
  hiddenLayers?: ReadonlySet<Layer>
  hiddenEdgeTypes?: ReadonlySet<EdgeType>
}): GraphView {
  return {
    highlight: new Set(opts.highlight ?? []),
    focus: opts.focus ?? null,
    spotlight: opts.spotlight ?? opts.focus ?? null,
    neighbours: opts.neighbours ?? empty,
    hiddenLayers: opts.hiddenLayers ?? empty,
    hiddenEdgeTypes: opts.hiddenEdgeTypes ?? empty,
  }
}

/**
 * One node per tool and one undirected edge per pair and edge type (the
 * catalog often lists a relation from both ends). Edges to tools that are not
 * in the list are skipped. Better-connected tools get slightly bigger dots.
 */
export function buildGraph(tools: readonly Tool[], positions: Positions): Graph<NodeAttrs, EdgeAttrs> {
  const graph = new Graph<NodeAttrs, EdgeAttrs>({ type: 'undirected', multi: true })
  for (const tool of tools) {
    const at = positions[tool.id] ?? { x: 0, y: 0 }
    graph.addNode(tool.id, {
      x: at.x,
      y: at.y,
      label: tool.name,
      size: BASE_SIZE,
      layer: tool.layer,
      family: LAYER_FAMILY[tool.layer],
    })
  }
  for (const tool of tools) {
    for (const edge of tool.edges) {
      if (!graph.hasNode(edge.target) || edge.target === tool.id) continue
      const [a, b] = tool.id < edge.target ? [tool.id, edge.target] : [edge.target, tool.id]
      const key = `${edge.type}:${a}|${b}`
      if (graph.hasEdge(key)) continue
      graph.addEdgeWithKey(key, a, b, {
        kind: edge.type,
        source: a,
        target: b,
        sourceLayer: graph.getNodeAttribute(a, 'layer'),
        targetLayer: graph.getNodeAttribute(b, 'layer'),
      })
    }
  }
  graph.forEachNode((id) => {
    graph.setNodeAttribute(id, 'size', BASE_SIZE + Math.min(3, Math.sqrt(graph.degree(id)) * 0.6))
  })
  return graph
}

type NodeStyle = Partial<NodeDisplayData> & { labelColor: string }

/** Display attributes for one node under the current view. Pure, so it is tested directly. */
export function nodeStyle(id: string, attrs: NodeAttrs, view: GraphView, palette: Palette): NodeStyle {
  const hidden = view.hiddenLayers.has(attrs.layer)
  const picked = view.highlight.has(id)
  const focused = view.focus === id
  // A spotlight (focus or hover) only applies while no stack is highlighted.
  const spot = view.highlight.size === 0 ? view.spotlight : null
  const lit = spot !== null && (id === spot || view.neighbours.has(id))
  const dimmed = view.highlight.size > 0 ? !picked && !focused : spot !== null && !lit
  const family = palette.families[attrs.family]

  if (picked || focused) {
    return {
      hidden,
      color: palette.accent,
      size: attrs.size + 2,
      forceLabel: true,
      labelColor: palette.text,
      zIndex: 2,
    }
  }
  if (lit) {
    return { hidden, color: family, size: attrs.size, forceLabel: true, labelColor: palette.text, zIndex: 1 }
  }
  if (dimmed) {
    // The dot stays as context; its label goes, so only the lit tools read.
    return {
      hidden,
      color: withAlpha(family, DIM_NODE),
      size: attrs.size,
      forceLabel: false,
      label: null,
      labelColor: withAlpha(palette.textFaint, DIM_LABEL),
      zIndex: 0,
    }
  }
  return {
    hidden,
    color: family,
    size: attrs.size,
    forceLabel: false,
    labelColor: palette.textMuted,
    zIndex: 1,
  }
}

/** Display attributes for one edge under the current view. */
export function edgeStyle(attrs: EdgeAttrs, view: GraphView, palette: Palette): Partial<EdgeDisplayData> {
  const hidden =
    view.hiddenEdgeTypes.has(attrs.kind) ||
    view.hiddenLayers.has(attrs.sourceLayer) ||
    view.hiddenLayers.has(attrs.targetLayer)
  const size = EDGE_SIZE[attrs.kind]

  if (view.highlight.size === 0) {
    const spot = view.spotlight
    if (spot === null) return { hidden, color: palette.edge, size, zIndex: 0 }
    if (attrs.source === spot || attrs.target === spot) {
      return { hidden, color: palette.edgeStrong, size: SPOT_EDGE_SIZE, zIndex: 2 }
    }
    return { hidden, color: withAlpha(palette.edge, DIM_EDGE), size, zIndex: 0 }
  }
  if (view.highlight.has(attrs.source) && view.highlight.has(attrs.target)) {
    return { hidden, color: palette.accent, size: 2, zIndex: 2 }
  }
  return { hidden, color: withAlpha(palette.edge, DIM_EDGE), size, zIndex: 0 }
}

/** `#rgb`, `#rrggbb` or `rgb(r, g, b)` to `rgba(r, g, b, alpha)`; anything else is returned as is. */
export function withAlpha(color: string, alpha: number): string {
  const c = color.trim()
  let rgb: number[] | null = null
  const hex = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(c)
  if (hex) {
    const h = hex[1].length === 3 ? [...hex[1]].map((d) => d + d).join('') : hex[1]
    rgb = [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16))
  } else {
    const fn = /^rgba?\(\s*(\d+)[\s,]+(\d+)[\s,]+(\d+)/i.exec(c)
    if (fn) rgb = [fn[1], fn[2], fn[3]].map(Number)
  }
  return rgb ? `rgba(${rgb[0]}, ${rgb[1]}, ${rgb[2]}, ${alpha})` : color
}

/** Reads the map colours from the CSS tokens on `root`, falling back per token. */
export function readPalette(root: HTMLElement = document.documentElement): Palette {
  const style = getComputedStyle(root)
  const read = (name: string, fallback: string) => style.getPropertyValue(name).trim() || fallback
  const f = FALLBACK_PALETTE.families
  return {
    families: {
      client: read('--family-client', f.client),
      server: read('--family-server', f.server),
      data: read('--family-data', f.data),
      services: read('--family-services', f.services),
      ops: read('--family-ops', f.ops),
    },
    accent: read('--accent', FALLBACK_PALETTE.accent),
    text: read('--text', FALLBACK_PALETTE.text),
    textMuted: read('--text-muted', FALLBACK_PALETTE.textMuted),
    textFaint: read('--text-faint', FALLBACK_PALETTE.textFaint),
    edge: read('--edge', FALLBACK_PALETTE.edge),
    edgeStrong: read('--edge-strong', FALLBACK_PALETTE.edgeStrong),
  }
}

/** Tools joined to `id` by an edge whose type is shown. */
export function neighboursOf(
  graph: Graph<NodeAttrs, EdgeAttrs>,
  id: string,
  hiddenEdgeTypes: ReadonlySet<EdgeType>,
): Set<string> {
  const out = new Set<string>()
  if (!graph.hasNode(id)) return out
  graph.forEachEdge(id, (_edge, attrs, source, target) => {
    if (!hiddenEdgeTypes.has(attrs.kind)) out.add(source === id ? target : source)
  })
  return out
}

export interface Box {
  x0: number
  y0: number
  x1: number
  y1: number
}

const overlaps = (a: Box, b: Box) => a.x0 < b.x1 && b.x0 < a.x1 && a.y0 < b.y1 && b.y0 < a.y1

/**
 * Keeps map labels from touching each other or another tool's dot, and from
 * being cut off at the edge of the map. Sigma picks which labels to try; this
 * says no to the ones that would collide. Reset once per frame.
 */
export class LabelPlacer {
  private placed: Box[] = []
  private dots: { id: string; box: Box }[] = []
  private size: { width: number; height: number }

  constructor(size: { width: number; height: number }) {
    this.size = size
  }

  resize(size: { width: number; height: number }) {
    this.size = size
  }

  reset(dots: { id: string; box: Box }[]) {
    this.placed = []
    this.dots = dots
  }

  /** A label that must show (focused or lit); later labels make way for it. */
  reserve(box: Box) {
    this.placed.push(box)
  }

  place(box: Box, ownDot?: string): boolean {
    const { width, height } = this.size
    if (box.x0 < 0 || box.y0 < 0 || box.x1 > width || box.y1 > height) return false
    if (this.placed.some((other) => overlaps(box, other))) return false
    if (this.dots.some((dot) => dot.id !== ownDot && overlaps(box, dot.box))) return false
    this.placed.push(box)
    return true
  }
}

/** Sigma's stage padding, in pixels (StackGraph). */
export const STAGE_PADDING = 40
const FIT_MARGIN = 12

/**
 * Sigma fits the map into the shorter side of the screen, which on a portrait
 * phone leaves it small, off-centre and with empty space below. Given where
 * sigma first draws the map (`drawn`, in pixels) and the area left free by
 * the top bar and the corner links, returns the zoom that makes the whole map
 * fit that area with a small margin (width-limited for a round map), and the
 * screen point its centre should move to. Null on landscape screens.
 */
export function portraitFit(
  drawn: Box,
  viewport: { width: number; height: number },
  free: { top: number; bottom: number },
): { ratio: number; from: { x: number; y: number }; to: { x: number; y: number } } | null {
  const { width, height } = viewport
  if (height <= width || width === 0) return null
  const freeHeight = height - free.top - free.bottom
  const ratio = Math.max(
    (drawn.x1 - drawn.x0) / (width - 2 * FIT_MARGIN),
    (drawn.y1 - drawn.y0) / (freeHeight - 2 * FIT_MARGIN),
  )
  return {
    ratio,
    from: { x: (drawn.x0 + drawn.x1) / 2, y: (drawn.y0 + drawn.y1) / 2 },
    to: { x: width / 2, y: free.top + freeHeight / 2 },
  }
}
