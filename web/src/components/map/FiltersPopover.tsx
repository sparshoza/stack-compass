import { useId, useRef, useState } from 'react'
import { MapIcon, SlidersHorizontalIcon, TableIcon } from 'lucide-react'
import { EDGE_SIZE } from '@/components/graph/edgeSizes'
import { quietOverMap } from '@/components/shell/TopBar'
import { Button } from '@/components/ui/button'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { layerName } from '@/lib/display'
import { useReturnFocusOnClose } from '@/lib/useReturnFocusOnClose'
import { FAMILIES, familyColor } from '@/lib/families'
import type { EdgeType, Layer } from '@/lib/kb'
import { cn } from '@/lib/utils'

/** Relation names. The legend line is the map's edge width (graph/edgeSizes.ts) doubled so it reads at legend size. */
const EDGE_TYPES: { type: EdgeType; label: string }[] = [
  { type: 'built-on', label: 'Built on' },
  { type: 'extends', label: 'Extends' },
  { type: 'pairs-with', label: 'Pairs with' },
  { type: 'alternative-to', label: 'Alternative to' },
  { type: 'replaces', label: 'Replaces' },
]
const LEGEND_SCALE = 2

interface FiltersPopoverProps {
  view: 'map' | 'table'
  /** False when the map cannot run; the table is then the only view. */
  canShowMap: boolean
  hiddenLayers: ReadonlySet<Layer>
  hiddenEdgeTypes: ReadonlySet<EdgeType>
  onToggleLayer: (layer: Layer) => void
  onToggleEdgeType: (type: EdgeType) => void
  onShowAll: () => void
  onViewChange: (view: 'map' | 'table') => void
}

const groupTitle = 'text-[0.8125rem] font-semibold text-text'

/**
 * Layer chips grouped by family (the group names double as the colour key),
 * relation toggles with the line each one draws, and the table view switch.
 * Chips and toggles are pressed while the thing they name is shown.
 */
export function FiltersPopover({
  view,
  canShowMap,
  hiddenLayers,
  hiddenEdgeTypes,
  onToggleLayer,
  onToggleEdgeType,
  onShowAll,
  onViewChange,
}: FiltersPopoverProps) {
  const titleId = useId()
  const nothingHidden = hiddenLayers.size === 0 && hiddenEdgeTypes.size === 0

  // Escape or the trigger hands focus back to the trigger as the popover
  // starts to close; a click elsewhere leaves focus where it landed.
  const [open, setOpen] = useState(false)
  const triggerRef = useRef<HTMLButtonElement>(null)
  const clickedOutside = useRef(false)
  const contentRef = useRef<HTMLDivElement>(null)
  const onCloseAutoFocus = useReturnFocusOnClose(open, () => {
    if (!clickedOutside.current) triggerRef.current?.focus()
    clickedOutside.current = false
  }, contentRef)

  return (
    <Popover
      open={open}
      onOpenChange={(next) => {
        if (next) clickedOutside.current = false
        setOpen(next)
      }}
    >
      <PopoverTrigger asChild>
        <Button ref={triggerRef} variant="quiet" size="icon-pill" className={quietOverMap} aria-label="Filters">
          <SlidersHorizontalIcon aria-hidden="true" />
        </Button>
      </PopoverTrigger>
      <PopoverContent
        ref={contentRef}
        align="end"
        sideOffset={8}
        collisionPadding={16}
        aria-labelledby={titleId}
        onPointerDownOutside={() => {
          clickedOutside.current = true
        }}
        onCloseAutoFocus={onCloseAutoFocus}
        className="max-h-(--radix-popover-content-available-height) w-[min(22rem,calc(100vw-2rem))] gap-0 overflow-y-auto rounded-xl p-0 text-[0.8125rem] lg:w-[38rem]"
      >
        <div className="flex items-center justify-between gap-3 px-4 pt-3.5 pb-1">
          <h2 id={titleId} className="text-[0.875rem] font-semibold">
            Filters
          </h2>
          {view === 'map' && (
            <Button
              variant="quiet"
              size="pill"
              className="-mr-2 h-8 px-3 text-xs touch:h-11"
              disabled={nothingHidden}
              onClick={onShowAll}
            >
              Show all
            </Button>
          )}
        </div>

        {view === 'map' ? (
          <div className="lg:grid lg:grid-cols-[1fr_14rem]">
            <section aria-labelledby={`${titleId}-layers`} className="grid content-start gap-3 px-4 pt-2 pb-4">
              <h3 id={`${titleId}-layers`} className={groupTitle}>
                Layers
              </h3>
              {FAMILIES.map((family) => (
                <div key={family.id} role="group" aria-label={family.label} className="grid gap-1.5">
                  <p className="flex items-center gap-2 text-xs text-text-muted" aria-hidden="true">
                    <span className="size-2 rounded-full" style={{ background: familyColor(family.id) }} />
                    {family.label}
                  </p>
                  <div className="flex flex-wrap gap-1.5">
                    {family.layers.map((layer) => {
                      const shown = !hiddenLayers.has(layer)
                      return (
                        <button
                          key={layer}
                          type="button"
                          aria-pressed={shown}
                          onClick={() => onToggleLayer(layer)}
                          className={cn(
                            'motion-colors inline-flex h-8 items-center gap-1.5 rounded-full border px-2.5 text-xs touch:h-11 touch:px-3.5',
                            shown
                              ? 'border-line-strong bg-raised text-text hover:border-text-faint'
                              : 'border-line text-text-muted hover:border-line-strong hover:text-text',
                          )}
                        >
                          <span
                            aria-hidden="true"
                            className="size-2 rounded-full border-[1.5px]"
                            style={{
                              borderColor: familyColor(family.id),
                              background: shown ? familyColor(family.id) : 'transparent',
                            }}
                          />
                          {layerName(layer)}
                        </button>
                      )
                    })}
                  </div>
                </div>
              ))}
            </section>

            <section
              aria-labelledby={`${titleId}-relations`}
              className="grid content-start gap-1 border-t border-line px-4 py-3.5 lg:border-t-0 lg:border-l lg:pt-2"
            >
              <h3 id={`${titleId}-relations`} className={cn(groupTitle, 'mb-1')}>
                Relations
              </h3>
              {EDGE_TYPES.map(({ type, label }) => {
                const shown = !hiddenEdgeTypes.has(type)
                return (
                  <button
                    key={type}
                    type="button"
                    aria-pressed={shown}
                    onClick={() => onToggleEdgeType(type)}
                    className="motion-colors -mx-2 flex h-9 items-center gap-3 rounded-lg px-2 text-left hover:bg-raised touch:h-11"
                  >
                    <span
                      aria-hidden="true"
                      className={cn(
                        'motion-colors grid size-4 shrink-0 place-items-center rounded-[4px] border',
                        shown ? 'border-text bg-text' : 'border-line-strong',
                      )}
                    >
                      {shown && (
                        <svg viewBox="0 0 12 12" className="size-3" fill="none" stroke="var(--bg)" strokeWidth="2">
                          <path d="M2.5 6.2 5 8.5l4.5-5" />
                        </svg>
                      )}
                    </span>
                    <svg aria-hidden="true" width="28" height="8" viewBox="0 0 28 8" className="shrink-0">
                      <line
                        x1="1"
                        y1="4"
                        x2="27"
                        y2="4"
                        stroke={shown ? 'var(--edge-strong)' : 'var(--line)'}
                        strokeWidth={EDGE_SIZE[type] * LEGEND_SCALE}
                        strokeLinecap="round"
                      />
                    </svg>
                    <span className={shown ? 'text-text' : 'text-text-muted'}>{label}</span>
                  </button>
                )
              })}
            </section>
          </div>
        ) : (
          <p className="px-4 pt-1 pb-3 text-text-muted">The table has its own name and layer filters.</p>
        )}

        {canShowMap && (
          <div className="border-t border-line p-3">
            <Button
              variant="pill"
              size="pill"
              className="w-full"
              onClick={() => onViewChange(view === 'map' ? 'table' : 'map')}
            >
              {view === 'map' ? <TableIcon aria-hidden="true" /> : <MapIcon aria-hidden="true" />}
              {view === 'map' ? 'Table view' : 'Map view'}
            </Button>
          </div>
        )}
      </PopoverContent>
    </Popover>
  )
}
