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

export function StackGraph({ highlight, focus, hiddenLayers, hiddenEdgeTypes, onSelect }: StackGraphProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const sigmaRef = useRef<Sigma<NodeAttrs, EdgeAttrs> | null>(null)
  const onSelectRef = useRef(onSelect)
  const palette = usePalette()

  useEffect(() => {
    onSelectRef.current = onSelect
  }, [onSelect])

  const graph = useMemo(() => buildGraph(kb.tools, layout as Positions), [])

  const highlightKey = highlight?.join('\n') ?? ''
  const view = useMemo(
    () =>
      makeView({
        highlight: highlightKey ? highlightKey.split('\n') : [],
        focus: focus ?? null,
        hiddenLayers,
        hiddenEdgeTypes,
      }),
    [highlightKey, focus, hiddenLayers, hiddenEdgeTypes],
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

  // Jump (duration 0) to the focused tool.
  useEffect(() => {
    const sigma = sigmaRef.current
    if (!sigma || !focus) return
    const at = sigma.getNodeDisplayData(focus)
    if (!at) return
    const camera = sigma.getCamera()
    camera.setState({ x: at.x, y: at.y, ratio: Math.min(camera.getState().ratio, 0.5) })
  }, [focus])

  return <div ref={containerRef} className="absolute inset-0" data-testid="stack-graph" />
}
