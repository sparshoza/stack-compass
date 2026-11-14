import '@testing-library/jest-dom/vitest'
import { cleanup } from '@testing-library/react'
import { afterEach } from 'vitest'

afterEach(() => {
  cleanup()
  document.documentElement.removeAttribute('data-theme')
  try {
    window.localStorage.clear()
  } catch {
    // storage can be unavailable; tests that need it set it up themselves
  }
})
