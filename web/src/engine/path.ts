import type { EdgeType, KnowledgeBase } from '../lib/kb'

/** One hop of a route, in travel order, with the relation worded the way it points. */
export interface RouteStep {
  from: string
  to: string
  type: EdgeType
  /** For example "Django ORM is built on Django" or "Django pairs with PostgreSQL". */
  text: string
}

export interface Route {
  /** Tool ids from the start to the end. */
  nodes: string[]
  steps: RouteStep[]
}

/** When two tools share several relations, a step uses the first in this order. */
const STRENGTH: EdgeType[] = ['built-on', 'extends', 'replaces', 'pairs-with', 'alternative-to']

const VERB: Record<EdgeType, string> = {
  'built-on': 'is built on',
  extends: 'extends',
  replaces: 'replaces',
  'pairs-with': 'pairs with',
  'alternative-to': 'is an alternative to',
}

const SYMMETRIC = new Set<EdgeType>(['pairs-with', 'alternative-to'])

/** The relation between two tools as the catalog states it: who declares it, and its type. */
interface Link {
  source: string
  target: string
  type: EdgeType
}

interface Index {
  names: Map<string, string>
  /** Neighbours of each tool, sorted by id. */
  adjacent: Map<string, string[]>
  /** The strongest relation for each pair, keyed `a|b` with a < b. */
  links: Map<string, Link>
}

const pairKey = (a: string, b: string) => (a < b ? `${a}|${b}` : `${b}|${a}`)

const indexes = new WeakMap<KnowledgeBase, Index>()

function indexOf(kb: KnowledgeBase): Index {
  let index = indexes.get(kb)
  if (index) return index
  const names = new Map(kb.tools.map((t) => [t.id, t.name]))
  const sets = new Map<string, Set<string>>()
  const links = new Map<string, Link>()
  for (const tool of kb.tools) {
    for (const edge of tool.edges) {
      if (edge.target === tool.id || !names.has(edge.target)) continue
      const key = pairKey(tool.id, edge.target)
      const known = links.get(key)
      if (!known || STRENGTH.indexOf(edge.type) < STRENGTH.indexOf(known.type)) {
        links.set(key, { source: tool.id, target: edge.target, type: edge.type })
      }
      for (const [a, b] of [
        [tool.id, edge.target],
        [edge.target, tool.id],
      ]) {
        let set = sets.get(a)
        if (!set) sets.set(a, (set = new Set()))
        set.add(b)
      }
    }
  }
  const adjacent = new Map([...sets].map(([id, set]) => [id, [...set].sort()]))
  index = { names, adjacent, links }
  indexes.set(kb, index)
  return index
}

/**
 * Up to `max` shortest routes from tool `a` to tool `b` over every relation,
 * read in either direction. Routes are listed in id order (compared tool by
 * tool), so the answer never changes between runs. Each step is worded in
 * plain English ("Django pairs with PostgreSQL", "Django ORM is built on
 * Django"). No route, the same tool twice, or an unknown id gives an empty
 * list.
 */
export function routes(a: string, b: string, kb: KnowledgeBase, max = 3): Route[] {
  const { names, adjacent, links } = indexOf(kb)
  if (a === b || !names.has(a) || !names.has(b) || max < 1) return []

  // Distance of every reachable tool from `b`, so the walk from `a` only
  // ever takes a step that gets one closer.
  const distance = new Map([[b, 0]])
  const queue = [b]
  for (let i = 0; i < queue.length && !distance.has(a); i++) {
    const at = queue[i]
    for (const next of adjacent.get(at) ?? []) {
      if (distance.has(next)) continue
      distance.set(next, distance.get(at)! + 1)
      queue.push(next)
    }
  }
  if (!distance.has(a)) return []

  const found: string[][] = []
  const walk = (path: string[]) => {
    if (found.length >= max) return
    const at = path[path.length - 1]
    if (at === b) {
      found.push(path)
      return
    }
    const closer = distance.get(at)! - 1
    for (const next of adjacent.get(at) ?? []) {
      if (distance.get(next) === closer) walk([...path, next])
    }
  }
  walk([a])

  return found.map((nodes) => ({
    nodes,
    steps: nodes.slice(1).map((to, i) => {
      const from = nodes[i]
      const link = links.get(pairKey(from, to))!
      // Pairings and alternatives read the same either way, so they follow
      // the route; the other relations read the way they point.
      const [subject, object] = SYMMETRIC.has(link.type) ? [from, to] : [link.source, link.target]
      return { from, to, type: link.type, text: `${names.get(subject)} ${VERB[link.type]} ${names.get(object)}` }
    }),
  }))
}
