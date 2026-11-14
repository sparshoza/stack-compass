import type { EdgeType } from '@/lib/kb'

/**
 * Edge widths on the map at rest. Structural relations are drawn heavier;
 * pairings and alternatives, which cross between families, stay thin. Kept
 * apart from model.ts so the filters legend can read it without graphology.
 */
export const EDGE_SIZE: Record<EdgeType, number> = {
  'built-on': 1,
  extends: 1,
  'pairs-with': 0.55,
  'alternative-to': 0.4,
  replaces: 0.4,
}
