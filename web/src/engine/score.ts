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
 * - language-mismatch-with-pick: an orm, api-style or jobs-queue tool must
 *   share a language with the backend pick, and a testing tool with the
 *   backend or the frontend pick, when such a pick exists. An auth library
 *   that runs in the app must share a language with the backend pick, or
 *   with the frontend pick when there is no backend pick; a hosted auth
 *   service may match either. Tools with no languages pass.
 *
 * Everywhere languages are compared, typescript and javascript count as one.
 * - not-built-on-pick: a meta-framework must be built-on the frontend pick,
 *   when there is one.
 * - not-compatible-with-pick: state and ui-kit tools must be built-on or
 *   pair with the frontend pick, when there is one.
 */
export const REASON_CODES = [
  "language-excluded",
  "language-required",
  "no-managed-service",
  "hosting-mismatch",
  "budget-paid-only",
  "language-mismatch-with-pick",
  "not-built-on-pick",
  "not-compatible-with-pick",
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
  testing: ["backend", "frontend"],
};

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
type LayerContext = { preferApplies: boolean };

function failedCheck(
  tool: Tool,
  a: Answers,
  picks: Picks,
  ctx: LayerContext,
): ReasonCode | null {
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
  if (
    (layer === "state" || layer === "ui-kit") &&
    frontend &&
    !hasEdge(tool, ["built-on", "pairs-with"], frontend.id)
  ) {
    return "not-compatible-with-pick";
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
  /** Tie-break: how many pairs-with edges the tool has in the catalog. */
  pairs: number;
  reason: ReasonCode | null;
};

/** Total descending, then pairs-with edge count descending, then id ascending. */
function byRank(x: Ranked, y: Ranked): number {
  if (x.total !== y.total) return y.total - x.total;
  if (x.pairs !== y.pairs) return y.pairs - x.pairs;
  return x.tool.id < y.tool.id ? -1 : x.tool.id > y.tool.id ? 1 : 0;
}

function preferApplies(layer: Layer, tools: Tool[], a: Answers): boolean {
  if (!LANGUAGE_LAYERS.has(layer) || a.languagesPrefer.length === 0) {
    return false;
  }
  if (!SOFT_LANGUAGE_LAYERS.has(layer)) return true;
  return tools.some((t) => sharesLanguage(t.languages, a.languagesPrefer));
}

function scoreLayer(
  layer: Layer,
  tools: Tool[],
  a: Answers,
  picks: Picks,
): LayerResult {
  const ctx: LayerContext = { preferApplies: preferApplies(layer, tools, a) };
  const ranked: Ranked[] = tools
    .map((tool) => {
      const breakdown = breakdownFor(tool, a, picks);
      return {
        tool,
        breakdown,
        total: breakdown.reduce((sum, item) => sum + item.points, 0),
        pairs: tool.edges.filter((e) => e.type === "pairs-with").length,
        reason: failedCheck(tool, a, picks, ctx),
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
  for (const tool of kb.tools) {
    const list = byLayer.get(tool.layer);
    if (list) list.push(tool);
    else byLayer.set(tool.layer, [tool]);
  }
  const picks: Picks = new Map();
  return selectLayers(a, kb).map((layer) => {
    const result = scoreLayer(layer, byLayer.get(layer) ?? [], a, picks);
    const pick = result.pick
      ? byLayer.get(layer)?.find((t) => t.id === result.pick)
      : undefined;
    if (pick) picks.set(layer, pick);
    return result;
  });
}
