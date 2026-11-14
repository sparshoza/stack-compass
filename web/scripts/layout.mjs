// Precomputes map positions for every tool and writes catalog/layout.json.
//
//   npm run layout             write the file
//   npm run layout -- --check  exit 1 when the file is missing or stale
//
// Positions come from the catalog edges, not from layer anchors, so the map
// is one round tangle with the families mixed through it:
//
// 1. Tools start scattered over a disc (a PRNG seeded by the tool id).
// 2. ForceAtlas2 settles them with strong gravity, which holds the whole graph
//    in one disc. Edges between families pull hardest and edges inside a
//    family barely pull, so a family never gathers into its own sector.
// 3. Each distance from the centre is blended halfway toward a target set by
//    its rank that favours the centre, so the core is crowded (the hubs sit there),
//    the rim is sparser and no leaf strays outside the disc.
// 4. Tools whose names would overlap, each name centred under its dot as the
//    map draws it at rest on a desktop screen, are nudged apart for a few
//    rounds (not to the end, so crowds survive), then any two dots closer
//    than MIN_GAP of the map's width are pushed apart.
//
// Everything is deterministic, so the same catalog always gives the same file.

import { readFileSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import Graph from 'graphology'
import forceAtlas2 from 'graphology-layout-forceatlas2'

const here = import.meta.dirname
const catalogPath = resolve(here, '../../catalog/catalog.json')
const familiesPath = resolve(here, '../src/lib/families.json')
export const layoutPath = resolve(here, '../../catalog/layout.json')

export const ITERATIONS = 600
const RADIUS = 1000
const EDGE_WEIGHT = { 'built-on': 0.15, extends: 0.15, 'pairs-with': 0.1, 'alternative-to': 0.05, replaces: 0.05 }
/** Edges inside one family pull this much as hard as edges between families. */
const SAME_FAMILY = 0.05
const FA2_SETTINGS = {
  scalingRatio: 3,
  gravity: 1,
  strongGravityMode: true,
  slowDown: 5,
  edgeWeightInfluence: 1,
  linLogMode: false,
  outboundAttractionDistribution: false,
  barnesHutOptimize: false,
  adjustSizes: false,
}
/**
 * How far each tool's distance from the centre moves from where ForceAtlas2
 * left it toward its rank target (0 keeps ForceAtlas2, 1 is the rank target).
 */
const RADIAL_BLEND = 0.5
/** Rank targets: the share of tools within r of the centre grows as (r / RADIUS)^(1 / RADIAL_POWER); 0.5 is an even disc, higher crowds the core. */
const RADIAL_POWER = 0.85
/** Label boxes are sized for a map this many pixels across with names in a 10px monospace face. */
const LABEL_MAP_PX = 700
const LABEL_CHAR_PX = 6
const LABEL_BOX_PX = 17 // dot, gap and one line of text
const LABEL_ROUNDS = 20 // a few rounds, not to the end, so hubs keep a crowd round them
const MIN_GAP = 0.03 // of the map's larger side
const SPREAD_ROUNDS = 80

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

const round = (n) => {
  const r = Math.round(n * 100) / 100
  return r === 0 ? 0 : r // no -0 in the file
}

/** Returns `{ [toolId]: { x, y } }` with keys sorted and values rounded to 2 decimals. */
export function computeLayout(catalog, families) {
  const familyOf = new Map()
  for (const family of families) for (const layer of family.layers) familyOf.set(layer, family.id)
  const layerOf = new Map(catalog.tools.map((tool) => [tool.id, tool.layer]))
  const graph = new Graph({ type: 'undirected' })
  const tools = [...catalog.tools].sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0))
  for (const tool of tools) {
    // Uniform over the disc: the square root keeps the centre from crowding.
    const rand = mulberry32(hash(tool.id))
    const angle = rand() * 2 * Math.PI
    const r = RADIUS * Math.sqrt(rand())
    graph.addNode(tool.id, { x: r * Math.cos(angle), y: r * Math.sin(angle) })
  }

  for (const tool of tools) {
    for (const edge of tool.edges) {
      if (!graph.hasNode(edge.target) || graph.hasEdge(tool.id, edge.target)) continue
      const a = layerOf.get(tool.id)
      const b = layerOf.get(edge.target)
      const scale = familyOf.get(a) === familyOf.get(b) ? SAME_FAMILY : 1
      graph.addEdge(tool.id, edge.target, { weight: (EDGE_WEIGHT[edge.type] ?? 0.05) * scale })
    }
  }

  const positions = forceAtlas2(graph, { iterations: ITERATIONS, getEdgeWeight: 'weight', settings: FA2_SETTINGS })

  const points = tools.map((tool) => positions[tool.id])
  evenRadii(points)
  separateLabels(points, tools.map((tool) => tool.name))
  spreadApart(points, tools.map((tool) => tool.id))

  const out = {}
  for (const tool of tools) {
    const { x, y } = positions[tool.id]
    out[tool.id] = { x: round(x), y: round(y) }
  }
  return out
}

/**
 * Pushes every pair of points closer than MIN_GAP of the map size apart,
 * half each, along the line between them (a direction from the ids when
 * they coincide). Pairs are visited in a fixed order, so the result is
 * deterministic. Mutates `points`.
 */
export function spreadApart(points, ids) {
  const xs = points.map((p) => p.x)
  const ys = points.map((p) => p.y)
  const extent = Math.max(Math.max(...xs) - Math.min(...xs), Math.max(...ys) - Math.min(...ys))
  // Aim a little past the target so rounding never lands just under it.
  const gap = extent * MIN_GAP * 1.05
  for (let round = 0; round < SPREAD_ROUNDS; round++) {
    let moved = false
    for (let i = 0; i < points.length; i++) {
      for (let j = i + 1; j < points.length; j++) {
        const a = points[i]
        const b = points[j]
        let dx = b.x - a.x
        let dy = b.y - a.y
        let d = Math.hypot(dx, dy)
        if (d >= gap) continue
        if (d === 0) {
          const angle = (hash(ids[i] + '|' + ids[j]) / 4294967296) * 2 * Math.PI
          dx = Math.cos(angle)
          dy = Math.sin(angle)
          d = 1
        }
        const push = (gap - d) / 2
        a.x -= (dx / d) * push
        a.y -= (dy / d) * push
        b.x += (dx / d) * push
        b.y += (dy / d) * push
        moved = true
      }
    }
    if (!moved) break
  }
}

/**
 * Keeps each tool's direction from the centre and its rank by distance, and
 * moves its distance RADIAL_BLEND of the way from where it is (scaled so the
 * farthest tool is at RADIUS) to RADIUS * ((rank + 0.5) / n)^RADIAL_POWER.
 * Mutates `points`.
 */
export function evenRadii(points) {
  const n = points.length
  const cx = points.reduce((s, p) => s + p.x, 0) / n
  const cy = points.reduce((s, p) => s + p.y, 0) / n
  const order = points
    .map((p, i) => ({ i, r: Math.hypot(p.x - cx, p.y - cy) }))
    .sort((a, b) => a.r - b.r || a.i - b.i)
  const outer = order[n - 1].r || 1
  order.forEach(({ i, r }, rank) => {
    const target = RADIUS * Math.exp(RADIAL_POWER * Math.log((rank + 0.5) / n))
    const blended = RADIAL_BLEND * target + (1 - RADIAL_BLEND) * RADIUS * (r / outer)
    const k = r === 0 ? 0 : blended / r
    points[i].x = cx + (points[i].x - cx) * k
    points[i].y = cy + (points[i].y - cy) * k
  })
}

/**
 * Pushes apart tools whose dot-and-name boxes overlap, along the axis that
 * needs the shorter move (names are wide, so that is mostly up or down),
 * half each. Pairs are visited in a fixed order. Mutates `points`.
 */
export function separateLabels(points, names) {
  const xs = points.map((p) => p.x)
  const ys = points.map((p) => p.y)
  const extent = Math.max(Math.max(...xs) - Math.min(...xs), Math.max(...ys) - Math.min(...ys))
  const unit = extent / LABEL_MAP_PX
  const half = names.map((name) => ((name.length * LABEL_CHAR_PX) / 2 + 2) * unit)
  const height = LABEL_BOX_PX * unit
  for (let round = 0; round < LABEL_ROUNDS; round++) {
    let moved = false
    for (let i = 0; i < points.length; i++) {
      for (let j = i + 1; j < points.length; j++) {
        const a = points[i]
        const b = points[j]
        const ox = half[i] + half[j] - Math.abs(b.x - a.x)
        const oy = height - Math.abs(b.y - a.y)
        if (ox <= 0 || oy <= 0) continue
        if (oy <= ox) {
          const push = ((b.y >= a.y ? 1 : -1) * oy) / 2
          a.y -= push
          b.y += push
        } else {
          const push = ((b.x >= a.x ? 1 : -1) * ox) / 2
          a.x -= push
          b.x += push
        }
        moved = true
      }
    }
    if (!moved) break
  }
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
