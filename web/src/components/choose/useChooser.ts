import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { defaultAnswers, type Answers } from '@/engine/answers'
import { match, type Detected } from '@/engine/match'
import { kb } from '@/lib/kb'
import { applyDetection, chipsOf, emptyDetection, isEmpty, withoutDismissed, type Chip } from './detection'

export type ChooseView = 'questions' | 'result'

/** Detection waits for this long a pause in typing. It is a debounce, not motion. */
export const TYPING_PAUSE_MS = 300

interface State {
  /** What the person typed. Held in memory only: never in the URL or storage. */
  text: string
  /** The last detection, before removed chips are taken out; null when nothing was read yet. */
  raw: Detected | null
  dismissed: ReadonlySet<string>
  answers: Answers
  view: ChooseView
  /** A note about the link the page was opened with. */
  notice: string | null
}

export interface Chooser {
  text: string
  setText: (text: string) => void
  /** Reads the description now (on submit, or after an example fills it). */
  detectNow: (text?: string) => void
  chips: Chip[]
  /** True when a description was read and nothing in it was recognised. */
  nothingFound: boolean
  removeChip: (key: string) => void
  answers: Answers
  setAnswers: (change: (answers: Answers) => Answers) => void
  view: ChooseView
  setView: (view: ChooseView) => void
  notice: string | null
  /** Back to an empty description and the default answers. */
  reset: () => void
}

const none: ReadonlySet<string> = new Set()

function fresh(): State {
  return { text: '', raw: null, dismissed: none, answers: defaultAnswers(), view: 'questions', notice: null }
}

export function useChooser(initial: { answers: Answers; view: ChooseView; notice: string | null }): Chooser {
  const [state, setState] = useState<State>(() => ({ ...fresh(), ...initial }))
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)
  // The latest text, so Read description never misses a keystroke still in flight.
  const textRef = useRef(state.text)

  useEffect(() => () => clearTimeout(timer.current), [])

  const read = useCallback((text: string) => {
    clearTimeout(timer.current)
    setState((s) => {
      const raw = text.trim() ? match(text, kb) : null
      const dismissed = raw ? s.dismissed : none
      const before = s.raw ? withoutDismissed(s.raw, s.dismissed) : emptyDetection()
      const after = raw ? withoutDismissed(raw, dismissed) : emptyDetection()
      return { ...s, raw, dismissed, answers: applyDetection(s.answers, before, after) }
    })
  }, [])

  const setText = useCallback(
    (text: string) => {
      textRef.current = text
      setState((s) => ({ ...s, text }))
      clearTimeout(timer.current)
      timer.current = setTimeout(() => read(text), TYPING_PAUSE_MS)
    },
    [read],
  )

  const detectNow = useCallback(
    (text?: string) => {
      if (text !== undefined) {
        textRef.current = text
        setState((s) => ({ ...s, text }))
      }
      read(textRef.current)
    },
    [read],
  )

  const removeChip = useCallback((key: string) => {
    setState((s) => {
      if (!s.raw) return s
      const dismissed = new Set(s.dismissed).add(key)
      const answers = applyDetection(s.answers, withoutDismissed(s.raw, s.dismissed), withoutDismissed(s.raw, dismissed))
      return { ...s, dismissed, answers }
    })
  }, [])

  const setAnswers = useCallback((change: (answers: Answers) => Answers) => {
    setState((s) => ({ ...s, answers: change(s.answers) }))
  }, [])

  const setView = useCallback((view: ChooseView) => setState((s) => ({ ...s, view })), [])

  const reset = useCallback(() => {
    clearTimeout(timer.current)
    textRef.current = ''
    setState(fresh())
  }, [])

  const chips = useMemo(() => (state.raw ? chipsOf(withoutDismissed(state.raw, state.dismissed)) : []), [state.raw, state.dismissed])

  return {
    text: state.text,
    setText,
    detectNow,
    chips,
    nothingFound: state.raw !== null && isEmpty(state.raw),
    removeChip,
    answers: state.answers,
    setAnswers,
    view: state.view,
    setView,
    notice: state.notice,
    reset,
  }
}
