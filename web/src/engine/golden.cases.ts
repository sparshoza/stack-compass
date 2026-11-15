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
 * - noPaidOnlyPick: no pick is paid only (pricing without oss or free-tier).
 * - pickHosting: every pick in a service layer offers this hosting.
 * - ormPairsWithBackend: the ORM pick and the backend pick have a pairs-with
 *   edge between them (the ORM fits the backend, whichever it is).
 * - projectType: the matched (or overridden) project type. This tests the
 *   matcher, not scoring; core layers of a project type are checked here
 *   rather than with layerPresent / layerAbsent.
 * - capabilities: the matched (or overridden) capabilities include these.
 * - capabilitiesAbsent: the matched (or overridden) capabilities include none of these.
 * - hostingRunsBackend: the hosting pick can run the backend pick: it lists
 *   the backend's language, or lists no languages and runs server code.
 * - noEmptyLayer: every layer in the result has a pick (no "No match").
 */
export type Check =
  | { projectType: string }
  | { noPaidOnlyPick: true }
  | { pickHosting: "managed" | "self-hosted" }
  | { backendLanguage: string }
  | { layerPresent: Layer }
  | { layerAbsent: Layer }
  | { noToolWithLanguage: string }
  | { pickIs: { layer: Layer; tool: string | null } }
  | { ormPairsWithBackend: true }
  | { capabilities: string[] }
  | { capabilitiesAbsent: string[] }
  | { hostingRunsBackend: true }
  | { noEmptyLayer: true };

/** Check kinds whose outcome depends on scoring, not only on matching. */
export const ENGINE_CHECKS = [
  "pickIs",
  "noToolWithLanguage",
  "noPaidOnlyPick",
  "pickHosting",
  "ormPairsWithBackend",
  "hostingRunsBackend",
  "noEmptyLayer",
] as const;

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
      { projectType: "saas" },
      { backendLanguage: "python" },
      { pickIs: { layer: "frontend", tool: "react" } },
      // Emailing usage reports is a job, not an analytics database.
      { pickIs: { layer: "database", tool: "postgresql" } },
      { pickIs: { layer: "payments", tool: "stripe" } },
      { pickIs: { layer: "jobs-queue", tool: "celery" } },
      { noToolWithLanguage: "php" },
    ],
  },
  {
    id: "ecommerce-typescript-search",
    text: "An online store in TypeScript with product search, Stripe checkout and order confirmation emails.",
    checks: [
      { projectType: "ecommerce" },
      { backendLanguage: "javascript" },
      { pickIs: { layer: "backend", tool: "express" } },
      { pickIs: { layer: "database", tool: "postgresql" } },
      { layerPresent: "search" },
      { pickIs: { layer: "search", tool: "elasticsearch" } },
      { pickIs: { layer: "payments", tool: "stripe" } },
      { pickIs: { layer: "email", tool: "resend" } },
    ],
  },
  {
    id: "content-blog-free",
    text: "A personal blog with markdown content and good SEO, hosted for free.",
    answers: { budget: "free" },
    checks: [
      { projectType: "content-site" },
      { noPaidOnlyPick: true },
      { pickIs: { layer: "meta-framework", tool: "nextjs" } },
      // A static host with a free tier that pairs with Next.js.
      { pickIs: { layer: "hosting", tool: "vercel" } },
    ],
  },
  {
    id: "api-go-postgres",
    text: "A REST API written in Go with Postgres and background workers.",
    answers: { tooling: true },
    checks: [
      { projectType: "api-only" },
      { backendLanguage: "go" },
      { pickIs: { layer: "backend", tool: "gin" } },
      { pickIs: { layer: "orm", tool: "gorm" } },
      { pickIs: { layer: "database", tool: "postgresql" } },
      { pickIs: { layer: "jobs-queue", tool: "river" } },
      { pickIs: { layer: "testing", tool: "testify" } },
    ],
  },
  {
    id: "realtime-elixir-chat",
    text: "A real time chat application in Elixir where users see who is online.",
    checks: [
      { projectType: "realtime-app" },
      { backendLanguage: "elixir" },
      { pickIs: { layer: "backend", tool: "phoenix" } },
      { pickIs: { layer: "frontend", tool: "react" } },
      { pickIs: { layer: "cache", tool: "redis" } },
    ],
  },
  {
    // Naming Flutter picks the mobile framework but forces no server
    // language, so the app still gets a backend and an ORM.
    id: "mobile-flutter-offline",
    text: "A Flutter app for iOS and Android with offline mode and push notifications.",
    answers: { tooling: true },
    checks: [
      { projectType: "mobile-app" },
      { pickIs: { layer: "mobile", tool: "flutter" } },
      { pickIs: { layer: "backend", tool: "express" } },
      { pickIs: { layer: "orm", tool: "prisma" } },
      { pickIs: { layer: "database", tool: "sqlite" } },
      // No web frontend, so no web state library or bundler.
      { layerAbsent: "state" },
      { layerAbsent: "build-tool" },
    ],
  },
  {
    id: "internal-django-admin-sso",
    text: "An internal tool for the ops team in Django with an admin panel and SSO login.",
    checks: [
      { projectType: "internal-tool" },
      { backendLanguage: "python" },
      { pickIs: { layer: "backend", tool: "django" } },
      { pickIs: { layer: "database", tool: "postgresql" } },
      { noToolWithLanguage: "php" },
    ],
  },
  {
    id: "ecommerce-laravel",
    text: "An online shop for my business built with Laravel, taking payments and sending order confirmation emails.",
    checks: [
      { projectType: "ecommerce" },
      { backendLanguage: "php" },
      { pickIs: { layer: "backend", tool: "laravel" } },
      { pickIs: { layer: "frontend", tool: "react" } },
      // Laravel's own ORM, which pairs with it.
      { pickIs: { layer: "orm", tool: "eloquent" } },
      { pickIs: { layer: "payments", tool: "stripe" } },
      { pickIs: { layer: "email", tool: "resend" } },
    ],
  },
  {
    id: "saas-negated-languages",
    text: "A SaaS with a TypeScript backend, no PHP and no Java, with team workspaces for each customer.",
    checks: [
      { projectType: "saas" },
      { backendLanguage: "javascript" },
      { noToolWithLanguage: "php" },
      { noToolWithLanguage: "java" },
      { pickIs: { layer: "jobs-queue", tool: "pg-boss" } },
    ],
  },
  {
    id: "webapp-ruby-negated-features",
    text: "A todo app in Ruby. No payments, and we don't need real time updates.",
    checks: [
      { projectType: "web-app" },
      { backendLanguage: "ruby" },
      { pickIs: { layer: "backend", tool: "rails" } },
      { pickIs: { layer: "orm", tool: "active-record" } },
      { pickIs: { layer: "frontend", tool: "stimulus" } },
      // Stimulus adds touches to pages Rails builds: no web framework layer.
      { layerAbsent: "meta-framework" },
      { pickIs: { layer: "ui-kit", tool: "tailwindcss" } },
      { layerAbsent: "payments" },
      { layerAbsent: "cache" },
    ],
  },
  {
    id: "internal-python-self-hosted",
    text: "An internal app for staff in Python with Postgres that has to run on our own servers.",
    answers: { hosting: "self-hosted" },
    checks: [
      { projectType: "internal-tool" },
      { backendLanguage: "python" },
      { pickHosting: "self-hosted" },
      { pickIs: { layer: "database", tool: "postgresql" } },
      { pickIs: { layer: "hosting", tool: "dokku" } },
    ],
  },
  {
    id: "saas-javascript-free-budget",
    text: "A startup MVP in JavaScript with Stripe like payments, on a zero budget.",
    answers: { budget: "free" },
    checks: [
      { projectType: "saas" },
      { backendLanguage: "javascript" },
      { noPaidOnlyPick: true },
      { pickIs: { layer: "payments", tool: "polar" } },
    ],
  },
  {
    id: "content-restaurant-cms",
    text: "A marketing website for a restaurant where non technical editors update the menu.",
    checks: [
      { projectType: "content-site" },
      { pickIs: { layer: "cms", tool: "sanity" } },
      { pickIs: { layer: "meta-framework", tool: "nextjs" } },
    ],
  },
  {
    id: "realtime-typescript-whiteboard",
    text: "A collaborative whiteboard in TypeScript with live cursors and login with Google.",
    checks: [
      { projectType: "realtime-app" },
      { backendLanguage: "typescript" },
      { pickIs: { layer: "backend", tool: "nestjs" } },
      { pickIs: { layer: "cache", tool: "redis" } },
      { pickIs: { layer: "auth", tool: "clerk" } },
    ],
  },
  {
    id: "webapp-java-bank",
    text: "A customer portal written in Java for a bank, with SAML SSO and a big audit log volume.",
    checks: [
      { projectType: "web-app" },
      { backendLanguage: "java" },
      { pickIs: { layer: "backend", tool: "spring-boot" } },
      { pickIs: { layer: "orm", tool: "hibernate" } },
      // Audit logs do not make a wide-column store the primary database.
      { pickIs: { layer: "database", tool: "postgresql" } },
    ],
  },
  {
    id: "api-csharp-no-tooling",
    text: "A REST API written in C# that sends customer invoices and runs scheduled reports.",
    answers: { tooling: false },
    checks: [
      { projectType: "api-only" },
      { backendLanguage: "csharp" },
      { pickIs: { layer: "backend", tool: "aspnet-core" } },
      { pickIs: { layer: "orm", tool: "entity-framework-core" } },
      { pickIs: { layer: "jobs-queue", tool: "temporal" } },
      { layerPresent: "payments" },
      { layerAbsent: "testing" },
      { layerAbsent: "ci-cd" },
    ],
  },
  {
    id: "api-rust-iot",
    text: "A JSON API as a rust web server that ingests millions of events from IoT devices.",
    answers: { tooling: true },
    checks: [
      { projectType: "api-only" },
      { backendLanguage: "rust" },
      { pickIs: { layer: "backend", tool: "axum" } },
      { pickIs: { layer: "orm", tool: "sea-orm" } },
      { pickIs: { layer: "database", tool: "cassandra" } },
      { pickIs: { layer: "testing", tool: "postman" } },
      // JavaScript-only API tools (apollo-server, graphql-yoga) are excluded.
      { pickIs: { layer: "api-style", tool: "openapi" } },
      { noToolWithLanguage: "javascript" },
    ],
  },
  {
    id: "mobile-kotlin-maps",
    text: "An android app in Kotlin with maps and geolocation.",
    checks: [
      { projectType: "mobile-app" },
      { backendLanguage: "kotlin" },
      { pickIs: { layer: "mobile", tool: "kotlin-multiplatform" } },
      { pickIs: { layer: "orm", tool: "exposed" } },
      // PostgreSQL does maps through PostGIS.
      { pickIs: { layer: "database", tool: "postgresql" } },
      { noToolWithLanguage: "swift" },
    ],
  },
  {
    // Python is preferred but no frontend tool is Python, so the frontend keeps
    // JavaScript tools and the known Next.js wins the meta-framework.
    id: "python-backend-nextjs-frontend",
    text: "A web app with a Python backend, and the frontend in Next.js.",
    checks: [
      { projectType: "web-app" },
      { backendLanguage: "python" },
      { pickIs: { layer: "frontend", tool: "react" } },
      { pickIs: { layer: "meta-framework", tool: "nextjs" } },
      // Whichever Python backend wins, the ORM must be one made for it.
      { ormPairsWithBackend: true },
    ],
  },
  {
    id: "mobile-python-backend",
    text: "A mobile app for iOS and Android, written in Python only.",
    answers: { tooling: true },
    checks: [
      { projectType: "mobile-app" },
      { backendLanguage: "python" },
      { pickIs: { layer: "mobile", tool: "expo" } },
      { pickIs: { layer: "testing", tool: "pytest" } },
      // No frontend pick, so TypeScript-only auth libraries are excluded.
      { pickIs: { layer: "auth", tool: "clerk" } },
    ],
  },
  {
    // Contradiction: PHP is both preferred (set by hand) and avoided (from the text).
    id: "contradiction-prefer-and-avoid-php",
    text: "A booking app. The team knows PHP, but the CTO says avoid PHP.",
    answers: { languagesPrefer: ["php"] },
    checks: [
      { projectType: "web-app" },
      { pickIs: { layer: "backend", tool: null } },
      { pickIs: { layer: "orm", tool: null } },
      { noToolWithLanguage: "php" },
    ],
  },
  {
    id: "saas-go-semantic-search",
    text: "A B2B SaaS written in Go with semantic search over documents and Stripe subscriptions.",
    checks: [
      { projectType: "saas" },
      { backendLanguage: "go" },
      { pickIs: { layer: "backend", tool: "gin" } },
      { pickIs: { layer: "database", tool: "supabase" } },
      { pickIs: { layer: "jobs-queue", tool: "asynq" } },
      { pickIs: { layer: "payments", tool: "stripe" } },
    ],
  },
  {
    id: "internal-javascript-no-java",
    text: "A CRUD app for inventory management in our warehouse, written in JavaScript, no Java please.",
    checks: [
      { projectType: "internal-tool" },
      { backendLanguage: "javascript" },
      { noToolWithLanguage: "java" },
      { pickIs: { layer: "orm", tool: "prisma" } },
    ],
  },
  {
    id: "content-docs-search",
    text: "A documentation site for our open source library with site search.",
    checks: [
      { projectType: "content-site" },
      { layerPresent: "search" },
      { pickIs: { layer: "search", tool: "pagefind" } },
    ],
  },
  {
    id: "saas-typescript-high-scale",
    text: "A SaaS platform in TypeScript expecting heavy traffic, with background jobs and user uploads.",
    answers: { scale: "high" },
    checks: [
      { projectType: "saas" },
      { backendLanguage: "javascript" },
      { layerPresent: "storage" },
      { pickIs: { layer: "jobs-queue", tool: "bullmq" } },
      { pickIs: { layer: "storage", tool: "uploadthing" } },
      { noToolWithLanguage: "php" },
    ],
  },
  {
    id: "rest-api-short",
    text: "I need a REST API",
    checks: [
      { projectType: "api-only" },
      { layerPresent: "api-style" },
      { pickIs: { layer: "api-style", tool: "openapi" } },
    ],
  },
  {
    // "an api" alone sets no project type (it is often an API the app calls),
    // and a phrase "an api in" would swallow the "in" of "in go", so the
    // person picks API only by hand.
    id: "api-in-go-short",
    text: "an api in go",
    answers: { projectType: "api-only", tooling: true },
    checks: [
      { backendLanguage: "go" },
      { pickIs: { layer: "backend", tool: "gin" } },
      { pickIs: { layer: "orm", tool: "gorm" } },
      { pickIs: { layer: "testing", tool: "testify" } },
    ],
  },
  {
    id: "django-app-short",
    text: "a Django app",
    answers: { projectType: "web-app" },
    checks: [
      { backendLanguage: "python" },
      { pickIs: { layer: "backend", tool: "django" } },
      { pickIs: { layer: "orm", tool: "django-orm" } },
    ],
  },
  {
    id: "laravel-web-app-short",
    text: "a web app in Laravel",
    checks: [
      { projectType: "web-app" },
      { pickIs: { layer: "backend", tool: "laravel" } },
      { pickIs: { layer: "orm", tool: "eloquent" } },
    ],
  },
  {
    // Swift is typed, so it is preferred: the server and the app share it.
    id: "ios-swift-short",
    text: "an iOS app in Swift",
    answers: { tooling: true },
    checks: [
      { projectType: "mobile-app" },
      { backendLanguage: "swift" },
      { pickIs: { layer: "backend", tool: "vapor" } },
      { pickIs: { layer: "orm", tool: "fluent" } },
      { pickIs: { layer: "mobile", tool: "swiftui" } },
      // A Swift test library, not an HTTP client, for a Swift stack.
      { pickIs: { layer: "testing", tool: "swift-testing" } },
    ],
  },
  {
    id: "saas-spring-boot-jobs-managed",
    text: "a SaaS in Spring Boot with background jobs",
    answers: { hosting: "managed" },
    checks: [
      { projectType: "saas" },
      { pickIs: { layer: "backend", tool: "spring-boot" } },
      { pickIs: { layer: "orm", tool: "hibernate" } },
      // A library inside the app: no server of its own to host.
      { pickIs: { layer: "jobs-queue", tool: "jobrunr" } },
    ],
  },
  {
    id: "saas-nestjs-jobs",
    text: "a SaaS built with NestJS with background jobs",
    checks: [
      { projectType: "saas" },
      { pickIs: { layer: "backend", tool: "nestjs" } },
      { pickIs: { layer: "jobs-queue", tool: "bullmq" } },
    ],
  },
  {
    // No web frontend, so no browser test tool; Jest pairs with the ORM pick.
    id: "flutter-app-short",
    text: "a Flutter app",
    answers: { tooling: true },
    checks: [
      { projectType: "mobile-app" },
      { pickIs: { layer: "backend", tool: "express" } },
      { pickIs: { layer: "testing", tool: "jest" } },
    ],
  },
  {
    // An API project implies a REST API.
    id: "api-fastapi-short",
    text: "an api built with FastAPI",
    checks: [
      { projectType: "api-only" },
      { pickIs: { layer: "backend", tool: "fastapi" } },
      { pickIs: { layer: "api-style", tool: "openapi" } },
    ],
  },
  {
    // Naming GraphQL keeps the REST default out.
    id: "api-graphql-go",
    text: "a GraphQL API in Go",
    checks: [
      { projectType: "api-only" },
      { backendLanguage: "go" },
      { pickIs: { layer: "api-style", tool: "gqlgen" } },
    ],
  },
  {
    id: "phoenix-app-short",
    text: "a Phoenix app",
    answers: { projectType: "web-app" },
    checks: [
      { backendLanguage: "elixir" },
      { pickIs: { layer: "backend", tool: "phoenix" } },
      { pickIs: { layer: "orm", tool: "ecto" } },
    ],
  },
  {
    // A REST API capability requires a REST tool in the API style layer, so
    // tRPC (pairs with the picks but has no REST tag) drops out.
    id: "webapp-rest-api",
    text: "a web app with a REST API",
    checks: [
      { projectType: "web-app" },
      { layerPresent: "api-style" },
      { pickIs: { layer: "api-style", tool: "openapi" } },
    ],
  },
  {
    id: "saas-public-api",
    text: "a SaaS with a public api",
    checks: [
      { projectType: "saas" },
      { pickIs: { layer: "api-style", tool: "openapi" } },
    ],
  },
  {
    id: "ecommerce-restful",
    text: "an ecommerce site with restful endpoints",
    checks: [
      { projectType: "ecommerce" },
      { pickIs: { layer: "api-style", tool: "openapi" } },
    ],
  },
  {
    id: "go-rest-api-short",
    text: "a Go REST API",
    answers: { tooling: true },
    checks: [
      { projectType: "api-only" },
      { backendLanguage: "go" },
      { pickIs: { layer: "api-style", tool: "openapi" } },
      { pickIs: { layer: "testing", tool: "testify" } },
    ],
  },
  {
    // Testify and Jest tie (each pairs with one pick); the backend's language wins.
    id: "go-rest-api-mobile",
    text: "a REST API in Go for a mobile app",
    answers: { tooling: true },
    checks: [
      { projectType: "api-only" },
      { backendLanguage: "go" },
      { pickIs: { layer: "api-style", tool: "openapi" } },
      { pickIs: { layer: "testing", tool: "testify" } },
    ],
  },
  {
    // Only Temporal lists C#; it lacks the background-jobs tag, so the tag is not required.
    id: "saas-csharp-background-jobs",
    text: "a SaaS in C# with background jobs",
    checks: [
      { projectType: "saas" },
      { backendLanguage: "csharp" },
      { pickIs: { layer: "jobs-queue", tool: "temporal" } },
    ],
  },
  {
    // pgvector is built on PostgreSQL, so PostgreSQL counts as having vector search.
    id: "python-rag-vector-search",
    text: "a Python RAG web app with vector search",
    checks: [
      { backendLanguage: "python" },
      { pickIs: { layer: "database", tool: "postgresql" } },
    ],
  },
  // Plain prompts a non-technical owner might type. The stack must be one a
  // senior engineer would defend: the right kind of project, the features the
  // words imply, a host that runs the backend, and no "No match" rows.
  {
    id: "plain-bakery-orders",
    text: "an app for my bakery to take orders",
    checks: [
      { projectType: "ecommerce" },
      { capabilities: ["payments"] },
      { pickIs: { layer: "payments", tool: "stripe" } },
      { hostingRunsBackend: true },
      { noEmptyLayer: true },
    ],
  },
  {
    id: "plain-salon-booking",
    text: "a booking site for my salon",
    checks: [
      { projectType: "web-app" },
      { hostingRunsBackend: true },
      { noEmptyLayer: true },
    ],
  },
  {
    id: "plain-marketplace-etsy",
    text: "a marketplace like Etsy for local artists",
    checks: [
      { projectType: "ecommerce" },
      { pickIs: { layer: "payments", tool: "stripe" } },
      { hostingRunsBackend: true },
      { noEmptyLayer: true },
    ],
  },
  {
    // The features a marketplace owner adds by hand: no row may dead-end.
    id: "plain-marketplace-full",
    text: "a marketplace like Etsy for local artists",
    answers: { capabilities: ["payments", "file-uploads", "full-text-search", "transactional-email", "social-login"] },
    checks: [
      { projectType: "ecommerce" },
      { layerPresent: "search" },
      { layerPresent: "storage" },
      { hostingRunsBackend: true },
      { noEmptyLayer: true },
    ],
  },
  {
    id: "plain-inventory-tool",
    text: "an internal tool for my team to track inventory",
    checks: [
      { projectType: "internal-tool" },
      { hostingRunsBackend: true },
      { noEmptyLayer: true },
    ],
  },
  {
    id: "plain-restaurant-website",
    text: "a website for my restaurant with the menu and opening hours",
    checks: [
      { projectType: "content-site" },
      { layerAbsent: "backend" },
      { pickIs: { layer: "cms", tool: "sanity" } },
      { noEmptyLayer: true },
    ],
  },
  {
    id: "plain-candle-shop",
    text: "an online shop to sell my handmade candles",
    checks: [
      { projectType: "ecommerce" },
      { pickIs: { layer: "payments", tool: "stripe" } },
      { hostingRunsBackend: true },
      { noEmptyLayer: true },
    ],
  },
  {
    id: "plain-gym-phone-app",
    text: "a phone app for my gym members to book classes",
    checks: [
      { projectType: "mobile-app" },
      { pickIs: { layer: "mobile", tool: "expo" } },
      { hostingRunsBackend: true },
      { noEmptyLayer: true },
    ],
  },
  {
    // Dev tooling is off by default, so a blog gets no test runner or bundler.
    id: "plain-travel-blog",
    text: "a blog for my travel photos",
    checks: [
      { projectType: "content-site" },
      { layerAbsent: "backend" },
      { layerAbsent: "testing" },
      { layerAbsent: "build-tool" },
      { noEmptyLayer: true },
    ],
  },
  {
    id: "plain-cooking-membership",
    text: "a membership site where people pay monthly for my cooking videos",
    checks: [
      { capabilities: ["payments", "file-uploads"] },
      { layerPresent: "storage" },
      { pickIs: { layer: "payments", tool: "stripe" } },
      { hostingRunsBackend: true },
      { noEmptyLayer: true },
    ],
  },
  {
    id: "plain-community-chat",
    text: "a chat app for my community",
    checks: [
      { projectType: "realtime-app" },
      { capabilities: ["realtime"] },
      { hostingRunsBackend: true },
      { noEmptyLayer: true },
    ],
  },
  {
    id: "plain-plumber-website",
    text: "a simple website for my plumbing business",
    checks: [
      { projectType: "content-site" },
      { layerAbsent: "backend" },
      { noEmptyLayer: true },
    ],
  },
  {
    id: "plain-homework-app",
    text: "an app where parents can see their kids school homework",
    checks: [
      { projectType: "web-app" },
      { layerPresent: "auth" },
      { hostingRunsBackend: true },
      { noEmptyLayer: true },
    ],
  },
  {
    id: "plain-sales-dashboard",
    text: "a dashboard for my sales team to see how many deals we closed",
    checks: [
      { projectType: "internal-tool" },
      { hostingRunsBackend: true },
      { noEmptyLayer: true },
    ],
  },
  {
    id: "plain-tenant-rent",
    text: "a site where tenants can pay rent and report repairs",
    checks: [
      { projectType: "web-app" },
      { capabilities: ["payments"] },
      { pickIs: { layer: "payments", tool: "stripe" } },
      { hostingRunsBackend: true },
      { noEmptyLayer: true },
    ],
  },
  {
    id: "plain-uber-dog-walkers",
    text: "an app like Uber but for dog walkers",
    checks: [
      { projectType: "mobile-app" },
      { capabilities: ["geospatial", "payments"] },
      { layerPresent: "payments" },
      { hostingRunsBackend: true },
      { noEmptyLayer: true },
    ],
  },
  {
    // Selling classes on your own platform: a web app that takes payments.
    id: "plain-course-platform",
    text: "a course platform where I sell online classes",
    checks: [
      { projectType: "web-app" },
      { capabilities: ["payments"] },
      { pickIs: { layer: "payments", tool: "stripe" } },
      { hostingRunsBackend: true },
      { noEmptyLayer: true },
    ],
  },
  {
    id: "plain-art-portfolio",
    text: "a portfolio website to show my art",
    checks: [
      { projectType: "content-site" },
      { layerAbsent: "backend" },
      { noEmptyLayer: true },
    ],
  },
  {
    id: "plain-clinic-appointments",
    text: "a tool for my clinic to manage patient appointments",
    checks: [
      { projectType: "internal-tool" },
      { hostingRunsBackend: true },
      { noEmptyLayer: true },
    ],
  },
  {
    id: "plain-newsletter",
    text: "a newsletter for my small business customers",
    checks: [
      { projectType: "content-site" },
      { capabilities: ["transactional-email"] },
      { layerPresent: "email" },
      { noEmptyLayer: true },
    ],
  },
  {
    id: "plain-church-donations",
    text: "an app for my church to share events and take donations",
    checks: [
      { projectType: "web-app" },
      { capabilities: ["payments"] },
      { pickIs: { layer: "payments", tool: "stripe" } },
      { hostingRunsBackend: true },
      { noEmptyLayer: true },
    ],
  },
  {
    id: "plain-real-estate-crm",
    text: "a crm for my real estate agency",
    checks: [
      { projectType: "internal-tool" },
      { hostingRunsBackend: true },
      { noEmptyLayer: true },
    ],
  },
  {
    id: "plain-recipe-sharing",
    text: "a recipe sharing site with search",
    checks: [
      { projectType: "web-app" },
      { capabilities: ["full-text-search"] },
      { layerPresent: "search" },
      { hostingRunsBackend: true },
      { noEmptyLayer: true },
    ],
  },
  {
    id: "plain-concert-tickets",
    text: "a ticket booking site for local concerts",
    checks: [
      { projectType: "ecommerce" },
      { capabilities: ["payments"] },
      { pickIs: { layer: "payments", tool: "stripe" } },
      { hostingRunsBackend: true },
      { noEmptyLayer: true },
    ],
  },
  {
    id: "plain-photo-quote",
    text: "something to let my customers upload photos and get a quote",
    checks: [
      { projectType: "web-app" },
      { capabilities: ["file-uploads"] },
      { layerPresent: "storage" },
      { hostingRunsBackend: true },
      { noEmptyLayer: true },
    ],
  },
  {
    // pgvector adds vector search to PostgreSQL.
    id: "plain-ai-chatbot",
    text: "an AI chatbot that answers questions about my products",
    checks: [
      { projectType: "web-app" },
      { capabilities: ["vector-search"] },
      { pickIs: { layer: "database", tool: "postgresql" } },
      { hostingRunsBackend: true },
      { noEmptyLayer: true },
    ],
  },
  {
    // Laravel has no runtime on Vercel, so the host must run PHP.
    id: "plain-php-web-app",
    text: "a web app in PHP",
    checks: [
      { projectType: "web-app" },
      { pickIs: { layer: "backend", tool: "laravel" } },
      { hostingRunsBackend: true },
      { noEmptyLayer: true },
    ],
  },
  {
    id: "plain-yoga-classes",
    text: "a website for my yoga studio where clients can book classes",
    checks: [
      { projectType: "web-app" },
      { hostingRunsBackend: true },
      { noEmptyLayer: true },
    ],
  },
  {
    id: "plain-clothing-store",
    text: "an online store for my clothing brand",
    checks: [
      { projectType: "ecommerce" },
      { pickIs: { layer: "payments", tool: "stripe" } },
      { hostingRunsBackend: true },
      { noEmptyLayer: true },
    ],
  },
  {
    id: "plain-theatre-tickets",
    text: "a site to sell tickets for my theatre",
    checks: [
      { projectType: "ecommerce" },
      { capabilities: ["payments"] },
      { hostingRunsBackend: true },
      { noEmptyLayer: true },
    ],
  },
  {
    id: "plain-restaurant-reservations",
    text: "an app for my restaurant to take reservations",
    checks: [
      { projectType: "web-app" },
      { hostingRunsBackend: true },
      { noEmptyLayer: true },
    ],
  },
  {
    id: "plain-gym-members-area",
    text: "a members area for my gym where people pay monthly",
    checks: [
      { projectType: "web-app" },
      { capabilities: ["payments"] },
      { pickIs: { layer: "payments", tool: "stripe" } },
      { hostingRunsBackend: true },
      { noEmptyLayer: true },
    ],
  },
  {
    id: "plain-photographer-contact-form",
    text: "a website for my wedding photography with a contact form",
    checks: [
      { projectType: "content-site" },
      { capabilities: ["transactional-email"] },
      { layerPresent: "email" },
      { noEmptyLayer: true },
    ],
  },
  {
    id: "plain-warehouse-stock",
    text: "a tool for my warehouse staff to track stock",
    checks: [
      { projectType: "internal-tool" },
      { hostingRunsBackend: true },
      { noEmptyLayer: true },
    ],
  },
  {
    id: "plain-homework-reminders",
    text: "an app for my school to send homework reminders to parents",
    checks: [
      { projectType: "web-app" },
      { capabilities: ["transactional-email", "scheduled-jobs"] },
      { layerPresent: "jobs-queue" },
      { layerPresent: "email" },
      { hostingRunsBackend: true },
      { noEmptyLayer: true },
    ],
  },
  {
    id: "plain-freelancer-marketplace",
    text: "a site where freelancers can find clients and get paid",
    checks: [
      { projectType: "web-app" },
      { capabilities: ["payments"] },
      { pickIs: { layer: "payments", tool: "stripe" } },
      { hostingRunsBackend: true },
      { noEmptyLayer: true },
    ],
  },
  {
    id: "plain-landing-waitlist",
    text: "a landing page for my new product with a waitlist",
    checks: [
      { projectType: "content-site" },
      { capabilities: ["transactional-email"] },
      { layerPresent: "email" },
      { noEmptyLayer: true },
    ],
  },
  {
    id: "plain-band-merch",
    text: "a website for my band with tour dates and a merch store",
    checks: [
      { projectType: "ecommerce" },
      { pickIs: { layer: "payments", tool: "stripe" } },
      { hostingRunsBackend: true },
      { noEmptyLayer: true },
    ],
  },
  {
    id: "plain-landlord-dashboard",
    text: "a dashboard for my landlord business to track rent payments",
    checks: [
      { projectType: "internal-tool" },
      { capabilities: ["payments"] },
      { hostingRunsBackend: true },
      { noEmptyLayer: true },
    ],
  },
  {
    id: "plain-food-truck-map",
    text: "an app for my food truck with a map of where I park",
    checks: [
      { projectType: "web-app" },
      { capabilities: ["geospatial"] },
      { hostingRunsBackend: true },
      { noEmptyLayer: true },
    ],
  },
  {
    // Text messages are not email: the catalog has no SMS layer, so no email service either.
    id: "plain-sms-reminders",
    text: "a tool that sends my customers text message reminders before their appointment",
    checks: [
      { capabilitiesAbsent: ["transactional-email"] },
      { layerAbsent: "email" },
      { hostingRunsBackend: true },
      { noEmptyLayer: true },
    ],
  },
  {
    id: "plain-crew-tool-tracker",
    text: "something to track which tools my construction crew has borrowed",
    checks: [
      { projectType: "internal-tool" },
      { hostingRunsBackend: true },
      { noEmptyLayer: true },
    ],
  },
  {
    id: "plain-maintenance-photos",
    text: "an app where tenants report maintenance problems to their landlord with photos",
    checks: [
      { projectType: "web-app" },
      { capabilities: ["file-uploads"] },
      { layerPresent: "storage" },
      { noEmptyLayer: true },
    ],
  },
  {
    id: "plain-fantasy-live-scores",
    text: "a fantasy football league app for my friends with live scores",
    checks: [
      { capabilities: ["realtime"] },
      { hostingRunsBackend: true },
      { noEmptyLayer: true },
    ],
  },
  {
    id: "plain-cabin-rentals",
    text: "a site to rent out my two vacation cabins",
    checks: [
      { projectType: "web-app" },
      { capabilities: ["payments"] },
      { pickIs: { layer: "payments", tool: "stripe" } },
      { noEmptyLayer: true },
    ],
  },
  {
    id: "plain-food-truck-preorder",
    text: "an app for my food truck so people can see where we are today and preorder",
    checks: [
      { capabilities: ["payments"] },
      { pickIs: { layer: "payments", tool: "stripe" } },
      { noEmptyLayer: true },
    ],
  },
  {
    // PostgreSQL with PostGIS is the usual pick for maps, not a switch to MySQL.
    id: "plain-uber-lawn-mowing",
    text: "an app like Uber but for lawn mowing",
    checks: [
      { capabilities: ["geospatial"] },
      { pickIs: { layer: "database", tool: "postgresql" } },
      { noEmptyLayer: true },
    ],
  },
];

/**
 * Cases that fail only because of a catalog fact, keyed by case id, with the
 * data change they wait for. The golden test skips them and names the change.
 */
export const PENDING_DATA: Record<string, string> = {};
