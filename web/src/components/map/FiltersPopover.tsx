import { useId } from 'react'
import { MapIcon, SlidersHorizontalIcon, TableIcon } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { layerName } from '@/lib/display'
import { FAMILIES, familyColor } from '@/lib/families'
import type { EdgeType, Layer } from '@/lib/kb'
import { cn } from '@/lib/utils'

/** Relation names and the stroke each is drawn with on the map (see graph/model.ts EDGE_SIZE). */
const EDGE_TYPES: { type: EdgeType; label: string; stroke: number }[] = [
  { type: 'built-on', label: 'Built on', stroke: 2 },
  { type: 'extends', label: 'Extends', stroke: 2 },
  { type: 'pairs-with', label: 'Pairs with', stroke: 1.5 },
  { type: 'alternative-to', label: 'Alternative to', stroke: 1 },
  { type: 'replaces', label: 'Replaces', stroke: 1 },
]

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

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button variant="quiet" size="icon-pill" aria-label="Filters">
          <SlidersHorizontalIcon aria-hidden="true" />
        </Button>
      </PopoverTrigger>
      <PopoverContent
        align="end"
        sideOffset={8}
        collisionPadding={16}
        aria-labelledby={titleId}
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
              className="-mr-2 h-8 px-3 text-xs max-md:h-11"
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
                            'inline-flex h-8 items-center gap-1.5 rounded-full border px-2.5 text-xs max-md:h-11 max-md:px-3.5',
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
              {EDGE_TYPES.map(({ type, label, stroke }) => {
                const shown = !hiddenEdgeTypes.has(type)
                return (
                  <button
                    key={type}
                    type="button"
                    aria-pressed={shown}
                    onClick={() => onToggleEdgeType(type)}
                    className="-mx-2 flex h-9 items-center gap-3 rounded-lg px-2 text-left hover:bg-raised max-md:h-11"
                  >
                    <span
                      aria-hidden="true"
                      className={cn(
                        'grid size-4 shrink-0 place-items-center rounded-[4px] border',
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
                        strokeWidth={stroke}
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
