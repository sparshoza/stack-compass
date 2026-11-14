import { useEffect, useRef, useState } from 'react'
import { CornerLinks } from '@/components/shell/CornerLinks'
import { FullscreenButton } from '@/components/shell/FullscreenButton'
import { HelpSheet } from '@/components/shell/HelpSheet'
import { InfoDialog } from '@/components/shell/InfoDialog'
import { TopBar } from '@/components/shell/TopBar'
import { kb } from '@/lib/kb'
import { useTheme } from '@/lib/theme'

type Overlay = 'help' | 'info' | null

function isTyping(target: EventTarget | null): boolean {
  return (
    target instanceof HTMLElement &&
    (target.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName))
  )
}

export default function App() {
  const [theme, toggleTheme] = useTheme()
  const [overlay, setOverlay] = useState<Overlay>(null)
  const searchRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== '/' || e.ctrlKey || e.metaKey || e.altKey || isTyping(e.target)) return
      e.preventDefault()
      searchRef.current?.focus()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  const setOpen = (which: Exclude<Overlay, null>) => (open: boolean) => setOverlay(open ? which : null)

  return (
    <>
      <a
        href="#map"
        className="sr-only focus:not-sr-only focus:fixed focus:top-3 focus:left-4 focus:z-50 focus:rounded-full focus:bg-surface focus:px-4 focus:py-2 focus:text-text"
      >
        Skip to the map
      </a>

      <TopBar
        toolCount={kb.tools.length}
        theme={theme}
        onToggleTheme={toggleTheme}
        onHelp={() => setOverlay('help')}
        onInfo={() => setOverlay('info')}
        searchRef={searchRef}
      />

      <main id="map" tabIndex={-1} aria-label="Tool map" className="fixed inset-0 bg-background outline-none">
        <p className="sr-only">
          Map of {kb.tools.length} tools across {kb.layers.length} layers.
        </p>
        <FullscreenButton />
      </main>

      <CornerLinks />

      <HelpSheet open={overlay === 'help'} onOpenChange={setOpen('help')} />
      <InfoDialog open={overlay === 'info'} onOpenChange={setOpen('info')} />
    </>
  )
}
