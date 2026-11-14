import { useEffect, useMemo, useRef, useState } from 'react'
import Sigma from 'sigma'
import type { Settings } from 'sigma/settings'
import type { NodeDisplayData, PartialButFor } from 'sigma/types'
import layout from '@catalog/layout.json'
import { kb, type EdgeType, type Layer } from '@/lib/kb'
import {
  areaFit,
  buildGraph,
  edgeStyle,
  LabelPlacer,
  makeView,
  neighboursOf,
  nodeStyle,
  portraitFit,
  readPalette,
  STAGE_PADDING,
  type Box,
  type EdgeAttrs,
  type NodeAttrs,
  type Palette,
  type Positions,
} from './model'

// sigma and graphology are imported only inside components/graph, so the map
// can later be split into its own chunk.

export interface StackGraphProps {
  /** Tool ids drawn in the accent; everything else is dimmed. */
  highlight?: string[]
  /** Tool id the camera jumps to; drawn in the accent with its label. */
  focus?: string
  hiddenLayers?: ReadonlySet<Layer>
  hiddenEdgeTypes?: ReadonlySet<EdgeType>
  onSelect?: (id: string) => void
  /** Pixels covered by the top bar and by panels on the sides or bottom; the focused tool is centred in the rest. */
  focusInset?: { top: number; right: number; bottom: number; left?: number }
  /** Pixels covered while a stack is highlighted; the camera fits the picks into the rest. */
  highlightInset?: { top: number; right: number; bottom: number; left: number }
  /** Pixels covered at rest by the top bar and the corner links; a portrait screen fits the map between them. */
  frameInset?: { top: number; bottom: number }
}

/** A touch is followed by emulated mouse events; hover from those is ignored for this long. */
const TOUCH_HOVER_GRACE_MS = 1000

function setKey(set: ReadonlySet<string> | undefined): string {
  return set?.size ? [...set].sort().join('\n') : ''
}

type LabelData = PartialButFor<NodeDisplayData, 'x' | 'y' | 'size' | 'label' | 'color'>

/** The hovered label in the text colour: no box, no shadow. */
function drawLabelOnly(context: CanvasRenderingContext2D, data: LabelData, settings: Settings<NodeAttrs, EdgeAttrs>) {
  if (!data.label) return
  context.fillStyle = settings.labelColor.color ?? '#000'
  context.font = `${settings.labelWeight} ${settings.labelSize}px ${settings.labelFont}`
  context.fillText(data.label, data.x + data.size + 3, data.y + settings.labelSize / 3)
}

const LABEL_GAP = 3

type Side = 'right' | 'left'

/** Where the text starts: right of the dot by default, or left of it when the right is taken. */
function labelX(x: number, size: number, width: number, side: Side): number {
  return side === 'right' ? x + size + LABEL_GAP : x - size - LABEL_GAP - width
}

function labelBox(x: number, y: number, size: number, width: number, labelSize: number, side: Side = 'right'): Box {
  const x0 = labelX(x, size, width, side)
  return { x0: x0 - 1, y0: y - labelSize * 0.55, x1: x0 + width + 1, y1: y + labelSize * 0.6 }
}

/**
 * Picks which labels to draw, once per frame, so none touches another label
 * or another tool's dot or runs off the map. The focused tool and any picks
 * are reserved first, then its neighbours claim space, then the best-connected tools
 * (biggest dots) claim space before smaller ones, right of the dot or else
 * left of it. Sigma offers every node as
 * a candidate (tiny label grid) and this decides.
 */
function makeLabelDrawer() {
  const placer = new LabelPlacer({ width: 0, height: 0 })
  const widths = new Map<string, number>()
  let allowed = new Map<string, Side>()
  let sigma: Sigma<NodeAttrs, EdgeAttrs> | null = null
  let fresh = false

  function attach(instance: Sigma<NodeAttrs, EdgeAttrs>) {
    sigma = instance
    instance.on('beforeRender', () => {
      fresh = false
    })
  }

  const font = (settings: Settings<NodeAttrs, EdgeAttrs>) =>
    `${settings.labelWeight} ${settings.labelSize}px ${settings.labelFont}`

  function widthOf(context: CanvasRenderingContext2D, label: string): number {
    let width = widths.get(label)
    if (width === undefined) {
      width = context.measureText(label).width
      widths.set(label, width)
    }
    return width
  }

  // Runs on the first label of each frame, once sigma has processed the graph.
  function prepare(
    sigma: Sigma<NodeAttrs, EdgeAttrs>,
    context: CanvasRenderingContext2D,
    settings: Settings<NodeAttrs, EdgeAttrs>,
  ) {
    placer.resize(sigma.getDimensions())
    context.font = font(settings)
    const dots: { id: string; box: Box }[] = []
    // rank 0: the focused tool or a pick (always drawn), 1: its neighbours
    // (placed first), 2: everything else (bigger dots first).
    const candidates: { id: string; rank: number; size: number; right: Box; left: Box }[] = []
    sigma.getGraph().forEachNode((id) => {
      const data = sigma.getNodeDisplayData(id)
      if (!data || data.hidden) return
      const at = sigma.framedGraphToViewport(data)
      const r = sigma.scaleSize(data.size)
      dots.push({ id, box: { x0: at.x - r, y0: at.y - r, x1: at.x + r, y1: at.y + r } })
      if (!data.label) return
      const width = widthOf(context, data.label)
      candidates.push({
        id,
        size: data.size,
        rank: data.forceLabel ? ((data.zIndex ?? 0) >= 2 ? 0 : 1) : 2,
        right: labelBox(at.x, at.y, r, width, settings.labelSize, 'right'),
        left: labelBox(at.x, at.y, r, width, settings.labelSize, 'left'),
      })
    })
    placer.reset(dots)
    allowed = new Map()
    // Labels that must show still dodge each other: right of the dot, else
    // left of it, else right regardless.
    // Dimmed dots underneath are context, so only lit dots count here.
    const lit = new Set(candidates.filter((c) => c.rank === 0).map((c) => c.id))
    for (const c of candidates) {
      if (c.rank !== 0) continue
      if (placer.place(c.right, c.id, lit)) allowed.set(c.id, 'right')
      else if (placer.place(c.left, c.id, lit)) allowed.set(c.id, 'left')
      else {
        placer.reserve(c.right)
        allowed.set(c.id, 'right')
      }
    }
    candidates.sort((a, b) => a.rank - b.rank || b.size - a.size || (a.id < b.id ? -1 : 1))
    for (const c of candidates) {
      if (c.rank === 0) continue
      if (placer.place(c.right, c.id)) allowed.set(c.id, 'right')
      else if (placer.place(c.left, c.id)) allowed.set(c.id, 'left')
    }
    fresh = true
  }

  function draw(
    context: CanvasRenderingContext2D,
    data: LabelData & { key?: string; forceLabel?: boolean; labelColor?: string },
    settings: Settings<NodeAttrs, EdgeAttrs>,
  ) {
    if (!data.label || !sigma) return
    if (!fresh) prepare(sigma, context, settings)
    const side = data.key ? allowed.get(data.key) : undefined
    if (!side) return
    context.font = font(settings)
    context.fillStyle = data.labelColor ?? settings.labelColor.color ?? '#000'
    const x = labelX(data.x, data.size, widthOf(context, data.label), side)
    context.fillText(data.label, x, data.y + settings.labelSize / 3)
  }

  return { attach, draw }
}

/**
 * On a portrait screen, zoom and move the camera so the whole map fits the
 * width between the top bar and the corner links (see portraitFit). Measured
 * from where sigma draws every dot at the starting camera.
 */
function fitPortrait(sigma: Sigma<NodeAttrs, EdgeAttrs>, inset: { top: number; bottom: number } | undefined) {
  if (!inset || typeof sigma.getDimensions !== 'function') return
  sigma.refresh()
  const viewport = sigma.getDimensions()
  let drawn: Box | null = null
  sigma.getGraph().forEachNode((id) => {
    const data = sigma.getNodeDisplayData(id)
    if (!data) return
    const at = sigma.framedGraphToViewport(data)
    const r = sigma.scaleSize(data.size)
    drawn = drawn
      ? {
          x0: Math.min(drawn.x0, at.x - r),
          y0: Math.min(drawn.y0, at.y - r),
          x1: Math.max(drawn.x1, at.x + r),
          y1: Math.max(drawn.y1, at.y + r),
        }
      : { x0: at.x - r, y0: at.y - r, x1: at.x + r, y1: at.y + r }
  })
  if (!drawn) return
  const fit = portraitFit(drawn, viewport, inset)
  if (fit) applyFit(sigma, fit)
}

/**
 * Moves the camera so the map point now drawn at `fit.from` lands on screen
 * point `fit.to`, zoomed by `fit.ratio` relative to the current zoom.
 */
function applyFit(
  sigma: Sigma<NodeAttrs, EdgeAttrs>,
  fit: { ratio: number; from: { x: number; y: number }; to: { x: number; y: number } },
) {
  const viewport = sigma.getDimensions()
  // At the current camera, find the map point under `from` and the vector
  // for the pixel offset between the screen centre and `to`; at the new zoom
  // that offset scales with the ratio.
  const centre = { x: viewport.width / 2, y: viewport.height / 2 }
  const from = sigma.viewportToFramedGraph(fit.from)
  const a = sigma.viewportToFramedGraph(centre)
  const b = sigma.viewportToFramedGraph({ x: centre.x + centre.x - fit.to.x, y: centre.y + centre.y - fit.to.y })
  const camera = sigma.getCamera()
  camera.setState({
    x: from.x + (b.x - a.x) * fit.ratio,
    y: from.y + (b.y - a.y) * fit.ratio,
    ratio: camera.getState().ratio * fit.ratio,
  })
}

/** Where the given tools are drawn at the current camera, in pixels; null when none is drawn. */
function drawnBox(sigma: Sigma<NodeAttrs, EdgeAttrs>, ids: string[]): Box | null {
  let box: Box | null = null
  for (const id of ids) {
    const data = sigma.getNodeDisplayData(id)
    if (!data || data.hidden) continue
    const at = sigma.framedGraphToViewport(data)
    box = box
      ? { x0: Math.min(box.x0, at.x), y0: Math.min(box.y0, at.y), x1: Math.max(box.x1, at.x), y1: Math.max(box.y1, at.y) }
      : { x0: at.x, y0: at.y, x1: at.x, y1: at.y }
  }
  return box
}

function readFont(): string {
  const font = getComputedStyle(document.documentElement).getPropertyValue('--font-ui').trim()
  return font || 'ui-monospace, monospace'
}

/** Re-reads the colour tokens whenever `data-theme` on <html> changes. */
function usePalette(): Palette {
  const [palette, setPalette] = useState(readPalette)
  useEffect(() => {
    const root = document.documentElement
    const observer = new MutationObserver(() => setPalette(readPalette(root)))
    observer.observe(root, { attributes: true, attributeFilter: ['data-theme'] })
    return () => observer.disconnect()
  }, [])
  return palette
}

export function StackGraph({
  highlight,
  focus,
  hiddenLayers,
  hiddenEdgeTypes,
  onSelect,
  focusInset,
  highlightInset,
  frameInset,
}: StackGraphProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const sigmaRef = useRef<Sigma<NodeAttrs, EdgeAttrs> | null>(null)
  const onSelectRef = useRef(onSelect)
  const palette = usePalette()

  const focusInsetRef = useRef(focusInset)
  const frameInsetRef = useRef(frameInset)
  const highlightInsetRef = useRef(highlightInset)

  useEffect(() => {
    onSelectRef.current = onSelect
    focusInsetRef.current = focusInset
    frameInsetRef.current = frameInset
    highlightInsetRef.current = highlightInset
  }, [onSelect, focusInset, frameInset, highlightInset])

  const graph = useMemo(() => buildGraph(kb.tools, layout as Positions), [])

  // A hover remembers the focus it happened under, so a hover left behind
  // (touch screens never send leaveNode) never outlives a change of focus.
  const [hover, setHover] = useState<{ node: string; focus: string | null } | null>(null)
  const hovered = hover && hover.focus === (focus ?? null) ? hover.node : null
  const focusRef = useRef(focus)
  useEffect(() => {
    focusRef.current = focus
  }, [focus])

  // Props are compared by content, not identity, so a parent that builds new
  // arrays or Sets on every render does not restyle the whole graph.
  const highlightKey = highlight?.join('\n') ?? ''
  const layersKey = setKey(hiddenLayers)
  const edgeTypesKey = setKey(hiddenEdgeTypes)
  const view = useMemo(() => {
    const hiddenEdges = new Set(edgeTypesKey ? (edgeTypesKey.split('\n') as EdgeType[]) : [])
    // Hovering a dot lights its neighbourhood; otherwise the focused tool's.
    const spotlight = hovered ?? focus ?? null
    return makeView({
      highlight: highlightKey ? highlightKey.split('\n') : [],
      focus: focus ?? null,
      spotlight,
      neighbours: spotlight ? neighboursOf(graph, spotlight, hiddenEdges) : undefined,
      hiddenLayers: new Set(layersKey ? (layersKey.split('\n') as Layer[]) : []),
      hiddenEdgeTypes: hiddenEdges,
    })
  }, [graph, hovered, highlightKey, focus, layersKey, edgeTypesKey])

  // Create sigma once per mount. Styling is applied by the effect below.
  useEffect(() => {
    const container = containerRef.current
    if (!container) return
    const labels = makeLabelDrawer()
    const sigma = new Sigma<NodeAttrs, EdgeAttrs>(graph, container, {
      allowInvalidContainer: true,
      renderEdgeLabels: false,
      zIndex: true,
      stagePadding: STAGE_PADDING,
      labelFont: readFont(),
      labelSize: 11,
      labelWeight: '400',
      // Every dot is a label candidate (a grid cell per few pixels); the label
      // drawer keeps only those that fit without touching anything.
      labelDensity: 1,
      labelGridCellSize: 24,
      labelRenderedSizeThreshold: 0,
      defaultDrawNodeLabel: labels.draw,
      defaultDrawNodeHover: drawLabelOnly,
      // No motion in phase 1: every camera move is instant.
      zoomDuration: 0,
      inertiaDuration: 0,
      doubleClickZoomingDuration: 0,
      minCameraRatio: 0.08,
      maxCameraRatio: 3,
      // The map cannot be dragged out of view or turned on a touch screen.
      cameraPanBoundaries: true,
      enableCameraRotation: false,
    })
    labels.attach(sigma)
    fitPortrait(sigma, frameInsetRef.current)

    let lastTouch = -Infinity
    const onTouch = () => {
      lastTouch = Date.now()
      setHover(null)
    }
    container.addEventListener('touchstart', onTouch, { passive: true })
    sigma.on('clickNode', ({ node }) => onSelectRef.current?.(node))
    sigma.on('clickStage', () => setHover(null))
    sigma.on('enterNode', ({ node }) => {
      if (Date.now() - lastTouch < TOUCH_HOVER_GRACE_MS) return
      container.style.cursor = 'pointer'
      setHover({ node, focus: focusRef.current ?? null })
    })
    sigma.on('leaveNode', () => {
      container.style.cursor = ''
      setHover(null)
    })
    sigmaRef.current = sigma
    return () => {
      container.removeEventListener('touchstart', onTouch)
      sigma.kill()
      sigmaRef.current = null
    }
  }, [graph])

  // Restyle on every view or theme change. Reducers must return full data.
  useEffect(() => {
    const sigma = sigmaRef.current
    if (!sigma) return
    sigma.setSetting('labelColor', { attribute: 'labelColor', color: palette.text })
    sigma.setSetting('nodeReducer', (node, data) => ({ ...data, ...nodeStyle(node, data, view, palette) }))
    sigma.setSetting('edgeReducer', (_edge, data) => ({ ...data, ...edgeStyle(data, view, palette) }))
  }, [view, palette])

  // Jump (duration 0) to the focused tool. A tool in a hidden layer is not
  // drawn, so the camera stays put. The app shows a tool's layer again before
  // focusing it; this only guards against a stale focus.
  const focusHidden =
    focus !== undefined && graph.hasNode(focus) && view.hiddenLayers.has(graph.getNodeAttribute(focus, 'layer'))
  useEffect(() => {
    const sigma = sigmaRef.current
    if (!sigma || !focus || focusHidden) return
    // Display data is only normalised once sigma has processed the graph; a
    // style change just before (or the first mount) leaves that pending, so
    // process now rather than read raw layout coordinates.
    sigma.refresh()
    const at = sigma.getNodeDisplayData(focus)
    if (!at) return
    const camera = sigma.getCamera()
    const ratio = Math.min(camera.getState().ratio, 0.5)
    camera.setState({ x: at.x, y: at.y, ratio })
    // Shift so the tool sits in the middle of the area the panel leaves free.
    const inset = focusInsetRef.current
    if (inset && typeof sigma.viewportToFramedGraph === 'function') {
      const { width, height } = sigma.getDimensions()
      const centre = sigma.viewportToFramedGraph({ x: width / 2, y: height / 2 })
      const shifted = sigma.viewportToFramedGraph({
        x: width / 2 + (inset.right - (inset.left ?? 0)) / 2,
        y: height / 2 + (inset.bottom - inset.top) / 2,
      })
      camera.setState({ x: at.x + shifted.x - centre.x, y: at.y + shifted.y - centre.y, ratio })
    }
  }, [focus, focusHidden])

  // A new stack jumps (duration 0) to frame its picks in the area the sheet
  // and the bars leave free. A focused tool takes the camera instead.
  useEffect(() => {
    const sigma = sigmaRef.current
    if (!sigma || !highlightKey || focusRef.current) return
    if (typeof sigma.framedGraphToViewport !== 'function' || typeof sigma.getDimensions !== 'function') return
    sigma.refresh()
    const box = drawnBox(sigma, highlightKey.split('\n'))
    if (!box) return
    const inset = highlightInsetRef.current ?? { top: 0, right: 0, bottom: 0, left: 0 }
    applyFit(sigma, areaFit(box, sigma.getDimensions(), inset))
  }, [highlightKey])

  return <div ref={containerRef} className="absolute inset-0" data-testid="stack-graph" />
}
