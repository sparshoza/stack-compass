import { useId, useMemo, useState, type RefObject } from 'react'
import { SearchIcon } from 'lucide-react'
import { layerName } from '@/lib/display'
import { familyColor, LAYER_FAMILY } from '@/lib/families'
import { searchTools } from '@/lib/search'
import { cn } from '@/lib/utils'

interface SearchBoxProps {
  inputRef: RefObject<HTMLInputElement | null>
  onPick: (id: string) => void
}

/**
 * The pill search field as an ARIA 1.2 combobox: type to list tools whose
 * name or alias matches, arrows to move, Enter or a click to open one.
 */
export function SearchBox({ inputRef, onPick }: SearchBoxProps) {
  const [query, setQuery] = useState('')
  const [open, setOpen] = useState(false)
  const [active, setActive] = useState(0)
  const listId = useId()
  const optionId = (i: number) => `${listId}-option-${i}`

  const results = useMemo(() => searchTools(query), [query])
  const showList = open && results.length > 0
  const showEmpty = open && query.trim() !== '' && results.length === 0

  const pick = (id: string) => {
    setQuery('')
    setOpen(false)
    setActive(0)
    onPick(id)
  }

  return (
    <form role="search" className="relative min-w-0 flex-1 md:mr-1.5 md:flex-none" onSubmit={(e) => e.preventDefault()}>
      <label className="flex h-11 items-center gap-2 rounded-full border border-line-field bg-surface px-3.5 focus-within:border-text-faint focus-within:outline-2 focus-within:outline-offset-2 focus-within:outline-highlight hover:border-text-faint md:h-9 md:w-56 lg:w-64">
        <SearchIcon aria-hidden="true" className="size-4 shrink-0 text-text-muted" />
        <input
          ref={inputRef}
          type="search"
          role="combobox"
          aria-label="Search tools"
          aria-autocomplete="list"
          aria-expanded={showList}
          aria-controls={listId}
          aria-activedescendant={showList ? optionId(active) : undefined}
          placeholder="Search"
          autoComplete="off"
          spellCheck={false}
          value={query}
          className="min-w-0 flex-1 bg-transparent text-[1rem] text-text placeholder:text-text-faint focus:outline-none md:text-[0.8125rem] [&::-webkit-search-cancel-button]:hidden"
          onChange={(e) => {
            setQuery(e.target.value)
            setActive(0)
            setOpen(true)
          }}
          onFocus={() => setOpen(true)}
          onBlur={() => setOpen(false)}
          onKeyDown={(e) => {
            if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
              if (!results.length) return
              e.preventDefault()
              setOpen(true)
              const step = e.key === 'ArrowDown' ? 1 : -1
              setActive((i) => (i + step + results.length) % results.length)
            } else if (e.key === 'Enter') {
              e.preventDefault()
              const hit = results[active]
              if (showList && hit) pick(hit.id)
            } else if (e.key === 'Escape') {
              if (showList || query) {
                setQuery('')
                setOpen(false)
              } else {
                e.currentTarget.blur()
              }
            }
          }}
        />
        <kbd
          aria-hidden="true"
          className="hidden h-5 min-w-5 items-center justify-center rounded-sm border border-line-strong px-1 text-xs text-text-faint md:inline-flex"
        >
          /
        </kbd>
      </label>

      <ul
        id={listId}
        role="listbox"
        aria-label="Matching tools"
        hidden={!showList}
        className="absolute top-full left-0 z-10 mt-2 grid w-[calc(100vw-2rem)] gap-px rounded-xl border border-line bg-surface p-1.5 shadow-(--shadow-float) md:w-80"
      >
        {showList &&
          results.map((tool, i) => (
            <li
              key={tool.id}
              id={optionId(i)}
              role="option"
              aria-selected={i === active}
              className={cn(
                'flex h-11 cursor-pointer items-center gap-2.5 rounded-lg px-2.5 text-[0.8125rem] md:h-9',
                i === active && 'bg-raised',
              )}
              // Keep focus in the field so the list stays open while clicking.
              onMouseDown={(e) => e.preventDefault()}
              onMouseMove={() => setActive(i)}
              onClick={() => pick(tool.id)}
            >
              <span
                aria-hidden="true"
                className="size-2 shrink-0 rounded-full"
                style={{ background: familyColor(LAYER_FAMILY[tool.layer]) }}
              />
              <span className="min-w-0 flex-1 truncate text-text">{tool.name}</span>
              <span className="shrink-0 text-xs text-text-muted">{layerName(tool.layer)}</span>
            </li>
          ))}
      </ul>

      {/* Always mounted so screen readers hear the message when it appears. */}
      <p
        role="status"
        className={
          showEmpty
            ? 'absolute top-full left-0 z-10 mt-2 w-[calc(100vw-2rem)] rounded-xl border border-line bg-surface px-4 py-3 text-[0.8125rem] text-text-muted shadow-(--shadow-float) md:w-80'
            : 'sr-only'
        }
      >
        {showEmpty ? `No tool matches "${query.trim()}"` : ''}
      </p>
    </form>
  )
}
