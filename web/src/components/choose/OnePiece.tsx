import { useId, useMemo, type RefObject } from 'react'
import { ArrowLeftIcon, MapIcon } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { groupsFor, matchLabel, narrowingOptions, type PieceGroup } from '@/engine/facets'
import type { Piece } from '@/engine/share'
import { PRICING_NAMES } from '@/lib/display'
import { familyColor, LAYER_FAMILY } from '@/lib/families'
import { kb, type Layer, type Tool } from '@/lib/kb'
import { cn } from '@/lib/utils'
import { OptionChip, legendClass } from './OptionChip'
import { NO_PREFERENCE, PIECES, pieceOf } from './plain'

interface OnePieceProps {
  piece: Piece
  onChange: (piece: Piece) => void
  /** The tools that fit, best first (worked out by the app, which also lights them on the map). */
  matches: Tool[]
  /** The tool open on the map, marked in the list. */
  focusedTool?: string
  onFocusTool: (id: string) => void
  /** Picking a part moves focus to its question; changing part moves it back to the list of parts. */
  onPickLayer: (layer: Layer) => void
  onChangePart: () => void
  questionRef: RefObject<HTMLHeadingElement | null>
  pickerRef: RefObject<HTMLUListElement | null>
  countRef: RefObject<HTMLHeadingElement | null>
  /** Set where the sheet covers the map: closes it so the lit matches can be seen. */
  onSeeMap?: () => void
}

/** The tag on the right of a match: whether it is open source, has a free tier, or is paid only. */
function priceTag(tool: Tool): string {
  if (tool.pricing.includes('oss')) return PRICING_NAMES.oss
  if (tool.pricing.includes('free-tier')) return PRICING_NAMES['free-tier']
  return PRICING_NAMES.paid
}

function toggled(list: readonly string[] = [], item: string): string[] {
  return list.includes(item) ? list.filter((x) => x !== item) : [...list, item]
}

/** One question of the chosen part: checkboxes for several answers, radios with "no preference" for one. */
function Group({
  group,
  visible,
  chosen,
  onChange,
}: {
  group: PieceGroup
  visible: string[]
  chosen: readonly string[]
  onChange: (options: string[]) => void
}) {
  const id = useId()
  const options = group.options.filter((o) => visible.includes(o.id))
  const none = NO_PREFERENCE[group.id] ?? { label: 'No preference', hint: 'Show them all' }
  return (
    <fieldset role={group.multi ? undefined : 'radiogroup'} aria-labelledby={`${id}-legend`} className="grid gap-2.5">
      <legend id={`${id}-legend`} className={cn(legendClass, 'mb-0.5 p-0')}>
        {group.question}
      </legend>
      <div className="grid grid-cols-2 gap-1.5">
        {!group.multi && (
          <OptionChip
            type="radio"
            name={`${id}-radio`}
            value=""
            label={none.label}
            hint={none.hint}
            checked={chosen.length === 0}
            onChange={() => onChange([])}
          />
        )}
        {options.map((option) => (
          <OptionChip
            key={option.id}
            type={group.multi ? 'checkbox' : 'radio'}
            name={group.multi ? undefined : `${id}-radio`}
            value={option.id}
            label={option.label}
            hint={option.hint}
            checked={chosen.includes(option.id)}
            onChange={() => onChange(group.multi ? toggled(chosen, option.id) : [option.id])}
          />
        ))}
      </div>
    </fieldset>
  )
}

/**
 * One piece: pick a part (database, hosting, sign-in...), answer its
 * questions, and see the tools that fit. Options that would not narrow the
 * list are left out, so every chip changes something.
 */
export function OnePiece({
  piece,
  onChange,
  matches,
  focusedTool,
  onFocusTool,
  onPickLayer,
  onChangePart,
  questionRef,
  pickerRef,
  countRef,
  onSeeMap,
}: OnePieceProps) {
  const id = useId()
  const { layer, selection } = piece
  const groups = useMemo(() => (layer ? groupsFor(layer, kb) : []), [layer])
  const visible = useMemo(() => (layer ? narrowingOptions(layer, selection, kb) : {}), [layer, selection])

  if (!layer) {
    return (
      <section aria-labelledby={`${id}-pick`} className="grid gap-3">
        <h3 id={`${id}-pick`} className={legendClass}>
          Which part do you need help with?
        </h3>
        <ul ref={pickerRef} aria-labelledby={`${id}-pick`} className="flex flex-wrap gap-1.5">
          {PIECES.map((p) => (
            <li key={p.layer}>
              <button
                type="button"
                onClick={() => onPickLayer(p.layer)}
                className="motion-colors inline-flex h-8 items-center gap-2 rounded-full border border-line-strong px-3 text-xs text-text hover:border-text-faint hover:bg-raised touch:h-11 touch:px-3.5"
              >
                <span
                  aria-hidden="true"
                  className="size-2 rounded-full"
                  style={{ background: familyColor(LAYER_FAMILY[p.layer]) }}
                />
                {p.label}
              </button>
            </li>
          ))}
        </ul>
      </section>
    )
  }

  const count = matches.length
  const shown = groups.filter((g) => (visible[g.id] ?? []).length > 0)

  return (
    <div className="grid gap-7">
      <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1">
        <h3
          ref={questionRef}
          tabIndex={-1}
          className="text-[1rem] leading-tight font-semibold outline-none focus-visible:underline focus-visible:decoration-highlight focus-visible:underline-offset-4"
        >
          {pieceOf(layer).question}
        </h3>
        <button
          type="button"
          onClick={onChangePart}
          className="-mr-2 inline-flex h-8 items-center gap-1.5 rounded-full px-2 text-xs text-text-muted hover:bg-raised hover:text-text touch:h-11"
        >
          <ArrowLeftIcon aria-hidden="true" className="size-3.5" />
          Change part
        </button>
      </div>

      {shown.map((group) => (
        <Group
          key={group.id}
          group={group}
          visible={visible[group.id] ?? []}
          chosen={selection[group.id] ?? []}
          onChange={(options) => {
            const next = { ...selection, [group.id]: options }
            if (!options.length) delete next[group.id]
            onChange({ layer, selection: next })
          }}
        />
      ))}

      <section aria-labelledby={`${id}-count`} className="grid gap-2 border-t border-line pt-5">
        <h3
          id={`${id}-count`}
          ref={countRef}
          tabIndex={-1}
          className="scroll-mt-5 text-[1rem] leading-tight font-semibold outline-none focus-visible:underline focus-visible:decoration-highlight focus-visible:underline-offset-4"
        >
          <span role="status">
            {count} {count === 1 ? 'match' : 'matches'}
          </span>
        </h3>
        {onSeeMap && count > 0 && (
          <Button variant="pill" size="pill" className="w-fit touch:h-11" onClick={onSeeMap}>
            <MapIcon aria-hidden="true" />
            See on the map
          </Button>
        )}
        {count === 0 ? (
          <p className="text-xs text-text-muted">No tool fits all of these. Take an answer back to see more.</p>
        ) : (
          <ul aria-label="Matching tools" className="-mx-2 grid">
            {matches.map((tool) => {
              const use = matchLabel(tool, selection, kb)
              const current = tool.id === focusedTool
              return (
                <li key={tool.id}>
                  <button
                    type="button"
                    aria-current={current ? 'true' : undefined}
                    onClick={() => onFocusTool(tool.id)}
                    className={cn(
                      'flex min-h-9 w-full items-center gap-2.5 rounded-lg px-2 py-1.5 text-left hover:bg-raised touch:min-h-11',
                      current && 'bg-raised',
                    )}
                  >
                    <span
                      aria-hidden="true"
                      className="size-2 shrink-0 rounded-full"
                      style={{ background: familyColor(LAYER_FAMILY[tool.layer]) }}
                    />
                    <span className="flex min-w-0 flex-1 flex-wrap items-baseline gap-x-2">
                      <span className={cn('text-[0.8125rem] text-text', current && 'font-semibold')}>{tool.name}</span>
                      {use && <span className="text-xs text-text-muted">{use}</span>}
                    </span>
                    <span className="shrink-0 text-xs text-text-muted">{priceTag(tool)}</span>
                  </button>
                </li>
              )
            })}
          </ul>
        )}
      </section>
    </div>
  )
}
