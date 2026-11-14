import type { FacetGroup, KnowledgeBase, Layer, Maturity, Tool } from "../lib/kb";

/**
 * Facet filtering for the One piece chooser: pick a layer, answer a few
 * use-case questions, and narrow that layer's tools.
 *
 * Rules (vocab.yaml, facets):
 * - Within a group a tool matches when it has any chosen option.
 * - Across groups every answered group must match.
 * - A group with nothing chosen adds no constraint.
 * Layer groups read the tool's `uses`; the scale group reads `scale` (both
 * matches either answer); the shared run and license groups read fields
 * every tool already has.
 */

export type GroupKind = "uses" | "scale" | "run" | "license";

export interface PieceGroup extends FacetGroup {
  kind: GroupKind;
}

/** Chosen option ids per group id. */
export type Selection = Readonly<Record<string, readonly string[]>>;

type FacetKb = Pick<KnowledgeBase, "tools" | "vocab">;

const SCALE_GROUP = "scale";

/**
 * The questions for one layer, in the order they are asked: what it is
 * for, the layer's other questions, where it runs, how big it gets, and
 * whether it must be open source. Shared groups keep only the options the
 * layer lists, and appear only on layers that list them.
 */
export function groupsFor(layer: Layer, kb: FacetKb): PieceGroup[] {
  const own = kb.vocab.facets[layer] ?? [];
  const shared = (id: "run" | "license"): PieceGroup[] => {
    const group = kb.vocab.shared_facets.find((g) => g.id === id);
    const allowed = group?.layers[layer];
    if (!group || !allowed?.length) return [];
    const options = group.options.filter((o) => allowed.includes(o.id));
    return [{ id: group.id, question: group.question, multi: group.multi, kind: id, options }];
  };
  const uses = own.filter((g) => g.id !== SCALE_GROUP).map((g) => ({ ...g, kind: "uses" as const }));
  const scale = own.filter((g) => g.id === SCALE_GROUP).map((g) => ({ ...g, kind: "scale" as const }));
  return [...uses, ...shared("run"), ...scale, ...shared("license")];
}

/** Whether a tool carries one option of one group. */
export function hasOption(tool: Tool, group: PieceGroup, option: string): boolean {
  switch (group.kind) {
    case "uses":
      return tool.uses.includes(option);
    case "scale":
      return tool.scale === option || (tool.scale === "both" && (option === "single" || option === "scale-out"));
    case "run":
      if (option === "in-app") return tool.runs_in_app;
      if (option === "self-hosted") return tool.hosting.includes("self-hosted") && !tool.runs_in_app;
      if (option === "managed") return tool.hosting.includes("managed");
      return false;
    case "license":
      if (option === "oss") return tool.pricing.includes("oss");
      return option === "any";
  }
}

/** The chosen options of a group that the group really has. */
function chosen(group: PieceGroup, selection: Selection): string[] {
  const picked = selection[group.id] ?? [];
  return group.options.filter((o) => picked.includes(o.id)).map((o) => o.id);
}

function fits(tool: Tool, groups: PieceGroup[], selection: Selection): boolean {
  return groups.every((group) => {
    const options = chosen(group, selection);
    return options.length === 0 || options.some((o) => hasOption(tool, group, o));
  });
}

const MATURITY_ORDER: Record<Maturity, number> = { established: 0, emerging: 1, legacy: 2 };

/** How many tools each tool pairs with, counting the edge from either side. Cached per catalog. */
const pairingCache = new WeakMap<readonly Tool[], Map<string, number>>();
function pairings(tools: readonly Tool[]): Map<string, number> {
  const cached = pairingCache.get(tools);
  if (cached) return cached;
  const partners = new Map<string, Set<string>>();
  const add = (a: string, b: string) => {
    if (!partners.has(a)) partners.set(a, new Set());
    partners.get(a)!.add(b);
  };
  for (const tool of tools) {
    for (const edge of tool.edges) {
      if (edge.type !== "pairs-with") continue;
      add(tool.id, edge.target);
      add(edge.target, tool.id);
    }
  }
  const counts = new Map([...partners].map(([id, set]) => [id, set.size]));
  pairingCache.set(tools, counts);
  return counts;
}

/**
 * A layer's tools that fit the selection: established first, then the ones
 * that pair with the most tools, then by name.
 */
export function matchTools(layer: Layer, selection: Selection, kb: FacetKb): Tool[] {
  const groups = groupsFor(layer, kb);
  const pairs = pairings(kb.tools);
  return kb.tools
    .filter((tool) => tool.layer === layer && fits(tool, groups, selection))
    .sort(
      (a, b) =>
        MATURITY_ORDER[a.maturity] - MATURITY_ORDER[b.maturity] ||
        (pairs.get(b.id) ?? 0) - (pairs.get(a.id) ?? 0) ||
        a.name.localeCompare(b.name, "en", { sensitivity: "base" }) ||
        (a.id < b.id ? -1 : a.id > b.id ? 1 : 0),
    );
}

/**
 * The options worth showing in each group, in vocab order. An option shows
 * when choosing it would narrow the tools the other groups leave: it fits
 * some of them, not none and not all. A group's own answers do not count,
 * so picking one option never hides its neighbours. A chosen option always
 * shows, so it can be taken back.
 */
export function narrowingOptions(layer: Layer, selection: Selection, kb: FacetKb): Record<string, string[]> {
  const groups = groupsFor(layer, kb);
  const out: Record<string, string[]> = {};
  for (const group of groups) {
    const base = matchTools(layer, { ...selection, [group.id]: [] }, kb);
    const picked = chosen(group, selection);
    out[group.id] = group.options
      .filter((option) => {
        if (picked.includes(option.id)) return true;
        const count = base.filter((tool) => hasOption(tool, group, option.id)).length;
        return count > 0 && count < base.length;
      })
      .map((o) => o.id);
  }
  return out;
}

/**
 * A short use for a matching tool, for its row in the list. With several
 * answers chosen in a question, the first one the tool covers (vocab order),
 * so the rows tell them apart. With one answer chosen, every row has it
 * already, so the tool's first other use in that question as "Also ...", or
 * nothing. With
 * none chosen, the first thing the tool is for.
 */
export function matchLabel(tool: Tool, selection: Selection, kb: FacetKb): string {
  const groups = groupsFor(tool.layer, kb).filter((g) => g.kind === "uses");
  for (const group of groups) {
    const picked = chosen(group, selection);
    if (picked.length === 0) continue;
    if (picked.length > 1) {
      const hit = group.options.find((o) => picked.includes(o.id) && tool.uses.includes(o.id));
      if (hit) return hit.label;
      continue;
    }
    const other = group.options.find((o) => o.id !== picked[0] && tool.uses.includes(o.id))?.label;
    return other ? `Also ${/^[A-Z]{2}/.test(other) ? other : other.charAt(0).toLowerCase() + other.slice(1)}` : "";
  }
  const need = groups[0];
  return need?.options.find((o) => tool.uses.includes(o.id))?.label ?? "";
}
