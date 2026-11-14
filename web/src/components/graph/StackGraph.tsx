import { useEffect, useMemo, useRef, useState } from 'react'
import Sigma from 'sigma'
import type { Settings } from 'sigma/settings'
import type { NodeDisplayData, PartialButFor } from 'sigma/types'
import layout from '@catalog/layout.json'
import { kb, type EdgeType, type Layer } from '@/lib/kb'
import {
  buildGraph,
  edgeStyle,
  makeView,
  nodeStyle,
  readPalette,
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
  /** Pixels covered by the top bar and by a panel on the right or bottom; the focused tool is centred in the rest. */
  focusInset?: { top: number; right: number; bottom: number }
}

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
}: StackGraphProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const sigmaRef = useRef<Sigma<NodeAttrs, EdgeAttrs> | null>(null)
  const onSelectRef = useRef(onSelect)
  const palette = usePalette()

  const focusInsetRef = useRef(focusInset)

  useEffect(() => {
    onSelectRef.current = onSelect
    focusInsetRef.current = focusInset
  }, [onSelect, focusInset])

  const graph = useMemo(() => buildGraph(kb.tools, layout as Positions), [])

  // Props are compared by content, not identity, so a parent that builds new
  // arrays or Sets on every render does not restyle the whole graph.
  const highlightKey = highlight?.join('\n') ?? ''
  const layersKey = setKey(hiddenLayers)
  const edgeTypesKey = setKey(hiddenEdgeTypes)
  const view = useMemo(
    () =>
      makeView({
        highlight: highlightKey ? highlightKey.split('\n') : [],
        focus: focus ?? null,
        hiddenLayers: new Set(layersKey ? (layersKey.split('\n') as Layer[]) : []),
        hiddenEdgeTypes: new Set(edgeTypesKey ? (edgeTypesKey.split('\n') as EdgeType[]) : []),
      }),
    [highlightKey, focus, layersKey, edgeTypesKey],
  )

  // Create sigma once per mount. Styling is applied by the effect below.
  useEffect(() => {
    const container = containerRef.current
    if (!container) return
    const sigma = new Sigma<NodeAttrs, EdgeAttrs>(graph, container, {
      allowInvalidContainer: true,
      renderEdgeLabels: false,
      zIndex: true,
      stagePadding: 40,
      labelFont: readFont(),
      labelSize: 12,
      labelWeight: '400',
      // Labels thin out when zoomed out: only dots drawn at 4px or more get
      // one, and at most a few per grid cell.
      labelDensity: 0.6,
      labelGridCellSize: 90,
      labelRenderedSizeThreshold: 4,
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
    sigma.on('clickNode', ({ node }) => onSelectRef.current?.(node))
    sigma.on('enterNode', () => {
      container.style.cursor = 'pointer'
    })
    sigma.on('leaveNode', () => {
      container.style.cursor = ''
    })
    sigmaRef.current = sigma
    return () => {
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
        x: width / 2 + inset.right / 2,
        y: height / 2 + (inset.bottom - inset.top) / 2,
      })
      camera.setState({ x: at.x + shifted.x - centre.x, y: at.y + shifted.y - centre.y, ratio })
    }
  }, [focus, focusHidden])

  return <div ref={containerRef} className="absolute inset-0" data-testid="stack-graph" />
}
