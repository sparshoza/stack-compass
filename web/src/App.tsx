import { lazy, Suspense, useCallback, useEffect, useRef, useState, useSyncExternalStore } from 'react'
import { useSearchParams } from 'react-router'
import { useWebGL } from '@/components/graph/useWebGL'
import { FiltersPopover } from '@/components/map/FiltersPopover'
import { InfoDialog } from '@/components/map/InfoDialog'
import { MapBoundary } from '@/components/map/MapBoundary'
import { ToolPanel } from '@/components/map/ToolPanel'
import { ToolTable } from '@/components/map/ToolTable'
import { CornerLinks } from '@/components/shell/CornerLinks'
import { FullscreenButton } from '@/components/shell/FullscreenButton'
import { HelpSheet } from '@/components/shell/HelpSheet'
import { TopBar } from '@/components/shell/TopBar'
import { kb, toolById, type EdgeType, type Layer } from '@/lib/kb'
import { useTheme } from '@/lib/theme'

// sigma and graphology load in their own chunk, after the shell has painted.
const StackGraph = lazy(() => import('@/components/graph/StackGraph').then((m) => ({ default: m.StackGraph })))

type Overlay = 'help' | 'info' | null
type View = 'map' | 'table'

const WIDE = '(min-width: 1024px)'
/** Width of the side panel plus its gap from the edge (ToolPanel: lg:w-[400px] lg:right-6). */
const SIDE_PANEL_INSET = 424
/** Height of the floating top bar: one row on wide screens, two rows and the hint line on phones. */
const TOP_BAR_INSET = { oneRow: 68, phone: 124 }
/** Height of the bottom corner links (44px pill plus its 12px inset on phones). */
const CORNER_INSET = 60

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

export default function App() {
  const [theme, toggleTheme] = useTheme()
  const [overlay, setOverlay] = useState<Overlay>(null)
  const [hiddenLayers, setHiddenLayers] = useState<ReadonlySet<Layer>>(none)
  const [hiddenEdgeTypes, setHiddenEdgeTypes] = useState<ReadonlySet<EdgeType>>(none)
  const searchRef = useRef<HTMLInputElement>(null)
  const returnFocusRef = useRef<HTMLElement | null>(null)
  const wide = useMediaQuery(WIDE)
  const oneRowBar = useMediaQuery('(min-width: 768px)')
  const webgl = useWebGL()

  // URL state: ?focus=<id> opens the tool panel, ?view=table shows the table.
  // Other params (the recommender's answers) are always kept.
  const [params, setParams] = useSearchParams()
  const tool = toolById(params.get('focus') ?? '')
  const view: View = !webgl || params.get('view') === 'table' ? 'table' : 'map'

  const updateParams = useCallback(
    (change: (next: URLSearchParams) => void) =>
      setParams((prev) => {
        const next = new URLSearchParams(prev)
        change(next)
        return next
      }),
    [setParams],
  )

  const openTool = useCallback(
    (id: string) => {
      const target = toolById(id)
      if (!target) return
      // Remember where focus was when the panel first opens, to return it on close.
      if (!tool && document.activeElement instanceof HTMLElement && document.activeElement !== document.body) {
        returnFocusRef.current = document.activeElement
      }
      // A focused tool is always drawn: its layer comes back if it was hidden.
      setHiddenLayers((hidden) => (hidden.has(target.layer) ? toggled(hidden, target.layer) : hidden))
      updateParams((next) => next.set('focus', id))
    },
    [tool, updateParams],
  )

  const closeTool = useCallback(() => updateParams((next) => next.delete('focus')), [updateParams])

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

  // Keep the focused tool clear of the bar and the open panel.
  const focusInset = tool
    ? wide
      ? { top: TOP_BAR_INSET.oneRow, right: SIDE_PANEL_INSET, bottom: 0 }
      : {
          top: oneRowBar ? TOP_BAR_INSET.oneRow : TOP_BAR_INSET.phone,
          right: 0,
          bottom: Math.round(window.innerHeight * 0.6),
        }
    : undefined

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
        onHelp={() => setOverlay('help')}
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
                  focus={tool?.id}
                  hiddenLayers={hiddenLayers}
                  hiddenEdgeTypes={hiddenEdgeTypes}
                  onSelect={openTool}
                  focusInset={focusInset}
                  frameInset={{ top: oneRowBar ? TOP_BAR_INSET.oneRow : TOP_BAR_INSET.phone, bottom: CORNER_INSET }}
                />
              </Suspense>
            </MapBoundary>
            <FullscreenButton />
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

      <ToolPanel tool={tool} onClose={closeTool} onFocusTool={openTool} onRestoreFocus={restoreFocus} />
      <HelpSheet open={overlay === 'help'} onOpenChange={setOpen('help')} />
      <InfoDialog open={overlay === 'info'} onOpenChange={setOpen('info')} />
    </>
  )
}
