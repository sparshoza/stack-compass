import { describe, expect, it } from "vitest";
import { kb } from "../lib/kb";
import { DEFAULT_ANSWERS, fromDetected, type Answers } from "./answers";
import { match } from "./match";
import { decode, encode } from "./share";

const full: Answers = {
  projectType: "saas",
  languagesPrefer: ["python", "typescript"],
  languagesAvoid: ["php"],
  capabilities: ["payments", "realtime"],
  hosting: "managed",
  budget: "free",
  scale: "high",
  knownTools: [kb.tools[0].id, kb.tools[1].id],
  tooling: false,
};

describe("share links", () => {
  it("round trip equals input", () => {
    expect(decode(encode(full), kb)).toEqual({ answers: full, ignored: [] });
    expect(decode(encode({ ...DEFAULT_ANSWERS }), kb)).toEqual({
      answers: { ...DEFAULT_ANSWERS },
      ignored: [],
    });
  });

  it("uses the documented keys, plain commas and tool=1|0", () => {
    const qs = encode(full);
    const keys = [...new URLSearchParams(qs).keys()];
    expect(keys).toEqual(["t", "lp", "la", "c", "h", "b", "s", "k", "tool"]);
    expect(qs).toContain("c=payments,realtime");
    expect(qs).toContain("tool=0");
    expect(encode({ ...DEFAULT_ANSWERS, projectType: "saas" })).toBe(
      "t=saas&h=either&b=any&s=startup&tool=1",
    );
  });

  it("accepts a leading question mark", () => {
    expect(decode("?" + encode(full), kb).answers).toEqual(full);
  });

  it("unknown capability and removed tool id are ignored and reported", () => {
    const { answers, ignored } = decode(
      "t=saas&c=payments,teleportation&k=gone-tool," + kb.tools[0].id,
      kb,
    );
    expect(answers.capabilities).toEqual(["payments"]);
    expect(answers.knownTools).toEqual([kb.tools[0].id]);
    expect(answers.projectType).toBe("saas");
    expect(ignored).toEqual(['capability "teleportation"', 'tool "gone-tool"']);
  });

  it("reports every kind of unknown value", () => {
    const { answers, ignored } = decode(
      "t=spaceship&lp=cobol&la=fortran&h=moon&b=lots&s=galactic&tool=maybe",
      kb,
    );
    expect(answers).toEqual({ ...DEFAULT_ANSWERS });
    expect(ignored).toEqual([
      'project type "spaceship"',
      'language "cobol"',
      'language "fortran"',
      'hosting "moon"',
      'budget "lots"',
      'scale "galactic"',
      'tooling "maybe"',
    ]);
  });

  it("drops duplicates and a language both preferred and avoided", () => {
    const { answers, ignored } = decode("lp=python,python&la=python,php", kb);
    expect(answers.languagesPrefer).toEqual(["python"]);
    expect(answers.languagesAvoid).toEqual(["php"]);
    expect(ignored).toEqual(['language "python" (both preferred and avoided)']);
  });

  it("garbage query returns defaults without throwing", () => {
    const junk = [
      "",
      "?",
      "%%%",
      "t=%E0%A4%A&c=%",
      "&&&==&",
      "t&lp&c=,,,&k=",
      "x".repeat(10000),
      "c=" + "a,".repeat(5000),
      "<script>alert(1)</script>",
      "t=__proto__&c=constructor,toString",
    ];
    for (const qs of junk) {
      expect(() => decode(qs, kb)).not.toThrow();
      expect(decode(qs, kb).answers).toEqual({ ...DEFAULT_ANSWERS });
    }
    expect(() => decode(undefined as unknown as string, kb)).not.toThrow();
    expect(decode(undefined as unknown as string, kb).answers).toEqual({ ...DEFAULT_ANSWERS });
  });

  it("decoded answers never share arrays with the defaults", () => {
    const { answers } = decode("", kb);
    answers.capabilities.push("realtime");
    expect(DEFAULT_ANSWERS.capabilities).toEqual([]);
  });

  it("free text is never encoded", () => {
    const description =
      "My grandmother wants a recipe swapping saas with payments and realtime chat in python, avoid php, hosted somewhere cheap";
    const answers = fromDetected(match(description, kb));
    // The matcher found something, so the link carries real answers.
    expect(answers.projectType).toBe("saas");
    const qs = encode(answers);
    const values = [...new URLSearchParams(qs).values()].flatMap((v) => v.split(","));
    const allowed = new Set([
      ...kb.vocab.project_types.map((p) => p.id),
      ...kb.vocab.languages,
      ...kb.vocab.capabilities.map((c) => c.id),
      ...kb.tools.map((t) => t.id),
      "managed", "self-hosted", "either", "free", "low", "any",
      "prototype", "startup", "high", "1", "0",
    ]);
    for (const value of values) expect(allowed.has(value)).toBe(true);
    for (const word of ["grandmother", "recipe", "swapping", "somewhere", "cheap"]) {
      expect(qs.toLowerCase()).not.toContain(word);
    }
    expect(qs).not.toContain(encodeURIComponent(description));
  });
});
