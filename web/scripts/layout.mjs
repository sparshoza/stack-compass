// Precomputes map positions for every tool and writes catalog/layout.json.
//
//   npm run layout             write the file
//   npm run layout -- --check  exit 1 when the file is missing or stale
//
// Each of the 22 layers gets a fixed anchor on a circle, grouped by the five
// families in src/lib/families.json with a gap between families. Tools start
// near their layer's anchor (jitter from a PRNG seeded by the tool id), are
// tied to it by an extra edge, and ForceAtlas2 settles them for 500
// iterations together with the catalog edges. Everything is deterministic,
// so the same catalog always gives the same file.

import { readFileSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import Graph from 'graphology'
import forceAtlas2 from 'graphology-layout-forceatlas2'

const here = import.meta.dirname
const catalogPath = resolve(here, '../../catalog/catalog.json')
const familiesPath = resolve(here, '../src/lib/families.json')
export const layoutPath = resolve(here, '../../catalog/layout.json')

export const ITERATIONS = 500
const RADIUS = 1000
const FAMILY_GAP = 1 // empty anchor slots between two families
const JITTER = 120
const ANCHOR_WEIGHT = 1
const EDGE_WEIGHT = { 'built-on': 0.6, extends: 0.6, 'pairs-with': 0.15, 'alternative-to': 0.4, replaces: 0.4 }

export function readInputs() {
  return {
    catalog: JSON.parse(readFileSync(catalogPath, 'utf8')),
    families: JSON.parse(readFileSync(familiesPath, 'utf8')),
  }
}

/** FNV-1a, 32 bit. */
function hash(text) {
  let h = 0x811c9dc5
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i)
    h = Math.imul(h, 0x01000193)
  }
  return h >>> 0
}

function mulberry32(seed) {
  let a = seed
  return () => {
    a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

/** One anchor per layer, in family order, with a gap between families. */
export function layerAnchors(families) {
  const slots = []
  families.forEach((family, i) => {
    if (i > 0) for (let g = 0; g < FAMILY_GAP; g++) slots.push(null)
    for (const layer of family.layers) slots.push(layer)
  })
  const anchors = {}
  slots.forEach((layer, i) => {
    if (layer === null) return
    const angle = (2 * Math.PI * i) / slots.length
    anchors[layer] = { x: RADIUS * Math.cos(angle), y: RADIUS * Math.sin(angle) }
  })
  return anchors
}

const round = (n) => {
  const r = Math.round(n * 100) / 100
  return r === 0 ? 0 : r // no -0 in the file
}

/** Returns `{ [toolId]: { x, y } }` with keys sorted and values rounded to 2 decimals. */
export function computeLayout(catalog, families) {
  const anchors = layerAnchors(families)
  const graph = new Graph({ type: 'undirected' })

  for (const [layer, { x, y }] of Object.entries(anchors)) {
    graph.addNode(`layer:${layer}`, { x, y, fixed: true })
  }

  const tools = [...catalog.tools].sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0))
  for (const tool of tools) {
    const anchor = anchors[tool.layer]
    if (!anchor) throw new Error(`layer "${tool.layer}" of ${tool.id} is in no family`)
    const rand = mulberry32(hash(tool.id))
    graph.addNode(tool.id, {
      x: anchor.x + (rand() - 0.5) * 2 * JITTER,
      y: anchor.y + (rand() - 0.5) * 2 * JITTER,
    })
    graph.addEdge(tool.id, `layer:${tool.layer}`, { weight: ANCHOR_WEIGHT })
  }

  for (const tool of tools) {
    for (const edge of tool.edges) {
      if (!graph.hasNode(edge.target) || graph.hasEdge(tool.id, edge.target)) continue
      graph.addEdge(tool.id, edge.target, { weight: EDGE_WEIGHT[edge.type] ?? 0.2 })
    }
  }

  const positions = forceAtlas2(graph, {
    iterations: ITERATIONS,
    getEdgeWeight: 'weight',
    settings: {
      scalingRatio: 120,
      gravity: 0.05,
      slowDown: 5,
      edgeWeightInfluence: 1,
      barnesHutOptimize: false,
      adjustSizes: false,
    },
  })

  const out = {}
  for (const tool of tools) {
    const { x, y } = positions[tool.id]
    out[tool.id] = { x: round(x), y: round(y) }
  }
  return out
}

/** One tool per line so diffs stay readable; LF and a trailing newline. */
export function serialize(layout) {
  const ids = Object.keys(layout).sort()
  const lines = ids.map((id, i) => {
    const { x, y } = layout[id]
    return `  ${JSON.stringify(id)}: { "x": ${x}, "y": ${y} }${i < ids.length - 1 ? ',' : ''}`
  })
  return `{\n${lines.join('\n')}\n}\n`
}

function main(argv) {
  const { catalog, families } = readInputs()
  const text = serialize(computeLayout(catalog, families))
  if (argv.includes('--check')) {
    let current = null
    try {
      current = readFileSync(layoutPath, 'utf8').replace(/\r\n/g, '\n')
    } catch {
      // missing counts as stale
    }
    if (current !== text) {
      console.error('catalog/layout.json is stale. Run: npm run layout')
      return 1
    }
    console.log(`catalog/layout.json is fresh (${catalog.tools.length} tools)`)
    return 0
  }
  writeFileSync(layoutPath, text)
  console.log(`wrote catalog/layout.json (${catalog.tools.length} tools)`)
  return 0
}

const samePath = (a, b) =>
  process.platform === 'win32' ? resolve(a).toLowerCase() === resolve(b).toLowerCase() : resolve(a) === resolve(b)

if (process.argv[1] && samePath(import.meta.filename, process.argv[1])) {
  process.exitCode = main(process.argv.slice(2))
}
