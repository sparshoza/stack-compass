import { describe, expect, it } from "vitest";
import { DEFAULT_ANSWERS, fromDetected } from "./answers";

describe("answers", () => {
  it("defaults are either, any, startup, tooling on", () => {
    expect(DEFAULT_ANSWERS).toEqual({
      projectType: null,
      languagesPrefer: [],
      languagesAvoid: [],
      capabilities: [],
      hosting: "either",
      budget: "any",
      scale: "startup",
      knownTools: [],
      tooling: true,
    });
  });

  it("fromDetected copies detected values over the defaults", () => {
    const a = fromDetected({
      projectType: "saas",
      capabilities: ["payments"],
      languagesPrefer: ["python"],
      languagesAvoid: ["php"],
      knownTools: ["stripe"],
      droppedByNegation: ["realtime"],
    });
    expect(a).toEqual({
      ...DEFAULT_ANSWERS,
      projectType: "saas",
      capabilities: ["payments"],
      languagesPrefer: ["python"],
      languagesAvoid: ["php"],
      knownTools: ["stripe"],
    });
  });

  it("fromDetected returns fresh arrays", () => {
    const caps = ["realtime"];
    const a = fromDetected({
      projectType: null,
      capabilities: caps,
      languagesPrefer: [],
      languagesAvoid: [],
      knownTools: [],
      droppedByNegation: [],
    });
    a.capabilities.push("payments");
    expect(caps).toEqual(["realtime"]);
    expect(DEFAULT_ANSWERS.capabilities).toEqual([]);
  });
});
