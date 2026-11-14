import { useEffect, useRef, type ReactNode } from 'react'
import { ExternalLinkIcon, XIcon } from 'lucide-react'
import { Dialog as DialogPrimitive } from 'radix-ui'
import { Button, buttonVariants } from '@/components/ui/button'
import { HOSTING_NAMES, PRICING_NAMES, languageName, layerName } from '@/lib/display'
import { familyColor, LAYER_FAMILY } from '@/lib/families'
import type { Tool } from '@/lib/kb'
import { newIssueUrl } from '@/lib/links'
import { relationsOf } from '@/lib/relations'
import { cn } from '@/lib/utils'

interface ToolPanelProps {
  tool: Tool | undefined
  onClose: () => void
  onFocusTool: (id: string) => void
  /** Called once the panel has closed, to put keyboard focus back. */
  onRestoreFocus: () => void
}

const MATURITY: Record<Tool['maturity'], string> = {
  established: 'Established',
  emerging: 'Emerging',
  legacy: 'Legacy',
}

function suggestEditUrl(tool: Tool): string {
  return newIssueUrl(
    `Correction: ${tool.name} (${tool.id})`,
    [
      `Tool: ${tool.id}`,
      '',
      'Which fact is wrong?',
      '',
      'What should it say, and where is that stated (official site or docs link)?',
    ].join('\n'),
  )
}

function Fact({ term, children }: { term: string; children: ReactNode }) {
  return (
    <div className="grid grid-cols-[6.5rem_1fr] gap-3 py-2">
      <dt className="text-text-muted">{term}</dt>
      <dd className="min-w-0 text-text">{children}</dd>
    </div>
  )
}

function Missing() {
  return (
    <>
      <span aria-hidden="true" className="text-text-faint">
        -
      </span>
      <span className="sr-only">None listed</span>
    </>
  )
}

function Notes({ title, items }: { title: string; items: string[] }) {
  if (!items.length) return null
  return (
    <section className="grid gap-1.5">
      <h3 className="text-[0.8125rem] font-semibold">{title}</h3>
      <ul className="grid list-disc gap-1 pl-4 text-text marker:text-text-faint">
        {items.map((item) => (
          <li key={item}>{item}</li>
        ))}
      </ul>
    </section>
  )
}

/**
 * One tool's facts and relations. A non-modal sheet: the map stays usable
 * behind it, so another dot or a relation swaps the tool in place. Right side
 * from 1024px, bottom sheet below. Escape or the close button closes it.
 */
export function ToolPanel({ tool, onClose, onFocusTool, onRestoreFocus }: ToolPanelProps) {
  const headingRef = useRef<HTMLHeadingElement>(null)
  const scrollRef = useRef<HTMLDivElement>(null)

  // Each tool that opens, from search, the map or a relation, takes focus to
  // its name so screen readers announce it, and starts at the top. The first
  // open is handled by onOpenAutoFocus, since the portal mounts a render later.
  const id = tool?.id
  useEffect(() => {
    if (!id) return
    scrollRef.current?.scrollTo?.({ top: 0 })
    headingRef.current?.focus()
  }, [id])

  const relations = tool ? relationsOf(tool.id) : []

  return (
    <DialogPrimitive.Root open={tool !== undefined} onOpenChange={(open) => !open && onClose()} modal={false}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Content
          aria-describedby={undefined}
          onOpenAutoFocus={(e) => {
            e.preventDefault()
            headingRef.current?.focus()
          }}
          onCloseAutoFocus={(e) => {
            e.preventDefault()
            onRestoreFocus()
          }}
          // Clicks and focus elsewhere (the map, search) leave the panel open.
          onInteractOutside={(e) => e.preventDefault()}
          className={cn(
            'fixed z-20 flex flex-col border-line bg-surface text-[0.8125rem] text-text shadow-(--shadow-float) outline-none',
            'inset-x-0 bottom-0 max-h-[60dvh] rounded-t-[var(--radius-panel)] border-t',
            'lg:top-[4.5rem] lg:right-6 lg:bottom-[4.5rem] lg:left-auto lg:max-h-none lg:w-[400px] lg:rounded-[var(--radius-panel)] lg:border',
          )}
        >
          {tool && (
            <>
              <div className="flex items-start gap-3 px-5 pt-4 pb-3 lg:px-6 lg:pt-5">
                <div className="grid min-w-0 flex-1 gap-1">
                  <DialogPrimitive.Title asChild>
                    <h2
                      ref={headingRef}
                      tabIndex={-1}
                      className="text-[1.125rem] leading-tight font-semibold tracking-[-0.01em] outline-none focus-visible:underline focus-visible:decoration-highlight focus-visible:underline-offset-4"
                    >
                      {tool.name}
                    </h2>
                  </DialogPrimitive.Title>
                  <p className="flex flex-wrap items-center gap-x-2 text-xs text-text-muted">
                    <span className="inline-flex items-center gap-1.5">
                      <span
                        aria-hidden="true"
                        className="size-2 rounded-full"
                        style={{ background: familyColor(LAYER_FAMILY[tool.layer]) }}
                      />
                      <span>{layerName(tool.layer)}</span>
                    </span>
                    <span aria-hidden="true">·</span>
                    <span>{MATURITY[tool.maturity]}</span>
                  </p>
                </div>
                <DialogPrimitive.Close asChild>
                  <Button variant="quiet" size="icon-pill" className="-mt-1 -mr-2 shrink-0">
                    <XIcon aria-hidden="true" />
                    <span className="sr-only">Close</span>
                  </Button>
                </DialogPrimitive.Close>
              </div>

              <div ref={scrollRef} className="grid min-h-0 flex-1 content-start gap-6 overflow-y-auto px-5 pb-5 lg:px-6">
                <p className="text-[0.875rem] leading-[1.6] text-text">{tool.summary}</p>

                <dl className="divide-y divide-line border-y border-line">
                  <Fact term="Languages">
                    {tool.languages.length ? tool.languages.map(languageName).join(', ') : <Missing />}
                  </Fact>
                  <Fact term="Licence">{tool.license}</Fact>
                  <Fact term="Pricing">{tool.pricing.map((p) => PRICING_NAMES[p]).join(', ')}</Fact>
                  <Fact term="Hosting">{tool.hosting.map((h) => HOSTING_NAMES[h]).join(', ')}</Fact>
                </dl>

                <Notes title="Good for" items={tool.good_for} />
                <Notes title="Avoid when" items={tool.avoid_when} />

                {relations.length > 0 && (
                  <section className="grid gap-3">
                    <h3 className="text-[0.8125rem] font-semibold">Relations</h3>
                    <dl className="grid gap-3">
                      {relations.map((group) => (
                        <div key={group.key} className="grid gap-1.5">
                          <dt className="text-xs text-text-muted">{group.label}</dt>
                          <dd>
                            <ul aria-label={group.label} className="flex flex-wrap gap-1.5">
                              {group.tools.map((other) => (
                                <li key={other.id}>
                                  <button
                                    type="button"
                                    onClick={() => onFocusTool(other.id)}
                                    className="inline-flex h-8 items-center gap-1.5 rounded-full border border-line-strong px-2.5 text-xs text-text hover:border-text-faint hover:bg-raised max-md:h-11 max-md:px-3.5"
                                  >
                                    <span
                                      aria-hidden="true"
                                      className="size-2 rounded-full"
                                      style={{ background: familyColor(LAYER_FAMILY[other.layer]) }}
                                    />
                                    {other.name}
                                  </button>
                                </li>
                              ))}
                            </ul>
                          </dd>
                        </div>
                      ))}
                    </dl>
                  </section>
                )}

                <footer className="grid gap-3 border-t border-line pt-4">
                  <p className="text-xs text-text-muted">
                    Facts checked on <time dateTime={tool.verified}>{tool.verified}</time>
                  </p>
                  <div className="flex flex-wrap items-center gap-2">
                    <a
                      href={tool.url}
                      target="_blank"
                      rel="noreferrer"
                      className={buttonVariants({ variant: 'pill', size: 'pill' })}
                    >
                      Official site
                      <ExternalLinkIcon aria-hidden="true" />
                    </a>
                    {tool.repo && (
                      <a
                        href={tool.repo}
                        target="_blank"
                        rel="noreferrer"
                        className={buttonVariants({ variant: 'quiet', size: 'pill' })}
                      >
                        Source
                      </a>
                    )}
                    <a
                      href={suggestEditUrl(tool)}
                      target="_blank"
                      rel="noreferrer"
                      className={buttonVariants({ variant: 'quiet', size: 'pill' })}
                    >
                      Suggest an edit
                    </a>
                  </div>
                </footer>
              </div>
            </>
          )}
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  )
}
