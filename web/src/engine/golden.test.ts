import { describe, expect, it } from "vitest";
import { kb, type Layer } from "../lib/kb";
import { fromDetected } from "./answers";
import { GOLDEN_CASES, PENDING_DATA, type Check } from "./golden.cases";
import { LANGUAGE_LAYERS, scoreStack, type LayerResult } from "./score";
import { match } from "./match";

function languagesOf(id: string | null): string[] {
  if (!id) return [];
  return kb.tools.find((t) => t.id === id)?.languages ?? [];
}

function failures(results: LayerResult[], check: Check): string[] {
  const byLayer = new Map<Layer, LayerResult>(results.map((r) => [r.layer, r]));
  if ("backendLanguage" in check) {
    const pick = byLayer.get("backend")?.pick ?? null;
    return languagesOf(pick).includes(check.backendLanguage)
      ? []
      : [`backend pick ${pick} does not use ${check.backendLanguage}`];
  }
  if ("layerPresent" in check) {
    return byLayer.has(check.layerPresent)
      ? []
      : [`layer ${check.layerPresent} missing`];
  }
  if ("layerAbsent" in check) {
    return byLayer.has(check.layerAbsent)
      ? [`layer ${check.layerAbsent} present`]
      : [];
  }
  if ("noToolWithLanguage" in check) {
    const lang = check.noToolWithLanguage;
    return results
      .filter((r) => {
        const langs = languagesOf(r.pick);
        return LANGUAGE_LAYERS.has(r.layer)
          ? langs.includes(lang)
          : langs.length > 0 && langs.every((l) => l === lang);
      })
      .map((r) => `${r.layer} pick ${r.pick} uses ${lang}`);
  }
  const { layer, tool } = check.pickIs;
  const r = byLayer.get(layer);
  if (!r) return [`layer ${layer} missing`];
  return r.pick === tool ? [] : [`${layer} pick is ${r.pick}, expected ${tool}`];
}

describe("golden set", () => {
  it("has 25 cases with unique ids", () => {
    expect(GOLDEN_CASES).toHaveLength(25);
    expect(new Set(GOLDEN_CASES.map((c) => c.id)).size).toBe(25);
  });

  for (const c of GOLDEN_CASES) {
    const pending = PENDING_DATA[c.id];
    if (pending) {
      it.skip(`${c.id} (waits for data change: ${pending})`, () => {});
      continue;
    }
    it(c.id, () => {
      const answers = { ...fromDetected(match(c.text, kb)), ...c.answers };
      const results = scoreStack(answers, kb);
      expect(results.length).toBeGreaterThan(0);
      expect(c.checks.flatMap((check) => failures(results, check))).toEqual([]);
    });
  }
});
