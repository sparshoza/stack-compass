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
  /** Tools on the shown route between two tools; while set, it outranks a stack and the spotlight. */
  route: ReadonlySet<string>
  /** The route's edges, keyed by routeEdgeKey. */
  routeEdges: ReadonlySet<string>
}

/** How an edge of a route is named: its relation and its two ends, the same whichever end comes first. */
export function routeEdgeKey(a: string, b: string, kind: EdgeType): string {
  return a < b ? `${kind}:${a}|${b}` : `${kind}:${b}|${a}`
}

export interface Palette {
  families: Record<FamilyId, string>
  accent: string
  text: string
  textMuted: string
  textFaint: string
  edge: string
  edgeStrong: string
  /** The map ground; dimmed colours are mixed toward it. */
  background: string
}

/** The dark tokens from styles/tokens.css, used when a variable cannot be read. */
export const FALLBACK_PALETTE: Palette = {
  families: { client: '#6aaae6', server: '#f2c681', data: '#74d3b6', services: '#e08e8e', ops: '#dbb5f8' },
  accent: '#c8fa5c',
  text: '#e8eaed',
  textMuted: '#a4abb4',
  textFaint: '#8b929b',
  edge: '#3a4048',
  edgeStrong: '#59616c',
  background: '#0d0f12',
}

/**
 * How far dimmed colours move toward the background. They are opaque mixes,
 * not alpha: sigma's WebGL blends premultiplied, so a low-alpha colour still
 * draws bright on a dark map.
 */
const DIM_NODE = 0.75
const DIM_LABEL = 0.65
const DIM_EDGE = 0.6
const SPOT_EDGE_SIZE = 1.5
/** Extra dot radius for a pick or the focused tool, and the width of an edge between two picks. */
const PICK_EXTRA = 2
const PICK_EDGE_SIZE = 2
/** Dot radius in pixels at rest: small and near-uniform, a touch larger for hubs. */
const BASE_SIZE = 2.5
const HUB_EXTRA = 1
const empty = new Set<never>()

export function makeView(opts: {
  highlight?: readonly string[]
  focus?: string | null
  spotlight?: string | null
  neighbours?: ReadonlySet<string>
  hiddenLayers?: ReadonlySet<Layer>
  hiddenEdgeTypes?: ReadonlySet<EdgeType>
  route?: { nodes: readonly string[]; edges: readonly string[] }
}): GraphView {
  return {
    route: opts.route?.nodes.length ? new Set(opts.route.nodes) : empty,
    routeEdges: opts.route?.nodes.length ? new Set(opts.route.edges) : empty,
    highlight: new Set(opts.highlight ?? []),
    focus: opts.focus ?? null,
    spotlight: opts.spotlight ?? opts.focus ?? null,
    neighbours: opts.neighbours ?? empty,
    hiddenLayers: opts.hiddenLayers ?? empty,
    hiddenEdgeTypes: opts.hiddenEdgeTypes ?? empty,
  }
}

export interface Stretch {
  x: number
  y: number
}

/** The widest a landscape screen stretches the round map. */
const MAX_WIDEN = 1.15
/** The tallest a portrait screen stretches it. */
const MAX_HEIGHTEN = 1.6

/**
 * How much to stretch the round layout so it fills the screen it opens on:
 * a little wider on a landscape screen, taller on a portrait phone (names are
 * wide, so rows need the height more than the width).
 */
export function mapStretch(viewport: { width: number; height: number }): Stretch {
  const { width, height } = viewport
  if (width <= 0 || height <= 0 || width === height) return { x: 1, y: 1 }
  if (width > height) return { x: Math.min(MAX_WIDEN, width / height), y: 1 }
  return { x: 1, y: Math.min(MAX_HEIGHTEN, height / width) }
}

/**
 * One node per tool and one undirected edge per pair and edge type (the
 * catalog often lists a relation from both ends). Edges to tools that are not
 * in the list are skipped. Better-connected tools get slightly bigger dots.
 * Positions are scaled by `stretch` (see mapStretch).
 */
export function buildGraph(
  tools: readonly Tool[],
  positions: Positions,
  stretch: Stretch = { x: 1, y: 1 },
): Graph<NodeAttrs, EdgeAttrs> {
  const graph = new Graph<NodeAttrs, EdgeAttrs>({ type: 'undirected', multi: true })
  for (const tool of tools) {
    const at = positions[tool.id] ?? { x: 0, y: 0 }
    graph.addNode(tool.id, {
      x: at.x * stretch.x,
      y: at.y * stretch.y,
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
    graph.setNodeAttribute(id, 'size', BASE_SIZE + Math.min(HUB_EXTRA, Math.sqrt(graph.degree(id)) * 0.15))
  })
  return graph
}

type NodeStyle = Partial<NodeDisplayData> & { labelColor: string }

/** Display attributes for one node under the current view. Pure, so it is tested directly. */
export function nodeStyle(id: string, attrs: NodeAttrs, view: GraphView, palette: Palette): NodeStyle {
  const hidden = view.hiddenLayers.has(attrs.layer)
  if (view.route.size > 0) {
    // The route is drawn whole, even through a filtered layer.
    return view.route.has(id) ? litStyle(false, attrs, palette) : dimStyle(hidden, attrs, palette)
  }
  const picked = view.highlight.has(id)
  const focused = view.focus === id
  // A spotlight (focus or hover) only applies while no stack is highlighted.
  const spot = view.highlight.size === 0 ? view.spotlight : null
  const lit = spot !== null && (id === spot || view.neighbours.has(id))
  const dimmed = view.highlight.size > 0 ? !picked && !focused : spot !== null && !lit
  const family = palette.families[attrs.family]

  if (picked || focused) return litStyle(hidden, attrs, palette)
  if (lit) {
    return { hidden, color: family, size: attrs.size, forceLabel: true, labelColor: palette.text, zIndex: 1 }
  }
  if (dimmed) return dimStyle(hidden, attrs, palette)
  return {
    hidden,
    color: family,
    size: attrs.size,
    forceLabel: false,
    labelColor: palette.textMuted,
    zIndex: 1,
  }
}

/** A pick, the focused tool or a tool on a route: the accent, a larger dot and its name. */
function litStyle(hidden: boolean, attrs: NodeAttrs, palette: Palette): NodeStyle {
  return {
    hidden,
    color: palette.accent,
    size: attrs.size + PICK_EXTRA,
    forceLabel: true,
    labelColor: palette.text,
    zIndex: 2,
  }
}

/** The dot stays as context; its label goes, so only the lit tools read. */
function dimStyle(hidden: boolean, attrs: NodeAttrs, palette: Palette): NodeStyle {
  const family = palette.families[attrs.family]
  return {
    hidden,
    color: mix(family, palette.background, DIM_NODE),
    size: attrs.size,
    forceLabel: false,
    label: null,
    labelColor: mix(palette.textFaint, palette.background, DIM_LABEL),
    zIndex: 0,
  }
}

/**
 * A tool part way through being selected, `p` from 0 to 1, spread over its
 * nodeStyle: the focused dot grows from its resting size to its lit size and
 * its neighbours' names fade in from the map colour. Only while the focus
 * spotlight shows (no stack, no route); every other tool is left alone.
 */
export function selectingStyle(
  id: string,
  attrs: NodeAttrs,
  style: Partial<NodeDisplayData> & { labelColor?: string },
  view: GraphView,
  palette: Palette,
  p: number,
): Partial<NodeStyle> {
  if (view.route.size > 0 || view.highlight.size > 0 || view.focus === null || view.spotlight !== view.focus) return {}
  const k = Math.max(0, Math.min(p, 1))
  if (id === view.focus) return { size: attrs.size + PICK_EXTRA * k }
  if (view.neighbours.has(id)) return { labelColor: mix(palette.background, style.labelColor ?? palette.text, k) }
  return {}
}

/**
 * A pick part way through lighting up, `p` from 0 (its dimmed dot, no name)
 * to 1 (the lit accent dot with its name). Colour and size only; the name
 * fades in with it. Spread over nodeStyle's result, which keeps `hidden`.
 */
export function lightingStyle(attrs: NodeAttrs, palette: Palette, p: number): Omit<NodeStyle, 'hidden'> {
  const dim = mix(palette.families[attrs.family], palette.background, DIM_NODE)
  if (p <= 0) {
    return {
      color: dim,
      size: attrs.size,
      forceLabel: false,
      label: null,
      labelColor: mix(palette.textFaint, palette.background, DIM_LABEL),
      zIndex: 0,
    }
  }
  const k = Math.min(p, 1)
  return {
    color: mix(dim, palette.accent, k),
    size: attrs.size + PICK_EXTRA * k,
    forceLabel: true,
    labelColor: mix(palette.background, palette.text, k),
    zIndex: 2,
  }
}

/** An edge between two picks while they light up: it follows the later of its two ends. */
export function lightingEdgeStyle(attrs: EdgeAttrs, palette: Palette, p: number): Partial<EdgeDisplayData> {
  const dim = mix(palette.edge, palette.background, DIM_EDGE)
  const k = Math.max(0, Math.min(p, 1))
  if (k === 0) return { color: dim, size: EDGE_SIZE[attrs.kind], zIndex: 0 }
  return {
    color: mix(dim, palette.accent, k),
    size: EDGE_SIZE[attrs.kind] + (PICK_EDGE_SIZE - EDGE_SIZE[attrs.kind]) * k,
    zIndex: 2,
  }
}

/** Display attributes for one edge under the current view. */
export function edgeStyle(attrs: EdgeAttrs, view: GraphView, palette: Palette): Partial<EdgeDisplayData> {
  const hidden =
    view.hiddenEdgeTypes.has(attrs.kind) ||
    view.hiddenLayers.has(attrs.sourceLayer) ||
    view.hiddenLayers.has(attrs.targetLayer)
  const size = EDGE_SIZE[attrs.kind]

  if (view.route.size > 0) {
    if (view.routeEdges.has(routeEdgeKey(attrs.source, attrs.target, attrs.kind))) {
      return { hidden: false, color: palette.accent, size: PICK_EDGE_SIZE, zIndex: 2 }
    }
    return { hidden, color: mix(palette.edge, palette.background, DIM_EDGE), size, zIndex: 0 }
  }
  if (view.highlight.size === 0) {
    const spot = view.spotlight
    if (spot === null) return { hidden, color: palette.edge, size, zIndex: 0 }
    if (attrs.source === spot || attrs.target === spot) {
      return { hidden, color: palette.edgeStrong, size: SPOT_EDGE_SIZE, zIndex: 2 }
    }
    return { hidden, color: mix(palette.edge, palette.background, DIM_EDGE), size, zIndex: 0 }
  }
  if (view.highlight.has(attrs.source) && view.highlight.has(attrs.target)) {
    return { hidden, color: palette.accent, size: PICK_EDGE_SIZE, zIndex: 2 }
  }
  return { hidden, color: mix(palette.edge, palette.background, DIM_EDGE), size, zIndex: 0 }
}

function parseRgb(color: string): number[] | null {
  const c = color.trim()
  const hex = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(c)
  if (hex) {
    const h = hex[1].length === 3 ? [...hex[1]].map((d) => d + d).join('') : hex[1]
    return [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16))
  }
  const fn = /^rgba?\(\s*(\d+)[\s,]+(\d+)[\s,]+(\d+)/i.exec(c)
  return fn ? [fn[1], fn[2], fn[3]].map(Number) : null
}

/**
 * An opaque `#rrggbb` that is `amount` of the way from `color` to `toward`
 * (0 keeps the colour, 1 is the target). Unparseable input comes back as is.
 */
export function mix(color: string, toward: string, amount: number): string {
  const a = parseRgb(color)
  const b = parseRgb(toward)
  if (!a || !b) return color
  return `#${a.map((v, i) => Math.round(v + (b[i] - v) * amount).toString(16).padStart(2, '0')).join('')}`
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
    background: read('--bg', FALLBACK_PALETTE.background),
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
/** The map area labels may use; `top` is the height of the bar floating over it. */
export interface PlacerArea {
  width: number
  height: number
  top?: number
}

export class LabelPlacer {
  private placed: Box[] = []
  private dots: { id: string; box: Box }[] = []
  private size: PlacerArea

  constructor(size: PlacerArea) {
    this.size = size
  }

  resize(size: PlacerArea) {
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

  /** `among`, when given, limits the dots a label must avoid to those tools (the lit ones). */
  place(box: Box, ownDot?: string, among?: ReadonlySet<string>): boolean {
    const { width, height, top = 0 } = this.size
    if (box.x0 < 0 || box.y0 < top || box.x1 > width || box.y1 > height) return false
    if (this.placed.some((other) => overlaps(box, other))) return false
    if (this.dots.some((dot) => dot.id !== ownDot && (!among || among.has(dot.id)) && overlaps(box, dot.box))) return false
    this.placed.push(box)
    return true
  }
}

export type Side = 'below' | 'above' | 'right'

/** Pixels between a dot's edge and its name. */
const LABEL_GAP = 2
/** Share of the font size above the baseline (JetBrains Mono caps sit at about 0.73em). */
const ASCENT = 0.78
const DESCENT = 0.22

/** Share of the font size that puts the baseline of a name beside the dot level with its centre. */
const MIDLINE = 0.35

/**
 * Where the text of a name starts (left end, alphabetic baseline): centred
 * under the dot, centred over it when the space below is taken, or right of
 * it, level with its centre, as a last resort for lit names.
 */
export function labelOrigin(
  x: number,
  y: number,
  size: number,
  width: number,
  labelSize: number,
  side: Side,
): { x: number; y: number } {
  if (side === 'right') return { x: x + size + LABEL_GAP + 1, y: y + labelSize * MIDLINE }
  const baseline =
    side === 'below' ? y + size + LABEL_GAP + labelSize * ASCENT : y - size - LABEL_GAP - labelSize * DESCENT
  return { x: x - width / 2, y: baseline }
}

/** The boxes a name takes under, over and right of its dot, a pixel wider than the text. */
export function labelBoxes(
  x: number,
  y: number,
  size: number,
  width: number,
  labelSize: number,
): { below: Box; above: Box; right: Box } {
  const x0 = x - width / 2 - 1
  const x1 = x + width / 2 + 1
  const side = x + size + LABEL_GAP
  return {
    below: { x0, y0: y + size + LABEL_GAP - 1, x1, y1: y + size + LABEL_GAP + labelSize },
    above: { x0, y0: y - size - LABEL_GAP - labelSize, x1, y1: y - size - LABEL_GAP + 1 },
    right: { x0: side, y0: y - labelSize * 0.55, x1: side + width + 2, y1: y + labelSize * 0.55 },
  }
}

/** Width of the solid halo stroke behind a lit name, in pixels (about 2px each side of the glyphs). */
const HALO_WIDTH = 4

/**
 * Draws a name at `at` in the current fill colour. A lit name first gets a
 * solid stroke in the map colour (`halo`), so accent edges never cut its
 * glyphs; it is an opaque outline, not a blur.
 */
export function drawName(
  context: CanvasRenderingContext2D,
  text: string,
  at: { x: number; y: number },
  halo: string | null,
) {
  if (halo) {
    context.lineWidth = HALO_WIDTH
    context.lineJoin = 'round'
    context.strokeStyle = halo
    context.strokeText(text, at.x, at.y)
  }
  context.fillText(text, at.x, at.y)
}

/**
 * A label candidate. rank 0: the focused tool or a pick (always drawn);
 * 1: a neighbour of the focused tool; 2: everything else.
 */
export interface LabelCandidate {
  id: string
  rank: number
  size: number
  below: Box
  above: Box
  right: Box
}

/**
 * Decides which labels to draw and where. Every name is centred under its
 * dot, else over it, and is dropped only when both places collide. Lit labels
 * (rank 0) are placed first and only dodge each other and the lit dots; when
 * both places are taken they try right of the dot, then go under it regardless. Neighbours of a focused tool
 * (rank 1) then avoid only lit dots, so the dimmed dots around them never
 * hide a related tool's name. Everything else avoids every dot, bigger dots
 * (better-connected tools) first.
 */
export function placeLabels(placer: LabelPlacer, candidates: readonly LabelCandidate[]): Map<string, Side> {
  const allowed = new Map<string, Side>()
  const lit = new Set(candidates.filter((c) => c.rank === 0).map((c) => c.id))
  const highlighted = new Set(candidates.filter((c) => c.rank <= 1).map((c) => c.id))
  for (const c of candidates) {
    if (c.rank !== 0) continue
    if (placer.place(c.below, c.id, lit)) allowed.set(c.id, 'below')
    else if (placer.place(c.above, c.id, lit)) allowed.set(c.id, 'above')
    else if (placer.place(c.right, c.id, lit)) allowed.set(c.id, 'right')
    else {
      placer.reserve(c.below)
      allowed.set(c.id, 'below')
    }
  }
  const rest = candidates
    .filter((c) => c.rank !== 0)
    .sort((a, b) => a.rank - b.rank || b.size - a.size || (a.id < b.id ? -1 : 1))
  for (const c of rest) {
    const among = c.rank === 1 ? highlighted : undefined
    if (placer.place(c.below, c.id, among)) allowed.set(c.id, 'below')
    else if (placer.place(c.above, c.id, among)) allowed.set(c.id, 'above')
  }
  return allowed
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

/** Room around fitted picks, so the names drawn under the dots stay on screen. */
const PICK_MARGIN = 48
/** The closest a fit may zoom in, as a share of the current zoom. */
const MIN_FIT_RATIO = 0.5

/**
 * The zoom (relative to the current one) and move that fit `drawn` (pixels at
 * the current camera) into the screen less the `free` insets on each side,
 * as with portraitFit: map point `from` goes to screen point `to`.
 */
export function areaFit(
  drawn: Box,
  viewport: { width: number; height: number },
  free: { top: number; right: number; bottom: number; left: number },
): { ratio: number; from: { x: number; y: number }; to: { x: number; y: number } } {
  // An axis the panels leave (almost) no room on is fitted across the whole
  // screen instead, so the fit never zooms out to nothing.
  const axis = (size: number, start: number, end: number) =>
    size - start - end - 2 * PICK_MARGIN > 0 ? { start, end } : { start: 0, end: 0 }
  const x = axis(viewport.width, free.left, free.right)
  const y = axis(viewport.height, free.top, free.bottom)
  const freeWidth = Math.max(1, viewport.width - x.start - x.end - 2 * PICK_MARGIN)
  const freeHeight = Math.max(1, viewport.height - y.start - y.end - 2 * PICK_MARGIN)
  const ratio = Math.max(MIN_FIT_RATIO, (drawn.x1 - drawn.x0) / freeWidth, (drawn.y1 - drawn.y0) / freeHeight)
  return {
    ratio,
    from: { x: (drawn.x0 + drawn.x1) / 2, y: (drawn.y0 + drawn.y1) / 2 },
    to: {
      x: x.start + (viewport.width - x.start - x.end) / 2,
      y: y.start + (viewport.height - y.start - y.end) / 2,
    },
  }
}

/** Fit zoom changes inside this band (relative to the current zoom) count as about the same scale. */
const CALM_RATIO = { min: 0.8, max: 1.25 }

/**
 * Whether lit tools drawn at `drawn` can stay where they are: every one
 * already sits in the free area (less the label margin) and fitting them
 * would barely change the zoom. Then a changed answer keeps the map still.
 */
export function keepsCamera(
  drawn: Box,
  viewport: { width: number; height: number },
  free: { top: number; right: number; bottom: number; left: number },
): boolean {
  const inside =
    drawn.x0 >= free.left + PICK_MARGIN &&
    drawn.x1 <= viewport.width - free.right - PICK_MARGIN &&
    drawn.y0 >= free.top + PICK_MARGIN &&
    drawn.y1 <= viewport.height - free.bottom - PICK_MARGIN
  if (!inside) return false
  const { ratio } = areaFit(drawn, viewport, free)
  return ratio >= CALM_RATIO.min && ratio <= CALM_RATIO.max
}
