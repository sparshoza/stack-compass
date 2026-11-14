import { act, render } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
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
    // The camera keeps the state it is given, like sigma's.
    cameraState = { x: 0.5, y: 0.5, ratio: 1, angle: 0 }
    camera = {
      setState: vi.fn((next: Partial<typeof this.cameraState>) => {
        this.cameraState = { ...this.cameraState, ...next }
      }),
      getState: vi.fn(() => ({ ...this.cameraState })),
      // sigma animates over time; a stand-in that never arrives shows when the graph relies on it.
      animate: vi.fn(),
      isAnimated: vi.fn(() => false),
    }
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
    getGraph() {
      return this.graph
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

  it('creates one sigma over every tool; wheel and pinch zoom stay instant', () => {
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
    expect(onSelect).toHaveBeenCalledWith(database.id, { add: false })
  })

  it('Ctrl or Cmd with a click asks for a route instead of a new focus', () => {
    const onSelect = vi.fn()
    render(<StackGraph onSelect={onSelect} />)
    const click = (init: MouseEventInit) =>
      act(() => latest().handlers.clickNode({ node: database.id, event: { original: new MouseEvent('click', init) } } as never))
    click({ ctrlKey: true })
    expect(onSelect).toHaveBeenLastCalledWith(database.id, { add: true })
    click({ metaKey: true })
    expect(onSelect).toHaveBeenLastCalledWith(database.id, { add: true })
    click({})
    expect(onSelect).toHaveBeenLastCalledWith(database.id, { add: false })
  })

  it('a click on empty map clears, but not the end of a drag', () => {
    const onClear = vi.fn()
    render(<StackGraph onClear={onClear} />)
    const s = latest()
    act(() => s.handlers.clickStage({ event: { original: new MouseEvent('click') } } as never))
    expect(onClear).toHaveBeenCalledTimes(1)
    act(() => s.handlers.doubleClickStage({ preventSigmaDefault: () => {}, event: { original: new MouseEvent('click') } } as never))
    expect(onClear).toHaveBeenCalledTimes(2)
    act(() => {
      s.container.dispatchEvent(new MouseEvent('mousedown', { clientX: 0, clientY: 0 }))
    })
    act(() =>
      s.handlers.doubleClickStage({ preventSigmaDefault: () => {}, event: { original: new MouseEvent('click', { clientX: 40, clientY: 0 }) } } as never),
    )
    expect(onClear).toHaveBeenCalledTimes(2)
  })

  it('a click on empty map at the end of a small drag does not clear', () => {
    const onClear = vi.fn()
    render(<StackGraph onClear={onClear} />)
    const s = latest()
    act(() => {
      s.container.dispatchEvent(new MouseEvent('mousedown', { clientX: 0, clientY: 0 }))
    })
    act(() => s.handlers.clickStage({ event: { original: new MouseEvent('click', { clientX: 12, clientY: 0 }) } } as never))
    expect(onClear).not.toHaveBeenCalled()
  })

  it('a double tap never zooms either: it selects, or clears on empty map', () => {
    const onSelect = vi.fn()
    const onClear = vi.fn()
    render(<StackGraph onSelect={onSelect} onClear={onClear} />)
    const s = latest()
    const prevent = vi.fn()
    const original = new Event('touchend')
    act(() => s.handlers.doubleClickNode({ node: database.id, preventSigmaDefault: prevent, event: { original } } as never))
    act(() => s.handlers.doubleClickStage({ preventSigmaDefault: prevent, event: { original } } as never))
    expect(prevent).toHaveBeenCalledTimes(2)
    expect(onSelect).toHaveBeenCalledWith(database.id, { add: false })
    expect(onClear).toHaveBeenCalledTimes(1)
  })

  it('lets the camera pan as far past the map edge as the panels cover, so a covered tool can be framed', () => {
    const [a, b] = [backend.id, backend.edges.find((e) => kb.tools.some((t) => t.id === e.target))!.target]
    const type = backend.edges.find((e) => e.target === b)!.type
    const routes = [{ nodes: [a, b], steps: [{ from: a, to: b, type, text: '' }] }]
    const { rerender } = render(<StackGraph />)
    expect(latest().settings.cameraPanBoundaries).toBe(true)
    rerender(<StackGraph focus={a} focusInset={{ top: 124, right: 0, bottom: 506 }} />)
    expect(latest().settings.cameraPanBoundaries).toEqual({ tolerance: 506 })
    rerender(<StackGraph focus={a} routes={routes} routeInset={{ top: 68, right: 424, bottom: 60, left: 400 }} />)
    expect(latest().settings.cameraPanBoundaries).toEqual({ tolerance: 424 })
    rerender(<StackGraph />)
    expect(latest().settings.cameraPanBoundaries).toBe(true)
  })

  it('lets the camera pan past the edge by the area the sheet covers while tools are lit', () => {
    const lit = [database.id, frontend.id]
    const { rerender } = render(<StackGraph highlight={lit} highlightInset={{ top: 68, right: 0, bottom: 60, left: 464 }} />)
    expect(latest().settings.cameraPanBoundaries).toEqual({ tolerance: 464 })
    // A focused tool takes the camera: its own inset counts instead.
    rerender(<StackGraph highlight={lit} highlightInset={{ top: 68, right: 0, bottom: 60, left: 464 }} focus={database.id} focusInset={{ top: 68, right: 424, bottom: 0 }} />)
    expect(latest().settings.cameraPanBoundaries).toEqual({ tolerance: 424 })
  })

  /** Gives the stand-in geometry: tools drawn where `at` says, everything else at the centre. */
  function withGeometry(at: Record<string, { x: number; y: number }>) {
    const s = latest() as unknown as Record<string, unknown>
    s.getDimensions = () => ({ width: 1440, height: 900 })
    s.getNodeDisplayData = (id: string) => (latest().graph.hasNode(id) ? { ...(at[id] ?? { x: 720, y: 450 }), size: 3 } : undefined)
    s.framedGraphToViewport = (p: { x: number; y: number }) => ({ x: p.x, y: p.y })
    s.viewportToFramedGraph = (p: { x: number; y: number }) => ({ x: p.x, y: p.y })
    return latest().camera
  }

  it('frames lit tools again when the area the panels leave changes', () => {
    const inset = { top: 68, right: 0, bottom: 60, left: 464 }
    const { rerender } = render(<StackGraph />)
    const camera = withGeometry({ [database.id]: { x: 100, y: 200 }, [frontend.id]: { x: 1300, y: 700 } })
    rerender(<StackGraph highlight={[database.id, frontend.id]} highlightInset={inset} />)
    const calls = camera.setState.mock.calls.length
    expect(calls).toBeGreaterThan(0)
    rerender(<StackGraph highlight={[database.id, frontend.id]} highlightInset={{ ...inset }} />)
    expect(camera.setState.mock.calls.length).toBe(calls)
    rerender(<StackGraph highlight={[database.id, frontend.id]} highlightInset={{ ...inset, right: 424 }} />)
    expect(camera.setState.mock.calls.length).toBeGreaterThan(calls)
  })

  it('keeps the camera still when new lit tools already sit in the open area at about the same scale', () => {
    const inset = { top: 68, right: 0, bottom: 60, left: 464 }
    const { rerender } = render(<StackGraph />)
    const camera = withGeometry({
      [database.id]: { x: 560, y: 160 },
      [frontend.id]: { x: 1320, y: 740 },
      [backend.id]: { x: 900, y: 400 },
    })
    rerender(<StackGraph highlight={[database.id, frontend.id]} highlightInset={inset} />)
    const calls = camera.setState.mock.calls.length
    rerender(<StackGraph highlight={[database.id, frontend.id, backend.id]} highlightInset={inset} />)
    expect(camera.setState.mock.calls.length).toBe(calls)
  })

  it('reframes a route when the area left for it changes', () => {
    const [a, b] = [backend.id, backend.edges.find((e) => kb.tools.some((t) => t.id === e.target))!.target]
    const type = backend.edges.find((e) => e.target === b)!.type
    const routes = [{ nodes: [a, b], steps: [{ from: a, to: b, type, text: '' }] }]
    const inset = { top: 68, right: 424, bottom: 60, left: 400 }
    const { rerender } = render(<StackGraph />)
    // Give the stand-in enough geometry for a fit.
    const s = latest() as unknown as Record<string, unknown>
    s.getDimensions = () => ({ width: 1440, height: 900 })
    s.framedGraphToViewport = (p: { x: number; y: number }) => ({ x: p.x * 1000, y: p.y * 1000 })
    s.viewportToFramedGraph = (p: { x: number; y: number }) => ({ x: p.x / 1000, y: p.y / 1000 })
    const camera = latest().camera
    rerender(<StackGraph focus={a} routes={routes} routeInset={inset} />)
    const calls = camera.setState.mock.calls.length
    expect(calls).toBeGreaterThan(0)
    rerender(<StackGraph focus={a} routes={routes} routeInset={{ ...inset }} />)
    expect(camera.setState.mock.calls.length).toBe(calls)
    rerender(<StackGraph focus={a} routes={routes} routeInset={{ ...inset, left: 464 }} />)
    expect(camera.setState.mock.calls.length).toBeGreaterThan(calls)
  })

  it('lights a route between two tools and dims the rest of the map', () => {
    const [a, b] = [backend.id, backend.edges.find((e) => kb.tools.some((t) => t.id === e.target))!.target]
    const type = backend.edges.find((e) => e.target === b)!.type
    render(
      <StackGraph focus={a} routes={[{ nodes: [a, b], steps: [{ from: a, to: b, type, text: '' }] }]} />,
    )
    expect(nodeOf(a).color).toBe(FALLBACK_PALETTE.accent)
    expect(nodeOf(b).color).toBe(FALLBACK_PALETTE.accent)
    expect(nodeOf(b).forceLabel).toBe(true)
    expect(nodeOf(database.id).color).toBe(dimmedOf(database.layer))
    const lit = edgesOfType(type).filter((e) => e.color === FALLBACK_PALETTE.accent)
    expect(lit).toHaveLength(1)
  })

  it('applies zero-length camera animations at once (sigma leaves NaN until the next frame)', () => {
    render(<StackGraph />)
    const camera = latest().camera
    camera.animate({ x: 0.1, y: 0.2, ratio: 0.4 }, { duration: 0 })
    expect(camera.getState()).toMatchObject({ x: 0.1, y: 0.2, ratio: 0.4 })
  })

  it('a double click selects like a click and never zooms the camera', () => {
    const onSelect = vi.fn()
    render(<StackGraph onSelect={onSelect} />)
    const s = latest()
    const onNode = vi.fn()
    act(() => s.handlers.doubleClickNode({ node: database.id, preventSigmaDefault: onNode } as never))
    expect(onNode).toHaveBeenCalled()
    expect(onSelect).toHaveBeenCalledWith(database.id, { add: false })
    const onStage = vi.fn()
    act(() => s.handlers.doubleClickStage({ preventSigmaDefault: onStage } as never))
    expect(onStage).toHaveBeenCalled()
  })

  it('the click that ends a drag is never a double click on a dot', () => {
    const onSelect = vi.fn()
    render(<StackGraph onSelect={onSelect} />)
    const s = latest()
    act(() => {
      s.container.dispatchEvent(new MouseEvent('mousedown', { clientX: 10, clientY: 10 }))
    })
    const original = new MouseEvent('click', { clientX: 60, clientY: 30 })
    const prevent = vi.fn()
    act(() => s.handlers.doubleClickNode({ node: database.id, preventSigmaDefault: prevent, event: { original } } as never))
    expect(prevent).toHaveBeenCalled()
    expect(onSelect).not.toHaveBeenCalled()
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
    expect(second).toHaveBeenCalledWith(frontend.id, { add: false })
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

  it('jumps the camera to the focused tool when the motion tokens are missing', () => {
    const { rerender } = render(<StackGraph />)
    const camera = latest().camera
    expect(camera.setState).not.toHaveBeenCalled()
    const raf = vi.spyOn(window, 'requestAnimationFrame')
    rerender(<StackGraph focus={database.id} />)
    expect(camera.setState).toHaveBeenLastCalledWith(expect.objectContaining({ x: 0.25, y: 0.75 }))
    expect(raf).not.toHaveBeenCalled()
    raf.mockRestore()
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

  describe('motion', () => {
    const start = { x: 0.5, y: 0.5, ratio: 1, angle: 0 }
    const picks = kb.tools.filter((t) => t.layer !== 'database').slice(0, 8).map((t) => t.id)

    beforeEach(() => {
      vi.useFakeTimers({ toFake: ['requestAnimationFrame', 'cancelAnimationFrame', 'performance'] })
      const root = document.documentElement
      root.style.setProperty('--duration-slow', '280ms')
      root.style.setProperty('--duration-base', '200ms')
      root.style.setProperty('--duration-stagger', '480ms')
    })

    afterEach(() => {
      vi.useRealTimers()
      vi.restoreAllMocks()
      document.documentElement.removeAttribute('style')
      // @ts-expect-error restore jsdom's missing matchMedia
      delete window.matchMedia
    })

    function reduceMotion() {
      window.matchMedia = vi.fn((query: string) => ({
        matches: query.includes('prefers-reduced-motion'),
        media: query,
        onchange: null,
        addEventListener: () => {},
        removeEventListener: () => {},
        addListener: () => {},
        removeListener: () => {},
        dispatchEvent: () => false,
      })) as unknown as typeof window.matchMedia
    }

    /** Each recorded camera state, with the camera's live state following setState like sigma's. */
    function trackCamera() {
      const camera = latest().camera
      let state = { ...start }
      camera.getState.mockImplementation(() => ({ ...state }))
      camera.setState.mockImplementation((next: Partial<typeof state>) => {
        state = { ...state, ...next }
      })
      return { camera, now: () => state }
    }

    it('glides the camera to a focused tool over the slow duration', () => {
      const { rerender } = render(<StackGraph />)
      const { camera, now } = trackCamera()
      rerender(<StackGraph focus={database.id} />)
      // The camera has not jumped: it starts from where it was.
      expect(now()).toMatchObject({ x: 0.5, y: 0.5 })
      act(() => vi.advanceTimersByTime(140))
      const mid = now()
      expect(mid.x).toBeLessThan(0.5)
      expect(mid.x).toBeGreaterThan(0.25)
      // 280ms from the first frame (16ms in).
      act(() => vi.advanceTimersByTime(170))
      expect(now()).toMatchObject({ x: 0.25, y: 0.75, ratio: 0.5 })
      const calls = camera.setState.mock.calls.length
      act(() => vi.advanceTimersByTime(200))
      expect(camera.setState.mock.calls.length).toBe(calls)
    })

    it('stops gliding the moment the user wheels, drags or touches the map', () => {
      for (const type of ['wheel', 'pointerdown', 'touchstart']) {
        fake.FakeSigma.instances.length = 0
        const { rerender, unmount } = render(<StackGraph />)
        const { camera, now } = trackCamera()
        rerender(<StackGraph focus={database.id} />)
        act(() => vi.advanceTimersByTime(80))
        act(() => {
          latest().container.dispatchEvent(new Event(type))
        })
        const at = now()
        // Caught mid-flight, between where it was and the tool.
        expect(at.x, type).toBeLessThan(0.5)
        expect(at.x, type).toBeGreaterThan(0.25)
        const calls = camera.setState.mock.calls.length
        act(() => vi.advanceTimersByTime(400))
        expect(camera.setState.mock.calls.length, type).toBe(calls)
        expect(now(), type).toEqual(at)
        unmount()
      }
    })

    it('forgets a finished glide, so turning reduced motion on later never moves the camera', () => {
      let reduce = false
      const listeners = new Set<() => void>()
      window.matchMedia = vi.fn((query: string) => ({
        get matches() {
          return query.includes('prefers-reduced-motion') && reduce
        },
        media: query,
        onchange: null,
        addEventListener: (_: string, fn: () => void) => listeners.add(fn),
        removeEventListener: (_: string, fn: () => void) => listeners.delete(fn),
        addListener: () => {},
        removeListener: () => {},
        dispatchEvent: () => false,
      })) as unknown as typeof window.matchMedia
      const { rerender } = render(<StackGraph />)
      const { camera, now } = trackCamera()
      rerender(<StackGraph focus={database.id} />)
      act(() => vi.advanceTimersByTime(400))
      expect(now()).toMatchObject({ x: 0.25, y: 0.75 })
      // The reader pans away, then turns reduced motion on.
      camera.setState({ x: 0.9, y: 0.1 })
      act(() => {
        reduce = true
        for (const fn of listeners) fn()
      })
      expect(now()).toMatchObject({ x: 0.9, y: 0.1 })
    })

    it('with reduced motion the camera jumps straight to the focused tool', () => {
      reduceMotion()
      const { rerender } = render(<StackGraph />)
      const { now } = trackCamera()
      const raf = vi.spyOn(window, 'requestAnimationFrame')
      rerender(<StackGraph focus={database.id} />)
      expect(now()).toMatchObject({ x: 0.25, y: 0.75, ratio: 0.5 })
      expect(raf).not.toHaveBeenCalled()
    })

    it('lights the picks in scoring order when a result appears, all lit within 600ms', () => {
      const { rerender } = render(<StackGraph />)
      rerender(<StackGraph highlight={picks} />)
      const accent = FALLBACK_PALETTE.accent
      // At the start nothing is lit yet: every pick waits as a dimmed dot.
      expect(picks.every((id) => nodeOf(id).color !== accent)).toBe(true)
      act(() => vi.advanceTimersByTime(120))
      // How far each pick has grown from its resting dot; earlier picks are further along.
      const sizes = picks.map((id) => (nodeOf(id).size as number) - latest().graph.getNodeAttribute(id, 'size'))
      expect(sizes[0]).toBeGreaterThan(sizes.at(-1)!)
      for (let i = 1; i < sizes.length; i++) expect(sizes[i]).toBeLessThanOrEqual(sizes[i - 1])
      act(() => vi.advanceTimersByTime(480))
      expect(picks.every((id) => nodeOf(id).color === accent)).toBe(true)
      expect(picks.every((id) => nodeOf(id).forceLabel === true)).toBe(true)
      // Only colour and size move: the dimmed rest of the map is unchanged.
      expect(nodeOf(database.id).color).toBe(dimmedOf(database.layer))
    })

    it('a changed result swaps the lit picks at once, without replaying the sequence', () => {
      const { rerender } = render(<StackGraph highlight={picks} />)
      act(() => vi.advanceTimersByTime(700))
      const next = [...picks.slice(0, 4), backend.id]
      rerender(<StackGraph highlight={next} />)
      expect(nodeOf(backend.id).color).toBe(FALLBACK_PALETTE.accent)
    })

    it('a newly focused dot eases up in size and its neighbours names fade in, over the base duration', () => {
      const neighbour = backend.edges.find((e) => kb.tools.some((t) => t.id === e.target))!.target
      const { rerender } = render(<StackGraph />)
      const rest = latest().graph.getNodeAttribute(backend.id, 'size')
      rerender(<StackGraph focus={backend.id} />)
      expect(nodeOf(backend.id).size).toBe(rest)
      expect(nodeOf(neighbour).labelColor).toBe(FALLBACK_PALETTE.background)
      act(() => vi.advanceTimersByTime(116))
      const mid = nodeOf(backend.id).size as number
      expect(mid).toBeGreaterThan(rest)
      expect(nodeOf(neighbour).labelColor).not.toBe(FALLBACK_PALETTE.background)
      act(() => vi.advanceTimersByTime(200))
      expect(nodeOf(backend.id).size).toBeGreaterThan(mid)
      expect(nodeOf(neighbour).labelColor).toBe(FALLBACK_PALETTE.text)
    })

    it('with reduced motion a focused tool is lit at once', () => {
      reduceMotion()
      const { rerender } = render(<StackGraph />)
      const rest = latest().graph.getNodeAttribute(backend.id, 'size')
      rerender(<StackGraph focus={backend.id} />)
      expect(nodeOf(backend.id).size).toBeGreaterThan(rest)
    })

    it('with reduced motion every pick lights at once', () => {
      reduceMotion()
      const { rerender } = render(<StackGraph />)
      rerender(<StackGraph highlight={picks} />)
      expect(picks.every((id) => nodeOf(id).color === FALLBACK_PALETTE.accent)).toBe(true)
    })
  })

  it('kills sigma on unmount', () => {
    const { unmount } = render(<StackGraph />)
    const s = latest()
    unmount()
    expect(s.kill).toHaveBeenCalledTimes(1)
  })
})
