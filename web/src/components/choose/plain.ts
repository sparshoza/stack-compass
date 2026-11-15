import type { Answers } from '@/engine/answers'
import type { Layer } from '@/lib/kb'

/**
 * Plain words for the Help me choose questions. The engine keeps its ids
 * and the catalog keeps its own labels; only what people read changes here.
 */

export interface PlainOption<T extends string = string> {
  value: T
  label: string
  hint?: string
}

/** What are you building? A plain name and a one-line hint per project type. */
export const PROJECT_TYPES: Record<string, { label: string; hint: string }> = {
  'web-app': { label: 'Web app', hint: 'A site people log in to and use' },
  'content-site': { label: 'Website or blog', hint: 'Pages people read, such as a blog or docs' },
  saas: { label: 'Subscription app', hint: 'Customers sign up and pay every month' },
  ecommerce: { label: 'Online store', hint: 'Sell products with a cart and checkout' },
  'mobile-app': { label: 'Phone app', hint: 'For the iPhone and Android stores' },
  'realtime-app': { label: 'Live app', hint: 'Chat, live updates or playing together' },
  'internal-tool': { label: 'Tool for my team', hint: 'Screens your staff use to run the business' },
  'api-only': { label: 'Service for other apps', hint: 'No screens: other apps and partners call it' },
}

/** The order project types are offered in: the most common first. */
export const PROJECT_TYPE_ORDER = Object.keys(PROJECT_TYPES)

export function projectTypeLabel(id: string, fallback = id): string {
  return PROJECT_TYPES[id]?.label ?? fallback
}

/** What should it do? Each feature in plain words; the catalog's explanation stays as the hint. */
export const CAPABILITY_LABELS: Record<string, string> = {
  'ssr-seo': 'Show up on Google',
  'static-content': 'Mostly fixed pages',
  'content-editing': 'Edit pages without code',
  offline: 'Works offline',
  'native-mobile': 'App store app',
  'file-uploads': 'Upload files',
  'full-text-search': 'A search box',
  'vector-search': 'Find similar things (AI)',
  geospatial: 'Maps and places',
  analytics: 'Reports on lots of data',
  'high-write-throughput': 'Lots of incoming data',
  realtime: 'Live updates',
  'background-jobs': 'Slow work in the background',
  'scheduled-jobs': 'Tasks on a timer',
  'edge-runtime': 'Fast all over the world',
  'social-login': 'Sign in with Google',
  'enterprise-sso': 'Company sign in',
  'multi-tenant': 'Many customer companies',
  payments: 'Take payments',
  'transactional-email': 'Send emails',
  'admin-ui': 'Admin screens',
  'type-safety': 'Catch code mistakes early',
  'rest-api': 'Let other apps connect',
}

/** Needs a description can name that no part of the catalog covers: the chip, and why it is left out. */
export const NOT_COVERED: Record<string, { label: string; note: string }> = {
  sms: {
    label: 'Text messages (not covered)',
    note: 'This catalog has no text message (SMS) services, so the stack leaves them out.',
  },
}

export function capabilityLabel(id: string, fallback = id): string {
  return CAPABILITY_LABELS[id] ?? fallback
}

export const SCALE: PlainOption<Answers['scale']>[] = [
  { value: 'prototype', label: 'Just trying it' },
  { value: 'startup', label: 'Real customers' },
  { value: 'high', label: 'Very busy' },
]

export const HOSTING: PlainOption<Answers['hosting']>[] = [
  { value: 'managed', label: 'Managed for me' },
  { value: 'self-hosted', label: 'My own servers' },
  { value: 'either', label: 'Either' },
]

export const BUDGET: PlainOption<Answers['budget']>[] = [
  { value: 'free', label: 'Free only' },
  { value: 'low', label: 'A little' },
  { value: 'any', label: 'Any' },
]

/**
 * One piece: the parts people ask about, in the order a non-technical
 * person tends to need them; the developer-only parts come last.
 */
export const PIECES: { layer: Layer; label: string; question: string }[] = [
  { layer: 'database', label: 'Database', question: 'Which database?' },
  { layer: 'hosting', label: 'Hosting', question: 'Where to host it?' },
  { layer: 'auth', label: 'Sign-in', question: 'Which sign-in service?' },
  { layer: 'payments', label: 'Payments', question: 'Which payments provider?' },
  { layer: 'email', label: 'Email', question: 'Which email service?' },
  { layer: 'storage', label: 'File storage', question: 'Where to keep files?' },
  { layer: 'search', label: 'Search', question: 'Which search engine?' },
  { layer: 'cms', label: 'Content editing', question: 'Which content editor?' },
  { layer: 'mobile', label: 'Mobile app', question: 'Which mobile framework?' },
  { layer: 'jobs-queue', label: 'Background jobs', question: 'Which job runner?' },
  { layer: 'cache', label: 'Cache', question: 'Which cache?' },
  { layer: 'frontend', label: 'Screens (frontend)', question: 'Which frontend?' },
  { layer: 'backend', label: 'Server code (backend)', question: 'Which backend?' },
  { layer: 'meta-framework', label: 'Web framework', question: 'Which web framework?' },
  { layer: 'ui-kit', label: 'UI components', question: 'Which UI components?' },
  { layer: 'observability', label: 'Monitoring', question: 'Which monitoring tool?' },
  { layer: 'testing', label: 'Testing', question: 'Which testing tool?' },
  { layer: 'ci-cd', label: 'Build and deploy', question: 'Which build and deploy service?' },
  { layer: 'orm', label: 'Database library', question: 'Which database library?' },
  { layer: 'api-style', label: 'API style', question: 'Which API style?' },
  { layer: 'state', label: 'App state', question: 'Which state library?' },
  { layer: 'build-tool', label: 'Build tool', question: 'Which build tool?' },
]

export function pieceOf(layer: Layer) {
  return PIECES.find((p) => p.layer === layer)!
}

/** What each part does for the person, in one plain sentence, shown above its pick. */
export const LAYER_PURPOSE: Record<Layer, string> = {
  database: 'Keeps your data safe and ready to look up.',
  hosting: 'Puts your app on the internet.',
  auth: 'Lets people create an account and sign in.',
  payments: 'Takes card payments from your customers.',
  email: 'Sends receipts, password resets and other emails.',
  storage: 'Keeps the files and photos people upload.',
  search: 'Powers the search box.',
  cms: 'Lets you edit pages and posts without code.',
  mobile: 'Builds the app for iPhone and Android.',
  'jobs-queue': 'Runs slow work and timed tasks in the background.',
  cache: 'Keeps busy data close at hand for speed and live updates.',
  frontend: 'Draws the screens people click on.',
  backend: 'Runs your business rules on the server.',
  'meta-framework': 'Builds the pages and connects the screens to the server.',
  'ui-kit': 'Ready-made styles and buttons for the screens.',
  observability: 'Tells you when something breaks.',
  testing: 'Checks your code still works before each release.',
  'ci-cd': 'Tests and ships each change for you.',
  orm: 'Lets the server code read and write the database.',
  'api-style': 'Sets how other apps talk to yours.',
  state: 'Keeps what the screens show in step with the server.',
  'build-tool': 'Bundles the code for the browser.',
}

/** A part's plain name, the same in both modes: "Sign-in", "Screens (frontend)". */
export function plainLayerName(layer: Layer): string {
  return pieceOf(layer).label
}

/** The "no preference" answer of a one-answer question. */
export const NO_PREFERENCE: Record<string, { label: string; hint: string }> = {
  scale: { label: 'Not sure yet', hint: 'Show tools of every size' },
  license: { label: 'Anything', hint: 'Paid and closed source tools too' },
}
