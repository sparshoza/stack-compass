import { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react'
import { useLocation, useSearchParams } from 'react-router'
import { XIcon } from 'lucide-react'
import { ChooseSheet } from '@/components/choose/ChooseSheet'
import { useChooser, type ChooseView } from '@/components/choose/useChooser'
import { useWebGL } from '@/components/graph/useWebGL'
import { FiltersPopover } from '@/components/map/FiltersPopover'
import { InfoDialog } from '@/components/map/InfoDialog'
import { MapBoundary } from '@/components/map/MapBoundary'
import { ToolPanel } from '@/components/map/ToolPanel'
import { ToolTable } from '@/components/map/ToolTable'
import { CornerLinks } from '@/components/shell/CornerLinks'
import { FullscreenButton } from '@/components/shell/FullscreenButton'
import { TopBar } from '@/components/shell/TopBar'
import { Button } from '@/components/ui/button'
import { defaultAnswers, type Answers } from '@/engine/answers'
import { scoreStack } from '@/engine/score'
import { decode, encode, SHARE_KEYS } from '@/engine/share'
import { kb, toolById, type EdgeType, type Layer } from '@/lib/kb'
import { useTheme } from '@/lib/theme'

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

/**
 * A share link the page was opened with (`?t=...`): its answers, whether
 * they make a stack, and a note about anything that could not be used.
 */
function readShareLink(search: string): { answers: Answers; view: ChooseView; notice: string | null } | null {
  const query = search.startsWith('?') ? search.slice(1) : search
  if (!new URLSearchParams(query).has('t')) return null
  const { answers, ignored, tooLong } = decode(query, kb)
  const notice = tooLong
    ? 'This link is too long to read, so its answers were not used. Answer the questions to build a stack.'
    : ignored.length
      ? `Some parts of this link were ignored: ${ignored.join(', ')}.`
      : null
  return { answers, view: answers.projectType ? 'result' : 'questions', notice }
}

/** The Help me choose button the person can see (the bar has a wide and a narrow one). */
function helpTrigger(): HTMLElement | null {
  const buttons = [...document.querySelectorAll<HTMLElement>('[data-help-trigger]')]
  return buttons.find((b) => b.offsetParent !== null) ?? buttons[0] ?? null
}

export default function App() {
  const [theme, toggleTheme] = useTheme()
  const { search } = useLocation()
  // Read once: a share link opens the sheet straight on its result.
  const [shareLink] = useState(() => readShareLink(search))
  const [overlay, setOverlay] = useState<Overlay>(shareLink ? 'help' : null)
  const chooser = useChooser(shareLink ?? { answers: defaultAnswers(), view: 'questions', notice: null })
  const [hiddenLayers, setHiddenLayers] = useState<ReadonlySet<Layer>>(none)
  const [hiddenEdgeTypes, setHiddenEdgeTypes] = useState<ReadonlySet<EdgeType>>(none)
  const searchRef = useRef<HTMLInputElement>(null)
  const returnFocusRef = useRef<HTMLElement | null>(null)
  const helpReturnRef = useRef<HTMLElement | null>(null)
  const skipHelpRestoreRef = useRef(false)
  const wide = useMediaQuery(WIDE)
  const oneRowBar = useMediaQuery('(min-width: 768px)')
  // The map needs WebGL: without it, or once the browser drops the map's
  // context, the table view takes over.
  const webglSupported = useWebGL()
  const [contextLost, setContextLost] = useState(false)
  const webgl = webglSupported && !contextLost

  // URL state: ?focus=<id> opens the tool panel, ?view=table shows the table.
  // Other params (the recommender's answers) are always kept.
  const [params, setParams] = useSearchParams()
  const tool = toolById(params.get('focus') ?? '')
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

  // The recommender. The result is recomputed from the answers on every
  // change, and while it shows, the URL carries the answers (never the text).
  const { view: chooseView, answers } = chooser
  const results = useMemo(
    () => (chooseView === 'result' && answers.projectType ? scoreStack(answers, kb) : []),
    [chooseView, answers],
  )
  const picks = useMemo(() => results.flatMap((r) => (r.pick ? [r.pick] : [])), [results])

  // Without a result shown (Edit answers, Clear stack), the link carries no
  // stack, so a reload never brings back a stale one.
  const hasShareKeys = SHARE_KEYS.some((key) => params.has(key))
  useEffect(() => {
    if (chooseView === 'result' || !hasShareKeys) return
    updateParams(
      (next) => {
        for (const key of SHARE_KEYS) next.delete(key)
      },
      { replace: true },
    )
  }, [chooseView, hasShareKeys, updateParams])

  useEffect(() => {
    if (chooseView !== 'result' || !answers.projectType) return
    const shared = new URLSearchParams(encode(answers))
    updateParams(
      (next) => {
        for (const key of SHARE_KEYS) next.delete(key)
        for (const [key, value] of shared) next.set(key, value)
      },
      { replace: true },
    )
  }, [chooseView, answers, updateParams])

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
    chooser.reset()
    updateParams((next) => {
      for (const key of SHARE_KEYS) next.delete(key)
    })
  }

  const shareUrl = () => {
    const url = new URL(window.location.href)
    url.search = encode(answers)
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

  // A new stack is framed in the map area the sheet and the bars leave free.
  const highlightInset = wide
    ? {
        top: TOP_BAR_INSET.oneRow,
        right: tool ? SIDE_PANEL_INSET : 0,
        bottom: CORNER_INSET,
        left: helpOpen ? CHOOSE_SHEET_INSET : 0,
      }
    : { top: oneRowBar ? TOP_BAR_INSET.oneRow : TOP_BAR_INSET.phone, right: 0, bottom: CORNER_INSET, left: 0 }

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
                  highlight={picks}
                  highlightInset={highlightInset}
                  focus={tool?.id}
                  hiddenLayers={hiddenLayers}
                  hiddenEdgeTypes={hiddenEdgeTypes}
                  onSelect={openTool}
                  focusInset={focusInset}
                  frameInset={{ top: oneRowBar ? TOP_BAR_INSET.oneRow : TOP_BAR_INSET.phone, bottom: CORNER_INSET }}
                  onContextLost={() => setContextLost(true)}
                />
              </Suspense>
            </MapBoundary>
            <FullscreenButton />
            {picks.length > 0 && !helpOpen && (
              <Button
                variant="pill"
                size="pill"
                className="absolute top-36 left-4 md:top-[4.75rem] md:left-6"
                onClick={() => {
                  chooser.setView('questions')
                  // The button goes away with the stack, so focus lands on the map it sat on.
                  document.getElementById('map')?.focus()
                }}
              >
                <XIcon aria-hidden="true" />
                Clear stack
              </Button>
            )}
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
      <ChooseSheet
        open={helpOpen}
        onOpenChange={setOpen('help')}
        chooser={chooser}
        results={results}
        onShowStack={() => chooser.setView('result')}
        onStartOver={startOver}
        onFocusTool={focusFromSheet}
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
