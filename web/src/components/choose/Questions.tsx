import { useId, useMemo, useState, type ReactNode, type RefObject } from 'react'
import { BanIcon, CheckIcon, XIcon } from 'lucide-react'
import type { Answers } from '@/engine/answers'
import { LAYER_LABELS } from '@/engine/labels'
import { languageName, layerName } from '@/lib/display'
import { familyColor, LAYER_FAMILY } from '@/lib/families'
import { kb, toolById } from '@/lib/kb'
import { searchTools } from '@/lib/search'
import { cn } from '@/lib/utils'

interface QuestionsProps {
  answers: Answers
  onChange: (change: (answers: Answers) => Answers) => void
  /** The checked project type radio, so Edit answers can put focus back on it. */
  typeRef: RefObject<HTMLInputElement | null>
}

const legend = 'text-[0.8125rem] font-semibold text-text'
const hint = 'text-xs text-text-muted'

/** A focus ring on a label that wraps a visually hidden input. */
const ringWithin =
  'has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-highlight'

const HOSTING: { value: Answers['hosting']; label: string }[] = [
  { value: 'managed', label: 'Managed' },
  { value: 'self-hosted', label: 'Self-hosted' },
  { value: 'either', label: 'Either' },
]
const BUDGET: { value: Answers['budget']; label: string }[] = [
  { value: 'free', label: 'Free tiers only' },
  { value: 'low', label: 'Low' },
  { value: 'any', label: 'Any' },
]
const SCALE: { value: Answers['scale']; label: string }[] = [
  { value: 'prototype', label: 'Prototype' },
  { value: 'startup', label: 'Startup' },
  { value: 'high', label: 'High traffic' },
]

type LanguageState = 'prefer' | 'avoid' | 'none'
const STATE_WORDS: Record<LanguageState, string> = { none: 'no preference', prefer: 'prefer', avoid: 'avoid' }

function languageState(a: Answers, id: string): LanguageState {
  if (a.languagesPrefer.includes(id)) return 'prefer'
  if (a.languagesAvoid.includes(id)) return 'avoid'
  return 'none'
}

/** No preference, then prefer, then avoid, then back. */
function cycleLanguage(a: Answers, id: string): Answers {
  const state = languageState(a, id)
  const prefer = a.languagesPrefer.filter((l) => l !== id)
  const avoid = a.languagesAvoid.filter((l) => l !== id)
  if (state === 'none') prefer.push(id)
  if (state === 'prefer') avoid.push(id)
  return { ...a, languagesPrefer: prefer, languagesAvoid: avoid }
}

const toggle = (list: string[], item: string) =>
  list.includes(item) ? list.filter((x) => x !== item) : [...list, item]

function Question({ title, note, children, role, id }: { title: ReactNode; note?: ReactNode; children: ReactNode; role?: 'radiogroup'; id: string }) {
  return (
    <fieldset role={role} aria-labelledby={`${id}-legend`} aria-describedby={note ? `${id}-note` : undefined} className="grid gap-2.5">
      <legend id={`${id}-legend`} className={cn(legend, 'mb-0.5 p-0')}>
        {title}
      </legend>
      {note && (
        <p id={`${id}-note`} className={cn(hint, '-mt-1.5')}>
          {note}
        </p>
      )}
      {children}
    </fieldset>
  )
}

/** One choice as a pill: a real radio input, hidden, inside its label. */
function RadioPill<T extends string>({
  name,
  value,
  label,
  checked,
  onSelect,
  inputRef,
}: {
  name: string
  value: T
  label: string
  checked: boolean
  onSelect: (value: T) => void
  inputRef?: RefObject<HTMLInputElement | null>
}) {
  return (
    <label
      className={cn(
        'inline-flex h-8 items-center gap-1.5 rounded-full border px-3 text-xs max-md:h-11 max-md:px-3.5',
        ringWithin,
        checked
          ? 'border-text bg-text text-background'
          : 'border-line-strong text-text hover:border-text-faint hover:bg-raised',
      )}
    >
      <input
        ref={checked ? inputRef : undefined}
        type="radio"
        name={name}
        value={value}
        checked={checked}
        onChange={() => onSelect(value)}
        className="sr-only"
      />
      {checked && <CheckIcon aria-hidden="true" className="-ml-0.5 size-3.5" />}
      {label}
    </label>
  )
}

/** Three options joined into one control. */
function Segmented<T extends string>({
  name,
  options,
  value,
  onSelect,
}: {
  name: string
  options: { value: T; label: string }[]
  value: T
  onSelect: (value: T) => void
}) {
  return (
    <div className="grid grid-flow-col auto-cols-fr rounded-full border border-line-strong p-0.5">
      {options.map((option) => {
        const checked = option.value === value
        return (
          <label
            key={option.value}
            className={cn(
              'flex h-8 items-center justify-center rounded-full px-2 text-center text-xs leading-tight max-md:h-10',
              ringWithin,
              checked ? 'bg-text text-background' : 'text-text-muted hover:bg-raised hover:text-text',
            )}
          >
            <input
              type="radio"
              name={name}
              value={option.value}
              checked={checked}
              onChange={() => onSelect(option.value)}
              className="sr-only"
            />
            {option.label}
          </label>
        )
      })}
    </div>
  )
}

/** Tools you already know: chosen tools as removable chips, then a search field listing matches. */
function KnownTools({ selected, onChange }: { selected: string[]; onChange: (ids: string[]) => void }) {
  const id = useId()
  const [query, setQuery] = useState('')
  const [open, setOpen] = useState(false)
  const [active, setActive] = useState(0)
  const results = useMemo(() => searchTools(query, 8).filter((t) => !selected.includes(t.id)), [query, selected])
  const showList = open && results.length > 0
  const showEmpty = open && query.trim() !== '' && results.length === 0
  const optionId = (i: number) => `${id}-option-${i}`

  const add = (toolId: string) => {
    onChange([...selected, toolId])
    setQuery('')
    setActive(0)
  }

  return (
    <div className="grid gap-2">
      <label htmlFor={id} className={legend}>
        Tools you already know
      </label>
      {selected.length > 0 && (
        <ul aria-label="Tools you know" className="flex flex-wrap gap-1.5">
          {selected.map((toolId) => {
            const tool = toolById(toolId)
            const name = tool?.name ?? toolId
            return (
              <li
                key={toolId}
                className="inline-flex h-8 items-center gap-1.5 rounded-full border border-line-strong bg-raised pl-3 text-xs text-text max-md:h-11"
              >
                {tool && (
                  <span
                    aria-hidden="true"
                    className="size-2 rounded-full"
                    style={{ background: familyColor(LAYER_FAMILY[tool.layer]) }}
                  />
                )}
                {name}
                <button
                  type="button"
                  aria-label={`Remove ${name}`}
                  onClick={() => onChange(selected.filter((x) => x !== toolId))}
                  className="grid size-8 place-items-center rounded-full text-text-muted hover:bg-surface hover:text-text max-md:size-11"
                >
                  <XIcon aria-hidden="true" className="size-3.5" />
                </button>
              </li>
            )
          })}
        </ul>
      )}
      <div className="relative">
        <input
          id={id}
          type="text"
          role="combobox"
          aria-autocomplete="list"
          aria-expanded={showList}
          aria-controls={`${id}-list`}
          aria-activedescendant={showList ? optionId(active) : undefined}
          autoComplete="off"
          spellCheck={false}
          placeholder="Search by name, such as Django"
          value={query}
          onChange={(e) => {
            setQuery(e.target.value)
            setActive(0)
            setOpen(true)
          }}
          onFocus={() => setOpen(true)}
          onBlur={() => setOpen(false)}
          onKeyDown={(e) => {
            if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
              if (!results.length) return
              e.preventDefault()
              setOpen(true)
              const step = e.key === 'ArrowDown' ? 1 : -1
              setActive((i) => (i + step + results.length) % results.length)
            } else if (e.key === 'Enter') {
              e.preventDefault()
              const hit = results[active]
              if (showList && hit) add(hit.id)
            } else if (e.key === 'Escape' && query) {
              setQuery('')
              setOpen(false)
            }
          }}
          className="h-9 w-full rounded-full border border-line-strong bg-background px-3.5 text-[1rem] text-text placeholder:text-text-faint hover:border-text-faint focus-visible:border-text-faint md:text-[0.8125rem] max-md:h-11"
        />
        <ul
          id={`${id}-list`}
          role="listbox"
          aria-label="Matching tools"
          hidden={!showList}
          className="absolute top-full left-0 z-10 mt-1.5 grid w-full gap-px rounded-xl border border-line bg-surface p-1.5 shadow-(--shadow-float)"
        >
          {showList &&
            results.map((tool, i) => (
              <li
                key={tool.id}
                id={optionId(i)}
                role="option"
                aria-selected={i === active}
                className={cn(
                  'flex h-9 cursor-pointer items-center gap-2.5 rounded-lg px-2.5 text-[0.8125rem] max-md:h-11',
                  i === active && 'bg-raised',
                )}
                onMouseDown={(e) => e.preventDefault()}
                onMouseMove={() => setActive(i)}
                onClick={() => add(tool.id)}
              >
                <span
                  aria-hidden="true"
                  className="size-2 shrink-0 rounded-full"
                  style={{ background: familyColor(LAYER_FAMILY[tool.layer]) }}
                />
                <span className="min-w-0 flex-1 truncate text-text">{tool.name}</span>
                <span className="shrink-0 text-xs text-text-muted">{layerName(tool.layer)}</span>
              </li>
            ))}
        </ul>
        <p role="status" className={showEmpty ? 'mt-1.5 text-xs text-text-muted' : 'sr-only'}>
          {showEmpty ? `No tool matches "${query.trim()}"` : ''}
        </p>
      </div>
    </div>
  )
}

function joinWords(words: string[]): string {
  return words.length < 2 ? words.join('') : `${words.slice(0, -1).join(', ')} and ${words.at(-1)}`
}

const TOOLING_NOTE = `Adds a ${joinWords(kb.vocab.tooling_layers.map((l) => LAYER_LABELS[l]))} to the stack.`

/** The eight one-click questions, filled in from the description where it said something. */
export function Questions({ answers, onChange, typeRef }: QuestionsProps) {
  const id = useId()
  const set = <K extends keyof Answers>(key: K) => (value: Answers[K]) => onChange((a) => ({ ...a, [key]: value }))

  return (
    <div className="grid gap-7">
      <Question id={`${id}-type`} role="radiogroup" title={<>What are you building? <span className="font-normal text-text-muted">(required)</span></>}>
        <div className="flex flex-wrap gap-1.5">
          {kb.vocab.project_types.map((type) => (
            <RadioPill
              key={type.id}
              name={`${id}-type`}
              value={type.id}
              label={type.label}
              checked={answers.projectType === type.id}
              onSelect={(value) => onChange((a) => ({ ...a, projectType: value }))}
              inputRef={typeRef}
            />
          ))}
        </div>
      </Question>

      <Question id={`${id}-languages`} title="Languages" note="Click once to prefer, twice to avoid, three times to clear.">
        <ul className="flex flex-wrap gap-1.5">
          {kb.vocab.languages.map((lang) => {
            const state = languageState(answers, lang)
            const name = languageName(lang)
            return (
              <li key={lang}>
                <button
                  type="button"
                  onClick={() => onChange((a) => cycleLanguage(a, lang))}
                  className={cn(
                    'inline-flex h-8 items-center gap-1.5 rounded-full border px-3 text-xs max-md:h-11 max-md:px-3.5',
                    state === 'none' && 'border-line-strong text-text hover:border-text-faint hover:bg-raised',
                    state === 'prefer' && 'border-text bg-text text-background',
                    state === 'avoid' && 'border-dashed border-text-faint text-text-muted hover:bg-raised',
                  )}
                >
                  {state === 'prefer' && <CheckIcon aria-hidden="true" className="-ml-0.5 size-3.5" />}
                  {state === 'avoid' && <BanIcon aria-hidden="true" className="-ml-0.5 size-3.5" />}
                  <span className={state === 'avoid' ? 'line-through decoration-1' : undefined}>{name}</span>
                  <span className="sr-only">: {STATE_WORDS[state]}</span>
                </button>
              </li>
            )
          })}
        </ul>
      </Question>

      <Question id={`${id}-caps`} title="Must-have features">
        <ul className="-mx-2 grid gap-px">
          {kb.vocab.capabilities.map((cap) => {
            const checked = answers.capabilities.includes(cap.id)
            return (
              <li key={cap.id}>
                <label
                  className={cn(
                    'flex items-start gap-3 rounded-lg px-2 py-2 hover:bg-raised',
                    ringWithin,
                    'has-[:focus-visible]:outline-offset-0',
                  )}
                >
                  <input
                    type="checkbox"
                    checked={checked}
                    aria-labelledby={`${id}-${cap.id}`}
                    aria-describedby={`${id}-${cap.id}-explain`}
                    onChange={() => onChange((a) => ({ ...a, capabilities: toggle(a.capabilities, cap.id) }))}
                    className="peer sr-only"
                  />
                  <span
                    aria-hidden="true"
                    className={cn(
                      'mt-0.5 grid size-4 shrink-0 place-items-center rounded-[4px] border',
                      checked ? 'border-text bg-text' : 'border-line-strong',
                    )}
                  >
                    {checked && (
                      <svg viewBox="0 0 12 12" className="size-3" fill="none" stroke="var(--bg)" strokeWidth="2">
                        <path d="M2.5 6.2 5 8.5l4.5-5" />
                      </svg>
                    )}
                  </span>
                  <span className="grid gap-0.5">
                    <span id={`${id}-${cap.id}`} className="text-[0.8125rem] text-text">
                      {cap.label}
                    </span>
                    <span id={`${id}-${cap.id}-explain`} className="text-xs leading-[1.45] text-text-muted">
                      {cap.explain}
                    </span>
                  </span>
                </label>
              </li>
            )
          })}
        </ul>
      </Question>

      <Question id={`${id}-hosting`} role="radiogroup" title="Hosting">
        <Segmented name={`${id}-hosting`} options={HOSTING} value={answers.hosting} onSelect={set('hosting')} />
      </Question>

      <Question id={`${id}-budget`} role="radiogroup" title="Budget">
        <Segmented name={`${id}-budget`} options={BUDGET} value={answers.budget} onSelect={set('budget')} />
      </Question>

      <Question id={`${id}-scale`} role="radiogroup" title="Scale">
        <Segmented name={`${id}-scale`} options={SCALE} value={answers.scale} onSelect={set('scale')} />
      </Question>

      <KnownTools selected={answers.knownTools} onChange={set('knownTools')} />

      <div className="flex items-start justify-between gap-4">
        <div className="grid gap-0.5">
          <span id={`${id}-tooling`} className={legend}>
            Include dev tooling
          </span>
          <span id={`${id}-tooling-note`} className={hint}>
            {TOOLING_NOTE}
          </span>
        </div>
        <button
          type="button"
          role="switch"
          aria-checked={answers.tooling}
          aria-labelledby={`${id}-tooling`}
          aria-describedby={`${id}-tooling-note`}
          onClick={() => onChange((a) => ({ ...a, tooling: !a.tooling }))}
          className="-my-1.5 grid h-8 w-12 shrink-0 place-items-center max-md:h-11"
        >
          <span
            aria-hidden="true"
            className={cn(
              'flex h-5 w-9 items-center rounded-full border p-0.5',
              answers.tooling ? 'justify-end border-text bg-text' : 'justify-start border-line-strong bg-raised',
            )}
          >
            <span className={cn('size-3.5 rounded-full', answers.tooling ? 'bg-background' : 'bg-text-muted')} />
          </span>
        </button>
      </div>
    </div>
  )
}
