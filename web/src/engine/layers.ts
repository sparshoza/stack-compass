import type { KnowledgeBase, Layer } from "../lib/kb";
import type { Answers } from "./answers";

/** Tooling layers that only make sense next to a client: no UI, no state library or bundler. */
const CLIENT_TOOLING: ReadonlySet<Layer> = new Set<Layer>(["state", "build-tool"]);

/**
 * The layers to recommend: the project type's core layers, plus the layers
 * the chosen capabilities add, plus the tooling layers when tooling is on
 * (state and build-tool only next to a frontend or mobile layer).
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
  if (a.tooling) {
    const hasClient = wanted.has("frontend") || wanted.has("mobile");
    for (const layer of kb.vocab.tooling_layers) {
      if (CLIENT_TOOLING.has(layer) && !hasClient) continue;
      wanted.add(layer);
    }
  }
  return kb.layers.filter((layer) => wanted.has(layer));
}
