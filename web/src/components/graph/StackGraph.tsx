import { useEffect, useMemo, useRef, useState } from 'react'
import Sigma from 'sigma'
import type { Settings } from 'sigma/settings'
import type { NodeDisplayData, PartialButFor } from 'sigma/types'
import layout from '@catalog/layout.json'
import type { Route } from '@/engine/path'
import { kb, type EdgeType, type Layer } from '@/lib/kb'
import { instantCamera } from './camera'
import { easeOut, readDuration, staggerSchedule, tween, useReducedMotion } from '@/lib/motion'
import {
  areaFit,
  buildGraph,
  drawName,
  edgeStyle,
  labelBoxes,
  labelOrigin,
  LabelPlacer,
  lightingEdgeStyle,
  lightingStyle,
  makeView,
  mapStretch,
  neighboursOf,
  placeLabels,
  nodeStyle,
  portraitFit,
  readPalette,
  routeEdgeKey,
  selectingStyle,
  STAGE_PADDING,
  type Box,
  type EdgeAttrs,
  type LabelCandidate,
  type NodeAttrs,
  type Palette,
  type Positions,
  type Side,
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
  /** A click on a dot; `add` is true with Ctrl (Cmd on a Mac) held, to ask for a route to it. */
  onSelect?: (id: string, opts: { add: boolean }) => void
  /** A click (not the end of a drag) on empty map. */
  onClear?: () => void
  /** Routes between the focused tool and another, drawn in the accent over a dimmed map. */
  routes?: readonly Route[]
  /** Pixels covered by the top bar and by panels on the sides or bottom; the focused tool is centred in the rest. */
  focusInset?: { top: number; right: number; bottom: number; left?: number }
  /** Pixels covered while a stack is highlighted; the camera fits the picks into the rest. */
  highlightInset?: { top: number; right: number; bottom: number; left: number }
  /** Pixels covered while a route shows; the camera fits the route into the rest. */
  routeInset?: { top: number; right: number; bottom: number; left: number }
  /** Pixels covered at rest by the top bar and the corner links; a portrait screen fits the map between them. */
  frameInset?: { top: number; bottom: number }
  /** The browser dropped the map's WebGL context (GPU reset, too many contexts). */
  onContextLost?: () => void
}

/** A touch is followed by emulated mouse events; hover from those is ignored for this long. */
const TOUCH_HOVER_GRACE_MS = 1000
/** A press that moves further than this before its click is a drag, not a click (sigma's own tolerance is 3 moves). */
const DRAG_TOLERANCE_PX = 4

/** Ctrl on Windows and Linux, Cmd on a Mac (where Ctrl with a click opens the context menu). */
function wantsRoute(original: unknown): boolean {
  return original instanceof MouseEvent && (original.ctrlKey || original.metaKey)
}

function setKey(set: ReadonlySet<string> | undefined): string {
  return set?.size ? [...set].sort().join('\n') : ''
}

type LabelData = PartialButFor<NodeDisplayData, 'x' | 'y' | 'size' | 'label' | 'color'>

/**
 * Picks which labels to draw, once per frame, so none touches another label
 * or another tool's dot or runs off the map. The focused tool and any picks
 * are reserved first, then its neighbours claim space, then the
 * best-connected tools claim space before the rest. Each name is centred
 * under its dot, else over it (a lit name may also go right of it). Labels
 * keep out from under the top bar (`area().top`). Lit names (focus, picks,
 * neighbours, hover) get a solid halo in the map colour (`area().halo`) so
 * accent edges do not cut them. Sigma offers every node as a candidate (tiny
 * label grid) and this decides.
 */
function makeLabelDrawer(area: () => { top: number; halo: string }) {
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
    placer.resize({ ...sigma.getDimensions(), top: area().top })
    context.font = font(settings)
    const dots: { id: string; box: Box }[] = []
    const candidates: LabelCandidate[] = []
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
        ...labelBoxes(at.x, at.y, r, width, settings.labelSize),
      })
    })
    placer.reset(dots)
    allowed = placeLabels(placer, candidates)
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
    const at = labelOrigin(data.x, data.y, data.size, widthOf(context, data.label), settings.labelSize, side)
    drawName(context, data.label, at, data.forceLabel ? area().halo : null)
  }

  /** The hovered name in the text colour, where the label pass put it (under the dot when it had no place). */
  function drawHover(
    context: CanvasRenderingContext2D,
    data: LabelData & { key?: string },
    settings: Settings<NodeAttrs, EdgeAttrs>,
  ) {
    if (!data.label) return
    context.font = font(settings)
    context.fillStyle = settings.labelColor.color ?? '#000'
    const side = (data.key ? allowed.get(data.key) : undefined) ?? 'below'
    const at = labelOrigin(data.x, data.y, data.size, widthOf(context, data.label), settings.labelSize, side)
    drawName(context, data.label, at, area().halo)
  }

  return { attach, draw, drawHover }
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

interface CameraTarget {
  x: number
  y: number
  ratio: number
}

/**
 * The camera state `move` would set, worked out on the live camera and then
 * put back before sigma draws a frame (sigma renders on the next animation
 * frame), so the camera can glide there instead of jumping.
 */
function cameraTarget(sigma: Sigma<NodeAttrs, EdgeAttrs>, move: () => void): CameraTarget {
  const camera = sigma.getCamera()
  const before = camera.getState()
  move()
  const { x, y, ratio } = camera.getState()
  camera.setState(before)
  return { x, y, ratio }
}

/**
 * Glides the camera from where it is now to `target` over `duration` ms on
 * the ease-out curve; 0 jumps. Zoom changes geometrically so its speed reads
 * even. Returns a cancel function that leaves the camera where it is.
 */
function glideCamera(
  sigma: Sigma<NodeAttrs, EdgeAttrs>,
  target: CameraTarget,
  duration: number,
  done: () => void,
): () => void {
  const camera = sigma.getCamera()
  const from = camera.getState()
  return tween(
    duration,
    (t) => {
      const k = easeOut(t)
      camera.setState({
        x: from.x + (target.x - from.x) * k,
        y: from.y + (target.y - from.y) * k,
        ratio: t >= 1 ? target.ratio : from.ratio * (target.ratio / from.ratio) ** k,
      })
    },
    done,
  )
}

type Glide = { cancel: () => void; target: CameraTarget }

/**
 * Moves the camera where `move` would put it: a glide over --duration-slow,
 * a jump with reduced motion. A new move starts from wherever a running
 * glide has got to.
 */
function moveCamera(glideRef: { current: Glide | null }, sigma: Sigma<NodeAttrs, EdgeAttrs>, move: () => void) {
  glideRef.current?.cancel()
  glideRef.current = null
  const target = cameraTarget(sigma, move)
  const glide: Glide = { target, cancel: () => {} }
  glideRef.current = glide
  // A finished glide is forgotten, so nothing later can jump back to its target.
  const forget = () => {
    if (glideRef.current === glide) glideRef.current = null
  }
  glide.cancel = glideCamera(sigma, target, readDuration('--duration-slow'), forget)
}

/** Ids of the edges whose two ends are both in `ids`. */
function edgesAmong(sigma: Sigma<NodeAttrs, EdgeAttrs>, ids: readonly string[]): string[] {
  const set = new Set(ids)
  return sigma.getGraph().filterEdges((_, attrs) => set.has(attrs.source) && set.has(attrs.target))
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
  onClear,
  routes,
  focusInset,
  highlightInset,
  routeInset,
  frameInset,
  onContextLost,
}: StackGraphProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const sigmaRef = useRef<Sigma<NodeAttrs, EdgeAttrs> | null>(null)
  const onSelectRef = useRef(onSelect)
  const onContextLostRef = useRef(onContextLost)
  const onClearRef = useRef(onClear)
  const palette = usePalette()
  const paletteRef = useRef(palette)

  // Motion state lives in refs: the camera glide and the pick sequence run on
  // animation frames and redraw through sigma, never through React.
  const reduced = useReducedMotion()
  const glideRef = useRef<Glide | null>(null)
  const lightingRef = useRef<Map<string, number> | null>(null)
  const stopLightingRef = useRef<(() => void) | null>(null)
  const litKeyRef = useRef('')
  // Progress of the focused tool being selected (see selectingStyle); null when settled.
  const selectingRef = useRef<number | null>(null)
  const stopSelectingRef = useRef<(() => void) | null>(null)

  const focusInsetRef = useRef(focusInset)
  const frameInsetRef = useRef(frameInset)
  const highlightInsetRef = useRef(highlightInset)
  const routeInsetRef = useRef(routeInset)

  useEffect(() => {
    onSelectRef.current = onSelect
    onContextLostRef.current = onContextLost
    onClearRef.current = onClear
    focusInsetRef.current = focusInset
    frameInsetRef.current = frameInset
    highlightInsetRef.current = highlightInset
    routeInsetRef.current = routeInset
  }, [onSelect, onClear, onContextLost, focusInset, frameInset, highlightInset, routeInset])

  // The round layout is stretched once to the shape of the screen the map
  // opens on (wider on desktop, taller on a phone); see mapStretch.
  const graph = useMemo(
    () => buildGraph(kb.tools, layout as Positions, mapStretch({ width: window.innerWidth, height: window.innerHeight })),
    [],
  )

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
  // A route is drawn as its tools and the edges between them.
  const routeKey = (routes ?? [])
    .flatMap((r) => r.steps.map((step) => routeEdgeKey(step.from, step.to, step.type)))
    .sort()
    .join('\n')
  const routeNodesKey = [...new Set((routes ?? []).flatMap((r) => r.nodes))].sort().join('\n')
  const view = useMemo(() => {
    const hiddenEdges = new Set(edgeTypesKey ? (edgeTypesKey.split('\n') as EdgeType[]) : [])
    // Hovering a dot lights its neighbourhood; otherwise the focused tool's.
    // A route stays as it is under a hover.
    const spotlight = (routeNodesKey ? null : hovered) ?? focus ?? null
    return makeView({
      highlight: highlightKey ? highlightKey.split('\n') : [],
      focus: focus ?? null,
      spotlight,
      neighbours: spotlight ? neighboursOf(graph, spotlight, hiddenEdges) : undefined,
      hiddenLayers: new Set(layersKey ? (layersKey.split('\n') as Layer[]) : []),
      hiddenEdgeTypes: hiddenEdges,
      route: routeNodesKey ? { nodes: routeNodesKey.split('\n'), edges: routeKey ? routeKey.split('\n') : [] } : undefined,
    })
  }, [graph, hovered, highlightKey, focus, layersKey, edgeTypesKey, routeKey, routeNodesKey])

  // Create sigma once per mount. Styling is applied by the effect below.
  useEffect(() => {
    const container = containerRef.current
    if (!container) return
    const labels = makeLabelDrawer(() => ({
      top: frameInsetRef.current?.top ?? 0,
      halo: paletteRef.current.background,
    }))
    const sigma = new Sigma<NodeAttrs, EdgeAttrs>(graph, container, {
      allowInvalidContainer: true,
      renderEdgeLabels: false,
      zIndex: true,
      stagePadding: STAGE_PADDING,
      labelFont: readFont(),
      labelSize: 10,
      labelWeight: '400',
      // Every dot is a label candidate (a grid cell per few pixels); the label
      // drawer keeps only those that fit without touching anything.
      labelDensity: 1,
      labelGridCellSize: 10,
      labelRenderedSizeThreshold: 0,
      defaultDrawNodeLabel: labels.draw,
      defaultDrawNodeHover: labels.drawHover,
      // Wheel and pinch zoom follow the hand at once: they repeat many times
      // in a row, so they never animate. Double click does not zoom (below).
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
    instantCamera(sigma.getCamera())
    fitPortrait(sigma, frameInsetRef.current)

    let lastTouch = -Infinity
    const onTouch = () => {
      lastTouch = Date.now()
      setHover(null)
    }
    container.addEventListener('touchstart', onTouch, { passive: true })
    // Context events fire on sigma's canvases and do not bubble, so listen in the capture phase.
    const onLost = () => onContextLostRef.current?.()
    container.addEventListener('webglcontextlost', onLost, true)
    // Any hand on the map stops a camera glide where it is, before sigma's
    // own handlers move the camera, so the two never fight.
    const stopGlide = () => {
      glideRef.current?.cancel()
      glideRef.current = null
    }
    const grabs = ['wheel', 'pointerdown', 'mousedown', 'touchstart'] as const
    for (const type of grabs) container.addEventListener(type, stopGlide, { capture: true, passive: true })
    // Where the last mouse press started, to tell a click from the end of a drag.
    let press: { x: number; y: number } | null = null
    const onPress = (e: MouseEvent) => {
      press = { x: e.clientX, y: e.clientY }
    }
    container.addEventListener('mousedown', onPress, { capture: true, passive: true })
    const dragged = (original: unknown) =>
      press !== null &&
      original instanceof MouseEvent &&
      Math.hypot(original.clientX - press.x, original.clientY - press.y) > DRAG_TOLERANCE_PX
    sigma.on('clickNode', ({ node, event }) => onSelectRef.current?.(node, { add: wantsRoute(event?.original) }))
    // sigma sends no click for the end of a drag, so this is a real click on empty map.
    // sigma drops the click that ends a drag of three moves or more; a shorter one is caught here.
    sigma.on('clickStage', (e) => {
      if (dragged(e.event?.original)) return
      setHover(null)
      onClearRef.current?.()
    })
    // sigma turns the second of two quick clicks into a double click and
    // zooms, even when that click ends a drag; here it counts as the click it
    // is, and the map zooms only by wheel or pinch.
    sigma.on('doubleClickNode', (e) => {
      e.preventSigmaDefault()
      if (!dragged(e.event?.original)) onSelectRef.current?.(e.node, { add: wantsRoute(e.event?.original) })
    })
    sigma.on('doubleClickStage', (e) => {
      e.preventSigmaDefault()
      if (dragged(e.event?.original)) return
      setHover(null)
      onClearRef.current?.()
    })
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
      container.removeEventListener('mousedown', onPress, true)
      container.removeEventListener('webglcontextlost', onLost, true)
      for (const type of grabs) container.removeEventListener(type, stopGlide, { capture: true })
      stopGlide()
      stopLightingRef.current?.()
      stopLightingRef.current = null
      lightingRef.current = null
      stopSelectingRef.current?.()
      stopSelectingRef.current = null
      selectingRef.current = null
      sigma.kill()
      sigmaRef.current = null
    }
  }, [graph])

  // The camera may pan past the edge of the map by as much as the panels
  // cover, so a tool near the edge can still be brought into the open area
  // (on a phone the tool panel covers the bottom 60%). At rest the map stays
  // inside the screen. Runs before the camera moves below.
  const sides = (inset?: { top: number; right: number; bottom: number; left?: number }) =>
    inset ? [inset.top, inset.right, inset.bottom, inset.left ?? 0] : []
  const panTolerance = Math.max(
    0,
    ...(routeNodesKey ? sides(routeInset) : []),
    ...(focus && !routeNodesKey ? sides(focusInset) : []),
  )
  useEffect(() => {
    sigmaRef.current?.setSetting('cameraPanBoundaries', panTolerance > 0 ? { tolerance: panTolerance } : true)
  }, [panTolerance])

  // When a result appears (no picks before, picks now), the picks light up
  // one after another in scoring order: colour, size and name only, the
  // whole sequence within --duration-stagger (600ms at most). A changed
  // result swaps at once. Each frame redraws only the picks and the edges
  // between them; React does not re-render.
  useEffect(() => {
    const sigma = sigmaRef.current
    const was = litKeyRef.current
    litKeyRef.current = highlightKey
    stopLightingRef.current?.()
    stopLightingRef.current = null
    lightingRef.current = null
    if (!sigma || !highlightKey || was) return
    const ids = highlightKey.split('\n')
    const slots = staggerSchedule(ids.length, {
      total: readDuration('--duration-stagger'),
      each: readDuration('--duration-base'),
    })
    const end = Math.max(0, ...slots.map((slot) => slot.delay + slot.duration))
    if (end <= 0) return
    const progress = new Map(ids.map((id) => [id, 0]))
    lightingRef.current = progress
    const partialGraph = { nodes: ids, edges: edgesAmong(sigma, ids) }
    stopLightingRef.current = tween(
      end,
      (t) => {
        const now = t * end
        ids.forEach((id, i) => {
          const { delay, duration } = slots[i]
          const local = duration > 0 ? (now - delay) / duration : now >= delay ? 1 : 0
          progress.set(id, easeOut(Math.max(0, Math.min(1, local))))
        })
        if (t >= 1) lightingRef.current = null
        sigma.refresh({ partialGraph })
      },
      () => {
        stopLightingRef.current = null
      },
    )
  }, [highlightKey])

  // A newly focused tool eases in over --duration-base: its dot grows and
  // the names of its neighbours fade in (selectingStyle). Each frame redraws
  // only the tool and its neighbours; React does not re-render. With reduced
  // motion the duration is 0 and it is lit at once.
  useEffect(() => {
    const sigma = sigmaRef.current
    stopSelectingRef.current?.()
    stopSelectingRef.current = null
    selectingRef.current = null
    if (!sigma || !focus || !graph.hasNode(focus)) return
    const duration = readDuration('--duration-base')
    if (duration <= 0) return
    const nodes = [focus, ...graph.neighbors(focus)]
    selectingRef.current = 0
    stopSelectingRef.current = tween(
      duration,
      (t) => {
        selectingRef.current = t >= 1 ? null : easeOut(t)
        sigma.refresh({ partialGraph: { nodes } })
      },
      () => {
        stopSelectingRef.current = null
      },
    )
  }, [focus, graph])

  // Restyle on every view or theme change. Reducers must return full data.
  // A pick that is still lighting up is drawn part way (see lightingStyle).
  useEffect(() => {
    const sigma = sigmaRef.current
    if (!sigma) return
    paletteRef.current = palette
    sigma.setSetting('labelColor', { attribute: 'labelColor', color: palette.text })
    sigma.setSetting('nodeReducer', (node, data) => {
      const style = { ...data, ...nodeStyle(node, data, view, palette) }
      const selecting = selectingRef.current
      if (selecting !== null) Object.assign(style, selectingStyle(node, data, style, view, palette, selecting))
      const p = lightingRef.current?.get(node)
      return p === undefined || node === view.focus ? style : { ...style, ...lightingStyle(data, palette, p) }
    })
    sigma.setSetting('edgeReducer', (_edge, data) => {
      const style = { ...data, ...edgeStyle(data, view, palette) }
      const a = lightingRef.current?.get(data.source)
      const b = lightingRef.current?.get(data.target)
      return a === undefined || b === undefined ? style : { ...style, ...lightingEdgeStyle(data, palette, Math.min(a, b)) }
    })
  }, [view, palette])

  // Turning reduced motion on part way finishes any motion at once.
  useEffect(() => {
    const sigma = sigmaRef.current
    if (!reduced || !sigma) return
    const glide = glideRef.current
    if (glide) {
      glide.cancel()
      glideRef.current = null
      sigma.getCamera().setState(glide.target)
    }
    if (stopLightingRef.current || stopSelectingRef.current) {
      stopLightingRef.current?.()
      stopLightingRef.current = null
      lightingRef.current = null
      stopSelectingRef.current?.()
      stopSelectingRef.current = null
      selectingRef.current = null
      sigma.refresh()
    }
  }, [reduced])

  // Glide to the focused tool. A tool in a hidden layer is not
  // drawn, so the camera stays put. The app shows a tool's layer again before
  // focusing it; this only guards against a stale focus.
  const focusHidden =
    focus !== undefined && graph.hasNode(focus) && view.hiddenLayers.has(graph.getNodeAttribute(focus, 'layer'))
  // While a route shows, the camera frames the route instead (below).
  const routing = routeNodesKey !== ''
  const routingRef = useRef(routing)
  useEffect(() => {
    routingRef.current = routing
  }, [routing])
  useEffect(() => {
    const sigma = sigmaRef.current
    if (!sigma || !focus || focusHidden || routingRef.current) return
    // Display data is only normalised once sigma has processed the graph; a
    // style change just before (or the first mount) leaves that pending, so
    // process now rather than read raw layout coordinates.
    sigma.refresh()
    const at = sigma.getNodeDisplayData(focus)
    if (!at) return
    moveCamera(glideRef, sigma, () => {
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
    })
  }, [focus, focusHidden])

  // A new stack glides to frame its picks in the area the sheet
  // and the bars leave free. A focused tool takes the camera instead.
  useEffect(() => {
    const sigma = sigmaRef.current
    if (!sigma || !highlightKey || focusRef.current) return
    if (typeof sigma.framedGraphToViewport !== 'function' || typeof sigma.getDimensions !== 'function') return
    sigma.refresh()
    const box = drawnBox(sigma, highlightKey.split('\n'))
    if (!box) return
    const inset = highlightInsetRef.current ?? { top: 0, right: 0, bottom: 0, left: 0 }
    moveCamera(glideRef, sigma, () => applyFit(sigma, areaFit(box, sigma.getDimensions(), inset)))
  }, [highlightKey])

  const routeInsetKey = routeInset ? sides(routeInset).join(',') : ''
  // A route glides to fit all its tools in the area the panels leave free.
  useEffect(() => {
    const sigma = sigmaRef.current
    if (!sigma || !routeNodesKey) return
    if (typeof sigma.framedGraphToViewport !== 'function' || typeof sigma.getDimensions !== 'function') return
    sigma.refresh()
    const box = drawnBox(sigma, routeNodesKey.split('\n'))
    if (!box) return
    const inset = routeInsetRef.current ?? { top: 0, right: 0, bottom: 0, left: 0 }
    moveCamera(glideRef, sigma, () => applyFit(sigma, areaFit(box, sigma.getDimensions(), inset)))
    // routeInsetKey: a panel opening or closing beside the route frames it again.
  }, [routeNodesKey, routeInsetKey])

  return <div ref={containerRef} className="absolute inset-0" data-testid="stack-graph" />
}
