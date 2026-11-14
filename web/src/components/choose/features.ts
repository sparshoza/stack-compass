import { kb, type Capability } from '@/lib/kb'

/** The must-have features in small groups so the list scans quickly. Ids not listed land in "Other". */
const GROUPS: { title: string; ids: string[] }[] = [
  { title: 'Pages and apps', ids: ['ssr-seo', 'static-content', 'content-editing', 'offline', 'native-mobile'] },
  {
    title: 'Data and search',
    ids: ['file-uploads', 'full-text-search', 'vector-search', 'geospatial', 'analytics', 'high-write-throughput'],
  },
  { title: 'Live and background work', ids: ['realtime', 'background-jobs', 'scheduled-jobs', 'edge-runtime'] },
  {
    title: 'Accounts, payments and email',
    ids: ['social-login', 'enterprise-sso', 'multi-tenant', 'payments', 'transactional-email'],
  },
  { title: 'Team and code', ids: ['admin-ui', 'type-safety'] },
]

export interface FeatureGroup {
  title: string
  capabilities: Capability[]
}

export function featureGroups(): FeatureGroup[] {
  const byId = new Map(kb.vocab.capabilities.map((c) => [c.id, c]))
  const groups = GROUPS.map((g) => ({
    title: g.title,
    capabilities: g.ids.flatMap((id) => (byId.has(id) ? [byId.get(id)!] : [])),
  }))
  const placed = new Set(GROUPS.flatMap((g) => g.ids))
  const rest = kb.vocab.capabilities.filter((c) => !placed.has(c.id))
  if (rest.length) groups.push({ title: 'Other', capabilities: rest })
  return groups.filter((g) => g.capabilities.length > 0)
}
