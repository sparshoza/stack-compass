import type { RefObject } from 'react'
import { MapIcon } from 'lucide-react'
import { Button } from '@/components/ui/button'
import type { Answers } from '@/engine/answers'
import type { LayerResult } from '@/engine/score'
import { layerName } from '@/lib/display'
import { familyColor, LAYER_FAMILY } from '@/lib/families'
import { kb, toolById } from '@/lib/kb'
import { LayerRow } from './LayerRow'
import { projectTypeLabel } from './plain'

interface StackListProps {
  results: LayerResult[]
  answers: Answers
  headingRef: RefObject<HTMLHeadingElement | null>
  /** True when the map is on screen behind the sheet (not the table view). */
  litOnMap: boolean
  /** Set where the sheet covers the map: closes it so the lit stack can be seen. */
  onSeeMap?: () => void
  onFocusTool: (id: string) => void
}

const anchorOf = (layer: string) => `stack-row-${layer}`

/** Scrolls to a layer's row and puts focus on its heading. */
function jumpTo(layer: string) {
  const row = document.getElementById(anchorOf(layer))
  if (!row) return
  row.scrollIntoView?.({ block: 'start' })
  row.querySelector<HTMLElement>('h4')?.focus({ preventScroll: true })
}

/** The result: a headline, a one-line-per-layer summary, then each layer in detail. */
export function StackList({ results, answers, headingRef, litOnMap, onSeeMap, onFocusTool }: StackListProps) {
  const type = kb.vocab.project_types.find((p) => p.id === answers.projectType)
  const missing = results.filter((r) => r.pick === null).length
  const facts = [
    type && projectTypeLabel(type.id, type.label),
    `${results.length} ${results.length === 1 ? 'layer' : 'layers'}`,
    missing ? `${missing} without a match` : null,
  ].filter(Boolean)

  return (
    <section aria-labelledby="choose-result" className="grid gap-4">
      <div className="grid gap-1">
        <h3
          id="choose-result"
          ref={headingRef}
          tabIndex={-1}
          className="scroll-mt-5 text-[1.25rem] leading-tight font-semibold tracking-[-0.01em] outline-none focus-visible:underline focus-visible:decoration-highlight focus-visible:underline-offset-4"
        >
          Your stack
        </h3>
        <p role="status" className="text-xs text-text-muted">
          {facts.join(' · ')}
          {!onSeeMap && litOnMap ? '. Picks are lit on the map.' : '.'}
        </p>
        {onSeeMap && (
          <Button variant="pill" size="pill" className="mt-2 w-fit touch:h-11" onClick={onSeeMap}>
            <MapIcon aria-hidden="true" />
            See on the map
          </Button>
        )}
      </div>

      <nav aria-label="Jump to a layer" className="rounded-[var(--radius-sm)] bg-raised px-1.5 py-1.5">
        <ul className="grid">
          {results.map((result) => {
            const pick = result.pick ? toolById(result.pick) : undefined
            return (
              <li key={result.layer}>
                <button
                  type="button"
                  aria-label={`${layerName(result.layer)}: ${pick ? pick.name : 'No match'}`}
                  onClick={() => jumpTo(result.layer)}
                  className="flex h-8 w-full items-center gap-3 rounded-md px-2 text-left hover:bg-surface touch:h-11"
                >
                  <span className="inline-flex w-[9.5rem] shrink-0 items-center gap-2 text-xs text-text-muted">
                    <span
                      aria-hidden="true"
                      className="size-2 shrink-0 rounded-full"
                      style={{ background: familyColor(LAYER_FAMILY[result.layer]) }}
                    />
                    <span className="truncate">{layerName(result.layer)}</span>
                  </span>
                  <span className={pick ? 'min-w-0 truncate text-[0.8125rem] text-text' : 'text-[0.8125rem] text-text-muted'}>
                    {pick ? pick.name : 'No match'}
                  </span>
                </button>
              </li>
            )
          })}
        </ul>
      </nav>

      <ul aria-label="Your stack by layer" className="grid">
        {results.map((result) => (
          <LayerRow
            key={result.layer}
            anchorId={anchorOf(result.layer)}
            result={result}
            answers={answers}
            onFocusTool={onFocusTool}
          />
        ))}
      </ul>
    </section>
  )
}
