import type { ReactNode, RefObject } from 'react'
import { CompassIcon, InfoIcon, MoonIcon, SunIcon } from 'lucide-react'
import { SearchBox } from '@/components/map/SearchBox'
import { Button } from '@/components/ui/button'
import type { Theme } from '@/lib/theme'
import { cn } from '@/lib/utils'
import { Mark } from './Mark'

interface TopBarProps {
  toolCount: number
  view: 'map' | 'table'
  theme: Theme
  onToggleTheme: () => void
  onHelp: () => void
  onInfo: () => void
  onPickTool: (id: string) => void
  searchRef: RefObject<HTMLInputElement | null>
  /** The filters popover, built by the app because it owns the filter state. */
  filters: ReactNode
}

/**
 * Floating bar over the map. Desktop: one row, name left and controls right.
 * Phone: name on the first row, search and icon buttons on the second, then
 * a one-line hint. Over the map the wrapper ignores the pointer so the map
 * stays draggable in the gaps; over the table it becomes a solid band so
 * rows never scroll under the controls.
 */
export function TopBar({
  toolCount,
  view,
  theme,
  onToggleTheme,
  onHelp,
  onInfo,
  onPickTool,
  searchRef,
  filters,
}: TopBarProps) {
  const nextTheme = theme === 'dark' ? 'light' : 'dark'

  return (
    <header
      className={cn(
        'pointer-events-none fixed inset-x-0 top-0 z-30 px-4 pt-3 md:px-6 md:pt-4',
        view === 'table' && 'border-b border-line bg-background pb-3 md:pb-4',
      )}
    >
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2.5 md:flex-nowrap md:justify-between">
        <div className="pointer-events-auto flex shrink-0 items-center gap-2.5 max-md:w-full">
          <Mark />
          <h1 className="text-[0.9375rem] leading-none font-semibold tracking-[-0.01em] whitespace-nowrap">
            Stack Compass
          </h1>
        </div>

        <div className="pointer-events-auto flex w-full items-center gap-2 md:w-auto md:gap-1.5">
          <SearchBox inputRef={searchRef} onPick={onPickTool} />

          <Button variant="pill" size="pill" className="max-md:hidden" onClick={onHelp}>
            <CompassIcon aria-hidden="true" />
            Help me choose
          </Button>
          <Button variant="pill" size="icon-pill" className="md:hidden" aria-label="Help me choose" onClick={onHelp}>
            <CompassIcon aria-hidden="true" />
          </Button>

          {filters}

          <Button variant="quiet" size="icon-pill" aria-label={`Switch to ${nextTheme} theme`} onClick={onToggleTheme}>
            {theme === 'dark' ? <SunIcon aria-hidden="true" /> : <MoonIcon aria-hidden="true" />}
          </Button>
          <Button variant="quiet" size="icon-pill" aria-label="About Stack Compass" onClick={onInfo}>
            <InfoIcon aria-hidden="true" />
          </Button>
        </div>

        {view === 'map' && (
          <p className="pointer-events-auto w-full text-xs text-text-muted md:hidden">
            {toolCount} tools · pinch to zoom, tap to explore
          </p>
        )}
      </div>
    </header>
  )
}
