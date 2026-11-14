import type { Layer } from "../lib/kb";
import type { Answers } from "./answers";

/**
 * Checks a golden case can make on the scored stack.
 * - backendLanguage: the backend pick lists this language.
 * - layerPresent / layerAbsent: the layer is (not) in the result.
 * - noToolWithLanguage: no pick in a language layer (backend, orm, frontend,
 *   meta-framework, mobile) lists the language, and no pick in any other
 *   layer lists it as its only language.
 * - pickIs: the layer's pick is this tool id, or null for "No match".
 */
export type Check =
  | { backendLanguage: string }
  | { layerPresent: Layer }
  | { layerAbsent: Layer }
  | { noToolWithLanguage: string }
  | { pickIs: { layer: Layer; tool: string | null } };

export type GoldenCase = {
  id: string;
  text: string;
  /** Answers the person would set by hand after the text was matched. */
  answers?: Partial<Answers>;
  checks: Check[];
};

export const GOLDEN_CASES: GoldenCase[] = [
  {
    id: "saas-python-stripe",
    text: "A B2B SaaS written in Python with subscription billing through Stripe and a nightly job that emails usage reports.",
    checks: [
      { backendLanguage: "python" },
      { layerPresent: "payments" },
      { pickIs: { layer: "payments", tool: "stripe" } },
      { layerPresent: "jobs-queue" },
      { pickIs: { layer: "jobs-queue", tool: "celery" } },
      { noToolWithLanguage: "php" },
    ],
  },
  {
    id: "ecommerce-typescript-search",
    text: "An online store in TypeScript with product search, Stripe checkout and order confirmation emails.",
    checks: [
      { backendLanguage: "typescript" },
      { layerPresent: "search" },
      { layerPresent: "payments" },
      { layerPresent: "email" },
      { pickIs: { layer: "payments", tool: "stripe" } },
    ],
  },
  {
    id: "content-blog-free",
    text: "A personal blog with markdown content and good SEO, hosted for free.",
    answers: { budget: "free" },
    checks: [
      { layerPresent: "cms" },
      { layerPresent: "hosting" },
      { layerAbsent: "backend" },
      { layerAbsent: "database" },
      { layerAbsent: "payments" },
    ],
  },
  {
    id: "api-go-postgres",
    text: "A REST API written in Go with Postgres and background workers.",
    checks: [
      { backendLanguage: "go" },
      { pickIs: { layer: "backend", tool: "gin" } },
      { pickIs: { layer: "orm", tool: "gorm" } },
      { pickIs: { layer: "database", tool: "postgresql" } },
      { layerPresent: "jobs-queue" },
      { layerAbsent: "frontend" },
    ],
  },
  {
    id: "realtime-elixir-chat",
    text: "A real time chat application in Elixir where users see who is online.",
    checks: [
      { backendLanguage: "elixir" },
      { pickIs: { layer: "backend", tool: "phoenix" } },
      { layerPresent: "cache" },
      { layerAbsent: "orm" },
    ],
  },
  {
    id: "mobile-flutter-offline",
    text: "A Flutter app for iOS and Android with offline mode and push notifications.",
    checks: [
      { pickIs: { layer: "mobile", tool: "flutter" } },
      { layerPresent: "backend" },
      { layerPresent: "auth" },
      { layerAbsent: "frontend" },
      { layerAbsent: "meta-framework" },
    ],
  },
  {
    id: "internal-django-admin-sso",
    text: "An internal tool for the ops team in Django with an admin panel and SSO login.",
    checks: [
      { pickIs: { layer: "backend", tool: "django" } },
      { backendLanguage: "python" },
      { layerAbsent: "meta-framework" },
      { layerAbsent: "payments" },
    ],
  },
  {
    id: "ecommerce-laravel",
    text: "An online shop for my business built with Laravel, taking payments and sending order confirmation emails.",
    checks: [
      { pickIs: { layer: "backend", tool: "laravel" } },
      { backendLanguage: "php" },
      { pickIs: { layer: "payments", tool: "stripe" } },
      { pickIs: { layer: "email", tool: "resend" } },
    ],
  },
  {
    id: "saas-negated-languages",
    text: "A SaaS with a TypeScript backend, no PHP and no Java, with team workspaces for each customer.",
    checks: [
      { backendLanguage: "typescript" },
      { noToolWithLanguage: "php" },
      { noToolWithLanguage: "java" },
    ],
  },
  {
    id: "webapp-ruby-negated-features",
    text: "A todo app in Ruby. No payments, and we don't need real time updates.",
    checks: [
      { backendLanguage: "ruby" },
      { pickIs: { layer: "backend", tool: "rails" } },
      { pickIs: { layer: "orm", tool: "active-record" } },
      { layerAbsent: "payments" },
      { layerAbsent: "cache" },
    ],
  },
  {
    id: "internal-python-self-hosted",
    text: "An internal app for staff in Python with Postgres that has to run on our own servers.",
    answers: { hosting: "self-hosted" },
    checks: [
      { backendLanguage: "python" },
      { pickIs: { layer: "database", tool: "postgresql" } },
      { pickIs: { layer: "hosting", tool: "dokku" } },
      { layerAbsent: "payments" },
    ],
  },
  {
    id: "saas-javascript-free-budget",
    text: "A startup MVP in JavaScript with Stripe like payments, on a zero budget.",
    answers: { budget: "free" },
    checks: [
      { backendLanguage: "javascript" },
      { layerPresent: "payments" },
      { pickIs: { layer: "payments", tool: "polar" } },
    ],
  },
  {
    id: "content-restaurant-cms",
    text: "A marketing website for a restaurant where non technical editors update the menu.",
    checks: [
      { layerPresent: "cms" },
      { layerAbsent: "backend" },
      { layerAbsent: "orm" },
    ],
  },
  {
    id: "realtime-typescript-whiteboard",
    text: "A collaborative whiteboard in TypeScript with live cursors and login with Google.",
    checks: [
      { backendLanguage: "typescript" },
      { pickIs: { layer: "backend", tool: "nestjs" } },
      { layerPresent: "cache" },
    ],
  },
  {
    id: "webapp-java-bank",
    text: "A customer portal written in Java for a bank, with SAML SSO and a big audit log volume.",
    checks: [
      { backendLanguage: "java" },
      { pickIs: { layer: "backend", tool: "spring-boot" } },
      { pickIs: { layer: "orm", tool: "hibernate" } },
      { pickIs: { layer: "auth", tool: "spring-security" } },
      { pickIs: { layer: "database", tool: "cassandra" } },
    ],
  },
  {
    id: "api-csharp-no-tooling",
    text: "A REST API written in C# that sends customer invoices and runs scheduled reports.",
    answers: { tooling: false },
    checks: [
      { backendLanguage: "csharp" },
      { pickIs: { layer: "backend", tool: "aspnet-core" } },
      { pickIs: { layer: "orm", tool: "entity-framework-core" } },
      { layerPresent: "payments" },
      { layerAbsent: "testing" },
      { layerAbsent: "ci-cd" },
    ],
  },
  {
    id: "api-rust-iot",
    text: "A JSON API as a rust web server that ingests millions of events from IoT devices.",
    checks: [
      { backendLanguage: "rust" },
      { pickIs: { layer: "backend", tool: "axum" } },
      { pickIs: { layer: "orm", tool: "sea-orm" } },
      { pickIs: { layer: "database", tool: "cassandra" } },
    ],
  },
  {
    id: "mobile-kotlin-maps",
    text: "An android app in Kotlin with maps and geolocation.",
    checks: [
      { pickIs: { layer: "mobile", tool: "compose-multiplatform" } },
      { pickIs: { layer: "backend", tool: "ktor" } },
      { pickIs: { layer: "orm", tool: "exposed" } },
      { noToolWithLanguage: "swift" },
    ],
  },
  {
    id: "contradiction-python-nextjs",
    text: "A web app with a Python backend, and the frontend in Next.js.",
    checks: [
      { backendLanguage: "python" },
      { pickIs: { layer: "frontend", tool: null } },
      { pickIs: { layer: "meta-framework", tool: null } },
    ],
  },
  {
    id: "contradiction-mobile-python-only",
    text: "A mobile app for iOS and Android, written in Python only.",
    checks: [
      { backendLanguage: "python" },
      { pickIs: { layer: "mobile", tool: null } },
    ],
  },
  {
    id: "contradiction-prefer-and-avoid-php",
    text: "A booking app. The team knows PHP, but the CTO says avoid PHP.",
    answers: { languagesPrefer: ["php"] },
    checks: [
      { pickIs: { layer: "backend", tool: null } },
      { pickIs: { layer: "orm", tool: null } },
      { noToolWithLanguage: "php" },
    ],
  },
  {
    id: "saas-go-semantic-search",
    text: "A B2B SaaS written in Go with semantic search over documents and Stripe subscriptions.",
    checks: [
      { backendLanguage: "go" },
      { pickIs: { layer: "backend", tool: "gin" } },
      { pickIs: { layer: "payments", tool: "stripe" } },
      { layerPresent: "database" },
    ],
  },
  {
    id: "internal-javascript-no-java",
    text: "A CRUD app for inventory management in our warehouse, written in JavaScript, no Java please.",
    checks: [
      { backendLanguage: "javascript" },
      { noToolWithLanguage: "java" },
      { layerAbsent: "meta-framework" },
      { layerAbsent: "payments" },
    ],
  },
  {
    id: "content-docs-search",
    text: "A documentation site for our open source library with site search.",
    checks: [
      { layerPresent: "search" },
      { pickIs: { layer: "search", tool: "pagefind" } },
      { layerAbsent: "backend" },
    ],
  },
  {
    id: "saas-typescript-high-scale",
    text: "A SaaS platform in TypeScript expecting heavy traffic, with background jobs and user uploads.",
    answers: { scale: "high" },
    checks: [
      { backendLanguage: "typescript" },
      { layerPresent: "storage" },
      { layerPresent: "jobs-queue" },
      { noToolWithLanguage: "php" },
    ],
  },
];

/**
 * Cases that fail only because of a catalog fact, keyed by case id, with the
 * data change they wait for. The golden test skips them and names the change.
 */
export const PENDING_DATA: Record<string, string> = {};
