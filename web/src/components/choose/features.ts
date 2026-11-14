import { kb, type Capability } from '@/lib/kb'

/** The features in small groups so the list scans quickly. Ids not listed land in "Something else". */
const GROUPS: { title: string; ids: string[] }[] = [
  { title: 'Pages and screens', ids: ['ssr-seo', 'static-content', 'content-editing', 'offline', 'native-mobile'] },
  {
    title: 'Data and search',
    ids: ['file-uploads', 'full-text-search', 'vector-search', 'geospatial', 'analytics', 'high-write-throughput'],
  },
  { title: 'Live and behind the scenes', ids: ['realtime', 'background-jobs', 'scheduled-jobs', 'edge-runtime'] },
  {
    title: 'Accounts, payments and email',
    ids: ['social-login', 'enterprise-sso', 'multi-tenant', 'payments', 'transactional-email'],
  },
  { title: 'Your team and other apps', ids: ['admin-ui', 'rest-api', 'type-safety'] },
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
  if (rest.length) groups.push({ title: 'Something else', capabilities: rest })
  return groups.filter((g) => g.capabilities.length > 0)
}
