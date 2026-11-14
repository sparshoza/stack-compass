import type { KnowledgeBase, Layer } from "../lib/kb";

/** Plain names for layers, as used inside sentences. */
export const LAYER_LABELS: Record<Layer, string> = {
  frontend: "frontend",
  "meta-framework": "meta-framework",
  "ui-kit": "UI kit",
  state: "state library",
  "build-tool": "build tool",
  mobile: "mobile framework",
  backend: "backend",
  "api-style": "API style",
  orm: "ORM",
  database: "database",
  cache: "cache",
  "jobs-queue": "job queue",
  search: "search engine",
  storage: "file storage",
  auth: "auth provider",
  payments: "payments provider",
  email: "email service",
  cms: "CMS",
  hosting: "hosting",
  "ci-cd": "CI/CD",
  observability: "observability tool",
  testing: "testing tool",
};

/**
 * Plain names for the part a tool was picked for, used in "works with X, the
 * <name> you got". The map keeps the developer names in LAYER_LABELS.
 */
const PICK_NAMES: Record<Layer, string> = {
  frontend: "frontend",
  "meta-framework": "web framework",
  "ui-kit": "UI components",
  state: "app state library",
  "build-tool": "build tool",
  mobile: "mobile framework",
  backend: "backend",
  "api-style": "API style",
  orm: "database library",
  database: "database",
  cache: "cache",
  "jobs-queue": "background job runner",
  search: "search engine",
  storage: "file storage",
  auth: "sign-in service",
  payments: "payments provider",
  email: "email service",
  cms: "content editor",
  hosting: "host",
  "ci-cd": "build and deploy service",
  observability: "monitoring tool",
  testing: "testing tool",
};

/** What a tool with each capability does for you, in plain words, with the tool as subject. */
const CAPABILITY_PHRASES: Record<string, string> = {
  realtime: "sends live updates",
  "ssr-seo": "helps pages show up on Google",
  "static-content": "serves fixed pages fast",
  offline: "keeps working offline",
  "file-uploads": "handles file uploads",
  "full-text-search": "powers a search box",
  "background-jobs": "runs slow work in the background",
  "scheduled-jobs": "runs tasks on a timer",
  payments: "takes payments",
  "transactional-email": "sends emails to your customers",
  "content-editing": "lets you edit pages without code",
  "multi-tenant": "serves many customer companies",
  geospatial: "handles maps and places",
  analytics: "reports on lots of data",
  "vector-search": "finds similar things (AI)",
  "social-login": "offers sign in with Google and others",
  "enterprise-sso": "offers company sign in",
  "edge-runtime": "runs close to your users",
  "type-safety": "catches code mistakes early",
  "admin-ui": "gives you admin screens",
  "high-write-throughput": "takes in lots of data fast",
  "native-mobile": "builds apps for the app stores",
  "rest-api": "lets other apps connect",
};

/**
 * Score and reason codes as phrases whose subject is the tool, so they join
 * into sentences ("Sends live updates and works with FastAPI, the backend
 * you got"). Reason phrases describe the excluded tool.
 */
const FIXED: Record<string, string> = {
  known: "is a tool you already know",
  "maturity-established": "is mature and widely used",
  "maturity-emerging": "is newer and still settling",
  "maturity-legacy": "is a legacy choice with fading support",
  "language-excluded": "uses only languages you want to avoid",
  "language-required": "does not use a language you prefer",
  "no-managed-service": "has no official managed service",
  "hosting-mismatch": "does not offer the hosting you chose",
  "budget-paid-only": "has no free tier or open-source option",
  "language-mismatch-with-pick": "does not share a language with the rest of your stack",
  "no-server-runtime": "only serves static files, and your stack has a server",
  "not-built-on-pick": "is built on a tool you did not pick",
  "not-compatible-with-pick": "does not work with the frontend you got",
  "no-web-frontend": "tests web pages, and your stack has none",
};

/** Lowercases the first letter, unless it starts an acronym ("REST API"). */
const lowerFirst = (text: string) =>
  /^[A-Z]{2}/.test(text)
    ? text
    : text.charAt(0).toLowerCase() + text.slice(1);

/** Plain words for any reason or score code. Unknown codes come back unchanged. */
export function label(code: string, kb: KnowledgeBase): string {
  const fixed = FIXED[code];
  if (fixed) return fixed;
  if (code.startsWith("capability:")) {
    const [id, , viaId] = code.slice("capability:".length).split(":");
    const cap = kb.vocab.capabilities.find((c) => c.id === id);
    const does = CAPABILITY_PHRASES[id] ?? `supports ${cap ? lowerFirst(cap.label) : id}`;
    if (viaId) {
      const via = kb.tools.find((t) => t.id === viaId);
      return `${does} through ${via ? via.name : viaId}`;
    }
    return does;
  }
  if (code.startsWith("missing-capability:")) {
    const id = code.slice("missing-capability:".length);
    const cap = kb.vocab.capabilities.find((c) => c.id === id);
    return `does not provide ${cap ? lowerFirst(cap.label) : id}`;
  }
  if (code.startsWith("pairs-with:")) {
    const id = code.slice("pairs-with:".length);
    const tool = kb.tools.find((t) => t.id === id);
    if (!tool) return `pairs with ${id}`;
    return `works with ${tool.name}, the ${PICK_NAMES[tool.layer]} you got`;
  }
  return code;
}
