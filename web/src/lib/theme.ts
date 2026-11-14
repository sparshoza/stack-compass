import { useCallback, useEffect, useState } from 'react'

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

  useEffect(() => {
    document.documentElement.dataset.theme = theme
  }, [theme])

  const toggle = useCallback(() => {
    setTheme((prev) => {
      const next: Theme = prev === 'dark' ? 'light' : 'dark'
      try {
        window.localStorage.setItem(THEME_KEY, next)
      } catch {
        // the choice still applies for this visit
      }
      return next
    })
  }, [])

  return [theme, toggle]
}
