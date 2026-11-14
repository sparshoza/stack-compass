import { useId } from 'react'
import { ChevronRightIcon, LocateFixedIcon } from 'lucide-react'
import type { Answers } from '@/engine/answers'
import { explain } from '@/engine/explain'
import { label } from '@/engine/labels'
import type { LayerResult } from '@/engine/score'
import { familyColor, LAYER_FAMILY } from '@/lib/families'
import { kb, toolById } from '@/lib/kb'
import { cn } from '@/lib/utils'
import { plainLayerName } from './plain'

interface LayerRowProps {
  /** Id on the row, so the summary can jump to it. */
  anchorId: string
  result: LayerResult
  answers: Answers
  onFocusTool: (id: string) => void
}

const capitalize = (text: string) => text.charAt(0).toUpperCase() + text.slice(1)
const points = (n: number) => (n > 0 ? `+${n}` : String(n))

function joinOr(items: string[]): string {
  return items.length < 2 ? items.join('') : `${items.slice(0, -1).join(', ')}, or ${items.at(-1)}`
}

const summary =
  'flex h-8 cursor-pointer list-none items-center gap-1 rounded-full pr-2.5 pl-1.5 text-xs text-text-muted hover:bg-raised hover:text-text touch:h-11 [&::-webkit-details-marker]:hidden'

/** One layer of the result: the pick and why, what to watch, other fits, and the score and exclusions behind it. */
export function LayerRow({ anchorId, result, answers, onFocusTool }: LayerRowProps) {
  const id = useId()
  const pick = result.pick ? toolById(result.pick) : undefined
  const { why, watchOut } = explain(result, answers, kb)
  const total = result.breakdown.reduce((sum, item) => sum + item.points, 0)
  const reasons = [...new Set(result.excluded.map((e) => e.reason))].map((code) => label(code, kb))

  return (
    <li
      id={anchorId}
      aria-labelledby={`${id}-layer`}
      className="grid scroll-mt-4 gap-2 border-t border-line py-4 first:border-t-0 first:pt-1"
    >
      <h4 tabIndex={-1} className="flex flex-wrap items-center gap-x-2 gap-y-1 outline-none focus-visible:bg-raised">
        <span id={`${id}-layer`} className="inline-flex items-center gap-2 text-xs font-normal text-text-muted">
          <span
            aria-hidden="true"
            className="size-2 rounded-full"
            style={{ background: familyColor(LAYER_FAMILY[result.layer]) }}
          />
          {plainLayerName(result.layer)}
        </span>
        <span aria-hidden="true" className="text-text-faint">
          ·
        </span>
        {pick ? (
          <button
            type="button"
            onClick={() => onFocusTool(pick.id)}
            className="group -mx-1 inline-flex items-center gap-1.5 rounded-md px-1 text-left text-[0.9375rem] leading-tight font-semibold text-text hover:bg-raised touch:min-h-11"
          >
            <span className="underline decoration-line-strong decoration-1 underline-offset-4 group-hover:decoration-highlight">
              {pick.name}
            </span>
            <span className="sr-only">, show on the map</span>
            <LocateFixedIcon aria-hidden="true" className="size-3.5 text-text-muted group-hover:text-highlight" />
          </button>
        ) : (
          <span className="text-[0.9375rem] leading-tight font-semibold text-text">No match</span>
        )}
      </h4>

      {pick ? (
        <>
          <p className="text-[0.8125rem] leading-[1.55] text-text">{why}</p>
          {watchOut && (
            <p className="text-[0.8125rem] leading-[1.55] text-text-muted">
              <span className="font-semibold text-text">Avoid when: </span>
              <span>{watchOut}</span>
            </p>
          )}
        </>
      ) : (
        <p className="text-[0.8125rem] leading-[1.55] text-text-muted">
          {reasons.length
            ? `Each tool that came close ${joinOr(reasons)}.`
            : 'No tool in the catalog covers this layer yet.'}
        </p>
      )}

      {result.alternatives.length > 0 && (
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1.5">
          <span id={`${id}-alts`} className="text-xs text-text-muted">
            Also fits
          </span>
          <ul aria-labelledby={`${id}-alts`} className="flex flex-wrap gap-1.5">
            {result.alternatives.map((altId) => {
              const alt = toolById(altId)
              if (!alt) return null
              return (
                <li key={altId}>
                  <button
                    type="button"
                    onClick={() => onFocusTool(altId)}
                    className="inline-flex h-8 items-center gap-1.5 rounded-full border border-line-strong px-2.5 text-xs text-text hover:border-text-faint hover:bg-raised active:bg-raised touch:h-11 touch:px-3.5"
                  >
                    <span
                      aria-hidden="true"
                      className="size-2 rounded-full"
                      style={{ background: familyColor(LAYER_FAMILY[alt.layer]) }}
                    />
                    {alt.name}
                  </button>
                </li>
              )
            })}
          </ul>
        </div>
      )}

      {(pick || result.excluded.length > 0) && (
        <div className="-ml-1.5 flex flex-wrap items-start gap-x-1 gap-y-1">
          {pick && result.breakdown.length > 0 && (
            <details className="group/score open:basis-full">
              <summary className={summary}>
                <ChevronRightIcon aria-hidden="true" className="size-3.5 group-open/score:rotate-90" />
                Score
              </summary>
              <ul className="mt-1 ml-1.5 grid gap-1 rounded-[var(--radius-sm)] bg-raised px-3 py-2.5 text-xs">
                {result.breakdown.map((item) => (
                  <li key={item.code} className="flex items-baseline justify-between gap-4">
                    <span className="text-text">{capitalize(label(item.code, kb))}</span>
                    <span className={cn('shrink-0 tabular-nums', item.points < 0 ? 'text-text-muted' : 'text-text')}>
                      {points(item.points)}
                    </span>
                  </li>
                ))}
                <li className="mt-1 flex items-baseline justify-between gap-4 border-t border-line pt-1.5 font-semibold">
                  <span className="text-text">Total</span>
                  <span className="tabular-nums text-text">{total}</span>
                </li>
              </ul>
            </details>
          )}
          {result.excluded.length > 0 && (
            <details className="group/excluded open:basis-full">
              <summary className={summary}>
                <ChevronRightIcon aria-hidden="true" className="size-3.5 group-open/excluded:rotate-90" />
                Excluded
              </summary>
              <ul className="mt-1 ml-1.5 grid gap-1.5 rounded-[var(--radius-sm)] bg-raised px-3 py-2.5 text-xs leading-[1.45]">
                {result.excluded.map((item) => (
                  <li key={item.toolId} className="text-text-muted">
                    <span className="text-text">{toolById(item.toolId)?.name ?? item.toolId}</span>{' '}
                    {label(item.reason, kb)}
                  </li>
                ))}
              </ul>
            </details>
          )}
        </div>
      )}
    </li>
  )
}
