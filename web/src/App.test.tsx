import { act, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, useLocation } from 'react-router'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { StackGraphProps } from '@/components/graph/StackGraph'
import App from './App'
import { connect } from './engine/path'
import { kb } from './lib/kb'
import { REPO_URL } from './lib/links'

// The map itself is tested in StackGraph.test.tsx. Here it is a stub that
// records the props the app passes, and WebGL support is switchable.
const graph = vi.hoisted(() => ({
  props: null as StackGraphProps | null,
  webgl: true,
}))

vi.mock('@/components/graph/StackGraph', () => ({
  StackGraph: (props: StackGraphProps) => {
    graph.props = props
    return <div data-testid="stack-graph" data-focus={props.focus ?? ''} />
  },
}))

vi.mock('@/components/graph/useWebGL', () => ({
  useWebGL: () => graph.webgl,
  hasWebGL: () => graph.webgl,
}))

function Location() {
  const { search } = useLocation()
  return <output data-testid="location">{search}</output>
}

function renderApp(path = '/') {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <App />
      <Location />
    </MemoryRouter>,
  )
}

const params = () => new URLSearchParams(screen.getByTestId('location').textContent ?? '')
const panel = () => screen.queryByRole('dialog', { name: /./ })
const toolPanel = (name: string) => screen.getByRole('dialog', { name })

beforeEach(() => {
  graph.props = null
  graph.webgl = true
})

afterEach(() => {
  vi.restoreAllMocks()
  // @ts-expect-error restore jsdom's missing matchMedia
  delete window.matchMedia
})

/**
 * jsdom has no matchMedia, so the app renders its phone layout, where the
 * Help me choose sheet is modal. Tests that use the map beside an open sheet
 * set the wide layout.
 */
/** A screen `width` pixels wide: every min-width query up to it matches. */
function setWidth(width: number) {
  window.matchMedia = vi.fn((query: string) => {
    const min = /min-width:\s*(\d+)px/.exec(query)
    return {
      matches: min ? Number(min[1]) <= width : false,
      media: query,
      onchange: null,
      addEventListener: () => {},
      removeEventListener: () => {},
      addListener: () => {},
      removeListener: () => {},
      dispatchEvent: () => false,
    }
  }) as unknown as typeof window.matchMedia
}

function setWide() {
  window.matchMedia = vi.fn((query: string) => ({
    matches: query.includes('min-width'),
    media: query,
    onchange: null,
    addEventListener: () => {},
    removeEventListener: () => {},
    addListener: () => {},
    removeListener: () => {},
    dispatchEvent: () => false,
  })) as unknown as typeof window.matchMedia
}

describe('app shell', () => {
  it('names the product in the only h1', () => {
    renderApp()
    expect(screen.getAllByRole('heading', { level: 1 })).toHaveLength(1)
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
    expect(screen.getByRole('link', { name: /Inspired by WhichDB/ })).toHaveAttribute('href', 'https://whichdb.dev')
    const report = screen.getByRole('link', { name: 'Report an issue' })
    expect(report.getAttribute('href')).toMatch(new RegExp(`^${REPO_URL}/issues/new\\?`))
  })

  it('shows the tool count from the catalog', () => {
    renderApp()
    expect(screen.getAllByText(new RegExp(`${kb.tools.length} tools`)).length).toBeGreaterThan(0)
  })

  it('switches theme from the theme button', async () => {
    const user = userEvent.setup()
    renderApp()
    expect(document.documentElement.dataset.theme).toBe('dark')
    await user.click(screen.getByRole('button', { name: 'Switch to light theme' }))
    expect(document.documentElement.dataset.theme).toBe('light')
    expect(screen.getByRole('button', { name: 'Switch to dark theme' })).toBeInTheDocument()
  })

  it('opens the Help me choose sheet from the top bar', async () => {
    const user = userEvent.setup()
    renderApp()
    await user.click(screen.getAllByRole('button', { name: 'Help me choose' })[0])
    expect(screen.getByRole('dialog', { name: 'Help me choose' })).toBeInTheDocument()
  })
})

describe('map screen', () => {
  it('map fills the viewport and top bar floats over it', async () => {
    renderApp()
    const map = document.getElementById('map')!
    expect(map).toHaveClass('fixed', 'inset-0')
    expect(await within(map).findByTestId('stack-graph')).toBeInTheDocument()
    const bar = screen.getByRole('banner')
    expect(bar).toHaveClass('fixed', 'pointer-events-none')
    expect(map.contains(bar)).toBe(false)
  })

  it('search by name or alias focuses the tool and opens its panel', async () => {
    const user = userEvent.setup()
    renderApp()
    await screen.findByTestId('stack-graph')
    const search = screen.getByRole('combobox', { name: 'Search tools' })

    await user.type(search, 'expressjs')
    const listbox = screen.getByRole('listbox', { name: 'Matching tools' })
    expect(search).toHaveAttribute('aria-expanded', 'true')
    expect(within(listbox).getAllByRole('option')[0]).toHaveTextContent('Express')
    await user.keyboard('{Enter}')

    expect(toolPanel('Express')).toBeInTheDocument()
    expect(params().get('focus')).toBe('express')
    expect(graph.props?.focus).toBe('express')
    expect(search).toHaveValue('')
    expect(screen.queryByRole('listbox')).not.toBeInTheDocument()

    await user.type(search, 'Fastify')
    await user.click(screen.getByRole('option', { name: /Fastify/ }))
    expect(toolPanel('Fastify')).toBeInTheDocument()
    expect(graph.props?.focus).toBe('fastify')
  })

  it('search moves through results with the arrow keys and says when nothing matches', async () => {
    const user = userEvent.setup()
    renderApp()
    const search = screen.getByRole('combobox', { name: 'Search tools' })
    await user.type(search, 'redis')
    const options = screen.getAllByRole('option')
    expect(options.length).toBeGreaterThan(1)
    await user.keyboard('{ArrowDown}')
    expect(search).toHaveAttribute('aria-activedescendant', options[1].id)
    expect(options[1]).toHaveAttribute('aria-selected', 'true')
    await user.keyboard('{Enter}')
    expect(params().get('focus')).not.toBe('redis')
    expect(params().get('focus')).toBeTruthy()

    await user.clear(search)
    await user.type(search, 'zzzz')
    expect(screen.getByText('No tool matches "zzzz"')).toBeInTheDocument()
  })

  it('Escape in search with a query clears it and keeps the panel open', async () => {
    const user = userEvent.setup()
    renderApp('/?focus=express')
    const search = screen.getByRole('combobox', { name: 'Search tools' })
    await user.type(search, 'red')
    await user.keyboard('{Escape}')
    expect(search).toHaveValue('')
    expect(toolPanel('Express')).toBeInTheDocument()
  })

  it('keeps one live region for search status mounted', async () => {
    const user = userEvent.setup()
    renderApp()
    const status = within(screen.getByRole('banner')).getByRole('status')
    expect(status).toBeEmptyDOMElement()
    await user.type(screen.getByRole('combobox', { name: 'Search tools' }), 'zzzz')
    expect(status).toHaveTextContent('No tool matches "zzzz"')
  })

  it('"/" focuses search unless typing in a field', async () => {
    const user = userEvent.setup()
    renderApp('/?view=table')
    const search = screen.getByRole('combobox', { name: 'Search tools' })
    await user.keyboard('/')
    expect(search).toHaveFocus()
    expect(search).toHaveValue('')

    const filter = screen.getByRole('searchbox', { name: 'Filter tools' })
    await user.click(filter)
    await user.keyboard('a/b')
    expect(filter).toHaveFocus()
    expect(filter).toHaveValue('a/b')
  })

  it('filters popover hides a layer and toggles an edge type', async () => {
    const user = userEvent.setup()
    renderApp()
    await screen.findByTestId('stack-graph')
    await user.click(screen.getByRole('button', { name: 'Filters' }))
    const filters = screen.getByRole('dialog', { name: 'Filters' })

    const database = within(filters).getByRole('button', { name: 'Database' })
    expect(database).toHaveAttribute('aria-pressed', 'true')
    await user.click(database)
    expect(database).toHaveAttribute('aria-pressed', 'false')
    expect([...(graph.props?.hiddenLayers ?? [])]).toEqual(['database'])

    const alternatives = within(filters).getByRole('button', { name: /Alternative to/ })
    await user.click(alternatives)
    expect(alternatives).toHaveAttribute('aria-pressed', 'false')
    expect([...(graph.props?.hiddenEdgeTypes ?? [])]).toEqual(['alternative-to'])

    await user.click(within(filters).getByRole('button', { name: 'Show all' }))
    expect(graph.props?.hiddenLayers?.size).toBe(0)
    expect(graph.props?.hiddenEdgeTypes?.size).toBe(0)
  })

  it('focusing a tool in a hidden layer shows that layer again', async () => {
    const user = userEvent.setup()
    renderApp()
    await screen.findByTestId('stack-graph')
    await user.click(screen.getByRole('button', { name: 'Filters' }))
    await user.click(screen.getByRole('button', { name: 'Database' }))
    expect(graph.props?.hiddenLayers?.has('database')).toBe(true)
    await user.keyboard('{Escape}')

    await user.type(screen.getByRole('combobox', { name: 'Search tools' }), 'postgres{Enter}')
    expect(graph.props?.hiddenLayers?.has('database')).toBe(false)
    expect(graph.props?.focus).toBe('postgresql')
  })

  it('clicking a dot on the map opens its panel', async () => {
    renderApp()
    await screen.findByTestId('stack-graph')
    act(() => graph.props?.onSelect?.('redis', { add: false }))
    expect(toolPanel('Redis')).toBeInTheDocument()
    expect(params().get('focus')).toBe('redis')
  })

  it('?focus=id opens panel; unknown id opens nothing and does not throw', async () => {
    const first = renderApp('/?focus=postgresql')
    expect(toolPanel('PostgreSQL')).toBeInTheDocument()
    await screen.findByTestId('stack-graph')
    expect(graph.props?.focus).toBe('postgresql')
    first.unmount()

    renderApp('/?focus=not-a-tool')
    await screen.findByTestId('stack-graph')
    expect(panel()).not.toBeInTheDocument()
    expect(graph.props?.focus).toBeUndefined()
  })

  it('panel shows the tool facts', () => {
    renderApp('/?focus=express')
    const dialog = toolPanel('Express')
    expect(within(dialog).getByText(kb.tools.find((t) => t.id === 'express')!.summary)).toBeInTheDocument()
    expect(within(dialog).getByText('Backend')).toBeInTheDocument()
    expect(within(dialog).getByText('JavaScript')).toBeInTheDocument()
    expect(within(dialog).getByText('MIT')).toBeInTheDocument()
    expect(within(dialog).getByText('Open source')).toBeInTheDocument()
    expect(within(dialog).getByText('Self-hosted')).toBeInTheDocument()
    expect(within(dialog).getByText('Simple Node APIs')).toBeInTheDocument()
    expect(within(dialog).getByText('You want built-in structure and validation')).toBeInTheDocument()
    expect(within(dialog).getByText('2026-11-14')).toBeInTheDocument()
    expect(within(dialog).getByRole('link', { name: /Official site/ })).toHaveAttribute('href', 'https://expressjs.com')
  })

  it('panel shows relations grouped by type, each focusing that tool', async () => {
    setWide()
    const user = userEvent.setup()
    renderApp('/?focus=express&t=saas')
    const dialog = toolPanel('Express')
    const alternatives = within(dialog).getByRole('list', { name: 'Alternatives' })
    const pairs = within(dialog).getByRole('list', { name: 'Pairs with' })
    expect(within(pairs).getByRole('button', { name: 'PostgreSQL' })).toBeInTheDocument()

    await user.click(within(alternatives).getByRole('button', { name: 'Fastify' }))
    expect(toolPanel('Fastify')).toBeInTheDocument()
    expect(params().get('focus')).toBe('fastify')
    expect(params().get('t')).toBe('saas')
    expect(screen.getByRole('heading', { level: 2, name: 'Fastify' })).toHaveFocus()
  })

  it('Suggest an edit and Report an issue open GitHub new-issue URLs (tool id in the title for the former)', () => {
    renderApp('/?focus=express')
    const suggest = within(toolPanel('Express')).getByRole('link', { name: 'Suggest an edit' })
    const href = suggest.getAttribute('href') ?? ''
    expect(href).toMatch(new RegExp(`^${REPO_URL}/issues/new\\?`))
    expect(new URL(href).searchParams.get('title')).toContain('express')
    expect(suggest).toHaveAttribute('target', '_blank')
    const report = screen.getByRole('link', { name: 'Report an issue' })
    expect(report.getAttribute('href')).toMatch(new RegExp(`^${REPO_URL}/issues/new\\?`))
  })

  it('closing the panel removes focus from the URL and keeps other params', async () => {
    setWide()
    const user = userEvent.setup()
    renderApp('/?focus=express&t=saas')
    await user.click(within(toolPanel('Express')).getByRole('button', { name: 'Close' }))
    // t=saas is a share link, so the Help me choose sheet stays open.
    expect(screen.queryByRole('dialog', { name: 'Express' })).not.toBeInTheDocument()
    expect(params().get('focus')).toBeNull()
    expect(params().get('t')).toBe('saas')
  })

  it('table view filters by text and layer; rows keyboard reachable', async () => {
    setWide()
    const user = userEvent.setup()
    renderApp('/?t=saas')
    await user.click(screen.getByRole('button', { name: 'Filters' }))
    await user.click(screen.getByRole('button', { name: 'Table view' }))
    expect(params().get('view')).toBe('table')
    expect(params().get('t')).toBe('saas')
    expect(screen.queryByTestId('stack-graph')).not.toBeInTheDocument()

    const table = screen.getByRole('table', { name: /tools/i })
    expect(within(table).getAllByRole('row')).toHaveLength(kb.tools.length + 1)

    await user.type(screen.getByRole('searchbox', { name: 'Filter tools' }), 'postgres')
    expect(within(table).getByRole('button', { name: 'PostgreSQL' })).toBeInTheDocument()
    expect(within(table).queryByRole('button', { name: 'Redis' })).not.toBeInTheDocument()

    await user.clear(screen.getByRole('searchbox', { name: 'Filter tools' }))
    await user.selectOptions(screen.getByRole('combobox', { name: 'Layer' }), 'cache')
    const cache = kb.tools.filter((t) => t.layer === 'cache')
    expect(within(table).getAllByRole('row')).toHaveLength(cache.length + 1)

    const redis = within(table).getByRole('button', { name: 'Redis' })
    redis.focus()
    await user.keyboard('{Enter}')
    expect(toolPanel('Redis')).toBeInTheDocument()
  })

  it('table view says when no tool matches and clears the filters', async () => {
    const user = userEvent.setup()
    renderApp('/?view=table')
    await user.type(screen.getByRole('searchbox', { name: 'Filter tools' }), 'zzzz')
    expect(screen.getByText(/No tool matches/)).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Clear filters' }))
    expect(screen.getAllByRole('row')).toHaveLength(kb.tools.length + 1)
  })

  it('the top bar is a solid band over the table that catches clicks', () => {
    renderApp('/?view=table')
    const bar = screen.getByRole('banner')
    expect(bar).toHaveClass('pointer-events-auto', 'bg-background')
    expect(bar).not.toHaveClass('pointer-events-none')
  })

  it('table header stays in view under the bar', () => {
    renderApp('/?view=table')
    for (const th of screen.getAllByRole('columnheader')) expect(th).toHaveClass('sticky')
  })

  it('table view switches back to the map', async () => {
    const user = userEvent.setup()
    renderApp('/?view=table')
    await user.click(screen.getByRole('button', { name: 'Back to the map' }))
    expect(params().get('view')).toBeNull()
    expect(await screen.findByTestId('stack-graph')).toBeInTheDocument()
  })

  it('table view used automatically without WebGL', () => {
    graph.webgl = false
    renderApp()
    expect(screen.getByRole('table', { name: /tools/i })).toBeInTheDocument()
    expect(screen.queryByTestId('stack-graph')).not.toBeInTheDocument()
    expect(screen.getByText(/needs WebGL/)).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Back to the map' })).not.toBeInTheDocument()
  })

  it('a lost WebGL context on the map falls back to the table view', async () => {
    renderApp()
    await waitFor(() => expect(graph.props).not.toBeNull())
    act(() => graph.props?.onContextLost?.())
    expect(screen.getByRole('table', { name: /tools/i })).toBeInTheDocument()
    expect(screen.queryByTestId('stack-graph')).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Back to the map' })).not.toBeInTheDocument()
  })

  it('Escape closes panel and returns focus', async () => {
    const user = userEvent.setup()
    renderApp('/?view=table')
    const row = screen.getByRole('button', { name: 'Redis' })
    row.focus()
    await user.keyboard('{Enter}')
    expect(toolPanel('Redis')).toBeInTheDocument()
    expect(row).not.toHaveFocus()
    await user.keyboard('{Escape}')
    expect(panel()).not.toBeInTheDocument()
    expect(params().get('focus')).toBeNull()
    await waitFor(() => expect(row).toHaveFocus())
  })

  it('info dialog opens from the info button and credits WhichDB', async () => {
    const user = userEvent.setup()
    renderApp()
    await user.click(screen.getByRole('button', { name: 'About Stack Compass' }))
    const dialog = screen.getByRole('dialog', { name: 'About Stack Compass' })
    expect(within(dialog).getByRole('link', { name: 'WhichDB' })).toHaveAttribute('href', 'https://whichdb.dev')
    expect(within(dialog).getByRole('link', { name: /GitHub/ })).toHaveAttribute('href', REPO_URL)
    expect(within(dialog).getByText(/official site/)).toBeInTheDocument()
    await user.keyboard('{Escape}')
    expect(screen.queryByRole('dialog', { name: 'About Stack Compass' })).not.toBeInTheDocument()
  })

  it('phone layout: two-row top bar, tool count line, fullscreen button', async () => {
    Object.defineProperty(document, 'fullscreenEnabled', { value: true, configurable: true })
    try {
      renderApp()
      const bar = screen.getByRole('banner')
      const name = within(bar).getByRole('heading', { level: 1 }).parentElement!
      // The name takes the full first row below 768px, so search wraps to row two.
      expect(name).toHaveClass('max-md:w-full')
      expect(within(bar).getByRole('combobox', { name: 'Search tools' }).closest('form')?.parentElement).toHaveClass(
        'w-full',
      )
      const hint = within(bar).getByText(`${kb.tools.length} tools · pinch to zoom, tap to explore`)
      expect(hint.closest('p')).toHaveClass('md:hidden')
      expect(hint).toHaveClass('bg-background/85')
      const fullscreen = screen.getByRole('button', { name: 'Fullscreen' })
      expect(fullscreen).toHaveClass('md:hidden')
    } finally {
      Reflect.deleteProperty(document, 'fullscreenEnabled')
    }
  })

  it('Clear stack moves focus to the map region', async () => {
    const user = userEvent.setup()
    renderApp('/?t=saas')
    await waitFor(() => expect(graph.props?.highlight?.length).toBeGreaterThan(0))
    await user.click(within(screen.getByRole('dialog', { name: 'Help me choose' })).getByRole('button', { name: 'Close' }))
    const clear = screen.getByRole('button', { name: 'Clear stack' })
    await user.click(clear)
    expect(clear).not.toBeInTheDocument()
    expect(document.activeElement).toBe(document.getElementById('map'))
  })

  describe('routes between two tools', () => {
    const card = () => screen.queryByRole('region', { name: /^How .* connects to / })

    it('Ctrl or Cmd click on a second tool shows how the two connect', async () => {
      setWide()
      renderApp('/?t=saas')
      await screen.findByTestId('stack-graph')
      act(() => graph.props?.onSelect?.('django', { add: false }))
      act(() => graph.props?.onSelect?.('postgresql', { add: true }))
      expect(params().get('focus')).toBe('django')
      expect(params().get('to')).toBe('postgresql')
      expect(params().get('t')).toBe('saas')
      const region = screen.getByRole('region', { name: 'How Django connects to PostgreSQL' })
      const expected = connect('django', 'postgresql', kb).routes
      expect(graph.props?.routes).toEqual(expected)
      expect(within(region).getByText(expected[0].steps[0].text)).toBeInTheDocument()
      // The panel keeps showing the first tool.
      expect(toolPanel('Django')).toBeInTheDocument()
    })

    it('a third Ctrl click replaces the second; a plain click starts over', async () => {
      renderApp('/?focus=django&to=postgresql')
      await screen.findByTestId('stack-graph')
      expect(card()).toHaveAccessibleName('How Django connects to PostgreSQL')
      act(() => graph.props?.onSelect?.('redis', { add: true }))
      expect(params().get('to')).toBe('redis')
      expect(card()).toHaveAccessibleName('How Django connects to Redis')
      act(() => graph.props?.onSelect?.('express', { add: false }))
      expect(params().get('focus')).toBe('express')
      expect(params().has('to')).toBe(false)
      expect(card()).not.toBeInTheDocument()
      expect(graph.props?.routes ?? []).toEqual([])
    })

    it('Ctrl click with nothing focused just focuses; on the focused tool it does nothing', async () => {
      renderApp()
      await screen.findByTestId('stack-graph')
      act(() => graph.props?.onSelect?.('django', { add: true }))
      expect(params().get('focus')).toBe('django')
      act(() => graph.props?.onSelect?.('django', { add: true }))
      expect(params().has('to')).toBe(false)
    })

    it('a click on empty map clears focus, route and panel', async () => {
      setWide()
      renderApp('/?focus=django&to=postgresql&t=saas')
      await screen.findByTestId('stack-graph')
      act(() => graph.props?.onClear?.())
      expect(params().has('focus')).toBe(false)
      expect(params().has('to')).toBe(false)
      expect(params().get('t')).toBe('saas')
      expect(card()).not.toBeInTheDocument()
      await waitFor(() => expect(screen.queryByRole('dialog', { name: 'Django' })).not.toBeInTheDocument())
    })

    it('Escape clears focus, route and panel', async () => {
      const user = userEvent.setup()
      renderApp('/?focus=django&to=postgresql')
      await screen.findByTestId('stack-graph')
      await user.keyboard('{Escape}')
      expect(params().has('focus')).toBe(false)
      expect(params().has('to')).toBe(false)
      expect(card()).not.toBeInTheDocument()
    })

    it('Clear route keeps the tool open', async () => {
      const user = userEvent.setup()
      renderApp('/?focus=django&to=postgresql')
      await user.click(screen.getByRole('button', { name: 'Clear route' }))
      expect(params().get('focus')).toBe('django')
      expect(params().has('to')).toBe(false)
      expect(toolPanel('Django')).toBeInTheDocument()
    })

    it('from the keyboard: the panel finds a route to a tool by search', async () => {
      const user = userEvent.setup()
      renderApp('/?focus=django')
      const field = within(toolPanel('Django')).getByRole('combobox', { name: 'Find a route to...' })
      await user.type(field, 'postgres')
      await user.keyboard('{Enter}')
      expect(params().get('to')).toBe('postgresql')
      expect(card()).toHaveAccessibleName('How Django connects to PostgreSQL')
    })

    it('two alternatives: the card says so and the map draws their edge beside the routes', async () => {
      setWide()
      renderApp('/?focus=fastapi&to=flask')
      await screen.findByTestId('stack-graph')
      expect(within(card()!).getByText('FastAPI and Flask are alternatives: projects usually pick one.')).toBeInTheDocument()
      const [first, ...rest] = graph.props?.routes ?? []
      expect(first.steps).toEqual([{ from: 'fastapi', to: 'flask', type: 'alternative-to', text: '' }])
      expect(rest).toEqual(connect('fastapi', 'flask', kb).routes)
    })

    it('floats the card over the map only when the map keeps room beside it', async () => {
      setWidth(1440)
      const user = userEvent.setup()
      renderApp('/?focus=django&to=postgresql')
      await screen.findByTestId('stack-graph')
      const panelDialog = () => screen.getByRole('dialog', { name: 'Django' })
      expect(within(panelDialog()).queryByRole('region', { name: /connects to/ })).not.toBeInTheDocument()
      expect(graph.props?.routeInset?.left).toBe(400)
      // Help me choose opens beside the map: no room left for a floating card at 1440px.
      await user.click(screen.getAllByRole('button', { name: 'Help me choose' })[0])
      expect(within(panelDialog()).getByRole('region', { name: 'How Django connects to PostgreSQL' })).toBeInTheDocument()
      expect(graph.props?.routeInset?.left).toBe(464)
    })

    it('below 1304px the card sits in the tool panel even without Help me choose', async () => {
      setWidth(1100)
      renderApp('/?focus=django&to=postgresql')
      await screen.findByTestId('stack-graph')
      const panelDialog = screen.getByRole('dialog', { name: 'Django' })
      expect(within(panelDialog).getByRole('region', { name: 'How Django connects to PostgreSQL' })).toBeInTheDocument()
      expect(graph.props?.routeInset?.left).toBe(0)
    })

    it('ignores a route to the same tool or to an unknown one', async () => {
      const first = renderApp('/?focus=django&to=django')
      expect(card()).not.toBeInTheDocument()
      first.unmount()
      renderApp('/?focus=django&to=not-a-tool')
      expect(card()).not.toBeInTheDocument()
    })
  })
})
