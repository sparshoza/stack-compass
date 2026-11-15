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
/** How big a tool grows: one server, many machines, or both. */
export type Scale = 'single' | 'scale-out' | 'both'

export interface Edge {
  type: EdgeType
  target: string
}

export interface Tool {
  id: string
  name: string
  aliases: string[]
  /** False when the name is an ordinary word: the matcher then uses aliases only. */
  match_name: boolean
  /** A library that runs inside your app (auth, email, search libraries): no server of its own to host. */
  runs_in_app: boolean
  /** A browser test runner: only useful when the stack has a web frontend. */
  needs_web_frontend: boolean
  /** A meta-framework that answers HTTP requests on the server, so a web app on it needs no separate backend. */
  serves_backend: boolean
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
  /** Option ids of this layer's own facet groups (not scale, not shared facets). */
  uses: string[]
  /** Set only on layers with a scale facet group. */
  scale: Scale | null
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

export interface FacetOption {
  id: string
  label: string
  hint: string
}

/** One question of the One piece chooser, such as "What do you need it for?". */
export interface FacetGroup {
  id: string
  question: string
  /** Several options may be chosen; a tool matches when it has any of them. */
  multi: boolean
  options: FacetOption[]
}

/**
 * A facet read from fields every tool already has. run: in-app = runs_in_app,
 * self-hosted = hosting has self-hosted and not runs_in_app, managed = hosting
 * has managed. license: oss = pricing has oss, any = every tool.
 */
export interface SharedFacet extends FacetGroup {
  id: 'run' | 'license'
  /** Layer to the option ids shown there (no option that no tool on it can match). */
  layers: Partial<Record<Layer, string[]>>
}

export interface Vocab {
  languages: string[]
  capabilities: Capability[]
  project_types: ProjectType[]
  capability_layers: Record<string, Layer[]>
  tooling_layers: Layer[]
  /** Layers that run as a service; score.ts SERVICE_LAYERS mirrors it. */
  service_layers: Layer[]
  shared_facets: SharedFacet[]
  /** Facet groups per layer; the first is always "What do you need it for?". */
  facets: Partial<Record<Layer, FacetGroup[]>>
}

export interface KeywordEntry {
  phrases: string[]
  sets: {
    project_type: string | null
    capabilities: string[]
    languages: string[]
    /** Needs no layer covers ("sms"), so the site can say so instead of guessing. */
    not_covered?: string[]
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

/** Tool fields the compiler leaves out when they hold their default value. */
type DefaultedField = 'match_name' | 'runs_in_app' | 'needs_web_frontend' | 'serves_backend' | 'uses' | 'scale'
export type CatalogTool = Omit<Tool, DefaultedField> & Partial<Pick<Tool, DefaultedField>>

/** Puts back the defaults catalog.json omits (see OMIT_DEFAULTS in compile.py). */
export function withDefaults(tool: CatalogTool): Tool {
  return {
    match_name: true,
    runs_in_app: false,
    needs_web_frontend: false,
    serves_backend: false,
    uses: [],
    scale: null,
    ...tool,
  }
}

const raw = catalog as unknown as Omit<KnowledgeBase, 'tools'> & { tools: CatalogTool[] }

export const kb: KnowledgeBase = { ...raw, tools: raw.tools.map(withDefaults) }

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
