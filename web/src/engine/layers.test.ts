import { describe, expect, it } from "vitest";
import { kb } from "../lib/kb";
import { DEFAULT_ANSWERS, type Answers } from "./answers";
import { selectLayers } from "./layers";

const answers = (over: Partial<Answers>): Answers => ({
  ...DEFAULT_ANSWERS,
  ...over,
});

describe("selectLayers", () => {
  it("saas with full-text-search adds search", () => {
    const without = selectLayers(answers({ projectType: "saas" }), kb);
    const withSearch = selectLayers(
      answers({ projectType: "saas", capabilities: ["full-text-search"] }),
      kb,
    );
    expect(without).not.toContain("search");
    expect(withSearch).toContain("search");
  });

  it("returns core, capability and tooling layers in scoring order without duplicates", () => {
    const layers = selectLayers(
      answers({
        projectType: "saas",
        capabilities: ["payments", "background-jobs", "scheduled-jobs"],
      }),
      kb,
    );
    expect(layers).toEqual([
      "backend",
      "frontend",
      "meta-framework",
      "database",
      "orm",
      "auth",
      "jobs-queue",
      "payments",
      "email",
      "state",
      "ui-kit",
      "build-tool",
      "hosting",
      "ci-cd",
      "observability",
      "testing",
    ]);
  });

  it("tooling off drops tooling layers", () => {
    const layers = selectLayers(
      answers({ projectType: "web-app", tooling: false }),
      kb,
    );
    for (const layer of kb.vocab.tooling_layers) {
      expect(layers).not.toContain(layer);
    }
    expect(layers).toEqual([
      "backend",
      "frontend",
      "meta-framework",
      "database",
      "orm",
      "auth",
      "ui-kit",
      "hosting",
    ]);
  });

  it("state and build tool come only with a frontend layer", () => {
    const api = selectLayers(answers({ projectType: "api-only" }), kb);
    expect(api).not.toContain("state");
    expect(api).not.toContain("build-tool");
    for (const layer of ["ci-cd", "observability", "testing"]) expect(api).toContain(layer);

    // A mobile app has no web frontend, so no web state library or bundler.
    const mobile = selectLayers(answers({ projectType: "mobile-app" }), kb);
    expect(mobile).not.toContain("state");
    expect(mobile).not.toContain("build-tool");
    for (const layer of ["ci-cd", "observability", "testing"]) expect(mobile).toContain(layer);

    const apiWithApp = selectLayers(
      answers({ projectType: "api-only", capabilities: ["native-mobile"] }),
      kb,
    );
    expect(apiWithApp).toContain("mobile");
    expect(apiWithApp).not.toContain("state");

    const web = selectLayers(answers({ projectType: "web-app" }), kb);
    expect(web).toContain("state");
    expect(web).toContain("build-tool");
  });

  it("no project type returns empty", () => {
    expect(selectLayers(DEFAULT_ANSWERS, kb)).toEqual([]);
    expect(
      selectLayers(answers({ capabilities: ["payments"] }), kb),
    ).toEqual([]);
  });

  it("unknown project type returns empty", () => {
    expect(selectLayers(answers({ projectType: "spaceship" }), kb)).toEqual(
      [],
    );
  });

  it("ignores unknown capabilities", () => {
    expect(
      selectLayers(
        answers({ projectType: "api-only", capabilities: ["teleport"] }),
        kb,
      ),
    ).toEqual(selectLayers(answers({ projectType: "api-only" }), kb));
  });
});
