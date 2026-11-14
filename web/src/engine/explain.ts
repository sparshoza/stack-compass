import type { KnowledgeBase, Tool } from "../lib/kb";
import type { Answers } from "./answers";
import { label } from "./labels";
import type { LayerResult } from "./score";

export type Explanation = { why: string; watchOut: string | null };

const PAIRS = "pairs-with:";

const capitalize = (text: string) =>
  text.charAt(0).toUpperCase() + text.slice(1);

const sentence = (text: string) => (/[.!?]$/.test(text) ? text : `${text}.`);

/**
 * Template text for one layer. `why` joins the labels of the two
 * highest-scoring positive breakdown items (ties keep breakdown order) and
 * adds the pick's first good_for line. `watchOut` is its first avoid_when
 * line. A null pick explains the distinct exclusion reasons instead.
 */
export function explain(
  r: LayerResult,
  _answers: Answers,
  kb: KnowledgeBase,
): Explanation {
  const tool = r.pick ? kb.tools.find((t) => t.id === r.pick) : undefined;
  if (!tool) {
    const reasons = [...new Set(r.excluded.map((e) => e.reason))].map((code) =>
      label(code, kb),
    );
    return {
      why: reasons.length
        ? `No match: ${reasons.join("; ")}.`
        : "No match: no tool in the catalog covers this layer.",
      watchOut: null,
    };
  }
  const topItems = r.breakdown
    .filter((item) => item.points > 0)
    .map((item, index) => ({ item, index }))
    .sort((x, y) => y.item.points - x.item.points || x.index - y.index)
    .slice(0, 2)
    .map(({ item }) => item);
  const paired = topItems
    .map((item) => item.code.startsWith(PAIRS) && kb.tools.find((t) => `${PAIRS}${t.id}` === item.code))
    .filter((t): t is Tool => !!t);
  // Two tools it works with read as one reason: "Works with Express and React from your stack".
  const top =
    paired.length === 2
      ? [`works with ${paired[0].name} and ${paired[1].name} from your stack`]
      : topItems.map((item) => label(item.code, kb));
  const parts: string[] = [];
  // "Works with FastAPI, the backend you got, and is mature": a comma closes
  // the first reason when it has one of its own.
  const joiner = top[0]?.includes(",") ? ", and " : " and ";
  if (top.length) parts.push(sentence(capitalize(top.join(joiner))));
  if (tool.good_for.length) parts.push(sentence(`Good for: ${tool.good_for[0]}`));
  return {
    why: parts.length
      ? parts.join(" ")
      : "Ranked first among the tools that fit your answers.",
    watchOut: tool.avoid_when[0] ?? null,
  };
}
