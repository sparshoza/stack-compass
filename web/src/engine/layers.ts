import type { KnowledgeBase, Layer } from "../lib/kb";
import type { Answers } from "./answers";

/**
 * The layers to recommend: the project type's core layers, plus the layers
 * the chosen capabilities add, plus the tooling layers when tooling is on.
 * Returned once each, in scoring order. No (or an unknown) project type
 * means no layers.
 */
export function selectLayers(a: Answers, kb: KnowledgeBase): Layer[] {
  const type = kb.vocab.project_types.find((t) => t.id === a.projectType);
  if (!type) return [];
  const wanted = new Set<Layer>(type.core_layers);
  for (const cap of a.capabilities) {
    for (const layer of kb.vocab.capability_layers[cap] ?? []) wanted.add(layer);
  }
  if (a.tooling) for (const layer of kb.vocab.tooling_layers) wanted.add(layer);
  return kb.layers.filter((layer) => wanted.has(layer));
}
