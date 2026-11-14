import { useEffect, useId, useRef, useState, type ReactNode } from 'react'
import { ArrowDownIcon, InfoIcon, XIcon } from 'lucide-react'
import { Dialog as DialogPrimitive, Tabs } from 'radix-ui'
import { Button } from '@/components/ui/button'
import type { LayerResult } from '@/engine/score'
import type { Piece } from '@/engine/share'
import type { Layer, Tool } from '@/lib/kb'
import { useReturnFocusOnClose } from '@/lib/useReturnFocusOnClose'
import { cn } from '@/lib/utils'
import { DetectedChips } from './DetectedChips'
import { Describe } from './Describe'
import { OnePiece } from './OnePiece'
import { Questions } from './Questions'
import { StackList } from './StackList'
import type { Chooser } from './useChooser'
import { escapeClearsField } from '@/lib/escape'

export type ChooseMode = 'stack' | 'piece'

interface ChooseSheetProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  mode: ChooseMode
  onModeChange: (mode: ChooseMode) => void
  /** Whole stack: the description, answers and the live stack. */
  chooser: Chooser
  results: LayerResult[]
  /** One piece: the chosen part and answers, and the tools that fit. */
  piece: Piece
  onPieceChange: (piece: Piece) => void
  matches: Tool[]
  /** A note about a One piece link that could not be read in full. */
  pieceNotice: string | null
  onStartOver: () => void
  onFocusTool: (id: string) => void
  /** The tool open on the map. */
  focusedTool?: string
  /** Called once the sheet has closed, to put keyboard focus back. */
  onRestoreFocus: () => void
  /** The link that reopens what the sheet shows now. */
  shareUrl: () => string
  litOnMap: boolean
  /** Where the sheet covers the map: closes it so the lit tools show. */
  onSeeMap?: () => void
  /**
   * True below 1024 px, where the sheet covers the whole screen: focus stays
   * in it and the hidden page behind is out of reach for keyboard and screen
   * readers. From 1024 px it sits beside the map and is not modal.
   */
  modal: boolean
}

/** The link in a field, selected once when it appears, for copying by hand. */
function CopyFallback({ id, url }: { id: string; url: string }) {
  const ref = useRef<HTMLInputElement>(null)
  useEffect(() => ref.current?.select(), [])
  return (
    <div className="grid gap-1.5">
      <label htmlFor={id} className="text-xs text-text-muted">
        Copying is blocked here. Select the link and copy it:
      </label>
      <input
        ref={ref}
        id={id}
        readOnly
        value={url}
        onFocus={(e) => e.currentTarget.select()}
        className="h-9 w-full rounded-[var(--radius-sm)] border border-line-field bg-background px-3 text-xs text-text touch:h-11"
      />
    </div>
  )
}

type Target = 'tab' | 'text' | 'picker' | 'question' | 'stack' | 'count'
type CopyState = 'idle' | 'copied' | 'manual'

/** Inverted fill: the one primary action in each view. */
const primary = 'border-text bg-text text-background hover:border-text hover:bg-text/85 active:bg-text/85'

const TABS: { value: ChooseMode; label: string }[] = [
  { value: 'stack', label: 'Whole stack' },
  { value: 'piece', label: 'One piece' },
]

function Notice({ children }: { children: ReactNode }) {
  return (
    <p role="status" className="flex gap-2.5 rounded-[var(--radius-sm)] bg-raised px-3 py-2.5 text-xs leading-[1.5] text-text">
      <InfoIcon aria-hidden="true" className="mt-px size-3.5 shrink-0 text-text-muted" />
      <span>{children}</span>
    </p>
  )
}

/**
 * Help me choose, in two modes. Whole stack: plain questions with the
 * stack under them, updated on every answer. One piece: pick a part, answer
 * its questions, see the tools that fit. On the left from 1024px, not
 * modal, so the lit tools and a tool's panel stay usable on the map; full
 * height and modal below.
 */
export function ChooseSheet({
  open,
  onOpenChange,
  mode,
  onModeChange,
  chooser,
  results,
  piece,
  onPieceChange,
  matches,
  pieceNotice,
  onStartOver,
  onFocusTool,
  focusedTool,
  onRestoreFocus,
  shareUrl,
  litOnMap,
  onSeeMap,
  modal,
}: ChooseSheetProps) {
  const id = useId()
  const tabRefs = useRef<Partial<Record<ChooseMode, HTMLButtonElement | null>>>({})
  // The stack and match count headings, kept as state so the in-view watch follows them as they mount.
  const [stackEl, setStackEl] = useState<HTMLHeadingElement | null>(null)
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const typeRef = useRef<HTMLInputElement>(null)
  const pickerRef = useRef<HTMLUListElement>(null)
  const questionRef = useRef<HTMLHeadingElement>(null)
  const [countEl, setCountEl] = useState<HTMLHeadingElement | null>(null)
  const scrollRef = useRef<HTMLDivElement>(null)
  const contentRef = useRef<HTMLDivElement>(null)
  const focusNext = useRef<{ target: Target; scroll: boolean } | null>(null)
  const [copied, setCopied] = useState<{ state: CopyState; url: string; key: unknown } | null>(null)
  const onCloseAutoFocus = useReturnFocusOnClose(open, onRestoreFocus, contentRef)

  const { answers } = chooser
  const hasStack = Boolean(answers.projectType)
  const hasPiece = piece.layer !== null

  const focusTarget = (target: Target) => {
    const el: HTMLElement | null | undefined = {
      tab: tabRefs.current[mode],
      text: textareaRef.current,
      picker: pickerRef.current?.querySelector('button'),
      question: questionRef.current,
      stack: stackEl,
      count: countEl,
    }[target]
    el?.focus({ preventScroll: target === 'stack' || target === 'count' })
    if (target === 'stack' || target === 'count') el?.scrollIntoView?.({ block: 'start' })
  }

  // Focus moves after the view has rendered.
  useEffect(() => {
    const next = focusNext.current
    if (!next) return
    focusNext.current = null
    if (next.scroll) scrollRef.current?.scrollTo?.({ top: 0 })
    focusTarget(next.target)
  })

  const go = (target: Target, action?: () => void, scroll = true) => {
    focusNext.current = { target, scroll }
    if (action) action()
    else focusTarget(target)
  }

  // A copied link goes stale once anything it carries changes.
  const shareKey = mode === 'piece' ? piece : answers
  const copy = copied && copied.key === shareKey ? copied : { state: 'idle' as CopyState, url: '' }

  const copyLink = async () => {
    const url = shareUrl()
    try {
      if (!navigator.clipboard?.writeText) throw new Error('no clipboard')
      await navigator.clipboard.writeText(url)
      setCopied({ state: 'copied', url, key: shareKey })
    } catch {
      setCopied({ state: 'manual', url, key: shareKey })
    }
  }

  const ready = mode === 'piece' ? hasPiece : hasStack
  const jumpLabel =
    mode === 'piece'
      ? `See ${matches.length} ${matches.length === 1 ? 'match' : 'matches'}`
      : `Your stack (${results.filter((r) => r.pick).length})`

  // The footer jump goes once the stack or the match count is in view. The
  // answer is kept per element, so a heading that went away never counts.
  const jumpTarget = mode === 'piece' ? countEl : stackEl
  const [inView, setInView] = useState<{ el: Element; visible: boolean } | null>(null)
  const resultInView = inView !== null && inView.el === jumpTarget && inView.visible
  useEffect(() => {
    if (!jumpTarget || typeof IntersectionObserver === 'undefined') return
    const observer = new IntersectionObserver(
      ([entry]) => setInView({ el: jumpTarget, visible: entry?.isIntersecting ?? false }),
      { root: scrollRef.current },
    )
    observer.observe(jumpTarget)
    return () => observer.disconnect()
  }, [jumpTarget])

  return (
    <DialogPrimitive.Root open={open} onOpenChange={onOpenChange} modal={modal}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Content
          ref={contentRef}
          aria-describedby={`${id}-about`}
          onOpenAutoFocus={(e) => {
            e.preventDefault()
            // No ring on opening: the ring is for keyboard moves the person makes.
            tabRefs.current[mode]?.focus({ focusVisible: false } as FocusOptions)
          }}
          // Focus goes back as the sheet starts to close (useReturnFocusOnClose).
          onCloseAutoFocus={onCloseAutoFocus}
          // The map and the tool panel stay usable beside the sheet.
          onInteractOutside={(e) => e.preventDefault()}
          // Escape in a field with text clears the field first (tools search does).
          onEscapeKeyDown={(e) => {
            if (escapeClearsField(e.target)) e.preventDefault()
          }}
          className={cn(
            'motion-sheet-start fixed inset-0 z-40 flex flex-col bg-surface text-[0.8125rem] text-text outline-none',
            'lg:inset-auto lg:top-[4.5rem] lg:bottom-[4.5rem] lg:left-6 lg:z-20 lg:w-[440px] lg:rounded-[var(--radius-panel)] lg:border lg:border-line lg:shadow-(--shadow-float)',
          )}
        >
          <Tabs.Root
            value={mode}
            onValueChange={(value) => {
              setCopied(null)
              onModeChange(value as ChooseMode)
              scrollRef.current?.scrollTo?.({ top: 0 })
            }}
            className="flex min-h-0 flex-1 flex-col"
          >
            <div className="grid gap-3.5 border-b border-line px-5 pt-4 pb-3.5 lg:px-6 lg:pt-5">
              <div className="flex items-start gap-3">
                <div className="grid min-w-0 flex-1 gap-1">
                  <DialogPrimitive.Title className="text-[1rem] leading-tight font-semibold">Help me choose</DialogPrimitive.Title>
                  <DialogPrimitive.Description
                    id={`${id}-about`}
                    // Steps aside once there is an answer to show, and on phones always; screen readers still get it.
                    className={cn('text-xs leading-[1.5] text-text-muted max-sm:sr-only', ready && 'sr-only')}
                  >
                    Get a whole stack for your project, or find one piece, such as a database.
                  </DialogPrimitive.Description>
                </div>
                <DialogPrimitive.Close asChild>
                  <Button variant="quiet" size="icon-pill" className="-mt-1 -mr-2 shrink-0 touch:size-11">
                    <XIcon aria-hidden="true" />
                    <span className="sr-only">Close</span>
                  </Button>
                </DialogPrimitive.Close>
              </div>
              <Tabs.List
                aria-label="What do you need?"
                className="grid grid-cols-2 rounded-full border border-line-control p-0.5"
              >
                {TABS.map((tab) => (
                  <Tabs.Trigger
                    key={tab.value}
                    ref={(el) => {
                      tabRefs.current[tab.value] = el
                    }}
                    value={tab.value}
                    className={cn(
                      'motion-colors flex h-8 items-center justify-center rounded-full px-3 text-xs touch:h-11',
                      'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-highlight',
                      'data-[state=active]:bg-text data-[state=active]:text-background',
                      'data-[state=inactive]:text-text-muted data-[state=inactive]:hover:bg-raised data-[state=inactive]:hover:text-text',
                    )}
                  >
                    {tab.label}
                  </Tabs.Trigger>
                ))}
              </Tabs.List>
            </div>

            <div ref={scrollRef} className="min-h-0 flex-1 overflow-y-auto px-5 py-5 lg:px-6">
              <Tabs.Content value="stack" className="grid content-start gap-6 outline-none">
                {chooser.notice && <Notice>{chooser.notice}</Notice>}
                <Questions
                  answers={answers}
                  onChange={chooser.setAnswers}
                  typeRef={typeRef}
                  describe={
                    <div className="border-y border-line py-6">
                      <Describe
                        text={chooser.text}
                        onTextChange={chooser.setText}
                        onRead={chooser.detectNow}
                        textareaRef={textareaRef}
                        detected={
                          <DetectedChips chips={chooser.chips} nothingFound={chooser.nothingFound} onRemove={chooser.removeChip} />
                        }
                      />
                    </div>
                  }
                />
                {hasStack && (
                  <div className="border-t border-line pt-6">
                    <StackList
                      results={results}
                      answers={answers}
                      headingRef={setStackEl}
                      litOnMap={litOnMap}
                      onSeeMap={onSeeMap}
                      onFocusTool={onFocusTool}
                    />
                  </div>
                )}
              </Tabs.Content>

              <Tabs.Content value="piece" className="grid content-start gap-6 outline-none">
                {pieceNotice && <Notice>{pieceNotice}</Notice>}
                <OnePiece
                  piece={piece}
                  onChange={onPieceChange}
                  matches={matches}
                  focusedTool={focusedTool}
                  onFocusTool={onFocusTool}
                  onPickLayer={(layer: Layer) => go('question', () => onPieceChange({ layer, selection: {} }))}
                  onChangePart={() => go('picker', () => onPieceChange({ layer: null, selection: {} }))}
                  questionRef={questionRef}
                  pickerRef={pickerRef}
                  countRef={setCountEl}
                  onSeeMap={onSeeMap}
                  onStartOver={() => go('picker', onStartOver)}
                />
              </Tabs.Content>
            </div>

            <div className="grid gap-2 border-t border-line bg-surface px-5 py-3.5 lg:rounded-b-[var(--radius-panel)] lg:px-6">
              {ready ? (
                <div className="flex flex-wrap items-center gap-1.5">
                  {!resultInView && (
                    <Button
                      variant="pill"
                      size="pill"
                      className="touch:h-11 max-sm:w-full max-sm:justify-start"
                      onClick={() => go(mode === 'piece' ? 'count' : 'stack', undefined, false)}
                    >
                      {jumpLabel}
                      <ArrowDownIcon aria-hidden="true" className="max-sm:ml-auto" />
                    </Button>
                  )}
                  <Button variant="pill" size="pill" className={cn(primary, 'touch:h-11 max-sm:px-3')} onClick={copyLink}>
                    Copy link
                  </Button>
                  {/* One piece has Start over beside its match count. */}
                  {mode === 'stack' && (
                    <Button
                      variant="quiet"
                      size="pill"
                      className="ml-auto -mr-2 px-2 touch:h-11"
                      onClick={() => go('text', onStartOver)}
                    >
                      Start over
                    </Button>
                  )}
                </div>
              ) : (
                <p className="flex min-h-9 items-center text-xs text-text-muted touch:min-h-11">
                  {mode === 'piece' ? 'Pick a part to see the tools that fit.' : 'Pick what you are building to see your stack.'}
                </p>
              )}
              <p role="status" className={copy.state === 'copied' ? 'text-xs text-text-muted' : 'sr-only'}>
                {copy.state === 'copied' ? 'Link copied.' : ''}
              </p>
              {copy.state === 'manual' && <CopyFallback id={`${id}-link`} url={copy.url} />}
            </div>
          </Tabs.Root>
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  )
}
