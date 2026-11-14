import { act, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, useLocation } from 'react-router'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { StackGraphProps } from '@/components/graph/StackGraph'
import App from '@/App'
import { groupsFor, hasOption, matchLabel, matchTools, narrowingOptions } from '@/engine/facets'
import { match } from '@/engine/match'
import { scoreStack } from '@/engine/score'
import { decode } from '@/engine/share'
import { kb, toolById, type Layer } from '@/lib/kb'
import { EXAMPLES } from './examples'
import { CAPABILITY_LABELS, PIECES, plainLayerName, PROJECT_TYPES } from './plain'

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
const SHARE_KEYS = ['t', 'lp', 'la', 'c', 'h', 'b', 's', 'k', 'tool', 'm', 'l', 'f']

async function openSheet(user: ReturnType<typeof userEvent.setup>) {
  await user.click(screen.getAllByRole('button', { name: 'Help me choose' })[0])
  return sheet()
}

async function describeProject(user: ReturnType<typeof userEvent.setup>, text: string) {
  const box = within(sheet()).getByRole('textbox', { name: /describe it in your own words/i })
  await user.clear(box)
  await user.type(box, text)
  // Detection runs on a typing pause; Read description runs it at once.
  await user.click(within(sheet()).getByRole('button', { name: 'Fill in from my description' }))
}

/** Picks a project type; the stack shows at once, with no button to press. */
async function showStack(user: ReturnType<typeof userEvent.setup>, type = 'Subscription app') {
  const dialog = sheet()
  await user.click(within(within(dialog).getByRole('radiogroup', { name: /What are you building/ })).getByRole('radio', { name: type }))
}

/** Opens the "I have preferences" section if it is closed. */
async function openPreferences(user: ReturnType<typeof userEvent.setup>) {
  const toggle = within(sheet()).getByRole('button', { name: /I have preferences/ })
  if (toggle.getAttribute('aria-expanded') !== 'true') await user.click(toggle)
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

  it('Escape closes the sheet while focus is on a project type chip', async () => {
    const user = userEvent.setup()
    renderApp()
    await openSheet(user)
    await showStack(user)
    const radio = within(within(sheet()).getByRole('radiogroup', { name: /What are you building/ })).getByRole('radio', { name: 'Subscription app' })
    expect(radio).toHaveFocus()
    await user.keyboard('{Escape}')
    expect(screen.queryByRole('dialog', { name: 'Help me choose' })).not.toBeInTheDocument()
  })

  it('example prompts fill the textarea', async () => {
    const user = userEvent.setup()
    renderApp()
    const dialog = await openSheet(user)
    await user.click(within(dialog).getByRole('button', { name: 'Show examples' }))
    const examples = within(within(dialog).getByRole('group', { name: 'Examples' })).getAllByRole('button')
    expect(examples).toHaveLength(3)
    await user.click(examples[0])
    expect(within(dialog).getByRole('textbox', { name: /describe it in your own words/i })).toHaveValue(examples[0].textContent)
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
    const box = within(dialog).getByRole('textbox', { name: /describe it in your own words/i })
    await user.type(box, 'A saas with payments and realtime chat in python, no php')
    // Picked up on the typing pause, with no button press.
    const chips = await within(dialog).findByRole('list', { name: 'Picked up from your description' })
    for (const name of ['Subscription app', 'Take payments', 'Live updates', 'Python', 'Avoid PHP']) {
      expect(within(chips).getByText(name)).toBeInTheDocument()
    }
    expect(within(dialog).getByText(/We picked up/)).toBeInTheDocument()

    expect(within(dialog).getByRole('checkbox', { name: /^Take payments/ })).toBeChecked()
    await user.click(within(chips).getByRole('button', { name: 'Remove Take payments' }))
    expect(within(chips).queryByText('Take payments')).not.toBeInTheDocument()
    expect(within(dialog).getByRole('checkbox', { name: /^Take payments/ })).not.toBeChecked()

    await user.click(within(chips).getByRole('button', { name: 'Remove Python' }))
    await openPreferences(user)
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
    expect(within(dialog).getByRole('checkbox', { name: /^A search box/ })).toBeChecked()
    await openPreferences(user)
    expect(within(dialog).getByRole('button', { name: 'Python: prefer' })).toBeInTheDocument()
    expect(within(dialog).getByRole('button', { name: 'PHP: avoid' })).toBeInTheDocument()
    // Questions the text cannot answer keep their defaults.
    expect(within(within(dialog).getByRole('radiogroup', { name: 'Where should it run?' })).getByRole('radio', { name: 'Either' })).toBeChecked()
    expect(within(within(dialog).getByRole('radiogroup', { name: 'How big will it get?' })).getByRole('radio', { name: 'Real customers' })).toBeChecked()
    expect(within(dialog).getByRole('switch', { name: /Include dev tooling/ })).toBeChecked()
  })

  it('languages cycle through prefer, avoid and no preference; known tools are searchable', async () => {
    const user = userEvent.setup()
    renderApp()
    const dialog = await openSheet(user)
    // Languages and known tools sit in a closed "I have preferences" section.
    expect(within(dialog).queryByRole('button', { name: 'Go: no preference' })).not.toBeInTheDocument()
    await openPreferences(user)
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

  it('no stack and no link until a project type is chosen, then the stack shows at once', async () => {
    const user = userEvent.setup()
    renderApp()
    const dialog = await openSheet(user)
    expect(within(dialog).getByText('Pick what you are building to see your stack.')).toBeInTheDocument()
    expect(within(dialog).queryByRole('button', { name: 'Copy link' })).not.toBeInTheDocument()
    expect(within(dialog).queryByRole('button', { name: /Show my stack|Edit answers/ })).not.toBeInTheDocument()
    expect(params().has('t')).toBe(false)
    await user.click(within(dialog).getByRole('radio', { name: 'Web app' }))
    expect(screen.getByRole('heading', { name: 'Your stack' })).toBeInTheDocument()
    expect(params().get('t')).toBe('web-app')
    expect(within(dialog).getByRole('button', { name: /^Your stack \(\d+\)$/ })).toBeInTheDocument()
  })

  it('project types read in plain words with a hint, and every feature, type and part has a plain name', async () => {
    const user = userEvent.setup()
    renderApp()
    const dialog = await openSheet(user)
    const types = within(within(dialog).getByRole('radiogroup', { name: /What are you building/ })).getAllByRole('radio')
    expect(types).toHaveLength(kb.vocab.project_types.length)
    const store = within(dialog).getByRole('radio', { name: 'Online store' })
    expect(store).toHaveAccessibleDescription('Sell products with a cart and checkout')
    for (const p of kb.vocab.project_types) expect(PROJECT_TYPES[p.id]).toBeDefined()
    for (const c of kb.vocab.capabilities) expect(CAPABILITY_LABELS[c.id]).toBeDefined()
    expect(PIECES.map((p) => p.layer).sort()).toEqual([...kb.layers].sort())
  })

  it('picking a service for other apps by hand ticks Let other apps connect, which stays removable', async () => {
    const user = userEvent.setup()
    renderApp()
    const dialog = await openSheet(user)
    const rest = within(dialog).getByRole('checkbox', { name: /^Let other apps connect/ })
    expect(rest).not.toBeChecked()
    await user.click(within(dialog).getByRole('radio', { name: 'Service for other apps' }))
    expect(rest).toBeChecked()
    await user.click(rest)
    expect(rest).not.toBeChecked()
    // Another type does not add it.
    await user.click(within(dialog).getByRole('radio', { name: 'Web app' }))
    expect(rest).not.toBeChecked()
  })

  it('the stack sits under the questions with one row per selected layer (pick, why, watch-out)', async () => {
    const user = userEvent.setup()
    renderApp()
    await openSheet(user)
    await showStack(user, 'Subscription app')

    const heading = screen.getByRole('heading', { name: 'Your stack' })
    // Questions and stack stay together, so focus stays on the answer just given.
    expect(within(sheet()).getByRole('radio', { name: 'Subscription app' })).toHaveFocus()
    const questions = within(sheet()).getByRole('radiogroup', { name: /What are you building/ })
    expect(questions.compareDocumentPosition(heading) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()

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
    const row = screen.getByRole('listitem', { name: plainLayerName(empty[0].layer) })
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

    // Another answer relights the map at once.
    await user.click(within(sheet()).getByRole('radio', { name: 'Free only' }))
    const again = scoreStack(decode(search().slice(1), kb).answers, kb)
      .map((r) => r.pick)
      .filter((p): p is string => p !== null)
    expect(graph.props?.highlight).toEqual(again)

    // The One piece tab lights nothing until a part is chosen.
    await user.click(within(sheet()).getByRole('tab', { name: 'One piece' }))
    expect(graph.props?.highlight ?? []).toEqual([])
  })

  it('Copy link writes the encoded URL; free text absent', async () => {
    const user = userEvent.setup()
    renderApp('/?focus=express')
    await openSheet(user)
    await describeProject(user, 'A saas for my grandmother with payments in python')
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
    expect(within(sheet()).getByText('Pick what you are building to see your stack.')).toBeInTheDocument()
  })

  it('a link from before keeps its answers in the questions, with its preferences open', async () => {
    renderApp('/?t=api-only&lp=go&s=high')
    const dialog = sheet()
    expect(within(dialog).getByRole('tab', { name: 'Whole stack' })).toHaveAttribute('aria-selected', 'true')
    expect(within(dialog).getByRole('radio', { name: 'Service for other apps' })).toBeChecked()
    expect(within(dialog).getByRole('button', { name: 'Go: prefer' })).toBeInTheDocument()
    expect(within(within(dialog).getByRole('radiogroup', { name: 'How big will it get?' })).getByRole('radio', { name: 'Very busy' })).toBeChecked()
    expect(screen.getByRole('heading', { name: 'Your stack' })).toBeInTheDocument()
  })

  it('result recomputes live as answers change', async () => {
    const user = userEvent.setup()
    renderApp('/?t=api-only')
    const before = rows().length
    await openPreferences(user)
    await user.click(within(sheet()).getByRole('switch', { name: /Include dev tooling/ }))
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
    expect(within(dialog).getByText('Pick what you are building to see your stack.')).toBeInTheDocument()
    await openPreferences(user)
    expect(within(dialog).getByRole('button', { name: 'Python: no preference' })).toBeInTheDocument()
    expect(within(dialog).getByRole('textbox', { name: /describe it in your own words/i })).toHaveValue('')
    expect(within(dialog).getByRole('textbox', { name: /describe it in your own words/i })).toHaveFocus()
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

    const payments = within(dialog).getByRole('checkbox', { name: 'Take payments' })
    const explain = kb.vocab.capabilities.find((c) => c.id === 'payments')!.explain
    expect(payments).toHaveAccessibleDescription(explain)
    const note = document.getElementById(payments.getAttribute('aria-describedby')!)!
    expect(note).toHaveClass('sr-only')
    // With nothing to show, the group's explanation list takes no space either.
    expect(note.parentElement).toHaveClass('sr-only')
    await user.click(payments)
    expect(note).not.toHaveClass('sr-only')
    expect(note.parentElement).not.toHaveClass('sr-only')

    const realtime = within(dialog).getByRole('checkbox', { name: 'Live updates' })
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
    expect(within(summary).getByRole('button', { name: 'Screens (frontend): No match' })).toBeInTheDocument()
    await user.click(within(summary).getByRole('button', { name: 'Screens (frontend): No match' }))
    const row = screen.getByRole('listitem', { name: 'Screens (frontend)' })
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
    const examples = within(dialog).getByRole('button', { name: 'Show examples' })
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

  it('the link follows every answer while a project type is chosen', async () => {
    const user = userEvent.setup()
    renderApp('/?t=api-only&lp=go')
    await user.click(within(sheet()).getByRole('radio', { name: 'Web app' }))
    expect(params().get('t')).toBe('web-app')
    expect(params().get('lp')).toBe('go')
    await user.click(within(sheet()).getByRole('radio', { name: 'My own servers' }))
    expect(params().get('h')).toBe('self-hosted')
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

describe('Help me choose, One piece', () => {
  const piece = () => within(sheet()).getByRole('tabpanel', { name: 'One piece' })
  const matchRows = () => within(screen.getByRole('list', { name: 'Matching tools' })).getAllByRole('button')
  const status = () => within(piece()).getByRole('status')
  const priceTag = (t: { pricing: string[] }) =>
    t.pricing.includes('oss') ? 'Open source' : t.pricing.includes('free-tier') ? 'Free tier' : 'Paid'

  async function pickPart(user: ReturnType<typeof userEvent.setup>, part = 'Database') {
    await user.click(within(sheet()).getByRole('tab', { name: 'One piece' }))
    await user.click(within(piece()).getByRole('button', { name: part }))
  }

  it('two tabs, Whole stack first; One piece asks which part, in plain names, and goes in the link', async () => {
    const user = userEvent.setup()
    renderApp()
    const dialog = await openSheet(user)
    const tabs = within(within(dialog).getByRole('tablist')).getAllByRole('tab')
    expect(tabs.map((t) => t.textContent)).toEqual(['Whole stack', 'One piece'])
    expect(tabs[0]).toHaveAttribute('aria-selected', 'true')
    // The sheet opens with focus on the open tab; arrow keys move between tabs.
    expect(tabs[0]).toHaveFocus()
    await user.keyboard('{ArrowRight}')
    expect(tabs[1]).toHaveFocus()
    expect(tabs[1]).toHaveAttribute('aria-selected', 'true')
    expect(within(piece()).getByRole('heading', { name: 'Which part do you need help with?' })).toBeInTheDocument()
    const parts = within(within(piece()).getByRole('list', { name: 'Which part do you need help with?' })).getAllByRole('button')
    expect(parts.slice(0, 11).map((b) => b.textContent)).toEqual([
      'Database', 'Hosting', 'Sign-in', 'Payments', 'Email', 'File storage', 'Search', 'Content editing', 'Mobile app', 'Background jobs', 'Cache',
    ])
    expect(parts.map((b) => b.textContent)).toContain('Screens (frontend)')
    expect(parts.map((b) => b.textContent)).toContain('Server code (backend)')
    expect(parts).toHaveLength(kb.layers.length)
    await waitFor(() => expect(params().get('m')).toBe('piece'))
    expect(within(dialog).getByText('Pick a part to see the tools that fit.')).toBeInTheDocument()
  })

  it('picking a part shows its questions, every tool of it as a match, and lights them on the map', async () => {
    const user = userEvent.setup()
    renderApp()
    await openSheet(user)
    await pickPart(user)
    expect(within(piece()).getByRole('heading', { name: 'Which database?' })).toHaveFocus()
    const legends = within(piece())
      .getAllByRole('group')
      .concat(within(piece()).getAllByRole('radiogroup'))
      .map((g) => g.getAttribute('aria-labelledby'))
      .map((labelId) => document.getElementById(labelId!)!.textContent)
    expect(legends.sort()).toEqual(
      ['What do you need it for?', 'Where should it run?', 'How big will it get?', 'Does it have to be open source?'].sort(),
    )
    const all = matchTools('database', {}, kb)
    expect(status()).toHaveTextContent(`${all.length} matches`)
    expect(matchRows()).toHaveLength(all.length)
    expect(graph.props?.highlight).toEqual(all.map((t) => t.id))
    expect(params().get('l')).toBe('database')
    // Need answers are two-line chips: the name, then a hint.
    expect(within(piece()).getByRole('checkbox', { name: 'AI and vectors' })).toHaveAccessibleDescription(
      'Power AI features that find similar things',
    )
  })

  it('answers narrow the list, the count and the map; the link keeps them', async () => {
    const user = userEvent.setup()
    renderApp()
    await openSheet(user)
    await pickPart(user)
    await user.click(within(piece()).getByRole('checkbox', { name: 'AI and vectors' }))
    await user.click(within(piece()).getByRole('checkbox', { name: 'Managed for me' }))
    const expected = matchTools('database', { need: ['vectors'], run: ['managed'] }, kb)
    expect(expected.length).toBeGreaterThan(0)
    expect(status()).toHaveTextContent(`${expected.length} ${expected.length === 1 ? 'match' : 'matches'}`)
    const selection = { need: ['vectors'], run: ['managed'] }
    expect(matchRows().map((r) => r.textContent)).toEqual(expected.map((t) => `${t.name}${matchLabel(t, selection, kb)}${priceTag(t)}`))
    expect(matchRows().some((r) => r.textContent?.includes('AI and vectors'))).toBe(false)
    expect(graph.props?.highlight).toEqual(expected.map((t) => t.id))
    expect(params().get('f')).toBe('need:vectors,run:managed')
  })

  it('only options that would narrow the matches show; a chosen one stays', async () => {
    const user = userEvent.setup()
    renderApp()
    await openSheet(user)
    await pickPart(user, 'Sign-in')
    const need = kb.vocab.facets.auth![0]
    const visible = narrowingOptions('auth', {}, kb).need
    const shown = within(piece())
      .getAllByRole('checkbox')
      .map((c) => document.getElementById(c.getAttribute('aria-labelledby')!)!.textContent)
    for (const option of need.options) expect(shown.includes(option.label)).toBe(visible.includes(option.id))
    // Some sign-in uses are on every tool: they never show as a filter.
    expect(visible.length).toBeLessThan(need.options.length)

  })

  it('a one-answer question has a no-preference answer that clears it', async () => {
    const user = userEvent.setup()
    renderApp()
    await openSheet(user)
    await pickPart(user)
    const license = within(piece()).getByRole('radiogroup', { name: 'Does it have to be open source?' })
    expect(within(license).getByRole('radio', { name: 'Anything' })).toBeChecked()
    await user.click(within(license).getByRole('radio', { name: 'Open source only' }))
    expect(params().get('f')).toBe('license:oss')
    expect(matchRows().map((r) => r.textContent)).toEqual(
      matchTools('database', { license: ['oss'] }, kb).map((t) => `${t.name}${matchLabel(t, {}, kb)}${priceTag(t)}`),
    )
    await user.click(within(license).getByRole('radio', { name: 'Anything' }))
    expect(params().has('f')).toBe(false)
  })

  it('a match focuses its tool on the map and the sheet stays open beside it on wide screens', async () => {
    setWide(true)
    const user = userEvent.setup()
    renderApp()
    await openSheet(user)
    await pickPart(user)
    const first = matchTools('database', {}, kb)[0]
    await user.click(matchRows()[0])
    expect(params().get('focus')).toBe(first.id)
    expect(graph.props?.focus).toBe(first.id)
    expect(sheet()).toBeInTheDocument()
    expect(matchRows()[0]).toHaveAttribute('aria-current', 'true')
  })

  it('a One piece link opens on its part and answers; unknown answers show a notice', () => {
    const first = renderApp('/?m=piece&l=database&f=need:vectors,need:teleport')
    expect(within(sheet()).getByRole('tab', { name: 'One piece' })).toHaveAttribute('aria-selected', 'true')
    expect(within(piece()).getByRole('checkbox', { name: 'AI and vectors' })).toBeChecked()
    expect(screen.getByText(/Some parts of this link were ignored: answer "need:teleport"/)).toBeInTheDocument()
    expect(graph.props?.highlight).toEqual(matchTools('database', { need: ['vectors'] }, kb).map((t) => t.id))
    first.unmount()

    renderApp('/?m=piece&l=warp')
    expect(screen.getByText(/Some parts of this link were ignored: part "warp"/)).toBeInTheDocument()
    expect(within(piece()).getByRole('heading', { name: 'Which part do you need help with?' })).toBeInTheDocument()
  })

  it('Change part and Start over go back to the list of parts', async () => {
    const user = userEvent.setup()
    renderApp('/?m=piece&l=cache')
    await user.click(within(piece()).getByRole('button', { name: 'Change part' }))
    expect(within(piece()).getByRole('button', { name: 'Database' })).toHaveFocus()
    expect(params().has('l')).toBe(false)

    await user.click(within(piece()).getByRole('button', { name: 'Email' }))
    await user.click(within(sheet()).getByRole('button', { name: 'Start over' }))
    expect(within(piece()).getByRole('button', { name: 'Database' })).toHaveFocus()
    expect(graph.props?.highlight ?? []).toEqual([])
  })

  it('Copy link carries the part and answers; the jump button names the count', async () => {
    const user = userEvent.setup()
    renderApp('/?m=piece&l=database&f=need:analytics')
    const count = matchTools('database', { need: ['analytics'] }, kb).length
    expect(within(sheet()).getByRole('button', { name: `See ${count} ${count === 1 ? 'match' : 'matches'}` })).toBeInTheDocument()
    await user.click(within(sheet()).getByRole('button', { name: 'Copy link' }))
    const url = new URL(await navigator.clipboard.readText())
    expect(url.searchParams.get('m')).toBe('piece')
    expect(url.searchParams.get('l')).toBe('database')
    expect(url.searchParams.get('f')).toBe('need:analytics')
    expect(url.searchParams.has('t')).toBe(false)
  })

  it('switching tabs keeps each mode answers; the link follows the open tab', async () => {
    const user = userEvent.setup()
    renderApp('/?t=saas')
    await pickPart(user)
    expect(params().has('t')).toBe(false)
    await user.click(within(sheet()).getByRole('tab', { name: 'Whole stack' }))
    expect(params().get('t')).toBe('saas')
    expect(params().has('l')).toBe(false)
    await user.click(within(sheet()).getByRole('tab', { name: 'One piece' }))
    expect(within(piece()).getByRole('heading', { name: 'Which database?' })).toBeInTheDocument()
  })

  it('closing the sheet keeps the matches lit, with Clear matches on the map', async () => {
    const user = userEvent.setup()
    renderApp('/?m=piece&l=database')
    await user.click(within(sheet()).getByRole('button', { name: 'Close' }))
    expect(graph.props?.highlight?.length).toBeGreaterThan(0)
    await user.click(screen.getByRole('button', { name: 'Clear matches' }))
    expect(graph.props?.highlight ?? []).toEqual([])
    expect(params().has('l')).toBe(false)
  })
})

describe('Help me choose, fix round 1', () => {
  const piece = () => within(sheet()).getByRole('tabpanel', { name: 'One piece' })
  const description = () => within(sheet()).getByText('Get a whole stack for your project, or find one piece, such as a database.')
  const visibleText = (text: string) => screen.queryByText(text, { ignore: '.sr-only, script, style' })

  /** IntersectionObserver that reports every observed element as in view (jsdom has none). */
  function everythingInView() {
    class InView {
      callback: IntersectionObserverCallback
      constructor(callback: IntersectionObserverCallback) {
        this.callback = callback
      }
      observe(target: Element) {
        this.callback([{ target, isIntersecting: true } as IntersectionObserverEntry], this as unknown as IntersectionObserver)
      }
      unobserve() {}
      disconnect() {}
    }
    vi.stubGlobal('IntersectionObserver', InView)
  }
  afterEach(() => vi.unstubAllGlobals())

  it('One piece: where it runs, size and licence are one-line chips; the chosen answer explains itself under the group', async () => {
    const user = userEvent.setup()
    renderApp('/?m=piece&l=database')
    const managed = within(piece()).getByRole('checkbox', { name: 'Managed for me' })
    expect(managed).toHaveAccessibleDescription('A cloud service runs it for you')
    expect(visibleText('A cloud service runs it for you')).toBeNull()
    // The part's own question keeps its two-line chips.
    expect(visibleText('Power AI features that find similar things')).not.toBeNull()
    await user.click(managed)
    expect(visibleText('A cloud service runs it for you')).not.toBeNull()
  })

  it('One piece: Start over sits next to the match count, once', () => {
    renderApp('/?m=piece&l=database')
    const starts = within(sheet()).getAllByRole('button', { name: 'Start over' })
    expect(starts).toHaveLength(1)
    expect(piece().contains(starts[0])).toBe(true)
    const count = within(piece()).getByRole('heading', { name: /\d+ matches/ })
    expect(count.parentElement!.contains(starts[0])).toBe(true)
  })

  it('the footer jump reads "See N matches" and hides once the list is in view', () => {
    const count = matchTools('database', {}, kb).length
    const first = renderApp('/?m=piece&l=database')
    expect(within(sheet()).getByRole('button', { name: `See ${count} matches` })).toBeInTheDocument()
    first.unmount()
    everythingInView()
    renderApp('/?m=piece&l=database')
    expect(within(sheet()).queryByRole('button', { name: `See ${count} matches` })).not.toBeInTheDocument()
  })

  it('the stack jump hides once the stack is in view', () => {
    everythingInView()
    renderApp('/?t=saas')
    expect(within(sheet()).queryByRole('button', { name: /^Your stack \(\d+\)$/ })).not.toBeInTheDocument()
    expect(within(sheet()).getByRole('button', { name: 'Copy link' })).toBeInTheDocument()
  })

  it('the sheet description steps aside once a part or a project type is chosen', async () => {
    const user = userEvent.setup()
    renderApp()
    await openSheet(user)
    expect(description()).not.toHaveClass('sr-only')
    expect(description()).toHaveClass('max-sm:sr-only')
    await user.click(within(sheet()).getByRole('radio', { name: 'Web app' }))
    expect(description()).toHaveClass('sr-only')
  })

  it('the result names parts in plain words, the same as One piece', () => {
    renderApp('/?t=saas')
    const summary = screen.getByRole('navigation', { name: 'Jump to a layer' })
    expect(within(summary).getByRole('button', { name: /^Sign-in: / })).toBeInTheDocument()
    expect(within(summary).queryByRole('button', { name: /Auth provider/ })).not.toBeInTheDocument()
    expect(screen.getByRole('listitem', { name: 'Sign-in' })).toBeInTheDocument()
    expect(within(sheet()).getByText(/\d+ parts/)).toBeInTheDocument()
    expect(within(sheet()).queryByText(/\d+ layers/)).not.toBeInTheDocument()
  })

  it('the description box sits under the first question', async () => {
    const user = userEvent.setup()
    renderApp()
    await openSheet(user)
    const types = within(sheet()).getByRole('radiogroup', { name: /What are you building/ })
    const box = within(sheet()).getByRole('textbox', { name: /Or describe it in your own words/ })
    expect(types.compareDocumentPosition(box) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
  })

  it('About explains One piece', async () => {
    const user = userEvent.setup()
    renderApp()
    await user.click(screen.getByRole('button', { name: 'About Stack Compass' }))
    const about = screen.getByRole('dialog', { name: 'About Stack Compass' })
    expect(about).toHaveTextContent(/Help me choose builds a whole stack for your project, or finds one piece, such as a database\./)
    expect(about).toHaveTextContent(/One piece: pick a part, answer a few questions, and every tool that fits all your answers stays lit\./)
    expect(about).toHaveTextContent(/Answers that would not change the list are not shown\./)
  })

  it('on a phone the lit tools are framed below the Clear stack button', async () => {
    const user = userEvent.setup()
    renderApp('/?t=saas')
    await user.click(within(sheet()).getByRole('button', { name: 'Close' }))
    expect(screen.getByRole('button', { name: 'Clear stack' })).toBeInTheDocument()
    expect(graph.props?.highlightInset?.top).toBe(188)
  })

  it('a chosen answer stays once other answers make it narrow nothing; an unchosen one like it is hidden', async () => {
    // Find a part, a chosen answer a, and an answer b in another question that
    // leaves only tools with a, plus an unchosen sibling of a that then fits all or none.
    let found: { layer: Layer; a: [string, string]; b: [string, string]; sibling: [string, string] } | null = null
    for (const layer of kb.layers) {
      const groups = groupsFor(layer, kb)
      const shown = narrowingOptions(layer, {}, kb)
      for (const ga of groups) for (const a of shown[ga.id] ?? []) for (const gb of groups) {
        if (gb.id === ga.id || found) continue
        for (const b of narrowingOptions(layer, { [ga.id]: [a] }, kb)[gb.id] ?? []) {
          if (found) break
          const sel = { [ga.id]: [a], [gb.id]: [b] }
          const base = matchTools(layer, { [gb.id]: [b] }, kb)
          if (!base.every((t) => hasOption(t, ga, a))) continue
          const visible = narrowingOptions(layer, sel, kb)[ga.id]
          const sibling = ga.options.find((o) => o.id !== a && !visible.includes(o.id) && (shown[ga.id] ?? []).includes(o.id))
          if (sibling) found = { layer, a: [ga.id, a], b: [gb.id, b], sibling: [ga.id, sibling.id] }
        }
      }
      if (found) break
    }
    expect(found).not.toBeNull()
    const { layer, a, b, sibling } = found!
    const label = (group: string, option: string) =>
      groupsFor(layer, kb).find((g) => g.id === group)!.options.find((o) => o.id === option)!.label
    const user = userEvent.setup()
    renderApp(`/?m=piece&l=${layer}`)
    const chip = (group: string, option: string) =>
      within(within(piece()).getByRole(groupsFor(layer, kb).find((g) => g.id === group)!.multi ? 'group' : 'radiogroup', {
        name: groupsFor(layer, kb).find((g) => g.id === group)!.question,
      })).queryByRole(groupsFor(layer, kb).find((g) => g.id === group)!.multi ? 'checkbox' : 'radio', { name: label(group, option) })
    await user.click(chip(a[0], a[1])!)
    await user.click(chip(b[0], b[1])!)
    expect(chip(a[0], a[1])).toBeChecked()
    expect(chip(sibling[0], sibling[1])).toBeNull()
  })

  it('I have preferences opens when the description picks up a language later', async () => {
    const user = userEvent.setup()
    renderApp()
    await openSheet(user)
    const toggle = within(sheet()).getByRole('button', { name: /I have preferences/ })
    expect(toggle).toHaveAttribute('aria-expanded', 'false')
    await describeProject(user, 'a saas in python')
    expect(toggle).toHaveAttribute('aria-expanded', 'true')
  })
})
