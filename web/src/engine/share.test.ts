import { describe, expect, it } from "vitest";
import { kb } from "../lib/kb";
import { DEFAULT_ANSWERS, fromDetected, type Answers } from "./answers";
import { match } from "./match";
import { decode, decodePiece, encode, encodePiece, PIECE_KEYS } from "./share";

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

  it("flags a link that is too long to read", () => {
    const long = decode("t=saas&c=" + "a".repeat(5000), kb);
    expect(long.tooLong).toBe(true);
    expect(long.answers).toEqual({ ...DEFAULT_ANSWERS });
    expect(decode("t=saas", kb).tooLong).toBeUndefined();
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

describe("one piece links", () => {
  it("round trip: mode, layer and answers as group:option pairs", () => {
    const piece = { layer: "database" as const, selection: { need: ["vectors", "analytics"], run: ["managed"] } };
    const qs = encodePiece(piece);
    expect(qs).toBe("m=piece&l=database&f=need:vectors,need:analytics,run:managed");
    expect(decodePiece(qs, kb)).toEqual({ piece, ignored: [] });
    expect([...new URLSearchParams(qs).keys()].every((k) => (PIECE_KEYS as readonly string[]).includes(k))).toBe(true);
  });

  it("no layer yet writes the mode only, and no answers", () => {
    expect(encodePiece({ layer: null, selection: {} })).toBe("m=piece");
    expect(encodePiece({ layer: "cache", selection: { need: [] } })).toBe("m=piece&l=cache");
    expect(decodePiece("m=piece", kb)).toEqual({ piece: { layer: null, selection: {} }, ignored: [] });
  });

  it("drops an unknown part, unknown answers and extra answers to a one-answer question", () => {
    expect(decodePiece("m=piece&l=teleporter&f=need:vectors", kb)).toEqual({
      piece: { layer: null, selection: {} },
      ignored: ['part "teleporter"', 'answer "need:vectors"'],
    });
    const { piece, ignored } = decodePiece(
      "m=piece&l=database&f=need:vectors,need:vectors,need:warp,colour:red,scale:single,scale:scale-out,run:in-app,junk",
      kb,
    );
    expect(piece).toEqual({ layer: "database", selection: { need: ["vectors"], scale: ["single"], run: ["in-app"] } });
    expect(ignored).toEqual([
      'answer "need:warp"',
      'answer "colour:red"',
      'answer "scale:scale-out" (one answer only)',
      'answer "junk"',
    ]);
  });

  it("a shared option the layer does not offer is ignored", () => {
    // Payments never runs inside your app.
    expect(decodePiece("m=piece&l=payments&f=run:in-app", kb).ignored).toEqual(['answer "run:in-app"']);
  });

  it("garbage never throws and a long link is flagged", () => {
    for (const qs of ["", "%%%", "m=piece&l=__proto__&f=__proto__:x", "m=piece&f=" + ",".repeat(3000)]) {
      expect(() => decodePiece(qs, kb)).not.toThrow();
      expect(decodePiece(qs, kb).piece.selection).toEqual({});
    }
    expect(decodePiece("m=piece&l=database&f=" + "need:x,".repeat(1000), kb).tooLong).toBe(true);
  });
});
