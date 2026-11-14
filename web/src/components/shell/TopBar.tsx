import type { RefObject } from 'react'
import { CompassIcon, InfoIcon, MoonIcon, SearchIcon, SlidersHorizontalIcon, SunIcon } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import type { Theme } from '@/lib/theme'
import { FamilyLegend } from './FamilyLegend'
import { Mark } from './Mark'

interface TopBarProps {
  toolCount: number
  theme: Theme
  onToggleTheme: () => void
  onHelp: () => void
  onInfo: () => void
  searchRef: RefObject<HTMLInputElement | null>
}

/**
 * Floating bar over the map. Desktop: one row, name left and controls right.
 * Phone: name on the first row, search and icon buttons on the second, then
 * a one-line hint. The wrapper ignores the pointer so the map stays draggable
 * in the gaps.
 */
export function TopBar({ toolCount, theme, onToggleTheme, onHelp, onInfo, searchRef }: TopBarProps) {
  const nextTheme = theme === 'dark' ? 'light' : 'dark'

  return (
    <header className="pointer-events-none fixed inset-x-0 top-0 z-20 px-4 pt-3 md:px-6 md:pt-4">
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2.5 md:flex-nowrap md:justify-between">
        <div className="pointer-events-auto flex shrink-0 items-center gap-2.5 max-md:w-full">
          <Mark />
          <h1 className="text-[0.9375rem] leading-none font-semibold tracking-[-0.01em] whitespace-nowrap">Stack Compass</h1>
        </div>

        <div className="pointer-events-auto flex w-full items-center gap-2 md:w-auto md:gap-1.5">
          <form role="search" className="min-w-0 flex-1 md:mr-1.5 md:flex-none" onSubmit={(e) => e.preventDefault()}>
            <label className="flex h-11 items-center gap-2 rounded-full border border-line-strong bg-surface px-3.5 focus-within:border-text-faint hover:border-text-faint md:h-9 md:w-52 lg:w-64">
              <SearchIcon aria-hidden="true" className="size-4 shrink-0 text-text-muted" />
              <input
                ref={searchRef}
                type="search"
                aria-label="Search tools"
                placeholder="Search"
                autoComplete="off"
                spellCheck={false}
                className="min-w-0 flex-1 bg-transparent text-[1rem] text-text placeholder:text-text-faint focus:outline-none md:text-[0.8125rem]"
                onKeyDown={(e) => {
                  if (e.key === 'Escape') e.currentTarget.blur()
                }}
              />
              <kbd
                aria-hidden="true"
                className="hidden h-5 min-w-5 items-center justify-center rounded-sm border border-line-strong px-1 text-xs text-text-faint md:inline-flex"
              >
                /
              </kbd>
            </label>
          </form>

          <Button variant="pill" size="pill" className="max-md:hidden" onClick={onHelp}>
            <CompassIcon aria-hidden="true" />
            Help me choose
          </Button>
          <Button variant="pill" size="icon-pill" className="md:hidden" aria-label="Help me choose" onClick={onHelp}>
            <CompassIcon aria-hidden="true" />
          </Button>

          <Popover>
            <PopoverTrigger asChild>
              <Button variant="quiet" size="icon-pill" aria-label="Filters">
                <SlidersHorizontalIcon aria-hidden="true" />
              </Button>
            </PopoverTrigger>
            <PopoverContent align="end" sideOffset={8} collisionPadding={16} className="w-72 gap-3 rounded-xl p-4 text-[0.8125rem]">
              <h2 className="text-[0.875rem] font-semibold">Layer colours</h2>
              <FamilyLegend />
              {/* TODO: layer chips, edge-type toggles and "Table view" arrive with the map. */}
              <p className="text-xs text-text-muted">Layer and relation filters arrive with the map.</p>
            </PopoverContent>
          </Popover>

          <Button variant="quiet" size="icon-pill" aria-label={`Switch to ${nextTheme} theme`} onClick={onToggleTheme}>
            {theme === 'dark' ? <SunIcon aria-hidden="true" /> : <MoonIcon aria-hidden="true" />}
          </Button>
          <Button variant="quiet" size="icon-pill" aria-label="About Stack Compass" onClick={onInfo}>
            <InfoIcon aria-hidden="true" />
          </Button>
        </div>

        <p className="pointer-events-auto w-full text-xs text-text-muted md:hidden">
          {toolCount} tools · pinch to zoom, tap to explore
        </p>
      </div>
    </header>
  )
}
