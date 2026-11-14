import { describe, expect, it } from "vitest";
import { kb, type Layer } from "../lib/kb";
import { fromDetected, type Answers } from "./answers";
import {
  ENGINE_CHECKS,
  GOLDEN_CASES,
  PENDING_DATA,
  type Check,
  type GoldenCase,
} from "./golden.cases";
import { label } from "./labels";
import {
  LANGUAGE_LAYERS,
  SERVICE_LAYERS,
  scoreStack,
  type LayerResult,
} from "./score";
import { match } from "./match";

function toolOf(id: string | null) {
  return id ? kb.tools.find((t) => t.id === id) : undefined;
}

function languagesOf(id: string | null): string[] {
  return toolOf(id)?.languages ?? [];
}

function run(c: GoldenCase): { answers: Answers; results: LayerResult[] } {
  const answers = { ...fromDetected(match(c.text, kb)), ...c.answers };
  return { answers, results: scoreStack(answers, kb) };
}

function failures(
  answers: Answers,
  results: LayerResult[],
  check: Check,
): string[] {
  const byLayer = new Map<Layer, LayerResult>(results.map((r) => [r.layer, r]));
  if ("projectType" in check) {
    return answers.projectType === check.projectType
      ? []
      : [`project type is ${answers.projectType}, expected ${check.projectType}`];
  }
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
  if ("noPaidOnlyPick" in check) {
    return results
      .filter((r) => {
        const pricing = toolOf(r.pick)?.pricing;
        return pricing && !pricing.includes("oss") && !pricing.includes("free-tier");
      })
      .map((r) => `${r.layer} pick ${r.pick} is paid only`);
  }
  if ("pickHosting" in check) {
    return results
      .filter((r) => {
        const hosting = toolOf(r.pick)?.hosting;
        return (
          SERVICE_LAYERS.has(r.layer) &&
          hosting &&
          !hosting.includes(check.pickHosting)
        );
      })
      .map((r) => `${r.layer} pick ${r.pick} is not ${check.pickHosting}`);
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

  it("every case has at least one check that depends on scoring", () => {
    const weak = GOLDEN_CASES.filter(
      (c) =>
        !c.checks.some((check) =>
          ENGINE_CHECKS.some((kind) => kind in check),
        ),
    ).map((c) => c.id);
    expect(weak).toEqual([]);
  });

  it("every code in the golden results has a real label", () => {
    const codes = new Set<string>();
    for (const c of GOLDEN_CASES) {
      for (const r of run(c).results) {
        for (const item of r.breakdown) codes.add(item.code);
        for (const e of r.excluded) codes.add(e.reason);
      }
    }
    expect(codes.size).toBeGreaterThan(10);
    const fallback = [...codes].filter((code) => {
      const text = label(code, kb);
      return !text || text === code || text.startsWith("pairs with ") && !text.includes(", your ");
    });
    expect(fallback).toEqual([]);
  });

  for (const c of GOLDEN_CASES) {
    const pending = PENDING_DATA[c.id];
    if (pending) {
      it.skip(`${c.id} (waits for data change: ${pending})`, () => {});
      continue;
    }
    it(c.id, () => {
      const { answers, results } = run(c);
      expect(results.length).toBeGreaterThan(0);
      expect(
        c.checks.flatMap((check) => failures(answers, results, check)),
      ).toEqual([]);
    });
  }
});
