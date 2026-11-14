import { describe, expect, it } from "vitest";
import { kb } from "../lib/kb";
import { DEFAULT_ANSWERS } from "./answers";
import { explain } from "./explain";
import { makeKb, makeTool } from "./fixture";
import { label } from "./labels";
import { emittableCodes, emittableReasons, type LayerResult } from "./score";

const fx = makeKb(
  [
    makeTool("fastapi", "backend", { name: "FastAPI" }),
    makeTool("redis", "cache", {
      name: "Redis",
      good_for: ["Chat and live dashboards", "Caching"],
      avoid_when: ["You need durable storage", "Other"],
    }),
    makeTool("plain", "cache", { name: "Plain" }),
  ],
  ["backend", "cache"],
);

const result = (over: Partial<LayerResult>): LayerResult => ({
  layer: "cache",
  pick: "redis",
  alternatives: [],
  breakdown: [],
  excluded: [],
  ...over,
});

describe("explain", () => {
  it("why uses top two breakdown labels and first good_for", () => {
    const r = result({
      breakdown: [
        { code: "maturity-established", points: 1 },
        { code: "capability:realtime", points: 3 },
        { code: "pairs-with:fastapi", points: 2 },
      ],
    });
    expect(explain(r, DEFAULT_ANSWERS, fx).why).toBe(
      "Supports realtime and pairs with FastAPI, your backend pick. Good for: Chat and live dashboards.",
    );
  });

  it("why leaves out penalties", () => {
    const r = result({
      breakdown: [
        { code: "known", points: 2 },
        { code: "maturity-legacy", points: -2 },
      ],
    });
    expect(explain(r, DEFAULT_ANSWERS, fx).why).toBe(
      "Is a tool you already know. Good for: Chat and live dashboards.",
    );
  });

  it("why without score items or good_for still reads as a sentence", () => {
    const r = result({ pick: "plain" });
    expect(explain(r, DEFAULT_ANSWERS, fx).why).toBe(
      "Ranked first among the tools that fit your answers.",
    );
  });

  it("watchOut is first avoid_when or null", () => {
    expect(explain(result({}), DEFAULT_ANSWERS, fx).watchOut).toBe(
      "You need durable storage",
    );
    expect(
      explain(result({ pick: "plain" }), DEFAULT_ANSWERS, fx).watchOut,
    ).toBeNull();
  });

  it("null pick explains the reasons", () => {
    const r = result({
      pick: null,
      excluded: [
        { toolId: "redis", reason: "hosting-mismatch" },
        { toolId: "plain", reason: "hosting-mismatch" },
        { toolId: "other", reason: "budget-paid-only" },
      ],
    });
    expect(explain(r, DEFAULT_ANSWERS, fx)).toEqual({
      why: `No match: ${label("hosting-mismatch", fx)}; ${label("budget-paid-only", fx)}.`,
      watchOut: null,
    });
    expect(
      explain(result({ pick: null }), DEFAULT_ANSWERS, fx).why,
    ).toBe("No match: no tool in the catalog covers this layer.");
  });
});

describe("label", () => {
  it("every code has a label", () => {
    const codes = [...emittableCodes(kb), ...emittableReasons(kb)];
    expect(codes).toContain("known");
    expect(codes).toContain("capability:realtime");
    expect(codes).toContain("pairs-with:django");
    expect(codes).toContain("capability:vector-search:via:pgvector");
    expect(codes).toContain("language-mismatch-with-pick");
    expect(codes).toContain("no-web-frontend");
    expect(codes).toContain("missing-capability:rest-api");
    expect(codes).toContain("missing-capability:scheduled-jobs");
    // The bare prefix is never emitted on its own.
    expect(codes).not.toContain("missing-capability");
    expect(label("no-web-frontend", kb)).toBe("tests web pages, and your stack has none");
    const missing = codes.filter((code) => {
      const text = label(code, kb);
      return !text || text === code;
    });
    expect(missing).toEqual([]);
  });

  it("labels read as plain words", () => {
    expect(label("capability:ssr-seo", kb)).toBe(
      "supports server rendering and SEO",
    );
    // An acronym at the start keeps its capitals.
    expect(label("capability:rest-api", kb)).toBe("supports REST API");
    expect(label("capability:vector-search:via:pgvector", kb)).toBe(
      "supports vector search via pgvector",
    );
    expect(label("pairs-with:django", kb)).toBe(
      "pairs with Django, your backend pick",
    );
    expect(label("known", kb)).toBe("is a tool you already know");
    expect(label("language-required", kb)).toBe(
      "does not use a language you prefer",
    );
    expect(label("no-managed-service", kb)).toBe("has no official managed service");
    expect(label("missing-capability:rest-api", kb)).toBe("does not provide REST API");
    expect(label("missing-capability:scheduled-jobs", kb)).toBe(
      "does not provide scheduled jobs",
    );
    // Auth and testing compare with the backend or the frontend pick, so the label names neither.
    expect(label("language-mismatch-with-pick", kb)).toBe(
      "does not share a language with the rest of your stack",
    );
  });

  it("unknown codes fall back to the code", () => {
    expect(label("mystery", kb)).toBe("mystery");
    expect(label("pairs-with:no-such-tool", kb)).toBe(
      "pairs with no-such-tool",
    );
  });
});
