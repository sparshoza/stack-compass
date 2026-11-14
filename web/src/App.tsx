import { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react'
import { useLocation, useSearchParams } from 'react-router'
import { XIcon } from 'lucide-react'
import { ChooseSheet, type ChooseMode } from '@/components/choose/ChooseSheet'
import { readOpeningLink } from '@/components/choose/link'
import { useChooser } from '@/components/choose/useChooser'
import { useWebGL } from '@/components/graph/useWebGL'
import { FiltersPopover } from '@/components/map/FiltersPopover'
import { InfoDialog } from '@/components/map/InfoDialog'
import { MapBoundary } from '@/components/map/MapBoundary'
import { RouteCard } from '@/components/map/RouteCard'
import { ToolPanel } from '@/components/map/ToolPanel'
import { ToolTable } from '@/components/map/ToolTable'
import { CornerLinks } from '@/components/shell/CornerLinks'
import { FullscreenButton } from '@/components/shell/FullscreenButton'
import { TopBar } from '@/components/shell/TopBar'
import { Button } from '@/components/ui/button'
import { matchTools } from '@/engine/facets'
import { connect, type Route } from '@/engine/path'
import { scoreStack } from '@/engine/score'
import { encode, encodePiece, PIECE_KEYS, SHARE_KEYS, type Piece } from '@/engine/share'
import { kb, toolById, type EdgeType, type Layer } from '@/lib/kb'
import { useTheme } from '@/lib/theme'
import { cn } from '@/lib/utils'

// sigma and graphology load in their own chunk, after the shell has painted.
const StackGraph = lazy(() => import('@/components/graph/StackGraph').then((m) => ({ default: m.StackGraph })))

type Overlay = 'help' | 'info' | null
type View = 'map' | 'table'

const WIDE = '(min-width: 1024px)'
/** Width of the side panel plus its gap from the edge (ToolPanel: lg:w-[400px] lg:right-6). */
const SIDE_PANEL_INSET = 424
/** Width of the Help me choose sheet plus its gap from the edge (ChooseSheet: lg:w-[440px] lg:left-6). */
const CHOOSE_SHEET_INSET = 464
/** Height of the floating top bar: one row on wide screens, two rows and the hint line on phones. */
const TOP_BAR_INSET = { oneRow: 68, phone: 124 }
/** Bottom edge of the Clear stack button over the map (top-36 or md:top-[4.75rem], 44px tall on touch). */
const CLEAR_ROW_BOTTOM = { oneRow: 120, phone: 188 }
/** Height of the bottom corner links (44px pill plus its 12px inset on phones). */
const CORNER_INSET = 60
/** Width of the route card plus its gap from the edge and from the map it frames (RouteCard on wide screens: w-[360px], left-6). */
const ROUTE_CARD_INSET = 400
/** Narrowest map the floating route card may leave between itself and the panels; below it the card goes in the panel. */
const ROUTE_MAP_MIN = 480
const ROUTE_FLOATS = `(min-width: ${SIDE_PANEL_INSET + ROUTE_CARD_INSET + ROUTE_MAP_MIN}px)`
const ROUTE_FLOATS_BESIDE_HELP = `(min-width: ${CHOOSE_SHEET_INSET + SIDE_PANEL_INSET + ROUTE_CARD_INSET + ROUTE_MAP_MIN}px)`

function isTyping(target: EventTarget | null): boolean {
  return (
    target instanceof HTMLElement &&
    (target.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName))
  )
}

function useMediaQuery(query: string): boolean {
  return useSyncExternalStore(
    (onChange) => {
      if (typeof window.matchMedia !== 'function') return () => {}
      const list = window.matchMedia(query)
      list.addEventListener('change', onChange)
      return () => list.removeEventListener('change', onChange)
    },
    () => typeof window.matchMedia === 'function' && window.matchMedia(query).matches,
  )
}

function toggled<T>(set: ReadonlySet<T>, item: T): ReadonlySet<T> {
  const next = new Set(set)
  if (!next.delete(item)) next.add(item)
  return next
}

const none: ReadonlySet<never> = new Set()

/** Every key a Help me choose link writes, in both modes. */
const CHOOSE_KEYS: readonly string[] = [...SHARE_KEYS, ...PIECE_KEYS]

const NO_PIECE: Piece = { layer: null, selection: {} }

/** The Help me choose button the person can see (the bar has a wide and a narrow one). */
function helpTrigger(): HTMLElement | null {
  const buttons = [...document.querySelectorAll<HTMLElement>('[data-help-trigger]')]
  return buttons.find((b) => b.offsetParent !== null) ?? buttons[0] ?? null
}

export default function App() {
  const [theme, toggleTheme] = useTheme()
  const { search } = useLocation()
  // Read once: a share link opens the sheet straight on its stack or matches.
  const [link] = useState(() => readOpeningLink(search))
  const [overlay, setOverlay] = useState<Overlay>(link.open ? 'help' : null)
  const chooser = useChooser({ answers: link.answers, notice: link.notice })
  const [mode, setMode] = useState<ChooseMode>(link.mode)
  const [piece, setPieceState] = useState<Piece>(link.piece)
  const [pieceNotice, setPieceNotice] = useState<string | null>(link.pieceNotice)
  const setPiece = useCallback((next: Piece) => {
    setPieceState(next)
    // The note about the opening link goes once the person changes an answer.
    setPieceNotice(null)
  }, [])
  const [hiddenLayers, setHiddenLayers] = useState<ReadonlySet<Layer>>(none)
  const [hiddenEdgeTypes, setHiddenEdgeTypes] = useState<ReadonlySet<EdgeType>>(none)
  const searchRef = useRef<HTMLInputElement>(null)
  const returnFocusRef = useRef<HTMLElement | null>(null)
  const helpReturnRef = useRef<HTMLElement | null>(null)
  const skipHelpRestoreRef = useRef(false)
  const wide = useMediaQuery(WIDE)
  const oneRowBar = useMediaQuery('(min-width: 768px)')
  const roomForCard = useMediaQuery(ROUTE_FLOATS)
  const roomForCardBesideHelp = useMediaQuery(ROUTE_FLOATS_BESIDE_HELP)
  // The map needs WebGL: without it, or once the browser drops the map's
  // context, the table view takes over.
  const webglSupported = useWebGL()
  const [contextLost, setContextLost] = useState(false)
  const webgl = webglSupported && !contextLost

  // URL state: ?focus=<id> opens the tool panel, ?to=<id> shows how it
  // connects to a second tool, ?view=table shows the table. Other params (the
  // recommender's answers) are always kept.
  const [params, setParams] = useSearchParams()
  const tool = toolById(params.get('focus') ?? '')
  const toParam = toolById(params.get('to') ?? '')
  const routeTo = tool && toParam && toParam.id !== tool.id ? toParam : undefined
  const connection = useMemo(() => (tool && routeTo ? connect(tool.id, routeTo.id, kb) : null), [tool, routeTo])
  // On the map a direct alternative is drawn as its own edge beside the routes.
  const mapRoutes = useMemo((): Route[] | undefined => {
    if (!tool || !routeTo || !connection) return undefined
    if (!connection.alternatives) return connection.routes
    const step = { from: tool.id, to: routeTo.id, type: 'alternative-to' as const, text: '' }
    return [{ nodes: [tool.id, routeTo.id], steps: [step] }, ...connection.routes]
  }, [tool, routeTo, connection])
  const view: View = !webgl || params.get('view') === 'table' ? 'table' : 'map'

  const updateParams = useCallback(
    (change: (next: URLSearchParams) => void, options?: { replace?: boolean }) =>
      setParams((prev) => {
        const next = new URLSearchParams(prev)
        change(next)
        return next
      }, options),
    [setParams],
  )

  const openTool = useCallback(
    (id: string, opts?: { add: boolean }) => {
      const target = toolById(id)
      if (!target) return
      // Ctrl or Cmd with a click: a route from the open tool to this one,
      // replacing any earlier second tool.
      if (opts?.add && tool) {
        if (id === tool.id) return
        setHiddenLayers((hidden) => (hidden.has(target.layer) ? toggled(hidden, target.layer) : hidden))
        updateParams((next) => next.set('to', id))
        return
      }
      // Remember where focus was when the panel first opens, to return it on close.
      if (!tool && document.activeElement instanceof HTMLElement && document.activeElement !== document.body) {
        returnFocusRef.current = document.activeElement
      }
      // A focused tool is always drawn: its layer comes back if it was hidden.
      setHiddenLayers((hidden) => (hidden.has(target.layer) ? toggled(hidden, target.layer) : hidden))
      updateParams((next) => {
        next.set('focus', id)
        next.delete('to')
      })
    },
    [tool, updateParams],
  )

  const closeTool = useCallback(
    () =>
      updateParams((next) => {
        next.delete('focus')
        next.delete('to')
      }),
    [updateParams],
  )

  const findRoute = useCallback((id: string) => openTool(id, { add: true }), [openTool])
  const clearRoute = useCallback(() => updateParams((next) => next.delete('to')), [updateParams])

  // A click on empty map clears the focus and any route; with nothing open it
  // leaves the history alone.
  const hasFocusParams = params.has('focus') || params.has('to')
  const clearMap = useCallback(() => {
    if (hasFocusParams) closeTool()
  }, [hasFocusParams, closeTool])

  const restoreFocus = useCallback(() => {
    const target = returnFocusRef.current
    returnFocusRef.current = null
    if (target?.isConnected) target.focus()
    else document.getElementById('map')?.focus()
  }, [])

  const setView = useCallback(
    (next: View) =>
      updateParams((p) => {
        if (next === 'table') p.set('view', 'table')
        else p.delete('view')
      }),
    [updateParams],
  )

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== '/' || e.ctrlKey || e.metaKey || e.altKey || isTyping(e.target)) return
      e.preventDefault()
      searchRef.current?.focus()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  const setOpen = (which: Exclude<Overlay, null>) => (open: boolean) => setOverlay(open ? which : null)

  // Whole stack: the stack is recomputed from the answers on every change,
  // once a project type is chosen. One piece: the chosen part's tools that
  // fit the answers. Only the open mode lights the map and fills the URL.
  const { answers } = chooser
  const results = useMemo(
    () => (mode === 'stack' && answers.projectType ? scoreStack(answers, kb) : []),
    [mode, answers],
  )
  const picks = useMemo(() => results.flatMap((r) => (r.pick ? [r.pick] : [])), [results])
  const matches = useMemo(
    () => (mode === 'piece' && piece.layer ? matchTools(piece.layer, piece.selection, kb) : []),
    [mode, piece],
  )
  const lit = useMemo(() => (mode === 'piece' ? matches.map((t) => t.id) : picks), [mode, matches, picks])

  // The URL carries the open mode's answers (never the description), so a
  // reload or a copied address brings the same stack or matches back.
  const shared = mode === 'piece' ? encodePiece(piece) : answers.projectType ? encode(answers) : ''
  const current = CHOOSE_KEYS.flatMap((key) => (params.has(key) ? [`${key}=${params.get(key)}`] : [])).sort().join('&')
  const wanted = [...new URLSearchParams(shared)].map(([key, value]) => `${key}=${value}`).sort().join('&')
  useEffect(() => {
    if (current === wanted) return
    updateParams(
      (next) => {
        for (const key of CHOOSE_KEYS) next.delete(key)
        for (const [key, value] of new URLSearchParams(shared)) next.set(key, value)
      },
      { replace: true },
    )
  }, [current, wanted, shared, updateParams])

  const openHelp = () => {
    const active = document.activeElement
    helpReturnRef.current = active instanceof HTMLElement && active !== document.body ? active : null
    setOverlay('help')
  }

  const restoreHelpFocus = () => {
    if (skipHelpRestoreRef.current) {
      skipHelpRestoreRef.current = false
      return
    }
    const target = helpReturnRef.current
    helpReturnRef.current = null
    if (target?.isConnected) target.focus()
    else helpTrigger()?.focus()
  }

  const startOver = () => {
    if (mode === 'piece') setPiece(NO_PIECE)
    else chooser.reset()
  }

  const shareUrl = () => {
    const url = new URL(window.location.href)
    url.search = shared
    url.hash = ''
    return url.toString()
  }

  // On a phone the sheet covers the map, so focusing a tool closes it first;
  // the result stays and comes back with the sheet.
  const focusFromSheet = (id: string) => {
    if (!wide) {
      skipHelpRestoreRef.current = true
      setOverlay(null)
    }
    openTool(id)
    if (!wide) returnFocusRef.current = helpTrigger()
  }

  const helpOpen = overlay === 'help'
  // A skip left over from a close that kept focus elsewhere never carries
  // into the next time the sheet opens.
  useEffect(() => {
    if (helpOpen) skipHelpRestoreRef.current = false
  }, [helpOpen])

  // Keep the focused tool clear of the bar and the open panels.
  const focusInset = tool
    ? wide
      ? { top: TOP_BAR_INSET.oneRow, right: SIDE_PANEL_INSET, bottom: 0, left: helpOpen ? CHOOSE_SHEET_INSET : 0 }
      : {
          top: oneRowBar ? TOP_BAR_INSET.oneRow : TOP_BAR_INSET.phone,
          right: 0,
          bottom: Math.round(window.innerHeight * 0.6),
        }
    : undefined

  // How the two tools connect: a card floating over the map when the map
  // keeps room beside it; otherwise (phones, or Help me choose open on a
  // narrower screen) the card opens the tool panel.
  const routeFloats = wide && (helpOpen ? roomForCardBesideHelp : roomForCard)

  // A route is framed in the map area the card, the panel and the bars leave free.
  const routeInset = wide
    ? {
        top: TOP_BAR_INSET.oneRow,
        right: SIDE_PANEL_INSET,
        bottom: CORNER_INSET,
        left: (helpOpen ? CHOOSE_SHEET_INSET : 0) + (routeFloats ? ROUTE_CARD_INSET : 0),
      }
    : {
        top: oneRowBar ? TOP_BAR_INSET.oneRow : TOP_BAR_INSET.phone,
        right: 0,
        bottom: Math.round(window.innerHeight * 0.6),
        left: 0,
      }

  const routeCard =
    tool && routeTo && connection ? (
      <RouteCard
        from={tool}
        to={routeTo}
        connection={connection}
        onClose={clearRoute}
        placement={routeFloats ? 'float' : 'inline'}
        className={routeFloats ? 'w-[360px]' : undefined}
      />
    ) : null

  // New lit tools are framed in the map area the sheet and the bars leave
  // free, below the Clear button when it shows over the map.
  const clearShows = lit.length > 0 && !helpOpen
  const barInset = oneRowBar ? TOP_BAR_INSET.oneRow : TOP_BAR_INSET.phone
  const highlightTop = clearShows ? (oneRowBar ? CLEAR_ROW_BOTTOM.oneRow : CLEAR_ROW_BOTTOM.phone) : barInset
  const highlightInset = wide
    ? {
        top: clearShows ? CLEAR_ROW_BOTTOM.oneRow : TOP_BAR_INSET.oneRow,
        right: tool ? SIDE_PANEL_INSET : 0,
        bottom: CORNER_INSET,
        left: helpOpen ? CHOOSE_SHEET_INSET : 0,
      }
    : { top: highlightTop, right: 0, bottom: CORNER_INSET, left: 0 }

  return (
    <>
      <a
        href="#map"
        className="sr-only focus:not-sr-only focus:fixed focus:top-3 focus:left-4 focus:z-50 focus:rounded-full focus:bg-surface focus:px-4 focus:py-2 focus:text-text"
      >
        {view === 'map' ? 'Skip to the map' : 'Skip to the table'}
      </a>

      <TopBar
        toolCount={kb.tools.length}
        view={view}
        theme={theme}
        onToggleTheme={toggleTheme}
        helpOpen={helpOpen}
        onHelp={openHelp}
        onInfo={() => setOverlay('info')}
        onPickTool={openTool}
        searchRef={searchRef}
        filters={
          <FiltersPopover
            view={view}
            canShowMap={webgl}
            hiddenLayers={hiddenLayers}
            hiddenEdgeTypes={hiddenEdgeTypes}
            onToggleLayer={(layer) => setHiddenLayers((hidden) => toggled(hidden, layer))}
            onToggleEdgeType={(type) => setHiddenEdgeTypes((hidden) => toggled(hidden, type))}
            onShowAll={() => {
              setHiddenLayers(none)
              setHiddenEdgeTypes(none)
            }}
            onViewChange={setView}
          />
        }
      />

      {view === 'map' ? (
        <>
          <main id="map" tabIndex={-1} aria-label="Tool map" className="fixed inset-0 bg-background outline-none">
            <p className="sr-only">
              Map of {kb.tools.length} tools across {kb.layers.length} layers. Search reaches any tool, and the table
              view in Filters lists them all.
            </p>
            <MapBoundary onUseTable={() => setView('table')}>
              <Suspense
                fallback={
                  <p className="absolute inset-0 grid place-content-center text-text-muted">Loading the map</p>
                }
              >
                <StackGraph
                  highlight={lit}
                  highlightInset={highlightInset}
                  focus={tool?.id}
                  hiddenLayers={hiddenLayers}
                  hiddenEdgeTypes={hiddenEdgeTypes}
                  onSelect={openTool}
                  onClear={clearMap}
                  routes={mapRoutes}
                  routeInset={routeInset}
                  focusInset={focusInset}
                  frameInset={{ top: oneRowBar ? TOP_BAR_INSET.oneRow : TOP_BAR_INSET.phone, bottom: CORNER_INSET }}
                  onContextLost={() => setContextLost(true)}
                />
              </Suspense>
            </MapBoundary>
            <FullscreenButton />
            {/* Top left, under the bar: Clear stack, then the route card (wide screens). Beside an open Help me choose sheet. */}
            <div
              className={cn(
                'pointer-events-none absolute top-36 left-4 flex flex-col items-start gap-2 md:top-[4.75rem] md:left-6 lg:bottom-[4.5rem]',
                helpOpen && 'lg:left-[30rem]',
              )}
            >
              {lit.length > 0 && !helpOpen && (
                <Button
                  variant="pill"
                  size="pill"
                  className="pointer-events-auto"
                  onClick={() => {
                    startOver()
                    // The button goes away with the lit tools, so focus lands on the map it sat on.
                    document.getElementById('map')?.focus()
                  }}
                >
                  <XIcon aria-hidden="true" />
                  {mode === 'piece' ? 'Clear matches' : 'Clear stack'}
                </Button>
              )}
              {routeFloats && routeCard}
            </div>
          </main>
          <CornerLinks />
        </>
      ) : (
        <main
          id="map"
          tabIndex={-1}
          aria-label="Tool table"
          className="fixed inset-0 overflow-y-auto bg-background outline-none"
        >
          <ToolTable
            onOpen={openTool}
            onBackToMap={webgl ? () => setView('map') : undefined}
            footer={<CornerLinks docked />}
          />
        </main>
      )}

      <ToolPanel
        tool={tool}
        onClose={closeTool}
        onFocusTool={openTool}
        onFindRoute={view === 'map' ? findRoute : undefined}
        route={view === 'map' && !routeFloats ? routeCard : null}
        onRestoreFocus={restoreFocus}
      />
      <ChooseSheet
        open={helpOpen}
        onOpenChange={setOpen('help')}
        mode={mode}
        onModeChange={setMode}
        chooser={chooser}
        results={results}
        piece={piece}
        onPieceChange={setPiece}
        matches={matches}
        pieceNotice={pieceNotice}
        onStartOver={startOver}
        onFocusTool={focusFromSheet}
        focusedTool={tool?.id}
        onRestoreFocus={restoreHelpFocus}
        shareUrl={shareUrl}
        litOnMap={view === 'map'}
        onSeeMap={!wide && view === 'map' ? () => setOverlay(null) : undefined}
        modal={!wide}
      />
      <InfoDialog open={overlay === 'info'} onOpenChange={setOpen('info')} />
    </>
  )
}
