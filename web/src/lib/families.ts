import families from './families.json'
import type { Layer } from './kb'

export type FamilyId = 'client' | 'server' | 'data' | 'services' | 'ops'

export interface Family {
  id: FamilyId
  label: string
  layers: Layer[]
}

/**
 * The five layer families that colour the map. Each family's colour is the
 * CSS variable `--family-<id>` in styles/tokens.css. families.json is also
 * read by the graph layout script, so it stays the single source.
 */
export const FAMILIES = families as Family[]

export const LAYER_FAMILY = Object.fromEntries(
  FAMILIES.flatMap((family) => family.layers.map((layer) => [layer, family.id])),
) as Record<Layer, FamilyId>

export function familyColor(id: FamilyId): string {
  return `var(--family-${id})`
}
