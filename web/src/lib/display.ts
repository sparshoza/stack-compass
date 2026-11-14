import { LAYER_LABELS } from '@/engine/labels'
import type { Hosting, Layer, Pricing } from './kb'

/** Layer names as standalone labels: "Backend", "UI kit", "CI/CD". */
export function layerName(layer: Layer): string {
  const label = LAYER_LABELS[layer]
  return label.charAt(0).toUpperCase() + label.slice(1)
}

const LANGUAGE_NAMES: Record<string, string> = {
  python: 'Python',
  typescript: 'TypeScript',
  javascript: 'JavaScript',
  go: 'Go',
  java: 'Java',
  kotlin: 'Kotlin',
  csharp: 'C#',
  ruby: 'Ruby',
  php: 'PHP',
  rust: 'Rust',
  elixir: 'Elixir',
  dart: 'Dart',
  swift: 'Swift',
}

export function languageName(id: string): string {
  return LANGUAGE_NAMES[id] ?? id
}

export const PRICING_NAMES: Record<Pricing, string> = {
  oss: 'Open source',
  'free-tier': 'Free tier',
  paid: 'Paid',
}

export const HOSTING_NAMES: Record<Hosting, string> = {
  managed: 'Managed',
  'self-hosted': 'Self-hosted',
}
