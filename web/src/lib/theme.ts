import { useCallback, useEffect, useRef, useState } from 'react'

export type Theme = 'dark' | 'light'

/** Same key the inline script in index.html reads before first paint. */
export const THEME_KEY = 'stack-compass-theme'

function isTheme(value: unknown): value is Theme {
  return value === 'dark' || value === 'light'
}

/** The theme on <html> (set before paint), then the saved one, then dark. */
export function readTheme(): Theme {
  const current = document.documentElement.dataset.theme
  if (isTheme(current)) return current
  try {
    const saved = window.localStorage.getItem(THEME_KEY)
    if (isTheme(saved)) return saved
  } catch {
    // storage blocked (private mode, sandboxed frame): fall back to dark
  }
  return 'dark'
}

export function useTheme(): [Theme, () => void] {
  const [theme, setTheme] = useState<Theme>(readTheme)
  // Saved only once the visitor picks a theme, so a first visit stores nothing.
  const chosen = useRef(false)

  useEffect(() => {
    document.documentElement.dataset.theme = theme
    if (!chosen.current) return
    try {
      window.localStorage.setItem(THEME_KEY, theme)
    } catch {
      // the choice still applies for this visit
    }
  }, [theme])

  const toggle = useCallback(() => {
    chosen.current = true
    setTheme((prev) => (prev === 'dark' ? 'light' : 'dark'))
  }, [])

  return [theme, toggle]
}
