import type { KeywordEntry, KnowledgeBase, Tool } from "../lib/kb";

export type Detected = {
  projectType: string | null;
  capabilities: string[];
  languagesPrefer: string[];
  languagesAvoid: string[];
  knownTools: string[];
  /**
   * Things the text mentioned but negated ("don't need auth"). Capabilities and
   * tools are recorded by id (capability id, tool id), not by the typed phrase,
   * because the consumer works in ids.
   */
  droppedByNegation: string[];
  /**
   * True when no phrase named the project type and it was guessed from a
   * plain head noun ("an app", "a website") or from what people do in it
   * (guessType). Absent otherwise.
   */
  guessedType?: true;
  /**
   * Needs the text named that no layer in the catalog covers ("sms"), from
   * keyword entries with not_covered. Absent when there are none.
   */
  notCovered?: string[];
};

/** A word within this many tokens before a match can negate it. Fillers do not count. */
const NEGATION_WINDOW = 3;

/**
 * Words skipped when counting the negation window, so "I don't want to use
 * Node" reaches "dont" from "node". They never negate and never stop the
 * look-back; clause barriers still do.
 */
const FILLERS = new Set([
  "want",
  "to",
  "use",
  "using",
  "need",
  "any",
  "a",
  "an",
  "the",
  "be",
  "have",
  "it",
  "we",
  "i",
  "our",
  "in",
]);

/**
 * Single-token negators. Apostrophes are removed during normalization, so
 * "don't" arrives as "dont". "do not" and "no need for" are covered by "not"
 * and "no" because the window is counted in tokens.
 */
const NEGATORS = new Set([
  "no",
  "not",
  "without",
  "avoid",
  "except",
  "dont",
  "doesnt",
  "wont",
  "cant",
  "isnt",
  "arent",
  "shouldnt",
  "nor",
  "never",
  "nothing",
  "none",
  "neither",
  "didnt",
  "havent",
  "wouldnt",
]);

const BARRIER = "\uE000";
const BARRIER_WORDS = new Set(["but", "however"]);

/**
 * Tokens with clause breaks (, ; : ! ? newline, sentence-final dots, ellipses,
 * and the words "but" and "however") kept as BARRIER tokens that negation
 * look-back does not cross. "and" is not a barrier. See tokenize for the
 * normalization rules.
 */
function tokenizeWithBarriers(text: string): string[] {
  const cleaned = text
    .normalize("NFKC")
    .toLowerCase()
    .replace(/['‘’ʼ]/g, "")
    .replace(/[,;:!?\n\r]+|\.{2,}/g, " \uE000 ")
    .replace(/[^\p{L}\p{N}\p{M}.+#\uE000]/gu, " ");
  const tokens: string[] = [];
  for (const raw of cleaned.split(/\s+/)) {
    if (!raw) continue;
    if (raw === BARRIER) {
      tokens.push(BARRIER);
      continue;
    }
    const leadingDot = raw.startsWith(".");
    const sentenceEnd = raw.endsWith(".");
    let token = raw.replace(/^[.+#]+/, "").replace(/\.+$/, "");
    if (!token) {
      if (sentenceEnd) tokens.push(BARRIER);
      continue;
    }
    if (
      leadingDot &&
      raw.charAt(1) !== "." &&
      raw.charAt(1) !== "+" &&
      raw.charAt(1) !== "#"
    ) {
      token = "." + token;
    }
    if (BARRIER_WORDS.has(token)) tokens.push(BARRIER);
    else tokens.push(token);
    if (sentenceEnd) tokens.push(BARRIER);
  }
  return tokens;
}

/**
 * Normalize to a list of tokens: NFKC, lowercase, apostrophes dropped, every
 * character that is not a letter, digit or one of . + # becomes a space. A dot
 * survives only inside a word or as a single leading dot before a word
 * (".net"); a trailing dot is sentence punctuation. "+" and "#" survive at the
 * end of a word ("c++", "c#") and inside one, never at the start.
 *
 * Clause breaks are removed; used for phrases and tool names.
 */
export function tokenize(text: string): string[] {
  return tokenizeWithBarriers(text).filter((t) => t !== BARRIER);
}

type Target =
  { kind: "keyword"; entry: KeywordEntry } | { kind: "tool"; tool: Tool };

type Index = { phrases: Map<string, Target[]>; maxLength: number };

const indexes = new WeakMap<KnowledgeBase, Index>();

function buildIndex(kb: KnowledgeBase): Index {
  const phrases = new Map<string, Target[]>();
  let maxLength = 1;
  const add = (phrase: string, target: Target) => {
    const tokens = tokenize(phrase);
    if (tokens.length === 0) return;
    const key = tokens.join(" ");
    maxLength = Math.max(maxLength, tokens.length);
    const list = phrases.get(key);
    if (list) list.push(target);
    else phrases.set(key, [target]);
  };
  for (const entry of kb.keywords) {
    for (const phrase of entry.phrases) add(phrase, { kind: "keyword", entry });
  }
  for (const tool of kb.tools) {
    const target: Target = { kind: "tool", tool };
    // A tool whose name is an ordinary word (match_name false) is reachable by aliases only.
    if (tool.match_name) add(tool.name, target);
    for (const alias of tool.aliases) add(alias, target);
  }
  // "live scores" finds "live score". Listed phrases and tool names come first,
  // so a plural form never replaces either. One-word phrases get none: "shops"
  // in "my three coffee shops" is not a shop to sell from.
  for (const entry of kb.keywords) {
    for (const phrase of entry.phrases) {
      const tokens = tokenize(phrase);
      if (tokens.length < 2) continue;
      const key = [...tokens.slice(0, -1), pluralOf(tokens[tokens.length - 1])].join(" ");
      if (!phrases.has(key)) phrases.set(key, [{ kind: "keyword", entry }]);
    }
  }
  return { phrases, maxLength };
}

/** The plain English plural of a word: box, boxes; city, cities; score, scores. */
function pluralOf(word: string): string {
  if (/(s|x|z|ch|sh)$/.test(word)) return `${word}es`;
  if (/[^aeiou]y$/.test(word)) return `${word.slice(0, -1)}ies`;
  return `${word}s`;
}

function indexFor(kb: KnowledgeBase): Index {
  let index = indexes.get(kb);
  if (!index) {
    index = buildIndex(kb);
    indexes.set(kb, index);
  }
  return index;
}

/**
 * Layers whose tools fix the server language. Naming a tool anywhere else
 * (Flutter, a UI kit, React) records it as known and forces no language.
 */
const LANGUAGE_SETTING_LAYERS: ReadonlySet<string> = new Set([
  "backend",
  "orm",
  "api-style",
  "jobs-queue",
]);

/** Most language families a named tool may list and still set its languages. */
const MAX_IMPLIED_FAMILIES = 2;

/**
 * The languages a named tool sets as preferred. Only tools in
 * LANGUAGE_SETTING_LAYERS set any, and only when they list at most
 * MAX_IMPLIED_FAMILIES language families (typescript and javascript are one):
 * Spring Boot sets java and kotlin, NestJS sets typescript and javascript. A
 * service with SDKs in many languages (Temporal, River) sets none.
 */
function impliedLanguages(tool: Tool): string[] {
  if (!LANGUAGE_SETTING_LAYERS.has(tool.layer)) return [];
  const families = new Set(
    tool.languages.map((l) => (l === "typescript" ? "javascript" : l)),
  );
  return families.size <= MAX_IMPLIED_FAMILIES ? tool.languages : [];
}

/**
 * Plain head nouns that hint at a project type when no phrase names one. "site"
 * nouns mean a content site unless the text asks for something only an app
 * does. Phrases in keywords.yaml always win over these.
 */
const HEAD_NOUNS: ReadonlyMap<string, "app" | "site" | "tool"> = new Map([
  ["app", "app"],
  ["apps", "app"],
  ["application", "app"],
  ["platform", "app"],
  ["system", "app"],
  ["website", "site"],
  ["site", "site"],
  ["webpage", "site"],
  ["homepage", "site"],
  ["tool", "tool"],
]);

/** Words for the people who use the thing ("let my customers upload photos"). */
const AUDIENCE_WORDS: ReadonlySet<string> = new Set([
  "customers",
  "clients",
  "users",
  "members",
  "people",
  "students",
  "parents",
  "patients",
  "tenants",
  "guests",
  "visitors",
]);

/** Capabilities a plain content site can have; any other one means an app. */
const CONTENT_SITE_CAPABILITIES: ReadonlySet<string> = new Set([
  "static-content",
  "ssr-seo",
  "content-editing",
  "full-text-search",
  "transactional-email",
  "analytics",
  "geospatial",
  "edge-runtime",
]);

const GUESS_TYPES = {
  app: "web-app",
  site: "content-site",
  tool: "internal-tool",
  mobile: "mobile-app",
} as const;
const MOBILE_CAPABILITY = "native-mobile";

/**
 * The most likely project type when no phrase set one: from the first plain
 * head noun that is not negated, or, with no head noun, from an audience word
 * next to a feature only an app has. Null when the text gives neither.
 */
function guessType(tokens: string[], capabilities: Set<string>): string | null {
  const needsApp = [...capabilities].some((c) => !CONTENT_SITE_CAPABILITIES.has(c));
  const phone = capabilities.has(MOBILE_CAPABILITY);
  let head: "app" | "site" | "tool" | null = null;
  for (let i = 0; i < tokens.length && !head; i++) {
    const kind = HEAD_NOUNS.get(tokens[i]);
    if (kind && !isNegated(tokens, i)) head = kind;
  }
  if (head === "tool") return GUESS_TYPES.tool;
  if (head === "site") return needsApp ? GUESS_TYPES.app : GUESS_TYPES.site;
  if (head === "app") return phone ? GUESS_TYPES.mobile : GUESS_TYPES.app;
  if (phone) return GUESS_TYPES.mobile;
  if (needsApp && tokens.some((t) => AUDIENCE_WORDS.has(t))) return GUESS_TYPES.app;
  return null;
}

/** Project type whose stacks get the rest-api capability unless another API style is named. */
const REST_DEFAULT_TYPE = "api-only";
const REST_CAPABILITY = "rest-api";

function isNegated(tokens: string[], position: number): boolean {
  let counted = 0;
  for (let i = position - 1; i >= 0 && counted < NEGATION_WINDOW; i--) {
    if (tokens[i] === BARRIER) return false;
    if (NEGATORS.has(tokens[i])) return true;
    if (!FILLERS.has(tokens[i])) counted++;
  }
  return false;
}

export function match(text: string, kb: KnowledgeBase): Detected {
  const tokens = tokenizeWithBarriers(text);
  const { phrases, maxLength } = indexFor(kb);

  let projectType: string | null = null;
  const capabilities = new Set<string>();
  const prefer = new Set<string>();
  const avoid = new Set<string>();
  const knownTools = new Set<string>();
  const droppedCapabilities = new Set<string>();
  const droppedTools = new Set<string>();
  const dropped = new Set<string>();
  const notCovered = new Set<string>();
  /** GraphQL or an API-style tool was named, so REST is not assumed. */
  let otherApiStyle = false;

  const applyTool = (tool: Tool, negated: boolean) => {
    if (negated) {
      droppedTools.add(tool.id);
      dropped.add(tool.id);
    } else {
      knownTools.add(tool.id);
      for (const language of impliedLanguages(tool)) prefer.add(language);
      if (tool.layer === "api-style") otherApiStyle = true;
    }
  };

  /**
   * Tools named inside a matched keyword phrase ("flutter app" holds
   * "flutter") still count, scanned longest first within the phrase.
   */
  const applyInnerTools = (start: number, length: number, negated: boolean) => {
    let j = start;
    while (j < start + length) {
      let step = 1;
      for (let n = start + length - j; n >= 1; n--) {
        if (n === length) continue;
        const inner = phrases.get(tokens.slice(j, j + n).join(" "));
        const innerTools = inner?.filter((t) => t.kind === "tool") ?? [];
        if (innerTools.length === 0) continue;
        for (const t of innerTools) if (t.kind === "tool") applyTool(t.tool, negated);
        step = n;
        break;
      }
      j += step;
    }
  };

  tokens.forEach((token, at) => {
    if (token === "graphql" && !isNegated(tokens, at)) otherApiStyle = true;
  });

  let i = 0;
  while (i < tokens.length) {
    let matched = 0;
    for (let n = Math.min(maxLength, tokens.length - i); n >= 1; n--) {
      const targets = phrases.get(tokens.slice(i, i + n).join(" "));
      if (!targets) continue;
      matched = n;
      const negated = isNegated(tokens, i);
      for (const target of targets) {
        if (target.kind === "tool") {
          applyTool(target.tool, negated);
          continue;
        }
        const { project_type, capabilities: caps, languages } = target.entry.sets;
        if (negated) {
          for (const cap of caps) {
            droppedCapabilities.add(cap);
            dropped.add(cap);
          }
          for (const language of languages) avoid.add(language);
        } else {
          if (project_type && projectType === null) projectType = project_type;
          for (const need of target.entry.sets.not_covered ?? []) notCovered.add(need);
          for (const cap of caps) capabilities.add(cap);
          for (const language of languages) prefer.add(language);
        }
      }
      if (n > 1 && targets.every((t) => t.kind === "keyword")) {
        applyInnerTools(i, n, negated);
      }
      break;
    }
    i += matched || 1;
  }

  // An API project means a REST API unless the text names another style.
  if (
    projectType === REST_DEFAULT_TYPE &&
    !otherApiStyle &&
    !droppedCapabilities.has(REST_CAPABILITY)
  ) {
    capabilities.add(REST_CAPABILITY);
  }

  const kept = new Set([...capabilities].filter((c) => !droppedCapabilities.has(c)));
  let guessed = false;
  if (projectType === null) {
    projectType = guessType(tokens, kept);
    guessed = projectType !== null;
  }

  // Negation wins over a positive mention elsewhere in the text.
  return {
    ...(guessed ? { guessedType: true as const } : {}),
    ...(notCovered.size > 0 ? { notCovered: [...notCovered] } : {}),
    projectType,
    capabilities: [...capabilities].filter((c) => !droppedCapabilities.has(c)),
    languagesPrefer: [...prefer].filter((l) => !avoid.has(l)),
    languagesAvoid: [...avoid],
    knownTools: [...knownTools].filter((t) => !droppedTools.has(t)),
    droppedByNegation: [...dropped],
  };
}
