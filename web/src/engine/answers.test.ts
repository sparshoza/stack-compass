import { describe, expect, it } from "vitest";
import { DEFAULT_ANSWERS, defaultAnswers, fromDetected } from "./answers";

describe("answers", () => {
  it("defaults are either, any, startup, tooling off", () => {
    expect(DEFAULT_ANSWERS).toEqual({
      projectType: null,
      languagesPrefer: [],
      languagesAvoid: [],
      capabilities: [],
      hosting: "either",
      budget: "any",
      scale: "startup",
      knownTools: [],
      tooling: false,
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

  it("a spread of the defaults can be mutated without touching them", () => {
    const a = { ...DEFAULT_ANSWERS };
    expect(() => a.capabilities.push("payments")).not.toThrow();
    expect(() => a.knownTools.push("stripe")).not.toThrow();
    expect(DEFAULT_ANSWERS.capabilities).toEqual([]);
    expect(DEFAULT_ANSWERS.knownTools).toEqual([]);
    expect({ ...DEFAULT_ANSWERS }.capabilities).toEqual([]);
  });

  it("defaultAnswers returns a fresh copy each call", () => {
    const one = defaultAnswers();
    one.languagesPrefer.push("python");
    expect(defaultAnswers()).toEqual(DEFAULT_ANSWERS);
    expect(defaultAnswers()).not.toBe(defaultAnswers());
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
