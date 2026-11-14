import { act, render } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type Graph from 'graphology'
import { kb } from '@/lib/kb'

// WebGL is unavailable in jsdom, so sigma is replaced by a recorder.
const fake = vi.hoisted(() => {
  type Handler = (payload: { node: string }) => void
  class FakeSigma {
    static instances: FakeSigma[] = []
    graph: Graph
    container: HTMLElement
    settings: Record<string, unknown>
    handlers: Record<string, Handler> = {}
    refresh = vi.fn()
    kill = vi.fn()
    camera = { setState: vi.fn(), animate: vi.fn(), getState: vi.fn(() => ({ x: 0.5, y: 0.5, ratio: 1, angle: 0 })) }
    constructor(graph: Graph, container: HTMLElement, settings: Record<string, unknown>) {
      this.graph = graph
      this.container = container
      this.settings = { ...settings }
      FakeSigma.instances.push(this)
    }
    on(event: string, handler: Handler) {
      this.handlers[event] = handler
      return this
    }
    setSetting(key: string, value: unknown) {
      this.settings[key] = value
      return this
    }
    getCamera() {
      return this.camera
    }
    getNodeDisplayData(node: string) {
      return this.graph.hasNode(node) ? { x: 0.25, y: 0.75 } : undefined
    }
  }
  return { FakeSigma }
})

vi.mock('sigma', () => ({ default: fake.FakeSigma }))

import { LAYER_FAMILY } from '@/lib/families'
import { FALLBACK_PALETTE, mix } from './model'
import { StackGraph } from './StackGraph'

/** A dimmed dot: its family colour mixed most of the way into the map ground. */
const dimmedOf = (layer: keyof typeof LAYER_FAMILY) =>
  mix(FALLBACK_PALETTE.families[LAYER_FAMILY[layer]], FALLBACK_PALETTE.background, 0.75)

type NodeReducer = (node: string, data: Record<string, unknown>) => Record<string, unknown>
type EdgeReducer = (edge: string, data: Record<string, unknown>) => Record<string, unknown>

function latest() {
  const instance = fake.FakeSigma.instances.at(-1)
  if (!instance) throw new Error('sigma was not created')
  return instance
}

function nodeOf(id: string) {
  const s = latest()
  return (s.settings.nodeReducer as NodeReducer)(id, s.graph.getNodeAttributes(id))
}

function edgesOfType(type: string) {
  const s = latest()
  return s.graph
    .filterEdges((_, attrs) => attrs.kind === type)
    .map((key) => (s.settings.edgeReducer as EdgeReducer)(key, s.graph.getEdgeAttributes(key)))
}

const database = kb.tools.find((t) => t.layer === 'database')!
const frontend = kb.tools.find((t) => t.layer === 'frontend')!
const backend = kb.tools.find((t) => t.layer === 'backend')!

describe('StackGraph', () => {
  beforeEach(() => {
    fake.FakeSigma.instances.length = 0
  })

  it('creates one sigma over every tool with motion turned off', () => {
    render(<StackGraph />)
    expect(fake.FakeSigma.instances).toHaveLength(1)
    const s = latest()
    expect(s.graph.order).toBe(kb.tools.length)
    expect(s.settings).toMatchObject({
      zoomDuration: 0,
      inertiaDuration: 0,
      doubleClickZoomingDuration: 0,
      renderEdgeLabels: false,
      zIndex: true,
    })
  })

  it('dims non-highlighted', () => {
    render(<StackGraph highlight={[frontend.id, backend.id]} />)
    const accent = nodeOf(frontend.id).color
    expect(nodeOf(backend.id).color).toBe(accent)
    expect(nodeOf(frontend.id).forceLabel).toBe(true)
    expect(nodeOf(database.id).color).toBe(dimmedOf(database.layer))
  })

  it('updates the reducers when the highlight changes', () => {
    const { rerender } = render(<StackGraph />)
    const s = latest()
    expect(nodeOf(database.id).color).not.toBe(dimmedOf(database.layer))
    rerender(<StackGraph highlight={[frontend.id]} />)
    expect(fake.FakeSigma.instances).toHaveLength(1)
    expect(nodeOf(database.id).color).toBe(dimmedOf(database.layer))
    expect(s.kill).not.toHaveBeenCalled()
  })

  it('onSelect on click', () => {
    const onSelect = vi.fn()
    render(<StackGraph onSelect={onSelect} />)
    act(() => latest().handlers.clickNode({ node: database.id }))
    expect(onSelect).toHaveBeenCalledWith(database.id)
  })

  it('reports a lost WebGL context on the map canvas', () => {
    const onContextLost = vi.fn()
    render(<StackGraph onContextLost={onContextLost} />)
    const canvas = document.createElement('canvas')
    latest().container.appendChild(canvas)
    // The event does not bubble; the graph listens in the capture phase.
    act(() => {
      canvas.dispatchEvent(new Event('webglcontextlost', { bubbles: false }))
    })
    expect(onContextLost).toHaveBeenCalledTimes(1)
  })

  it('uses the newest onSelect without rebuilding sigma', () => {
    const first = vi.fn()
    const second = vi.fn()
    const { rerender } = render(<StackGraph onSelect={first} />)
    rerender(<StackGraph onSelect={second} />)
    act(() => latest().handlers.clickNode({ node: frontend.id }))
    expect(first).not.toHaveBeenCalled()
    expect(second).toHaveBeenCalledWith(frontend.id)
    expect(fake.FakeSigma.instances).toHaveLength(1)
  })

  it('hides filtered layers and edge types', () => {
    render(<StackGraph hiddenLayers={new Set(['database'])} hiddenEdgeTypes={new Set(['alternative-to'])} />)
    expect(nodeOf(database.id).hidden).toBe(true)
    expect(nodeOf(frontend.id).hidden).toBe(false)
    const alternatives = edgesOfType('alternative-to')
    expect(alternatives.length).toBeGreaterThan(0)
    expect(alternatives.every((e) => e.hidden === true)).toBe(true)
    expect(edgesOfType('pairs-with').some((e) => e.hidden === false)).toBe(true)
  })

  it('jumps the camera to the focused tool with no animation', () => {
    const { rerender } = render(<StackGraph />)
    const camera = latest().camera
    expect(camera.setState).not.toHaveBeenCalled()
    rerender(<StackGraph focus={database.id} />)
    expect(camera.setState).toHaveBeenCalledWith(expect.objectContaining({ x: 0.25, y: 0.75 }))
    for (const call of camera.animate.mock.calls) expect(call[1]).toMatchObject({ duration: 0 })
    expect(nodeOf(database.id).forceLabel).toBe(true)
  })

  it('ignores a focus id that is not on the map', () => {
    render(<StackGraph focus="not-a-tool" />)
    expect(latest().camera.setState).not.toHaveBeenCalled()
  })

  it('does not restyle when it gets new filter sets with the same contents', () => {
    const { rerender } = render(<StackGraph hiddenLayers={new Set(['database'])} hiddenEdgeTypes={new Set(['extends'])} />)
    const s = latest()
    const reducer = s.settings.nodeReducer
    rerender(<StackGraph hiddenLayers={new Set(['database'])} hiddenEdgeTypes={new Set(['extends'])} />)
    expect(s.settings.nodeReducer).toBe(reducer)
    rerender(<StackGraph hiddenLayers={new Set(['cache'])} hiddenEdgeTypes={new Set(['extends'])} />)
    expect(s.settings.nodeReducer).not.toBe(reducer)
  })

  it('keeps the camera still when the focused tool is in a hidden layer', () => {
    render(<StackGraph focus={database.id} hiddenLayers={new Set(['database'])} />)
    expect(latest().camera.setState).not.toHaveBeenCalled()
  })

  it('keeps the camera inside the map', () => {
    render(<StackGraph />)
    expect(latest().settings).toMatchObject({ cameraPanBoundaries: true, enableCameraRotation: false })
  })

  it('draws labels through its own collision check at 10px', () => {
    render(<StackGraph />)
    const settings = latest().settings
    expect(settings.labelSize).toBe(10)
    expect(typeof settings.defaultDrawNodeLabel).toBe('function')
  })

  it('labels the neighbours of the focused tool and dims the rest', () => {
    const neighbour = backend.edges.find((e) => kb.tools.some((t) => t.id === e.target))!.target
    render(<StackGraph focus={backend.id} />)
    expect(nodeOf(neighbour).forceLabel).toBe(true)
    const stranger = kb.tools.find(
      (t) =>
        t.id !== backend.id &&
        !backend.edges.some((e) => e.target === t.id) &&
        !t.edges.some((e) => e.target === backend.id),
    )!
    expect(nodeOf(stranger.id).color).toBe(dimmedOf(stranger.layer))
  })

  it('hovering a dot lights its neighbourhood without moving the camera', () => {
    render(<StackGraph />)
    const s = latest()
    act(() => s.handlers.enterNode({ node: backend.id }))
    expect(nodeOf(backend.id).forceLabel).toBe(true)
    expect(s.camera.setState).not.toHaveBeenCalled()
    act(() => s.handlers.leaveNode({ node: backend.id }))
    expect(nodeOf(backend.id).forceLabel).toBe(false)
  })

  it('a hover left over from before a new focus never overrides it', () => {
    const neighbour = backend.edges.find((e) => kb.tools.some((t) => t.id === e.target))!.target
    const { rerender } = render(<StackGraph />)
    const s = latest()
    act(() => s.handlers.enterNode({ node: database.id }))
    expect(nodeOf(database.id).forceLabel).toBe(true)
    // a tap on a touch screen never sends leaveNode; then the focus moves
    rerender(<StackGraph focus={backend.id} />)
    expect(nodeOf(neighbour).forceLabel).toBe(true)
    const databaseLinked = backend.edges.some((e) => e.target === database.id) || database.edges.some((e) => e.target === backend.id)
    if (!databaseLinked) expect(nodeOf(database.id).forceLabel).toBe(false)
  })

  it('clicking empty map clears a hover', () => {
    render(<StackGraph />)
    const s = latest()
    act(() => s.handlers.enterNode({ node: backend.id }))
    act(() => s.handlers.clickStage({} as never))
    expect(nodeOf(backend.id).forceLabel).toBe(false)
  })

  it('ignores hover that comes from a touch', () => {
    render(<StackGraph />)
    const s = latest()
    act(() => {
      s.container.dispatchEvent(new Event('touchstart'))
    })
    act(() => s.handlers.enterNode({ node: backend.id }))
    expect(nodeOf(backend.id).forceLabel).toBe(false)
  })

  it('re-reads colours when the theme changes', async () => {
    render(<StackGraph highlight={[frontend.id]} />)
    const before = nodeOf(frontend.id).color
    const root = document.documentElement
    root.style.setProperty('--accent', '#437000')
    await act(async () => {
      root.dataset.theme = 'light'
      // MutationObserver callbacks run as microtasks
      await Promise.resolve()
    })
    expect(nodeOf(frontend.id).color).toBe('#437000')
    expect(before).not.toBe('#437000')
    root.removeAttribute('style')
  })

  it('kills sigma on unmount', () => {
    const { unmount } = render(<StackGraph />)
    const s = latest()
    unmount()
    expect(s.kill).toHaveBeenCalledTimes(1)
  })
})
