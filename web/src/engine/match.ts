import type { KeywordEntry, KnowledgeBase, Tool } from '../lib/kb'

export type Detected = {
  projectType: string | null
  capabilities: string[]
  languagesPrefer: string[]
  languagesAvoid: string[]
  knownTools: string[]
  /**
   * Things the text mentioned but negated ("don't need auth"). Capabilities and
   * tools are recorded by id (capability id, tool id), not by the typed phrase,
   * because the consumer works in ids.
   */
  droppedByNegation: string[]
}

/** A word within this many tokens before a match can negate it. */
const NEGATION_WINDOW = 3

/**
 * Single-token negators. Apostrophes are removed during normalization, so
 * "don't" arrives as "dont". "do not" and "no need for" are covered by "not"
 * and "no" because the window is counted in tokens.
 */
const NEGATORS = new Set(['no', 'not', 'without', 'avoid', 'except', 'dont', 'never'])

/**
 * Normalize to a list of tokens: NFKC, lowercase, apostrophes dropped, every
 * character that is not a letter, digit or one of . + # becomes a space. A dot
 * survives only inside a word or as a single leading dot before a word
 * (".net"); a trailing dot is sentence punctuation. "+" and "#" survive at the
 * end of a word ("c++", "c#") and inside one, never at the start.
 */
export function tokenize(text: string): string[] {
  const cleaned = text
    .normalize('NFKC')
    .toLowerCase()
    .replace(/['‘’ʼ]/g, '')
    .replace(/[^\p{L}\p{N}\p{M}.+#]/gu, ' ')
    .replace(/\.{2,}/g, ' ')
  const tokens: string[] = []
  for (const raw of cleaned.split(/\s+/)) {
    if (!raw) continue
    const leadingDot = raw.startsWith('.')
    let token = raw.replace(/^[.+#]+/, '').replace(/\.+$/, '')
    if (!token) continue
    if (leadingDot && raw.charAt(1) !== '.' && raw.charAt(1) !== '+' && raw.charAt(1) !== '#') {
      token = '.' + token
    }
    tokens.push(token)
  }
  return tokens
}

type Target = { kind: 'keyword'; entry: KeywordEntry } | { kind: 'tool'; tool: Tool }

type Index = { phrases: Map<string, Target[]>; maxLength: number }

const indexes = new WeakMap<KnowledgeBase, Index>()

function buildIndex(kb: KnowledgeBase): Index {
  const phrases = new Map<string, Target[]>()
  let maxLength = 1
  const add = (phrase: string, target: Target) => {
    const tokens = tokenize(phrase)
    if (tokens.length === 0) return
    const key = tokens.join(' ')
    maxLength = Math.max(maxLength, tokens.length)
    const list = phrases.get(key)
    if (list) list.push(target)
    else phrases.set(key, [target])
  }
  for (const entry of kb.keywords) {
    for (const phrase of entry.phrases) add(phrase, { kind: 'keyword', entry })
  }
  for (const tool of kb.tools) {
    const target: Target = { kind: 'tool', tool }
    // A tool whose name is an ordinary word (match_name false) is reachable by aliases only.
    if (tool.match_name) add(tool.name, target)
    for (const alias of tool.aliases) add(alias, target)
  }
  return { phrases, maxLength }
}

function indexFor(kb: KnowledgeBase): Index {
  let index = indexes.get(kb)
  if (!index) {
    index = buildIndex(kb)
    indexes.set(kb, index)
  }
  return index
}

/**
 * The one language a tool implies, or null. Language-bound means exactly one
 * listed language. A tool listing both typescript and javascript (one family)
 * implies neither, and a hosted service with many SDK languages implies none.
 */
function impliedLanguage(tool: Tool): string | null {
  return tool.languages.length === 1 ? tool.languages[0] : null
}

function isNegated(tokens: string[], position: number): boolean {
  for (let i = Math.max(0, position - NEGATION_WINDOW); i < position; i++) {
    if (NEGATORS.has(tokens[i])) return true
  }
  return false
}

export function match(text: string, kb: KnowledgeBase): Detected {
  const tokens = tokenize(text)
  const { phrases, maxLength } = indexFor(kb)

  let projectType: string | null = null
  const capabilities = new Set<string>()
  const prefer = new Set<string>()
  const avoid = new Set<string>()
  const knownTools = new Set<string>()
  const droppedCapabilities = new Set<string>()
  const droppedTools = new Set<string>()
  const dropped = new Set<string>()

  let i = 0
  while (i < tokens.length) {
    let matched = 0
    for (let n = Math.min(maxLength, tokens.length - i); n >= 1; n--) {
      const targets = phrases.get(tokens.slice(i, i + n).join(' '))
      if (!targets) continue
      matched = n
      const negated = isNegated(tokens, i)
      for (const target of targets) {
        if (target.kind === 'keyword') {
          const { project_type, capabilities: caps, languages } = target.entry.sets
          if (negated) {
            for (const cap of caps) {
              droppedCapabilities.add(cap)
              dropped.add(cap)
            }
            for (const language of languages) avoid.add(language)
          } else {
            if (project_type && projectType === null) projectType = project_type
            for (const cap of caps) capabilities.add(cap)
            for (const language of languages) prefer.add(language)
          }
        } else if (negated) {
          droppedTools.add(target.tool.id)
          dropped.add(target.tool.id)
        } else {
          knownTools.add(target.tool.id)
          const language = impliedLanguage(target.tool)
          if (language) prefer.add(language)
        }
      }
      break
    }
    i += matched || 1
  }

  // Negation wins over a positive mention elsewhere in the text.
  return {
    projectType,
    capabilities: [...capabilities].filter((c) => !droppedCapabilities.has(c)),
    languagesPrefer: [...prefer].filter((l) => !avoid.has(l)),
    languagesAvoid: [...avoid],
    knownTools: [...knownTools].filter((t) => !droppedTools.has(t)),
    droppedByNegation: [...dropped],
  }
}
