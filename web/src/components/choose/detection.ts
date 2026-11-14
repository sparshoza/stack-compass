import type { Answers } from '@/engine/answers'
import type { Detected } from '@/engine/match'
import { languageName } from '@/lib/display'
import { kb, toolById } from '@/lib/kb'
import { capabilityLabel as plainCapability, projectTypeLabel } from './plain'

/** One thing picked up from the description, shown as a removable chip. */
export interface Chip {
  key: string
  label: string
}

export const emptyDetection = (): Detected => ({
  projectType: null,
  capabilities: [],
  languagesPrefer: [],
  languagesAvoid: [],
  knownTools: [],
  droppedByNegation: [],
})

export function isEmpty(d: Detected): boolean {
  return (
    !d.projectType &&
    !d.capabilities.length &&
    !d.languagesPrefer.length &&
    !d.languagesAvoid.length &&
    !d.knownTools.length
  )
}

/** The detection without the chips the person removed. */
export function withoutDismissed(d: Detected, dismissed: ReadonlySet<string>): Detected {
  return {
    projectType: d.projectType && !dismissed.has(`type:${d.projectType}`) ? d.projectType : null,
    capabilities: d.capabilities.filter((id) => !dismissed.has(`cap:${id}`)),
    languagesPrefer: d.languagesPrefer.filter((id) => !dismissed.has(`prefer:${id}`)),
    languagesAvoid: d.languagesAvoid.filter((id) => !dismissed.has(`avoid:${id}`)),
    knownTools: d.knownTools.filter((id) => !dismissed.has(`tool:${id}`)),
    droppedByNegation: d.droppedByNegation,
  }
}

const projectLabel = (id: string) => projectTypeLabel(id, kb.vocab.project_types.find((p) => p.id === id)?.label ?? id)
const capabilityLabel = (id: string) => plainCapability(id, kb.vocab.capabilities.find((c) => c.id === id)?.label ?? id)

/** Chips in reading order: what it is, what it needs, languages, tools. */
export function chipsOf(d: Detected): Chip[] {
  const chips: Chip[] = []
  if (d.projectType) chips.push({ key: `type:${d.projectType}`, label: projectLabel(d.projectType) })
  for (const id of d.capabilities) chips.push({ key: `cap:${id}`, label: capabilityLabel(id) })
  for (const id of d.languagesPrefer) chips.push({ key: `prefer:${id}`, label: languageName(id) })
  for (const id of d.languagesAvoid) chips.push({ key: `avoid:${id}`, label: `Avoid ${languageName(id)}` })
  for (const id of d.knownTools) chips.push({ key: `tool:${id}`, label: toolById(id)?.name ?? id })
  return chips
}

/** Drops what the old detection added and the new one no longer has, then adds the new items. */
function merge(current: string[], before: string[], after: string[]): string[] {
  const gone = new Set(before.filter((item) => !after.includes(item)))
  const out = current.filter((item) => !gone.has(item))
  for (const item of after) if (!out.includes(item)) out.push(item)
  return out
}

/**
 * Moves the answers from one detection to the next. Answers the text never
 * set (hosting, budget, scale, tooling, anything picked by hand) stay as
 * they are; items the text set and no longer mentions are taken back out.
 */
export function applyDetection(answers: Answers, before: Detected, after: Detected): Answers {
  let projectType = answers.projectType
  if (after.projectType) projectType = after.projectType
  else if (before.projectType && answers.projectType === before.projectType) projectType = null

  const prefer = merge(answers.languagesPrefer, before.languagesPrefer, after.languagesPrefer)
  const avoid = merge(answers.languagesAvoid, before.languagesAvoid, after.languagesAvoid)
  return {
    ...answers,
    projectType,
    capabilities: merge(answers.capabilities, before.capabilities, after.capabilities),
    languagesPrefer: prefer.filter((id) => !after.languagesAvoid.includes(id)),
    languagesAvoid: avoid.filter((id) => !after.languagesPrefer.includes(id)),
    knownTools: merge(answers.knownTools, before.knownTools, after.knownTools),
  }
}
