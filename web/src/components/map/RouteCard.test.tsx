import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { makeTool } from '@/engine/fixture'
import type { Route } from '@/engine/path'
import { RouteCard } from './RouteCard'

const django = makeTool('django', 'backend', { name: 'Django' })
const postgres = makeTool('postgresql', 'database', { name: 'PostgreSQL' })

const route = (texts: string[]): Route => ({
  nodes: texts.map((_, i) => `n${i}`).concat('end'),
  steps: texts.map((text, i) => ({ from: `n${i}`, to: `n${i + 1}`, type: 'pairs-with', text })),
})

describe('RouteCard', () => {
  it('names both tools and lists each step in plain words', () => {
    render(<RouteCard from={django} to={postgres} routes={[route(['Django pairs with PostgreSQL'])]} onClose={() => {}} />)
    const card = screen.getByRole('region', { name: 'How Django connects to PostgreSQL' })
    expect(within(card).getByRole('heading', { name: 'How Django connects to PostgreSQL' })).toBeInTheDocument()
    expect(within(card).getByText('Django pairs with PostgreSQL')).toBeInTheDocument()
    expect(within(card).getByText('Directly, in one step.')).toBeInTheDocument()
  })

  it('lists several equally short routes, each as its own list', () => {
    const routes = [route(['A pairs with B', 'B pairs with C']), route(['A pairs with D', 'D pairs with C'])]
    render(<RouteCard from={django} to={postgres} routes={routes} onClose={() => {}} />)
    expect(screen.getByText('2 routes, 2 steps each.')).toBeInTheDocument()
    expect(screen.getAllByRole('list')).toHaveLength(2)
    expect(screen.getByText('A pairs with D')).toBeInTheDocument()
  })

  it('says when there is no route', () => {
    render(<RouteCard from={django} to={postgres} routes={[]} onClose={() => {}} />)
    expect(screen.getByText('No direct route between Django and PostgreSQL')).toBeInTheDocument()
  })

  it('Clear route closes it', async () => {
    const onClose = vi.fn()
    render(<RouteCard from={django} to={postgres} routes={[]} onClose={onClose} />)
    await userEvent.click(screen.getByRole('button', { name: 'Clear route' }))
    expect(onClose).toHaveBeenCalled()
  })
})
