import { describe, expect, it } from "vitest";
import { kb, type Layer } from "../lib/kb";
import { DEFAULT_ANSWERS, type Answers } from "./answers";
import { makeKb, makeTool } from "./fixture";
import { scoreStack, type LayerResult } from "./score";

const answers = (over: Partial<Answers> = {}): Answers => ({
  ...DEFAULT_ANSWERS,
  projectType: "test",
  ...over,
});

function layerOf(results: LayerResult[], layer: Layer): LayerResult {
  const found = results.find((r) => r.layer === layer);
  if (!found) throw new Error(`layer ${layer} missing from results`);
  return found;
}

describe("scoreStack", () => {
  it("capability +3 each", () => {
    const fx = makeKb(
      [
        makeTool("aaa", "database"),
        makeTool("zzz", "database", { tags: ["realtime", "geospatial", "analytics"] }),
      ],
      ["database"],
    );
    const r = layerOf(
      scoreStack(
        answers({ capabilities: ["realtime", "geospatial"], scale: "prototype" }),
        fx,
      ),
      "database",
    );
    expect(r.pick).toBe("zzz");
    expect(r.breakdown).toEqual([
      { code: "capability:realtime", points: 3 },
      { code: "capability:geospatial", points: 3 },
    ]);
    expect(r.alternatives).toEqual(["aaa"]);
  });

  it("known +2", () => {
    const fx = makeKb(
      [makeTool("aaa", "backend"), makeTool("zzz", "backend")],
      ["backend"],
    );
    const r = layerOf(
      scoreStack(answers({ knownTools: ["zzz"], scale: "prototype" }), fx),
      "backend",
    );
    expect(r.pick).toBe("zzz");
    expect(r.breakdown).toEqual([{ code: "known", points: 2 }]);
  });

  it("known does not override a hard filter", () => {
    const fx = makeKb(
      [
        makeTool("aaa", "backend", { languages: ["python"] }),
        makeTool("zzz", "backend", { languages: ["php"] }),
      ],
      ["backend"],
    );
    const r = layerOf(
      scoreStack(answers({ knownTools: ["zzz"], languagesAvoid: ["php"] }), fx),
      "backend",
    );
    expect(r.pick).toBe("aaa");
    expect(r.excluded).toEqual([{ toolId: "zzz", reason: "language-excluded" }]);
  });

  it("pairs-with earlier pick +2", () => {
    const fx = makeKb(
      [
        makeTool("be", "backend", {
          edges: [{ type: "pairs-with", target: "db-a" }],
        }),
        makeTool("db-a", "database", {
          edges: [{ type: "pairs-with", target: "be" }],
        }),
        makeTool("db-b", "database", {
          edges: [{ type: "pairs-with", target: "be" }],
        }),
        makeTool("db-c", "database"),
        makeTool("orm-a", "orm"),
        makeTool("orm-z", "orm", {
          edges: [
            { type: "pairs-with", target: "be" },
            { type: "pairs-with", target: "db-a" },
            { type: "alternative-to", target: "orm-a" },
          ],
        }),
      ],
      ["backend", "database", "orm"],
    );
    const results = scoreStack(answers({ scale: "prototype" }), fx);
    // The backend is scored first, so its edge to a database earns nothing.
    expect(layerOf(results, "backend").breakdown).toEqual([]);
    const db = layerOf(results, "database");
    expect(db.pick).toBe("db-a");
    expect(db.breakdown).toEqual([{ code: "pairs-with:be", points: 2 }]);
    const orm = layerOf(results, "orm");
    expect(orm.pick).toBe("orm-z");
    expect(orm.breakdown).toEqual([
      { code: "pairs-with:be", points: 2 },
      { code: "pairs-with:db-a", points: 2 },
    ]);
  });

  it("maturity weights by scale", () => {
    const fx = makeKb(
      [
        makeTool("est", "backend", { maturity: "established" }),
        makeTool("emg", "database", { maturity: "emerging" }),
        makeTool("leg", "cache", { maturity: "legacy" }),
      ],
      ["backend", "database", "cache"],
    );
    const at = (scale: Answers["scale"]) => {
      const results = scoreStack(answers({ scale }), fx);
      return (["backend", "database", "cache"] as Layer[]).map(
        (layer) => layerOf(results, layer).breakdown,
      );
    };
    expect(at("prototype")).toEqual([
      [],
      [],
      [{ code: "maturity-legacy", points: -2 }],
    ]);
    expect(at("startup")).toEqual([
      [{ code: "maturity-established", points: 1 }],
      [],
      [{ code: "maturity-legacy", points: -2 }],
    ]);
    expect(at("high")).toEqual([
      [{ code: "maturity-established", points: 1 }],
      [{ code: "maturity-emerging", points: -1 }],
      [{ code: "maturity-legacy", points: -2 }],
    ]);
  });

  it("orm shares language with backend pick", () => {
    const tools = [
      makeTool("django", "backend", { languages: ["python"] }),
      makeTool("prisma", "orm", { languages: ["typescript"] }),
      makeTool("sqla", "orm", { languages: ["python"] }),
    ];
    const r = layerOf(
      scoreStack(answers(), makeKb(tools, ["backend", "orm"])),
      "orm",
    );
    expect(r.pick).toBe("sqla");
    expect(r.excluded).toEqual([
      { toolId: "prisma", reason: "language-mismatch-with-pick" },
    ]);

    // Without a backend layer there is no pick to match.
    const alone = layerOf(scoreStack(answers(), makeKb(tools, ["orm"])), "orm");
    expect(alone.pick).toBe("prisma");
    expect(alone.excluded).toEqual([]);
  });

  it("typescript and javascript count as one language for the orm rule", () => {
    const fx = makeKb(
      [
        makeTool("express", "backend", { languages: ["javascript"] }),
        makeTool("typeorm", "orm", { languages: ["typescript"] }),
      ],
      ["backend", "orm"],
    );
    expect(layerOf(scoreStack(answers(), fx), "orm").pick).toBe("typeorm");
  });

  it("meta-framework built on frontend pick", () => {
    const tools = [
      makeTool("react", "frontend"),
      makeTool("vue", "frontend", { maturity: "emerging" }),
      makeTool("astro", "meta-framework"),
      makeTool("nextjs", "meta-framework", {
        edges: [{ type: "built-on", target: "react" }],
      }),
      makeTool("nuxt", "meta-framework", {
        edges: [{ type: "built-on", target: "vue" }],
      }),
    ];
    const r = layerOf(
      scoreStack(answers(), makeKb(tools, ["frontend", "meta-framework"])),
      "meta-framework",
    );
    expect(r.pick).toBe("nextjs");
    expect(r.alternatives).toEqual([]);
    expect(r.excluded).toEqual([
      { toolId: "astro", reason: "not-built-on-pick" },
      { toolId: "nuxt", reason: "not-built-on-pick" },
    ]);

    const alone = layerOf(
      scoreStack(answers(), makeKb(tools, ["meta-framework"])),
      "meta-framework",
    );
    expect(alone.pick).toBe("astro");
  });

  it("state and ui-kit compatible with frontend pick", () => {
    const fx = makeKb(
      [
        makeTool("react", "frontend"),
        makeTool("pinia", "state", {
          edges: [{ type: "pairs-with", target: "vue" }],
        }),
        makeTool("zustand", "state", {
          edges: [{ type: "pairs-with", target: "react" }],
        }),
        makeTool("element", "ui-kit", {
          edges: [{ type: "built-on", target: "vue" }],
        }),
        makeTool("mui", "ui-kit", {
          edges: [{ type: "built-on", target: "react" }],
        }),
      ],
      ["frontend", "state", "ui-kit"],
    );
    const results = scoreStack(answers(), fx);
    const state = layerOf(results, "state");
    expect(state.pick).toBe("zustand");
    expect(state.excluded).toEqual([
      { toolId: "pinia", reason: "not-compatible-with-pick" },
    ]);
    const ui = layerOf(results, "ui-kit");
    expect(ui.pick).toBe("mui");
    expect(ui.excluded).toEqual([
      { toolId: "element", reason: "not-compatible-with-pick" },
    ]);
  });

  it("paid-only excluded on free budget", () => {
    const fx = makeKb(
      [
        makeTool("adyen", "payments", { pricing: ["paid"] }),
        makeTool("polar", "payments", { pricing: ["free-tier", "paid"] }),
        makeTool("killbill", "payments", { pricing: ["oss"] }),
      ],
      ["payments"],
    );
    const free = layerOf(scoreStack(answers({ budget: "free" }), fx), "payments");
    expect(free.pick).toBe("killbill");
    expect(free.alternatives).toEqual(["polar"]);
    expect(free.excluded).toEqual([
      { toolId: "adyen", reason: "budget-paid-only" },
    ]);
    for (const budget of ["low", "any"] as const) {
      const r = layerOf(scoreStack(answers({ budget }), fx), "payments");
      expect(r.pick).toBe("adyen");
      expect(r.excluded).toEqual([]);
    }
  });

  it("hosting filters service layers only", () => {
    const fx = makeKb(
      [
        makeTool("aaa-fw", "backend", { hosting: ["self-hosted"] }),
        makeTool("aaa-db", "database", { hosting: ["self-hosted"] }),
        makeTool("zzz-db", "database", { hosting: ["managed", "self-hosted"] }),
      ],
      ["backend", "database"],
    );
    const managed = scoreStack(answers({ hosting: "managed" }), fx);
    expect(layerOf(managed, "backend").pick).toBe("aaa-fw");
    const db = layerOf(managed, "database");
    expect(db.pick).toBe("zzz-db");
    expect(db.excluded).toEqual([
      { toolId: "aaa-db", reason: "hosting-mismatch" },
    ]);
    expect(
      layerOf(scoreStack(answers({ hosting: "either" }), fx), "database").pick,
    ).toBe("aaa-db");
  });

  it("language-excluded needs every language avoided", () => {
    const fx = makeKb(
      [
        makeTool("aaa", "backend", { languages: ["php"] }),
        makeTool("bbb", "backend", { languages: ["php", "python"] }),
        makeTool("ccc", "backend"),
      ],
      ["backend"],
    );
    const r = layerOf(
      scoreStack(answers({ languagesAvoid: ["php"] }), fx),
      "backend",
    );
    expect(r.pick).toBe("bbb");
    expect(r.alternatives).toEqual(["ccc"]);
    expect(r.excluded).toEqual([{ toolId: "aaa", reason: "language-excluded" }]);
  });

  it("language-required only on language layers and only when prefer is set", () => {
    const fx = makeKb(
      [
        makeTool("express", "backend", { languages: ["javascript"] }),
        makeTool("flask", "backend", { languages: ["python"] }),
        makeTool("aaa-db", "database", { languages: ["javascript"] }),
        makeTool("aaa-host", "hosting"),
        makeTool("aaa-orm", "orm"),
      ],
      ["backend", "database", "orm", "hosting"],
    );
    const prefer = scoreStack(answers({ languagesPrefer: ["python"] }), fx);
    const backend = layerOf(prefer, "backend");
    expect(backend.pick).toBe("flask");
    expect(backend.excluded).toEqual([
      { toolId: "express", reason: "language-required" },
    ]);
    expect(layerOf(prefer, "database").pick).toBe("aaa-db");
    expect(layerOf(prefer, "hosting").pick).toBe("aaa-host");
    // A tool with no languages always passes.
    expect(layerOf(prefer, "orm").pick).toBe("aaa-orm");

    const none = layerOf(scoreStack(answers(), fx), "backend");
    expect(none.pick).toBe("express");
    expect(none.excluded).toEqual([]);
  });

  it("ties by id", () => {
    const fx = makeKb(
      [
        makeTool("mmm", "cache"),
        makeTool("bbb", "cache"),
        makeTool("zzz", "cache"),
        makeTool("aaa", "cache"),
      ],
      ["cache"],
    );
    const r = layerOf(scoreStack(answers(), fx), "cache");
    expect(r.pick).toBe("aaa");
    expect(r.alternatives).toEqual(["bbb", "mmm"]);
  });

  it("ties break by pairs-with edge count, then id", () => {
    const edges = (...targets: string[]) =>
      targets.map((target) => ({ type: "pairs-with" as const, target }));
    const fx = makeKb(
      [
        makeTool("aaa", "cache"),
        makeTool("mmm", "cache", { edges: edges("x", "y") }),
        makeTool("zzz", "cache", {
          edges: [
            ...edges("x", "y", "z"),
            { type: "alternative-to", target: "aaa" },
          ],
        }),
        makeTool("bbb", "cache", { edges: edges("x", "y") }),
      ],
      ["cache"],
    );
    const r = layerOf(scoreStack(answers(), fx), "cache");
    expect(r.pick).toBe("zzz");
    expect(r.alternatives).toEqual(["bbb", "mmm"]);
    // A higher score still beats more edges.
    const known = layerOf(
      scoreStack(answers({ knownTools: ["aaa"] }), fx),
      "cache",
    );
    expect(known.pick).toBe("aaa");
    // The excluded ranking uses the same order.
    const managed = makeKb(
      fx.tools.map((t) => ({ ...t, hosting: ["managed" as const] })),
      ["cache"],
    );
    expect(
      layerOf(scoreStack(answers({ hosting: "self-hosted" }), managed), "cache")
        .excluded.map((e) => e.toolId),
    ).toEqual(["zzz", "bbb", "mmm"]);
  });

  it("language-required on frontend, meta-framework and mobile applies only when the layer has a preferred language", () => {
    const fx = makeKb(
      [
        makeTool("react", "frontend", { languages: ["javascript", "typescript"] }),
        makeTool("nextjs", "meta-framework", {
          languages: ["javascript", "typescript"],
          edges: [{ type: "built-on", target: "react" }],
        }),
        makeTool("expo", "mobile", { languages: ["javascript", "typescript"] }),
        makeTool("maui", "mobile", { languages: ["csharp"] }),
      ],
      ["frontend", "meta-framework", "mobile"],
    );
    const python = scoreStack(answers({ languagesPrefer: ["python"] }), fx);
    expect(layerOf(python, "frontend")).toMatchObject({ pick: "react", excluded: [] });
    expect(layerOf(python, "meta-framework")).toMatchObject({ pick: "nextjs", excluded: [] });
    expect(layerOf(python, "mobile")).toMatchObject({ pick: "expo", alternatives: ["maui"] });

    const csharp = layerOf(
      scoreStack(answers({ languagesPrefer: ["csharp"] }), fx),
      "mobile",
    );
    expect(csharp.pick).toBe("maui");
    expect(csharp.excluded).toEqual([
      { toolId: "expo", reason: "language-required" },
    ]);
  });

  it("typescript and javascript count as one family for language-required", () => {
    const fx = makeKb(
      [
        makeTool("express", "backend", { languages: ["javascript"] }),
        makeTool("flask", "backend", { languages: ["python"] }),
        makeTool("lit", "frontend", { languages: ["javascript"] }),
        makeTool("blazor", "frontend", { languages: ["csharp"] }),
      ],
      ["backend", "frontend"],
    );
    const results = scoreStack(answers({ languagesPrefer: ["typescript"] }), fx);
    const backend = layerOf(results, "backend");
    expect(backend.pick).toBe("express");
    expect(backend.excluded).toEqual([
      { toolId: "flask", reason: "language-required" },
    ]);
    const frontend = layerOf(results, "frontend");
    expect(frontend.pick).toBe("lit");
    expect(frontend.excluded).toEqual([
      { toolId: "blazor", reason: "language-required" },
    ]);
  });

  it("jobs-queue shares a language with the backend pick", () => {
    const tools = [
      makeTool("django", "backend", { languages: ["python"] }),
      makeTool("bullmq", "jobs-queue", { languages: ["javascript"] }),
      makeTool("celery", "jobs-queue", { languages: ["python"] }),
      makeTool("any-queue", "jobs-queue"),
    ];
    const r = layerOf(
      scoreStack(answers(), makeKb(tools, ["backend", "jobs-queue"])),
      "jobs-queue",
    );
    expect(r.pick).toBe("any-queue");
    expect(r.alternatives).toEqual(["celery"]);
    expect(r.excluded).toEqual([
      { toolId: "bullmq", reason: "language-mismatch-with-pick" },
    ]);
    const alone = layerOf(
      scoreStack(answers(), makeKb(tools, ["jobs-queue"])),
      "jobs-queue",
    );
    expect(alone.excluded).toEqual([]);
  });

  it("api-style shares a language with the backend pick", () => {
    const tools = [
      makeTool("axum", "backend", { languages: ["rust"] }),
      makeTool("apollo-server", "api-style", { languages: ["javascript"] }),
      makeTool("grpc", "api-style", { languages: ["go", "rust", "python"] }),
      makeTool("openapi", "api-style"),
    ];
    const r = layerOf(
      scoreStack(answers(), makeKb(tools, ["backend", "api-style"])),
      "api-style",
    );
    expect(r.pick).toBe("grpc");
    expect(r.alternatives).toEqual(["openapi"]);
    expect(r.excluded).toEqual([
      { toolId: "apollo-server", reason: "language-mismatch-with-pick" },
    ]);
    const alone = layerOf(
      scoreStack(answers(), makeKb(tools, ["api-style"])),
      "api-style",
    );
    expect(alone.pick).toBe("apollo-server");
    expect(alone.excluded).toEqual([]);
  });

  it("auth shares a language with the backend or frontend pick", () => {
    const tools = [
      makeTool("express", "backend", { languages: ["javascript"] }),
      makeTool("react", "frontend", { languages: ["javascript", "typescript"] }),
      makeTool("devise", "auth", { languages: ["ruby"] }),
      makeTool("clerk", "auth", {
        languages: ["javascript", "typescript", "python", "ruby", "go"],
        hosting: ["managed"],
      }),
      makeTool("better-auth", "auth", { languages: ["typescript"] }),
      makeTool("authentik", "auth"),
    ];
    // Knowing devise lifts it into the top 3, so its exclusion is listed.
    const knowsDevise = answers({ knownTools: ["devise"] });
    const r = layerOf(
      scoreStack(knowsDevise, makeKb(tools, ["backend", "auth"])),
      "auth",
    );
    expect(r.pick).toBe("authentik");
    // The hosted multi-language service and the TypeScript library both pass.
    expect(r.alternatives).toEqual(["better-auth", "clerk"]);
    expect(r.excluded).toEqual([
      { toolId: "devise", reason: "language-mismatch-with-pick" },
    ]);

    // With only a frontend pick, the frontend decides.
    const frontendOnly = layerOf(
      scoreStack(knowsDevise, makeKb(tools, ["frontend", "auth"])),
      "auth",
    );
    expect(frontendOnly.excluded).toEqual([
      { toolId: "devise", reason: "language-mismatch-with-pick" },
    ]);

    // A Ruby backend keeps devise: it shares a language with the backend pick.
    const ruby = makeKb(
      [
        makeTool("rails", "backend", { languages: ["ruby"] }),
        ...tools.filter((t) => t.layer === "auth"),
      ],
      ["backend", "auth"],
    );
    expect(layerOf(scoreStack(knowsDevise, ruby), "auth").excluded).toEqual([
      { toolId: "better-auth", reason: "language-mismatch-with-pick" },
    ]);
  });

  it("testing shares a language with the backend or frontend pick", () => {
    const tools = [
      makeTool("django", "backend", { languages: ["python"] }),
      makeTool("react", "frontend", { languages: ["javascript", "typescript"] }),
      makeTool("jest", "testing", { languages: ["typescript"] }),
      makeTool("pytest", "testing", { languages: ["python"] }),
      makeTool("rspec", "testing", { languages: ["ruby"] }),
      makeTool("bruno", "testing"),
    ];
    // Knowing rspec lifts it into the top 3, so its exclusion is listed.
    const a = answers({ knownTools: ["rspec"] });
    const both = layerOf(
      scoreStack(a, makeKb(tools, ["backend", "frontend", "testing"])),
      "testing",
    );
    expect(both.pick).toBe("bruno");
    expect(both.alternatives).toEqual(["jest", "pytest"]);
    expect(both.excluded).toEqual([
      { toolId: "rspec", reason: "language-mismatch-with-pick" },
    ]);
    const backendOnly = layerOf(
      scoreStack(a, makeKb(tools, ["backend", "testing"])),
      "testing",
    );
    expect(backendOnly.alternatives).toEqual(["pytest"]);
    expect(backendOnly.excluded.map((e) => e.toolId)).toEqual(["rspec", "jest"]);
    const none = layerOf(
      scoreStack(a, makeKb(tools, ["testing"])),
      "testing",
    );
    expect(none.pick).toBe("rspec");
    expect(none.excluded).toEqual([]);
  });

  it("excluded lists filtered tools that would rank top 3", () => {
    const fx = makeKb(
      [
        makeTool("t1", "search", { tags: ["full-text-search", "vector-search"], hosting: ["managed"] }),
        makeTool("t2", "search", { tags: ["full-text-search"] }),
        makeTool("t3", "search", { tags: ["full-text-search"], hosting: ["managed"] }),
        makeTool("t4", "search", { hosting: ["managed"] }),
        makeTool("t5", "search"),
      ],
      ["search"],
    );
    const r = layerOf(
      scoreStack(
        answers({
          hosting: "self-hosted",
          capabilities: ["full-text-search", "vector-search"],
        }),
        fx,
      ),
      "search",
    );
    expect(r.pick).toBe("t2");
    expect(r.alternatives).toEqual(["t5"]);
    // t4 is filtered too but ranks fourth without filters, so it is not listed.
    expect(r.excluded).toEqual([
      { toolId: "t1", reason: "hosting-mismatch" },
      { toolId: "t3", reason: "hosting-mismatch" },
    ]);
  });

  it("excluded reports the first failing check", () => {
    const fx = makeKb(
      [
        makeTool("aaa", "backend", {
          languages: ["php"],
          pricing: ["paid"],
        }),
      ],
      ["backend"],
    );
    const r = layerOf(
      scoreStack(
        answers({
          languagesAvoid: ["php"],
          languagesPrefer: ["python"],
          budget: "free",
        }),
        fx,
      ),
      "backend",
    );
    expect(r.excluded).toEqual([{ toolId: "aaa", reason: "language-excluded" }]);
  });

  it("null pick with reasons when nothing passes", () => {
    const fx = makeKb(
      [
        makeTool("express", "backend", { languages: ["javascript"] }),
        makeTool("rails", "backend", { languages: ["ruby"] }),
        makeTool("orm-js", "orm", { languages: ["javascript"] }),
      ],
      ["backend", "orm"],
    );
    const results = scoreStack(answers({ languagesPrefer: ["swift"] }), fx);
    const r = layerOf(results, "backend");
    expect(r.pick).toBeNull();
    expect(r.alternatives).toEqual([]);
    expect(r.breakdown).toEqual([]);
    expect(r.excluded).toEqual([
      { toolId: "express", reason: "language-required" },
      { toolId: "rails", reason: "language-required" },
    ]);
    // Backend and orm keep the plain rule even when no tool has the language.
    expect(layerOf(results, "orm").excluded).toEqual([
      { toolId: "orm-js", reason: "language-required" },
    ]);
  });

  it("empty layer yields a null pick without throwing", () => {
    const r = layerOf(
      scoreStack(answers(), makeKb([], ["cms"])),
      "cms",
    );
    expect(r).toEqual({
      layer: "cms",
      pick: null,
      alternatives: [],
      breakdown: [],
      excluded: [],
    });
  });

  it("contradictory real answers never throw", () => {
    // Python plus a known Next.js: no frontend tool is Python, so the
    // preference is skipped there and Next.js wins the meta-framework.
    const results = scoreStack(
      {
        ...DEFAULT_ANSWERS,
        projectType: "web-app",
        languagesPrefer: ["python"],
        knownTools: ["nextjs"],
      },
      kb,
    );
    expect(layerOf(results, "frontend").pick).toBe("react");
    const meta = layerOf(results, "meta-framework");
    expect(meta.pick).toBe("nextjs");
    expect(meta.breakdown).toContainEqual({ code: "known", points: 2 });
    expect(layerOf(results, "backend").pick).toBe("django");

    // Swift has no backend in the catalog: backend and orm are No match.
    const swift = scoreStack(
      { ...DEFAULT_ANSWERS, projectType: "web-app", languagesPrefer: ["swift"] },
      kb,
    );
    for (const layer of ["backend", "orm"] as Layer[]) {
      const r = layerOf(swift, layer);
      expect(r.pick).toBeNull();
      expect(r.excluded.length).toBeGreaterThan(0);
      expect(new Set(r.excluded.map((e) => e.reason))).toEqual(
        new Set(["language-required"]),
      );
    }
  });

  it("no project type returns no layers", () => {
    expect(scoreStack(DEFAULT_ANSWERS, kb)).toEqual([]);
  });

  it("deterministic", () => {
    const a: Answers = {
      ...DEFAULT_ANSWERS,
      projectType: "saas",
      capabilities: ["payments", "realtime", "full-text-search"],
      languagesPrefer: ["typescript"],
      knownTools: ["postgresql"],
      scale: "high",
    };
    const first = scoreStack(a, kb);
    expect(scoreStack(a, kb)).toEqual(first);
    const shuffled = { ...kb, tools: [...kb.tools].reverse() };
    expect(scoreStack(a, shuffled)).toEqual(first);
  });
});
