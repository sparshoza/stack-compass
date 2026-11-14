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
 * Score and reason codes as phrases whose subject is the tool, so they join
 * into sentences ("Supports realtime and pairs with FastAPI, your backend
 * pick"). Reason phrases describe the excluded tool.
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
  "not-built-on-pick": "is built on a tool you did not pick",
  "not-compatible-with-pick": "does not work with your frontend pick",
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
    const id = code.slice("capability:".length);
    const cap = kb.vocab.capabilities.find((c) => c.id === id);
    return `supports ${cap ? lowerFirst(cap.label) : id}`;
  }
  if (code.startsWith("pairs-with:")) {
    const id = code.slice("pairs-with:".length);
    const tool = kb.tools.find((t) => t.id === id);
    if (!tool) return `pairs with ${id}`;
    return `pairs with ${tool.name}, your ${LAYER_LABELS[tool.layer]} pick`;
  }
  return code;
}
