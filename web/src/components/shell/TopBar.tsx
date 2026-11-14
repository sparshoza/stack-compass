import { useEffect, useRef, type ReactNode, type RefObject } from 'react'
import { CompassIcon, InfoIcon, MoonIcon, SunIcon } from 'lucide-react'
import { SearchBox } from '@/components/map/SearchBox'
import { Button } from '@/components/ui/button'
import type { Theme } from '@/lib/theme'
import { cn } from '@/lib/utils'
import { Mark } from './Mark'

/** Icon buttons over the map get a backing so dots and labels never show through. */
export const quietOverMap = 'bg-background/85'

interface TopBarProps {
  toolCount: number
  view: 'map' | 'table'
  theme: Theme
  onToggleTheme: () => void
  /** True while the Help me choose sheet is open. */
  helpOpen: boolean
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
  helpOpen,
  onHelp,
  onInfo,
  onPickTool,
  searchRef,
  filters,
}: TopBarProps) {
  const nextTheme = theme === 'dark' ? 'light' : 'dark'
  const headerRef = useRef<HTMLElement>(null)

  // Publishes the bar's height as --bar-h so the table header can stick under it.
  useEffect(() => {
    const header = headerRef.current
    if (!header || typeof ResizeObserver === 'undefined') return
    const root = document.documentElement
    const observer = new ResizeObserver(() => root.style.setProperty('--bar-h', `${header.offsetHeight}px`))
    observer.observe(header)
    return () => observer.disconnect()
  }, [])

  return (
    <header
      ref={headerRef}
      className={cn(
        'fixed inset-x-0 top-0 z-30 px-4 pt-3 md:px-6 md:pt-4',
        view === 'table'
          ? 'pointer-events-auto border-b border-line bg-background pb-3 md:pb-4'
          : 'pointer-events-none',
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

          <Button
            variant="pill"
            size="pill"
            className="max-md:hidden"
            aria-expanded={helpOpen}
            data-help-trigger
            onClick={onHelp}
          >
            <CompassIcon aria-hidden="true" />
            Help me choose
          </Button>
          <Button
            variant="pill"
            size="icon-pill"
            className="md:hidden"
            aria-label="Help me choose"
            aria-expanded={helpOpen}
            data-help-trigger
            onClick={onHelp}
          >
            <CompassIcon aria-hidden="true" />
          </Button>

          {filters}

          <Button
            variant="quiet"
            size="icon-pill"
            className={quietOverMap}
            aria-label={`Switch to ${nextTheme} theme`}
            onClick={onToggleTheme}
          >
            {theme === 'dark' ? <SunIcon aria-hidden="true" /> : <MoonIcon aria-hidden="true" />}
          </Button>
          <Button variant="quiet" size="icon-pill" className={quietOverMap} aria-label="About Stack Compass" onClick={onInfo}>
            <InfoIcon aria-hidden="true" />
          </Button>
        </div>

        {view === 'map' && (
          <p className="w-full md:hidden">
            <span className="pointer-events-auto rounded-full bg-background/85 px-2 py-1 text-xs text-text-muted">
              {toolCount} tools · pinch to zoom, tap to explore
            </span>
          </p>
        )}
      </div>
    </header>
  )
}
