import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router'
import { describe, expect, it } from 'vitest'
import App from './App'
import { kb } from './lib/kb'
import { REPO_URL } from './lib/links'

function renderApp() {
  return render(
    <MemoryRouter>
      <App />
    </MemoryRouter>,
  )
}

describe('app shell', () => {
  it('names the product in the only h1', () => {
    renderApp()
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('Stack Compass')
  })

  it('has a skip link to the map', () => {
    renderApp()
    const skip = screen.getByRole('link', { name: 'Skip to the map' })
    expect(skip).toHaveAttribute('href', '#map')
    expect(document.getElementById('map')).toBeInTheDocument()
  })

  it('links the credit to WhichDB and the issue pill to a new GitHub issue', () => {
    renderApp()
    expect(screen.getByRole('link', { name: /Inspired by WhichDB/ })).toHaveAttribute(
      'href',
      'https://whichdb.dev',
    )
    const report = screen.getByRole('link', { name: 'Report an issue' })
    expect(report.getAttribute('href')).toMatch(new RegExp(`^${REPO_URL}/issues/new\\?`))
  })

  it('shows the tool count from the catalog', () => {
    renderApp()
    expect(screen.getAllByText(new RegExp(`${kb.tools.length} tools`)).length).toBeGreaterThan(0)
  })

  it('focuses search on slash', async () => {
    const user = userEvent.setup()
    renderApp()
    await user.keyboard('/')
    expect(screen.getByRole('searchbox', { name: 'Search tools' })).toHaveFocus()
  })

  it('switches theme from the theme button', async () => {
    const user = userEvent.setup()
    renderApp()
    expect(document.documentElement.dataset.theme).toBe('dark')
    await user.click(screen.getByRole('button', { name: 'Switch to light theme' }))
    expect(document.documentElement.dataset.theme).toBe('light')
    expect(screen.getByRole('button', { name: 'Switch to dark theme' })).toBeInTheDocument()
  })
})
