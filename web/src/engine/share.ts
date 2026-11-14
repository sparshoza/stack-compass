import type { KnowledgeBase } from "../lib/kb";
import { DEFAULT_ANSWERS, type Answers } from "./answers";

/**
 * Share links: every answer goes in the query string so opening the link
 * recomputes the same stack. Only ids and fixed option values are written;
 * the free-text description is not part of Answers and never reaches the URL.
 *
 * Keys: t project type, lp / la languages preferred / avoided, c capabilities,
 * h hosting, b budget, s scale, k known tools, tool dev tooling (1 or 0).
 */

const HOSTING = ["managed", "self-hosted", "either"] as const;
const BUDGET = ["free", "low", "any"] as const;
const SCALE = ["prototype", "startup", "high"] as const;

/** Links longer than this are not ours; decoding stops looking at them. */
const MAX_QUERY_LENGTH = 4000;
/** No list in a real link is this long; extra items are dropped. */
const MAX_LIST_ITEMS = 100;

/** Values echoed back in `ignored` are cut short so a crafted link cannot flood the notice. */
const show = (value: string) => (value.length > 40 ? `${value.slice(0, 40)}...` : value);

const list = (items: readonly string[]) => items.map(encodeURIComponent).join(",");

export function encode(a: Answers): string {
  const parts: string[] = [];
  if (a.projectType) parts.push(`t=${encodeURIComponent(a.projectType)}`);
  if (a.languagesPrefer.length) parts.push(`lp=${list(a.languagesPrefer)}`);
  if (a.languagesAvoid.length) parts.push(`la=${list(a.languagesAvoid)}`);
  if (a.capabilities.length) parts.push(`c=${list(a.capabilities)}`);
  parts.push(`h=${a.hosting}`, `b=${a.budget}`, `s=${a.scale}`);
  if (a.knownTools.length) parts.push(`k=${list(a.knownTools)}`);
  parts.push(`tool=${a.tooling ? 1 : 0}`);
  return parts.join("&");
}

type ShareKb = Pick<KnowledgeBase, "tools" | "vocab">;

function freshDefaults(): Answers {
  return {
    ...DEFAULT_ANSWERS,
    languagesPrefer: [],
    languagesAvoid: [],
    capabilities: [],
    knownTools: [],
  };
}

/**
 * Reads a share link back into answers. Never throws: anything it does not
 * recognise (an unknown capability, a tool removed from the catalog, a bad
 * option value) is dropped and described in `ignored` for a small notice.
 */
export function decode(qs: string, kb: ShareKb): { answers: Answers; ignored: string[] } {
  const answers = freshDefaults();
  const ignored: string[] = [];
  try {
    if (typeof qs !== "string" || qs.length > MAX_QUERY_LENGTH) return { answers, ignored };
    const params = new URLSearchParams(qs);

    const known = {
      projectTypes: new Set(kb.vocab.project_types.map((p) => p.id)),
      languages: new Set(kb.vocab.languages),
      capabilities: new Set(kb.vocab.capabilities.map((c) => c.id)),
      tools: new Set(kb.tools.map((t) => t.id)),
    };

    const items = (key: string, valid: Set<string>, what: string): string[] => {
      const raw = params.get(key);
      if (!raw) return [];
      const out: string[] = [];
      for (const item of raw.split(",").slice(0, MAX_LIST_ITEMS)) {
        const value = item.trim();
        if (!value || out.includes(value)) continue;
        if (valid.has(value)) out.push(value);
        else ignored.push(`${what} "${show(value)}"`);
      }
      return out;
    };

    const option = <T extends string>(key: string, values: readonly T[], what: string, fallback: T): T => {
      const raw = params.get(key);
      if (raw === null || raw === "") return fallback;
      if ((values as readonly string[]).includes(raw)) return raw as T;
      ignored.push(`${what} "${show(raw)}"`);
      return fallback;
    };

    const t = params.get("t");
    if (t) {
      if (known.projectTypes.has(t)) answers.projectType = t;
      else ignored.push(`project type "${show(t)}"`);
    }

    answers.languagesPrefer = items("lp", known.languages, "language");
    answers.languagesAvoid = items("la", known.languages, "language").filter((lang) => {
      if (!answers.languagesPrefer.includes(lang)) return true;
      ignored.push(`language "${lang}" (both preferred and avoided)`);
      return false;
    });
    answers.capabilities = items("c", known.capabilities, "capability");
    answers.hosting = option("h", HOSTING, "hosting", DEFAULT_ANSWERS.hosting);
    answers.budget = option("b", BUDGET, "budget", DEFAULT_ANSWERS.budget);
    answers.scale = option("s", SCALE, "scale", DEFAULT_ANSWERS.scale);
    answers.knownTools = items("k", known.tools, "tool");

    const tool = params.get("tool");
    if (tool === "1") answers.tooling = true;
    else if (tool === "0") answers.tooling = false;
    else if (tool !== null && tool !== "") ignored.push(`tooling "${show(tool)}"`);

    return { answers, ignored };
  } catch {
    return { answers: freshDefaults(), ignored };
  }
}
