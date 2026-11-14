import { compareByName, kb, toolById, type EdgeType, type Tool } from './kb'

export interface RelationGroup {
  /** The edge type for relations read from this tool's side, or the reverse name. */
  key: EdgeType | 'base-for' | 'extended-by' | 'replaced-by'
  label: string
  tools: Tool[]
}

type Key = RelationGroup['key']

/** Directed edges read differently from the target's side; the rest are symmetric. */
const REVERSE: Record<EdgeType, Key> = {
  'built-on': 'base-for',
  extends: 'extended-by',
  replaces: 'replaced-by',
  'pairs-with': 'pairs-with',
  'alternative-to': 'alternative-to',
}

const GROUPS: { key: Key; label: string }[] = [
  { key: 'built-on', label: 'Built on' },
  { key: 'extends', label: 'Extends' },
  { key: 'pairs-with', label: 'Pairs with' },
  { key: 'alternative-to', label: 'Alternatives' },
  { key: 'replaces', label: 'Replaces' },
  { key: 'base-for', label: 'Base for' },
  { key: 'extended-by', label: 'Extended by' },
  { key: 'replaced-by', label: 'Replaced by' },
]

// The catalog often lists a relation on one tool only, so each edge is
// indexed from both ends once.
const index = new Map<string, Map<Key, Set<string>>>()

function add(from: string, key: Key, to: string) {
  if (from === to || !toolById(to) || !toolById(from)) return
  let groups = index.get(from)
  if (!groups) index.set(from, (groups = new Map()))
  let ids = groups.get(key)
  if (!ids) groups.set(key, (ids = new Set()))
  ids.add(to)
}

for (const tool of kb.tools) {
  for (const edge of tool.edges) {
    add(tool.id, edge.type, edge.target)
    add(edge.target, REVERSE[edge.type], tool.id)
  }
}

/** Every tool related to `id`, grouped by relation in a fixed order, names sorted. */
export function relationsOf(id: string): RelationGroup[] {
  const groups = index.get(id)
  if (!groups) return []
  return GROUPS.flatMap(({ key, label }) => {
    const ids = groups.get(key)
    if (!ids?.size) return []
    const tools = [...ids].map((t) => toolById(t)!).sort(compareByName)
    return [{ key, label, tools }]
  })
}
