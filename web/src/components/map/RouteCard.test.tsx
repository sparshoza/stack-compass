import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { makeTool } from '@/engine/fixture'
import type { Connection, Route } from '@/engine/path'
import { RouteCard } from './RouteCard'

const django = makeTool('django', 'backend', { name: 'Django' })
const postgres = makeTool('postgresql', 'database', { name: 'PostgreSQL' })

const route = (texts: string[]): Route => ({
  nodes: texts.map((_, i) => `n${i}`).concat('end'),
  steps: texts.map((text, i) => ({ from: `n${i}`, to: `n${i + 1}`, type: 'pairs-with', text })),
})
const conn = (extra: Partial<Connection>): Connection => ({
  alternatives: false,
  routes: [],
  throughAlternatives: false,
  shared: [],
  ...extra,
})

function show(connection: Connection, onClose = () => {}) {
  render(<RouteCard from={django} to={postgres} connection={connection} onClose={onClose} />)
  return screen.getByRole('region', { name: 'How Django connects to PostgreSQL' })
}

describe('RouteCard', () => {
  it('names both tools and lists each step in plain words', () => {
    const card = show(conn({ routes: [route(['Django pairs with PostgreSQL'])] }))
    expect(within(card).getByRole('heading', { name: 'How Django connects to PostgreSQL' })).toBeInTheDocument()
    expect(within(card).getByText('Django pairs with PostgreSQL')).toBeInTheDocument()
    expect(within(card).getByText('Directly related.')).toBeInTheDocument()
  })

  it('lists several equally short routes, each as its own list, and the tools both work with', () => {
    const routes = [route(['A pairs with B', 'B pairs with C']), route(['A pairs with D', 'D pairs with C'])]
    const shared = ['express', 'redis', 'mysql', 'sqlite', 'prisma', 'typeorm', 'nestjs']
    const card = show(conn({ routes, shared }))
    expect(within(card).getByText('2 routes, 2 steps each.')).toBeInTheDocument()
    expect(within(card).getAllByRole('list')).toHaveLength(2)
    expect(within(card).getByText('A pairs with D')).toBeInTheDocument()
    expect(within(card).getByText('Both work with 7 tools: Express, Redis, MySQL, SQLite, Prisma and 2 more.')).toBeInTheDocument()
  })

  it('says when two tools are alternatives, without calling it a step', () => {
    const card = show(conn({ alternatives: true, routes: [route(['A pairs with B', 'B pairs with C'])], shared: ['redis'] }))
    expect(within(card).getByText('Django and PostgreSQL are alternatives: projects usually pick one.')).toBeInTheDocument()
    expect(within(card).queryByText(/Directly/)).not.toBeInTheDocument()
    expect(within(card).getByText('Both work with 1 tool: Redis.')).toBeInTheDocument()
  })

  it('marks routes that only go through alternatives', () => {
    const card = show(conn({ throughAlternatives: true, routes: [route(['A is an alternative to B', 'B pairs with C'])] }))
    expect(within(card).getByText('Only through alternatives')).toBeInTheDocument()
    expect(within(card).queryByText(/Both work with/)).not.toBeInTheDocument()
  })

  it('says when there is no close route', () => {
    const card = show(conn({}))
    expect(within(card).getByText('No close route between Django and PostgreSQL')).toBeInTheDocument()
  })

  it('Clear route closes it', async () => {
    const onClose = vi.fn()
    show(conn({}), onClose)
    await userEvent.click(screen.getByRole('button', { name: 'Clear route' }))
    expect(onClose).toHaveBeenCalled()
  })
})
