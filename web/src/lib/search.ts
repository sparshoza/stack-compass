import { compareByName, kb, type Tool } from './kb'

function normalize(text: string): string {
  return text.trim().toLowerCase().replace(/\s+/g, ' ')
}

const entries = kb.tools.map((tool) => ({
  tool,
  terms: [tool.name, ...tool.aliases].map(normalize),
}))

/** 0 exact, 1 prefix, 2 start of a later word, 3 anywhere; null for no match. */
function rank(term: string, query: string): number | null {
  if (term === query) return 0
  if (term.startsWith(query)) return 1
  const at = term.indexOf(query)
  if (at === -1) return null
  return /[\s.\-/]/.test(term[at - 1]) ? 2 : 3
}

/**
 * Tools whose name or an alias contains the query, best match first.
 * Only names and aliases are searched, so "Express" finds Express even though
 * its name is not used for keyword matching in the recommender.
 */
export function searchTools(query: string, limit = 8): Tool[] {
  const q = normalize(query)
  if (!q) return []
  const hits: { tool: Tool; score: number }[] = []
  for (const { tool, terms } of entries) {
    let best: number | null = null
    for (const term of terms) {
      const r = rank(term, q)
      if (r !== null && (best === null || r < best)) best = r
    }
    if (best !== null) hits.push({ tool, score: best })
  }
  hits.sort((a, b) => a.score - b.score || compareByName(a.tool, b.tool))
  return hits.slice(0, limit).map((h) => h.tool)
}
