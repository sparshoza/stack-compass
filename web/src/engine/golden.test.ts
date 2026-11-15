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
  emittableCodes,
  emittableReasons,
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
  if ("capabilities" in check) {
    return check.capabilities
      .filter((cap) => !answers.capabilities.includes(cap))
      .map((cap) => `capability ${cap} not set`);
  }
  if ("capabilitiesAbsent" in check) {
    return check.capabilitiesAbsent
      .filter((cap) => answers.capabilities.includes(cap))
      .map((cap) => `capability ${cap} set`);
  }
  if ("hostingRunsBackend" in check) {
    const backend = toolOf(byLayer.get("backend")?.pick ?? null);
    const host = toolOf(byLayer.get("hosting")?.pick ?? null);
    if (!backend) return [`no backend pick`];
    if (!host) return [`no hosting pick`];
    const family = (l: string) => (l === "typescript" ? "javascript" : l);
    const runs =
      host.languages.length === 0
        ? host.uses.some((u) => ["backends", "containers", "web-apps"].includes(u))
        : host.languages.some((l) => backend.languages.map(family).includes(family(l)));
    return runs ? [] : [`hosting pick ${host.id} cannot run backend pick ${backend.id}`];
  }
  if ("noEmptyLayer" in check) {
    return results.filter((r) => r.pick === null).map((r) => `layer ${r.layer} has no match`);
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
  if ("ormPairsWithBackend" in check) {
    const backend = toolOf(byLayer.get("backend")?.pick ?? null);
    const orm = toolOf(byLayer.get("orm")?.pick ?? null);
    const pairs = (x: typeof orm, y: typeof orm) =>
      !!x && !!y && x.edges.some((e) => e.type === "pairs-with" && e.target === y.id);
    return pairs(orm, backend) || pairs(backend, orm)
      ? []
      : [`orm pick ${orm?.id ?? null} does not pair with backend pick ${backend?.id ?? null}`];
  }
  const { layer, tool } = check.pickIs;
  const r = byLayer.get(layer);
  if (!r) return [`layer ${layer} missing`];
  return r.pick === tool ? [] : [`${layer} pick is ${r.pick}, expected ${tool}`];
}

describe("golden set", () => {
  it("has 90 cases with unique ids", () => {
    expect(GOLDEN_CASES).toHaveLength(90);
    expect(new Set(GOLDEN_CASES.map((c) => c.id)).size).toBe(90);
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
      return !text || text === code || text.startsWith("works with ") && !text.endsWith(" you got");
    });
    expect(fallback).toEqual([]);
  });

  it("every code in the golden results is one the scorer declares", () => {
    const scoreCodes = new Set(emittableCodes(kb));
    const reasonCodes = new Set<string>(emittableReasons(kb));
    const unknown: string[] = [];
    for (const c of GOLDEN_CASES) {
      for (const r of run(c).results) {
        for (const item of r.breakdown) {
          if (!scoreCodes.has(item.code)) unknown.push(item.code);
        }
        for (const e of r.excluded) {
          if (!reasonCodes.has(e.reason)) unknown.push(e.reason);
        }
      }
    }
    expect(unknown).toEqual([]);
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
