import type { KnowledgeBase, Layer, Tool } from "../lib/kb";
import type { Answers } from "./answers";
import { selectLayers } from "./layers";

export type ScoreItem = { code: string; points: number };
export type Exclusion = { toolId: string; reason: string };
export type LayerResult = {
  layer: Layer;
  pick: string | null;
  alternatives: string[];
  breakdown: ScoreItem[];
  excluded: Exclusion[];
};

/**
 * Hard-filter reason codes, in the order they are checked. A filtered tool
 * reports only the first one it fails.
 *
 * - language-excluded: every language the tool lists is one to avoid
 *   (typescript and javascript as one family). A tool with no languages is
 *   never excluded this way.
 * - language-required: only in LANGUAGE_LAYERS and only when the person
 *   prefers at least one language. The tool must list a preferred language;
 *   a tool with no languages passes. On frontend, meta-framework and mobile
 *   it applies only when some tool in that layer has a preferred language
 *   (a Python web app still gets a frontend); backend and orm always apply.
 * - no-managed-service / hosting-mismatch: only in SERVICE_LAYERS and only
 *   when hosting is not "either". The tool's hosting must include the chosen
 *   option: no-managed-service when the person chose managed, hosting-mismatch
 *   when they chose self-hosted. A runs_in_app tool (a library inside your
 *   app) is never excluded this way: there is no server of its own to host.
 * - budget-paid-only: on a free budget, pricing must include oss or free-tier.
 * - missing-capability: a chosen capability whose capability_layers entry
 *   names this layer is required here when at least one tool in the layer
 *   has its tag (soft, like the frontend language rule: a layer where no
 *   tool has it keeps every tool). The code carries the capability id
 *   ("missing-capability:rest-api"), like the capability score codes.
 * - language-mismatch-with-pick: an orm, api-style or jobs-queue tool must
 *   share a language with the backend pick, and a testing tool with the
 *   backend, the frontend or the mobile pick, when such a pick exists. An auth library
 *   that runs in the app must share a language with the backend pick, or
 *   with the frontend pick when there is no backend pick; a hosted auth
 *   service may match either. Tools with no languages pass.
 *
 * Everywhere languages are compared, typescript and javascript count as one.
 * - not-built-on-pick: a meta-framework must be built-on the frontend pick,
 *   when there is one. Any other tool built-on a tool in another layer
 *   (the Django ORM on Django) needs that tool to be the pick of its layer,
 *   when that layer has a pick; state and ui-kit keep the rule below.
 * - not-compatible-with-pick: state and ui-kit tools must be built-on or
 *   pair with the frontend pick, when there is one.
 * - no-web-frontend: a tool marked needs_web_frontend (a browser test
 *   runner) needs a frontend or a meta-framework pick.
 */
export const REASON_CODES = [
  "language-excluded",
  "language-required",
  "no-managed-service",
  "hosting-mismatch",
  "budget-paid-only",
  "missing-capability",
  "language-mismatch-with-pick",
  "not-built-on-pick",
  "not-compatible-with-pick",
  "no-web-frontend",
] as const;

export type ReasonCode = (typeof REASON_CODES)[number];

/** Layers where a preferred language is required. */
export const LANGUAGE_LAYERS: ReadonlySet<Layer> = new Set<Layer>([
  "backend",
  "orm",
  "frontend",
  "meta-framework",
  "mobile",
]);

/** Layers that run as a service, so where they run can be filtered. Code layers never are. */
export const SERVICE_LAYERS: ReadonlySet<Layer> = new Set<Layer>([
  "database",
  "cache",
  "jobs-queue",
  "search",
  "storage",
  "auth",
  "payments",
  "email",
  "cms",
  "hosting",
  "ci-cd",
  "observability",
]);

/** Language layers that skip the preference when none of their tools has it. */
const SOFT_LANGUAGE_LAYERS: ReadonlySet<Layer> = new Set<Layer>([
  "frontend",
  "meta-framework",
  "mobile",
]);

/** Layers checked against earlier picks' languages, and which picks. */
const LANGUAGE_PICK_LAYERS: Partial<Record<Layer, Layer[]>> = {
  orm: ["backend"],
  "api-style": ["backend"],
  "jobs-queue": ["backend"],
  auth: ["backend", "frontend"],
  testing: ["backend", "frontend", "mobile"],
};

/**
 * Layers whose ties go to the tool that shares a language with the earliest
 * pick layer listed in LANGUAGE_PICK_LAYERS (testing: the backend's language,
 * then the frontend's, then the mobile's). Points never change.
 */
const LANGUAGE_ORDER_LAYERS: ReadonlySet<Layer> = new Set<Layer>(["testing"]);

/** Layers with their own rule against the frontend pick. */
const FRONTEND_RULE_LAYERS: ReadonlySet<Layer> = new Set<Layer>([
  "meta-framework",
  "state",
  "ui-kit",
]);

/** Fixed score codes. Capability and pairs-with codes carry an id suffix. */
export const SCORE_CODES = {
  capability: (tag: string) => `capability:${tag}`,
  known: "known",
  pairsWith: (id: string) => `pairs-with:${id}`,
  established: "maturity-established",
  emerging: "maturity-emerging",
  legacy: "maturity-legacy",
} as const;

const CAPABILITY_POINTS = 3;
const KNOWN_POINTS = 2;
const PAIRS_WITH_POINTS = 2;
const ALTERNATIVES = 2;
const EXCLUDED_WINDOW = 3;

/** The reason for a tool that lacks a capability the layer requires. */
export const missingCapability = (tag: string) => `missing-capability:${tag}`;

/** Every reason code the scorer can emit for this catalog. */
export function emittableReasons(kb: KnowledgeBase): string[] {
  return REASON_CODES.flatMap((code) =>
    code === "missing-capability"
      ? Object.keys(kb.vocab.capability_layers).map(missingCapability)
      : [code],
  );
}

/** Every score code the scorer can emit for this catalog. */
export function emittableCodes(kb: KnowledgeBase): string[] {
  return [
    ...kb.vocab.capabilities.map((c) => SCORE_CODES.capability(c.id)),
    SCORE_CODES.known,
    ...kb.tools.map((t) => SCORE_CODES.pairsWith(t.id)),
    SCORE_CODES.established,
    SCORE_CODES.emerging,
    SCORE_CODES.legacy,
  ];
}

const family = (language: string) =>
  language === "typescript" ? "javascript" : language;

function avoidsAll(languages: string[], avoid: string[]): boolean {
  const avoided = new Set(avoid.map(family));
  return languages.length > 0 && languages.every((l) => avoided.has(family(l)));
}

function sharesLanguage(a: string[], b: string[]): boolean {
  const other = new Set(b.map(family));
  return a.some((l) => other.has(family(l)));
}

function hasEdge(tool: Tool, types: string[], target: string): boolean {
  return tool.edges.some((e) => e.target === target && types.includes(e.type));
}

type Picks = Map<Layer, Tool>;

/** Facts about the layer being scored that the filters need. */
type LayerContext = { preferApplies: boolean; requiredCapabilities: string[] };

/**
 * True when every other layer the tool is built-on, and that has a pick,
 * has as its pick one of the tools it is built-on there.
 */
function builtOnPicks(tool: Tool, picks: Picks, layers: Map<string, Layer>): boolean {
  const targets = new Map<Layer, string[]>();
  for (const e of tool.edges) {
    const layer = layers.get(e.target);
    if (e.type !== "built-on" || !layer || layer === tool.layer) continue;
    targets.set(layer, [...(targets.get(layer) ?? []), e.target]);
  }
  for (const [layer, ids] of targets) {
    const pick = picks.get(layer);
    if (pick && !ids.includes(pick.id)) return false;
  }
  return true;
}

function failedCheck(
  tool: Tool,
  a: Answers,
  picks: Picks,
  ctx: LayerContext,
  layers: Map<string, Layer>,
): string | null {
  const { layer, languages } = tool;
  if (avoidsAll(languages, a.languagesAvoid)) return "language-excluded";
  if (
    ctx.preferApplies &&
    languages.length > 0 &&
    !sharesLanguage(languages, a.languagesPrefer)
  ) {
    return "language-required";
  }
  if (
    SERVICE_LAYERS.has(layer) &&
    !tool.runs_in_app &&
    a.hosting !== "either" &&
    !tool.hosting.includes(a.hosting)
  ) {
    return a.hosting === "managed" ? "no-managed-service" : "hosting-mismatch";
  }
  if (
    a.budget === "free" &&
    !tool.pricing.includes("oss") &&
    !tool.pricing.includes("free-tier")
  ) {
    return "budget-paid-only";
  }
  const missing = ctx.requiredCapabilities.find((cap) => !tool.tags.includes(cap));
  if (missing) return missingCapability(missing);
  let pickLayers = LANGUAGE_PICK_LAYERS[layer] ?? [];
  // An in-app auth library runs in the backend when there is one.
  if (layer === "auth" && tool.runs_in_app) {
    pickLayers = picks.get("backend") ? ["backend"] : ["frontend"];
  }
  const against = pickLayers
    .map((l) => picks.get(l))
    .filter((pick): pick is Tool => !!pick && pick.languages.length > 0);
  if (
    against.length > 0 &&
    languages.length > 0 &&
    !against.some((pick) => sharesLanguage(languages, pick.languages))
  ) {
    return "language-mismatch-with-pick";
  }
  const frontend = picks.get("frontend");
  if (
    layer === "meta-framework" &&
    frontend &&
    !hasEdge(tool, ["built-on"], frontend.id)
  ) {
    return "not-built-on-pick";
  }
  if (!FRONTEND_RULE_LAYERS.has(layer) && !builtOnPicks(tool, picks, layers)) {
    return "not-built-on-pick";
  }
  if (
    (layer === "state" || layer === "ui-kit") &&
    frontend &&
    !hasEdge(tool, ["built-on", "pairs-with"], frontend.id)
  ) {
    return "not-compatible-with-pick";
  }
  if (
    tool.needs_web_frontend &&
    !picks.get("frontend") &&
    !picks.get("meta-framework")
  ) {
    return "no-web-frontend";
  }
  return null;
}

function breakdownFor(tool: Tool, a: Answers, picks: Picks): ScoreItem[] {
  const items: ScoreItem[] = [];
  for (const cap of new Set(a.capabilities)) {
    if (tool.tags.includes(cap)) {
      items.push({ code: SCORE_CODES.capability(cap), points: CAPABILITY_POINTS });
    }
  }
  if (a.knownTools.includes(tool.id)) {
    items.push({ code: SCORE_CODES.known, points: KNOWN_POINTS });
  }
  // Picks are kept in scoring order, so earlier picks come first.
  for (const pick of picks.values()) {
    if (hasEdge(tool, ["pairs-with"], pick.id)) {
      items.push({ code: SCORE_CODES.pairsWith(pick.id), points: PAIRS_WITH_POINTS });
    }
  }
  if (tool.maturity === "established" && a.scale !== "prototype") {
    items.push({ code: SCORE_CODES.established, points: 1 });
  } else if (tool.maturity === "emerging" && a.scale === "high") {
    items.push({ code: SCORE_CODES.emerging, points: -1 });
  } else if (tool.maturity === "legacy") {
    items.push({ code: SCORE_CODES.legacy, points: -2 });
  }
  return items;
}

type Ranked = {
  tool: Tool;
  breakdown: ScoreItem[];
  total: number;
  /**
   * Tie-break in LANGUAGE_ORDER_LAYERS: the index of the first pick layer
   * whose pick shares a language with the tool (lower first). 0 elsewhere.
   */
  languageOrder: number;
  /** Tie-break: how many pairs-with edges the tool has in the catalog. */
  pairs: number;
  reason: string | null;
};

/**
 * Total descending, then language order ascending, then pairs-with edge
 * count descending, then id ascending.
 */
function byRank(x: Ranked, y: Ranked): number {
  if (x.total !== y.total) return y.total - x.total;
  if (x.languageOrder !== y.languageOrder) return x.languageOrder - y.languageOrder;
  if (x.pairs !== y.pairs) return y.pairs - x.pairs;
  return x.tool.id < y.tool.id ? -1 : x.tool.id > y.tool.id ? 1 : 0;
}

/**
 * Where the tool's language comes in the layer's pick order: 0 when it shares
 * a language with the first pick layer that has a pick, and so on; one past
 * the last when it shares none (or lists no languages).
 */
function languageOrder(tool: Tool, picks: Picks): number {
  if (!LANGUAGE_ORDER_LAYERS.has(tool.layer)) return 0;
  const order = (LANGUAGE_PICK_LAYERS[tool.layer] ?? [])
    .map((l) => picks.get(l))
    .filter((pick): pick is Tool => !!pick && pick.languages.length > 0);
  const at = order.findIndex((pick) => sharesLanguage(tool.languages, pick.languages));
  return at === -1 ? order.length : at;
}

function preferApplies(layer: Layer, tools: Tool[], a: Answers): boolean {
  if (!LANGUAGE_LAYERS.has(layer) || a.languagesPrefer.length === 0) {
    return false;
  }
  if (!SOFT_LANGUAGE_LAYERS.has(layer)) return true;
  return tools.some((t) => sharesLanguage(t.languages, a.languagesPrefer));
}

/**
 * Chosen capabilities that add this layer and that at least one of its tools
 * provides, in the order they were chosen.
 */
function requiredCapabilities(
  layer: Layer,
  tools: Tool[],
  a: Answers,
  capabilityLayers: Record<string, Layer[]>,
): string[] {
  return [...new Set(a.capabilities)].filter(
    (cap) =>
      (capabilityLayers[cap] ?? []).includes(layer) &&
      tools.some((t) => t.tags.includes(cap)),
  );
}

function scoreLayer(
  layer: Layer,
  tools: Tool[],
  a: Answers,
  picks: Picks,
  layers: Map<string, Layer>,
  capabilityLayers: Record<string, Layer[]>,
): LayerResult {
  const ctx: LayerContext = {
    preferApplies: preferApplies(layer, tools, a),
    requiredCapabilities: requiredCapabilities(layer, tools, a, capabilityLayers),
  };
  const ranked: Ranked[] = tools
    .map((tool) => {
      const breakdown = breakdownFor(tool, a, picks);
      return {
        tool,
        breakdown,
        total: breakdown.reduce((sum, item) => sum + item.points, 0),
        languageOrder: languageOrder(tool, picks),
        pairs: tool.edges.filter((e) => e.type === "pairs-with").length,
        reason: failedCheck(tool, a, picks, ctx, layers),
      };
    })
    .sort(byRank);
  const passing = ranked.filter((r) => r.reason === null);
  const best = passing[0];
  return {
    layer,
    pick: best ? best.tool.id : null,
    alternatives: passing.slice(1, 1 + ALTERNATIVES).map((r) => r.tool.id),
    breakdown: best ? best.breakdown : [],
    excluded: ranked
      .slice(0, EXCLUDED_WINDOW)
      .filter((r) => r.reason !== null)
      .map((r) => ({ toolId: r.tool.id, reason: r.reason as string })),
  };
}

/**
 * Scores every selected layer in scoring order. Each pick feeds the
 * pairs-with points and pick filters of later layers. Never throws: a layer
 * where nothing passes gets a null pick and its exclusions.
 */
export function scoreStack(a: Answers, kb: KnowledgeBase): LayerResult[] {
  const byLayer = new Map<Layer, Tool[]>();
  const layerOfTool = new Map<string, Layer>();
  for (const tool of kb.tools) {
    layerOfTool.set(tool.id, tool.layer);
    const list = byLayer.get(tool.layer);
    if (list) list.push(tool);
    else byLayer.set(tool.layer, [tool]);
  }
  const picks: Picks = new Map();
  return selectLayers(a, kb).map((layer) => {
    const result = scoreLayer(
      layer,
      byLayer.get(layer) ?? [],
      a,
      picks,
      layerOfTool,
      kb.vocab.capability_layers,
    );
    const pick = result.pick
      ? byLayer.get(layer)?.find((t) => t.id === result.pick)
      : undefined;
    if (pick) picks.set(layer, pick);
    return result;
  });
}
