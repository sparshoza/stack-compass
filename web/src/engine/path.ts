import type { EdgeType, KnowledgeBase, Layer } from '../lib/kb'

/** One hop of a route, in travel order, with the relation worded in plain English. */
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

/** How two tools relate, as the route card shows it. */
export interface Connection {
  /** The catalog lists the two as alternatives to each other: projects usually pick one. */
  alternatives: boolean
  /**
   * The best of the shortest routes, at most MAX_STEPS steps and `max` routes.
   * They use only pairs-with, built-on, extends and replaces, unless
   * `throughAlternatives`.
   */
  routes: Route[]
  /** No route exists without alternative-to, so these routes go through alternatives. */
  throughAlternatives: boolean
  /** Tools both relate to directly (not as alternatives), best first. */
  shared: string[]
  /**
   * The layer both tools are in, when they share it and some partner but the
   * catalog does not list them as alternatives (Django and Express): projects
   * usually pick one of the two. Absent otherwise.
   */
  sameLayer?: Layer
}

/** A route longer than this is no close route. */
export const MAX_STEPS = 3

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

/**
 * How well a tool in a layer explains a link between two others, lower is
 * better. The data layers say the most (two databases meet in an ORM, two
 * backends in a database); hosting, CI, observability and email pair with
 * nearly everything, so they explain the least.
 */
const TIER: Partial<Record<Layer, number>> = {
  orm: 0,
  database: 0,
  'api-style': 0,
  testing: 2,
  email: 2,
  hosting: 3,
  'ci-cd': 3,
  observability: 3,
}
const tierOf = (layer: Layer) => TIER[layer] ?? 1

/** The relation between two tools as the catalog states it: who declares it, and its type. */
interface Link {
  source: string
  target: string
  type: EdgeType
}

interface Graph {
  /** Neighbours of each tool. */
  adjacent: Map<string, string[]>
  /** The strongest relation for each pair, keyed `a|b` with a < b. */
  links: Map<string, Link>
}

interface Index {
  names: Map<string, string>
  layers: Map<string, Layer>
  /** Sort key of a tool as a go-between: its tier, then the better-connected first. */
  rank: Map<string, [number, number]>
  /** Every relation but alternative-to. */
  close: Graph
  /** Every relation. */
  all: Graph
}

const pairKey = (a: string, b: string) => (a < b ? `${a}|${b}` : `${b}|${a}`)

function buildGraph(kb: KnowledgeBase, names: Map<string, string>, keep: (type: EdgeType) => boolean): Graph {
  const sets = new Map<string, Set<string>>()
  const links = new Map<string, Link>()
  for (const tool of kb.tools) {
    for (const edge of tool.edges) {
      if (!keep(edge.type) || edge.target === tool.id || !names.has(edge.target)) continue
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
  return { adjacent: new Map([...sets].map(([id, set]) => [id, [...set]])), links }
}

const indexes = new WeakMap<KnowledgeBase, Index>()

function indexOf(kb: KnowledgeBase): Index {
  let index = indexes.get(kb)
  if (index) return index
  const names = new Map(kb.tools.map((t) => [t.id, t.name]))
  const all = buildGraph(kb, names, () => true)
  const close = buildGraph(kb, names, (type) => type !== 'alternative-to')
  const rank = new Map(
    kb.tools.map((t) => [t.id, [tierOf(t.layer), -Math.log(1 + (all.adjacent.get(t.id)?.length ?? 0))] as [number, number]]),
  )
  const layers = new Map(kb.tools.map((t) => [t.id, t.layer]))
  index = { names, layers, rank, close, all }
  indexes.set(kb, index)
  return index
}

/** Compares two go-between tools: better tier, then better connected, then id. */
function compareTools(index: Index, a: string, b: string): number {
  const [ta, da] = index.rank.get(a)!
  const [tb, db] = index.rank.get(b)!
  return ta - tb || da - db || (a < b ? -1 : a > b ? 1 : 0)
}

/** Compares two routes of the same length by their go-between tools (summed), then by ids. */
function compareRoutes(index: Index, a: string[], b: string[]): number {
  const score = (nodes: string[]) =>
    nodes.slice(1, -1).reduce(
      (sum, id) => {
        const [tier, degree] = index.rank.get(id)!
        return [sum[0] + tier, sum[1] + degree]
      },
      [0, 0],
    )
  const [ta, da] = score(a)
  const [tb, db] = score(b)
  if (ta !== tb) return ta - tb
  if (da !== db) return da - db
  const ka = a.join('>')
  const kb = b.join('>')
  return ka < kb ? -1 : ka > kb ? 1 : 0
}

/** Most paths ever listed before ranking; far more than the catalog produces within three steps. */
const PATH_LIMIT = 20000

/** Every shortest path from `a` to `b` of at most MAX_STEPS steps. */
function shortestPaths(graph: Graph, a: string, b: string): string[][] {
  const neighbours = (id: string) => graph.adjacent.get(id) ?? []
  // Distance from `b`, so the walk from `a` only takes steps that get closer.
  const distance = new Map([[b, 0]])
  let layer = [b]
  for (let d = 1; d <= MAX_STEPS && layer.length && !distance.has(a); d++) {
    const next: string[] = []
    for (const at of layer) {
      for (const n of neighbours(at)) {
        if (distance.has(n)) continue
        distance.set(n, d)
        next.push(n)
      }
    }
    layer = next
  }
  if (!distance.has(a)) return []
  const found: string[][] = []
  const walk = (path: string[]) => {
    if (found.length >= PATH_LIMIT) return
    const at = path[path.length - 1]
    if (at === b) {
      found.push(path)
      return
    }
    const closer = distance.get(at)! - 1
    for (const next of neighbours(at)) if (distance.get(next) === closer) walk([...path, next])
  }
  walk([a])
  return found
}

function toRoute(index: Index, graph: Graph, nodes: string[]): Route {
  return {
    nodes,
    steps: nodes.slice(1).map((to, i) => {
      const from = nodes[i]
      const link = graph.links.get(pairKey(from, to))!
      // Pairings and alternatives read the same either way, so they follow
      // the route; the other relations read the way they point.
      const [subject, object] = SYMMETRIC.has(link.type) ? [from, to] : [link.source, link.target]
      return {
        from,
        to,
        type: link.type,
        text: `${index.names.get(subject)} ${VERB[link.type]} ${index.names.get(object)}`,
      }
    }),
  }
}

/**
 * How tools `a` and `b` connect. Routes use pairs-with, built-on, extends and
 * replaces, read in either direction; a direct alternative-to is reported on
 * its own (`alternatives`). Only when no such route exists do routes go
 * through alternatives. Routes longer than MAX_STEPS are left out. Of the
 * shortest routes, those through the most telling tools come first: data
 * layers before the rest, hosting, CI, observability and email last, then the
 * better connected, then ids, so the answer never changes between runs.
 * The same tool twice or an unknown id gives nothing.
 */
export function connect(a: string, b: string, kb: KnowledgeBase, max = 3): Connection {
  const none: Connection = { alternatives: false, routes: [], throughAlternatives: false, shared: [] }
  const index = indexOf(kb)
  if (a === b || !index.names.has(a) || !index.names.has(b)) return none

  const direct = index.all.links.get(pairKey(a, b))
  const alternatives = direct?.type === 'alternative-to' && !index.close.links.has(pairKey(a, b))

  const closeOnes = new Set(index.close.adjacent.get(b) ?? [])
  const shared = (index.close.adjacent.get(a) ?? [])
    .filter((id) => closeOnes.has(id))
    .sort((x, y) => compareTools(index, x, y))

  let graph = index.close
  let paths = shortestPaths(graph, a, b)
  let throughAlternatives = false
  if (!paths.length && !alternatives) {
    graph = index.all
    paths = shortestPaths(graph, a, b)
    throughAlternatives = paths.length > 0
  }
  const routes = paths
    .sort((x, y) => compareRoutes(index, x, y))
    .slice(0, Math.max(0, max))
    .map((nodes) => toRoute(index, graph, nodes))
  const layer = index.layers.get(a)
  const sameLayer = !alternatives && shared.length > 0 && layer === index.layers.get(b) ? layer : undefined
  return { alternatives, routes, throughAlternatives, shared, ...(sameLayer ? { sameLayer } : {}) }
}
