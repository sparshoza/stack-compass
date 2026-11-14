import { describe, expect, it } from "vitest";
import { kb as realKb, type Tool } from "../lib/kb";
import { groupsFor, hasOption, matchTools, narrowingOptions, matchLabel } from "./facets";
import { makeKb, makeTool } from "./fixture";

const ids = (tools: Tool[]) => tools.map((t) => t.id);

// Five databases with known uses, scale, hosting and pricing.
const fixture = makeKb(
  [
    makeTool("pg", "database", { uses: ["app-data", "text-search"], scale: "single", hosting: ["self-hosted", "managed"], pricing: ["oss"] }),
    makeTool("lite", "database", { uses: ["app-data"], scale: "single", hosting: ["self-hosted"], pricing: ["oss"], runs_in_app: true }),
    makeTool("vec", "database", { uses: ["vectors"], scale: "both", hosting: ["managed"], pricing: ["free-tier", "paid"], maturity: "emerging" }),
    makeTool("wide", "database", { uses: ["time-series", "vectors"], scale: "scale-out", hosting: ["self-hosted"], pricing: ["oss"] }),
    makeTool("old", "database", { uses: ["app-data"], scale: "single", hosting: ["managed"], pricing: ["paid"], maturity: "legacy" }),
    makeTool("api", "backend", { uses: ["apis"] }),
  ],
  [],
);
const groups = (layer: Parameters<typeof groupsFor>[0]) => groupsFor(layer, fixture);
const group = (id: string) => groups("database").find((g) => g.id === id)!;

describe("groupsFor", () => {
  it("orders a layer's groups: need, its other groups, where it runs, scale, then license", () => {
    expect(groupsFor("database", realKb).map((g) => g.id)).toEqual(["need", "run", "scale", "license"]);
    expect(groupsFor("jobs-queue", realKb).map((g) => g.id)).toEqual(["need", "store"]);
    // Frontend is no service: no run or license questions.
    expect(groupsFor("frontend", realKb).map((g) => g.id)).toEqual(["need"]);
  });

  it("shared groups keep only the options the layer lists", () => {
    const run = groupsFor("payments", realKb).find((g) => g.id === "run")!;
    expect(run.options.map((o) => o.id)).toEqual(["self-hosted", "managed"]);
    expect(run.kind).toBe("run");
    expect(groupsFor("database", realKb).find((g) => g.id === "scale")!.kind).toBe("scale");
  });
});

describe("hasOption: derived facets", () => {
  it("run: in-app is runs_in_app, self-hosted excludes in-app tools, managed is hosting managed", () => {
    const run = group("run");
    const tool = (id: string) => fixture.tools.find((t) => t.id === id)!;
    expect(hasOption(tool("lite"), run, "in-app")).toBe(true);
    expect(hasOption(tool("lite"), run, "self-hosted")).toBe(false);
    expect(hasOption(tool("pg"), run, "in-app")).toBe(false);
    expect(hasOption(tool("pg"), run, "self-hosted")).toBe(true);
    expect(hasOption(tool("pg"), run, "managed")).toBe(true);
    expect(hasOption(tool("vec"), run, "self-hosted")).toBe(false);
  });

  it("license: oss needs pricing oss; any matches everything", () => {
    const license = group("license");
    const tool = (id: string) => fixture.tools.find((t) => t.id === id)!;
    expect(hasOption(tool("pg"), license, "oss")).toBe(true);
    expect(hasOption(tool("vec"), license, "oss")).toBe(false);
    expect(hasOption(tool("vec"), license, "any")).toBe(true);
  });

  it("scale: both matches either answer; no scale matches neither", () => {
    const scale = group("scale");
    const tool = (id: string) => fixture.tools.find((t) => t.id === id)!;
    expect(hasOption(tool("vec"), scale, "single")).toBe(true);
    expect(hasOption(tool("vec"), scale, "scale-out")).toBe(true);
    expect(hasOption(tool("wide"), scale, "single")).toBe(false);
    expect(hasOption(makeTool("x", "database"), scale, "single")).toBe(false);
  });
});

describe("matchTools", () => {
  it("no selection matches every tool in the layer, established first, then most pairings, then name", () => {
    const paired = makeKb(
      [
        makeTool("b", "cache"),
        makeTool("a", "cache"),
        makeTool("c", "cache", { edges: [{ type: "pairs-with", target: "z" }] }),
        makeTool("n", "cache", { maturity: "emerging", edges: [{ type: "pairs-with", target: "z" }, { type: "pairs-with", target: "y" }] }),
        makeTool("z", "backend", { edges: [{ type: "pairs-with", target: "b" }] }),
        makeTool("y", "backend"),
      ],
      [],
    );
    // b is paired from z (incoming counts too), so b and c tie on one pairing and sort by name.
    expect(ids(matchTools("cache", {}, paired))).toEqual(["b", "c", "a", "n"]);
    expect(ids(matchTools("database", {}, fixture))).toEqual(["lite", "pg", "wide", "vec", "old"]);
  });

  it("within a multi group a tool needs any chosen option", () => {
    expect(ids(matchTools("database", { need: ["vectors"] }, fixture))).toEqual(["wide", "vec"]);
    expect(ids(matchTools("database", { need: ["vectors", "text-search"] }, fixture))).toEqual(["pg", "wide", "vec"]);
  });

  it("across groups every answered group must match", () => {
    expect(ids(matchTools("database", { need: ["vectors"], run: ["managed"] }, fixture))).toEqual(["vec"]);
    expect(ids(matchTools("database", { need: ["app-data"], license: ["oss"], scale: ["single"] }, fixture))).toEqual(["lite", "pg"]);
    expect(ids(matchTools("database", { need: ["app-data"], run: ["in-app"] }, fixture))).toEqual(["lite"]);
  });

  it("an empty group or the license any option adds no constraint", () => {
    expect(matchTools("database", { need: [], license: ["any"] }, fixture)).toHaveLength(5);
  });

  it("ignores groups and options the layer does not have", () => {
    expect(matchTools("database", { teleport: ["x"], need: ["nope"] }, fixture)).toHaveLength(5);
  });

  it("real catalog: managed vector databases", () => {
    const found = matchTools("database", { need: ["vectors"], run: ["managed"] }, realKb);
    expect(found.length).toBeGreaterThan(0);
    for (const tool of found) {
      expect(tool.uses).toContain("vectors");
      expect(tool.hosting).toContain("managed");
    }
  });
});

describe("narrowingOptions (PQ6)", () => {
  it("hides options that would select every current match or none of them", () => {
    const shown = narrowingOptions("database", {}, fixture);
    // Every database is oss or not: oss narrows, any never does.
    expect(shown.license).toEqual(["oss"]);
    // flexible-data and analytics are on no fixture tool, so they never show.
    expect(shown.need).toEqual(["app-data", "text-search", "vectors", "time-series"]);
    expect(shown.run).toEqual(["in-app", "self-hosted", "managed"]);
  });

  it("is recomputed from the other groups' answers", () => {
    // Among vector tools (wide, vec) both are not in-app; self-hosted and managed each split them.
    const shown = narrowingOptions("database", { need: ["vectors"] }, fixture);
    expect(shown.run).toEqual(["self-hosted", "managed"]);
    // wide is oss and vec is not, so oss still narrows; both scale out but only vec fits one server.
    expect(shown.license).toEqual(["oss"]);
    expect(shown.scale).toEqual(["single"]);
  });

  it("a group's own answers do not hide its other options", () => {
    const shown = narrowingOptions("database", { need: ["vectors"] }, fixture);
    expect(shown.need).toEqual(["app-data", "text-search", "vectors", "time-series"]);
  });

  it("keeps a chosen option even once it stops narrowing", () => {
    const shown = narrowingOptions("database", { need: ["time-series"], license: ["oss"] }, fixture);
    // Only wide is time-series, and it is oss: oss no longer narrows but stays.
    expect(shown.license).toEqual(["oss"]);
    expect(shown.run).toEqual([]);
  });

  it("real catalog: auth options every tool carries never show", () => {
    const auth = realKb.tools.filter((t) => t.layer === "auth");
    const shown = narrowingOptions("auth", {}, realKb);
    for (const option of shown.need) {
      const count = auth.filter((t) => t.uses.includes(option)).length;
      expect(count).toBeGreaterThan(0);
      expect(count).toBeLessThan(auth.length);
    }
  });
});

describe("matchLabel", () => {
  it("names the first chosen use the tool has, else its first need, in vocab order", () => {
    const pg = fixture.tools.find((t) => t.id === "pg")!;
    expect(matchLabel(pg, { need: ["text-search"] }, fixture)).toBe("Text search");
    expect(matchLabel(pg, {}, fixture)).toBe("App data");
    expect(matchLabel(makeTool("bare", "database"), {}, fixture)).toBe("");
  });
});
