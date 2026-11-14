import { describe, expect, it } from "vitest";
import {
  kb,
  type KeywordEntry,
  type KnowledgeBase,
  type Tool,
} from "../lib/kb";
import { match, type Detected } from "./match";

function entry(
  phrases: string[],
  sets: Partial<KeywordEntry["sets"]> = {},
): KeywordEntry {
  return {
    phrases,
    sets: { project_type: null, capabilities: [], languages: [], ...sets },
  };
}

function tool(id: string, name: string, extra: Partial<Tool> = {}): Tool {
  return {
    id,
    name,
    aliases: [],
    match_name: true,
    layer: "backend",
    languages: [],
    ...extra,
  } as Tool;
}

function fixture(keywords: KeywordEntry[], tools: Tool[] = []): KnowledgeBase {
  return { tools, keywords } as unknown as KnowledgeBase;
}

const empty: Detected = {
  projectType: null,
  capabilities: [],
  languagesPrefer: [],
  languagesAvoid: [],
  knownTools: [],
  droppedByNegation: [],
};

const base = fixture(
  [
    entry(["chatbot"], { capabilities: ["ai-chat"] }),
    entry(["chat", "websocket"], { capabilities: ["realtime"] }),
    entry(["login", "auth", "sign in"], { capabilities: ["auth"] }),
    entry(["online store"], { project_type: "ecommerce" }),
    entry(["blog"], {
      project_type: "content-site",
      capabilities: ["static-content"],
    }),
    entry(["python"], { languages: ["python"] }),
    entry(["php"], { languages: ["php"] }),
    entry(["java"], { languages: ["java"] }),
    entry(["c#"], { languages: ["c#"] }),
  ],
  [
    tool("django", "Django", { languages: ["python"] }),
    tool("nextjs", "Next.js", { languages: ["typescript", "javascript"] }),
    tool("next", "Next", { languages: ["typescript", "javascript"] }),
    tool("svelte", "Svelte", { languages: ["typescript"] }),
    tool("node", "Node.js", { languages: ["javascript"] }),
    tool("csharp-tool", "Blazor", {
      aliases: ["c# frontend", ".net ui"],
      languages: ["c#"],
    }),
    tool("supabase", "Supabase", { languages: ["typescript", "python", "go"] }),
    tool("express", "Express", {
      aliases: ["expressjs"],
      match_name: false,
      languages: ["javascript"],
    }),
  ],
);

describe("match", () => {
  it("finds phrase on word boundaries only", () => {
    expect(match("I want a chatbot", base).capabilities).toEqual(["ai-chat"]);
    const noBot = fixture([entry(["chat"], { capabilities: ["realtime"] })]);
    expect(match("a chatbot please", noBot)).toEqual(empty);
    expect(match("a chat please", noBot).capabilities).toEqual(["realtime"]);
  });

  it("longest match wins", () => {
    const d = match("built with next.js", base);
    expect(d.knownTools).toEqual(["nextjs"]);
  });

  it("is case and punctuation insensitive", () => {
    expect(match('CHAT!!! (Websocket), "Auth".', base).capabilities).toEqual([
      "realtime",
      "auth",
    ]);
    expect(match("Use Next.JS, please.", base).knownTools).toEqual(["nextjs"]);
  });

  it("keeps dots, plus and hash inside words", () => {
    expect(match("a C# app", base).languagesPrefer).toEqual(["c#"]);
    expect(match("with a .NET UI", base).knownTools).toEqual(["csharp-tool"]);
    const cpp = fixture([entry(["c++"], { languages: ["cpp"] })]);
    expect(match("I know c++ and c++.", cpp).languagesPrefer).toEqual(["cpp"]);
  });

  it("tool alias sets known tool and its language", () => {
    const d = match("a django app", base);
    expect(d.knownTools).toEqual(["django"]);
    expect(d.languagesPrefer).toEqual(["python"]);
  });

  it("does not prefer a language for multi-language or js family tools", () => {
    expect(match("next.js", base).languagesPrefer).toEqual([]);
    expect(match("supabase", base).languagesPrefer).toEqual([]);
    expect(match("svelte", base).languagesPrefer).toEqual(["typescript"]);
    expect(match("node.js", base).languagesPrefer).toEqual(["javascript"]);
  });

  it("negation makes language avoided", () => {
    for (const text of [
      "no python",
      "without php",
      "don't want java",
      "dont use java",
      "I do not want python",
    ]) {
      const d = match(text, base);
      expect(d.languagesPrefer, text).toEqual([]);
      expect(d.languagesAvoid, text).toHaveLength(1);
    }
    expect(match("no python", base).languagesAvoid).toEqual(["python"]);
    expect(match("don't want java", base).languagesAvoid).toEqual(["java"]);
    expect(match("don’t want java", base).languagesAvoid).toEqual(["java"]);
  });

  it("avoid removes an earlier preference for the same language", () => {
    const d = match("django but no python", base);
    expect(d.languagesPrefer).toEqual([]);
    expect(d.languagesAvoid).toEqual(["python"]);
    expect(d.knownTools).toEqual(["django"]);
  });

  it("negation drops capability and tool", () => {
    const d = match("don't need auth, never django", base);
    expect(d.capabilities).toEqual([]);
    expect(d.knownTools).toEqual([]);
    expect(d.languagesPrefer).toEqual([]);
    expect(d.droppedByNegation).toEqual(["auth", "django"]);
  });

  it("handles no need for", () => {
    const d = match("no need for auth", base);
    expect(d.capabilities).toEqual([]);
    expect(d.droppedByNegation).toEqual(["auth"]);
  });

  it("negation window is 3 words", () => {
    expect(match("no really great login", base).capabilities).toEqual([]);
    expect(match("no really great nice login", base).capabilities).toEqual([
      "auth",
    ]);
    expect(match("not a real login", base).capabilities).toEqual([]);
    expect(match("not a very real login", base).capabilities).toEqual(["auth"]);
  });

  it("negation stops at clause breaks", () => {
    const a = match("I have no budget, python backend", base);
    expect(a.languagesPrefer).toEqual(["python"]);
    expect(a.languagesAvoid).toEqual([]);
    const b = match("no php but python", base);
    expect(b.languagesAvoid).toEqual(["php"]);
    expect(b.languagesPrefer).toEqual(["python"]);
    const c = match(
      "no php, no ruby",
      fixture([
        entry(["php"], { languages: ["php"] }),
        entry(["ruby"], { languages: ["ruby"] }),
      ]),
    );
    expect(c.languagesAvoid).toEqual(["php", "ruby"]);
    expect(match("no auth. python", base).languagesPrefer).toEqual(["python"]);
    expect(match("no\npython", base).languagesAvoid).toEqual([]);
    expect(match("no php and python", base).languagesAvoid).toEqual([
      "php",
      "python",
    ]);
    expect(
      match(
        "I use c++. Not java",
        fixture([
          entry(["c++"], { languages: ["cpp"] }),
          entry(["java"], { languages: ["java"] }),
        ]),
      ).languagesPrefer,
    ).toEqual(["cpp"]);
  });

  it("handles contraction negators", () => {
    const d = match("the app doesn't need login", base);
    expect(d.capabilities).toEqual([]);
    expect(d.droppedByNegation).toEqual(["auth"]);
    expect(match("won't use java", base).languagesAvoid).toEqual(["java"]);
    for (const w of ["can't", "isn't", "aren't", "shouldn't", "nor"]) {
      expect(match(`${w} java`, base).languagesAvoid, w).toEqual(["java"]);
    }
  });

  it("a negated project type is ignored", () => {
    const d = match("not an online store, just a blog", base);
    expect(d.projectType).toBe("content-site");
    expect(match("no online store", base).projectType).toBeNull();
  });

  it("project type from phrase", () => {
    expect(match("I run an online store", base).projectType).toBe("ecommerce");
  });

  it("first project type wins when several match", () => {
    expect(match("a blog and an online store", base).projectType).toBe(
      "content-site",
    );
    expect(match("an online store and a blog", base).projectType).toBe(
      "ecommerce",
    );
  });

  it("a match_name false tool matches only by alias", () => {
    expect(match("I want express for the API", base).knownTools).toEqual([]);
    expect(match("use expressjs", base).knownTools).toEqual(["express"]);

    const real = kb.tools.find((t) => !t.match_name && t.aliases.length > 0);
    expect(real).toBeDefined();
    if (!real) return;
    expect(match(`we like ${real.name} a lot`, kb).knownTools).not.toContain(
      real.id,
    );
    expect(match(`we like ${real.aliases[0]} a lot`, kb).knownTools).toContain(
      real.id,
    );
  });

  it("nothing found returns empty Detected", () => {
    expect(match("", base)).toEqual(empty);
    expect(match("lorem ipsum dolor", base)).toEqual(empty);
  });

  it("non-English and emoji text returns empty without throwing", () => {
    expect(match("これはテストです 🚀🔥 привет мир مرحبا", base)).toEqual(
      empty,
    );
    expect(match("\u{1F600}".repeat(50), base)).toEqual(empty);
  });

  it("works on the real knowledge base", () => {
    const d = match("a django app with an online store", kb);
    expect(d.knownTools).toContain("django");
    expect(d.languagesPrefer).toContain("python");
    expect(d.projectType).toBe("ecommerce");
  });

  it("returns fresh arrays on every call", () => {
    const a = match("chat", base);
    a.capabilities.push("x");
    expect(match("chat", base).capabilities).toEqual(["realtime"]);
  });

  it("5000 characters runs under 50 ms", () => {
    const seed =
      "We need a django backend with chat and websocket, no php, online store, next.js frontend, don't need auth, é日本語 🚀 lorem ipsum dolor sit amet. ";
    const text = seed.repeat(Math.ceil(5000 / seed.length)).slice(0, 5000);
    expect(text).toHaveLength(5000);
    match(text, kb);
    const start = performance.now();
    match(text, kb);
    const elapsed = performance.now() - start;
    expect(elapsed).toBeLessThan(50);
  });
});
