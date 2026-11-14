import { describe, expect, it } from 'vitest'
import { kb } from './kb'
import { searchTools } from './search'

describe('searchTools', () => {
  it('finds a tool by name, ignoring case', () => {
    expect(searchTools('express')[0]?.id).toBe('express')
    expect(searchTools('EXPRESS')[0]?.id).toBe('express')
  })

  it('finds a tool by alias', () => {
    expect(searchTools('expressjs')[0]?.id).toBe('express')
    expect(searchTools('postgres')[0]?.id).toBe('postgresql')
  })

  it('ranks exact and prefix matches before matches inside a word', () => {
    const ids = searchTools('redis').map((t) => t.id)
    expect(ids[0]).toBe('redis')
    expect(ids).toContain('upstash-redis')
  })

  it('does not match on summaries or other fields', () => {
    const express = kb.tools.find((t) => t.id === 'express')!
    expect(searchTools('unopinionated').map((t) => t.id)).not.toContain(express.id)
  })

  it('returns nothing for a blank query and caps the list', () => {
    expect(searchTools('   ')).toEqual([])
    expect(searchTools('a', 5)).toHaveLength(5)
  })
})
