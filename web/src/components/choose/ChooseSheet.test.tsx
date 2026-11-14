import { act, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, useLocation } from 'react-router'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { StackGraphProps } from '@/components/graph/StackGraph'
import App from '@/App'
import { match } from '@/engine/match'
import { scoreStack } from '@/engine/score'
import { decode } from '@/engine/share'
import { layerName } from '@/lib/display'
import { kb, toolById } from '@/lib/kb'
import { EXAMPLES } from './examples'

// The map is a stub that records the props the app passes (see App.test.tsx).
const graph = vi.hoisted(() => ({ props: null as StackGraphProps | null }))

vi.mock('@/components/graph/StackGraph', () => ({
  StackGraph: (props: StackGraphProps) => {
    graph.props = props
    return <div data-testid="stack-graph" />
  },
}))

vi.mock('@/components/graph/useWebGL', () => ({
  useWebGL: () => true,
  hasWebGL: () => true,
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

const search = () => screen.getByTestId('location').textContent ?? ''
const params = () => new URLSearchParams(search())
const sheet = () => screen.getByRole('dialog', { name: 'Help me choose' })
const SHARE_KEYS = ['t', 'lp', 'la', 'c', 'h', 'b', 's', 'k', 'tool']

async function openSheet(user: ReturnType<typeof userEvent.setup>) {
  await user.click(screen.getAllByRole('button', { name: 'Help me choose' })[0])
  return sheet()
}

async function describeProject(user: ReturnType<typeof userEvent.setup>, text: string) {
  const box = within(sheet()).getByRole('textbox', { name: /Describe your project/ })
  await user.clear(box)
  await user.type(box, text)
  // Detection runs on a typing pause; Read description runs it at once.
  await user.click(within(sheet()).getByRole('button', { name: 'Read description' }))
}

async function showStack(user: ReturnType<typeof userEvent.setup>, type = 'SaaS product') {
  const dialog = sheet()
  await user.click(within(within(dialog).getByRole('radiogroup', { name: /What are you building/ })).getByRole('radio', { name: type }))
  await user.click(within(dialog).getByRole('button', { name: 'Show my stack' }))
}

const rows = () => within(screen.getByRole('list', { name: 'Your stack by layer' })).getAllByRole('listitem', { name: /./ })

beforeEach(() => {
  graph.props = null
})

/** jsdom has no matchMedia, so the app renders its phone layout unless a test sets one. */
function setWide(wide: boolean) {
  window.matchMedia = vi.fn((query: string) => ({
    matches: wide && query.includes('min-width'),
    media: query,
    onchange: null,
    addEventListener: () => {},
    removeEventListener: () => {},
    addListener: () => {},
    removeListener: () => {},
    dispatchEvent: () => false,
  })) as unknown as typeof window.matchMedia
}

afterEach(() => {
  // @ts-expect-error restore jsdom's missing matchMedia
  delete window.matchMedia
})

describe('Help me choose', () => {
  it('Help me choose opens the sheet; Escape closes it and returns focus', async () => {
    const user = userEvent.setup()
    renderApp()
    const trigger = screen.getAllByRole('button', { name: 'Help me choose' })[0]
    await user.click(trigger)
    expect(sheet()).toBeInTheDocument()
    await user.keyboard('{Escape}')
    expect(screen.queryByRole('dialog', { name: 'Help me choose' })).not.toBeInTheDocument()
    await waitFor(() => expect(trigger).toHaveFocus())
  })

  it('example prompts fill the textarea', async () => {
    const user = userEvent.setup()
    renderApp()
    const dialog = await openSheet(user)
    const examples = within(within(dialog).getByRole('group', { name: 'Examples' })).getAllByRole('button')
    expect(examples).toHaveLength(3)
    await user.click(examples[0])
    expect(within(dialog).getByRole('textbox', { name: /Describe your project/ })).toHaveValue(examples[0].textContent)
    // Each example is picked up straight away.
    expect(within(dialog).getByRole('list', { name: 'Picked up from your description' })).toBeInTheDocument()
  })

  it('every example prompt sets a project type, features and a language', () => {
    for (const example of EXAMPLES) {
      const found = match(example, kb)
      expect(found.projectType).not.toBeNull()
      expect(found.capabilities.length).toBeGreaterThan(0)
      expect(found.languagesPrefer.length + found.languagesAvoid.length).toBeGreaterThan(0)
    }
  })

  it('typing a description shows detected chips; removing a chip updates answers', async () => {
    const user = userEvent.setup()
    renderApp()
    const dialog = await openSheet(user)
    const box = within(dialog).getByRole('textbox', { name: /Describe your project/ })
    await user.type(box, 'A saas with payments and realtime chat in python, no php')
    // Picked up on the typing pause, with no button press.
    const chips = await within(dialog).findByRole('list', { name: 'Picked up from your description' })
    for (const name of ['SaaS product', 'Payments', 'Realtime', 'Python', 'Avoid PHP']) {
      expect(within(chips).getByText(name)).toBeInTheDocument()
    }
    expect(within(dialog).getByText(/We picked up/)).toBeInTheDocument()

    expect(within(dialog).getByRole('checkbox', { name: /^Payments/ })).toBeChecked()
    await user.click(within(chips).getByRole('button', { name: 'Remove Payments' }))
    expect(within(chips).queryByText('Payments')).not.toBeInTheDocument()
    expect(within(dialog).getByRole('checkbox', { name: /^Payments/ })).not.toBeChecked()

    await user.click(within(chips).getByRole('button', { name: 'Remove Python' }))
    expect(within(dialog).getByRole('button', { name: 'Python: no preference' })).toBeInTheDocument()
  })

  it('nothing detected shows the "didn\'t recognise" message', async () => {
    const user = userEvent.setup()
    renderApp()
    await openSheet(user)
    await describeProject(user, 'something for my aunt')
    expect(
      within(sheet()).getByText("We didn't recognise anything specific. Answer the questions below."),
    ).toBeInTheDocument()
    expect(within(sheet()).queryByRole('list', { name: 'Picked up from your description' })).not.toBeInTheDocument()
  })

  it('questions are pre-filled from detection', async () => {
    const user = userEvent.setup()
    renderApp()
    const dialog = await openSheet(user)
    await describeProject(user, 'An online store with product search, python, no php')
    const type = within(dialog).getByRole('radiogroup', { name: /What are you building/ })
    expect(within(type).getByRole('radio', { name: 'Online store' })).toBeChecked()
    expect(within(dialog).getByRole('checkbox', { name: /^Full-text search/ })).toBeChecked()
    expect(within(dialog).getByRole('button', { name: 'Python: prefer' })).toBeInTheDocument()
    expect(within(dialog).getByRole('button', { name: 'PHP: avoid' })).toBeInTheDocument()
    // Questions the text cannot answer keep their defaults.
    expect(within(within(dialog).getByRole('radiogroup', { name: 'Hosting' })).getByRole('radio', { name: 'Either' })).toBeChecked()
    expect(within(within(dialog).getByRole('radiogroup', { name: 'Scale' })).getByRole('radio', { name: 'Startup' })).toBeChecked()
    expect(within(dialog).getByRole('switch', { name: /Include dev tooling/ })).toBeChecked()
  })

  it('languages cycle through prefer, avoid and no preference; known tools are searchable', async () => {
    const user = userEvent.setup()
    renderApp()
    const dialog = await openSheet(user)
    await user.click(within(dialog).getByRole('button', { name: 'Go: no preference' }))
    await user.click(within(dialog).getByRole('button', { name: 'Go: prefer' }))
    expect(within(dialog).getByRole('button', { name: 'Go: avoid' })).toBeInTheDocument()

    const known = within(dialog).getByRole('combobox', { name: 'Tools you already know' })
    await user.type(known, 'postgres')
    await user.click(within(dialog).getByRole('option', { name: /PostgreSQL/ }))
    expect(within(dialog).getByRole('button', { name: 'Remove PostgreSQL' })).toBeInTheDocument()
    expect(known).toHaveValue('')

    await showStack(user)
    expect(params().get('la')).toBe('go')
    expect(params().get('k')).toBe('postgresql')
  })

  it('Show my stack disabled until project type set', async () => {
    const user = userEvent.setup()
    renderApp()
    const dialog = await openSheet(user)
    const show = within(dialog).getByRole('button', { name: 'Show my stack' })
    expect(show).toBeDisabled()
    expect(show).toHaveAccessibleDescription('Pick what you are building first.')
    await user.click(within(dialog).getByRole('radio', { name: 'Web app' }))
    expect(show).toBeEnabled()
  })

  it('picking API only by hand pre-selects the REST API feature, which stays removable', async () => {
    const user = userEvent.setup()
    renderApp()
    const dialog = await openSheet(user)
    const rest = within(dialog).getByRole('checkbox', { name: /^REST API/ })
    expect(rest).not.toBeChecked()
    await user.click(within(dialog).getByRole('radio', { name: 'API only' }))
    expect(rest).toBeChecked()
    await user.click(rest)
    expect(rest).not.toBeChecked()
    // Another type does not add it.
    await user.click(within(dialog).getByRole('radio', { name: 'Web app' }))
    expect(rest).not.toBeChecked()
  })

  it('result replaces the questions with one row per selected layer (pick, why, watch-out)', async () => {
    const user = userEvent.setup()
    renderApp()
    await openSheet(user)
    await showStack(user, 'SaaS product')

    const heading = screen.getByRole('heading', { name: 'Your stack' })
    expect(heading).toHaveFocus()
    expect(within(sheet()).queryByRole('radiogroup', { name: /What are you building/ })).not.toBeInTheDocument()

    const answers = decode(search().slice(1), kb).answers
    const expected = scoreStack(answers, kb)
    expect(rows()).toHaveLength(expected.length)
    expected.forEach((result, i) => {
      const row = rows()[i]
      if (!result.pick) return
      const tool = toolById(result.pick)!
      expect(within(row).getByRole('button', { name: new RegExp(`^${tool.name}, show on the map`) })).toBeInTheDocument()
      expect(within(row).getByText(/Good for|Ranked first/)).toBeInTheDocument()
      if (tool.avoid_when[0]) expect(within(row).getByText(tool.avoid_when[0])).toBeInTheDocument()
    })
  })

  it('alternative chip focuses that tool on the map', async () => {
    const user = userEvent.setup()
    renderApp()
    await openSheet(user)
    await showStack(user)
    const row = rows().find((r) => within(r).queryByRole('list', { name: 'Also fits' }))!
    const alternative = within(within(row).getByRole('list', { name: 'Also fits' })).getAllByRole('button')[0]
    const name = alternative.textContent
    await user.click(alternative)
    const id = params().get('focus')
    expect(toolById(id ?? '')?.name).toBe(name)
    expect(graph.props?.focus).toBe(id)
    // The stack stays in the URL and lit on the map.
    expect(params().get('t')).toBe('saas')
    expect(graph.props?.highlight?.length).toBeGreaterThan(0)
  })

  it('pick name focuses that tool on the map', async () => {
    const user = userEvent.setup()
    renderApp()
    await openSheet(user)
    await showStack(user)
    const pick = within(rows()[0]).getByRole('button', { name: /show on the map/ })
    await user.click(pick)
    const name = (pick.textContent ?? '').replace(', show on the map', '')
    expect(screen.getByRole('dialog', { name })).toBeInTheDocument()
    expect(params().get('focus')).toBe(kb.tools.find((t) => t.name === name)?.id)
  })

  it('null pick row shows No match and reasons', async () => {
    // Avoiding JavaScript and TypeScript leaves no frontend.
    const answers = decode('t=web-app&la=javascript,typescript', kb).answers
    const empty = scoreStack(answers, kb).filter((r) => r.pick === null)
    expect(empty.length).toBeGreaterThan(0)

    renderApp('/?t=web-app&la=javascript,typescript')
    const row = screen.getByRole('listitem', { name: layerName(empty[0].layer) })
    expect(within(row).getByText('No match')).toBeInTheDocument()
    expect(within(row).getByText(/^Each tool that came close uses only languages you want to avoid/)).toBeInTheDocument()
    expect(within(row).queryByRole('button', { name: /show on the map/ })).not.toBeInTheDocument()
  })

  it('Score and Excluded disclosures list labelled codes', async () => {
    renderApp('/?t=saas&lp=python&c=payments&h=managed&b=free')
    const all = rows()
    const scored = all.find((r) => within(r).queryByText('Score', { selector: 'summary' }))!
    const score = within(scored).getByText('Score', { selector: 'summary' }).closest('details')!
    expect(within(score).getAllByRole('listitem').length).toBeGreaterThan(0)
    // Codes read as words, never as raw codes.
    expect(score.textContent).not.toMatch(/capability:|pairs-with:|maturity-/)
    expect(score.textContent).toMatch(/\+\d/)

    const withExcluded = all.find((r) => within(r).queryByText('Excluded', { selector: 'summary' }))!
    const excluded = within(withExcluded).getByText('Excluded', { selector: 'summary' }).closest('details')!
    expect(excluded.textContent).toMatch(/does not|has no|uses only/)
    expect(excluded.textContent).not.toMatch(/language-required|hosting-mismatch|budget-paid-only/)
  })

  it('map highlights picks and dims the rest while a result is shown', async () => {
    const user = userEvent.setup()
    renderApp()
    await openSheet(user)
    await screen.findByTestId('stack-graph')
    expect(graph.props?.highlight ?? []).toEqual([])
    await showStack(user)
    const picks = scoreStack(decode(search().slice(1), kb).answers, kb)
      .map((r) => r.pick)
      .filter((p): p is string => p !== null)
    expect(graph.props?.highlight).toEqual(picks)

    await user.click(screen.getByRole('button', { name: 'Edit answers' }))
    expect(graph.props?.highlight ?? []).toEqual([])
  })

  it('Copy link writes the encoded URL; free text absent', async () => {
    const user = userEvent.setup()
    renderApp('/?focus=express')
    await openSheet(user)
    await describeProject(user, 'A saas for my grandmother with payments in python')
    await user.click(within(sheet()).getByRole('button', { name: 'Show my stack' }))
    await user.click(screen.getByRole('button', { name: 'Copy link' }))
    const copied = await navigator.clipboard.readText()
    const url = new URL(copied)
    expect(url.searchParams.get('t')).toBe('saas')
    expect(url.searchParams.get('c')).toContain('payments')
    expect(url.searchParams.get('lp')).toBe('python')
    expect(copied).not.toMatch(/grandmother/i)
    expect(search()).not.toMatch(/grandmother/i)
    expect(screen.getByText('Link copied.')).toBeInTheDocument()
    // The page URL keeps other params and gets the share keys.
    expect(params().get('focus')).toBe('express')
    expect(params().get('t')).toBe('saas')
  })

  it('opening a share URL opens the sheet on the result; ignored values show a notice', async () => {
    const first = renderApp('/?t=saas&c=payments,teleport&h=managed')
    expect(sheet()).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Your stack' })).toBeInTheDocument()
    expect(rows().length).toBeGreaterThan(0)
    expect(screen.getByText(/Some parts of this link were ignored: capability "teleport"/)).toBeInTheDocument()
    first.unmount()

    renderApp(`/?t=saas&c=${'x'.repeat(5000)}`)
    expect(screen.getByText(/This link is too long to read/)).toBeInTheDocument()
    expect(screen.queryByRole('heading', { name: 'Your stack' })).not.toBeInTheDocument()
  })

  it('a link with an unknown project type opens the questions with a notice', () => {
    renderApp('/?t=spaceship')
    expect(sheet()).toBeInTheDocument()
    expect(screen.getByText(/Some parts of this link were ignored: project type "spaceship"/)).toBeInTheDocument()
    expect(within(sheet()).getByRole('button', { name: 'Show my stack' })).toBeDisabled()
  })

  it('Edit answers returns to questions with answers kept', async () => {
    const user = userEvent.setup()
    renderApp('/?t=api-only&lp=go&s=high')
    await user.click(screen.getByRole('button', { name: 'Edit answers' }))
    const dialog = sheet()
    expect(within(dialog).getByRole('radio', { name: 'API only' })).toBeChecked()
    expect(within(dialog).getByRole('radio', { name: 'API only' })).toHaveFocus()
    expect(within(dialog).getByRole('button', { name: 'Go: prefer' })).toBeInTheDocument()
    expect(within(within(dialog).getByRole('radiogroup', { name: 'Scale' })).getByRole('radio', { name: 'High traffic' })).toBeChecked()
  })

  it('result recomputes live as answers change', async () => {
    const user = userEvent.setup()
    renderApp('/?t=api-only')
    const before = rows().length
    await user.click(screen.getByRole('button', { name: 'Edit answers' }))
    await user.click(within(sheet()).getByRole('switch', { name: /Include dev tooling/ }))
    await user.click(within(sheet()).getByRole('button', { name: 'Show my stack' }))
    expect(rows().length).toBeLessThan(before)
    expect(params().get('tool')).toBe('0')
  })

  it('Start over clears answers, highlight and URL', async () => {
    const user = userEvent.setup()
    renderApp('/?t=saas&lp=python&focus=express')
    await waitFor(() => expect(graph.props?.highlight?.length).toBeGreaterThan(0))
    await user.click(screen.getByRole('button', { name: 'Start over' }))
    for (const key of SHARE_KEYS) expect(params().has(key)).toBe(false)
    expect(params().get('focus')).toBe('express')
    expect(graph.props?.highlight ?? []).toEqual([])
    const dialog = sheet()
    expect(within(dialog).getByRole('button', { name: 'Show my stack' })).toBeDisabled()
    expect(within(dialog).getByRole('button', { name: 'Python: no preference' })).toBeInTheDocument()
    expect(within(dialog).getByRole('textbox', { name: /Describe your project/ })).toHaveValue('')
    expect(within(dialog).getByRole('textbox', { name: /Describe your project/ })).toHaveFocus()
  })

  it('features come in labelled groups; an explanation shows once checked or with the toggle', async () => {
    const user = userEvent.setup()
    renderApp()
    const dialog = await openSheet(user)
    const groups = within(dialog).getAllByRole('group').filter((g) => within(g).queryAllByRole('checkbox').length)
    expect(groups.length).toBeGreaterThanOrEqual(4)
    expect(groups.length).toBeLessThanOrEqual(6)
    const all = groups.flatMap((g) => within(g).getAllByRole('checkbox'))
    expect(all).toHaveLength(kb.vocab.capabilities.length)
    for (const group of groups) expect(group).toHaveAccessibleName(/./)

    const payments = within(dialog).getByRole('checkbox', { name: 'Payments' })
    const explain = kb.vocab.capabilities.find((c) => c.id === 'payments')!.explain
    expect(payments).toHaveAccessibleDescription(explain)
    const note = document.getElementById(payments.getAttribute('aria-describedby')!)!
    expect(note).toHaveClass('sr-only')
    // With nothing to show, the group's explanation list takes no space either.
    expect(note.parentElement).toHaveClass('sr-only')
    await user.click(payments)
    expect(note).not.toHaveClass('sr-only')
    expect(note.parentElement).not.toHaveClass('sr-only')

    const realtime = within(dialog).getByRole('checkbox', { name: 'Realtime' })
    const realtimeNote = document.getElementById(realtime.getAttribute('aria-describedby')!)!
    expect(realtimeNote).toHaveClass('sr-only')
    await user.click(within(dialog).getByRole('button', { name: 'Show what each one means' }))
    expect(realtimeNote).not.toHaveClass('sr-only')
  })

  it('the summary lists every layer and jumps to its row', async () => {
    const user = userEvent.setup()
    renderApp('/?t=web-app&la=javascript,typescript')
    const summary = screen.getByRole('navigation', { name: 'Jump to a layer' })
    const jumps = within(summary).getAllByRole('button')
    expect(jumps).toHaveLength(rows().length)
    expect(within(summary).getByRole('button', { name: 'Frontend: No match' })).toBeInTheDocument()
    await user.click(within(summary).getByRole('button', { name: 'Frontend: No match' }))
    const row = screen.getByRole('listitem', { name: 'Frontend' })
    expect(within(row).getByRole('heading', { level: 4 })).toHaveFocus()
  })

  it('on a phone, See on the map closes the sheet and keeps the stack lit', async () => {
    const user = userEvent.setup()
    renderApp('/?t=saas')
    await waitFor(() => expect(graph.props?.highlight?.length).toBeGreaterThan(0))
    expect(screen.queryByText(/Picks are lit on the map/)).not.toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'See on the map' }))
    expect(screen.queryByRole('dialog', { name: 'Help me choose' })).not.toBeInTheDocument()
    expect(graph.props?.highlight?.length).toBeGreaterThan(0)
    expect(params().get('t')).toBe('saas')
  })

  it('the link notice goes once an answer changes', async () => {
    const user = userEvent.setup()
    renderApp('/?t=spaceship')
    expect(screen.getByText(/Some parts of this link were ignored/)).toBeInTheDocument()
    await user.click(within(sheet()).getByRole('radio', { name: 'Web app' }))
    expect(screen.queryByText(/Some parts of this link were ignored/)).not.toBeInTheDocument()
  })

  it('detected chips sit right under the description, before the examples', async () => {
    const user = userEvent.setup()
    renderApp()
    const dialog = await openSheet(user)
    await describeProject(user, 'a saas in python')
    const chips = within(dialog).getByRole('list', { name: 'Picked up from your description' })
    const examples = within(dialog).getByRole('group', { name: 'Examples' })
    expect(chips.compareDocumentPosition(examples) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
  })

  it('full-height sheet under 1024 px', async () => {
    const user = userEvent.setup()
    renderApp()
    const dialog = await openSheet(user)
    expect(dialog).toHaveClass('fixed', 'inset-0')
    expect(dialog).toHaveClass('lg:w-[440px]')
    // No scrim: the map stays visible beside the sheet from 1024 px.
    expect(document.querySelector('[data-slot="sheet-overlay"]')).toBeNull()
  })

  it('below 1024 px the sheet is modal: the page behind it is hidden and out of reach', async () => {
    const user = userEvent.setup()
    renderApp()
    await openSheet(user)
    const map = document.getElementById('map')!
    expect(map.closest('[aria-hidden="true"]')).not.toBeNull()
    // Tab cycles inside the sheet and never reaches the search field behind it.
    const searchBox = screen.getAllByRole('combobox', { hidden: true })[0]
    for (let i = 0; i < 60; i++) {
      await user.tab()
      expect(searchBox).not.toHaveFocus()
      expect(sheet().contains(document.activeElement)).toBe(true)
    }
  })

  it('from 1024 px the sheet is not modal: the map stays reachable beside it', async () => {
    setWide(true)
    const user = userEvent.setup()
    renderApp()
    await openSheet(user)
    expect(document.getElementById('map')!.closest('[aria-hidden="true"]')).toBeNull()
  })

  it('closing the sheet keeps the stack lit and offers Clear stack on the map', async () => {
    const user = userEvent.setup()
    renderApp('/?t=saas&focus=express')
    await waitFor(() => expect(graph.props?.highlight?.length).toBeGreaterThan(0))
    // While the sheet is open, the sheet has its own Start over.
    expect(screen.queryByRole('button', { name: 'Clear stack' })).not.toBeInTheDocument()
    await user.click(within(sheet()).getByRole('button', { name: 'Close' }))
    expect(screen.queryByRole('dialog', { name: 'Help me choose' })).not.toBeInTheDocument()
    expect(graph.props?.highlight?.length).toBeGreaterThan(0)
    expect(params().get('t')).toBe('saas')

    await user.click(screen.getByRole('button', { name: 'Clear stack' }))
    expect(graph.props?.highlight ?? []).toEqual([])
    for (const key of SHARE_KEYS) expect(params().has(key)).toBe(false)
    expect(params().get('focus')).toBe('express')
    expect(screen.queryByRole('button', { name: 'Clear stack' })).not.toBeInTheDocument()
  })

  it('Edit answers takes the stack out of the URL until Show my stack is pressed again', async () => {
    const user = userEvent.setup()
    renderApp('/?t=api-only&lp=go')
    await user.click(screen.getByRole('button', { name: 'Edit answers' }))
    for (const key of SHARE_KEYS) expect(params().has(key)).toBe(false)
    await user.click(within(sheet()).getByRole('button', { name: 'Show my stack' }))
    expect(params().get('t')).toBe('api-only')
    expect(params().get('lp')).toBe('go')
  })

  it('free text never reaches storage', async () => {
    const user = userEvent.setup()
    const setItem = vi.spyOn(Storage.prototype, 'setItem')
    renderApp()
    await openSheet(user)
    await describeProject(user, 'secret project for my bakery')
    await act(async () => {})
    for (const call of setItem.mock.calls) expect(String(call[1])).not.toMatch(/bakery/)
    setItem.mockRestore()
  })
})
