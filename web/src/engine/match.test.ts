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

  it("go as an ordinary word sets no language preference", () => {
    for (const text of [
      "an on the go app for commuters",
      "a pay as you go app for parking",
      "a grab and go app for a cafe",
    ]) {
      expect(match(text, kb).languagesPrefer).toEqual([]);
    }
    expect(match("a go web app", kb).languagesPrefer).toContain("go");
  });

  it("tool alias sets known tool and its language", () => {
    const d = match("a django app", base);
    expect(d.knownTools).toEqual(["django"]);
    expect(d.languagesPrefer).toEqual(["python"]);
  });

  it("a server tool sets all its languages when it lists at most two families", () => {
    // TypeScript and JavaScript are one family, so both are set.
    expect(match("next.js", base).languagesPrefer).toEqual(["typescript", "javascript"]);
    // Three families: a multi-language service sets none.
    expect(match("supabase", base).languagesPrefer).toEqual([]);
    const jvm = fixture([], [tool("spring-boot", "Spring Boot", { languages: ["java", "kotlin"] })]);
    expect(match("spring boot", jvm).languagesPrefer).toEqual(["java", "kotlin"]);
    expect(match("svelte", base).languagesPrefer).toEqual(["typescript"]);
    expect(match("node.js", base).languagesPrefer).toEqual(["javascript"]);
  });

  it("only backend, orm, api-style and jobs-queue tools set a language", () => {
    const fx = fixture(
      [entry(["swift"], { languages: ["swift"] })],
      [
        tool("flutter", "Flutter", { layer: "mobile", languages: ["dart"] }),
        tool("svelte", "Svelte", { layer: "frontend", languages: ["typescript"] }),
        tool("gorm", "GORM", { layer: "orm", languages: ["go"] }),
        tool("celery", "Celery", { layer: "jobs-queue", languages: ["python"] }),
        tool("gqlgen", "gqlgen", { layer: "api-style", languages: ["go"] }),
      ],
    );
    const flutter = match("a Flutter app", fx);
    expect(flutter.knownTools).toEqual(["flutter"]);
    expect(flutter.languagesPrefer).toEqual([]);
    expect(match("svelte", fx).languagesPrefer).toEqual([]);
    expect(match("gorm", fx).languagesPrefer).toEqual(["go"]);
    expect(match("celery", fx).languagesPrefer).toEqual(["python"]);
    expect(match("gqlgen", fx).languagesPrefer).toEqual(["go"]);
    // A language typed directly still counts.
    expect(match("an app in swift", fx).languagesPrefer).toEqual(["swift"]);
  });

  it("a tool named inside a longer keyword phrase still counts as known", () => {
    const fx = fixture(
      [entry(["flutter app"], { project_type: "mobile-app" })],
      [
        tool("flutter", "Flutter", { layer: "mobile", languages: ["dart"] }),
        tool("rails", "Rails", { languages: ["ruby"] }),
      ],
    );
    const d = match("a Flutter app", fx);
    expect(d.projectType).toBe("mobile-app");
    expect(d.knownTools).toEqual(["flutter"]);
    expect(d.languagesPrefer).toEqual([]);
    const n = match("no flutter app", fx);
    expect(n.knownTools).toEqual([]);
    expect(n.droppedByNegation).toEqual(["flutter"]);
  });

  it("real catalog: Flutter sets no language, Django and Swift still do", () => {
    const flutter = match("a Flutter app with a login", kb);
    expect(flutter.knownTools).toContain("flutter");
    expect(flutter.languagesPrefer).not.toContain("dart");
    expect(match("an iOS app in Swift", kb).languagesPrefer).toContain("swift");
    expect(match("a django app", kb).languagesPrefer).toContain("python");
  });

  it("real catalog: Spring Boot sets Java and Kotlin, NestJS sets TypeScript and JavaScript", () => {
    expect(match("a SaaS in Spring Boot", kb).languagesPrefer).toEqual(["java", "kotlin"]);
    expect(match("built with NestJS", kb).languagesPrefer.sort()).toEqual(["javascript", "typescript"]);
  });

  it("real catalog: an API project implies a REST API unless GraphQL or an API style is named", () => {
    const fastapi = match("an api built with FastAPI", kb);
    expect(fastapi.projectType).toBe("api-only");
    expect(fastapi.capabilities).toContain("rest-api");
    const graphql = match("a GraphQL API in Go", kb);
    expect(graphql.projectType).toBe("api-only");
    expect(graphql.languagesPrefer).toEqual(["go"]);
    expect(graphql.capabilities).not.toContain("rest-api");
    expect(match("an api with tRPC", kb).capabilities).not.toContain("rest-api");
    // Calling someone else's API is not building one.
    expect(match("integrate with an api", kb).projectType).toBeNull();
    expect(match("a dashboard that pulls data from an api", kb).projectType).not.toBe("api-only");
    expect(match("we need to call an api from our mobile app", kb).projectType).toBe("mobile-app");
    expect(match("an app that uses an api to fetch weather", kb).projectType).not.toBe("api-only");
    expect(match("we are building an api", kb).projectType).toBe("api-only");
    // A negated GraphQL does not count.
    expect(match("build an api, no graphql", kb).capabilities).toContain("rest-api");
  });

  it("real catalog: Go is found in everyday phrasing", () => {
    const rest = match("a Go REST API", kb);
    expect(rest.projectType).toBe("api-only");
    expect(rest.capabilities).toContain("rest-api");
    expect(rest.languagesPrefer).toEqual(["go"]);
    const graphql = match("a Go GraphQL API", kb);
    expect(graphql.projectType).toBe("api-only");
    expect(graphql.languagesPrefer).toEqual(["go"]);
    expect(graphql.capabilities).not.toContain("rest-api");
    const web = match("a Go web app", kb);
    expect(web.projectType).toBe("web-app");
    expect(web.languagesPrefer).toEqual(["go"]);
    for (const text of ["a Go web service", "a Go microservice"]) {
      const d = match(text, kb);
      expect(d.projectType).toBe("api-only");
      expect(d.languagesPrefer).toEqual(["go"]);
    }
    for (const text of ["a Go app", "a Go server"]) {
      expect(match(text, kb).languagesPrefer).toEqual([]);
    }
    // "go" alone is an ordinary verb.
    expect(match("ready to go live with an app", kb).languagesPrefer).toEqual([]);
  });

  it("real catalog: Vapor is found in everyday phrasing", () => {
    for (const text of [
      "a Vapor api",
      "a vapor backend",
      "a Vapor app",
      "our vapor server",
      "the Vapor framework",
      "a Swift Vapor project",
    ]) {
      expect(match(text, kb).knownTools).toContain("vapor");
    }
  });

  it("real catalog: Phoenix is found in everyday phrasing", () => {
    for (const text of ["a Phoenix app", "an Elixir Phoenix project", "our phoenix backend"]) {
      expect(match(text, kb).knownTools).toContain("phoenix");
    }
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
    expect(match("not a very real nice login", base).capabilities).toEqual([
      "auth",
    ]);
  });

  it("filler words do not count toward the negation window", () => {
    const d = match("I don't want to use java", base);
    expect(d.languagesAvoid).toEqual(["java"]);
    expect(d.languagesPrefer).toEqual([]);
    expect(match("we would not need any login", base).capabilities).toEqual([]);
    // Fillers are skipped, but four real words still put a match out of reach.
    expect(match("not a very real nice login", base).capabilities).toEqual([
      "auth",
    ]);
    // A barrier still stops the look-back even across fillers.
    expect(match("no budget, we want to use python", base).languagesPrefer).toEqual([
      "python",
    ]);
  });

  it("nothing, none and more contractions negate", () => {
    const d = match("We use Go and react, nothing in Java", base);
    expect(d.languagesAvoid).toEqual(["java"]);
    expect(d.languagesPrefer).toEqual([]);
    for (const w of ["none", "neither", "didn't", "haven't", "wouldn't"]) {
      expect(match(`${w} java`, base).languagesAvoid, w).toEqual(["java"]);
    }
  });

  it("real catalog: the reviewer's negations avoid the language", () => {
    expect(match("I don't want to use Node", kb).languagesAvoid).toContain("javascript");
    expect(match("I don't want to use Node", kb).languagesPrefer).not.toContain("javascript");
    const d = match("We use Go and react, nothing in Java", kb);
    expect(d.languagesAvoid).toContain("java");
    expect(d.languagesPrefer).not.toContain("java");
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
