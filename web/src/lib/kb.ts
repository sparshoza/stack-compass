import catalog from '@catalog/catalog.json'

export type Layer =
  | 'frontend'
  | 'meta-framework'
  | 'ui-kit'
  | 'state'
  | 'build-tool'
  | 'mobile'
  | 'backend'
  | 'api-style'
  | 'orm'
  | 'database'
  | 'cache'
  | 'jobs-queue'
  | 'search'
  | 'storage'
  | 'auth'
  | 'payments'
  | 'email'
  | 'cms'
  | 'hosting'
  | 'ci-cd'
  | 'observability'
  | 'testing'

export type EdgeType = 'alternative-to' | 'pairs-with' | 'built-on' | 'extends' | 'replaces'

export type Hosting = 'managed' | 'self-hosted'
export type Pricing = 'oss' | 'free-tier' | 'paid'
export type Maturity = 'emerging' | 'established' | 'legacy'

export interface Edge {
  type: EdgeType
  target: string
}

export interface Tool {
  id: string
  name: string
  aliases: string[]
  match_name: boolean
  /** A library that runs inside your app (auth, email, search libraries): no server of its own to host. */
  runs_in_app: boolean
  /** A browser test runner: only useful when the stack has a web frontend. */
  needs_web_frontend: boolean
  layer: Layer
  summary: string
  url: string
  repo: string | null
  license: string
  languages: string[]
  tags: string[]
  hosting: Hosting[]
  pricing: Pricing[]
  maturity: Maturity
  good_for: string[]
  avoid_when: string[]
  edges: Edge[]
  verified: string
  sources: string[]
}

export interface Capability {
  id: string
  label: string
  explain: string
}

export interface ProjectType {
  id: string
  label: string
  core_layers: Layer[]
}

export interface Vocab {
  languages: string[]
  capabilities: Capability[]
  project_types: ProjectType[]
  capability_layers: Record<string, Layer[]>
  tooling_layers: Layer[]
}

export interface KeywordEntry {
  phrases: string[]
  sets: {
    project_type: string | null
    capabilities: string[]
    languages: string[]
  }
}

export interface KnowledgeBase {
  tools: Tool[]
  /** All 22 layers, in scoring order. */
  layers: Layer[]
  edgeTypes: EdgeType[]
  vocab: Vocab
  keywords: KeywordEntry[]
}

export const kb = catalog as unknown as KnowledgeBase

const byId = new Map(kb.tools.map((tool) => [tool.id, tool]))

export function toolById(id: string): Tool | undefined {
  return byId.get(id)
}

/** Name order, case-insensitive; ties fall back to id so the order is stable. */
export function compareByName(a: Tool, b: Tool): number {
  return (
    a.name.localeCompare(b.name, 'en', { sensitivity: 'base' }) ||
    (a.id < b.id ? -1 : a.id > b.id ? 1 : 0)
  )
}

const byLayer = new Map<Layer, Tool[]>()
for (const layer of kb.layers) byLayer.set(layer, [])
for (const tool of kb.tools) byLayer.get(tool.layer)?.push(tool)
for (const tools of byLayer.values()) tools.sort(compareByName)

/** Tools in one layer sorted by name. Returns a fresh array each call. */
export function toolsByLayer(layer: Layer): Tool[] {
  return [...(byLayer.get(layer) ?? [])]
}
