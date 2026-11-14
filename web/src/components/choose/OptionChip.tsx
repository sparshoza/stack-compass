import { useId, type ReactNode, type RefObject } from 'react'
import { CheckIcon } from 'lucide-react'
import { cn } from '@/lib/utils'

/** A focus ring on a label that wraps a visually hidden input. */
export const ringWithin =
  'has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-highlight'

export const legendClass = 'text-[0.8125rem] font-semibold text-text'

/**
 * One answer as a chip: a real checkbox or radio, visually hidden, inside
 * its label. With a hint it grows to two lines (name, then a short note in
 * muted ink) and gets the panel radius; without one it is a pill. The
 * chosen state is inverted with a check, and the colours cross-fade.
 */
export function OptionChip({
  type,
  name,
  value,
  label,
  hint,
  checked,
  onChange,
  inputRef,
  dot,
  hideHint = false,
}: {
  type: 'checkbox' | 'radio'
  name?: string
  value: string
  label: string
  hint?: string
  checked: boolean
  onChange: () => void
  inputRef?: RefObject<HTMLInputElement | null>
  /** A small coloured mark before the name (family colour). */
  dot?: ReactNode
  /** One-line chip: the hint stays as the input's description but is not shown. */
  hideHint?: boolean
}) {
  const id = useId()
  return (
    <label
      className={cn(
        'motion-colors inline-flex cursor-pointer items-start gap-1.5 border text-left',
        ringWithin,
        hint && !hideHint
          ? 'min-h-11 w-full rounded-[var(--radius-panel)] px-3 py-2'
          : 'h-8 items-center rounded-full px-3 touch:h-11 touch:px-3.5',
        checked
          ? 'border-text bg-text text-background'
          : 'border-line-strong text-text hover:border-text-faint hover:bg-raised',
      )}
    >
      <input
        ref={inputRef}
        type={type}
        name={name}
        value={value}
        checked={checked}
        aria-labelledby={`${id}-label`}
        aria-describedby={hint ? `${id}-hint` : undefined}
        onChange={onChange}
        className="sr-only"
      />
      {checked && <CheckIcon aria-hidden="true" className={cn('-ml-0.5 size-3.5 shrink-0', hint && !hideHint && 'mt-0.5')} />}
      {dot}
      <span className="grid gap-0.5">
        <span id={`${id}-label`} className={cn('text-xs leading-[1.35]', hint && !hideHint && 'font-semibold')}>
          {label}
        </span>
        {hint && (
          <span
            id={`${id}-hint`}
            className={cn('text-xs leading-[1.35]', hideHint ? 'sr-only' : checked ? 'text-background' : 'text-text-muted')}
          >
            {hint}
          </span>
        )}
      </span>
    </label>
  )
}
