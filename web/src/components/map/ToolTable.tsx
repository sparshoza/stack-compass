import { useId, useMemo, useState, type ReactNode } from 'react'
import { ChevronDownIcon, MapIcon, SearchIcon } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { HOSTING_NAMES, PRICING_NAMES, languageName, layerName } from '@/lib/display'
import { FAMILIES, familyColor, LAYER_FAMILY } from '@/lib/families'
import { compareByName, kb, type Layer, type Tool } from '@/lib/kb'

interface ToolTableProps {
  onOpen: (id: string) => void
  /** Shown only when the map can run in this browser. */
  onBackToMap?: () => void
  /** Rendered after the table, inside the scroll area. */
  footer?: ReactNode
}

const ALL_TOOLS = [...kb.tools].sort(compareByName)

function normalize(text: string): string {
  return text.trim().toLowerCase()
}

function matches(tool: Tool, query: string): boolean {
  if (!query) return true
  return [tool.name, ...tool.aliases].some((term) => term.toLowerCase().includes(query))
}

const languages = (tool: Tool) => tool.languages.map(languageName).join(', ')

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

const field =
  'h-11 w-full rounded-full border border-line-strong bg-surface text-[1rem] text-text hover:border-text-faint md:h-9 md:text-[0.8125rem]'

/**
 * Every tool in a real table: the route for keyboard and screen-reader users
 * and the whole screen when WebGL is missing. Each name is a button that
 * opens the tool panel. Below 640px secondary columns fold into a line under
 * the name.
 */
export function ToolTable({ onOpen, onBackToMap, footer }: ToolTableProps) {
  const [query, setQuery] = useState('')
  const [layer, setLayer] = useState<Layer | ''>('')
  const filterId = useId()
  const layerId = useId()

  const q = normalize(query)
  const rows = useMemo(
    () => ALL_TOOLS.filter((tool) => (!layer || tool.layer === layer) && matches(tool, q)),
    [q, layer],
  )
  const filtered = rows.length !== ALL_TOOLS.length

  const clear = () => {
    setQuery('')
    setLayer('')
  }

  return (
    <div className="mx-auto grid w-full max-w-6xl gap-5 px-4 pt-32 pb-6 md:px-6 md:pt-24">
      <div className="flex flex-wrap items-end justify-between gap-x-6 gap-y-3">
        <div className="grid gap-1">
          <h2 className="text-[1.25rem] leading-tight font-semibold tracking-[-0.01em]">All tools</h2>
          <p aria-live="polite" className="text-text-muted">
            {filtered ? `${rows.length} of ${ALL_TOOLS.length} tools` : `${ALL_TOOLS.length} tools`} across{' '}
            {kb.layers.length} layers
          </p>
        </div>
        {onBackToMap ? (
          <Button variant="pill" size="pill" onClick={onBackToMap}>
            <MapIcon aria-hidden="true" />
            Back to the map
          </Button>
        ) : (
          <p className="max-w-md text-text-muted">
            The map needs WebGL, which this browser does not provide, so every tool is listed here instead.
          </p>
        )}
      </div>

      <div className="grid gap-3 sm:grid-cols-[minmax(0,20rem)_minmax(0,14rem)]">
        <div className="grid gap-1.5">
          <label htmlFor={filterId} className="text-xs text-text-muted">
            Filter tools
          </label>
          <div className="relative">
            <SearchIcon
              aria-hidden="true"
              className="pointer-events-none absolute top-1/2 left-3.5 size-4 -translate-y-1/2 text-text-muted"
            />
            <input
              id={filterId}
              type="search"
              placeholder="Name or alias"
              autoComplete="off"
              spellCheck={false}
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              className={`${field} pr-3.5 pl-10 placeholder:text-text-faint`}
            />
          </div>
        </div>
        <div className="grid gap-1.5">
          <label htmlFor={layerId} className="text-xs text-text-muted">
            Layer
          </label>
          <div className="relative">
            <select
              id={layerId}
              value={layer}
              onChange={(e) => setLayer(e.target.value as Layer | '')}
              className={`${field} appearance-none pr-10 pl-3.5`}
            >
              <option value="">All layers</option>
              {FAMILIES.map((family) => (
                <optgroup key={family.id} label={family.label}>
                  {family.layers.map((l) => (
                    <option key={l} value={l}>
                      {layerName(l)}
                    </option>
                  ))}
                </optgroup>
              ))}
            </select>
            <ChevronDownIcon
              aria-hidden="true"
              className="pointer-events-none absolute top-1/2 right-3.5 size-4 -translate-y-1/2 text-text-muted"
            />
          </div>
        </div>
      </div>

      <table className="w-full border-collapse text-left text-[0.8125rem]">
        <caption className="sr-only">All tools in the catalog. Choose a name to see its details.</caption>
        <thead>
          <tr className="text-xs text-text-muted [&>th]:shadow-[inset_0_-1px_0_var(--line-strong)]">
            <th scope="col" className="sticky top-(--bar-h,4.25rem) z-[1] bg-background h-10 pr-4 font-normal">
              Tool
            </th>
            <th scope="col" className="sticky top-(--bar-h,4.25rem) z-[1] bg-background hidden h-10 pr-4 font-normal sm:table-cell">
              Layer
            </th>
            <th scope="col" className="sticky top-(--bar-h,4.25rem) z-[1] bg-background hidden h-10 pr-4 font-normal md:table-cell">
              Languages
            </th>
            <th scope="col" className="sticky top-(--bar-h,4.25rem) z-[1] bg-background hidden h-10 pr-4 font-normal sm:table-cell">
              Pricing
            </th>
            <th scope="col" className="sticky top-(--bar-h,4.25rem) z-[1] bg-background hidden h-10 pr-4 font-normal lg:table-cell">
              Hosting
            </th>
            <th scope="col" className="sticky top-(--bar-h,4.25rem) z-[1] bg-background hidden h-10 font-normal lg:table-cell">
              Licence
            </th>
          </tr>
        </thead>
        <tbody>
          {rows.map((tool) => (
            <tr
              key={tool.id}
              className="cursor-pointer border-b border-line align-top hover:bg-raised/60"
              onClick={(e) => {
                // The name button handles its own click; this widens the target for pointers.
                if (!(e.target as HTMLElement).closest('button')) onOpen(tool.id)
              }}
            >
              <td className="py-2.5 pr-4">
                <button
                  type="button"
                  onClick={() => onOpen(tool.id)}
                  className="-mx-1 inline-flex min-h-6 items-center gap-2 rounded-sm px-1 text-left font-medium text-text hover:underline hover:decoration-line-strong hover:underline-offset-4"
                >
                  <span
                    aria-hidden="true"
                    className="size-2 shrink-0 rounded-full"
                    style={{ background: familyColor(LAYER_FAMILY[tool.layer]) }}
                  />
                  {tool.name}
                </button>
                <p className="mt-0.5 pl-4 text-xs text-text-muted sm:hidden">
                  {[layerName(tool.layer), languages(tool), tool.pricing.map((p) => PRICING_NAMES[p]).join(', ')]
                    .filter(Boolean)
                    .join(' · ')}
                </p>
              </td>
              <td className="hidden py-2.5 pr-4 whitespace-nowrap text-text-muted sm:table-cell">{layerName(tool.layer)}</td>
              <td className="hidden py-2.5 pr-4 text-text-muted md:table-cell">{languages(tool) || <Missing />}</td>
              <td className="hidden py-2.5 pr-4 whitespace-nowrap text-text-muted sm:table-cell">
                {tool.pricing.map((p) => PRICING_NAMES[p]).join(', ')}
              </td>
              <td className="hidden py-2.5 pr-4 whitespace-nowrap text-text-muted lg:table-cell">
                {tool.hosting.map((h) => HOSTING_NAMES[h]).join(', ')}
              </td>
              <td className="hidden py-2.5 text-text-muted lg:table-cell">{tool.license}</td>
            </tr>
          ))}
        </tbody>
      </table>

      {rows.length === 0 && (
        <div className="grid justify-items-start gap-3 py-6">
          <p className="text-text">
            No tool matches {q ? `"${query.trim()}"` : 'these filters'}
            {layer ? ` in ${layerName(layer)}` : ''}.
          </p>
          <Button variant="pill" size="pill" onClick={clear}>
            Clear filters
          </Button>
        </div>
      )}

      {footer}
    </div>
  )
}
