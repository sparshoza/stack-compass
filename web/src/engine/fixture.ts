import { kb as realKb, type KnowledgeBase, type Layer, type Tool } from "../lib/kb";

/** A tool with neutral defaults, for building small engine fixtures in tests. */
export function makeTool(
  id: string,
  layer: Layer,
  extra: Partial<Tool> = {},
): Tool {
  return {
    id,
    name: id.charAt(0).toUpperCase() + id.slice(1),
    aliases: [],
    match_name: true,
    runs_in_app: false,
    needs_web_frontend: false,
    uses: [],
    scale: null,
    layer,
    summary: "",
    url: "https://example.org",
    repo: null,
    license: "MIT",
    languages: [],
    tags: [],
    hosting: ["self-hosted"],
    pricing: ["oss"],
    maturity: "established",
    good_for: [],
    avoid_when: [],
    edges: [],
    verified: "2026-11-14",
    sources: [],
    ...extra,
  };
}

/**
 * A knowledge base holding only `tools`, with one project type "test" whose
 * core layers are `coreLayers`. Layer order and capabilities come from the
 * real catalog so scoring order matches production.
 */
export function makeKb(tools: Tool[], coreLayers: Layer[]): KnowledgeBase {
  return {
    tools,
    layers: realKb.layers,
    edgeTypes: realKb.edgeTypes,
    keywords: [],
    vocab: {
      ...realKb.vocab,
      project_types: [{ id: "test", label: "Test", core_layers: coreLayers }],
      capability_layers: {},
      tooling_layers: [],
    },
  };
}
