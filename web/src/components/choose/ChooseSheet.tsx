import { useEffect, useId, useRef, useState } from 'react'
import { InfoIcon, LinkIcon, XIcon } from 'lucide-react'
import { Dialog as DialogPrimitive } from 'radix-ui'
import { Button } from '@/components/ui/button'
import type { LayerResult } from '@/engine/score'
import { cn } from '@/lib/utils'
import { DetectedChips } from './DetectedChips'
import { Describe } from './Describe'
import { Questions } from './Questions'
import { StackList } from './StackList'
import type { Chooser } from './useChooser'

interface ChooseSheetProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  chooser: Chooser
  /** The scored stack while the result is shown; empty otherwise. */
  results: LayerResult[]
  onShowStack: () => void
  onStartOver: () => void
  onFocusTool: (id: string) => void
  /** Called once the sheet has closed, to put keyboard focus back. */
  onRestoreFocus: () => void
  /** The link that reopens this stack. */
  shareUrl: () => string
  litOnMap: boolean
}

type Target = 'heading' | 'type' | 'text'
type CopyState = 'idle' | 'copied' | 'manual'

/** Inverted fill: the one primary action in each view. */
const primary = 'border-text bg-text text-background hover:border-text hover:bg-text/85 active:bg-text/85'

/**
 * Help me choose. A non-modal sheet: on the left from 1024px so the lit
 * stack and a tool's panel stay visible on the map; full height below.
 * The describe box and questions turn into the result in place.
 */
export function ChooseSheet({
  open,
  onOpenChange,
  chooser,
  results,
  onShowStack,
  onStartOver,
  onFocusTool,
  onRestoreFocus,
  shareUrl,
  litOnMap,
}: ChooseSheetProps) {
  const id = useId()
  const headingRef = useRef<HTMLHeadingElement>(null)
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const typeRef = useRef<HTMLInputElement>(null)
  const scrollRef = useRef<HTMLDivElement>(null)
  const focusNext = useRef<Target | null>(null)
  const [copied, setCopied] = useState<{ state: CopyState; url: string; answers: unknown } | null>(null)

  const { view, answers } = chooser
  const showingResult = view === 'result'

  const focusTarget = (target: Target) => {
    if (target === 'heading') headingRef.current?.focus()
    else if (target === 'type' && typeRef.current) typeRef.current.focus()
    else textareaRef.current?.focus()
  }

  // Focus moves after the view has rendered: the result heading, the
  // chosen project type, or the description box.
  useEffect(() => {
    const target = focusNext.current
    if (!target) return
    focusNext.current = null
    scrollRef.current?.scrollTo?.({ top: 0 })
    focusTarget(target)
  })

  // A copied link goes stale once the answers change or the result is left.
  const copy = copied && copied.answers === answers && showingResult ? copied : { state: 'idle' as CopyState, url: '' }

  const go = (target: Target, action: () => void) => {
    focusNext.current = target
    action()
  }

  const copyLink = async () => {
    const url = shareUrl()
    try {
      if (!navigator.clipboard?.writeText) throw new Error('no clipboard')
      await navigator.clipboard.writeText(url)
      setCopied({ state: 'copied', url, answers })
    } catch {
      setCopied({ state: 'manual', url, answers })
    }
  }

  return (
    <DialogPrimitive.Root open={open} onOpenChange={onOpenChange} modal={false}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Content
          aria-describedby={`${id}-about`}
          onOpenAutoFocus={(e) => {
            e.preventDefault()
            focusTarget(showingResult ? 'heading' : 'text')
          }}
          onCloseAutoFocus={(e) => {
            e.preventDefault()
            onRestoreFocus()
          }}
          // The map and the tool panel stay usable beside the sheet.
          onInteractOutside={(e) => e.preventDefault()}
          // Escape in a field with text clears the field first (tools search does).
          onEscapeKeyDown={(e) => {
            const target = e.target
            if (target instanceof HTMLInputElement && target.value !== '') e.preventDefault()
          }}
          className={cn(
            'fixed inset-0 z-40 flex flex-col bg-surface text-[0.8125rem] text-text outline-none',
            'lg:inset-auto lg:top-[4.5rem] lg:bottom-[4.5rem] lg:left-6 lg:z-20 lg:w-[440px] lg:rounded-[var(--radius-panel)] lg:border lg:border-line lg:shadow-(--shadow-float)',
          )}
        >
          <div className="flex items-start gap-3 border-b border-line px-5 pt-4 pb-3.5 lg:px-6 lg:pt-5">
            <div className="grid min-w-0 flex-1 gap-1">
              <DialogPrimitive.Title className="text-[1rem] leading-tight font-semibold">Help me choose</DialogPrimitive.Title>
              <DialogPrimitive.Description id={`${id}-about`} className="text-xs leading-[1.5] text-text-muted">
                One tool per layer for your project, each with its reasons.
              </DialogPrimitive.Description>
            </div>
            <DialogPrimitive.Close asChild>
              <Button variant="quiet" size="icon-pill" className="-mt-1 -mr-2 shrink-0">
                <XIcon aria-hidden="true" />
                <span className="sr-only">Close</span>
              </Button>
            </DialogPrimitive.Close>
          </div>

          <div ref={scrollRef} className="grid min-h-0 flex-1 content-start gap-6 overflow-y-auto px-5 py-5 lg:px-6">
            {chooser.notice && (
              <p role="status" className="flex gap-2.5 rounded-[var(--radius-sm)] bg-raised px-3 py-2.5 text-xs leading-[1.5] text-text">
                <InfoIcon aria-hidden="true" className="mt-px size-3.5 shrink-0 text-text-muted" />
                <span>{chooser.notice}</span>
              </p>
            )}

            {showingResult ? (
              <StackList
                results={results}
                answers={answers}
                headingRef={headingRef}
                litOnMap={litOnMap}
                onFocusTool={onFocusTool}
              />
            ) : (
              <>
                <div className="grid gap-4">
                  <Describe
                    text={chooser.text}
                    onTextChange={chooser.setText}
                    onRead={chooser.detectNow}
                    textareaRef={textareaRef}
                  />
                  <DetectedChips chips={chooser.chips} nothingFound={chooser.nothingFound} onRemove={chooser.removeChip} />
                </div>
                <div className="border-t border-line pt-6">
                  <Questions answers={answers} onChange={chooser.setAnswers} typeRef={typeRef} />
                </div>
              </>
            )}
          </div>

          <div className="grid gap-2 border-t border-line bg-surface px-5 py-3.5 lg:rounded-b-[var(--radius-panel)] lg:px-6">
            {showingResult ? (
              <>
                <div className="flex flex-wrap items-center gap-1.5 sm:gap-2">
                  <Button variant="pill" size="pill" className={cn(primary, 'max-sm:px-3')} onClick={copyLink}>
                    <LinkIcon aria-hidden="true" className="max-sm:hidden" />
                    Copy link
                  </Button>
                  <Button
                    variant="pill"
                    size="pill"
                    className="max-sm:px-3"
                    onClick={() => go('type', () => chooser.setView('questions'))}
                  >
                    Edit answers
                  </Button>
                  <Button
                    variant="quiet"
                    size="pill"
                    className="ml-auto max-sm:px-3"
                    onClick={() => go('text', onStartOver)}
                  >
                    Start over
                  </Button>
                </div>
                <p role="status" className={copy.state === 'copied' ? 'text-xs text-text-muted' : 'sr-only'}>
                  {copy.state === 'copied' ? 'Link copied.' : ''}
                </p>
                {copy.state === 'manual' && (
                  <div className="grid gap-1.5">
                    <label htmlFor={`${id}-link`} className="text-xs text-text-muted">
                      Copying is blocked here. Select the link and copy it:
                    </label>
                    <input
                      id={`${id}-link`}
                      readOnly
                      value={copy.url}
                      onFocus={(e) => e.currentTarget.select()}
                      ref={(el) => el?.select()}
                      className="h-9 w-full rounded-[var(--radius-sm)] border border-line-strong bg-background px-3 text-xs text-text max-md:h-11"
                    />
                  </div>
                )}
              </>
            ) : (
              <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
                <Button
                  variant="pill"
                  size="pill"
                  className={cn(primary, 'disabled:border-line-strong disabled:bg-raised disabled:text-text-muted disabled:opacity-100')}
                  disabled={!answers.projectType}
                  aria-describedby={answers.projectType ? undefined : `${id}-why-disabled`}
                  onClick={() => go('heading', onShowStack)}
                >
                  Show my stack
                </Button>
                {!answers.projectType && (
                  <p id={`${id}-why-disabled`} className="text-xs text-text-muted">
                    Pick what you are building first.
                  </p>
                )}
              </div>
            )}
          </div>
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  )
}
