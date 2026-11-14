import type { RefObject } from 'react'
import type { Answers } from '@/engine/answers'
import type { LayerResult } from '@/engine/score'
import { kb } from '@/lib/kb'
import { LayerRow } from './LayerRow'

interface StackListProps {
  results: LayerResult[]
  answers: Answers
  headingRef: RefObject<HTMLHeadingElement | null>
  /** True when the map is on screen behind the sheet (not the table view). */
  litOnMap: boolean
  onFocusTool: (id: string) => void
}

/** The result: a headline, then one row per layer in scoring order. */
export function StackList({ results, answers, headingRef, litOnMap, onFocusTool }: StackListProps) {
  const type = kb.vocab.project_types.find((p) => p.id === answers.projectType)
  const missing = results.filter((r) => r.pick === null).length
  const facts = [
    type?.label,
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
          className="text-[1.25rem] leading-tight font-semibold tracking-[-0.01em] outline-none focus-visible:underline focus-visible:decoration-highlight focus-visible:underline-offset-4"
        >
          Your stack
        </h3>
        <p className="text-xs text-text-muted">{facts.join(' · ')}{litOnMap ? '. Picks are lit on the map.' : ''}</p>
      </div>
      <ul aria-label="Your stack by layer" className="grid">
        {results.map((result) => (
          <LayerRow key={result.layer} result={result} answers={answers} onFocusTool={onFocusTool} />
        ))}
      </ul>
    </section>
  )
}
